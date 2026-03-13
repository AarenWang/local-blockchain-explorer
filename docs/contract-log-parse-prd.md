# 合约 Log 人工可读解析 PRD

## 1. 背景

当前浏览器可以展示原始交易输入、topics 和 data，但还不能把合约调用和事件日志转换成业务上可直接阅读的内容。对于代理合约和嵌套执行链路，这个问题尤其明显，例如 Safe 多签钱包交易。

本 PRD 使用的示例交易：
- 链：`ANVIL`
- 交易哈希：`0x5db480abe1b674f2b93fc641332190b13dfdf355e8f8abe3ae33cc0c98ea778b`
- 浏览器地址：`http://localhost:4173/chain/anvil/evm/tx/0x5db480abe1b674f2b93fc641332190b13dfdf355e8f8abe3ae33cc0c98ea778b`

这笔交易是一个典型的嵌套合约执行：
- 顶层调用目标是一个 Safe 代理钱包实例
- 顶层函数是 `execTransaction(...)`
- 内层调用目标是一个 ERC20 合约
- receipt 同时包含 ERC20 日志和 Safe 日志

如果解析器假设“一笔交易只需要一份 ABI”，就无法正确解释这种交易。

## 2. 目标

为本地区块链浏览器增加通用的合约 log 解析能力，使一笔交易可以被渲染为：
- 可读的业务摘要
- 解码后的调用结构
- 解码后的事件列表

## 3. 非目标

- 不是完整反编译器
- 不是交易 trace 模拟器
- 不是原始十六进制视图的替代品
- 第一阶段不做公链通用 ABI 自动发现服务

## 4. 示例交易涉及的合约与 ABI 文件

针对示例交易，本次需要的合约地址和 ABI 文件如下。

### 4.1 Safe 钱包实例
- 合约地址：`0xd6749831979447c1794E507Fd2b70785f4cF7585`
- 合约角色：Safe 代理钱包实例 / 顶层交易目标
- 逻辑实现地址：`0xff60B3E179c03e8fe4Ad2f1aB35aD6aDD713F202`
- 使用的 ABI：Safe 逻辑实现 ABI，不是 SafeProxy ABI
- ABI 文件：`safe-0xd6749831979447c1794e507fd2b70785f4cf7585.json`

### 4.2 ERC20 Token 合约
- 合约地址：`0xa51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`
- 合约角色：内层调用目标 / `Transfer` 日志发出方
- Token 符号：`USDT`
- ABI 文件：`docs/erc20-usdt-0xa51c1fc2f0d1a1b8494ed1fe312d7c3a78ed91c0.json`

## 5. 为什么一笔交易需要多份 ABI

对于一笔 EVM 交易，ABI 的选择不能只根据交易哈希，而必须根据“哪个合约拥有该函数或发出了该日志”来决定。

在本例中：
- 交易 input 属于 Safe 钱包地址，因此要用 Safe ABI 解码
- `execTransaction.data` 里的嵌套 calldata 属于 ERC20 合约，因此要用 ERC20 ABI 解码
- receipt 中由 `0xa51c...91c0` 发出的日志，必须用 ERC20 ABI 解码
- receipt 中由 `0xd674...7585` 发出的日志，必须用 Safe ABI 解码

规则：
- `tx.input` 按 `tx.to` 解析
- 每一条 `log` 按 `log.address` 解析
- 嵌套 calldata 按外层解码出的内层目标地址解析

## 6. 用户问题定义

用户打开交易详情页时，不应该还要自己去看 selector、topic hash 和原始 data 才能理解发生了什么。

浏览器应该直接回答这些问题：
- 调用了哪个合约？
- 执行了哪个函数？
- 是否存在嵌套调用？
- 哪些合约发出了日志？
- 哪个 token 从谁转给了谁，金额多少？
- Safe 执行是成功还是失败？

## 7. 功能需求

### 7.1 ABI 注册表
浏览器需要支持按 `chain + contract address` 查找 ABI 的能力。

