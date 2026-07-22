/**
 * Headless smoke for the standalone Angular SignalStore consuming jsnq
 * as an external dependency (proves the extraction: no in-tree jsnq folder).
 * Run: bun test/smoke.ts
 */
import { CreateStore, SignalStore } from '../src/index';
import { computed } from '@angular/core';
import '../src/jsnq'; // optional JSNQ entry point: required for mutate/$query
import { where, update, moveToMatches } from '@adsq/jsnq';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const ss = new SignalStore(undefined as any);

const direct = new CreateStore<{ count: number }>(ss, 'direct-select-smoke');
Object.assign(direct.returnStore(), { count: 0 });
direct.addToComputeStore('count');
const directSeen: number[] = [];
const directSub = direct.select((state: any) => state.count()).subscribe((value) => directSeen.push(value));
direct.setValueObserve('count', 1);
assert(directSeen.join(',') === '0,1', 'direct CreateStore select tracks computed fallback paths');
directSub.unsubscribe();

const store: any = ss.createStore(
  {
    users: [
      { id: 1, name: 'Ann', active: true },
      { id: 2, name: 'Bob', active: false, data: 'payload' },
      { id: 3, name: 'Cy', active: true },
    ],
    numbers: [1, 2, 3, 4],
    nested: { panel: { value: 0 } },
  } as any,
  'smoke'
);
const inst: any = (ss as any).getStore('smoke');
store.runtime = {};
store.runtime.dynamic = 'created-through-proxy';
assert(store.runtime.dynamic() === 'created-through-proxy', 'deep dynamic key assignment works through proxy');

// read
assert(store.users[0].name() === 'Ann', 'proxy read works');

// mutate through the proxy using jsnq operators
store.users.mutate(where('id', '===', 1), update('name', 'Ada'));
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[0].name === 'Ada', 'mutate via jsnq committed');
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[1].name === 'Bob', 'sibling intact (COW)');
assert(store.users[0].name() === 'Ada', 'proxy reflects committed mutation');

const domainRow = store.users.$queryOne(where('id', '===', 2));
assert(domainRow.id === 2 && domainRow.data === 'payload', '$queryOne preserves domain objects with a data field');
const beforeQuery = JSON.stringify(ss.readStore('smoke', 'users'));
const queryResult = store.users.$query(where('id', '===', 1), update('name', 'query-only'));
assert(queryResult[0].name === 'query-only', '$query transforms its isolated result');
assert(JSON.stringify(ss.readStore('smoke', 'users')) === beforeQuery, '$query actions do not mutate live store data');

const initialLength = store.numbers.length;
assert(store.numbers.push() === initialLength, 'push() with no arguments returns length');
assert(store.numbers.length === initialLength && !store.numbers().includes(undefined), 'push() with no arguments is a no-op');
const removed = store.numbers.splice(1);
assert(JSON.stringify(removed) === JSON.stringify([2, 3, 4]), 'splice(start) removes the remaining tail');
assert(JSON.stringify(store.numbers()) === JSON.stringify([1]), 'splice(start) commits native semantics');

const nestedValue = computed(() => store.nested.panel.value());
assert(nestedValue() === 0, 'nested batch computed starts at zero');
inst.batch(() => {
  store.nested.panel.value = 1;
  inst.batch(() => {
    store.nested.panel.value = 2;
  });
  assert(nestedValue() === 0, 'inner batch does not flush before outer batch completes');
});
assert(nestedValue() === 2, 'outer batch flushes the final nested value');
let batchErrorCaught = false;
try {
  inst.batch(() => {
    store.nested.panel.value = 3;
    throw new Error('expected batch failure');
  });
} catch {
  batchErrorCaught = true;
}
assert(batchErrorCaught && nestedValue() === 3, 'failed batch unwinds and flushes committed state');
store.nested.panel.value = 4;
assert(nestedValue() === 4, 'scheduler remains usable after failed batch');

const arrayWake = ss.createStore({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }, 'array-wake');
let shiftedRuns = 0;
let lengthRuns = 0;
const shiftedId = computed(() => { shiftedRuns++; return arrayWake.rows[1].id(); });
const rowCount = computed(() => { lengthRuns++; return arrayWake.rows.length; });
assert(shiftedId() === 2 && rowCount() === 3, 'array computed values start correctly');
const shiftedBase = shiftedRuns;
const lengthBase = lengthRuns;
arrayWake.rows.splice(0, 1);
assert(shiftedId() === 3 && shiftedRuns > shiftedBase, 'splice wakes shifted index consumer');
assert(rowCount() === 2 && lengthRuns > lengthBase, 'splice wakes array length consumer');

for (const dependencyMode of ['exact', 'container'] as const) {
  for (const batched of [false, true]) {
    const name = `branch-replace-${dependencyMode}-${batched}`;
    const branchStore: any = ss.createStore(
      { board: { rows: [{ cells: [{ value: 0 }] }] } },
      name,
      { dependencyMode }
    );
    const branchInstance: any = ss.getStore(name);
    let branchRuns = 0;
    const firstCell = computed(() => {
      branchRuns++;
      return branchStore.board.rows[0].cells[0].value();
    });

    assert(firstCell() === 0, `${name}: initial observed leaf`);
    const beforeReplace = branchRuns;
    const replace = () => {
      branchStore.board.rows = [{ cells: [{ value: 7 }] }];
    };
    if (batched) branchInstance.batch(replace);
    else replace();

    assert(firstCell() === 7, `${name}: observed descendant follows whole-array replacement`);
    assert(branchRuns > beforeReplace, `${name}: observed descendant was invalidated`);
  }
}

// fine-grained opt-in still available on the instance
assert(typeof inst.setPreciseMutationWake === 'function', 'preciseMutationWake API present');
inst.setPreciseMutationWake(true);
store.users.mutate(where('id', '===', 3), update('name', 'Cyrus'));
assert((ss.readStore('smoke', 'users') as Array<{ name: string }>)[2].name === 'Cyrus', 'precise-wake mutate committed');

const pendingStore = ss.waitForStore<{ ready: boolean }>('async-smoke', { timeoutMs: 500 });
queueMicrotask(() => ss.createStore({ ready: true }, 'async-smoke'));
const asyncStore = await pendingStore;
assert(asyncStore.ready() === true, 'waitForStore resolves after lazy creation');
assert(await ss.waitForStore('async-smoke') === asyncStore, 'waitForStore resolves existing proxy immediately');

let waitTimedOut = false;
try { await ss.waitForStore('missing-smoke', { timeoutMs: 0 }); }
catch (error) { waitTimedOut = String(error).includes('timed out'); }
assert(waitTimedOut, 'waitForStore timeout rejects');

const abortController = new AbortController();
const abortedWait = ss.waitForStore('aborted-smoke', { signal: abortController.signal });
abortController.abort();
let abortName = '';
try { await abortedWait; } catch (error) { abortName = (error as Error).name; }
assert(abortName === 'AbortError', 'waitForStore abort signal rejects with AbortError');

console.log('Angular SignalStore (consuming jsnq) headless smoke passed.');
