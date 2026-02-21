import express from 'express';
import { RedisCache } from '../cache/redis';
import { SqliteStore } from '../storage/sqlite';
import { ChainConfig, RoleRecord, Erc20TokenConfig } from '../types';
import { WalletService } from '../wallet/walletService';
import { Mnemonic } from 'ethers';

export const createApiServer = (
  chains: ChainConfig[],
  store: SqliteStore,
  cache: RedisCache
) => {
  const app = express();

  app.use(express.json());

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

  // Existing chain endpoints
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

  // Get ERC20 transfers for an address
  app.get('/chain/:id/evm/address/:address/erc20-transfers', (req, res) => {
    try {
      const chainId = req.params.id;
      const address = req.params.address;
      const limit = Number(req.query.limit ?? 50);

      const transfers = store.getErc20TransfersForAddress(chainId, address, limit);

      // Get token symbols from database
      const tokens = store.getErc20Tokens(chainId);
      const tokenMap = new Map(tokens.map(t => [t.address.toLowerCase(), t]));

      // Enrich transfers with token info
      const enrichedTransfers = transfers.map((t: any) => ({
        ...t,
        tokenSymbol: tokenMap.get(t.token_address.toLowerCase())?.symbol || 'Unknown'
      }));

      res.json(enrichedTransfers);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Get ERC20 token info by address
  app.get('/chain/:id/evm/erc20/info', async (req, res) => {
    try {
      const chainId = req.params.id;
      const tokenAddress = req.query.address as string;

      if (!tokenAddress) {
        res.status(400).json({ error: 'Token address is required' });
        return;
      }

      const chain = chains.find(c => c.id === chainId);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found' });
        return;
      }

      if (chain.type !== 'EVM') {
        res.status(400).json({ error: 'Only EVM chains are supported' });
        return;
      }

      const walletService = new WalletService(chain.rpcUrl);
      const tokenInfo = await walletService.getErc20TokenInfo(tokenAddress, chain.rpcUrl);
      res.json(tokenInfo);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Get ERC20 balances for an address
  app.get('/chain/:id/evm/address/:address/erc20-balances', async (req, res) => {
    try {
      const chainId = req.params.id;
      const address = req.params.address;

      const chain = chains.find(c => c.id === chainId);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found' });
        return;
      }

      if (chain.type !== 'EVM') {
        res.status(400).json({ error: 'Only EVM chains are supported' });
        return;
      }

      // Get ERC20 tokens from chain config or database
      const erc20Tokens = store.getErc20Tokens(chainId);
      const walletService = new WalletService(chain.rpcUrl);
      const balances: Array<{
        tokenAddress: string;
        symbol: string;
        decimals: number;
        balance: string;
        balanceFormatted: number;
      }> = [];

      for (const token of erc20Tokens) {
        try {
          const balance = await walletService.getErc20Balance(address, token.address, chain.rpcUrl);
          // Only include tokens with non-zero balance
          if (balance.balanceFormatted > 0) {
            balances.push({
              tokenAddress: token.address,
              symbol: token.symbol,
              decimals: token.decimals,
              balance: balance.balance,
              balanceFormatted: balance.balanceFormatted
            });
          }
        } catch (error) {
          console.error(`Error fetching ERC20 balance for ${token.symbol}:`, error);
        }
      }

      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
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

  // ===== Role Management Endpoints =====

  // Get all roles
  app.get('/roles', (req, res) => {
    try {
      const roles = store.getAllRoles();
      // Return roles without encrypted mnemonic for security
      const safeRoles = roles.map(({ mnemonicEncrypted, ...rest }) => rest);
      res.json(safeRoles);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Get single role (with encrypted mnemonic for wallet derivation)
  app.get('/roles/:id', (req, res) => {
    try {
      const role = store.getRole(req.params.id);
      if (!role) {
        res.status(404).json({ error: 'Role not found' });
        return;
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create new role
  app.post('/roles', (req, res) => {
    try {
      const { name, mnemonic, derivationPath = "m/44'/60'/0'/0" } = req.body;

      if (!name || !mnemonic) {
        res.status(400).json({ error: 'Name and mnemonic are required' });
        return;
      }

      // Basic mnemonic validation: check word count (12, 15, 18, 21, or 24 words)
      const words = mnemonic.trim().split(/\s+/);
      const validWordCounts = [12, 15, 18, 21, 24];
      if (!validWordCounts.includes(words.length)) {
        res.status(400).json({ error: `Mnemonic must have ${validWordCounts.join(', ')} words` });
        return;
      }

      const id = `role_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);

      // Simple encryption (in production, use proper encryption)
      const mnemonicEncrypted = Buffer.from(mnemonic).toString('base64');

      const role: RoleRecord = {
        id,
        name,
        mnemonicEncrypted,
        derivationPath,
        createdAt: now
      };

      store.createRole(role);
      res.json({ id, name, derivationPath, createdAt: now });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Update role
  app.patch('/roles/:id', (req, res) => {
    try {
      const { name, derivationPath } = req.body;
      store.updateRole(req.params.id, { name, derivationPath });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete role
  app.delete('/roles/:id', (req, res) => {
    try {
      store.deleteRole(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ===== ERC20 Token Management Endpoints =====

  // Get all ERC20 tokens
  app.get('/erc20-tokens', (req, res) => {
    try {
      const chainId = req.query.chainId as string;
      const tokens = store.getErc20Tokens(chainId);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create new ERC20 token (idempotent - returns existing token if already exists)
  app.post('/erc20-tokens', (req, res) => {
    try {
      const { chainId, symbol, name, address, decimals } = req.body;

      if (!chainId || !symbol || !name || !address || decimals === undefined) {
        res.status(400).json({ error: 'All fields are required' });
        return;
      }

      // Check if token already exists
      const existingTokens = store.getErc20Tokens(chainId);
      const existing = existingTokens.find(t => t.address.toLowerCase() === address.toLowerCase());

      if (existing) {
        // Return existing token
        res.json(existing);
        return;
      }

      const id = `token_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);

      const token: Erc20TokenConfig = {
        id,
        chain_id: chainId,
        symbol,
        name,
        address,
        decimals,
        created_at: now
      };

      store.createErc20Token(token);
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Update ERC20 token
  app.patch('/erc20-tokens/:id', (req, res) => {
    try {
      const { symbol, name, address, decimals } = req.body;
      store.updateErc20Token(req.params.id, { symbol, name, address, decimals });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete ERC20 token
  app.delete('/erc20-tokens/:id', (req, res) => {
    try {
      store.deleteErc20Token(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ===== Wallet Balance Endpoints =====

  // Get balances for a role's derived wallets
  app.get('/roles/:roleId/balances', async (req, res) => {
    try {
      const { roleId } = req.params;
      const chainId = req.query.chainId as string;
      const count = Number(req.query.count ?? 10);

      const role = store.getRole(roleId);
      if (!role) {
        res.status(404).json({ error: 'Role not found' });
        return;
      }

      const chain = chains.find(c => c.id === chainId);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found' });
        return;
      }

      if (chain.type !== 'EVM') {
        res.status(400).json({ error: 'Only EVM chains are supported' });
        return;
      }

      // Decrypt mnemonic
      const mnemonic = Buffer.from(role.mnemonicEncrypted, 'base64').toString('utf-8');

      // Get ERC20 tokens for this chain
      const allErc20Tokens = store.getErc20Tokens();
      const erc20Tokens = allErc20Tokens.filter(t => t.chain_id === chainId);
      console.log('[API] ERC20 tokens for chain', chainId, ':', erc20Tokens);

      // Get wallet service and fetch balances
      const walletService = new WalletService(chain.rpcUrl);
      const balances = await walletService.getWalletBalances(
        mnemonic,
        chainId,
        chain.rpcUrl,
        erc20Tokens,
        count,
        role.derivationPath
      );

      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // ===== Tag Management Endpoints =====

  // Get all tags
  app.get('/tags', (req, res) => {
    try {
      const tags = store.getAllTags();
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Get tag by type and target
  app.get('/tags/:type/:target', (req, res) => {
    try {
      const { type, target } = req.params;
      if (type !== 'address' && type !== 'tx') {
        res.status(400).json({ error: 'Type must be "address" or "tx"' });
        return;
      }
      const tag = store.getTag(type as 'address' | 'tx', target);
      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }
      res.json(tag);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Create or update tag
  app.put('/tags', (req, res) => {
    try {
      const { type, target, label, note, color } = req.body;

      if (!type || !target || !label) {
        res.status(400).json({ error: 'Type, target, and label are required' });
        return;
      }

      if (type !== 'address' && type !== 'tx') {
        res.status(400).json({ error: 'Type must be "address" or "tx"' });
        return;
      }

      const id = `tag_${type}_${target.toLowerCase()}`;
      const tag = {
        id,
        type,
        target: target.toLowerCase(),
        label,
        note: note || '',
        color: color || '#3b82f6'
      };

      store.upsertTag(tag);
      res.json(tag);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Delete tag
  app.delete('/tags/:type/:target', (req, res) => {
    try {
      const { type, target } = req.params;
      if (type !== 'address' && type !== 'tx') {
        res.status(400).json({ error: 'Type must be "address" or "tx"' });
        return;
      }
      store.deleteTag(type as 'address' | 'tx', target);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return app;
};