必须支持：
- 按精确合约地址查 ABI
- 支持代理实例地址映射到逻辑实现 ABI
- 支持一笔交易参与多份 ABI 解析
- 支持针对单笔交易的 ABI override manifest，用于本地调试

建议查找顺序：
1. 单笔交易的 manifest override
2. 本地地址到 ABI 的静态注册表
3. 已知代理类型的实现地址映射
4. 如果找不到 ABI，则回退为原始十六进制显示

### 7.2 顶层 input 解码
浏览器必须能解码：
- 顶层 `tx.input`
- 函数 selector
- 命名参数
- 在有 metadata 时进行数值格式化

对本例，顶层解码结果应显示：
- 函数：`execTransaction`
- 内层目标地址：`0xa51c...91c0`
- 内层操作类型：`CALL`
- 内层数据 selector：ERC20 `transfer(address,uint256)`

### 7.3 嵌套 calldata 解码
如果某个函数解码后包含“目标地址 + bytes data”这种嵌套调用结构，浏览器应尝试进行二次解码。

第一阶段要求：
- 支持 Safe `execTransaction(address to, ..., bytes data, ...)` 这类常见模式

本例的预期输出：
- 内层目标合约：`USDT`
- 内层函数：`transfer(address,uint256)`
- 内层参数：
  - `to = 0xf39f...2266`
  - `value = 999000000`
  - 格式化金额 = `999 USDT`

### 7.4 日志解码
浏览器必须按 `log.address` 独立解码每一条日志。

每条日志在 UI 上应展示：
- 发出日志的合约地址
- 识别出的合约类型/标签
- 事件名称
- 解码后的字段
- 如有必要，区分 indexed 和 non-indexed 字段

本例中：
- 日志 1：ERC20 `Transfer`
  - from：Safe 钱包
  - to：owner 钱包
  - amount：`999 USDT`
- 日志 2：Safe `ExecutionSuccess`
  - txHash：`0x41c1f96b5df4ae3e6e34d1a38cc29f37a6f2ada5e8f6787fcf2ef91c5c58f376`
  - payment：`0`

### 7.5 人工可读摘要生成
浏览器应在原始明细上方生成一段紧凑的业务摘要。

本例的摘要示例：
- `Safe 钱包 0xd674...7585 执行了一笔 ERC20 转账，将 999 USDT 转给 0xf39f...2266，并发出了 ExecutionSuccess 事件。`

摘要生成应综合：
- 外层函数解码结果
- 内层函数解码结果
- 关键日志解码结果
- 交易最终状态

### 7.6 缺失 ABI 时的降级行为
如果 ABI 缺失或不完整：
- 仍然显示原始 selector/topic/data
- 显式标记为 `unknown ABI`
- 不隐藏任何原始值
- 支持后续补充 ABI 后重新解码

## 8. 数据模型要求

建议统一的解析结果结构如下：

```json
{
  "txHash": "0x...",
  "topLevelCall": {
    "to": "0x...",
    "contractType": "SAFE",
    "abiSource": ".../safe-...json",
    "function": "execTransaction",
    "args": {}
  },
  "nestedCalls": [
    {
      "target": "0x...",
      "contractType": "ERC20",
      "abiSource": ".../erc20-...json",
      "function": "transfer",
      "args": {}
    }
  ],
  "logs": [
    {
      "address": "0x...",
      "event": "Transfer",
      "contractType": "ERC20",
      "decoded": {}
    },
    {
      "address": "0x...",
      "event": "ExecutionSuccess",
      "contractType": "SAFE",
      "decoded": {}
    }
  ],
  "summary": "..."
}
```

## 9. UI 要求

### 9.1 交易详情页
在交易详情页中增加一个 `Decoded Contract Activity` 区块，位置应在原始日志附近或其上方。

区块应包含：
- 摘要卡片
- 顶层调用解码卡片
- 嵌套调用列表
- 解码后的日志列表
- 原始数据回退区块

### 9.2 日志展示
对于每条日志：
- 显示合约类型 badge，例如 `SAFE`、`ERC20`、`UNKNOWN`
- 显示事件名称
- 用 key/value 的方式展示解码后的字段
- 提供 raw topics/data 折叠区块

