import { performance } from 'node:perf_hooks';
import { SignalStore } from '../src';

type BenchCase = {
  name: string;
  iterations: number;
  primitiveOpsPerIteration: number;
  run(iterations: number): number;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

function measure(test: BenchCase): void {
  test.run(Math.min(10_000, test.iterations));
  const samples: number[] = [];
  let checksum = 0;
  for (let round = 0; round < 5; round++) {
    const started = performance.now();
    checksum += test.run(test.iterations);
    samples.push(performance.now() - started);
  }
  const medianMs = median(samples);
  const primitiveOps = test.iterations * test.primitiveOpsPerIteration;
  const primitiveOpsPerSecond = Math.round((primitiveOps / medianMs) * 1_000);
  const workloadsPerSecond = Math.round((test.iterations / medianMs) * 1_000);
  console.log(`${test.name}\t${medianMs.toFixed(3)}\t${workloadsPerSecond}\t${primitiveOpsPerSecond}\t${checksum}`);
}

const signalStore = new SignalStore(null);
signalStore.devActivation(false);
const store: any = signalStore.createStore({
  key: 'initial',
  user: {
    profile: { name: 'Ann' },
    items: Array.from({ length: 100 }, (_, id) => ({ id, title: `Item ${id}` })),
  },
}, 'store-throughput', { dependencyMode: 'exact' });
const instance: any = signalStore.getStore('store-throughput');
store.setTrackReads?.(false);
store.setBehaviorUpdatesEnabled?.(false);
instance.createServiceGetter?.setAutoBatchBumps?.(true);
const profile = store.user.profile;
const items = store.user.items;

console.log('case\tmedianMs\tworkloads/s\tprimitive-ops/s\tchecksum');

measure({
  name: 'angular-proxy-deep-read-full-navigation',
  iterations: 500_000,
  primitiveOpsPerIteration: 1,
  run(iterations) {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) checksum += store.user.profile.name().length;
    return checksum;
  },
});

measure({
  name: 'angular-proxy-deep-write-full-navigation',
  iterations: 200_000,
  primitiveOpsPerIteration: 1,
  run(iterations) {
    for (let i = 0; i < iterations; i++) store.user.profile.name = `N${i}`;
    return store.user.profile.name().length;
  },
});

measure({
  name: 'angular-proxy-deep-write-cached-parent',
  iterations: 200_000,
  primitiveOpsPerIteration: 1,
  run(iterations) {
    for (let i = 0; i < iterations; i++) profile.name = `C${i}`;
    return profile.name().length;
  },
});

measure({
  name: 'angular-proxy-push-pop-full-navigation',
  iterations: 100_000,
  primitiveOpsPerIteration: 2,
  run(iterations) {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) {
      store.user.items.push({ id: i, title: `P${i}` });
      checksum += store.user.items.pop()?.id ?? 0;
    }
    return checksum;
  },
});

measure({
  name: 'angular-proxy-push-pop-cached-node',
  iterations: 100_000,
  primitiveOpsPerIteration: 2,
  run(iterations) {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) {
      items.push({ id: i, title: `P${i}` });
      checksum += items.pop()?.id ?? 0;
    }
    return checksum;
  },
});

measure({
  name: 'angular-proxy-three-write-batch',
  iterations: 100_000,
  primitiveOpsPerIteration: 3,
  run(iterations) {
    for (let i = 0; i < iterations; i++) {
      instance.batch(() => {
        store.key = `K${i}`;
        profile.name = `B${i}`;
        items[0].title = `T${i}`;
      });
    }
    return store.key().length + profile.name().length + items[0].title().length;
  },
});

if (items.length !== 100) throw new Error(`push/pop length drifted to ${items.length}`);
signalStore.destroyStore('store-throughput');
