# 🌌 Otherlore

## 0.2.0 — The Broken Seal

An additive feature release: English-language starter cards and constant lore, Astro GET navigation transitions, loading skeletons during navigation/form requests, and subtle interface animations with reduced-motion support. No new dependencies. Action forms retain full-page POST navigation.

### Play the starter scenario

Start the app and select **Veyr — The Broken Seal**, a heroine, and a model under **Begin a journey**. You play the adult male **Wardbreaker** (approved premise A), not the selected heroine. His editable six-field reference card is in Characters and excluded from AI counterpart selection. Choose an 8k-or-larger context for these cards; mandatory lore is never silently discarded, so oversized prompts fail clearly and can use existing model fallbacks.

At **Rook Gate**, all four hunters corner you on a maintenance bridge while a descending floodgate threatens a refugee ferry. A cracked sluice seal is within reach; a mechanical winch brake offers another approach. Openings establish positions, danger, three available hearthstone charges and an opportunity to speak or act without choosing for you.

| Heroine | Specialty | Pursuit motive | Voice |
| --- | --- | --- | --- |
| Captain Maelin Rook | Bind a touched object in place | Crown warrant and lawful custody | Numbered commands, legal precision |
| Branna Cinderhand | Heat touched metal | Restitution for her flooded forge | Blunt forge metaphors, rough humour |
| Sister Iset Vale | Project remembered images using existing light | Mistaken identification at a damaged shrine | Formal distinctions between observation and inference |
| Tamsin Reed | Guide a bucketful of visible water | Protect evacuees from further seal-breaking | Practical questions, breath counts, task-based nicknames |

**Emberbinding:** touch a hearthstone, trace a specialty sigil, speak its command. Three charges per stone, one per cast; recharge overnight in a lit hearth. Ordinary effects require sight and concentration. Wardbreaking cancels exactly one touched seal until recast, never repairs it or opens physical locks. No resurrection or mind control. Constant lore also preserves action/adventure tone, non-explicit adult themes and explicit player approval before any permanent character death.

The typed fixture is `src/lib/starter.ts`; `src/lib/db.ts` installs it transactionally once, including on existing databases, without replacing saved cards, sessions or lore. The seed marker prevents later restarts from undoing owner edits or deliberate deletions. The original demo content remains available.

**Scope and assumptions:** all main characters are adults; English was chosen; the protagonist’s guilt is unresolved and his rescue account is a claim, not omniscient truth. Each heroine stores only her own evidence and beliefs. Existing chats have one active heroine: all four are present in the opening, but this release does not add autonomous ensemble turns or share their private cards. Start separate journeys to try each voice. Player-reference edits do not automatically rewrite lore; update the matching world rules when changing his ability. Magic charges and fictional boundaries are prompt-driven, not a deterministic combat engine. Offline mode tests persistence with scripted replies; real roleplay requires OpenRouter. Browser animation appearance and provider obedience require manual evaluation.

**Your characters. Your world. A story that remembers.**

A local-first AI roleplay platform for distinct characters and persistent worlds — free, non-commercial, and designed for self-hosting on your own machine.

