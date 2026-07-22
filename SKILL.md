---
name: angular-signal-store
description: Use @adsq/angular-signal-store to build Angular state as a callable nested proxy — reads like store.user.name(), writes like store.user.name = 'Ada', with per-path signal wake and JSNQ queries over arrays. Use when writing or reviewing Angular components, services, or templates in a project that depends on @adsq/angular-signal-store, and when building live-editing UIs such as slider-driven design tools.
---

# @adsq/angular-signal-store

A reactive store for Angular built on a callable nested proxy. Reading a path returns its
value and subscribes the caller to that exact path; assigning to it writes and wakes only
the consumers of that path. There are no actions, reducers, selectors, or dispatch.

Install: `npm install @adsq/angular-signal-store`. `@adsq/jsnq` is a peer dependency and
installs automatically; declare it too when the app imports JSNQ operators directly.

## The architecture rule — read this first

**Build the entire application on the store, with no native signals of your own.** Do not
create `signal()` / `computed()` copies of data that already lives in the store, and do not
keep a parallel `signal()` alongside a store path. A copy is a second source of truth: the
store write updates the proxy, the copy keeps the stale value, and the UI desyncs in a way
that is hard to trace.

State goes in the store. The template reads the store. Event handlers assign to the store.
That is the whole loop. If a component needs derived data, derive it with `computed()` that
*reads store paths* — never one that caches a snapshot taken once.

```ts
// WRONG — a second source of truth that will drift
readonly name = signal(this.store.user.name());

// RIGHT — derives from the store on every read
readonly greeting = computed(() => `Hello ${this.store.user.name()}`);
```

## Where this store is a particularly good fit

Live-editing interfaces where many small values change continuously and each one drives a
different piece of the DOM — **design tools whose sliders modify appearance and style in
real time**. A slider bound to `store.design.card.radius` wakes only the bindings that read
that path, so dragging it does not re-render the rest of the editor. The same applies to
theme editors, layout inspectors, and property panels: dozens of independent numeric
inputs, each with its own narrow set of consumers.

## Creating a store

```ts
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly store = this.signalStore.createStore<AppState>({
    user: { name: 'Ann', tags: ['admin'] },
    dashboard: { tiles: 12 },
    services: [{ name: 'api', rps: 120 }],
  }, 'app');

  constructor(private readonly signalStore: SignalStore) {}
}
```

The service owns `this.store` and uses it directly. `waitForStore` is only for a consumer
that may run *before* the owner creates a named store:

```ts
const store = await signalStore.waitForStore<AppState>('app', { timeoutMs: 5_000 });
signalStore.useStore('app');  // synchronous; throws when missing
signalStore.getStore('app');  // the store instance (batch, wakeUp, destroy)
```

## Reading and writing

```ts
store.user.name();                                  // reactive read
store.user.name = 'Ada';                            // write
store.dashboard.tiles = store.dashboard.tiles() + 1;
store.user.tags.push('maintainer');
store.user.tags.pop();
store.user.preferences = {};                        // dynamic nested keys
store.user.preferences.theme = 'dark';
```

Declare optional fields or an index signature when TypeScript must accept keys absent from
the initial interface.

## In a template

Expose the proxy as a component field and read it directly. No `async` pipe, no `signal()`
wrapper, no subscription.

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

<span>{{ store.history.length }} samples</span>
<button (click)="addTile()">Add tile</button>
```

Three rules cover every template:

1. **A leaf is called.** `{{ store.user.name() }}`. The call *is* the reactive read.
2. **An array is called to iterate it, and each item is a plain value.** Write
   `@for (service of store.services(); track service.name)` and then `{{ service.name }}` —
   **no parentheses on the item**. Items are snapshots, not nested accessors. This is the
   most common mistake.
3. **`length` is reactive without a call.** `{{ store.history.length }}` tracks pushes and
   pops without materialising the array.

## Batching and wake modes

```ts
const instance = signalStore.getStore('app');

instance.batch(() => {
  store.user.name = 'Ada';
  store.dashboard.tiles = 16;
});

instance.wakeUp('user.name', 'grained'); // exact path only
instance.wakeUp('user.name', 'leaf');    // path plus its parent chain
```

Writes inside `batch()` are synchronous and immediately readable; notifications flush once
after the outermost batch, including on exception paths. A single write needs no batch.

| Mode | Paths dirtied | Use |
| --- | --- | --- |
| `grained` | Exact path only | Maximum granularity for leaf consumers. |
| `leaf` | Path plus parent chain | Default targeted wake; refreshes container consumers. |

`exact` and `granular` are aliases for `grained`.

## Queries and bulk mutations (JSNQ)

The core does not import the JSNQ engine. Import the entry point once in an application
that calls `mutate`, `$query`, or `$liveQuery` — otherwise those calls throw an actionable
error. Registration is synchronous, so there is no async timing hazard:

```ts
import '@adsq/angular-signal-store/jsnq';
import where from '@adsq/jsnq/operators/where';
import update from '@adsq/jsnq/operators/update';

store.users.mutate(
  where('active', '===', true),
  update('score', (score: number) => score + 1),
);

const active = store.users.$query(where('active', '===', true));    // one-shot snapshot
const one    = store.users.$queryOne(where('id', '===', 1));
const live   = store.users.$liveQuery(where('active', '===', true)); // callable accessor
live();  // read inside a template, computed, or effect
```

`$query` / `$queryOne` are snapshots. `$liveQuery` / `$liveQueryOne` return signal-style
callable accessors that rerun when their tracked branch changes.

## Devtools

```ts
import { provideSignalStoreDevtools } from '@adsq/angular-signal-store/devtools';

providers: [...(isDevMode() ? [provideSignalStoreDevtools()] : [])]
```

Applications that never import `/devtools` do not load its implementation.

## Checklist when writing code against this store

- Never mirror store data into a `signal()`; read the store path instead.
- Call leaves (`path()`), do not call loop items (`item.field`).
- Use `track` in `@for` — prefer a stable id over `$index` for reordered data.
- Reach for `batch()` only when several writes must be observed as one update.
- Import `@adsq/angular-signal-store/jsnq` once before using `mutate` / `$query`.
- Use `mutate` / `$query` for array-wide work instead of hand-rolled loops.
- Do not import from `dist/` or deep internal paths; use the documented entries only.
