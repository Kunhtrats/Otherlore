import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyMemory, type Card } from '../src/lib/domain.ts';

test('API catalog supports paid/local models, scoped controls and actionable errors without fallback', async () => {
  process.env.OTHERLORE_DB_PATH = join(mkdtempSync(join(tmpdir(), 'otherlore-provider-')), 'test.sqlite');
  const { models, reply, testConnection } = await import('../src/lib/provider.ts');
  const { savePreferences, supportedSettings, saveKey, apiKey, validateEndpoint } = await import('../src/lib/settings.ts');
  const original = globalThis.fetch;
  const oldDemo = process.env.OTHERLORE_DEMO;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const calls: string[] = [];
  process.env.OTHERLORE_DEMO = 'false';
  process.env.OPENROUTER_API_KEY = 'test-only-not-a-real-key';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/models')) return Response.json({ data: [
      { id: 'a:free', context_length: 8192, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature', 'max_tokens'], top_provider: { max_completion_tokens: 1024 } },
      { id: 'b:free', context_length: 4096, pricing: { prompt: '0', completion: '0' } },
      { id: 'paid:free', context_length: 8192, pricing: { prompt: '1', completion: '0' } },
      { id: 'not-free', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
    ] });
    if (String(url).endsWith('/key')) return Response.json({ data: {} });
    const body = JSON.parse(String(options?.body)); calls.push(body.model);
    assert.equal(body.provider.require_parameters, true);
    if (body.model === 'a:free') { assert.equal(body.temperature, 0.4); assert.equal(body.max_tokens, 1024); }
    else assert.equal(body.temperature, undefined);
    if (body.model === 'a:free') return Response.json({ error: { message: 'Policy denied sk-or-test-only' } }, { status: 403 });
    return Response.json({ choices: [{ message: { content: 'A real-shaped mocked response.' } }] });
  };
  const card: Card = { name: 'Keeper', description: 'A keeper', personality: 'Kind', scenario: 'Rain', first_message: 'Hello', example_dialogues: ['a', 'b'] };
  try {
    assert.deepEqual((await models(true)).map(m => m.id), ['a:free', 'b:free', 'paid:free', 'not-free']);
    const selected = (await models())[0];
    assert.throws(() => supportedSettings(selected, { temperature: 3 }, true), /Invalid/);
    assert.throws(() => supportedSettings(selected, { top_p: 0.8 }, true), /does not support/);
    assert.throws(() => supportedSettings(selected, { max_tokens: 2048 }, true), /output limit/);
    savePreferences({ model: 'a:free', parameters: { temperature: 0.4, max_tokens: 1024 } });
    saveKey('sk-or-test-only');
    assert.equal(apiKey(), 'sk-or-test-only');
    await testConnection();
    await assert.rejects(() => reply('missing', card, [], emptyMemory(), [], 'Hello'), /unavailable/);
    await assert.rejects(() => reply('a:free', card, [], emptyMemory(), [], 'Hello'), error => error instanceof Error && error.message.includes('403') && error.message.includes('[redacted]') && !error.message.includes('sk-or-test-only'));
    assert.deepEqual(calls, ['a:free'], 'Never switch to a different paid or free model automatically');
    assert.equal((await reply('not-free', card, [], emptyMemory(), [], 'Hello')).model, 'not-free');
    assert.throws(() => validateEndpoint('http://remote.example/v1'), /HTTPS/);
    assert.throws(() => validateEndpoint('https://user:pass@example.com/v1'), /without credentials/);
    assert.equal(validateEndpoint('http://localhost:1234/v1/'), 'http://localhost:1234/v1');
    savePreferences({ endpoint: 'http://localhost:1234/v1', contextBudget: 8192, parameters: {} });
    saveKey('');
    globalThis.fetch = async (url, options) => {
      assert.equal(new Headers(options?.headers).has('Authorization'), false);
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'local-model' }] });
      const body = JSON.parse(String(options?.body));
      assert.equal(body.provider, undefined);
      assert.equal(body.temperature, undefined);
      return Response.json({ choices: [{ message: { content: 'Local response' } }] });
    };
    const local = (await models(true))[0];
    assert.equal(local.contextReported, false); assert.equal(local.context, 8192); assert.equal(local.parameters, undefined);
    await testConnection();
    assert.equal((await reply('local-model', card, [], emptyMemory(), [], 'Hi')).text, 'Local response');
    process.env.OTHERLORE_DEMO = 'true';
    globalThis.fetch = async () => { throw new Error('Demo must never call fetch'); };
    assert.match((await reply('demo/offline', card, [], emptyMemory(), [], 'Hello')).text, /Offline demo/);
  } finally {
    globalThis.fetch = original;
    if (oldDemo === undefined) delete process.env.OTHERLORE_DEMO; else process.env.OTHERLORE_DEMO = oldDemo;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  }
});