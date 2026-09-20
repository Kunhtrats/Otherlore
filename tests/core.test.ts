import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyDelta, buildPrompt, emptyMemory, type Card } from '../src/lib/domain.ts';
import { heroines, protagonist, starterLore } from '../src/lib/starter.ts';
import { atlasLore } from '../src/lib/atlas.ts';

test('atlas entries retain schema, fit editors and retrieve without unrelated lore', () => {
  assert.ok(atlasLore.length >= 45);
  assert.equal(new Set(atlasLore.map(e => e.id)).size, atlasLore.length);
  for (const entry of atlasLore) {
    assert.ok(entry.content.length <= 1000, entry.name);
    assert.ok(entry.constant || entry.keywords.length > 0);
  }
  const prompt = buildPrompt(heroines[0].card, [...starterLore, ...atlasLore], emptyMemory(), [], 'Tell me about the Witness Lantern.', 16384);
  assert.ok(prompt.messages.some(m => m.content.includes('silver-shuttered')));
  assert.ok(!prompt.messages.some(m => m.content.includes('Unwritten Veil')));
  assert.ok(prompt.estimatedTokens + prompt.reserve < 16384);
  for (const { card: heroine } of heroines) {
    const small = buildPrompt(heroine, [...starterLore, ...atlasLore], emptyMemory(), [], 'I reach for the brake.', 8192);
    assert.ok(small.estimatedTokens + small.reserve < 8192);
    assert.ok(small.messages.some(m => m.content.includes('planet Aethra')));
  }
});

test('Veyr cards fit a small context and all constant rules survive long history', () => {
  assert.equal(heroines.length, 4);
  for (const c of [protagonist, ...heroines.map(h => h.card)]) {
    assert.deepEqual(Object.keys(c).sort(), Object.keys(card).sort());
    assert.ok(c.example_dialogues.length >= 2 && c.example_dialogues.length <= 4);
    assert.ok(c.scenario.length <= 1000 && c.first_message.length <= 1500);
  }
  for (const { card: heroine } of heroines) {
    const prompt = buildPrompt(heroine, starterLore, emptyMemory(), Array.from({ length: 12 }, () => ({ role: 'assistant' as const, content: 'Rain. '.repeat(200) })), 'I reach for the winch brake.', 8192);
    for (const entry of starterLore) assert.ok(prompt.messages.some(m => m.content.includes(entry.content)));
    assert.ok(prompt.estimatedTokens + prompt.reserve < 8192);
  }
  assert.throws(() => buildPrompt(card, starterLore, emptyMemory(), [], 'Hello', 1024), /constant lore.*budget/);
});

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
  assert.equal(db.loreFor('veyr').length, starterLore.length + atlasLore.length);
  const atlasEntry = db.loreFor('veyr').find(e => e.id === 'veyr-atlas-planet')!;
  db.saveLore('veyr', { ...atlasEntry, content: 'Owner-edited astronomy.' });
  db.seed();
  assert.equal(db.loreFor('veyr').find(e => e.id === atlasEntry.id)!.content, 'Owner-edited astronomy.');
  const original = db.characters().find(c => c.id === 'veyr-maelin')!;
  db.saveCharacter('veyr-maelin', { ...original, personality: 'Edited by owner' });
  db.seed();
  assert.equal(db.characters().find(c => c.id === 'veyr-maelin')!.personality, 'Edited by owner');
  assert.throws(() => db.createSession('veyr-player', 'veyr', 'demo/offline'), /user-reference/);
  for (const heroine of heroines) {
    const journey = db.createSession(heroine.id, 'veyr', 'demo/offline');
    assert.equal(db.session(journey).messages[0].content, heroine.card.first_message);
    db.remove('session', journey);
  }
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