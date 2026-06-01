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
    transaction: {
      signatures: string[];
      message: {
        accountKeys: Array<string | { pubkey: string }>;
        instructions: SolanaInstruction[];
      };
    };
    meta: {
      fee: number;
      err: unknown;
      innerInstructions?: Array<{
        index: number;
        instructions: SolanaInstruction[];
      }>;
      preTokenBalances?: TokenBalanceEntry[];
      postTokenBalances?: TokenBalanceEntry[];
    } | null;
  }>;
}

interface SolanaInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: {
      source?: string;
      destination?: string;
      authority?: string;
      multisigAuthority?: string;
      mint?: string;
      amount?: string;
      tokenAmount?: {
        amount?: string;
      };
    };
  };
}

interface TokenBalanceEntry {
  accountIndex: number;
  mint: string;
  owner?: string;
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
      // Check if chain is paused
      if (this.chain.paused) {
        await sleep(this.pollInterval);
        continue;
      }
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

    const firstAvailable = await this.getFirstAvailableBlock();

    let start = this.lastProcessed !== null
      ? this.lastProcessed + 1
      : this.backfillFromGenesis
        ? 0
        : latest - this.backfill + 1;
    if (start < 0) {
      start = 0;
    }
    if (start < firstAvailable) {
      logInfo(
        `Solana indexer adjusted start slot for ${this.chain.id}: ${start} -> ${firstAvailable}`
      );
      start = firstAvailable;
      this.lastProcessed = firstAvailable - 1;
    }

    for (let slot = start; slot <= latest; slot += 1) {
      let block: SolanaBlockRpc | null;
      try {
        block = await fetchJsonRpc<SolanaBlockRpc | null>(this.chain.rpcUrl, 'getBlock', [
          slot,
          {
            transactionDetails: 'full',
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
            rewards: false
          }
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const cleanedUpTo = this.extractFirstAvailableBlock(message);

        if (cleanedUpTo !== null) {
          logInfo(
            `Solana slot ${slot} is no longer available on ${this.chain.id}; advancing to ${cleanedUpTo}`
          );
          this.lastProcessed = cleanedUpTo - 1;
          slot = cleanedUpTo - 1;
          continue;
        }

        if (this.isSkippedSlotError(message)) {
          this.lastProcessed = slot;
          continue;
        }

        throw error;
      }

      if (!block) {
        this.lastProcessed = slot;
        continue;
      }

      const txs: SolanaTxRecord[] = [];

      for (const item of block.transactions) {
        const signature = item.transaction.signatures[0];
        txs.push({
          chainId: this.chain.id,
          signature,
          slot,
          fee: item.meta?.fee ?? null,
          status: item.meta?.err ? 0 : 1
        });

        this.processSplTransfers(slot, signature, item);
      }

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

  private async getFirstAvailableBlock(): Promise<number> {
    try {
      return await fetchJsonRpc<number>(this.chain.rpcUrl, 'getFirstAvailableBlock');
    } catch {
      try {
        return await fetchJsonRpc<number>(this.chain.rpcUrl, 'minimumLedgerSlot');
      } catch {
        return 0;
      }
    }
  }

  private extractFirstAvailableBlock(message: string): number | null {
    const match = message.match(/First available block:\s*(\d+)/i);
    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  private isSkippedSlotError(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('was skipped') || normalized.includes('skipped, or missing');
  }

  private processSplTransfers(
    slot: number,
    signature: string,
    item: SolanaBlockRpc['transactions'][number]
  ) {
    const tokenAccounts = this.buildTokenAccountIndex(item);
    const topLevelInstructions = item.transaction.message.instructions ?? [];

    topLevelInstructions.forEach((instruction, instructionIndex) => {
      this.persistSplTransfer(slot, signature, instruction, instructionIndex, 0, tokenAccounts);
    });

    for (const group of item.meta?.innerInstructions ?? []) {
      group.instructions.forEach((instruction, innerIndex) => {
        this.persistSplTransfer(
          slot,
          signature,
          instruction,
          group.index,
          innerIndex + 1,
          tokenAccounts
        );
      });
    }
  }

  private buildTokenAccountIndex(item: SolanaBlockRpc['transactions'][number]) {
    const accountKeys = item.transaction.message.accountKeys ?? [];
    const tokenAccounts = new Map<string, { mint?: string; owner?: string }>();
    const balances = [
      ...(item.meta?.preTokenBalances ?? []),
      ...(item.meta?.postTokenBalances ?? [])
    ];

    for (const balance of balances) {
      const keyEntry = accountKeys[balance.accountIndex];
      const pubkey = typeof keyEntry === 'string' ? keyEntry : keyEntry?.pubkey;
      if (!pubkey) {
        continue;
      }

      const existing = tokenAccounts.get(pubkey) ?? {};
      if (balance.mint) {
        existing.mint = balance.mint;
      }
      if (balance.owner) {
        existing.owner = balance.owner;
      }
      tokenAccounts.set(pubkey, existing);
    }

    return tokenAccounts;
  }

  private persistSplTransfer(
    slot: number,
    signature: string,
    instruction: SolanaInstruction,
    instructionIndex: number,
    innerIndex: number,
    tokenAccounts: Map<string, { mint?: string; owner?: string }>
  ) {
    const parsed = instruction.parsed;
    if (!parsed || (parsed.type !== 'transfer' && parsed.type !== 'transferChecked')) {
      return;
    }

    const info = parsed.info;
    const sourceTokenAccount = info?.source;
    const destinationTokenAccount = info?.destination;
    const amount = info?.tokenAmount?.amount ?? info?.amount;

    if (!sourceTokenAccount || !destinationTokenAccount || !amount) {
      return;
    }

    const sourceInfo = tokenAccounts.get(sourceTokenAccount);
    const destinationInfo = tokenAccounts.get(destinationTokenAccount);
    const mintAddress = info?.mint ?? sourceInfo?.mint ?? destinationInfo?.mint;

    if (!mintAddress) {
      return;
    }

    this.store.upsertSplTransfer({
      id: `spl_transfer_${this.chain.id}_${signature}_${instructionIndex}_${innerIndex}`,
      chainId: this.chain.id,
      mintAddress,
      sourceOwner: sourceInfo?.owner ?? null,
      destinationOwner: destinationInfo?.owner ?? null,
      sourceTokenAccount,
      destinationTokenAccount,
      authority: info?.authority ?? info?.multisigAuthority ?? null,
      amount,
      signature,
      slot,
      instructionIndex,
      innerIndex
    });
  }
}