### 9.3 ABI 来源透明化
每个解码区块都应显示 ABI 来源：
- tx manifest
- 本地 registry
- implementation mapping
- 手工上传

这是排查错误解码的重要信息。

## 10. 解析流程

建议的解析流程：

1. 读取交易和 receipt。
2. 按 `tx.to` 解析顶层 ABI。
3. 解码顶层 input。
4. 如果顶层函数里存在“嵌套目标地址 + bytes payload”，则继续二次解码。
5. 对 receipt 中每条 log，按 `log.address` 找 ABI 并解码事件。
6. 组装统一的 parse result。
7. 渲染摘要和详细解码块。
8. 对所有未解码或部分解码的数据，保留 raw 值。

## 11. 本例的预期人工可读结果

本例应被解释为：
- 调用者 `0xf04c...79c7` 调用了 Safe 钱包 `0xd674...7585`
- Safe 执行了 `execTransaction(...)`
- Safe 的内层目标合约是 ERC20 合约 `0xa51c...91c0`
- 内层函数是 `transfer(address,uint256)`
- ERC20 转出了 `999 USDT`
- Token 从 Safe `0xd674...7585` 转给了 `0xf39f...2266`
- Safe 发出了 `ExecutionSuccess`
- Safe transaction hash 为 `0x41c1f96b5df4ae3e6e34d1a38cc29f37a6f2ada5e8f6787fcf2ef91c5c58f376`

## 12. 验收标准

### 第一阶段
- 给定本例交易，浏览器可以正确解码顶层 Safe 调用。
- 给定本例交易，浏览器可以正确解码内层 ERC20 `transfer` 调用。
- 给定本例交易，浏览器可以对 receipt 中两条日志分别使用正确 ABI 解码。
- UI 应明确展示本例使用了两份不同的 ABI。
- 如果移除其中一份 ABI 文件，其余部分仍可正常渲染，缺失部分自动回退到 raw 视图。

### 第二阶段
- 支持通用 contract registry，而不只是 tx-scoped manifest
- 支持更多代理合约家族
- 支持更深层级的递归嵌套调用解码
- 支持从 UI 手工上传 ABI

## 13. 实现说明

- 对 Safe 这类代理实例，ABI 应使用逻辑实现 ABI，而不是代理壳 ABI
- 解析器不能假设一笔交易只对应一种合约类型
- 解析器不能只依赖 `tx.to`；每条日志必须按 `log.address` 单独解码
- Token 金额格式化依赖 decimals 等 metadata
- 解析结果建议按 `chain + txHash + ABI version fingerprint` 做缓存

## 14. 架构设计决策

### 14.1 ABI 存储方案
**决策：第一阶段使用文件系统存储**

- ABI 文件存储位置：`data/abis/{chainId}/`
- 文件命名：`{contractAddress}.json` 或 `{contractType}-{contractAddress}.json`
- 第二阶段可扩展到数据库存储，支持动态注册
- 启动时加载所有 ABI 文件到内存，运行时热重载

**理由**：
- 简单、可移植，适合本地浏览器场景
- 开发调试方便，直接编辑 JSON 文件即可
- 避免数据库迁移复杂度

### 14.2 代理合约实现地址解析
**决策：优先使用 ABI 元数据中的 implementationAddress**

- ABI 文件包含 `implementationAddress` 字段时直接使用
- 如果缺失且需要链上查询，第二阶段支持：
  - EIP-1967 代理：查询 `0x360894a13ba1a3210667c828492db98dca3e2076cc` 存储槽
  - EIP-1167 最小代理：查询 `0x360894a13ba1a3210667c828492db98dca3e2076cc` 或 `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`

### 14.3 Token Metadata 管理
**决策：复用现有 ERC20 token 配置，扩展 ABI 元数据**

- 现有 `erc20-tokens` API 存储已知的 token 配置
- ABI 文件可包含 `symbol` 和 `decimals` 作为元数据
- 解码时优先级：ABI 元数据 > token registry > 链上查询（可选）

