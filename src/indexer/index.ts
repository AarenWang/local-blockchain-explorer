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

  // For test chains, clear old data on startup to avoid stale data after restart
  for (const chain of config.chains) {
    const isTestChain = chain.id.includes('local') || chain.id.includes('test') || chain.id.includes('anvil');
    if (isTestChain && chain.indexing !== false) {
      logInfo(`Clearing old data for test chain: ${chain.id}`);
      store.clearChainData(chain.id);
    }
  }

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
