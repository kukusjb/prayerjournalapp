import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database, blank } from './database.mjs';

test('journeys persist, enforce ownership, reject invalid data, protect conflicts, and delete with account', async () => {
  const env = await database();
  const call = (path = '', method = 'GET', body, user = 'alice') => worker.fetch(new Request('https://example.test/api' + path, {
    method, headers: { Authorization: user ? 'Bearer ' + user : '', 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }), env);
  assert.equal((await call('/journeys', 'GET', undefined, '')).status, 401);
  assert.equal((await call('/journeys', 'GET', undefined, 'expired')).status, 401);
  env.sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2020-01-01', 'bob');
  assert.equal((await call('/journeys', 'GET', undefined, 'bob')).status, 401);
  env.sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2099-01-01', 'bob');
  const id = crypto.randomUUID();
  const data = { ...blank(), title: '<script>alert(1)</script>', problem: 'A private prayer', possibleUses: ['power', 'prayer'], abiding: 'no' };
  const created = await call('/journeys', 'POST', { id, data, user_id: 'bob' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('Cache-Control'), 'no-store');
  assert.equal((await created.json()).journey.data.problem, data.problem);
  await call('/journeys', 'POST', { id, data }); // safe retry
  assert.equal((await (await call('/journeys')).json()).journeys.length, 1);
  assert.equal((await (await call('/journeys', 'GET', undefined, 'bob')).json()).journeys.length, 0);
  assert.equal((await call('/journeys/' + id, 'GET', undefined, 'bob')).status, 404);
  assert.equal((await call('/journeys/' + id, 'PUT', { data, version: 1 }, 'bob')).status, 404);
  assert.equal((await call('/journeys', 'POST', { id, data }, 'bob')).status, 409);
  for (const bad of [{step:7}, {abiding:'maybe'}, {possibleUses:['invalid']}, {title:'x'.repeat(161)}, {submittedDate:'2026-02-30'}, {status:'answered'}, {answeredDate:'2026-01-01',submittedDate:'2026-02-01'}, {status:'waiting'}]) {
    assert.equal((await call('/journeys/' + id, 'PUT', { data: {...data, ...bad}, version: 1 })).status, 400);
  }
  assert.equal((await call('/journeys/' + id, 'PUT', { data: null, version: 1 })).status, 400);
  const updatedData = {...data, step:6, status:'answered',submittedDate:'2026-09-01', answeredDate:'2026-09-20',godActions:'An answer',nextActions:'Give thanks'};
  const updated = await call('/journeys/' + id, 'PUT', {data:updatedData,version:1});
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).journey.version, 2);
  assert.equal((await call('/journeys/' + id, 'PUT', {data,version:1})).status, 409);
  const resumed = (await (await call('/journeys/' + id)).json()).journey;
  assert.deepEqual(resumed.data, updatedData);
  assert.equal((await call('/journeys/' + id, 'DELETE')).status, 405);
  const bobId = crypto.randomUUID();
  await call('/journeys', 'POST', {id:bobId,data:blank()}, 'bob');
  assert.equal((await call('/account/delete', 'POST')).status, 200);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS count FROM prayer_journeys WHERE user_id = ?').get('alice').count, 0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS count FROM prayer_journeys WHERE user_id = ?').get('bob').count, 1);
  env.sqlite.close();
});
