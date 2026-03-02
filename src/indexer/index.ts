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

  // Only start indexers for chains where indexing is enabled (or not explicitly disabled)
  const evmIndexers = config.chains
    .filter((chain) => chain.type === 'EVM' && (chain.indexing !== false))
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
    .filter((chain) => chain.type === 'SOLANA' && (chain.indexing !== false))
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

  logInfo(`Starting ${evmIndexers.length} EVM indexers and ${solanaIndexers.length} Solana indexers`);

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
