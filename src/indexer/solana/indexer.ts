import { fetchJsonRpc } from '../clients/jsonRpc';
import { RedisCache } from '../cache/redis';
import { SqliteStore } from '../storage/sqlite';
import { ChainConfig, SolanaSlotRecord, SolanaTxRecord } from '../types';
import { logError, logInfo } from '../utils/logger';
import { sleep } from '../utils/sleep';

interface SolanaBlockRpc {
  blockTime: number | null;
  blockhash: string;
  previousBlockhash: string;
  transactions: Array<{
    transaction: { signatures: string[] };
    meta: { fee: number; err: unknown } | null;
  }>;
}

export class SolanaIndexer {
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
    logInfo(`Solana indexer started (${this.chain.name})`);
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        logError(`Solana indexer error: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(this.pollInterval);
    }
  }

  stop() {
    this.running = false;
  }

  private async tick() {
    const latest = await fetchJsonRpc<number>(this.chain.rpcUrl, 'getSlot');
    if (!Number.isFinite(latest)) {
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

    for (let slot = start; slot <= latest; slot += 1) {
      const block = await fetchJsonRpc<SolanaBlockRpc>(this.chain.rpcUrl, 'getBlock', [
        slot,
        { transactionDetails: 'full' }
      ]);

      const txs: SolanaTxRecord[] = block.transactions.map((item) => ({
        chainId: this.chain.id,
        signature: item.transaction.signatures[0],
        slot,
        fee: item.meta?.fee ?? null,
        status: item.meta?.err ? 0 : 1
      }));

      const slotRecord: SolanaSlotRecord = {
        chainId: this.chain.id,
        slot,
        blockTime: block.blockTime ?? null,
        blockhash: block.blockhash ?? null,
        parentBlockhash: block.previousBlockhash ?? null,
        txCount: txs.length
      };

      this.store.upsertSolanaSlot(slotRecord, txs);

      await this.cache.cacheSolanaSlot(slotRecord);
      await this.cache.addRecentSolanaSlot(slotRecord);
      for (const tx of txs) {
        await this.cache.cacheSolanaTx(tx);
        await this.cache.addRecentSolanaTx(tx);
      }

      this.lastProcessed = slot;
    }
  }
}
