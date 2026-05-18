# Skill Usage Manager

[English](README.md) | [中文](README_CN.md)

统计你的本地 Agent 到底用了哪些 Skills。

Skill Usage Manager 会把 Claude Code 和 Codex 的 Skill 调用记录到本地 SQLite 数据库，并通过桌面看板展示使用统计和 Skill 清单。它适合已经安装了很多 Skills、想知道哪些真的在用、哪些长期闲置、哪些重复的人。

## 它能做什么

- 后台统计 Claude Code 的 Skill 调用。
- 后台统计 Codex 的 Skill 使用信号。
- 扫描本机 Claude Code 和 Codex 的 Skill 目录。
- 在看板中直接启用/禁用 Skill。
- 提供中英双语桌面看板，展示使用概览和 Skill 清单。
- 提供 cc-switch 风格的管理面板 GUI，支持毛玻璃效果和流畅动画。
- 默认所有数据只保存在本地。
- 不需要一直打开桌面看板，hook 也会继续计数。

## 快速开始

安装 CLI：

```bash
cargo install --git https://github.com/DreamEnding/skills_is_all_you_need --package skill-meter --locked
```

确认命令可用：

```bash
skill-meter --version
skill-meter doctor
```

安装 Claude Code 插件：

```bash
claude plugin marketplace add DreamEnding/skills_is_all_you_need
claude plugin install skill-usage-manager@skills-is-all-you-need
```

安装 Codex 插件 marketplace：

```bash
codex features enable plugin_hooks
codex plugin marketplace add DreamEnding/skills_is_all_you_need
```

安装 hooks 后，重启 Claude Code 或 Codex。之后新的 Skill 调用会自动写入本地数据库。

## 日常使用

查看使用统计：

```bash
skill-meter summary
skill-meter summary --format json
```

扫描已安装 Skills：

```bash
skill-meter scan
skill-meter scan --format json
```

检查 hook 和数据库状态：

```bash
skill-meter doctor
```

从源码运行桌面看板：

```bash
git clone https://github.com/DreamEnding/skills_is_all_you_need.git
cd skills_is_all_you_need
pnpm --dir apps/desktop install
pnpm --dir apps/desktop dev
```

构建 Windows 桌面安装器：

```bash
cargo tauri build
```

会在 `target/release/bundle/` 下生成 NSIS 安装包和 MSI 安装包。

## 管理面板

应用包含第二个窗口——**Skill Manager** 管理面板，设计参考了 [cc-switch](https://github.com/farion1231/cc-switch)。提供以下功能：

- **概览** — 指标卡片、动态柱状图、平台占比。
- **技能** — 分组卡片式 Skill 列表，一键切换开关，支持展开多位置详情。
- **诊断** — 钩子健康检查、启用/禁用状态摘要、平台分布表格。
- **设置** — 通用、数据存储和关于页面。

采用毛玻璃卡片设计、Framer Motion 弹簧动画、深色/浅色主题切换、中英双语支持。

## 会统计哪些调用

| 平台 | 信号 | 置信度 |
| --- | --- | --- |
| Claude Code | `Skill` 工具的 `PreToolUse` hook | `confirmed` |
| Claude Code | 直接 `/skill` 调用 | `confirmed` |
| Codex | prompt 里的 `$research-lit` 这类显式提示 | `explicit-hint` |
| Codex | transcript 中读取过的 `*/SKILL.md` | `inferred` |

Claude Code 有直接的 Skill hook，所以统计置信度更高。Codex 当前没有等价的稳定 Skill 专用 hook，因此 Codex 事件会带置信度标签。

## 数据保存位置

默认所有数据都保存在本机：

```text
~/.skill-usage-manager/
  usage.db
  events/*.jsonl
```

测试时可以临时换一个数据目录：

```bash
SKILL_USAGE_MANAGER_HOME=/tmp/skill-meter-dev skill-meter summary
```

PowerShell：

```powershell
$env:SKILL_USAGE_MANAGER_HOME="D:\tmp\skill-meter-dev"
skill-meter summary
```

## 隐私

- 本项目不发送遥测。
- 事件只写入本地 SQLite 和 JSONL 文件。
- session 标识会被哈希化。
- Codex transcript 解析只从 `SKILL.md` 路径中提取 Skill 名称，不保存 transcript 正文。

## 让 Agent 帮你安装

如果你想把安装任务交给另一个 AI coding agent，直接把 [AGENT_INSTALL.md](AGENT_INSTALL.md) 丢给它。里面有可复制的安装任务和验证步骤。

## 排障

### 找不到 `skill-meter`

确认 Cargo 的 bin 目录在 `PATH` 中：

```bash
echo $PATH
```

常见位置：

- macOS/Linux：`~/.cargo/bin`
- Windows：`%USERPROFILE%\.cargo\bin`

### 计数没有增加

先运行：

```bash
skill-meter doctor
```

然后检查：

- `skill-meter` 是否在 `PATH` 中。
- 插件是否已安装并启用。
- 安装 hook 后是否重启了 Claude Code 或 Codex。
- `ingest errors` 是否为 `0`。

### Codex 只显示 `explicit-hint`

Codex 的 inferred 统计依赖 `Stop` hook 提供 transcript 路径。如果某个 Codex 版本没有提供 `transcript_path`，就只能统计 prompt 中显式出现的 `$skill` 提示。

## 开发

克隆并验证：

```bash
git clone https://github.com/DreamEnding/skills_is_all_you_need.git
cd skills_is_all_you_need
cargo test
cargo clippy --all-targets --all-features -- -D warnings
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

## 技术栈

- Rust CLI 和核心库
- SQLite，使用 `rusqlite`
- Tauri 2 桌面外壳
- React + TypeScript + Vite 看板
- Framer Motion 动画
- Tailwind CSS v4
- Claude Code 和 Codex plugin hooks

## 状态

版本：`1.0.0`

已实现：

- 后台 hook ingest
- 本地使用数据库
- Claude 和 Codex 使用信号捕获
- Skill 清单扫描
- 中英双语看板
- public plugin marketplace 元数据
- 在看板里启用/禁用 Skill
- cc-switch 风格管理面板 GUI
- Windows 桌面安装器（NSIS + MSI）
- 深色/浅色主题
- 配置变更审计日志

计划中：

- 如果 Codex 之后提供稳定 Skill hook，补更可靠的 confirmed 统计
- macOS 和 Linux 安装器支持
