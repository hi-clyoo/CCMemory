# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **配色主题系统**：主题拆成两个正交的轴 —— 模式（暗 / 亮）与配色（靛蓝 / 青碧 / 紫罗兰 / 琥珀 / 玫红 / 纯灰），共 12 套取值。在设置的「主题」一节切换，两个轴都会持久化。
- **按显示器自动缩放**：按显示器的 DIP 短边推算像素密度并自动设定窗口缩放，窗口移到另一块屏时自动重算。参考值校准为 2560×1440 @125% 恰好等于 1.0。两块同型号、但系统缩放档位不同的屏幕，观感差异由 25% 收敛到 4%。
- **毛玻璃外壳**：侧栏与标题栏使用 CSS `backdrop-filter`（blur + saturate），不支持时回退为不透明面板；只作用于静态外壳，不作用于滚动列表行。
- **PokeChat 反馈工具**：客户端代码收编进仓库根目录 `pokechat/`，作为渲染进程的静态资源由 `publicDir` 提供。

### Changed
- **图标**：界面 emoji 全部替换为 lucide 图标；分类图标按语义色着色。分类色不随主题变化，以保证文件类型始终可辨。
- **信息密度**：列表行字号 12→13px、元信息 10→11px、行距放宽，默认圆角统一为 6px。
- **默认主题**：全新安装默认深色（已保存的偏好仍然优先）。
- `index.css` 由 266 个变量精简为 16 个语义 token —— 原有的约 250 个是 claude-devtools 时期遗留、本项目已无对应 UI 的死变量。
- PokeChat 客户端从 2026-08-22 的旧构建（757 行）更新到当前版本（1051 行）：选择组件按钮由 🎯 emoji 改为 lucide `MousePointerClick` SVG（选择模式激活时切换为 X），队列按钮增加处理中提示点，任务提示条移入悬浮区。

### Fixed
- `App.tsx` 中以三元表达式充当语句，触发 `no-unused-expressions`，会导致 `pnpm lint` 与 CI 失败。
- 保存 / 删除按钮文案硬编码中文，英文模式下不切换。
- ESLint 的类型感知解析器会解析 `public/` 下的静态资源并报错，导致 lint 失败。
- `.gitignore` 中的 `PokeChat/` 在 `core.ignorecase=true` 下会连带忽略小写的 `pokechat/`（Windows 生效、Linux 不生效），已移除。

### Removed
- 合并时移除了 `App.tsx` 中的 `IconTile` 组件（白底方块 + emoji），其作用已被 lucide 图标方案取代。

## [0.2.0] — 2026-08-14

### Added
- **索引（Index）分类**：把 CLAUDE.md / MEMORY.md 引用的 Markdown 文件做成反向索引，按「来源文件」分组；识别 markdown 链接、反引号路径、裸路径与远程 URL 四种引用写法。
- **git 状态图标**：每个文件行和查看器标题栏显示真实 git 状态（已提交 / 已修改 / 已暂存 / 未跟踪），由 `git status --porcelain` 解析。
- **跳转高亮**：从索引分类点击「索引来源」跳回源文件时，高亮引用所在行并滚动到居中位置。
- **手动刷新按钮**：一键重载项目列表、会话与文件（新增项目目录 / 新会话 / CLAUDE.md 改动无需重启或重选）。

### Changed
- 打开文件 / 会话 / 项目时自动关闭「加载规则」说明面板。
- 默认主题改为**亮色**、默认语言改为**中文**（已保存的偏好仍优先）。

## [0.1.0] — 2026-08-11

First public release of CC Memory — a visual manager for Claude Code memory files.

### Added
- Visual memory file manager: browse all Claude Code projects (current & historical), view/edit `CLAUDE.md` and memory files, inspect raw session JSONL.
- Five memory file categories with per-file editing and a collapsible loading-rule summary: **Managed / User / Project / Local / Memory**.
- Bilingual UI (**中文 / English**) with a persisted language toggle; loading-rule descriptions are localized.
- Cross-platform dark / light theme toggle (macOS, Windows, Linux) backed by a shared `useTheme` hook.
- About panel documenting how each CLAUDE.md file type is loaded (path, priority, merge rules) and showing the app version.
- GitHub Actions CI (typecheck / lint / test / build) and an automated multi-platform release workflow.

### Fixed
- macOS hidden title bar: reserved space for native traffic lights so the title row no longer overlaps the window controls.
- macOS Dock icon not matching the project's SVG artwork (regenerated `icon.icns`).
- Release workflow still referenced the old `claude-devtools.app` binary name.
- CI triggered only on the `main` branch while the default branch is `master`.

### Changed
- Removed inherited `claude-devtools` changelog history and release links; the project now documents its own history.
- macOS installers build unsigned for now (no Apple Developer signing/notarization); Gatekeeper may warn on first launch.
