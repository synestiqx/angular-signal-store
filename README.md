# Angular SignalStore

Angular signal store with a callable nested proxy API. It uses the independent `@adsq/jsnq` package for path traversal, queries, and copy-on-write mutation hot paths.

## Install

```sh
npm install @adsq/angular-signal-store
# or
bun add @adsq/angular-signal-store
```

`@adsq/jsnq` is a peer dependency, so npm and bun install it for you. Declare it in your
own `package.json` as well when the application imports JSNQ operators directly, so that
strict installers such as pnpm and Yarn PnP resolve those imports:

```sh
npm install @adsq/jsnq
```

Angular, RxJS, and JSNQ are peers. The package supports Angular 20 through 22, is APF partial-compiled with the lowest supported Angular version, and is tested against the current Angular 22 line. This avoids a second Angular runtime and keeps forward linker compatibility.

## Store In An Angular Service

```ts
import { Injectable } from '@angular/core';
import { SignalStore } from '@adsq/angular-signal-store';

type AppState = {
  user: { name: string; tags: string[]; preferences?: Record<string, unknown> };
  dashboard: { tiles: number };
};

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly store = this.signalStore.createStore<AppState>({
    user: { name: 'Ann', tags: ['admin'] },
    dashboard: { tiles: 12 },
  }, 'app');

  constructor(private readonly signalStore: SignalStore) {}
}
```

This normal service pattern does not need `waitForStore`: the service owns `this.store`, so its methods read and mutate that proxy directly.

```ts
rename(name: string): void {
  this.store.user.name = name;
}

currentName(): string {
  return this.store.user.name();
}
```

Component usage:

```ts
const store = appStore.store;

store.user.name();
store.user.name = 'Ada';
store.user.tags.push('maintainer');
store.user.tags.pop();
store.dashboard.tiles = store.dashboard.tiles() + 1;
```

## In A Component Template

Expose the proxy as a component field and read it directly in the template. No `async`
pipe, no `signal()` wrapper, no subscription:

```ts
@Component({ selector: 'app-dashboard', templateUrl: './dashboard.component.html' })
export class DashboardComponent {
  readonly store = this.appStore.store;

  constructor(private readonly appStore: AppStore) {}

  addTile(): void {
    this.store.dashboard.tiles = this.store.dashboard.tiles() + 1;
  }
}
```

```html
<h1>{{ store.user.name() }}</h1>
<p>{{ store.dashboard.tiles() }} tiles</p>

@for (tag of store.user.tags(); track tag) {
  <span class="tag">{{ tag }}</span>
}

@for (service of store.services(); track service.name) {
  <div class="row">
    <strong>{{ service.name }}</strong>
    <span>{{ service.rps }}</span>
  </div>
}

<button (click)="addTile()">Add tile</button>
```

Three rules cover every template:

- **A leaf is called**: `{{ store.user.name() }}`. The call is the reactive read, so only
  this component's bindings for that path rerender when it changes.
- **An array is called to iterate it**, then each item is a plain value read without
  parentheses: `@for (service of store.services(); track service.name)` then
  `{{ service.name }}`. Items are snapshots, not nested accessors.
- **`length` is reactive without a call**: `{{ store.history.length }}` tracks pushes and
  pops without materialising the array.

Writes stay ordinary assignments, so an event handler is a one-liner and needs no action,
reducer, or dispatch.

Dynamic nested keys are supported by the runtime proxy:

```ts
store.user.preferences = {};
store.user.preferences.theme = 'dark';
store.user.preferences.theme();
```

Declare optional fields or an index signature when TypeScript must accept keys that are not present in the initial interface.

## JSNQ Operations

```ts
import where from '@adsq/jsnq/operators/where';
import update from '@adsq/jsnq/operators/update';

store.users.mutate(
  where('active', '===', true),
  update('score', (score: number) => score + 1),
);

const active = store.users.$query(where('active', '===', true));
const first = store.users.$queryOne(where('id', '===', 1));
const liveActive = store.users.$liveQuery(where('active', '===', true));

liveActive(); // reactive accessor: use in a template, computed, or effect
```

`$query` and `$queryOne` read a one-shot snapshot. `$liveQuery` and `$liveQueryOne`
return Angular signal-style callable accessors and rerun when their tracked branch changes.
JSNQ is versioned separately. The store imports public JSNQ subpaths instead of maintaining
a private traversal/pipeline copy. Operators can be imported individually.

