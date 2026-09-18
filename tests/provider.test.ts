import { test } from 'node:test';
import assert from 'node:assert/strict';
import { models, reply } from '../src/lib/provider.ts';
import { emptyMemory, type Card } from '../src/lib/domain.ts';

test('provider enforces free catalog, falls back, and demo never calls the network', async () => {
  const original = globalThis.fetch;
  const oldDemo = process.env.OTHERLORE_DEMO;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const calls: string[] = [];
  process.env.OTHERLORE_DEMO = 'false';
  process.env.OPENROUTER_API_KEY = 'test-only-not-a-real-key';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [
      { id: 'a:free', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
      { id: 'b:free', context_length: 4096, pricing: { prompt: '0', completion: '0' } },
      { id: 'paid:free', context_length: 8192, pricing: { prompt: '1', completion: '0' } },
      { id: 'not-free', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
    ] });
    const body = JSON.parse(String(options?.body)); calls.push(body.model);
    if (body.model === 'a:free') return new Response('', { status: 503 });
    return Response.json({ choices: [{ message: { content: 'A real-shaped mocked response.' } }] });
  };
  const card: Card = { name: 'Keeper', description: 'A keeper', personality: 'Kind', scenario: 'Rain', first_message: 'Hello', example_dialogues: ['a', 'b'] };
  try {
    assert.deepEqual((await models(true)).map(m => m.id), ['a:free', 'b:free']);
    await assert.rejects(() => reply('paid:free', card, [], emptyMemory(), [], 'Hello'), /unavailable/);
    const result = await reply('a:free', card, [], emptyMemory(), [], 'Hello');
    assert.equal(result.model, 'b:free');
    assert.deepEqual(calls, ['a:free', 'b:free']);
    process.env.OTHERLORE_DEMO = 'true';
    globalThis.fetch = async () => { throw new Error('Demo must never call fetch'); };
    assert.match((await reply('demo/offline', card, [], emptyMemory(), [], 'Hello')).text, /Offline demo/);
  } finally {
    globalThis.fetch = original;
    if (oldDemo === undefined) delete process.env.OTHERLORE_DEMO; else process.env.OTHERLORE_DEMO = oldDemo;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  }
});