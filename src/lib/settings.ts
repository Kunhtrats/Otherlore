import { readSetting, writeSetting } from './db.ts';
import type { Model } from './domain.ts';

export const controls = [
  // ponytail: bounded text-chat controls only; add tool/reasoning schemas when the chat pipeline supports them.
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.01, help: 'Lower is steadier; higher is more varied.' },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.01, help: 'Probability mass available for sampling.' },
  { key: 'top_k', label: 'Top K', min: 0, max: 1000, step: 1, help: 'Candidate token count; zero disables the limit.' },
  { key: 'min_p', label: 'Min P', min: 0, max: 1, step: 0.01, help: 'Minimum relative token probability.' },
  { key: 'frequency_penalty', label: 'Frequency penalty', min: -2, max: 2, step: 0.01, help: 'Positive values discourage repeated tokens.' },
  { key: 'presence_penalty', label: 'Presence penalty', min: -2, max: 2, step: 0.01, help: 'Positive values encourage new vocabulary.' },
  { key: 'repetition_penalty', label: 'Repetition penalty', min: 0, max: 2, step: 0.01, help: 'Above one discourages repetition.' },
  { key: 'max_tokens', label: 'Maximum reply tokens', min: 64, max: 4096, step: 1, help: 'Reply ceiling, further limited by model context and output limits.' },
] as const;
export type Preferences = { mode?: 'demo' | 'live'; endpoint?: string; contextBudget?: number; model?: string; parameters: Record<string, number> };
export const preferences = (): Preferences => JSON.parse(readSetting('generation') || '{"parameters":{}}');
const env = (key: string) => process.env[key] ?? (import.meta.env as Record<string, string | undefined> | undefined)?.[key];
export const apiKey = () => readSetting('openrouter-key') ?? env('OPENROUTER_API_KEY') ?? '';
export const keyConfigured = () => Boolean(apiKey() && !apiKey().includes('dummy'));
export const isDemo = () => preferences().mode ? preferences().mode === 'demo' : env('OTHERLORE_DEMO') !== 'false';
export const savePreferences = (value: Preferences) => writeSetting('generation', JSON.stringify(value));
export const saveKey = (key: string) => writeSetting('openrouter-key', key);
export const endpoint = () => preferences().endpoint || 'https://openrouter.ai/api/v1';
export const isOpenRouter = (base = endpoint()) => new URL(base).origin === 'https://openrouter.ai';
export function validateEndpoint(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter an absolute API base URL, including /v1 when required.'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('API URL must use HTTP(S), without credentials, query or fragment.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && !local) throw new Error('Use HTTPS for remote APIs; HTTP is allowed only on loopback for local servers.');
  return url.href.replace(/\/+$/, '');
}

export function supportedSettings(model: Model, values: Record<string, number>, strict = false) {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    const control = controls.find(c => c.key === key);
    if (!control || !Number.isFinite(value) || value < control.min || value > control.max || (control.step === 1 && !Number.isInteger(value))) throw new Error('Invalid generation parameter.');
    if (!model.parameters?.includes(key)) {
      if (strict) throw new Error(`Selected model does not support ${key}. Reload its controls.`);
      continue;
    }
    if (key === 'max_tokens' && model.maxOutput && value > model.maxOutput) {
      if (strict) throw new Error('Reply limit exceeds the selected model’s output limit.');
      result[key] = model.maxOutput;
    } else result[key] = value;
  }
  return result;
}