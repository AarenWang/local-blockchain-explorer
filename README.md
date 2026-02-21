# Local Blockchain Explorer

A local blockchain explorer for monitoring and inspecting EVM and Solana chains. Features a web UI for exploring blocks, transactions, and wallet balances, plus an indexer service that tracks chain data.

## Architecture

- **Explorer**: React + Vite frontend application
- **Indexer**: Node.js backend with Express API, SQLite storage, and Redis caching

## Prerequisites

- Node.js (v18 or higher)
- Redis server (for caching)
- Local blockchain nodes (optional, defaults to Anvil EVM at `http://localhost:8545` and Solana at `http://localhost:8899`)

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

The indexer uses environment variables for configuration. Create a `.env` file in the project root or set the following variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLITE_PATH` | `./data/indexer.db` | Path to SQLite database file |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `INDEXER_API_PORT` | `7070` | Port for the indexer API server |
| `POLL_INTERVAL_MS` | `3000` | Blockchain polling interval in milliseconds |
| `INITIAL_BACKFILL` | `10` | Number of blocks/slots to backfill on startup |
| `BACKFILL_FROM_GENESIS` | `false` | Set to `true` to backfill from genesis |
| `INDEXER_CHAINS_JSON` | (see below) | JSON array of chain configurations |

### Default Chains

If `INDEXER_CHAINS_JSON` is not set, the indexer uses these default chains:

```json
[
  {
    "id": "anvil",
    "type": "EVM",
    "name": "Anvil Local",
    "rpcUrl": "http://localhost:8545"
  },
  {
    "id": "solana-local",
    "type": "SOLANA",
    "name": "Solana Local",
    "rpcUrl": "http://localhost:8899"
  }
]
```

### Custom Chain Configuration

To configure custom chains, set `INDEXER_CHAINS_JSON`:

```bash
export INDEXER_CHAINS_JSON='[
  {"id": "mainnet", "type": "EVM", "name": "Ethereum", "rpcUrl": "https://eth.llamarpc.com"},
  {"id": "solana", "type": "SOLANA", "name": "Solana", "rpcUrl": "https://api.mainnet-beta.solana.com"}
]'
```

## Running the Application

### Start Redis (if not running)

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis
```

### Start the Indexer

```bash
npm run indexer:dev
```

The indexer API will be available at `http://localhost:7070`

### Start the Explorer (in a new terminal)

```bash
npm run dev
```

The explorer UI will be available at `http://localhost:5173`

## Building for Production

```bash
# Build the frontend
npm run build

# Preview the production build
npm run preview
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the explorer frontend in development mode |
| `npm run build` | Build the explorer for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint to check code quality |
| `npm run indexer:dev` | Start the indexer backend service |

## API Endpoints

The indexer API runs on port 7070 (configurable via `INDEXER_API_PORT`):

### Chain Data

- `GET /chains` - List all configured chains
- `GET /chain/:id/evm/blocks` - Get recent EVM blocks
- `GET /chain/:id/evm/txs` - Get recent EVM transactions
- `GET /chain/:id/evm/address/:address/txs` - Get transactions for an address
- `GET /chain/:id/solana/slots` - Get recent Solana slots
- `GET /chain/:id/solana/txs` - Get recent Solana transactions

### Wallet Management

- `GET /roles` - List all roles
- `GET /roles/:id` - Get a specific role
- `POST /roles` - Create a new role
- `PATCH /roles/:id` - Update a role
- `DELETE /roles/:id` - Delete a role
- `GET /roles/:roleId/balances` - Get wallet balances for a role

### ERC20 Token Management

- `GET /erc20-tokens` - List all ERC20 tokens
- `POST /erc20-tokens` - Create a new token
- `PATCH /erc20-tokens/:id` - Update a token
- `DELETE /erc20-tokens/:id` - Delete a token
