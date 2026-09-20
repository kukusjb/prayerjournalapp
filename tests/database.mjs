import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '../src/utils.js';

// Test-only reconstruction of columns used by existing code; never a production migration.
export async function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT, created_at TEXT);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
    CREATE TABLE journal_data(user_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
    CREATE TABLE magic_links(token TEXT, email TEXT, expires_at TEXT, used INTEGER, created_at TEXT);`);
  const migration = readFileSync(new URL('../migrations/0001_prayer_journeys.sql', import.meta.url), 'utf8');
  sqlite.exec(migration); sqlite.exec(migration);
  for (const name of ['alice', 'bob']) {
    sqlite.prepare('INSERT INTO users VALUES (?, ?, ?)').run(name, name + '@example.test', '2026-01-01');
    sqlite.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(await sha256Hex(name), name, '2099-01-01', '2026-01-01');
  }
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return statement.run(...args); }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sqlite.exec('COMMIT'); return results; }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  };
  return { DB, sqlite };
}
export const blank = () => ({ title: '', problem: '', questionToGod: '', scripture: '', scriptureApplication: '', specificRequest: '', belief: '', plannedActions: '', godActions: '', nextActions: '', abiding: '', godFirst: '', inWord: '', willingToWait: '', spiritLeading: '', promiseAccepted: '', possibleUses: [], step: 1, status: 'in_prayer', submittedDate: '', answeredDate: '' });
