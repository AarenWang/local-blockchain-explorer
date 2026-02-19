import Redis from 'ioredis';
import { EvmBlockRecord, EvmTxRecord, SolanaSlotRecord, SolanaTxRecord } from '../types';

const RECENT_LIMIT = 300;
const HOT_TTL_SECONDS = 60 * 10;

const key = {
  evmBlock: (chainId: string, number: number) => `evm:block:${chainId}:${number}`,
  evmTx: (chainId: string, hash: string) => `evm:tx:${chainId}:${hash}`,
  recentEvmBlocks: (chainId: string) => `recent:evm:block:${chainId}`,
  recentEvmTxs: (chainId: string) => `recent:evm:tx:${chainId}`,
  solanaSlot: (chainId: string, slot: number) => `solana:slot:${chainId}:${slot}`,
  solanaTx: (chainId: string, signature: string) => `solana:tx:${chainId}:${signature}`,
  recentSolanaSlots: (chainId: string) => `recent:solana:slot:${chainId}`,
  recentSolanaTxs: (chainId: string) => `recent:solana:tx:${chainId}`
};

export class RedisCache {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url);
  }

  async cacheEvmBlock(block: EvmBlockRecord) {
    const redisKey = key.evmBlock(block.chainId, block.number);
    await this.client.set(redisKey, JSON.stringify(block), 'EX', HOT_TTL_SECONDS);
  }

  async cacheEvmTx(tx: EvmTxRecord) {
    const redisKey = key.evmTx(tx.chainId, tx.hash);
    await this.client.set(redisKey, JSON.stringify(tx), 'EX', HOT_TTL_SECONDS);
  }

  async addRecentEvmBlock(block: EvmBlockRecord) {
    const redisKey = key.recentEvmBlocks(block.chainId);
    await this.client.zadd(redisKey, block.number, String(block.number));
    await this.client.zremrangebyrank(redisKey, 0, -RECENT_LIMIT - 1);
  }

  async addRecentEvmTx(tx: EvmTxRecord) {
    const redisKey = key.recentEvmTxs(tx.chainId);
    await this.client.zadd(redisKey, tx.blockNumber, tx.hash);
    await this.client.zremrangebyrank(redisKey, 0, -RECENT_LIMIT - 1);
  }

  async cacheSolanaSlot(slot: SolanaSlotRecord) {
    const redisKey = key.solanaSlot(slot.chainId, slot.slot);
    await this.client.set(redisKey, JSON.stringify(slot), 'EX', HOT_TTL_SECONDS);
  }

  async cacheSolanaTx(tx: SolanaTxRecord) {
    const redisKey = key.solanaTx(tx.chainId, tx.signature);
    await this.client.set(redisKey, JSON.stringify(tx), 'EX', HOT_TTL_SECONDS);
  }

  async addRecentSolanaSlot(slot: SolanaSlotRecord) {
    const redisKey = key.recentSolanaSlots(slot.chainId);
    await this.client.zadd(redisKey, slot.slot, String(slot.slot));
    await this.client.zremrangebyrank(redisKey, 0, -RECENT_LIMIT - 1);
  }

  async addRecentSolanaTx(tx: SolanaTxRecord) {
    const redisKey = key.recentSolanaTxs(tx.chainId);
    await this.client.zadd(redisKey, tx.slot, tx.signature);
    await this.client.zremrangebyrank(redisKey, 0, -RECENT_LIMIT - 1);
  }

  async getRecentEvmBlocks(chainId: string, limit: number) {
    const redisKey = key.recentEvmBlocks(chainId);
    const numbers = await this.client.zrevrange(redisKey, 0, limit - 1);
    if (numbers.length === 0) {
      return [];
    }
    const keys = numbers.map((num) => key.evmBlock(chainId, Number(num)));
    const values = await this.client.mget(keys);
    return values
      .filter((item): item is string => Boolean(item))
      .map((item) => JSON.parse(item) as EvmBlockRecord);
  }

  async getRecentEvmTxs(chainId: string, limit: number) {
    const redisKey = key.recentEvmTxs(chainId);
    const hashes = await this.client.zrevrange(redisKey, 0, limit - 1);
    if (hashes.length === 0) {
      return [];
    }
    const keys = hashes.map((hash) => key.evmTx(chainId, hash));
    const values = await this.client.mget(keys);
    return values
      .filter((item): item is string => Boolean(item))
      .map((item) => JSON.parse(item) as EvmTxRecord);
  }

  async getRecentSolanaSlots(chainId: string, limit: number) {
    const redisKey = key.recentSolanaSlots(chainId);
    const slots = await this.client.zrevrange(redisKey, 0, limit - 1);
    if (slots.length === 0) {
      return [];
    }
    const keys = slots.map((slot) => key.solanaSlot(chainId, Number(slot)));
    const values = await this.client.mget(keys);
    return values
      .filter((item): item is string => Boolean(item))
      .map((item) => JSON.parse(item) as SolanaSlotRecord);
  }

  async getRecentSolanaTxs(chainId: string, limit: number) {
    const redisKey = key.recentSolanaTxs(chainId);
    const signatures = await this.client.zrevrange(redisKey, 0, limit - 1);
    if (signatures.length === 0) {
      return [];
    }
    const keys = signatures.map((signature) => key.solanaTx(chainId, signature));
    const values = await this.client.mget(keys);
    return values
      .filter((item): item is string => Boolean(item))
      .map((item) => JSON.parse(item) as SolanaTxRecord);
  }

  async disconnect() {
    await this.client.quit();
  }
}
