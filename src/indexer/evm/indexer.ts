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
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
    logIndex: string;
  }>;
}

// ERC20 Transfer event signature: Transfer(address,address,uint256)
// keccak256("Transfer(address,address,uint256)") = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
const ERC20_TRANSFER_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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

      // Process ERC20 Transfer events
      await this.processErc20Transfers(blockNumber, block.transactions);

      this.lastProcessed = blockNumber;
    }
  }

  private async processErc20Transfers(blockNumber: number, transactions: Array<{ hash: string }>) {
    for (const tx of transactions) {
      try {
        const receipt = await fetchJsonRpc<EvmReceipt>(
          this.chain.rpcUrl,
          'eth_getTransactionReceipt',
          [tx.hash]
        );

        if (!receipt.logs || receipt.logs.length === 0) {
          continue;
        }

        for (const log of receipt.logs) {
          // Check if this is a Transfer event
          if (log.topics[0]?.toLowerCase() === ERC20_TRANSFER_SIGNATURE && log.topics.length >= 3) {
            const fromAddress = '0x' + log.topics[1].slice(26).toLowerCase();
            const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();
            const value = log.data || '0x';

            this.store.upsertErc20Transfer({
              id: `transfer_${this.chain.id}_${tx.hash}_${log.logIndex}`,
              chainId: this.chain.id,
              tokenAddress: log.address.toLowerCase(),
              fromAddress,
              toAddress,
              value,
              txHash: tx.hash,
              blockNumber,
              logIndex: parseInt(log.logIndex, 16)
            });
          }
        }
      } catch (error) {
        // Silently skip errors processing logs for individual transactions
        logError(`Error processing logs for tx ${tx.hash}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