### 14.4 嵌套调用模式
**决策：可配置的嵌套调用模式识别**

```typescript
interface NestedCallPattern {
  contractType: string;           // SAFE, GnosisSafe, Diamond, etc.
  functionName: string;            // execTransaction, execute, etc.
  targetParamIndex: number;        // 目标地址参数位置
  dataParamIndex: number;          // calldata 参数位置
  operationParamIndex?: number;    // 操作类型参数位置（如 CALL/DELEGATECALL）
}
```

### 14.5 摘要生成策略
**决策：第一阶段使用结构化模板，第二阶段可扩展**

```typescript
interface SummaryTemplate {
  pattern: string;                 // 模板字符串，如 "{outerType} 执行了 {innerAction}..."
  requiredFields: string[];        // 必需字段
}
```

示例输出：
```
Safe 钱包 0xd674...7585 → 执行了 ERC20.transfer → 999 USDT 转给 0xf39f...2266
```

### 14.6 缓存策略
**决策：前端内存缓存 + localStorage 持久化**

```typescript
interface CacheKey {
  chainId: string;
  txHash: string;
  abiFingerprints: string[];      // 所用 ABI 的 hash 列表
}

interface CacheEntry {
  decoded: DecodedTransaction;
  timestamp: number;
  ttl: number;                     // 缓存过期时间
}
```

### 14.7 解码位置
**决策：第一阶段前端解码，第二阶段可后端优化**

- 前端解码：减少 API 调用，用户体验更流畅
- 可选后端解码 API：用于复杂场景或跨页面共享

---

## 15. 详细数据模型

### 15.1 ABI 注册表条目

```typescript
interface AbiEntry {
  contractAddress: string;        // 合约地址
  implementationAddress?: string; // 代理实现地址
  chain: string;                  // 链 ID
  contractType?: string;          // SAFE, ERC20, DEX, etc.
  symbol?: string;                // Token 符号
  decimals?: number;               // Token 精度
  abi: AbiItem[];                 // ABI 定义
  source?: string;                // ABI 来源（文档路径）
  version?: string;                // ABI 版本标识
  fingerprint?: string;           // ABI 内容 hash
}

type AbiItem =
  | { type: 'function'; name: string; inputs: Param[]; outputs?: Param[]; stateMutability: string; }
  | { type: 'event'; name: string; inputs: EventParam[]; anonymous?: boolean; }
  | { type: 'error'; name: string; inputs: Param[]; }
  | { type: 'constructor'; inputs: Param[]; stateMutability: string; };

interface Param {
  name: string;
  type: string;
  internalType?: string;
  components?: Param[];
}

interface EventParam extends Param {
  indexed: boolean;
}
```

### 15.2 解析结果结构

```typescript
interface DecodedTransaction {
  txHash: string;
  chainId: string;
  summary?: string;               // 业务摘要
  topLevelCall: DecodedCall | null;
  nestedCalls: DecodedCall[];
  logs: DecodedLog[];
  errors: ParseError[];
  abiSources: Record<string, string>; // contractAddress -> ABI source
}

interface DecodedCall {
  level: number;                   // 嵌套层级（0 = 顶层）
  targetAddress: string;
  contractType?: string;
  contractLabel?: string;         // 如 "USDT Token"
  functionName: string;
  functionSignature: string;       // 完整签名
  args: DecodedArgument[];
  abiSource: string;
  abiFingerprint?: string;
  success?: boolean;
}

interface DecodedArgument {
  name: string;
  type: string;
  value: any;
  valueFormatted?: string;         // 格式化后的值（如金额）
  isIndexed?: boolean;            // 对于日志参数
  nestedCalls?: DecodedCall[];    // 嵌套调用
}

interface DecodedLog {
  index: number;                  // 日志索引
  address: string;
  contractType?: string;
  contractLabel?: string;
  eventName: string;
  eventSignature: string;
  args: DecodedArgument[];
  abiSource: string;
  raw: {
    topics: string[];
    data: string;
  };
}

interface ParseError {
  level: 'error' | 'warning' | 'info';
  location: 'input' | 'log' | 'nested';
  address?: string;
  message: string;
}
```

