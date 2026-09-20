# 🌌 Otherlore

## 0.4.0 — Bring your own API

Open **Settings** to configure OpenRouter or any OpenAI-compatible API with `/models` and `/chat/completions`. Paid, free and local models are supported; model IDs are discovered from your endpoint, not a built-in list. Save the connection, choose a model, press **Load model controls**, then save the model and controls. All settings operations update in place without navigation; unsaved numeric drafts are retained per model while the page remains open.

Examples: OpenRouter `https://openrouter.ai/api/v1`, LM Studio `http://localhost:1234/v1`, Ollama `http://localhost:11434/v1`. Local servers must be running with a model loaded. HTTPS is required remotely; plain HTTP is allowed only on loopback. Credentials are never reused when switching endpoints. Blank keys retain the existing key only for the same endpoint; local APIs can run without a key. Settings override the legacy OpenRouter environment variables.

Models, prices, default values and supported-parameter names come from API metadata. The UI exposes recognized numeric sampling controls only when advertised. APIs that omit capability metadata get no invented controls; provider defaults are used. An explicit context-budget setting covers APIs that omit context length (4096 initially); match it to your server configuration. The app validates known parameter types/ranges because most model catalogs do not publish a complete input schema. Tools, images and structured-output configuration remain outside this text-chat UI.

**Costs and errors:** only your selected model is called; automatic cross-model fallback is removed. Paid replies and memory extraction can incur charges. Pricing is displayed as reported, never assumed zero. A 403 means access denied, not necessarily moderation; sanitized API error details and account/privacy/policy guidance are shown. Failed turns are not partially saved. A connection test checks access, not model capacity or policy compatibility.

Keys are stored server-side in local SQLite, unencrypted at rest, and excluded from session exports and rendered fields. Keep the app on localhost and protect backups. This app remains free and non-commercial; that does not restrict the inference providers you may use.

### Run

Node 22.13+ is required. Run `npm install`, then `npm run dev` and open http://127.0.0.1:4321. Configure Settings; no environment key is required for local APIs. For production: `npm run build` then `npm start`. Verification: `npm run check`, `npm test`, `node scripts/smoke.mjs` after building.

### Starter scenario

Choose **Veyr — The Broken Seal** and a heroine. You play the adult male Wardbreaker; the selected heroine is the active voice. Maelin seeks lawful custody, Branna restitution, Iset acts on mistaken identification and Tamsin protects evacuees. All four are present at Rook Gate. English cards use the six-field character schema, and constant lore defines Emberbinding, stakes, knowledge boundaries and no permanent death without player approval. An 8k-or-larger context is recommended. The original Elara/Wandering City demo is also available.

### Data and limitations

SQLite data lives in `.data/otherlore.sqlite` unless `OTHERLORE_DB_PATH` overrides it. Stop the server before backing up the entire data directory. Settings changes apply immediately; existing journeys keep their model. Seeds preserve existing edits. Chat exports are readable archives, not full backup imports. Generation sends prompts to your selected endpoint. Memory uses recent messages, a fact ledger and arc summaries; extraction runs periodically and can be retried manually. Model knowledge and fictional rules are prompt-driven, not guaranteed. No authentication, public hosting, autonomous ensemble generation, embeddings or two-pass generation is provided.

### License

See [LICENSE](LICENSE): free non-commercial use, modification and redistribution; commercial use requires permission. This custom source-available license is not OSI-approved.
