import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelta, buildPrompt, emptyMemory, type Card } from '../src/lib/domain.ts';

const card: Card = { name: 'Elara', description: 'Keeper', personality: 'Wry', scenario: 'Rain', first_message: 'Hello', example_dialogues: ['a', 'b'] };
test('prompt stays bounded, preserves recent text, filters secret facts and irrelevant lore', () => {
  const memory = emptyMemory();
  memory.facts.push({ id: 'hidden', kind: 'plot', subject: 'Villain', detail: 'SECRET', knownBy: ['Someone else'] });
  const prompt = buildPrompt(card, [{ id: 'x', name: 'x', content: 'UNRELATED', constant: false, keywords: ['volcano'] }], memory, [{ role: 'assistant', content: 'Unmodified recent message.' }], 'Hello 🌙', 4096);
  assert.ok(prompt.estimatedTokens + prompt.reserve < 4096);
  assert.ok(prompt.messages.some(m => m.content === 'Unmodified recent message.'));
  assert.ok(!JSON.stringify(prompt).includes('SECRET'));
  assert.ok(!JSON.stringify(prompt).includes('UNRELATED'));
  assert.throws(() => buildPrompt(card, [], memory, [], '🌙'.repeat(2000), 4096), /budget/);
});
test('memory deltas preserve untouched facts and update stable IDs', () => {
  const memory = emptyMemory();
  const fact = { id: 'p', kind: 'promise' as const, subject: 'Elara', detail: 'Will help', knownBy: ['Elara'] };
  memory.facts = [fact];
  const updated = applyDelta(memory, { upsert: [{ ...fact, detail: 'Fulfilled' }], remove: [], summary: 'Allies.' }, 8);
  assert.equal(updated.facts.length, 1);
  assert.equal(updated.facts[0].detail, 'Fulfilled');
  assert.equal(memory.facts[0].detail, 'Will help');
  assert.equal(updated.through, 8);
  assert.equal(applyDelta(updated, { upsert: [], remove: ['p'], summary: '' }, 9).facts.length, 0);
});
test('SQLite persists turns atomically and protects referenced characters', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'otherlore-'));
  process.env.OTHERLORE_DB_PATH = join(directory, 'test.sqlite');
  const db = await import('../src/lib/db.ts');
  db.seed();
  const id = db.createSession('starter-character', 'starter-world', 'demo/offline');
  db.commitTurn(id, 'Hi', 'Hello', 'demo/offline');
  assert.equal(db.session(id).messages.length, 3);
  assert.throws(() => db.remove('character', 'starter-character'));
  assert.throws(() => db.transaction(() => { db.saveWorld('rollback', 'Rollback', 'test'); throw new Error('abort'); }));
  assert.ok(!db.worlds().some(w => w.id === 'rollback'));
  db.remove('session', id);
  assert.equal(db.messagesFor(id).length, 0);
  // Windows keeps SQLite files locked until this short-lived test process exits.
  process.on('exit', () => { try { rmSync(directory, { recursive: true, force: true }); } catch {} });
});