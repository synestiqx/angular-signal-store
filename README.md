# @synestiqx/angular-signal-store

Reactive, **proxy-based Angular store** with fine-grained signal wake (`exact`
dependency mode), array operations, live queries, and an optional precise
`mutate()` wake. Query/mutation logic is delegated to **[@synestiqx/jsondb](../jsondb_git)**,
which is a **separate dependency** (like `rxjs`) — there is no vendored jsondb copy
in this package.

## Install

```sh
npm i @synestiqx/angular-signal-store @synestiqx/jsondb
```

`@angular/core` and `rxjs` are peer dependencies.

## Usage

```ts
import { SignalStore } from '@synestiqx/angular-signal-store';
import { where, update } from '@synestiqx/jsondb';

const ss = new SignalStore();
const store = ss.createStore({ users: [{ id: 1, name: 'Ann' }] }, 'app');

store.users[0].name();                                  // reactive read
store.users.mutate(where('id', '===', 1), update('name', 'Ada')); // mutate via jsondb
```

### Fine-grained mutate wake (opt-in)

```ts
const inst = ss.getStore('app');
inst.setPreciseMutationWake(true); // wake only changed leaves + branch, skip syncDescendants
```

## Scripts

```sh
bun run test:smoke   # headless smoke (verifies consuming @synestiqx/jsondb)
bun run typecheck
bun run build        # emit dist/ for publishing (ng-packagr recommended for full Angular pkg)
```

> This folder is the store **library** only (the demo `store.component`, `nestable`,
> perf lab and devtools UI were intentionally excluded). For a production npm release,
> build with `ng-packagr` to produce Angular Package Format output.

## License

MIT
