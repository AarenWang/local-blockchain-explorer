# Indexer 方案（SQLite + Redis）

## 1) 目标

- 为 EVM / Solana 提供近期区块与交易列表，以及快速查询能力。
- SQLite 作为数据源（Source of Truth）。
- Redis 作为高性能缓存与队列层。
- 方案保持本地优先、结构清晰、易于扩展。

## 2) 高层架构

- indexer 服务（Node.js）
  - 链轮询器（EVM / Solana）
  - 解析与归一化
  - SQLite 写入器
  - Redis 缓存写入器
  - 查询 API（可选 REST）

数据流：

1. 从 RPC 拉取最新高度 / slot。
2. 获取新增区块 / slot 及交易。
3. 归一化为统一数据模型。
4. 批量写入 SQLite。
5. 更新 Redis 缓存（最近列表 / 热数据）。

## 3) SQLite Schema（数据源）

最小表结构：

- chains
  - id (text pk)
  - type (EVM/SOLANA)
  - name
  - rpc_url
  - created_at

- evm_blocks
  - chain_id (fk)
  - number (int)
  - hash (text)
  - timestamp (int)
  - miner (text)
  - gas_used (int)
  - gas_limit (int)
  - tx_count (int)
  - primary key (chain_id, number)

- evm_txs
  - chain_id (fk)
  - hash (text pk)
  - block_number (int)
  - from_addr (text)
  - to_addr (text)
  - value_wei (text)
  - gas_price (text)
  - gas_used (text)
  - status (int)
  - created_at

- solana_slots
  - chain_id (fk)
  - slot (int)
  - block_time (int)
  - blockhash (text)
  - parent_blockhash (text)
  - tx_count (int)
  - primary key (chain_id, slot)

- solana_txs
  - chain_id (fk)
  - signature (text pk)
  - slot (int)
  - fee (int)
  - status (int)
  - created_at

索引：

- evm_blocks(chain_id, number desc)
- evm_txs(chain_id, block_number desc)
- solana_slots(chain_id, slot desc)
- solana_txs(chain_id, slot desc)

## 4) Redis 使用（性能层）

Key 设计：

- 每条链的近期区块
  - key: recent:evm:block:{chain_id}
  - type: ZSET（score = block number，member = block hash 或 number）

- 每条链的近期交易
  - key: recent:evm:tx:{chain_id}
  - type: ZSET（score = block number，member = tx hash）

- 热数据缓存（block/tx JSON）
  - key: evm:block:{chain_id}:{number}
  - type: STRING（JSON）
  - key: evm:tx:{chain_id}:{hash}
  - type: STRING（JSON）

- Solana 对应结构
  - recent:solana:slot:{chain_id}（ZSET）
  - recent:solana:tx:{chain_id}（ZSET）
  - solana:slot:{chain_id}:{slot}（STRING JSON）
  - solana:tx:{chain_id}:{signature}（STRING JSON）

缓存策略：

- ZSET 固定容量（例如 200-500 条）
- 热数据 TTL（例如 5-30 分钟）

## 5) Indexer 流程（按链）

EVM：

- 轮询 eth_blockNumber
- 对每个新增区块：
  - eth_getBlockByNumber(block, true)
  - 写入 SQLite（区块 + 交易）
  - 更新 Redis（ZSET + 热数据）

Solana：

- 轮询 getSlot
- 对每个新增 slot：
  - getBlock(slot, { transactionDetails: "full" })
  - 写入 SQLite（slot + 交易）
  - 更新 Redis（ZSET + 热数据）

## 6) API / 查询层

方案 A：在 indexer 内提供 REST API（推荐）。

- GET /chains
- GET /chain/:id/evm/blocks?limit=20
- GET /chain/:id/evm/txs?limit=20
- GET /chain/:id/solana/slots?limit=20
- GET /chain/:id/solana/txs?limit=20

查询策略：

- 优先 Redis（近期列表 + 热数据）
- Cache miss 回落 SQLite
- 必要时用 SQLite 回填 Redis

## 7) 一致性策略

- SQLite 是唯一事实来源。
- Redis 仅作缓存。
- Redis 不可用时仍写 SQLite。
- 重启时从 SQLite 回填 Redis（最近 N 条）。

## 8) 错误与重试

- RPC 失败：指数退避 + 重试
- 区块解析失败：跳过并在下个周期补偿
- SQLite 冲突：幂等 upsert / 忽略重复

## 9) 部署（本地优先）

- indexer 作为独立进程运行（node script 或服务）。
- Redis 可本地 docker 或系统服务。
- SQLite 文件路径：./data/indexer.db

## 10) MVP 范围

- EVM：区块 + 交易索引
- Solana：slot + 交易索引
- 首页 recent 列表
- 最小 REST API 供 UI 读取

## 11) 下一步（确认后执行）

- 新建目录：src/indexer
- 增加依赖：sqlite3（或 better-sqlite3）、ioredis、express
- 实现 EVM indexer 循环
- 实现 Solana indexer 循环
- 提供 REST 接口
- UI 使用 indexer API 获取 recent 列表

## 12) 代码目录规划（建议）

```
src/indexer/
src/indexer/config/
src/indexer/clients/
src/indexer/evm/
src/indexer/solana/
src/indexer/storage/
src/indexer/cache/
src/indexer/api/
src/indexer/jobs/
src/indexer/utils/
src/indexer/types.ts
src/indexer/index.ts
```

说明：

- config：环境与链配置、轮询间隔、Redis/SQLite 连接参数
- clients：RPC 调用封装（EVM/Solana）
- evm / solana：链级索引流程与解析逻辑
- storage：SQLite schema + DAO
- cache：Redis key 规范 + ZSET/STRING/TTL 操作
- api：REST 查询接口（最近区块/交易）
- jobs：主循环、重试/补偿、队列
- utils：日志、时间、分页、去重
