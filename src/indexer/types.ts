export type ChainType = 'EVM' | 'SOLANA';

export interface ChainConfig {
  id: string;
  type: ChainType;
  name: string;
  rpcUrl: string;
}

export interface IndexerConfig {
  sqlitePath: string;
  redisUrl: string;
  pollIntervalMs: number;
  initialBackfill: number;
  backfillFromGenesis: boolean;
  apiPort: number;
  chains: ChainConfig[];
}

export interface EvmBlockRecord {
  chainId: string;
  number: number;
  hash: string;
  timestamp: number;
  miner: string;
  gasUsed: number;
  gasLimit: number;
  txCount: number;
}

export interface EvmTxRecord {
  chainId: string;
  hash: string;
  blockNumber: number;
  from: string;
  to: string | null;
  valueWei: string;
  gasPrice: string;
  gasUsed: string | null;
  status: number | null;
}

export interface SolanaSlotRecord {
  chainId: string;
  slot: number;
  blockTime: number | null;
  blockhash: string | null;
  parentBlockhash: string | null;
  txCount: number;
}

export interface SolanaTxRecord {
  chainId: string;
  signature: string;
  slot: number;
  fee: number | null;
  status: number | null;
}
