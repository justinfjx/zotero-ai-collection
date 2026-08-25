<!--
  English README.
  中文版：README-zh.md
-->

<div align="center">
<img src="addon/chrome/content/icons/favicon.png" width="10%" alt="Zotero AI Collection">

# Collection for Zotero

[![README - English](https://img.shields.io/badge/README-English-blue?style=flat-square)](README.md)
[![README - 中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-red?style=flat-square)](README-zh.md)

Use an LLM (an OpenAI Chat Completions compatible API) to recommend Zotero collections based on each item's **title + abstract**, with a **reviewable** confirmation dialog: you decide which collections to add, whether to reject, and whether to archive.

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![zotero target version](https://img.shields.io/badge/Zotero-8-blue?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/support/beta_builds)
[![zotero target version](https://img.shields.io/badge/Zotero-9-purple?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/support/beta_builds)
[![zotero target version](https://img.shields.io/badge/Zotero-10-red?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
[![Latest release](https://img.shields.io/github/v/release/justinfjx/zotero-ai-collection?style=flat-square)](https://github.com/justinfjx/zotero-ai-collection/releases)
![Total downloads](https://img.shields.io/github/downloads/justinfjx/zotero-ai-collection/total)
![License](https://img.shields.io/badge/License-AGPL--3.0--or--later-black?style=flat-square)

</div>

---

## ⚠️ Safety Notice (Early Beta)

> This plugin is currently in an **early beta** stage: features and UX may change at any time, and AI recommendations may be inaccurate.
>
> - **Back up your Zotero data directory/database first**, and try it on a test library or a small set of items;
> - Batch mode calls the AI for all selected items first, which may incur higher costs;
> - Carefully review each item in the confirmation dialog to avoid adding items to unwanted collections.
>
> Please set expectations accordingly (you may need to troubleshoot). Issues and PRs are welcome.

## 🧭 Table of Contents

- [🧐 What Is This?](#-what-is-this)
- [✨ Key Features](#-key-features)
- [👋 Installation](#-installation)
- [😎 Quick Start](#-quick-start)
- [⚙️ Settings](#-settings)
- [🔌 API Compatibility & Output Format](#-api-compatibility--output-format)
- [🔒 Privacy, Cost & Security](#-privacy-cost--security)
- [❓ FAQ](#-faq)
- [🛠️ Development & Build](#-development--build)
- [📄 License](#-license)
- [🙏 Acknowledgements](#-acknowledgements)

## 🧐 What Is This?

**Zotero AI Collection** is a Zotero plugin: after you select one or more items, right-click **“AI Smart Collections”**. The plugin sends each item's **title/abstract** and a list of **available collection paths** in your library to your configured LLM. The model then picks the best 1–3 paths from **existing collections**, and you confirm the final selections in a dialog (check/uncheck).

By default, the plugin **does not create new collections** (except the “archive” collection used by “Reject & archive”), and it does not modify any other item metadata. It only:

- Adds items to the collection(s) you confirm
- (Optional) When you select `A/B/C`, also adds the item to `A`, `A/B`, and `A/B/C`
- (Optional) When you click “Reject & archive”, automatically creates a top-level archive collection (default name: `未分类`) and adds the item to it

> Important: the candidate collections provided to the AI are **leaf collection paths** (the deepest nodes). If you want the AI to be able to pick an intermediate-level collection, make sure that collection itself is a leaf (has no sub-collections), or enable “Add to all collections in the path” to expand a leaf selection to its parent collections.

## ✨ Key Features

- 🧠 **Smart collection path recommendation**: based on title + abstract, choose 1–3 best paths from your existing collection tree
- ✅ **Reviewable confirmation dialog**:
  - Per-item review (shows a dialog after each AI call; you can cancel anytime)
  - Batch review (calls AI for all items first, then shows a summary review window; faster, but costs are incurred upfront)
- 🗂️ **Controllable candidate collection scope**: choose which collection branches can be provided to the AI (controls accuracy and token cost)
- 🧩 **Multiple API Profiles**: save/rename/delete multiple `API Endpoint + Model + API Key` configs
- 🧾 **Editable collection prompt**: customize the system prompt (the plugin will append output-format requirements in the background)
- 🧷 **Add to all parent collections in the path** (optional)
- 📦 **Reject & archive**: one-click to move items into an archive collection (auto-created if missing)
- 🇨🇳 **Chinese title translation** (optional): only for display in the confirmation dialog (does not write back to item fields)

## 👋 Installation

### Option A: Install the `.xpi` (Recommended)

1. Download the latest package: `zotero-ai-collection.xpi`
   - GitHub Releases (latest): `https://github.com/justinfjx/zotero-ai-collection/releases/latest/download/zotero-ai-collection.xpi`
2. Zotero menu: `Tools → Add-ons`
3. Top-right gear: `Install Add-on From File...`, then select the downloaded `.xpi`
4. Restart Zotero

### Option B: Build from source

See “Development & Build” below.

## 😎 Quick Start

1. Create your collection tree in Zotero first (Collections). A clear hierarchy is recommended.
2. Open plugin settings:
   - Windows/Linux: `Edit → Preferences`
   - macOS: `Zotero → Settings/Preferences`
3. In the `Zotero AI Collection` settings page:
   - Fill in `API Endpoint` / `Model Name` / `API Key`
   - Click **“Test Connection”** to make sure it works
   - (Optional) In “Collection Selection”, uncheck collection branches you don't want to provide to the AI
   - (Optional) Choose “Per-item review / Batch review”, whether to “Add to all collections in the path”, and whether to enable Chinese title translation
4. Select one or more items in the item list → right-click → **AI Smart Collections**
5. In the confirmation dialog, check the collection paths you want and confirm; or reject/archive

## ⚙️ Settings

The settings page has 5 sections:

### 1) API Configuration

- `Configuration` dropdown: select the active API profile
- `Save/Rename/Delete`: manage multiple API profiles for switching between providers
- `API Full URL`: full Chat Completions URL (default `https://api.openai.com/v1/chat/completions`)
- `Model Name`: model name (default `gpt-3.5-turbo`, can be any model supported by your server)
- `API Key`: sent as `Authorization: Bearer {API Key}`
- `Test Connection`: sends a test request to check endpoint availability and response format

### 2) Collection Prompt

- Customize the prompt to guide the LLM's collection recommendations
- It's recommended to only adjust “collection preferences/rules”, and not ask the model to output explanations
- The plugin appends the “output must be JSON” requirement automatically (see below)

### 3) Collection Selection

- Checked: this collection branch will be included as candidate paths for the AI
- Unchecked: this collection and its sub-collections will not be included
- Recommendation: only check branches relevant to your current topic to significantly reduce token cost and improve accuracy

### 4) Collection Behavior

- **Processing mode**
  - Per-item review: shows a confirmation dialog after each AI call; you can stop midway
  - Batch review: calls AI for all selected items first, then shows a unified review window
- **Add to all collections in the path**: whether to add `A/B/C` to `A`, `A/B`, and `A/B/C`
- **Archive collection name**: used when clicking “Reject & archive”; auto-created if missing (default `未分类`)

### 5) Translation

- `Enable Chinese title translation in confirmation dialog`: if enabled, the model returns an extra `chineseTitle` field, only for UI display

## 🔌 API Compatibility & Output Format

### API call

This plugin calls the API using the **OpenAI Chat Completions** request/response structure:

- Request: `POST {API Full URL}`
- Headers: `Authorization: Bearer {API Key}`, `Content-Type: application/json`
- Body: `{ model, messages, temperature, max_tokens }`
- Response: the plugin reads the model output text from `choices[0].message.content`

So as long as your server **is compatible with the structure above** (e.g. an OpenAI-compatible gateway/reverse proxy, or some third-party aggregator services), it should work.

> Note: if your provider requires other auth headers like `api-key`, or uses the Responses API instead of Chat Completions, this plugin does not currently support it. You’ll need a gateway to adapt the API, or modify the code yourself.

### Output format (very important)

The model output must contain parseable JSON (prefer **raw JSON** only: no Markdown code fences, no explanations).

#### Default mode (Chinese title translation disabled)

Output a **JSON array** (must be existing full paths; do not invent new paths):

```json
["Collection A/Subcollection B", "Collection C"]
```

#### Translation mode (Chinese title translation enabled)

Output a **JSON object** (with a `collections` array and a `chineseTitle` field):

```json
{"collections":["Collection A/Subcollection B"],"chineseTitle":"Chinese title"}
```

The plugin filters out paths that do not exist in Zotero. If all paths are invalid, it will show “No suitable collections found”.

## 🔒 Privacy, Cost & Security

- The plugin sends **title, abstract, and candidate collection path list** to your configured LLM server (it does not upload full PDF text)
- This may involve privacy/confidentiality and API cost; please assess carefully, and prefer providers you trust (or self-hosted services)
- `API Key` is stored in Zotero preferences; avoid using long-lived keys on shared computers

## ❓ FAQ

### 1) I can’t find “AI Smart Collections” in the right-click menu

- Make sure the add-on is installed and enabled; restart Zotero if needed
- This menu only appears in the **item list** context menu (not the PDF reader context menu)

### 2) “Test Connection” fails / errors when classifying

- Check whether `API Endpoint` is reachable (proxy/firewall/network environment)
- Check whether your `API Key` is correct, has enough quota/credits, or is rate-limited
- Confirm the server returns a Chat Completions compatible response (supports `choices[0].message.content`)
- Check Zotero’s `Tools → Developer → Error Console` for detailed error messages

### 3) It often says “No suitable collections found”

- Your library may have no collections, or you unchecked all candidate branches in settings
- Missing abstracts reduce quality (the plugin uses a “No abstract” placeholder)
- Narrow the candidate scope (only check relevant branches), and refine your prompt to make the model more conservative

### 4) In batch mode, does it call the AI for everything first and only then let me review?

Yes. Batch mode calls the AI for all selected items first, then shows a summary review window.

## 🛠️ Development & Build

```bash
cd zotero-ai-collection
npm install
npm run build
```

- Build output: `builds/zotero-ai-collection.xpi`
- Dev/debug (requires Zotero installed locally): `npm run start-z7` (or `npm run start`)

### Release (Optional)

```bash
npm run release
```

This uses `release-it` to bump versions, build, push, and create a GitHub Release (requires `GITHUB_TOKEN`).

## 📄 License

AGPL-3.0-or-later. See `LICENSE`.

## 🙏 Acknowledgements

Thanks to these great projects (in no particular order):

- [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)
- [windingwind/zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [windingwind/zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags)
- [MuiseDestiny/zotero-gpt](https://github.com/MuiseDestiny/zotero-gpt)
- [guaguastandup/zotero-pdf2zh](https://github.com/guaguastandup/zotero-pdf2zh)

Thanks to the [Linux.do](https://linux.do) for the references.

Also thanks to everyone who helped test this project and provided feature suggestions.
