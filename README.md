# 🌌 Otherlore

**Your characters. Your world. A story that remembers.**

A planned local-first AI roleplay platform for distinct characters and persistent worlds — free, non-commercial, and designed for self-hosting by individuals or small communities.

![Status: early design](https://img.shields.io/badge/status-early_design-blue)
![Local first](https://img.shields.io/badge/local-first-green)
![Free models only](https://img.shields.io/badge/OpenRouter-free_models_only-purple)
![License: non-commercial](https://img.shields.io/badge/license-non--commercial-orange)

> 🚧 **Early design phase.** This repository currently contains project documentation, not a runnable application. Everything below describes the intended design, not implemented functionality.

## ✨ The vision

An alternative to experiences such as Isekai Zero, TavernAI, and SillyTavern, focused on character voice and continuity across sessions. No paywalls, subscriptions, or monetization. No multi-tenant SaaS ambitions.

<table>
  <tr>
    <td width="50%"><h3>🎭 Distinct characters</h3><p>Structured character cards with personality, scenario, greetings, and example dialogue to anchor each voice.</p></td>
    <td width="50%"><h3>🌍 Persistent worlds</h3><p>Keyword-triggered lore and constant world rules, with evolving relationships, promises, inventory, and plot flags.</p></td>
  </tr>
  <tr>
    <td><h3>🧠 Layered memory</h3><p>Recent messages, a structured fact ledger, and arc summaries for narrative continuity. Semantic retrieval is optional.</p></td>
    <td><h3>🏡 Local-first ownership</h3><p>A self-hosted application with local storage by default, built for one owner or a small community.</p></td>
  </tr>
  <tr>
    <td><h3>🆓 Free-model resilience</h3><p>Per-model token budgets, free-model fallbacks, and rate-limit handling for OpenRouter’s changing catalog.</p></td>
    <td><h3>🛡️ Character knowledge boundaries</h3><p>Explicit separation of world state and character knowledge to reduce metagaming — not a guarantee of perfect model behavior.</p></td>
  </tr>
</table>

## 🧰 Planned stack

| Layer | Direction |
| --- | --- |
| Application | Astro with server rendering and Astro Actions; no separate backend framework |
| Language | TypeScript |
| Storage | Astro DB / libSQL, local by default; SQLite + Drizzle is the fallback if needed |
| Generation | Server-side OpenRouter `/chat/completions` calls, free-tier models only |
| Optional retrieval | `sqlite-vec`; not required for v1 |

These choices are recommendations from the project brief, not installed dependencies. Remote database sync is optional future work, not a requirement.

## 🔄 How a turn will work

1. Load the active character’s structured card.
2. Select constant lore and relevant keyword-triggered entries.
3. Assemble memory and recent conversation within the selected model’s token budget.
4. Add the current message and reserve space for the response.
5. Call OpenRouter on the server, using free-model fallbacks and retry handling for rate limits.
6. Persist the reply and update memory/world state at the configured update cadence.

Model context lengths will come from OpenRouter’s `/models` endpoint at startup or model switch. Prompt structure should remain model-agnostic rather than depend on proprietary tool-calling formats.

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

- [ ] Scaffold Astro, TypeScript, and local persistence.
- [ ] Add character creation and editing, worlds, and lorebook entries.
- [ ] Implement persistent chat with server-side free-model calls.
- [ ] Add per-model context budgets, fallbacks, and rate-limit retries.
- [ ] Implement the fact ledger and arc-summary update pipeline.
- [ ] Add explicit world-state / character-knowledge prompt boundaries.
- [ ] Evaluate optional semantic retrieval and two-pass director/character generation.

**Still to decide:** the exact ledger schema, Astro DB versus the SQLite/Drizzle fallback, whether retrieval belongs in v1, and whether two-pass generation is worth the extra requests.

**Not in v1:** billing, monetization, multi-tenant scaling, voice synthesis, or image generation.

## 🚀 Getting started

There are no install, development, or build commands yet: the application has not been scaffolded. Setup instructions will be added alongside the working implementation rather than documented speculatively.

For now, browse the design above or [open an issue](https://github.com/Kunhtrats/Otherlore/issues) with feedback. If contributing implementation work, keep changes small, TypeScript-first, local-first, and compatible with free OpenRouter models.

## 🔐 Privacy and operating limits

- **Local-first does not mean offline.** Generation sends the assembled prompt, including selected character, lore, memory, and messages, to OpenRouter and its selected model provider. Review their data policies before sending sensitive content.
- API keys must stay server-side. Never commit credentials, real conversation histories, or local databases; `.gitignore` excludes common local artifacts but is not a security boundary.
- Free models have changing availability, context limits, and rate limits. Quality and uptime cannot be guaranteed.
- Public deployment security is not implemented. Do not treat this design as a production-ready internet-facing service.

## 🤝 Contributing

Bug reports, design feedback, and focused pull requests are welcome. Do not include API keys or private chat data in issues. Include verification steps with code changes; agree on major architecture changes in an issue first.

## 📜 License

[Otherlore Non-Commercial License 1.0](LICENSE) permits personal and non-commercial use, modification, and redistribution under its terms. Commercial use, paid access, and monetization are prohibited without separate written permission from the relevant copyright holders.

**This is a custom source-available license, not an OSI-approved open-source license.** It follows the project brief’s explicit free, non-commercial constraint.

