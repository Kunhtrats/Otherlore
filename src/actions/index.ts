import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { randomUUID } from 'node:crypto';
import * as store from '../lib/db';
import { applyDelta } from '../lib/domain';
import { demo, models, reply, extract, testConnection } from '../lib/provider';
import { apiKey, controls, endpoint, isOpenRouter, preferences, saveKey, savePreferences, supportedSettings, validateEndpoint } from '../lib/settings';

const text = (max: number) => z.string().trim().min(1).max(max);
const id = text(100);
const optionalId = z.string().max(100).optional().transform(v => v || undefined);
const fact = z.object({ id: text(80), kind: z.enum(['relationship','promise','injury','inventory','plot']), subject: text(100), detail: text(400), knownBy: z.array(text(100)).max(20) });
const deltaSchema = z.object({ upsert: z.array(fact).max(100), remove: z.array(text(80)).max(100), summary: z.string().max(2000) });
const busy = new Set<string>();
async function guarded<T>(fn: () => T | Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed.';
    throw new ActionError({ code: 'BAD_REQUEST', message: message.includes('FOREIGN KEY') ? 'Delete related sessions before deleting this character or world.' : message });
  }
}
async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (busy.has(id)) throw new Error('This session is processing a turn. Please wait.');
  busy.add(id);
  try { return await fn(); } finally { busy.delete(id); }
}
async function updateMemory(id: string) {
  const s = store.session(id);
  const pending = s.messages.filter(m => m.id > s.memory.through);
  if (!pending.length) return 'Memory is already current.';
  if (demo()) return 'Offline demo does not invent memory facts. Edit the ledger manually, or enable live mode for extraction.';
  // Process chronological batches so oversized backlogs never silently skip messages.
  const batch = pending.slice(0, 8);
  const raw = await extract(s.model, s.memory, batch);
  const delta = deltaSchema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
  store.saveMemory(id, applyDelta(s.memory, delta, batch.at(-1)!.id));
  return pending.length > batch.length ? 'Memory updated; more messages remain for the next pass.' : 'Memory updated.';
}
export const server = {
  catalog: defineAction({ handler: () => guarded(async () => ({ models: await models(true, true) })) }),
  connection: defineAction({ accept: 'form', input: z.object({ operation: z.enum(['save', 'test', 'clear']), api_key: z.string().trim().max(512).nullish().transform(value => value || ''), mode: z.enum(['demo', 'live']), endpoint: z.string().max(500).optional(), contextBudget: z.coerce.number().int().min(1024).max(2000000).optional() }), handler: input => guarded(async () => {
    if (busy.size) throw new Error('Wait for active chat operations before changing connection settings.');
    if (input.operation === 'clear') {
      store.transaction(() => { saveKey(''); savePreferences({ ...preferences(), mode: 'demo' }); });
      return { notice: 'Key removed; demo mode enabled. Any environment key is also disabled until you save a new key.' };
    }
    const base = validateEndpoint(input.endpoint || endpoint());
    const changed = base !== endpoint();
    const key = input.api_key || (changed ? '' : apiKey());
    if (/[\s\x00-\x1f]/.test(key)) throw new Error('API keys cannot contain whitespace or control characters.');
    if (input.operation === 'test') {
      await testConnection(key, base);
      return { notice: 'Connection test passed. This does not guarantee model capacity. Unsaved changes remain unsaved.' };
    }
    if (input.mode === 'live' && isOpenRouter(base) && !key) throw new Error('Enter a key before enabling OpenRouter.');
    if (input.mode === 'live') await testConnection(key, base);
    store.transaction(() => {
      if (changed || input.api_key) saveKey(key);
      savePreferences({ ...preferences(), ...(changed ? { model: undefined, parameters: {} } : {}), mode: input.mode, endpoint: base, contextBudget: input.contextBudget || 4096 });
    });
    return { notice: 'Connection saved. Changes apply immediately.' };
  }) }),
  generation: defineAction({ accept: 'form', input: z.object({ model: text(200), parameters: z.string().max(2000), endpoint: z.string().max(500).optional() }), handler: input => guarded(async () => {
    if (busy.size) throw new Error('Wait for active chat operations before changing generation settings.');
    const model = (await models(false, true)).find(m => m.id === input.model);
    if (input.endpoint && input.endpoint !== endpoint()) throw new Error('Connection changed. Reload the catalog before saving controls.');
    if (!model) throw new Error('Select a model from the current API catalog.');
    const values = z.record(z.string(), z.number()).parse(JSON.parse(input.parameters));
    if (Object.keys(values).some(key => !controls.some(c => c.key === key))) throw new Error('Unknown generation parameter.');
    savePreferences({ ...preferences(), model: model.id, parameters: supportedSettings(model, values, true) });
    return { notice: 'Default model and generation controls saved. Existing journeys keep their selected model; controls apply to future replies.' };
  }) }),
  character: defineAction({ accept: 'form', input: z.object({ id: optionalId, name: text(80), description: text(1000), personality: text(1000), scenario: text(1000), first_message: text(1500), examples: text(2000) }), handler: input => guarded(() => {
    const { id, examples, ...card } = input;
    const example_dialogues = examples.split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(Boolean);
    if (example_dialogues.length < 2 || example_dialogues.length > 4) throw new Error('Provide 2–4 example exchanges separated by blank lines.');
    store.saveCharacter(id, { ...card, example_dialogues }); return { notice: 'Character saved.' };
  }) }),
  world: defineAction({ accept: 'form', input: z.object({ id: optionalId, name: text(80), description: text(2000) }), handler: input => guarded(() => { store.saveWorld(input.id, input.name, input.description); return { notice: 'World saved.' }; }) }),
  lore: defineAction({ accept: 'form', input: z.object({ id: optionalId, world: id, name: text(80), content: text(1000), keywords: z.string().max(500), constant: z.boolean().default(false) }), handler: input => guarded(() => {
    const keywords = input.keywords.split(',').map(s => s.trim()).filter(Boolean);
    if (!input.constant && !keywords.length) throw new Error('Triggered lore needs at least one keyword.');
    store.saveLore(input.world, { id: input.id || randomUUID(), name: input.name, content: input.content, keywords, constant: input.constant }); return { notice: 'Lore saved.' };
  }) }),
  remove: defineAction({ accept: 'form', input: z.object({ kind: z.enum(['character','world','lore','session']), id }), handler: input => guarded(() => {
    if (busy.size) throw new Error('Wait for active chat operations before deleting data.');
    store.remove(input.kind, input.id); return { notice: 'Deleted.' };
  }) }),
  start: defineAction({ accept: 'form', input: z.object({ character: id, world: id, model: text(200) }), handler: input => guarded(async () => {
    if (!(await models()).some(m => m.id === input.model)) throw new Error('Select an available API model.');
    return { session: store.createSession(input.character, input.world, input.model) };
  }) }),
  send: defineAction({ accept: 'form', input: z.object({ session: id, content: text(3000), model: text(200), last: z.coerce.number().int().nonnegative() }), handler: input => guarded(() => locked(input.session, async () => {
    const s = store.session(input.session);
    if ((s.messages.at(-1)?.id || 0) !== input.last) throw new Error('This conversation changed. Reload before sending again.');
    const result = await reply(input.model, s.card, [{ id: 'world', name: s.world.name, content: s.world.description, constant: true, keywords: [] }, ...s.lore], s.memory, s.messages, input.content);
    store.commitTurn(input.session, input.content, result.text, result.model);
    let notice = demo() ? 'Offline demo turn saved.' : `Reply from ${result.model}.`;
    if (store.session(input.session).messages.filter(m => m.id > s.memory.through).length >= 9) {
      try { notice += ` ${await updateMemory(input.session)}`; }
      catch { notice += ' Reply saved, but memory extraction failed. Existing memory is intact; retry from the memory panel.'; }
    }
    return { notice };
  })) }),
  memory: defineAction({ accept: 'form', input: z.object({ session: id }), handler: input => guarded(() => locked(input.session, async () => ({ notice: await updateMemory(input.session) }))) }),
  editMemory: defineAction({ accept: 'form', input: z.object({ session: id, facts: text(60000), summary: z.string().max(2000) }), handler: input => guarded(() => locked(input.session, async () => {
    const s = store.session(input.session);
    const facts = z.array(fact).max(100).parse(JSON.parse(input.facts));
    if (new Set(facts.map(f => f.id)).size !== facts.length) throw new Error('Fact IDs must be unique.');
    store.saveMemory(input.session, { ...s.memory, facts, summary: input.summary, arc: s.memory.arc + 1 });
    return { notice: 'Memory saved. Extraction cursor preserved.' };
  })) }),
  refresh: defineAction({ accept: 'form', handler: () => guarded(async () => { await models(true); return { notice: 'Model catalog refreshed.' }; }) }),
};