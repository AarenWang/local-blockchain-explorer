很好，这个想法**非常对路，而且很“工程理性”**。
你这个不是在“重复造 Etherscan”，而是在做一个 **Developer-first、Local-first、Multi-chain 的调试 Explorer**。
下面我给你一份**可以直接拿去开 repo 的 PRD（偏工程，不偏市场）**。

---

# 📄 PRD：Local Blockchain Explorer（Developer-First）

## 1. 产品定位（What & Why）

### 1.1 产品一句话定义

> 一个**本地运行、无需索引器、直连本地测试链节点**的区块链浏览器，用于开发和调试 EVM / Solana 等链的本地区块数据。

### 1.2 目标用户

* 区块链工程师（Backend / Smart Contract / Infra）
* 使用本地测试链（Anvil / solana-test-validator / 本地 TRON 私链）
* 需要一个 **轻量、可配置、随开随用** 的 Explorer

### 1.3 非目标（明确不做）

* ❌ 公网 Etherscan 替代
* ❌ 长期历史索引
* ❌ 大规模多用户访问
* ❌ Token/NFT 市场分析

---

## 2. 核心设计原则

| 原则                 | 说明                         |
| ------------------ | -------------------------- |
| Local-first        | 所有数据来自用户配置的 RPC            |
| Zero Index         | 不跑全量索引器，**按需查询**           |
| Chain-agnostic     | EVM / Solana 通过 Adapter 解耦 |
| Stateless Backend  | 可选纯前端 + RPC                |
| Developer Friendly | Debug > 美观                 |

---

## 3. 支持的链（V1）

### 3.1 链类型抽象

```text
ChainType
├── EVM
├── SOLANA
├── TRON (planned)
└── BITCOIN (planned)
```

### 3.2 V1 支持

| 链      | 本地工具                  | 说明       |
| ------ | --------------------- | -------- |
| EVM    | Anvil / Hardhat       | JSON-RPC |
| Solana | solana-test-validator | JSON-RPC |
| TRON   | Private Nile / 本地节点   | JSON-RPC |
| Bitcoin| regtest                | JSON-RPC |

---

## 4. 功能范围（Scope）

### 4.1 配置管理（最关键）

#### 配置项（浏览器本地存储）

```ts
ChainConfig {
  id: string
  chainType: "EVM" | "SOLANA"
  chainName: string
  nativeTokenSymbol: string   // ETH / SOL
  rpcUrl: string
  wsUrl?: string
  chainId?: number            // EVM
  enabled: boolean
}
```

* 支持：

  * 新增 / 编辑 / 删除
  * 切换当前激活链
* 存储：

  * `localStorage / IndexedDB`
  * 不依赖后端

---

### 4.2 节点连接与状态

* RPC 可用性检测
* 基本链信息展示：

  * latest block height
  * chainId（EVM）
  * slot（Solana）
* 错误提示：

  * RPC unreachable
  * incompatible chain

---

### 4.3 查询入口（统一 Search Bar）

支持自动识别：

* Address
* Transaction Hash / Signature / TxID
* Block Number / Slot / Height

```text
Search Input
→ detect type
→ route to adapter
```

---

### 4.4 各链首页（Chain Home）

> 首页结构按链差异化：健康状态 + 最近区块/交易摘要

#### EVM

* latest block
* gas price
* finalized block
* latest blocks / txs

#### Solana

* latest slot
* epoch / leader
* recent slots / txs

#### TRON（planned）

* latest block
* witness / solidity block
* latest blocks / txs

#### Bitcoin（planned）

* height
* difficulty
* mempool size
* latest blocks / mempool txs

---

### 4.5 区块详情页（Block Detail）

#### EVM

* block number
* block hash
* timestamp
* miner
* gas used / gas limit
* tx list（hash + from + to + value）

#### Solana

* slot
* blockTime
* leader
* transactions（signature list）

#### TRON（planned）

* block number
* block hash
* witness
* transactions（txid list）

#### Bitcoin（planned）

* height
* block hash
* size / weight
* transactions（txid list）

---

### 4.6 交易详情页（Transaction Detail）

#### EVM

* tx hash
* from / to
* value
* gas / gasUsed
* status
* logs（raw）

#### Solana

* signature
* fee
* instructions（raw / parsed）
* logMessages

#### TRON（planned）

* txid
* type
* from / to
* amount
* contract data（raw）

#### Bitcoin（planned）

* txid
* fee
* inputs / outputs
* status (confirmed / mempool)

---

### 4.7 地址详情页（Address Detail）

#### EVM

* ETH balance
* tx count（nonce）
* recent tx（可限制 N 条）

#### Solana

* SOL balance
* account owner
* data (base64)

#### TRON（planned）

* TRX balance
* bandwidth / energy
* recent tx

#### Bitcoin（planned）

* balance
* tx count
* UTXO list

---

## 5. 技术架构（推荐）

### 5.1 架构选型（Vibe Code 友好）

```text
Browser (React / Vue)
  ↓
Chain Adapter (TS)
  ↓
RPC JSON
  ↓
Local Node (Anvil / Solana)
```

* **不强制后端**
* 可选 Node.js proxy（解决 CORS）

---

### 5.2 Adapter 设计（关键）

```ts
interface ChainAdapter {
  connect(): Promise<ChainStatus>

  getBlockByNumber(id): Promise<Block>
  getTxByHash(hash): Promise<Transaction>
  getAddress(address): Promise<AddressInfo>
}
```

实现：

* `EvmAdapter`
* `SolanaAdapter`

---

### 5.3 EVM Adapter（示例）

* JSON-RPC：

  * `eth_blockNumber`
  * `eth_getBlockByNumber`
  * `eth_getTransactionByHash`
  * `eth_getBalance`

---

### 5.4 Solana Adapter（示例）

* JSON-RPC：

  * `getSlot`
  * `getBlock`
  * `getTransaction`
  * `getBalance`
  * `getAccountInfo`

---

## 6. 非功能需求（NFR）

| 类别   | 要求          |
| ---- | ----------- |
| 启动速度 | < 1s        |
| 数据延迟 | 实时          |
| 可扩展性 | 插件化 Adapter |
| 可调试性 | RPC 原始请求可查看 |
| 安全   | 不上传任何数据     |

---

## 7. V1 明确不做（非常重要）

* ❌ Token 列表 / ERC20 / SPL Token
* ❌ 合约 ABI 解码
* ❌ 历史全量索引
* ❌ WebSocket 实时推送

---

## 8. 里程碑（Milestones）

### M1（MVP）

* 链配置 UI
* EVM + Anvil
* 区块 / Tx / 地址查询

### M2

* Solana Adapter
* 多链切换
* 最近区块列表

### M3

* WebSocket 支持
* Raw RPC 请求面板

---

## 9. 风险 & 现实判断（说实话）

* Solana 数据结构复杂，UI 不宜过度抽象
* “统一模型”一定会牺牲链特性
* Explorer 真正复杂的是 **索引，不是 UI**
* 你这个项目的价值在于：**调试体验，而不是数据完整性**

---

## 10. 后续可选演进（不写进 V1）

* 合约 ABI 解码（仅本地）
* Tx Replay / Trace
* 多节点对比
* RPC 请求录制（debug）

