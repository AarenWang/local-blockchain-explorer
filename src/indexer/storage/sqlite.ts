import Database from 'better-sqlite3';
import {
  EvmBlockRecord,
  EvmTxRecord,
  SolanaSlotRecord,
  SolanaTxRecord
} from '../types';

export class SqliteStore {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
  }

  init() {
    this.db.exec(`
      pragma journal_mode = WAL;
      pragma synchronous = NORMAL;

      create table if not exists chains (
        id text primary key,
        type text not null,
        name text not null,
        rpc_url text not null,
        created_at integer default (strftime('%s','now'))
      );

      create table if not exists evm_blocks (
        chain_id text not null,
        number integer not null,
        hash text not null,
        timestamp integer not null,
        miner text not null,
        gas_used integer not null,
        gas_limit integer not null,
        tx_count integer not null,
        primary key (chain_id, number)
      );

      create table if not exists evm_txs (
        chain_id text not null,
        hash text primary key,
        block_number integer not null,
        from_addr text not null,
        to_addr text,
        value_wei text not null,
        gas_price text not null,
        gas_used text,
        status integer,
        created_at integer default (strftime('%s','now'))
      );

      create table if not exists solana_slots (
        chain_id text not null,
        slot integer not null,
        block_time integer,
        blockhash text,
        parent_blockhash text,
        tx_count integer not null,
        primary key (chain_id, slot)
      );

      create table if not exists solana_txs (
        chain_id text not null,
        signature text primary key,
        slot integer not null,
        fee integer,
        status integer,
        created_at integer default (strftime('%s','now'))
      );

      create index if not exists idx_evm_blocks_chain_number
        on evm_blocks(chain_id, number desc);
      create index if not exists idx_evm_txs_chain_block
        on evm_txs(chain_id, block_number desc);
      create index if not exists idx_evm_txs_from_addr
        on evm_txs(chain_id, from_addr);
      create index if not exists idx_evm_txs_to_addr
        on evm_txs(chain_id, to_addr);
      create index if not exists idx_solana_slots_chain_slot
        on solana_slots(chain_id, slot desc);
      create index if not exists idx_solana_txs_chain_slot
        on solana_txs(chain_id, slot desc);
    `);
  }

  upsertEvmBlock(block: EvmBlockRecord, txs: EvmTxRecord[]) {
    const insertBlock = this.db.prepare(`
      insert into evm_blocks
        (chain_id, number, hash, timestamp, miner, gas_used, gas_limit, tx_count)
      values
        (@chainId, @number, @hash, @timestamp, @miner, @gasUsed, @gasLimit, @txCount)
      on conflict(chain_id, number) do update set
        hash=excluded.hash,
        timestamp=excluded.timestamp,
        miner=excluded.miner,
        gas_used=excluded.gas_used,
        gas_limit=excluded.gas_limit,
        tx_count=excluded.tx_count
    `);

    const insertTx = this.db.prepare(`
      insert into evm_txs
        (chain_id, hash, block_number, from_addr, to_addr, value_wei, gas_price, gas_used, status)
      values
        (@chainId, @hash, @blockNumber, @from, @to, @valueWei, @gasPrice, @gasUsed, @status)
      on conflict(hash) do update set
        block_number=excluded.block_number,
        from_addr=excluded.from_addr,
        to_addr=excluded.to_addr,
        value_wei=excluded.value_wei,
        gas_price=excluded.gas_price,
        gas_used=excluded.gas_used,
        status=excluded.status
    `);

    const tx = this.db.transaction(() => {
      insertBlock.run(block);
      for (const item of txs) {
        insertTx.run(item);
      }
    });

    tx();
  }

  upsertSolanaSlot(slot: SolanaSlotRecord, txs: SolanaTxRecord[]) {
    const insertSlot = this.db.prepare(`
      insert into solana_slots
        (chain_id, slot, block_time, blockhash, parent_blockhash, tx_count)
      values
        (@chainId, @slot, @blockTime, @blockhash, @parentBlockhash, @txCount)
      on conflict(chain_id, slot) do update set
        block_time=excluded.block_time,
        blockhash=excluded.blockhash,
        parent_blockhash=excluded.parent_blockhash,
        tx_count=excluded.tx_count
    `);

    const insertTx = this.db.prepare(`
      insert into solana_txs
        (chain_id, signature, slot, fee, status)
      values
        (@chainId, @signature, @slot, @fee, @status)
      on conflict(signature) do update set
        slot=excluded.slot,
        fee=excluded.fee,
        status=excluded.status
    `);

    const tx = this.db.transaction(() => {
      insertSlot.run(slot);
      for (const item of txs) {
        insertTx.run(item);
      }
    });

    tx();
  }

  getRecentEvmBlocks(chainId: string, limit: number) {
    const stmt = this.db.prepare(
      'select * from evm_blocks where chain_id = ? order by number desc limit ?'
    );
    return stmt.all(chainId, limit) as EvmBlockRecord[];
  }

  getRecentEvmTxs(chainId: string, limit: number) {
    const stmt = this.db.prepare(
      'select * from evm_txs where chain_id = ? order by block_number desc limit ?'
    );
    return stmt.all(chainId, limit) as EvmTxRecord[];
  }

  getEvmAddressTxs(chainId: string, address: string, limit: number) {
    const stmt = this.db.prepare(
      `select * from evm_txs
       where chain_id = ? and (from_addr = ? or to_addr = ?)
       order by block_number desc
       limit ?`
    );
    return stmt.all(chainId, address, address, limit) as EvmTxRecord[];
  }

  getRecentSolanaSlots(chainId: string, limit: number) {
    const stmt = this.db.prepare(
      'select * from solana_slots where chain_id = ? order by slot desc limit ?'
    );
    return stmt.all(chainId, limit) as SolanaSlotRecord[];
  }

  getRecentSolanaTxs(chainId: string, limit: number) {
    const stmt = this.db.prepare(
      'select * from solana_txs where chain_id = ? order by slot desc limit ?'
    );
    return stmt.all(chainId, limit) as SolanaTxRecord[];
  }
}
