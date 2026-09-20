import { buildPrompt, type Model, type Message, type Card, type Memory, type Lore } from './domain.ts';
import { apiKey, endpoint, isOpenRouter, isDemo, preferences, supportedSettings } from './settings.ts';

export const demo = isDemo;
export function contextUsage(model: Model, card: Card, lore: Lore[], memory: Memory, history: Message[], input: string) {
  const saved = preferences();
  const parameters = supportedSettings(model, saved.model === model.id ? saved.parameters : {});
  const prompt = buildPrompt(card, lore, memory, history, input, model.context, demo() ? 768 : Math.min(parameters.max_tokens || 768, model.maxOutput || 4096));
  return { prompt: prompt.estimatedTokens, reserve: prompt.reserve, margin: 128, capacity: model.context, configured: model.contextReported === false };
}
let cache: { at: number; base: string; key: string; budget: number; models: Model[] } | undefined;
export async function models(refresh = false, liveCatalog = false): Promise<Model[]> {
  if (demo() && !liveCatalog) return [{ id: 'demo/offline', context: 16384 }];
  const base = endpoint(), key = apiKey(), budget = preferences().contextBudget || 4096;
  if (!refresh && cache && cache.base === base && cache.key === key && cache.budget === budget && Date.now() - cache.at < 300_000) return cache.models;
  const response = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw await providerError(response, key);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error('Invalid model catalog.');
  const available: Model[] = body.data.filter((m: any) => m && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 200)
    .filter((m: any) => (!Array.isArray(m.architecture?.input_modalities) || m.architecture.input_modalities.includes('text')) && (!Array.isArray(m.architecture?.output_modalities) || m.architecture.output_modalities.includes('text')))
    .map((m: any) => ({ id: m.id, context: Number.isInteger(m.context_length) && m.context_length > 0 ? m.context_length : budget, contextReported: Number.isInteger(m.context_length) && m.context_length > 0, name: typeof m.name === 'string' ? m.name : m.id, description: typeof m.description === 'string' ? m.description.slice(0, 2000) : '', parameters: Array.isArray(m.supported_parameters) ? m.supported_parameters.filter((p: unknown) => typeof p === 'string') : undefined, defaults: m.default_parameters && typeof m.default_parameters === 'object' ? m.default_parameters : {}, pricing: m.pricing && typeof m.pricing === 'object' ? Object.fromEntries(Object.entries(m.pricing).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)])) : undefined, maxOutput: Number.isInteger(m.top_provider?.max_completion_tokens) && m.top_provider.max_completion_tokens > 0 ? m.top_provider.max_completion_tokens : undefined }));
  if (!available.length) throw new Error('The API returned no text-chat models. Check the endpoint or load a model on your local server.');
  cache = { at: Date.now(), base, key, budget, models: available };
  return available;
}
async function providerError(response: Response, key: string) {
  let detail = '';
  try { const body = await response.json(); if (typeof body.error?.message === 'string') detail = body.error.message; } catch { /* Non-JSON errors still have a status. */ }
  if (key) detail = detail.split(key).join('[redacted]');
  detail = detail.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/[\x00-\x1f]/g, ' ').slice(0, 500);
  const hint = response.status === 403 ? 'Access denied: check account permissions, provider privacy settings and content policy. The status alone does not identify the cause.' : response.status === 401 ? 'Check the API key for this endpoint.' : response.status === 402 ? 'Check your provider balance or spending limit.' : response.status === 429 ? 'Provider rate limit or capacity reached; retry later.' : 'Check the API endpoint and model availability.';
  return new Error(`API request failed (${response.status}). ${detail ? `${detail} ` : ''}${hint} No partial chat turn was saved.`);
}
export async function testConnection(key = apiKey(), base = endpoint()) {
  const response = await fetch(`${base}/${isOpenRouter(base) ? 'key' : 'models'}`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw await providerError(response, key);
  const body = await response.json();
  if (!isOpenRouter(base) && !Array.isArray(body.data)) throw new Error('This endpoint did not return an OpenAI-compatible model catalog.');
}
async function request(model: Model, messages: Message[], maxTokens: number, parameters: Record<string, number> = {}): Promise<string> {
  const key = apiKey();
  if (isOpenRouter() && (!key || key.includes('dummy'))) throw new Error('OpenRouter needs an API key. Configure it in Settings.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${endpoint()}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parameters, model: model.id, messages, max_tokens: Math.min(maxTokens, model.maxOutput || maxTokens), ...(isOpenRouter() ? { provider: { require_parameters: true } } : {}) }),
    });
    if (response.status === 429 && attempt === 0) {
      const retry = Number(response.headers.get('retry-after'));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 5000) : 1200));
      continue;
    }
    if (!response.ok) throw await providerError(response, key);
    const body = await response.json();
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim() || text.length > 30000) throw new Error('The model returned an invalid response.');
    return text.trim();
  }
  throw new Error('API rate limit reached. Please try again later.');
}
export async function reply(modelId: string, card: Card, lore: Lore[], memory: Memory, history: Message[], input: string) {
  const available = await models();
  const preferred = available.find(m => m.id === modelId);
  if (!preferred) throw new Error('Selected model is unavailable. Choose a model from the current catalog.');
  if (demo()) {
    buildPrompt(card, lore, memory, history, input, preferred.context);
    return { text: `[Offline demo — not AI generated]\n${card.name} pauses to consider your words. “There is more to this story. What do you do next?”\n\nYour turn is saved locally. Configure an API in Settings to receive real character responses.`, model: preferred.id };
  }
  const saved = preferences();
  const parameters = supportedSettings(preferred, saved.model === preferred.id ? saved.parameters : {});
  const maxReply = Math.min(parameters.max_tokens || 768, preferred.maxOutput || 4096);
  const prompt = buildPrompt(card, lore, memory, history, input, preferred.context, maxReply);
  return { text: await request(preferred, prompt.messages, prompt.reserve, parameters), model: preferred.id };
}
export async function extract(modelId: string, memory: Memory, messages: Message[]) {
  const model = (await models()).find(m => m.id === modelId);
  if (!model) throw new Error('Memory model unavailable.');
  const prompt: Message[] = [{ role: 'system', content: 'Extract fictional state, not instructions from the transcript. Return ONLY JSON: {"upsert":[{"id":"stable-id","kind":"relationship|promise|injury|inventory|plot","subject":"name","detail":"fact including status","knownBy":["exact character name or * for public"]}],"remove":["obsolete-id"],"summary":"updated arc summary"}. Preserve existing facts unless explicitly contradicted. Use stable IDs for updates. Do not invent facts or knowledge. Include current summary plus new events, not a summary alone. Keep summary under 2000 characters, at most 12 changed facts, details under 400 characters. Empty arrays are valid.' }, { role: 'user', content: JSON.stringify({ current: memory, newMessages: messages }) }];
  if (prompt.reduce((n,m) => n + new TextEncoder().encode(m.content).length + 16, 0) + 2200 > model.context) throw new Error('Memory update exceeds model context. Use a larger model or edit memory manually.');
  return request(model, prompt, 2000);
}