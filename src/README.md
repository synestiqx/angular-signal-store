# Signal Store – Type-safe selection

This library now supports optional type-safe selection alongside string paths.

- `select(project)` – returns `Observable<TOut>` that re-emits when any dependency read during `project` changes.
- `computedOf(project)` – returns Angular `Signal<TOut>` with the same dependency semantics.

Example:

```ts
const store = signalStore.createStore<AppState>(initial, 'app');

// Observable
const name$ = store.select(s => s.user.profile.name());

// Signal
const firstTitle = store.computedOf(s => s.user.posts[0]?.title());
```

Notes:
- The `project` function should perform normal reads via callable proxy/signal access (e.g. `name()`), so the store can collect dependencies.
- Works alongside existing `getObservable('a.b')` and `getComputed('a.b')` APIs.

## Updated `select()` behavior (lifecycle-safe)

`select(project)` still returns an `Observable<TOut>` with the same semantics for subscribers, but its internal lifecycle was improved:

- The internal reactive watcher is created lazily on the first subscription and destroyed when the last subscriber unsubscribes.
- The first emission is the current value of the projection (no duplicate initial emission).
- No background recomputation when there are no subscribers (reduces overhead and potential leaks).

This is a non‑breaking change: the API shape and timing for consumers remain the same. Existing code using `select()` continues to work without changes.

## Public API and Options

- `signalStore.createStore<T>(initial, name, options?)` → returns `StoreProxy<T>`
  - `useInPlaceIteration?: boolean` — small perf tweak for path resolution.
  - `dependencyMode?: 'exact' | 'container'` — how computed/selection track dependencies.
  - `cloneInitialValue?: 'none' | 'structured'` — control cloning of initial state.
  - `strict?: { invalidPath?: boolean; rootRxjs?: boolean; deleteUndefined?: boolean }` — optional strict mode toggles; default off for backwards compatibility.
  - `rxjsAllowedOnRoot?: boolean` — allow `pipe/subscribe` on root proxy; default true.
  - `metricsThrottleMs?: number` — throttle DevTools proxy metrics emission; default 250ms.

## Strict Mode

- `invalidPath: true` — throws on invalid string paths for set/delete instead of warning.
- `rootRxjs: true` — using `pipe`/`subscribe` on the root proxy throws.
- `deleteUndefined: true` — deleting (setting `undefined`) via proxy throws.

## Dependency Mode Tips

- `exact` is precise and minimal. `container` invalidates on parent containers. In `container` mode the library warns in dev when very broad dependencies are detected (e.g., top-level-only paths).
