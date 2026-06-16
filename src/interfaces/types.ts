// src/app/store/interfaces/types.ts

/**
 * Shared types for the store library – refined for strong typing.
 */

import type { CallableProxy, SignalType, StoreData } from '../types/advanced-types';
import type { IStoreInstance } from './store-instance.interface';

/**
 * Type for a callable proxy created for nested paths.
 * It is a function that returns the current value and exposes deep
 * property access as further callable proxies. Additionally, it provides
 * `$signal` and `$val` convenience getters.
 */
export type ProxyCallable<T = unknown> = CallableProxy<T> & {
  readonly $signal?: SignalType<T>;
  readonly $val?: T;
};

/**
 * Type for the root store proxy. Each field of the store is exposed
 * as a callable proxy while all store instance methods are also available.
 */
export type StoreProxy<T extends StoreData = StoreData> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? T[K] : ProxyCallable<T[K]>;
} & IStoreInstance<T>;

/**
 * opinia5 parity: type vocabulary for the $-namespace (reactive jsondb read/subscribe surface)
 * exposed at runtime by every proxy node (createSnapshotQueryMethod / createLiveQueryMethod /
 * proxyApiHandlers). Mirrors solid-store's StoreLeaf $-methods. These are intentionally NOT wired
 * into the pervasive `CallableProxy<T>` type (which, by existing convention, also leaves the bare
 * `mutate`/`query`/`pipeline` runtime methods untyped) — wiring them there is a separate, wider
 * type change. Until then, use these shapes when you want the $-surface typed.
 */
export type StoreSubscription = { unsubscribe(): void; dispose(): void };

export type StoreSubscribeOptions<T> = {
  equals?: (a: T, b: T) => boolean;
  immediate?: boolean;
  onError?: (error: unknown) => void;
};

/** Reactive query handle: callable accessor for the current result (read in computed/effect/template). */
export type StoreLiveQuery<T> = () => T;

export interface StoreDollarApi {
  $query(...ops: unknown[]): unknown[];
  $queryOne(...ops: unknown[]): unknown;
  $liveQuery(...ops: unknown[]): StoreLiveQuery<unknown[]>;
  $liveQueryOne(...ops: unknown[]): StoreLiveQuery<unknown>;
  $mutate(...ops: unknown[]): unknown;
}
