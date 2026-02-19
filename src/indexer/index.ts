import { loadConfig } from './config';
import { RedisCache } from './cache/redis';
import { SqliteStore } from './storage/sqlite';
import { EvmIndexer } from './evm/indexer';
import { SolanaIndexer } from './solana/indexer';
import { createApiServer } from './api/server';
import { logInfo } from './utils/logger';

const main = async () => {
  const config = loadConfig();
  const store = new SqliteStore(config.sqlitePath);
  store.init();

  const cache = new RedisCache(config.redisUrl);

  const evmIndexers = config.chains
    .filter((chain) => chain.type === 'EVM')
    .map(
      (chain) =>
        new EvmIndexer(
          chain,
          store,
          cache,
          config.pollIntervalMs,
          config.initialBackfill,
          config.backfillFromGenesis
        )
    );
  const solanaIndexers = config.chains
    .filter((chain) => chain.type === 'SOLANA')
    .map(
      (chain) =>
        new SolanaIndexer(
          chain,
          store,
          cache,
          config.pollIntervalMs,
          config.initialBackfill,
          config.backfillFromGenesis
        )
    );

  for (const indexer of evmIndexers) {
    indexer.start();
  }
  for (const indexer of solanaIndexers) {
    indexer.start();
  }

  const app = createApiServer(config.chains, store, cache);
  app.listen(config.apiPort, () => {
    logInfo(`Indexer API listening on :${config.apiPort}`);
  });
};

main();
