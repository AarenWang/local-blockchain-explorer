import { ChainConfig, IndexerConfig } from '../types';

const parseChains = (): ChainConfig[] => {
  const raw = process.env.INDEXER_CHAINS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ChainConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // fall back to defaults
    }
  }
  return [
    {
      id: 'anvil',
      type: 'EVM',
      name: 'Anvil Local',
      rpcUrl: 'http://localhost:8545'
    },
    {
      id: 'solana-local',
      type: 'SOLANA',
      name: 'Solana Local',
      rpcUrl: 'http://localhost:8899'
    }
  ];
};

export const loadConfig = (): IndexerConfig => {
  return {
    sqlitePath: process.env.SQLITE_PATH ?? './data/indexer.db',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
    initialBackfill: Number(process.env.INITIAL_BACKFILL ?? 10),
    backfillFromGenesis: (process.env.BACKFILL_FROM_GENESIS ?? '').toLowerCase() === 'true',
    apiPort: Number(process.env.INDEXER_API_PORT ?? 7070),
    chains: parseChains()
  };
};
