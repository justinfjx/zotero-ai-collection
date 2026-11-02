<!--
  中文版 README。
  English README: README.md
-->

<div align="center">
<img src="addon/chrome/content/icons/favicon.png" width="10%" alt="Zotero AI Collection">

# Collection for Zotero

[![README - English](https://img.shields.io/badge/README-English-blue?style=flat-square)](README.md)
[![README - 中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-red?style=flat-square)](README-zh.md)

用 LLM（OpenAI Chat Completions 兼容接口）根据「标题 + 摘要」为条目智能推荐 Zotero 分类（Collection），并提供**可审核**的确认对话框：你决定加到哪些分类、是否拒绝、是否归档。

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![zotero target version](https://img.shields.io/badge/Zotero-8-blue?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/support/beta_builds)
[![zotero target version](https://img.shields.io/badge/Zotero-9-purple?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/support/beta_builds)
[![zotero target version](https://img.shields.io/badge/Zotero-10-red?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Latest release](https://img.shields.io/github/v/release/justinfjx/zotero-ai-collection?style=flat-square)](https://github.com/justinfjx/zotero-ai-collection/releases)
![累计下载次数](https://img.shields.io/github/downloads/justinfjx/zotero-ai-collection/total)
![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-black?style=flat-square)

</div>

---

## ⚠️ 安全提示（早期测试版）

> 本插件目前为**早期测试版本**：功能与交互可能随时变动，AI 推荐结果也可能不准确。

> - **请先备份 Zotero 数据目录/数据库**，并建议先在测试库或少量条目上试用；
> - 批量模式会先对所有条目调用 AI，可能产生较高调用成本；
> - 请务必在确认对话框中逐条核对，避免将条目误加入不希望的分类。

> 使用前请有一定心理预期（可能需要排错/折腾）。如遇问题欢迎提 issue。

## 🧭 目录

- [🧐 这是什么？](#-这是什么)
- [✨ 主要功能](#-主要功能)
- [👋 安装](#-安装)
- [😎 快速上手](#-快速上手)
- [⚙️ 设置说明](#-设置说明)
- [🔌 API 兼容性与输出格式](#-api-兼容性与输出格式)
- [🔒 隐私、成本与安全](#-隐私成本与安全)
- [❓ 常见问题（FAQ）](#-常见问题faq)
- [🛠️ 开发与构建](#-开发与构建)
- [📄 License](#-license)
- [🙏 致谢](#-致谢)

## 🧐 这是什么？

**Zotero AI Collection** 是一个 Zotero 插件：当你选中若干条目后，右键点击 **“AI 智能分类”**，插件会把这些条目的「标题/摘要」与当前库中「可选分类路径列表」发给你配置的 LLM，让它从**已有分类路径**中挑选最合适的 1–3 个路径，然后你再在对话框里确认（可勾选/取消勾选）。

插件默认**不会创建新分类**（除了“未分类”文件夹外），也不会改动条目的其它元数据；它做的事情只有：

- 将条目添加到你确认的 Collection(s)
- （可选）当你选择 `A/B/C` 时，同时加入 `A`、`A/B`、`A/B/C`
- （可选）你点击“拒绝并归档”时，自动创建一个顶层归档分类（默认名：`未分类`）并将条目加入

> 重要说明：插件提供给 AI 的候选分类是「叶子分类路径」（最深层的那些）。如果你希望 AI 能选中某个中间层级，请确保它本身是叶子节点（没有子分类），或启用“添加到路径中的所有分类”来把叶子选择扩展到父级。

## ✨ 主要功能

- 🧠 **智能推荐分类路径**：基于标题 + 摘要，从你现有的分类树中选择 1–3 个最合适路径
- ✅ **可审核的确认对话框**：
  - 逐篇确认（每篇跑完 AI 就弹窗，可中途取消停止）
  - 批量确认（先全部跑完 AI，再统一审核；更快，但会先产生全部请求成本）
- 🗂️ **可控的候选分类范围**：在设置里勾选“哪些分类可被提供给 AI”（用于控制准确率与 Token 成本）
- 🧩 **多配置方案（API Profiles）**：保存/重命名/删除多套 `服务商 + API Endpoint + Model + API Key`
- 🔌 **Anthropic 或 OpenAI 兼容**：每个配置方案可单独选择服务商（OpenAI、Ollama、OpenRouter、LiteLLM 等，或直接使用 Claude）
- 📥 **未归类条目**：通过“工具”菜单一键分类所有不在任何分类中的条目，或在未归类条目超过 N 个时自动分类（默认关闭）
- 📏 **层级限制**：限制提供给 AI 的分类嵌套深度（也限制 AI 建议的新分类的深度）
- 🌱 **预设分类**：根据路径列表一键创建初始分类
- 💡 **新分类建议**（可选）：无法归入现有分类的条目会被收集；当足够多的条目共享同一个建议时，会询问是否创建该分类并移入条目
- 🧾 **可编辑分类 Prompt**：自定义系统提示词（插件会在后台附加“输出格式要求”）
- 🧷 **添加到路径所有父分类（可选）**
- 📦 **拒绝并归档**：一键把条目加入一个归档分类（不存在会自动创建）
- 🇨🇳 **中文标题翻译（可选）**：仅用于确认对话框展示（不写回条目字段）

## 👋 安装

### 方式 A：安装 `.xpi`（推荐）

1. 下载最新安装包：`zotero-ai-collection.xpi`
   - GitHub Releases（latest）：`https://github.com/justinfjx/zotero-ai-collection/releases/latest/download/zotero-ai-collection.xpi`
2. Zotero 顶部菜单：`工具 (Tools) → 附加组件 (Add-ons)`
3. 右上角齿轮：`Install Add-on From File...`，选择下载的 `.xpi`
4. 重启 Zotero

### 方式 B：从源码构建

见下方「开发与构建」。

## 😎 快速上手

1. 在 Zotero 里先建立好你的分类树（Collections），建议使用清晰的层级结构
2. 打开插件设置：
   - Windows/Linux：`编辑 → 首选项 (Preferences)`
   - macOS：`Zotero → Settings/Preferences`
3. 在 `Zotero AI Collection` 设置页中：
   - 填写 `API Endpoint` / `Model Name` / `API Key`
   - 点击 **“测试连接”**，确保可用
   - （可选）在「分类选择」里取消勾选不希望提供给 AI 的分类分支
   - （可选）选择「逐篇确认 / 批量确认」、是否“添加到路径中的所有分类”、是否启用中文标题翻译
4. 在条目列表中选中一个或多个条目 → 右键 → **AI 智能分类**
5. 在确认对话框里勾选你要添加的分类路径，点击确认；或选择拒绝/归档

## ⚙️ 设置说明

插件设置页分为 8 个部分：

### 1) API 配置

- `Configuration` 下拉框：选择当前启用的 API 配置方案
- `保存/重命名/删除`：管理多套 API 配置，便于在不同服务商之间切换
- `服务商`：`OpenAI-compatible`（默认）或 `Anthropic`
- `API Full URL`：OpenAI 兼容服务可填完整 Chat Completions 地址（默认 `https://api.openai.com/v1/chat/completions`）或 API 根地址；Anthropic 填 `https://api.anthropic.com/v1`
- `Model Name`：模型名（默认 `gpt-3.5-turbo`，可改为任意服务端支持的模型名）
- `API Key`：以 `Authorization: Bearer {API Key}` 方式放在请求头里，Anthropic 使用 `x-api-key`
- `测试连接`：用一条测试请求检查端点可用性与返回格式

### 2) 分类 Prompt

- 自定义指导 LLM 推荐分类的 Prompt
- 建议只改“分类偏好/规则”，不要要求模型输出解释
- 插件会在后台追加「输出必须为 JSON」的格式要求（见下文）

### 3) 分类选择

- 勾选：该分类分支会作为候选路径提供给 AI
- 取消勾选：该分类及其子分类将不会出现在 AI 可选范围里
- 建议：仅勾选与你当前处理主题相关的分支，能显著降低 Token 成本并提升准确率

### 4) 分类行为

- **处理模式**
  - 逐篇确认：每篇跑完 AI 就弹出确认框，可中途停止
  - 批量确认：先对所有选中条目调用 AI，再弹一个汇总窗口统一审核
- **添加到路径中的所有分类**：是否把 `A/B/C` 同时加入 `A`、`A/B`、`A/B/C`
- **归档分类名称**：点击“拒绝并移至归档”时使用；没有就自动创建（默认 `未分类`）

### 5) 未归类条目

- **工具 → AI 分类未归类条目**：按当前选择的处理模式，对所有不在任何分类中的普通条目进行分类
- **自动分类未归类条目**：开启后，当未归类条目超过**阈值**（默认 5）时，在新条目停止增加几秒后自动开始分类。本次运行中已经提供过的条目不会再次提供。默认关闭

### 6) 分类结构

- **最大层级**：嵌套层级超过该值的分类不会提供给 AI，位于该层级的分类视为叶子分类。`0`（默认）表示不限制，`1` 表示仅顶级分类
- **预设分类**：每行一个路径（例如 `Algorithms/Variational`，以 `#` 开头的行会被忽略）。点击“创建缺失的分类”，确认后会创建尚不存在的分类；超过最大层级的部分会被截断

### 7) 新建分类

- **允许 AI 建议新建分类**（默认关闭）：当没有现有分类适合某个条目时，AI 可建议在某个现有分类下新建分类。这些条目保持未归类并被记录
- **所需条目数**（默认 10）：当这么多条目共享同一个建议时，会询问你**创建并移入条目**、**暂不**（有更多条目加入后再询问）或**不再建议**
- **允许新建顶级分类**：默认关闭；关闭时建议必须位于某个现有分类之下
- 建议遵循已勾选的分类范围和最大层级。待处理建议按文库分别保存；达到阈值和确认归类时，只计算仍存在且未归类的条目

### 8) 翻译设置

- `在确认对话框中启用中文标题翻译`：开启后会让模型额外返回 `chineseTitle`，仅用于 UI 展示

## 🔌 API 兼容性与输出格式

### API 调用方式

请求通过 [AI SDK](https://ai-sdk.dev/) 发送，取决于配置方案中的**服务商**：

- **OpenAI 兼容**：`POST {API 根地址}/chat/completions`，请求头 `Authorization: Bearer {API Key}`。适用于 OpenAI 以及 Ollama、OpenRouter、LiteLLM 等 OpenAI 兼容网关
- **Anthropic**：`POST {API 根地址}/messages`，请求头 `x-api-key` 与 `anthropic-version`

API 根地址即去掉末尾 `/chat/completions` 或 `/messages` 的 `API Full URL`，因此旧版本保存的配置方案仍可使用。

> 注意：需要 `api-key` 等其它鉴权头、或只提供 Responses API 的服务商不能直接使用，请在前面加一层 OpenAI 兼容网关。

### 输出格式

OpenAI 兼容服务通过 Prompt 接收 JSON Schema，插件在本地校验返回值，使原有普通 Chat Completions 配置可继续使用。Anthropic 使用 SDK 的结构化输出功能。每次请求限时 60 秒。

模型返回 JSON 对象：

```json
{ "collectionIDs": [101, 205] }
```

开启中文标题翻译时还会包含 `"chineseTitle"`；开启新分类建议时可能包含 `"newCollection": { "parentID": 101, "name": "..." }`。不合法的返回会被拒绝，在 Zotero 中不存在的 ID 会被忽略；如果没有任何有效结果，会提示“未找到合适的分类”。

## 🔒 隐私、成本与安全

- 插件会把：**标题、摘要、候选分类路径列表** 发送给你配置的 LLM 服务端（不会上传 PDF 全文）
- 这可能涉及隐私/保密信息与 API 调用成本；请自行评估，并优先使用你信任的服务商或自建服务
- `API Key` 会保存在 Zotero 的偏好设置中；建议不要在共享电脑上使用长期密钥

## ❓ 常见问题（FAQ）

### 1) 右键菜单里看不到 “AI 智能分类”

- 确认已安装并启用插件；必要时重启 Zotero
- 该菜单只会出现在“条目列表”的右键菜单中（不是 PDF 阅读器菜单）

### 2) “测试连接”失败 / 分类时报错

- 检查 `API Endpoint` 是否可访问（公司代理/防火墙/网络环境）
- 检查 `API Key` 是否正确、是否有余额/额度、是否被限流
- 确认服务端兼容 Chat Completions 返回格式（`choices[0].message.content`）
- 可在 Zotero 的 `工具 → 开发者 → 错误控制台` 查看更详细错误信息

### 3) 经常提示 “未找到合适的分类”

- 你的库中可能没有任何分类（Collections），或在设置里把候选分类都取消勾选了
- 条目没有摘要会降低效果（插件会用“无摘要”占位）
- 建议缩小候选分类范围（只勾选相关分支），并优化 Prompt 让模型更“克制”

### 4) 批量模式会先“全部请求 AI”再让我审核吗？

是的：批量模式会先对所有选中条目调用 AI，再弹出汇总审核窗口。

## 🛠️ 开发与构建

需要 Node.js 22 或更高版本。

```bash
cd zotero-ai-collection
npm ci
npm run build
npm test
```

- 构建产物：`builds/zotero-ai-collection.xpi`
- 开发调试（需本机安装 Zotero）：`npm run start-z7`（或 `npm run start`）

### Release（可选）

```bash
npm run release
```

`release-it` 更新版本号与更新清单、在本地构建，并推送发布提交和 `v` 标签。标签触发 **Release** 工作流，由工作流构建 XPI 并发布到 GitHub。分享版本前，先确认该工作流成功。发布所需的 GitHub API 鉴权由工作流内置令牌提供。

## 📄 License

AGPL-3.0-or-later. See `LICENSE`.

## 🙏 致谢

感谢以下优秀项目（排名不分先后）：

- [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)
- [windingwind/zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [windingwind/zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags)
- [MuiseDestiny/zotero-gpt](https://github.com/MuiseDestiny/zotero-gpt)
- [guaguastandup/zotero-pdf2zh](https://github.com/guaguastandup/zotero-pdf2zh)

感谢 [Linux.do](https://linux.do) 的相关参考。

也感谢为本项目进行测试、提出功能建议的同志们。