![Status: local v1](https://img.shields.io/badge/status-local_v1-blue)
![Local first](https://img.shields.io/badge/local-first-green)
![Free models only](https://img.shields.io/badge/OpenRouter-free_models_only-purple)
![License: non-commercial](https://img.shields.io/badge/license-non--commercial-orange)

> ✨ **Runnable local v1.** Offline demo mode works without real credentials. Demo replies are scripted and labeled; enable OpenRouter for real generation. Optional embeddings and two-pass generation are deferred.

## ✨ The vision

An alternative to experiences such as Isekai Zero, TavernAI, and SillyTavern, focused on character voice and continuity across sessions. No paywalls, subscriptions, or monetization. No multi-tenant SaaS ambitions.

<table>
  <tr>
    <td width="50%"><h3>🎭 Distinct characters</h3><p>Structured character cards with personality, scenario, greetings, and example dialogue to anchor each voice.</p></td>
    <td width="50%"><h3>🌍 Persistent worlds</h3><p>Keyword-triggered lore and constant world rules, with evolving relationships, promises, inventory, and plot flags.</p></td>
  </tr>
  <tr>
    <td><h3>🧠 Layered memory</h3><p>Recent messages, a structured fact ledger, and arc summaries for narrative continuity. Semantic retrieval is optional.</p></td>
    <td><h3>🏡 Local-first ownership</h3><p>A self-hosted application with local storage by default. This first release is for a local owner, not public community hosting.</p></td>
  </tr>
  <tr>
    <td><h3>🆓 Free-model resilience</h3><p>Per-model token budgets, free-model fallbacks, and rate-limit handling for OpenRouter’s changing catalog.</p></td>
    <td><h3>🛡️ Character knowledge boundaries</h3><p>Explicit separation of world state and character knowledge to reduce metagaming — not a guarantee of perfect model behavior.</p></td>
  </tr>
</table>

## 🧰 Stack

| Layer | Direction |
| --- | --- |
| Application | Astro with server rendering and Astro Actions; no separate backend framework |
| Language | TypeScript |
| Storage | Native Node SQLite, prepared statements, WAL, foreign keys, and atomic turn transactions |
| Generation | Server-side OpenRouter `/chat/completions` calls, free-tier models only |
| Optional retrieval | Deferred; `sqlite-vec` is the proposed future direction |

Astro 7 removed Astro DB, so this application uses the brief’s SQLite fallback through `node:sqlite`, without an extra ORM. Current memory is JSON on each session; arc summaries are stored historically. Remote sync is not implemented.

## 🔄 How a turn works

1. Load the active character’s structured card.
2. Select constant lore and relevant keyword-triggered entries.
3. Assemble memory and recent conversation within the selected model’s token budget.
4. Add the current message and reserve space for the response.
5. Call OpenRouter on the server, using free-model fallbacks and retry handling for rate limits.
6. Persist the reply and update memory/world state at the configured update cadence.

The model catalog loads on workspace access, is cached for five minutes, and can be manually refreshed. Every turn validates its selected model. Only zero-input/output-priced `:free` models are accepted. A 429 gets one bounded retry; generation can use two alternative free models with similar context sizes, rebuilding the budget each time.

UTF-8 byte counts conservatively estimate tokens. Up to 12 newest raw messages are retained unchanged as a contiguous suffix when budget permits; optional lore and memory cannot exceed their caps. Oversized required input is rejected rather than silently truncated.

### 🎭 Character cards

The minimum card contains `name`, `description`, `personality`, `scenario`, `first_message`, and `example_dialogues`. Two to four short example exchanges help smaller models retain a distinctive voice. Character Card V2 is a schema reference, not a claim of import/export compatibility.

### 🧠 Memory that preserves more than a summary

| Layer | Purpose |
| --- | --- |
| Recent raw messages | Preserve immediate conversational context without rewriting it |
| Structured fact ledger | Track relationships, promises, injuries, inventory, and plot flags through validated updates |
| Arc summary | Carry narrative tone and continuity forward using the previous summary plus new chapters |
| Optional semantic retrieval | Recover older details only when a strong match justifies the context cost |

Important ledger facts may become keyword-triggered lorebook entries. Structured state reduces reliance on prose summaries, but cannot eliminate model mistakes or memory drift.

## 🗺️ Roadmap

- [x] Scaffold Astro, TypeScript, and local persistence.
- [x] Add character creation and editing, worlds, and lorebook entries.
- [x] Implement persistent chat with server-side free-model calls and offline demo mode.
- [x] Add per-model context budgets, fallbacks, and rate-limit retries.
- [x] Implement the fact ledger and arc-summary update pipeline.
- [x] Add explicit world-state / character-knowledge prompt boundaries.
- [ ] Evaluate optional semantic retrieval and two-pass director/character generation.

**Deferred:** semantic retrieval and two-pass generation. Automatic promotion of facts into shared lore is deferred to avoid leaking session-private knowledge; add important public facts as lore manually.

**Not in v1:** billing, monetization, multi-tenant scaling, voice synthesis, or image generation.

## 🚀 Getting started

Use **Node.js 22.13+** (Node 24 LTS recommended) and npm:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4321**. A starter character, world, and lore entry are created on first use. No key is needed in the default offline demo mode.

Copy `.env.example` to `.env` (`copy .env.example .env` on Windows; `cp .env.example .env` on macOS/Linux). It contains only a dummy key. To enable real generation, set `OTHERLORE_DEMO=false` and supply your own `OPENROUTER_API_KEY`, then restart. Existing demo sessions can select a live model in the composer. Credentials stay server-side.

```sh
npm run check
npm test
npm run build
node scripts/smoke.mjs
npm start
```

The production start script loads `.env` and binds to localhost. This is an SSR application, not a static GitHub Pages site. Run one server process per database: session locks are process-local.

### 🧭 Workspace guide

Create characters with 2–4 example exchanges separated by blank lines. Create worlds and lore with comma-separated trigger keywords or **Always active**. Start a journey, send turns, inspect/edit memory, and export sessions as JSON. Delete a character/world’s sessions before deleting that character/world. Edits apply to future turns; existing greetings do not change.

Live memory extraction starts after four turns and processes up to eight pending messages chronologically per pass. Failed extraction preserves the previous ledger and saved reply; use **Update memory** to retry. Demo mode does not fabricate facts: edit its memory manually.

Facts have stable `id`, `kind` (`relationship`, `promise`, `injury`, `inventory`, `plot`), `subject`, `detail`, and `knownBy` fields. `knownBy` is an array of exact character names or `*` for public facts. Hidden facts are excluded from the character prompt. The ledger allows 100 facts; extraction validates deltas before saving. Summaries remain background and cannot guarantee freedom from metagaming. Manual edits preserve the extraction cursor.

### 💾 Backups

Data lives in `.data/otherlore.sqlite` by default (`OTHERLORE_DB_PATH` can override it). Stop the server and copy the entire `.data` directory for a full backup; do not copy a live database without its WAL state. Session JSON exports are readable archives, not importable full backups. There is no encryption at rest or restore UI.

For now, browse the design above or [open an issue](https://github.com/Kunhtrats/Otherlore/issues) with feedback. If contributing implementation work, keep changes small, TypeScript-first, local-first, and compatible with free OpenRouter models.

## 🔐 Privacy and operating limits

- **Local-first does not mean offline.** Generation sends the assembled prompt, including selected character, lore, memory, and messages, to OpenRouter and its selected model provider. Review their data policies before sending sensitive content.
- API keys must stay server-side. Never commit credentials, real conversation histories, or local databases; `.gitignore` excludes common local artifacts but is not a security boundary.
- Free models have changing availability, context limits, and rate limits. Quality and uptime cannot be guaranteed.
- This application has no authentication. Local-host validation and same-origin write checks are defense in depth only. Do not expose it via public proxies, tunnels, or `--host 0.0.0.0`.

## 🤝 Contributing

Bug reports, design feedback, and focused pull requests are welcome. Do not include API keys or private chat data in issues. Include verification steps with code changes; agree on major architecture changes in an issue first.

## 📜 License

[Otherlore Non-Commercial License 1.0](LICENSE) permits personal and non-commercial use, modification, and redistribution under its terms. Commercial use, paid access, and monetization are prohibited without separate written permission from the relevant copyright holders.

**This is a custom source-available license, not an OSI-approved open-source license.** It follows the project brief’s explicit free, non-commercial constraint.