## Lazy Creation

Initial data is cloned when `createStore` runs. Everything reactive around it is demand-driven:

- nested proxies are created on first navigation;
- Angular version signals are created on first tracked path read;
- computed values, array query memos, RxJS bindings and BehaviorSubjects are created only when their APIs are used;
- proxy/query caches use bounded or weak-reference storage where identity permits it;
- devtools is a separate secondary entry and has no provider unless explicitly enabled;
- named-store waiters are allocated only while code awaits creation.

No subscription or BehaviorSubject is created for an untouched path. RxJS remains an Angular peer dependency, but stream objects are not eagerly allocated per field.

## Named Stores And Async Creation

Use `waitForStore` only across an asynchronous ownership boundary where consumer code may run before the service/module that creates the named store. It is not required when a service already exposes its own `store` property.

```ts
const pending = signalStore.waitForStore<AppState>('app', {
  timeoutMs: 5_000,
  signal: abortController.signal,
});

const store = await pending;
signalStore.useStore('app'); // synchronous; throws when missing
```

`waitForStore` is event-driven and removes abort/timeout resources on every completion path.

## Batch And Wake Modes

```ts
const instance = signalStore.getStore('app');

instance.batch(() => {
  store.user.name = 'Ada';
  store.dashboard.tiles = 16;
});

instance.wakeUp('user.name', 'grained'); // exact path only
instance.wakeUp('user.name', 'leaf');    // path plus parent chain
```

Canonical wake modes:

| Mode | Paths dirtied | Use case |
| --- | --- | --- |
| `grained` | Exact requested path only | Maximum granularity for leaf consumers. |
| `leaf` | Requested path plus its parent chain | Default targeted wake; refreshes container consumers too. |

`exact` and `granular` are compatibility aliases for `grained`. Unlike SolidStore's
one-argument global mode setter, Angular `wakeUp(path, mode)` always performs a targeted
wake. Store construction option `dependencyMode: 'exact' | 'container'` controls whether
tracked computations depend on exact paths or containers; it is separate from an explicit
`wakeUp` call.

Writes inside `batch()` remain synchronous and immediately readable. Version notifications
are queued and flushed once after the outer batch ends, including exception paths. Nested
batches are supported. Individual proxy writes need no explicit batch; use it when several
writes must be observed as one coherent update. Array mutations also invalidate shifted
indices and reactive `length` reads.

## Optional Devtools

```ts
import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideSignalStoreDevtools } from '@adsq/angular-signal-store/devtools';

export const appConfig: ApplicationConfig = {
  providers: [
    ...(isDevMode() ? [provideSignalStoreDevtools()] : []),
  ],
};
```

Applications that never import the `/devtools` entry do not load its implementation. The main entry contains only the injection token and adapter types.

## Package Entries

- `@adsq/angular-signal-store`: store runtime and public types.
- `@adsq/angular-signal-store/devtools`: optional development adapter/provider.
- `@adsq/jsnq/operators/<name>`: focused JSNQ operators.

## Use With AI Coding Agents

The package ships a `SKILL.md` written in the [Agent Skills](https://agentskills.io)
format, covering the architecture rule, the template rules, batching, wake modes, and JSNQ.
Install it so an agent applies the store correctly instead of guessing at the proxy API:

```sh
# this project only
mkdir -p .claude/skills/angular-signal-store
cp node_modules/angular-signal-store/SKILL.md .claude/skills/angular-signal-store/

# or for every project
mkdir -p ~/.claude/skills/angular-signal-store
cp node_modules/angular-signal-store/SKILL.md ~/.claude/skills/angular-signal-store/
```

Claude Code picks the skill up without a restart and loads it when the task involves this
store. Agents that do not read `.claude/skills/` can be pointed at
`node_modules/angular-signal-store/SKILL.md` directly.

## Verify

```sh
npm run typecheck
npm run test:smoke
npm run build
npm pack --dry-run
```

## Bundle Size

Measured from the APF FESM with esbuild minification. Angular, RxJS, and JSNQ remain external peers:

| Entry | Minified | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| Angular Store core | 98.0 kB | 25.6 kB | 22.5 kB |
| Optional devtools | 4.1 kB | 1.4 kB | 1.2 kB |

Applications only pay for the devtools entry when they import it.

## License

MIT
