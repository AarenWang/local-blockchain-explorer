import Database from 'better-sqlite3';
import {
  EvmBlockRecord,
  EvmTxRecord,
  SolanaSlotRecord,
  SolanaTxRecord,
  RoleRecord,
  Erc20TokenConfig,
  SplTokenConfig
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
        value text,
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

      -- SPL token configurations
      create table if not exists spl_tokens (
        id text primary key,
        chain_id text not null,
        symbol text not null,
        name text not null,
        mint text not null,
        decimals integer not null,
        created_at integer default (strftime('%s','now')),
        unique(chain_id, mint)
      );

      create index if not exists idx_spl_tokens_chain
        on spl_tokens(chain_id);

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

      -- SPL transfer events
      create table if not exists spl_transfers (
        id text primary key,
        chain_id text not null,
        mint_address text not null,
        source_owner text,
        destination_owner text,
        source_token_account text not null,
        destination_token_account text not null,
        authority text,
        amount text not null,
        signature text not null,
        slot integer not null,
        instruction_index integer not null,
        inner_index integer not null default 0,
        created_at integer default (strftime('%s','now')),
        unique(chain_id, signature, instruction_index, inner_index)
      );

      create index if not exists idx_spl_transfers_source_owner
        on spl_transfers(chain_id, source_owner);
      create index if not exists idx_spl_transfers_destination_owner
        on spl_transfers(chain_id, destination_owner);
      create index if not exists idx_spl_transfers_source_token_account
        on spl_transfers(chain_id, source_token_account);
      create index if not exists idx_spl_transfers_destination_token_account
        on spl_transfers(chain_id, destination_token_account);
      create index if not exists idx_spl_transfers_slot
        on spl_transfers(chain_id, slot desc);

      -- Tags for addresses and transactions
      create table if not exists tags (
        id text primary key,
        type text not null check(type in ('address', 'tx')),
        target text not null,
        label text not null,
        note text,
        color text default '#3b82f6',
        created_at integer default (strftime('%s','now')),
        updated_at integer default (strftime('%s','now')),
        unique(type, target)
      );

      create index if not exists idx_tags_type_target
        on tags(type, target);
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

  // SPL token management methods
  createSplToken(token: SplTokenConfig) {
    const stmt = this.db.prepare(`
      insert into spl_tokens (id, chain_id, symbol, name, mint, decimals, created_at)
      values (@id, @chain_id, @symbol, @name, @mint, @decimals, @created_at)
    `);
    return stmt.run(token);
  }

  getSplTokens(chainId?: string): SplTokenConfig[] {
    if (chainId) {
      const stmt = this.db.prepare(`
        select id, chain_id, symbol, name, mint, decimals, created_at as created_at
        from spl_tokens where chain_id = ?
      `);
      return stmt.all(chainId) as SplTokenConfig[];
    }
    const stmt = this.db.prepare(`
      select id, chain_id, symbol, name, mint, decimals, created_at as created_at
      from spl_tokens order by chain_id, symbol
    `);
    return stmt.all() as SplTokenConfig[];
  }

  updateSplToken(id: string, updates: Partial<Omit<SplTokenConfig, 'id' | 'created_at'>>) {
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
    if (updates.mint !== undefined) {
      fields.push('mint = ?');
      params.push(updates.mint);
    }
    if (updates.decimals !== undefined) {
      fields.push('decimals = ?');
      params.push(updates.decimals);
    }

    if (fields.length === 0) return;

    params.push(id);
    const stmt = this.db.prepare(
      `update spl_tokens set ${fields.join(', ')} where id = ?`
    );
    return stmt.run(...params);
  }

  deleteSplToken(id: string) {
    const stmt = this.db.prepare('delete from spl_tokens where id = ?');
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

  // SPL Transfer records
  upsertSplTransfer(transfer: {
    id: string;
    chainId: string;
    mintAddress: string;
    sourceOwner: string | null;
    destinationOwner: string | null;
    sourceTokenAccount: string;
    destinationTokenAccount: string;
    authority: string | null;
    amount: string;
    signature: string;
    slot: number;
    instructionIndex: number;
    innerIndex: number;
  }) {
    const stmt = this.db.prepare(`
      insert into spl_transfers
        (
          id, chain_id, mint_address, source_owner, destination_owner,
          source_token_account, destination_token_account, authority, amount,
          signature, slot, instruction_index, inner_index
        )
      values
        (
          @id, @chainId, @mintAddress, @sourceOwner, @destinationOwner,
          @sourceTokenAccount, @destinationTokenAccount, @authority, @amount,
          @signature, @slot, @instructionIndex, @innerIndex
        )
      on conflict(chain_id, signature, instruction_index, inner_index) do update set
        mint_address=excluded.mint_address,
        source_owner=excluded.source_owner,
        destination_owner=excluded.destination_owner,
        source_token_account=excluded.source_token_account,
        destination_token_account=excluded.destination_token_account,
        authority=excluded.authority,
        amount=excluded.amount,
        slot=excluded.slot
    `);
    return stmt.run(transfer);
  }

  getSplTransfersForAddress(chainId: string, address: string, limit: number = 50) {
    const stmt = this.db.prepare(`
      select * from spl_transfers
      where chain_id = ?
        and (
          source_owner = ?
          or destination_owner = ?
          or source_token_account = ?
          or destination_token_account = ?
        )
      order by slot desc, instruction_index desc, inner_index desc
      limit ?
    `);
    return stmt.all(chainId, address, address, address, address, limit);
  }

  getSplTransfersBySignature(chainId: string, signature: string) {
    const stmt = this.db.prepare(`
      select * from spl_transfers
      where chain_id = ? and signature = ?
      order by instruction_index asc, inner_index asc
    `);
    return stmt.all(chainId, signature);
  }

  // Tag management methods
  upsertTag(tag: {
    id: string;
    type: 'address' | 'tx';
    target: string;
    label: string;
    note?: string;
    color?: string;
  }) {
    const stmt = this.db.prepare(`
      insert into tags (id, type, target, label, note, color, updated_at)
      values (@id, @type, @target, @label, @note, @color, strftime('%s','now'))
      on conflict(type, target) do update set
        label=excluded.label,
        note=excluded.note,
        color=excluded.color,
        updated_at=excluded.updated_at
    `);
    return stmt.run(tag);
  }

  getTag(type: 'address' | 'tx', target: string) {
    const stmt = this.db.prepare(`
      select * from tags where type = ? and lower(target) = lower(?)
    `);
    return stmt.get(type, target);
  }

  getTagByTarget(target: string) {
    const stmt = this.db.prepare(`
      select * from tags where lower(target) = lower(?)
    `);
    return stmt.get(target);
  }

  getAllTags() {
    const stmt = this.db.prepare(`
      select * from tags order by created_at desc
    `);
    return stmt.all();
  }

  deleteTag(type: 'address' | 'tx', target: string) {
    const stmt = this.db.prepare(`
      delete from tags where type = ? and lower(target) = lower(?)
    `);
    return stmt.run(type, target);
  }

  // Clear all data for a specific chain (useful for test chains that restart)
  clearChainData(chainId: string) {
    const tx = this.db.transaction(() => {
      // Clear EVM data
      this.db.prepare('delete from evm_blocks where chain_id = ?').run(chainId);
      this.db.prepare('delete from evm_txs where chain_id = ?').run(chainId);
      this.db.prepare('delete from erc20_transfers where chain_id = ?').run(chainId);

      // Clear Solana data
      this.db.prepare('delete from solana_slots where chain_id = ?').run(chainId);
      this.db.prepare('delete from solana_txs where chain_id = ?').run(chainId);
      this.db.prepare('delete from spl_transfers where chain_id = ?').run(chainId);
    });
    tx();
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
        (chain_id, hash, block_number, from_addr, to_addr, value_wei, value, gas_price, gas_used, status)
      values
        (@chainId, @hash, @blockNumber, @from, @to, @valueWei, @value, @gasPrice, @gasUsed, @status)
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

  getRecentEvmBlocks(chainId: string, limit: number, offset: number = 0) {
    const stmt = this.db.prepare(
      'select * from evm_blocks where chain_id = ? order by number desc limit ? offset ?'
    );
    return stmt.all(chainId, limit, offset) as EvmBlockRecord[];
  }

  getRecentEvmTxs(chainId: string, limit: number, offset: number = 0) {
    const stmt = this.db.prepare(
      'select * from evm_txs where chain_id = ? order by block_number desc limit ? offset ?'
    );
    return stmt.all(chainId, limit, offset) as EvmTxRecord[];
  }

  getEvmTxByHash(chainId: string, hash: string) {
    const stmt = this.db.prepare(
      'select * from evm_txs where chain_id = ? and hash = ? limit 1'
    );
    return stmt.get(chainId, hash) as EvmTxRecord | undefined;
  }

  getEvmAddressTxs(chainId: string, address: string, limit: number, offset: number = 0) {
    const stmt = this.db.prepare(
      `select * from evm_txs
       where chain_id = ? and (from_addr = ? or to_addr = ?)
       order by block_number desc
       limit ? offset ?`
    );
    const addressLower = address.toLowerCase();
    return stmt.all(chainId, addressLower, addressLower, limit, offset) as EvmTxRecord[];
  }

  getRecentSolanaSlots(chainId: string, limit: number, offset: number = 0) {
    const stmt = this.db.prepare(
      'select * from solana_slots where chain_id = ? order by slot desc limit ? offset ?'
    );
    return stmt.all(chainId, limit, offset) as SolanaSlotRecord[];
  }

  getRecentSolanaTxs(chainId: string, limit: number, offset: number = 0) {
    const stmt = this.db.prepare(
      'select * from solana_txs where chain_id = ? order by slot desc limit ? offset ?'
    );
    return stmt.all(chainId, limit, offset) as SolanaTxRecord[];
  }
}
