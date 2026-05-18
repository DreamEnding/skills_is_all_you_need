# Skill Usage Manager

本项目是一个本地优先的 Claude Code / Codex Skills 使用统计与管理工具。它包含一个 hook ingest CLI、一个 SQLite 数据库、一个 Tauri + React 桌面看板，以及一个通用插件包。

目标是：安装插件后，后续 Claude Code / Codex 的 Skill 调用会由后台 hook 自动捕获并写入本地数据库；不需要先启动桌面看板，也不需要手动运行 import 才能看到新增计数。

## 当前能力

- `skill-meter hook ingest --platform claude|codex` 从 stdin 读取 hook payload，立即写入 SQLite，并同步追加 JSONL 队列作为审计和补导入兜底。
- `skill-meter summary --format table|json` 汇总 Skill、平台、置信度和调用次数。
- `skill-meter scan --format table|json` 扫描本机 Claude Code 和 Codex Skill 根目录，生成 Skill 清单。
- 桌面看板支持中英双语、用量概览、Skill 清单、扫描和导入。
- Claude Code 计数覆盖模型 `Skill` 工具调用和直接 `/skill` 调用。
- Codex 计数覆盖显式 `$skill` 提示，以及 `Stop` hook transcript 中读取 `SKILL.md` 的推断调用。

## 仓库结构

```text
crates/core/                 Rust 核心库：数据库、事件解析、扫描、汇总
crates/hook-ingest/          skill-meter CLI：hook ingest、summary、scan、doctor
apps/desktop/                Tauri + React 桌面看板
plugins/universal/           Claude Code / Codex 通用插件包
docs/                        设计、架构和交接记录
```

## 数据流

```text
Claude Code / Codex hook
  -> skill-meter hook ingest --platform <platform>
  -> parse hook payload
  -> append ~/.skill-usage-manager/events/YYYYMMDD.jsonl
  -> insert ~/.skill-usage-manager/usage.db
  -> dashboard / summary reads SQLite
```

JSONL 队列仍然保留，因为它适合排障、审计和未来补导入。SQLite 是看板和 CLI summary 的实时读取来源。

## 安装与运行

### 1. 构建 CLI

```bash
cargo build --release -p skill-meter
```

确保 `target/release` 在 `PATH` 中，或者把 `skill-meter` 二进制复制到一个已在 `PATH` 中的目录。hook 由 Claude Code / Codex 后台调用，所以它必须能直接找到 `skill-meter`。

### 2. 安装插件

插件位于：

```text
plugins/universal
```

Claude Code 使用 `plugins/universal/hooks/hooks.json`，其中包含：

- `PreToolUse` + `matcher: Skill`
- `UserPromptExpansion`

Codex 使用 `plugins/universal/hooks/codex-hooks.json`，其中包含：

- `UserPromptSubmit`
- `Stop`

Codex 插件 manifest 已指向该 hooks 文件：

```json
"hooks": "./hooks/codex-hooks.json"
```

安装或刷新插件后，启动新的 Claude Code / Codex 会话即可开始后台计数。桌面看板不需要常驻。

### 3. 检查 hook 健康状态

```bash
skill-meter doctor
```

输出会显示数据目录、队列文件数、数据库是否存在，以及 ingest 错误数量。

### 4. 查看统计

```bash
skill-meter summary
skill-meter summary --format json
skill-meter summary --platform claude
skill-meter summary --platform codex
```

### 5. 扫描本地 Skills

```bash
skill-meter scan
skill-meter scan --format json
```

扫描结果用于桌面清单。它不会修改 Skill 文件。

### 6. 启动桌面看板

```bash
pnpm --dir apps/desktop install
pnpm --dir apps/desktop dev
```

构建生产包：

```bash
pnpm --dir apps/desktop build
cargo build -p skill-usage-desktop
```

## 数据位置

默认数据目录：

```text
~/.skill-usage-manager/
```

主要文件：

