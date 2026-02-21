#!/usr/bin/env node
/**
 * Backfill script for ERC20 Transfer events
 * Usage: npx tsx src/indexer/backfill-erc20.ts <chainId> <startBlock> <endBlock>
 *
 * Examples:
 *   # Backfill blocks 0 to 100
 *   npx tsx src/indexer/backfill-erc20.ts anvil 0 100
 *
 *   # Backfill from genesis to latest
 *   npx tsx src/indexer/backfill-erc20.ts anvil 0 latest
 */

import { fetchJsonRpc } from './clients/jsonRpc';
import { SqliteStore } from './storage/sqlite';
import { loadConfig } from './config';
import { logError, logInfo } from './utils/logger';

// ERC20 Transfer event signature
const ERC20_TRANSFER_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface Tx {
  hash: string;
}

interface Receipt {
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
    logIndex: string;
  }>;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx src/indexer/backfill-erc20.ts <chainId> <startBlock> [endBlock]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx src/indexer/backfill-erc20.ts anvil 0 100');
    console.log('  npx tsx src/indexer/backfill-erc20.ts anvil 0 latest');
    process.exit(1);
  }

  const chainId = args[0];
  const startBlock = parseInt(args[1], 10);
  const endBlockArg = args[2] || 'latest';

  const config = loadConfig();
  const chain = config.chains.find(c => c.id === chainId);

  if (!chain) {
    logError(`Chain ${chainId} not found in config`);
    process.exit(1);
  }

  if (chain.type !== 'EVM') {
    logError(`Chain ${chainId} is not an EVM chain`);
    process.exit(1);
  }

  const store = new SqliteStore(config.sqlitePath);
  store.init();

  // Get current block number
  const latestHex = await fetchJsonRpc<string>(chain.rpcUrl, 'eth_blockNumber');
  const latestBlock = parseInt(latestHex, 16);

  let endBlock = endBlockArg === 'latest' ? latestBlock : parseInt(endBlockArg, 10);

  if (endBlock > latestBlock) {
    endBlock = latestBlock;
  }

  logInfo(`Backfilling ERC20 transfers for chain ${chainId}`);
  logInfo(`From block ${startBlock} to ${endBlock} (latest: ${latestBlock})`);

  let processedCount = 0;
  let transferCount = 0;

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    try {
      const hex = `0x${blockNumber.toString(16)}`;
      const block = await fetchJsonRpc<{ transactions: Tx[] }>(
        chain.rpcUrl,
        'eth_getBlockByNumber',
        [hex, true]
      );

      if (!block.transactions || block.transactions.length === 0) {
        continue;
      }

      // Process each transaction's receipt for Transfer events
      for (const tx of block.transactions) {
        try {
          const receipt = await fetchJsonRpc<Receipt>(
            chain.rpcUrl,
            'eth_getTransactionReceipt',
            [tx.hash]
          );

          if (!receipt.logs || receipt.logs.length === 0) {
            continue;
          }

          for (const log of receipt.logs) {
            if (log.topics[0]?.toLowerCase() === ERC20_TRANSFER_SIGNATURE && log.topics.length >= 3) {
              const fromAddress = '0x' + log.topics[1].slice(26).toLowerCase();
              const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();
              const value = log.data || '0x';

              store.upsertErc20Transfer({
                id: `transfer_${chainId}_${tx.hash}_${log.logIndex}`,
                chainId: chainId,
                tokenAddress: log.address.toLowerCase(),
                fromAddress,
                toAddress,
                value,
                txHash: tx.hash,
                blockNumber,
                logIndex: parseInt(log.logIndex, 16)
              });
              transferCount++;
            }
          }
        } catch (err) {
          // Continue with next transaction on error
        }
      }

      processedCount++;

      if (processedCount % 100 === 0) {
        logInfo(`Processed ${processedCount} blocks, found ${transferCount} transfers...`);
      }
    } catch (err) {
      logError(`Error processing block ${blockNumber}: ${err}`);
    }
  }

  logInfo(`Backfill complete!`);
  logInfo(`Processed ${processedCount} blocks`);
  logInfo(`Found and stored ${transferCount} ERC20 transfers`);

  process.exit(0);
}

main().catch(err => {
  logError(`Backfill failed: ${err}`);
  process.exit(1);
});
