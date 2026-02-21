import Database from 'better-sqlite3';
import {
  EvmBlockRecord,
  EvmTxRecord,
  SolanaSlotRecord,
  SolanaTxRecord,
  RoleRecord,
  Erc20TokenConfig
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

      -- Roles table for mnemonic management
      create table if not exists roles (
        id text primary key,
        name text not null unique,
        mnemonic_encrypted text not null,
        derivation_path text not null default "m/44'/60'/0'/0",
        created_at integer default (strftime('%s','now'))
      );

      -- ERC20 token configurations
      create table if not exists erc20_tokens (
        id text primary key,
        chain_id text not null,
        symbol text not null,
        name text not null,
        address text not null,
        decimals integer not null,
        created_at integer default (strftime('%s','now')),
        unique(chain_id, address)
      );

      create index if not exists idx_erc20_tokens_chain
        on erc20_tokens(chain_id);

      -- ERC20 transfer events
      create table if not exists erc20_transfers (
        id text primary key,
        chain_id text not null,
        token_address text not null,
        from_address text not null,
        to_address text not null,
        value text not null,
        tx_hash text not null,
        block_number integer not null,
        log_index integer not null,
        created_at integer default (strftime('%s','now')),
        unique(chain_id, tx_hash, log_index)
      );

      create index if not exists idx_erc20_transfers_from
        on erc20_transfers(chain_id, from_address);
      create index if not exists idx_erc20_transfers_to
        on erc20_transfers(chain_id, to_address);
      create index if not exists idx_erc20_transfers_block
        on erc20_transfers(chain_id, block_number desc);
    `);
  }

  // Role management methods
  createRole(role: RoleRecord) {
    const stmt = this.db.prepare(`
      insert into roles (id, name, mnemonic_encrypted, derivation_path, created_at)
      values (@id, @name, @mnemonicEncrypted, @derivationPath, @createdAt)
    `);
    return stmt.run(role);
  }

  getRole(id: string): RoleRecord | undefined {
    const stmt = this.db.prepare(`
      select id, name, mnemonic_encrypted as mnemonicEncrypted,
             derivation_path as derivationPath, created_at as createdAt
      from roles where id = ?
    `);
    return stmt.get(id) as RoleRecord | undefined;
  }

  getAllRoles(): RoleRecord[] {
    const stmt = this.db.prepare(`
      select id, name, mnemonic_encrypted as mnemonicEncrypted,
             derivation_path as derivationPath, created_at as createdAt
      from roles order by created_at desc
    `);
    return stmt.all() as RoleRecord[];
  }

  updateRole(id: string, updates: Partial<Omit<RoleRecord, 'id' | 'createdAt'>>) {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.mnemonicEncrypted !== undefined) {
      fields.push('mnemonic_encrypted = ?');
      params.push(updates.mnemonicEncrypted);
    }
    if (updates.derivationPath !== undefined) {
      fields.push('derivation_path = ?');
      params.push(updates.derivationPath);
    }

    if (fields.length === 0) return;

    params.push(id);
    const stmt = this.db.prepare(
      `update roles set ${fields.join(', ')} where id = ?`
    );
    return stmt.run(...params);
  }

  deleteRole(id: string) {
    const stmt = this.db.prepare('delete from roles where id = ?');
    return stmt.run(id);
  }

  // ERC20 token management methods
  createErc20Token(token: Erc20TokenConfig) {
    const stmt = this.db.prepare(`
      insert into erc20_tokens (id, chain_id, symbol, name, address, decimals, created_at)
      values (@id, @chain_id, @symbol, @name, @address, @decimals, @created_at)
    `);
    return stmt.run(token);
  }

  getErc20Tokens(chainId?: string): Erc20TokenConfig[] {
    if (chainId) {
      const stmt = this.db.prepare(`
        select id, chain_id, symbol, name, address, decimals, created_at as created_at
        from erc20_tokens where chain_id = ?
      `);
      return stmt.all(chainId) as Erc20TokenConfig[];
    }
    const stmt = this.db.prepare(`
      select id, chain_id, symbol, name, address, decimals, created_at as created_at
      from erc20_tokens order by chain_id, symbol
    `);
    return stmt.all() as Erc20TokenConfig[];
  }

  getErc20Token(id: string): Erc20TokenConfig | undefined {
    const stmt = this.db.prepare(`
      select id, chain_id, symbol, name, address, decimals, created_at as created_at
      from erc20_tokens where id = ?
    `);
    return stmt.get(id) as Erc20TokenConfig | undefined;
  }

  updateErc20Token(id: string, updates: Partial<Omit<Erc20TokenConfig, 'id' | 'created_at'>>) {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.symbol !== undefined) {
      fields.push('symbol = ?');
      params.push(updates.symbol);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      params.push(updates.address);
    }
    if (updates.decimals !== undefined) {
      fields.push('decimals = ?');
      params.push(updates.decimals);
    }

    if (fields.length === 0) return;

    params.push(id);
    const stmt = this.db.prepare(
      `update erc20_tokens set ${fields.join(', ')} where id = ?`
    );
    return stmt.run(...params);
  }

  deleteErc20Token(id: string) {
    const stmt = this.db.prepare('delete from erc20_tokens where id = ?');
    return stmt.run(id);
  }

  // ERC20 Transfer records
  upsertErc20Transfer(transfer: {
    id: string;
    chainId: string;
    tokenAddress: string;
    fromAddress: string;
    toAddress: string;
    value: string;
    txHash: string;
    blockNumber: number;
    logIndex: number;
  }) {
    const stmt = this.db.prepare(`
      insert into erc20_transfers
        (id, chain_id, token_address, from_address, to_address, value, tx_hash, block_number, log_index)
      values
        (@id, @chainId, @tokenAddress, @fromAddress, @toAddress, @value, @txHash, @blockNumber, @logIndex)
      on conflict(chain_id, tx_hash, log_index) do update set
        token_address=excluded.token_address,
        from_address=excluded.from_address,
        to_address=excluded.to_address,
        value=excluded.value,
        block_number=excluded.block_number
    `);
    return stmt.run(transfer);
  }

  getErc20TransfersForAddress(chainId: string, address: string, limit: number = 50) {
    const stmt = this.db.prepare(`
      select * from erc20_transfers
      where chain_id = ? and (from_address = ? or to_address = ?)
      order by block_number desc, log_index desc
      limit ?
    `);
    const addressLower = address.toLowerCase();
    return stmt.all(chainId, addressLower, addressLower, limit);
  }

  getRecentErc20Transfers(chainId: string, limit: number = 20) {
    const stmt = this.db.prepare(`
      select * from erc20_transfers
      where chain_id = ?
      order by block_number desc, log_index desc
      limit ?
    `);
    return stmt.all(chainId, limit);
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
    const addressLower = address.toLowerCase();
    return stmt.all(chainId, addressLower, addressLower, limit) as EvmTxRecord[];
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