```text
usage.db                 SQLite 主数据库
events/*.jsonl           hook 事件审计队列
ingest-errors/           预留错误文件目录
```

测试或本地实验可以覆盖数据目录：

```bash
SKILL_USAGE_MANAGER_HOME=/tmp/skill-meter-dev skill-meter summary
```

PowerShell 示例：

```powershell
$env:SKILL_USAGE_MANAGER_HOME="D:\tmp\skill-meter-dev"
skill-meter summary
```

## 计数规则

| 平台 | 来源 | 置信度 | 说明 |
| --- | --- | --- | --- |
| Claude Code | `PreToolUse` + `Skill` | `confirmed` | 模型实际调用 Skill 工具 |
| Claude Code | `UserPromptExpansion` | `confirmed` | 用户直接输入 `/skill` |
| Codex | `UserPromptSubmit` 中的 `$skill` | `explicit-hint` | 用户明确提示使用某 Skill |
| Codex | `Stop` transcript 中读取 `*/SKILL.md` | `inferred` | Codex 当前没有稳定的 Skill 专用调用事件，因此从 transcript 推断 |

同一 Skill 在同一会话中多次调用会分别计数。重复导入同一条 JSONL 事件不会重复计数。

## 隐私策略

- 数据只写入本机 SQLite 和 JSONL 文件。
- 默认不上传任何统计数据。
- 数据库保存 Skill 名称、平台、置信度、调用时间和哈希化 session 标识。
- Codex transcript 解析只抽取 `SKILL.md` 路径中的 Skill 名称，不把 prompt 或 transcript 正文写入数据库。

## 开发命令

```bash
cargo test
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --all
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

常用 CLI 开发命令：

```bash
cargo run --bin skill-meter -- doctor
cargo run --bin skill-meter -- scan --format json
cargo run --bin skill-meter -- summary --format json
```

模拟 Claude Code hook：

```bash
echo '{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Skill","tool_input":{"skill":"research-lit"}}' \
  | cargo run --bin skill-meter -- hook ingest --platform claude
```

模拟 Codex hook：

```bash
echo '{"type":"UserPromptSubmit","session_id":"s2","prompt":"please use $research-lit"}' \
  | cargo run --bin skill-meter -- hook ingest --platform codex
```

## 排障

### 统计没有增加

1. 确认 `skill-meter` 在 `PATH` 中：

   ```bash
   skill-meter doctor
   ```

2. 确认插件 hook 文件已被安装或加载。
3. 新开一个 Claude Code / Codex 会话再触发 Skill。
4. 查看 `skill-meter doctor` 的 `ingest errors`。
5. 查看 `~/.skill-usage-manager/events/` 是否有新的 JSONL 文件。

### Codex 没有捕获到 inferred 调用

Codex 的 confirmed Skill 专用 hook 仍不可用。当前实现依赖 `Stop` hook 提供 transcript 路径，并从 transcript 中识别读取过的 `*/SKILL.md`。如果某个 Codex 版本没有向 hook payload 提供 transcript，仍可捕获 `$skill` 显式提示，但不会产生 transcript 推断事件。

### Dashboard 中清单为空

先运行：

```bash
skill-meter scan --format json
```

如果 CLI 能扫描到而看板不能扫描，通常是桌面运行环境找不到同一组 HOME / USERPROFILE 路径，或 Tauri invoke 运行失败。看板在浏览器预览模式下会使用安全降级路径，生产 Tauri 环境会调用真实扫描命令。

## 已知限制

- Enable / disable Skill 的配置写入仍在开发中。
- Codex 事件的 `inferred` 统计是推断，不等价于 Claude Code 的 confirmed hook。
- 插件安装自动化命令仍待完善；当前需要按 Claude Code / Codex 的插件安装方式加载 `plugins/universal`。
- 历史数据库中旧版本生成的 dedupe key 不会重写；新事件会使用包含事件时间的 dedupe key。

## 设计文档

- `docs/AGENT_HANDOFF.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/RESEARCH_NOTES.md`
