# Cleanup Boundary

## Default deletion scope

- `solana_slots`
- `solana_txs`
- `spl_transfers`

## Optional full reset

- `spl_tokens`

## Redis cleanup scope

- `solana:slot:<chainId>:*`
- `solana:tx:<chainId>:*`
- `recent:solana:slot:<chainId>`
- `recent:solana:tx:<chainId>`

## Do not delete unless asked

- `chains`
- `roles`
- `tags`
- `erc20_*`
- `evm_*`

