import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyMemory, type Card, type Lore, type Memory, type Message } from './domain.ts';

const path = resolve(process.env.OTHERLORE_DB_PATH || import.meta.env?.OTHERLORE_DB_PATH || '.data/otherlore.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, card TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lore (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id), world_id TEXT NOT NULL REFERENCES worlds(id), model TEXT NOT NULL, memory TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS arcs (session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, number INTEGER NOT NULL, summary TEXT NOT NULL, PRIMARY KEY(session_id, number));
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);`);

type Row = Record<string, string>;
const rows = (sql: string, ...args: string[]) => db.prepare(sql).all(...args) as Row[];
export const characters = () => rows('SELECT * FROM characters').map(r => ({ id: r.id, ...JSON.parse(r.card) as Card }));
export const worlds = () => rows('SELECT * FROM worlds');
export const sessions = () => rows('SELECT * FROM sessions ORDER BY created_at DESC');
export const loreFor = (world: string): Lore[] => rows('SELECT * FROM lore WHERE world_id=?', world).map(r => ({ ...JSON.parse(r.data), id: r.id }));
export const messagesFor = (id: string): (Message & { id: number })[] => db.prepare('SELECT id,role,content FROM messages WHERE session_id=? ORDER BY id').all(id) as unknown as (Message & { id: number })[];
export function session(id: string) {
  const row = rows('SELECT * FROM sessions WHERE id=?', id)[0];
  if (!row) throw new Error('Session not found.');
  const card = characters().find(c => c.id === row.character_id)!;
  const world = worlds().find(w => w.id === row.world_id)!;
  return { ...row, id: row.id, model: row.model, card, world, memory: JSON.parse(row.memory) as Memory, messages: messagesFor(id), lore: loreFor(row.world_id) };
}
export function saveCharacter(id: string | undefined, card: Card) {
  id ||= randomUUID();
  db.prepare('INSERT INTO characters VALUES (?,?) ON CONFLICT(id) DO UPDATE SET card=excluded.card').run(id, JSON.stringify(card));
  return id;
}
export function saveWorld(id: string | undefined, name: string, description: string) {
  id ||= randomUUID();
  db.prepare('INSERT INTO worlds VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description').run(id, name, description);
  return id;
}
export function saveLore(world: string, entry: Lore) {
  db.prepare('INSERT INTO lore VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE lore.world_id=excluded.world_id').run(entry.id, world, JSON.stringify(entry));
}
export function remove(kind: 'character' | 'world' | 'lore' | 'session', id: string) {
  const table = { character: 'characters', world: 'worlds', lore: 'lore', session: 'sessions' }[kind];
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
}
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function createSession(character: string, world: string, model: string) {
  const card = characters().find(c => c.id === character);
  if (!card || !worlds().some(w => w.id === world)) throw new Error('Select an existing character and world.');
  return transaction(() => {
    const id = randomUUID();
    db.prepare('INSERT INTO sessions(id,character_id,world_id,model,memory) VALUES (?,?,?,?,?)').run(id, character, world, model, JSON.stringify(emptyMemory()));
    db.prepare('INSERT INTO messages(session_id,role,content) VALUES (?,?,?)').run(id, 'assistant', card.first_message);
    return id;
  });
}
export function commitTurn(id: string, input: string, reply: string, model: string) {
  transaction(() => {
    const stmt = db.prepare('INSERT INTO messages(session_id,role,content) VALUES (?,?,?)');
    stmt.run(id, 'user', input); stmt.run(id, 'assistant', reply);
    db.prepare('UPDATE sessions SET model=? WHERE id=?').run(model, id);
  });
}
export function saveMemory(id: string, memory: Memory) {
  transaction(() => {
    db.prepare('UPDATE sessions SET memory=? WHERE id=?').run(JSON.stringify(memory), id);
    db.prepare('INSERT INTO arcs VALUES (?,?,?) ON CONFLICT(session_id,number) DO UPDATE SET summary=excluded.summary').run(id, memory.arc, memory.summary);
  });
}
export const arcsFor = (id: string) => rows('SELECT * FROM arcs WHERE session_id=? ORDER BY number', id);

export function seed() {
  if (characters().length || worlds().length) return;
  transaction(() => {
    saveCharacter('starter-character', { name: 'Elara Vey', description: 'A lantern keeper and cartographer of the wandering city.', personality: 'Wry, observant, warm but cautious. Speaks in concise sensory details.', scenario: 'A stranger arrives at the archive during a storm with a map that changes in the rain.', first_message: '“Close the door before the rain learns our names.” Elara lifts her lantern toward your dripping map. “Now, where did you find that?”', example_dialogues: ['You: Is this road safe?\nElara: Safe is a generous word. It is still there, which is a start.', 'You: Can I trust you?\nElara: With a map, certainly. With your last biscuit? Less so.'] });
    saveWorld('starter-world', 'The Wandering City', 'A city that moves each dawn across a sea of mist. Its lantern-lit archive remembers roads the world has forgotten.');
    saveLore('starter-world', { id: 'starter-lore', name: 'The dawn bell', keywords: ['dawn', 'bell', 'city'], content: 'At the first dawn bell the city moves. Anyone outside the walls may be left behind.', constant: true });
  });
}