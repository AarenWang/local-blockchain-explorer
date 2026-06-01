---
name: reset-solana-indexer
description: Clear stale Solana indexer history, wipe Solana cache state, and rebuild the indexer from the current RPC node after a node restart or ledger reset.
---

# Reset Solana Indexer

Use this skill when a Solana RPC node was restarted, pruned, or resynced and the indexed Solana history no longer matches the node.

## Workflow

1. Stop the running indexer before changing data.
2. Clear stale Solana history from SQLite.
3. Clear Solana-related Redis cache keys.
4. Preserve token registry data unless the user explicitly asks for a full SPL reset.
5. Restart the indexer and let it scan from the node's first available block.
6. Verify that new Solana slots and transactions are being written.

## Cleanup Boundary

- Default tables to delete: `solana_slots`, `solana_txs`, `spl_transfers`.
- Optional full reset table: `spl_tokens`.
- Do not touch unrelated tables such as `chains`, `roles`, `tags`, `evm_*`, or `erc20_*` unless explicitly requested.
- Prefer targeted Redis deletion for `solana:*` and `recent:solana:*` keys.
- Use `FLUSHDB` only when the Redis database is dedicated to this app and the user explicitly wants a full cache wipe.

## Execution

- Run [scripts/reset_solana_indexer_state.sh](scripts/reset_solana_indexer_state.sh) for the cleanup phase.
- Then restart the repo's normal indexer process, usually `npm run indexer:dev`.
- Watch the Solana indexer logs for a jump to the first available block/slot rather than slot `0`.

## Verification

- The target Solana rows in SQLite should be empty before the restart.
- Redis should not contain stale `solana:*` or `recent:solana:*` keys.
- After restart, fresh Solana rows should appear with current slots and signatures.
