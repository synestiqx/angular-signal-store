/**
 * The JSNQ integration must be optional: the core works without it, and the query APIs
 * fail with an actionable message instead of silently doing nothing.
 * Run: bun test/jsnq-optional.test.ts
 */
import { SignalStore } from '../src/index';
import where from '@adsq/jsnq/operators/where';
import update from '@adsq/jsnq/operators/update';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`PASS ${msg}`);
  else { console.error(`FAIL ${msg}`); failures++; }
};

const ss = new SignalStore(undefined as any);

// 1) core read/write works with no bridge registered
const plain: any = ss.createStore({ user: { name: 'Ann' }, list: [1, 2] }, 'no-bridge');
ok(plain.user.name() === 'Ann', 'read works without the JSNQ bridge');
plain.user.name = 'Ada';
ok(plain.user.name() === 'Ada', 'write works without the JSNQ bridge');
plain.list.push(3);
ok(plain.list().length === 3, 'array push works without the JSNQ bridge');

// 2) query APIs throw an actionable error naming the import
const q: any = ss.createStore({ users: [{ id: 1, active: true, score: 0 }] }, 'no-bridge-q');
let message = '';
try { q.users.mutate(where('active', '===', true), update('score', (s: number) => s + 1)); }
catch (error) { message = String(error); }
ok(message.includes("@adsq/angular-signal-store/jsnq"), 'mutate names the missing entry point');
ok(message.includes('mutate()'), 'the error names the API that was called');

// 3) after importing the entry point the same call succeeds
await import('../src/jsnq');
const q2: any = ss.createStore({ users: [{ id: 1, active: true, score: 0 }] }, 'with-bridge');
q2.users.mutate(where('active', '===', true), update('score', (s: number) => s + 1));
ok(q2.users()[0].score === 1, 'mutate works once the bridge entry point is imported');
const found = q2.users.$query(where('active', '===', true));
ok(Array.isArray(found) && found.length === 1, '$query works once the bridge is imported');

if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log('\nAll JSNQ-optional contract tests passed.');
