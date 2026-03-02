# 本地区块链浏览器

[English](README.md) | 简体中文

一款强大的本地区块链浏览器，用于监控和检查 EVM 和 Solana 链。非常适合使用 Anvil、Hardhat 或 Solana Test Validator 等本地测试网的开发者。

![首页](docs-image/home-page.png)

## 功能特性

### 区块与交易浏览
- **实时区块监控** - 查看最新区块，包括交易数量、时间戳和矿工信息
- **交易详情** - 检查交易哈希、发送/接收地址、Gas 使用情况和状态
- **分页支持** - 通过"加载更多"功能浏览历史数据

### 多链支持
- **EVM 链** - 支持 Ethereum、Anvil、Hardhat、Foundry 和其他 EVM 兼容链
- **Solana** - 支持 Solana 本地测试网和主网
- **便捷切换** - 直接在 UI 上切换不同的链

### 钱包与代币管理
- **HD 钱包派生** - 从单个助记词派生多个钱包
- **余额追踪** - 查看原生代币和 ERC20 代币余额
- **SPL 代币支持** - 追踪 Solana SPL 代币
- **基于角色的组织** - 按角色/项目组织钱包

![钱包页面](docs-image/wallet-page.png)

### 地址与交易标签
- **自定义标签** - 为地址和交易添加自定义名称和颜色
- **快速识别** - 轻松识别你的钱包和重要交易
- **标签管理** - 在一个地方查看和管理所有标签

![标签弹窗](docs-image/tag-modal.png)

### 索引器服务
- **自动数据收集** - 索引器自动追踪区块和交易
- **暂停/恢复控制** - 对未运行的链暂停索引
- **历史数据** - 配置从创世区块或最近区块开始回填
- **快速查询** - 使用 SQLite + Redis 实现快速数据检索

## 快速开始

```bash
# 安装依赖
npm install

# 启动 Redis（用于缓存）
brew services start redis  # macOS
# 或: docker run -d -p 6379:6379 redis

# 启动索引器后端
npm run indexer:dev

# 启动浏览器 UI（在新终端）
npm run dev
```

访问：
- 浏览器 UI: `http://localhost:5173`
- 索引器 API: `http://localhost:7070`

## 使用指南

### 配置链

进入 **配置** 页面添加你的链：

1. 点击 **+ 添加链**
2. 选择链类型（EVM 或 Solana）
3. 输入 RPC URL（例如 Anvil 的 `http://localhost:8545`）
4. 添加 ERC20/SPL 代币地址以追踪余额
5. 测试连接并保存

![配置页面](docs-image/config-page.png)

### 搜索与浏览

- **搜索栏** - 按区块号、交易哈希或地址搜索
- **首页** - 查看最新区块和交易，支持分页
- **点击项目** - 查看详细信息

![区块详情](docs-image/block-detail.png)

### 管理钱包

1. 进入 **钱包** 页面
2. 使用助记词创建角色
3. 设置派生路径（EVM 默认：`m/44'/60'/0'/0`）
4. 查看派生地址的余额

### 暂停/恢复索引

如果测试链已停止，暂停索引以避免错误：

1. 进入 **配置** 页面
2. 找到对应的链，点击 **⏸ 暂停**
3. 链恢复运行后，点击 **▶ 恢复**

## 默认配置

默认情况下，浏览器连接到：

| 链 | 类型 | RPC URL |
|-----|------|---------|
| Anvil 本地 | EVM | http://localhost:8545 |
| Solana 本地 | Solana | http://localhost:8899 |

## 配置选项

设置环境变量来自定义行为：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接地址 |
| `SQLITE_PATH` | `./data/indexer.db` | 数据库文件路径 |
| `INDEXER_API_PORT` | `7070` | API 服务器端口 |
| `BACKFILL_FROM_GENESIS` | `true` | 从区块 0 开始索引 |

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动浏览器 UI |
| `npm run indexer:dev` | 启动索引器服务 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |

## API 端点

索引器在 `http://localhost:7070` 提供 REST API：

- `GET /chains` - 列出所有链
- `GET /chain/:id/evm/blocks` - 获取 EVM 区块（支持 `?limit=50&offset=0`）
- `GET /chain/:id/evm/txs` - 获取 EVM 交易
- `GET /chain/:id/evm/address/:address/txs` - 获取地址交易
- `POST /chain/:id/pause` - 暂停索引
- `POST /chain/:id/resume` - 恢复索引
- `GET /roles` - 列出钱包角色
- `GET /tags` - 列出所有标签
- `PUT /tags` - 创建/更新标签

## 技术栈

- **前端**: React + Vite + TypeScript
- **后端**: Node.js + Express
- **数据库**: SQLite（数据存储）+ Redis（缓存）
- **样式**: CSS 深色主题

## 许可证

MIT
