下面给您一份**可直接开 repo 的 Monorepo 目录结构**（偏“vibe code 但可长期演进”），目标是：

* 前端 Explorer（React/Next/Vite 都行）
* 可选 Node 代理（解决 CORS / 统一请求 / WS）
* 统一多链 Adapter（EVM/Solana 插件化）
* 配置持久化（localStorage/IndexedDB）
* 可加 E2E / Playwright

---

## Monorepo（pnpm / turborepo 风格）

```txt
local-chain-explorer/
├─ README.md
├─ LICENSE
├─ pnpm-workspace.yaml
├─ package.json                 # root scripts: dev/build/test/lint
├─ turbo.json                   # 可选：turborepo
├─ .gitignore
├─ .env.example

├─ apps/
│  ├─ web/                      # 浏览器 UI（核心）
│  │  ├─ package.json
│  │  ├─ index.html             # Vite 方案；若 Next 则替换
│  │  ├─ vite.config.ts
│  │  ├─ public/
│  │  └─ src/
│  │     ├─ main.tsx
│  │     ├─ app/
│  │     │  ├─ router.tsx       # routes: /config /block/:id /tx/:id /address/:id
│  │     │  ├─ layout.tsx       # TopBar + ChainSwitcher + SearchBar
│  │     │  └─ providers.tsx    # QueryClient/Theme/Toast/ConfigStore
│  │     ├─ pages/
│  │     │  ├─ ConfigPage/
│  │     │  ├─ BlockPage/
│  │     │  ├─ TxPage/
│  │     │  └─ AddressPage/
│  │     ├─ components/
│  │     │  ├─ TopBar/
│  │     │  ├─ ChainPicker/
│  │     │  ├─ SearchBar/
│  │     │  ├─ KeyValueTable/
│  │     │  ├─ JsonViewer/
│  │     │  ├─ CopyButton/
│  │     │  └─ Loading/
│  │     ├─ state/
│  │     │  ├─ configStore.ts   # chain configs + active chain (zustand/redux)
│  │     │  └─ uiStore.ts
│  │     ├─ data/
│  │     │  ├─ adapters.ts      # 选择当前 ChainAdapter
│  │     │  ├─ queries/         # react-query hooks
│  │     │  │  ├─ useChainStatus.ts
│  │     │  │  ├─ useBlock.ts
│  │     │  │  ├─ useTx.ts
│  │     │  │  └─ useAddress.ts
│  │     │  └─ rpc/
│  │     │     ├─ fetchJsonRpc.ts
│  │     │     └─ errors.ts
│  │     ├─ styles/
│  │     └─ utils/
│  │        ├─ detectInputType.ts  # hash/address/block/slot 识别
│  │        ├─ format.ts
│  │        └─ validators.ts
│  │
│  └─ proxy/                    # 可选：Node 代理（本地 RPC 聚合/CORS）
│     ├─ package.json
│     ├─ src/
│     │  ├─ index.ts            # http server
│     │  ├─ routes/
│     │  │  ├─ rpc.ts           # POST /rpc/:chainId -> forward
│     │  │  └─ health.ts
│     │  ├─ middlewares/
│     │  │  ├─ cors.ts
│     │  │  └─ logging.ts
│     │  └─ config/
│     │     └─ load.ts          # 从 env 或文件读取
│     └─ .env.example
│
├─ packages/
│  ├─ core/                     # 跨 app 的领域模型 + Adapter 接口
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ types/
│  │     │  ├─ chain.ts         # ChainType, ChainConfig, ChainStatus
│  │     │  ├─ block.ts         # UnifiedBlock + chain-specific extension
│  │     │  ├─ tx.ts
│  │     │  └─ address.ts
│  │     ├─ adapter/
│  │     │  ├─ ChainAdapter.ts  # interface
│  │     │  ├─ errors.ts
│  │     │  └─ normalize.ts     # 统一字段（可选）
│  │     └─ index.ts
│  │
│  ├─ adapter-evm/              # EVM JSON-RPC 实现
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ EvmAdapter.ts
│  │     ├─ evmRpc.ts           # eth_* 调用封装
│  │     ├─ decode.ts           # 可选：hex/wei 格式化
│  │     └─ index.ts
│  │
│  ├─ adapter-solana/           # Solana JSON-RPC 实现
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ SolanaAdapter.ts
│  │     ├─ solanaRpc.ts        # getSlot/getBlock/getTx...
│  │     ├─ parse.ts            # 可选：指令解析
│  │     └─ index.ts
│  │
│  ├─ storage/                  # 配置持久化（localStorage/IndexedDB）
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ ConfigRepo.ts       # interface
│  │     ├─ LocalStorageRepo.ts
│  │     ├─ IndexedDbRepo.ts    # 可选
│  │     └─ index.ts
│  │
│  └─ ui-kit/                   # 可选：复用组件库（后期再拆）
│     ├─ package.json
│     └─ src/
│        ├─ components/
│        └─ index.ts
│
├─ tooling/
│  ├─ eslint-config/
│  ├─ tsconfig/
│  └─ scripts/
│     ├─ dev-anvil.sh           # 一键起本地链
│     └─ dev-solana.sh
│
├─ configs/
│  ├─ chains.sample.json        # 可选：默认链配置（导入）
│  └─ app.defaults.json
│
├─ tests/
│  ├─ e2e/                      # Playwright
│  └─ fixtures/
│
└─ docker/
   ├─ docker-compose.yml        # 可选：web + proxy
   └─ README.md
```

---


## 路由与 URL 约定（Chain-specific）

统一前缀使用 chainId（来自配置），保证多链切换稳定：

```
/config
/chain/:chainId/home

/chain/:chainId/evm/block/:number
/chain/:chainId/evm/tx/:hash
/chain/:chainId/evm/address/:address

/chain/:chainId/solana/slot/:slot
/chain/:chainId/solana/tx/:signature
/chain/:chainId/solana/account/:address

/chain/:chainId/tron/block/:number
/chain/:chainId/tron/tx/:txid
/chain/:chainId/tron/address/:address

/chain/:chainId/bitcoin/block/:height
/chain/:chainId/bitcoin/tx/:txid
/chain/:chainId/bitcoin/address/:address
```

说明：

* 统一 `chainId` 表示用户配置的链实例（不是链上 chainId）。
* 同链不同网络（anvil / hardhat / regtest）也走不同 `chainId`。

---
## 关键设计点（您这类项目最容易踩坑的地方）

### 1) `packages/core` 一定要有

否则 UI、Adapter、存储会互相引用，后期很难拆。

### 2) Adapter 拆包，而不是塞在 web 里

您后面要加 TRON / Sui / Aptos 时，直接 `packages/adapter-tron` 就行。

### 3) `apps/proxy` 先留着

本地 RPC 经常遇到：

* 浏览器 CORS
* WS 转发
* 多链统一入口
  有 proxy 会让体验平滑很多（但 MVP 可不启用）。

---

## root scripts（建议）

* `pnpm dev`：同时起 `apps/web`（+可选 proxy）
* `pnpm lint` / `pnpm test`

---

前端用 **Vite + React** 


