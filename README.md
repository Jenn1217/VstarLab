# 财析入微 (Fintech Agentic Platform)

**“财析入微”** 是一款专注于银行账务处理、传票排查与历史交易分析的智能金融应用平台。该项目以大语言模型 (LLM) 和知识库 (RAG) 为底座，结合本地结构化关系型数据库，不仅可以针对银行专业语汇提供自然语言到 SQL 的智能查询能力（Text-to-SQL），也支持复杂的系统间对账、分户/总账不平分析与智能流程追踪。

<img width="2940" height="1604" alt="image" src="https://github.com/user-attachments/assets/9f192742-c08a-4683-832e-a641b58fe2b9" />

<img width="2940" height="1604" alt="image" src="https://github.com/user-attachments/assets/6cf44d0f-25b9-4d78-9b81-731cff1acb1e" />

<img width="2940" height="1604" alt="image" src="https://github.com/user-attachments/assets/0bb6ca24-a480-408c-bbee-b1ccde57ad90" />


---

## 🌟 核心功能特性

### 1. 🤖 AI 问答助手 (Smart Q&A)
- **自然语言查数**：通过智能意图路由与白名单约束机制，让用户能够通过聊天的方式直接查询底层 `acct_bal_new2`（分户账）、`vchr_hist`（传票历史）等结构化数据。
- **多模型支持**：无缝对接云端标准模型（DeepSeek API）和基于 vLLM 本地化部署的微调金融开源大模型。
- **文智与数智双核驱动**：区分发散性知识查询（文智）和强聚合金融数据分析逻辑（数智），自动提取图表以做可视化（TrendChart）展示。

### 2. 📊 账务不平分析 (Discrepancy Analysis)
- **多维度总分核对**：自动过滤、高亮并监控 `recon_bal`（总分不平表）中的错账差额。
- **AI 智能溯源分析**：当发现总分账目不平，系统提供一键“分析”功能，自动追踪该机构、科目在特定交易日的流转明细与传票情况，检查冲正、重复日记账等导致账户倒挂的异常原因，输出详尽排查报告。

### 3. 🏦 核心数据表查询视图 (Raw Data Query)
- 免写 SQL 脚本，即时在控制台分页速查四大核心数据库表的内容：
  - `acct_bal_new2`：分户余额表
  - `vchr_hist`：传票历史表
  - `txn_hist`：交易历史表
  - `recon_bal`：总分不平核对表
- 支持按账号、机构号、科目号、起止日期四维度正交检索。

### 4. 📚 知识库问答 (Knowledge Base)
- 支持嵌入专业业务课件（如《商业银行会计实务》）、操作守则与监管 PDF。
- 为智能问答的大模型提供专业的向量检索（RAG），生成包含 `[1]` 格式来源标注与悬浮弹窗溯源提示的引用回复。

---

## 🛠️ 技术栈与架构 (Tech Stack)

### 前端 (Frontend)
- **框架库**：React + TypeScript + Vite ⚡
- **样式方案**：Tailwind CSS (响应式与现代化毛玻璃 UI)
- **核心组件**：Lucide React (图标) + React Markdown (带引用与代码块增强的渲染器)

### 后端 (Backend)
- **框架**：FastAPI (Python) 异步 Web 框架
- **大模型通信**：Requests、SSE (Server-Sent Events) 流式推送机制
- **数据库**：MySQL (本地 `local_fintech` 库，字符集 `utf8mb4`)
- **ORM 与驱动**：SQLAlchemy (`SessionLocal`) + PyMySQL

---
## 🚀 快速启动指南 (Getting Started)

### 1. 数据库准备 (MySQL)
确保本地已安装运行 MySQL（端口 3306），然后创建名为 `local_fintech` 的数据库。接着导入提供的初始数据表结构及数据（包含前述 4 张表）。

### 2. 后端服务启动与前端界面启动

我们提供了一键脚本以简化环境配置与启动流程。

首先，在项目根目录下运行安装脚本，这会自动配置后端 Python 依赖和前端 NPM 依赖：
```bash
bash install.sh
```

> **配置文件**：请务必确认后端根目录 (`backend/`) 存在 `.env` 文件，其中配置了：
> `DATABASE_URL="mysql+pymysql://<user>:<password>@127.0.0.1:3306/local_fintech?charset=utf8mb4"`

安装完成后，您可以选择以下两种模式运行项目：

**开发模式 (Development Mode)**：
前端和后端将并行启动，支持热更新（Hot Reload）。
```bash
bash dev.sh
```

**生产模式 (Production Mode)**：
自动构建前端静态资源并由 FastAPI 托管，以单个服务的形式运行。
```bash
bash prod.sh
```

### 3. 前端界面启动
进入 `frontend/` 目录：
```bash
cd frontend

# 安装前端 NPM 依赖
npm install

# 启动开发服务器，默认监听 3000(或其它可用) 端口
npm run dev
```

> **或者使用一键脚本**：
> 根目录提供了并行的 `bash dev.sh` 或运行脚本可快速串联前后端运行。

---

## ⚠️ Git 提交须知 (Troubleshooting)
由于当前工程中的 `backend/models` 下载了近 G 级别的安全张量模型文件 (`*.safetensors`) 和环境二进制包 (`libtorch`)，普通 HTTP 的 `git push` 会因触发 Github 的 `100MB` 文件容量限制（fatal: the remote end hung up unexpectedly）而失败。

如果需要推送至云端仓库，请：
1. **使用 Git LFS** (Large File Storage) 来追踪 `*.safetensors` 与 `*.dylib`。
2. 或在 `.gitignore` 当中补充 `/backend/models/*` 以及 `/backend/venv/*` 和 `*.pdf`，仅提交核心代码。
