import { fetchJsonRpc } from '../clients/jsonRpc';
import { RedisCache } from '../cache/redis';
import { SqliteStore } from '../storage/sqlite';
import { ChainConfig, EvmBlockRecord, EvmTxRecord } from '../types';
import { logError, logInfo } from '../utils/logger';
import { sleep } from '../utils/sleep';

interface EvmBlockRpc {
  number: string;
  hash: string;
  timestamp: string;
  miner: string;
  gasUsed: string;
  gasLimit: string;
  transactions: Array<{
    hash: string;
    blockNumber: string;
    from: string;
    to: string | null;
    value: string;
    gasPrice: string;
  }>;
}

interface EvmReceipt {
  status: string;
  gasUsed: string;
}

export class EvmIndexer {
  private chain: ChainConfig;
  private store: SqliteStore;
  private cache: RedisCache;
  private pollInterval: number;
  private backfill: number;
  private backfillFromGenesis: boolean;
  private running = false;
  private lastProcessed: number | null = null;

  constructor(
    chain: ChainConfig,
    store: SqliteStore,
    cache: RedisCache,
    pollInterval: number,
    backfill: number,
    backfillFromGenesis: boolean
  ) {
    this.chain = chain;
    this.store = store;
    this.cache = cache;
    this.pollInterval = pollInterval;
    this.backfill = backfill;
    this.backfillFromGenesis = backfillFromGenesis;
  }

  async start() {
    this.running = true;
    logInfo(`EVM indexer started (${this.chain.name})`);
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        logError(`EVM indexer error: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(this.pollInterval);
    }
  }

  stop() {
    this.running = false;
  }

  private async tick() {
    const latestHex = await fetchJsonRpc<string>(this.chain.rpcUrl, 'eth_blockNumber');
    const latest = parseInt(latestHex, 16);
    if (Number.isNaN(latest)) {
      return;
    }

    let start = this.lastProcessed !== null
      ? this.lastProcessed + 1
      : this.backfillFromGenesis
        ? 0
        : latest - this.backfill + 1;
    if (start < 0) {
      start = 0;
    }

    for (let blockNumber = start; blockNumber <= latest; blockNumber += 1) {
      const hex = `0x${blockNumber.toString(16)}`;
      const block = await fetchJsonRpc<EvmBlockRpc>(
        this.chain.rpcUrl,
        'eth_getBlockByNumber',
        [hex, true]
      );

      const records = await Promise.all(
        block.transactions.map(async (tx) => {
          let receipt: EvmReceipt | null = null;
          try {
            receipt = await fetchJsonRpc<EvmReceipt>(this.chain.rpcUrl, 'eth_getTransactionReceipt', [
              tx.hash
            ]);
          } catch {
            receipt = null;
          }

          const record: EvmTxRecord = {
            chainId: this.chain.id,
            hash: tx.hash,
            blockNumber: parseInt(tx.blockNumber, 16),
            from: tx.from,
            to: tx.to,
            valueWei: tx.value,
            gasPrice: tx.gasPrice,
            gasUsed: receipt?.gasUsed ?? null,
            status: receipt?.status ? parseInt(receipt.status, 16) : null
          };
          return record;
        })
      );

      const blockRecord: EvmBlockRecord = {
        chainId: this.chain.id,
        number: parseInt(block.number, 16),
        hash: block.hash,
        timestamp: parseInt(block.timestamp, 16),
        miner: block.miner,
        gasUsed: parseInt(block.gasUsed, 16),
        gasLimit: parseInt(block.gasLimit, 16),
        txCount: block.transactions.length
      };

      this.store.upsertEvmBlock(blockRecord, records);

      await this.cache.cacheEvmBlock(blockRecord);
      await this.cache.addRecentEvmBlock(blockRecord);
      for (const tx of records) {
        await this.cache.cacheEvmTx(tx);
        await this.cache.addRecentEvmTx(tx);
      }

      this.lastProcessed = blockNumber;
    }
  }
}
