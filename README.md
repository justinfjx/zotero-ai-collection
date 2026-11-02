<!--
  English README.
  中文版：README-zh.md
-->

<div align="center">
<img src="addon/chrome/content/icons/favicon.png" width="10%" alt="Zotero AI Collection">

# Collection for Zotero

[![README - English](https://img.shields.io/badge/README-English-blue?style=flat-square)](README.md)
[![README - 中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-red?style=flat-square)](README-zh.md)

Use an LLM (Anthropic or an OpenAI-compatible API) to recommend Zotero collections based on each item's **title + abstract**, with a **reviewable** confirmation dialog: you decide which collections to add, whether to reject, and whether to archive.

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
- 🧩 **Multiple API Profiles**: save/rename/delete multiple `Provider + API Endpoint + Model + API Key` configs
- 🔌 **Anthropic or OpenAI-compatible**: pick the provider per profile (OpenAI, Ollama, OpenRouter, LiteLLM, … or Claude directly)
- 📥 **Unfiled items**: classify everything that is in no collection from the Tools menu, or automatically once more than N items are unfiled (off by default)
- 📏 **Depth limit**: decide how deep collections may nest when offered to the AI (and when it suggests new ones)
- 🌱 **Seed collections**: create a starting set of collections from a list of paths
- 💡 **New collection suggestions** (optional): items that fit nowhere are collected; once enough share a suggestion you are asked whether to create the collection and move them in
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

The settings page has 8 sections:

### 1) API Configuration

- `Configuration` dropdown: select the active API profile
- `Save/Rename/Delete`: manage multiple API profiles for switching between providers
- `Provider`: `OpenAI-compatible` (default) or `Anthropic`
- `API Full URL`: the API address. For OpenAI-compatible servers use the Chat Completions URL (default `https://api.openai.com/v1/chat/completions`) or just the API root (`https://api.openai.com/v1`); for Anthropic use `https://api.anthropic.com/v1`
- `Model Name`: model name (default `gpt-3.5-turbo`, can be any model supported by your server)
- `API Key`: sent as `Authorization: Bearer {API Key}` (`x-api-key` for Anthropic)
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

### 5) Unfiled Items

- **Tools → AI Classify Unfiled Items**: classifies every regular item that is in no collection, using your selected processing mode
- **Automatically classify unfiled items**: when enabled, classification starts once more than the **threshold** (default 5) items are unfiled, a few seconds after new items stop arriving. Items you were already offered in this session are not offered again. Off by default

### 6) Collection Structure

- **Maximum depth**: collections nested deeper than this level are not offered to the AI, and a collection at this level counts as a leaf. `0` (default) means no limit; `1` means top-level collections only
- **Seed collections**: one path per line (e.g. `Algorithms/Variational`; lines starting with `#` are ignored). **Create Missing Collections** creates what does not exist yet, after asking for confirmation. Paths deeper than the maximum depth are cut off

### 7) New Collections

- **Let the AI suggest new collections** (off by default): when no existing collection fits an item, the AI may suggest a new one under an existing collection. Such items stay unfiled and are remembered
- **Items needed** (default 10): once this many items share the same suggestion you are asked to **create it and move the items in**, **not now** (asked again when more items join), or **don't suggest again**
- **Allow new top-level collections**: off by default; suggestions must then go under an existing collection
- Suggestions respect the selected collection scope and maximum depth. Pending suggestions are kept separately for each library; only live, unfiled items count toward the threshold and are filed on acceptance

### 8) Translation

- `Enable Chinese title translation in confirmation dialog`: if enabled, the model returns an extra `chineseTitle` field, only for UI display

## 🔌 API Compatibility & Output Format

### API call

Requests are sent through the [AI SDK](https://ai-sdk.dev/), based on the profile's **Provider**:

- **OpenAI-compatible**: `POST {API root}/chat/completions` with `Authorization: Bearer {API Key}`. Works with OpenAI and with OpenAI-compatible gateways such as Ollama, OpenRouter or LiteLLM
- **Anthropic**: `POST {API root}/messages` with `x-api-key` and `anthropic-version` headers

The API root is the `API Full URL` without a trailing `/chat/completions` or `/messages`, so profiles saved by earlier versions keep working.

> Note: providers that need other auth headers (e.g. `api-key`) or only offer the Responses API are not supported directly. Put an OpenAI-compatible gateway in front of them.

### Output format

For OpenAI-compatible servers, the JSON schema is included in the prompt and the answer is validated locally. This keeps existing profiles working with servers that support ordinary Chat Completions. Anthropic uses the SDK's structured-output support. Each request has a 60-second timeout.

The model returns a JSON object:

```json
{ "collectionIDs": [101, 205] }
```

With Chinese title translation enabled it also contains `"chineseTitle"`; with new collection suggestions enabled it may contain `"newCollection": { "parentID": 101, "name": "..." }`. Invalid answers are rejected, and IDs that do not exist in Zotero are ignored. If nothing valid remains, “No suitable collections found” is shown.

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

Requires Node.js 22 or newer.

```bash
cd zotero-ai-collection
npm ci
npm run build
npm test
```

- Build output: `builds/zotero-ai-collection.xpi`
- Dev/debug (requires Zotero installed locally): `npm run start-z7` (or `npm run start`)

### Release (Optional)

```bash
npm run release
```

`release-it` updates the version and update manifests, builds locally, and pushes the release commit and `v` tag. The tag triggers the **Release** workflow, which builds and publishes the XPI on GitHub. Check that workflow's result before sharing the release. GitHub API authentication for publishing is handled by the workflow's built-in token.

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