---

## 16. 第一阶段实现范围（MVP）

### 16.1 后端/API 层
- [x] 现有 `/api/erc20-tokens` 已有
- [ ] `GET /api/contract-abi/:chainId/:address` - 获取 ABI
- [ ] `POST /api/contract-abi` - 注册/更新 ABI
- [ ] `DELETE /api/contract-abi/:chainId/:address` - 删除 ABI

### 16.2 前端核心模块
1. **`src/data/abiRegistry.ts`** - ABI 注册表
   - 加载 `data/abis/` 目录下的 ABI 文件
   - 按地址查找 ABI
   - 代理合约地址映射

2. **`src/data/abiDecoder.ts`** - 解码引擎
   - 使用 ethers.js `Interface` 解码
   - 支持嵌套调用解码
   - 格式化数值（金额、地址等）

3. **`src/components/DecodedTxView.tsx`** - 解码结果展示组件
   - 摘要卡片
   - 函数调用列表
   - 日志事件列表

4. **`src/pages/EvmTxPage.tsx`** - 增强
   - 集成解码逻辑
   - 添加 `Decoded Contract Activity` 区块

### 16.3 UI 展示要求
```
┌─────────────────────────────────────────────────────┐
│ Transaction Details                                  │
├─────────────────────────────────────────────────────┤
│ Hash: 0x5db...                                      │
│ Status: Success                                     │
│ From: 0xf04c...79c7  To: 0xd674...7585              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 📊 Decoded Contract Activity                        │
├─────────────────────────────────────────────────────┤
│ 📝 Summary                                          │
│ Safe 0xd674...7585 → execTransaction → ERC20.transfer │
│ 999 USDT → 0xf39f...2266                           │
├─────────────────────────────────────────────────────┤
│ 🔵 Call Chain                                       │
│ ┌─ Level 0 ──────────────────────────────────────┐ │
│ │ Target: SAFE 0xd674...7585                     │ │
│ │ Function: execTransaction(address,uint256,...) │ │
│ │ ABI: local registry                            │ │
│ └─────────────────────────────────────────────────┘ │
│   ┌─ Level 1 ────────────────────────────────────┐ │
│   │ Target: ERC20 USDT 0xa51c...91c0             │ │
│   │ Function: transfer(address,uint256)           │ │
│   │   to: 0xf39f...2266                          │ │
│   │   value: 999000000 (999 USDT)                │ │
│   └───────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ 📋 Logs (2 decoded)                                 │
│ ┌─ [ERC20] Transfer #0 ──────────────────────────┐ │
│ │ from: 0xd674...7585                            │ │
│ │ to: 0xf39f...2266                              │ │
│ │ value: 999000000 (999 USDT)                    │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─ [SAFE] ExecutionSuccess #1 ───────────────────┐ │
│ │ txHash: 0x41c1...f376                          │ │
│ │ payment: 0                                     │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Logs (Raw) [▼]                                      │
└─────────────────────────────────────────────────────┘
```

### 16.4 第一阶段验收标准
- [ ] 示例交易可正确解码顶层 Safe `execTransaction` 调用
- [ ] 示例交易可正确解码内层 ERC20 `transfer` 调用
- [ ] 示例交易的两条日志分别用正确 ABI 解码
- [ ] UI 明确展示使用的 ABI 来源
- [ ] 移除任一 ABI 文件后，对应部分回退到 raw 视图
- [ ] Token 金额正确格式化（考虑 decimals）
- [ ] 缓存机制工作正常

---

## 17. 第二阶段扩展（可选）

- [ ] 支持从 UI 手工上传 ABI
- [ ] 支持更多代理合约类型（EIP-1167, Diamond, etc.）
- [ ] 支持更深层递归嵌套
- [ ] 后端解码 API（用于复杂场景）
- [ ] 智能摘要生成（基于模板或 LLM）【跳过 不做】
- [ ] 多语言支持 【跳过不做】
- [ ] ABI 导入/导出功能 
