/**
 * Headless smoke for the standalone Angular SignalStore consuming @synestiqx/jsondb
 * as an external dependency (proves the extraction: no in-tree jsondb folder).
 * Run: bun test/smoke.ts
 */
import { SignalStore } from '../src/index';
import { where, update, moveToMatches } from '@synestiqx/jsondb';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const ss = new SignalStore(undefined as any);
const store: any = ss.createStore(
  {
    users: [
      { id: 1, name: 'Ann', active: true },
      { id: 2, name: 'Bob', active: false },
      { id: 3, name: 'Cy', active: true },
    ],
  } as any,
  'smoke'
);

// read
assert(store.users[0].name() === 'Ann', 'proxy read works');

// mutate through the proxy using @synestiqx/jsondb operators
store.users.mutate(where('id', '===', 1), update('name', 'Ada'));
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[0].name === 'Ada', 'mutate via @synestiqx/jsondb committed');
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[1].name === 'Bob', 'sibling intact (COW)');
assert(store.users[0].name() === 'Ada', 'proxy reflects committed mutation');

// fine-grained opt-in still available on the instance
const inst: any = (ss as any).getStore('smoke');
assert(typeof inst.setPreciseMutationWake === 'function', 'preciseMutationWake API present');
inst.setPreciseMutationWake(true);
store.users.mutate(where('id', '===', 3), update('name', 'Cyrus'));
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[2].name === 'Cyrus', 'precise-wake mutate committed');

console.log('Angular SignalStore (consuming @synestiqx/jsondb) headless smoke passed.');
