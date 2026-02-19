import express from 'express';
import { RedisCache } from '../cache/redis';
import { SqliteStore } from '../storage/sqlite';
import { ChainConfig } from '../types';

export const createApiServer = (
  chains: ChainConfig[],
  store: SqliteStore,
  cache: RedisCache
) => {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/chains', (_req, res) => {
    res.json(chains);
  });

  app.get('/chain/:id/evm/blocks', async (req, res) => {
    const chainId = req.params.id;
    const limit = Number(req.query.limit ?? 20);
    const cached = await cache.getRecentEvmBlocks(chainId, limit);
    if (cached.length > 0) {
      res.json(cached);
      return;
    }
    res.json(store.getRecentEvmBlocks(chainId, limit));
  });

  app.get('/chain/:id/evm/txs', async (req, res) => {
    const chainId = req.params.id;
    const limit = Number(req.query.limit ?? 20);
    const cached = await cache.getRecentEvmTxs(chainId, limit);
    if (cached.length > 0) {
      res.json(cached);
      return;
    }
    res.json(store.getRecentEvmTxs(chainId, limit));
  });

  app.get('/chain/:id/evm/address/:address/txs', (req, res) => {
    const chainId = req.params.id;
    const address = req.params.address;
    const limit = Number(req.query.limit ?? 20);
    res.json(store.getEvmAddressTxs(chainId, address, limit));
  });

  app.get('/chain/:id/solana/slots', async (req, res) => {
    const chainId = req.params.id;
    const limit = Number(req.query.limit ?? 20);
    const cached = await cache.getRecentSolanaSlots(chainId, limit);
    if (cached.length > 0) {
      res.json(cached);
      return;
    }
    res.json(store.getRecentSolanaSlots(chainId, limit));
  });

  app.get('/chain/:id/solana/txs', async (req, res) => {
    const chainId = req.params.id;
    const limit = Number(req.query.limit ?? 20);
    const cached = await cache.getRecentSolanaTxs(chainId, limit);
    if (cached.length > 0) {
      res.json(cached);
      return;
    }
    res.json(store.getRecentSolanaTxs(chainId, limit));
  });

  return app;
};
