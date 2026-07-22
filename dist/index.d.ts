import * as _angular_core from '@angular/core';
import { Signal, WritableSignal, InjectionToken } from '@angular/core';
export { Signal } from '@angular/core';
import * as rxjs from 'rxjs';
import { Observable, BehaviorSubject, Subscription } from 'rxjs';

type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
type Prev<Depth extends number> = Depth extends keyof PrevDepth ? PrevDepth[Depth] : never;
type ArrayPathKeys<T, Depth extends number> = T extends readonly (infer U)[] ? U extends Record<PropertyKey, unknown> ? `${number}` | `${number}.${PathKeys<U, Prev<Depth>>}` : `${number}` : never;
type ObjectPathKeys<T, Depth extends number> = T extends Record<PropertyKey, unknown> ? {
    [K in keyof T]: K extends string | number ? T[K] extends Record<PropertyKey, unknown> | readonly unknown[] ? `${K}` | `${K}.${PathKeys<T[K], Prev<Depth>>}` : `${K}` : never;
}[keyof T] : never;
type PathKeys<T, Depth extends number = 12> = [Depth] extends [never] ? never : Depth extends 0 ? never : ArrayPathKeys<T, Depth> | ObjectPathKeys<T, Depth>;
type PathValue<T, P extends string> = P extends `${infer Key}.${infer Rest}` ? Key extends keyof NonNullable<T> ? PathValue<NonNullable<T>[Key], Rest> : Key extends `${number}` ? NonNullable<T> extends readonly (infer U)[] ? PathValue<U, Rest> : unknown : unknown : P extends keyof NonNullable<T> ? NonNullable<T>[P] : P extends `${number}` ? NonNullable<T> extends readonly (infer U)[] ? U : unknown : unknown;
type ValidPath<T> = PathKeys<T> | string;
type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
type ArrayMutationMethod = 'push' | 'pop' | 'shift' | 'unshift' | 'splice' | 'reverse' | 'sort';
type ArrayQueryMethod = 'find' | 'findIndex' | 'filter' | 'map' | 'reduce' | 'some' | 'every' | 'includes' | 'indexOf';
type ArrayMethod = ArrayMutationMethod | ArrayQueryMethod;
type QueryMethodResult<T, M extends ArrayQueryMethod> = M extends 'find' ? T | undefined : M extends 'findIndex' | 'indexOf' ? number : M extends 'filter' | 'map' ? T[] : M extends 'some' | 'every' | 'includes' ? boolean : M extends 'reduce' ? unknown : never;
type MutationMethodResult<T, M extends ArrayMutationMethod> = M extends 'push' | 'unshift' ? number : M extends 'pop' | 'shift' ? T | undefined : M extends 'splice' ? T[] : M extends 'reverse' | 'sort' ? T[] : never;
type PredicateFn<T> = (item: T, index: number, array: T[]) => boolean;
type MapFn<T, R> = (item: T, index: number, array: T[]) => R;
type ReduceFn<T, R> = (accumulator: R, currentValue: T, currentIndex: number, array: T[]) => R;
interface ArrayOperationResult<T, M extends ArrayMethod> {
    method: M;
    success: boolean;
    result: M extends ArrayQueryMethod ? QueryMethodResult<T, M> : M extends ArrayMutationMethod ? MutationMethodResult<T, M> : unknown;
}
interface SpliceOperation {
    start: number;
    deleteCount?: number;
    items: unknown[];
}
type ObservableType<T> = rxjs.Observable<T>;
type SignalType<T> = _angular_core.Signal<T>;
type BehaviorSubjectType<T> = rxjs.BehaviorSubject<T>;
type StoreData = Record<string, unknown>;
type IsFunction<T> = T extends (...args: unknown[]) => unknown ? true : false;
type CallableProxy<T> = T & {
    (): T;
} & {
    [K in keyof T]: IsFunction<T[K]> extends true ? T[K] : CallableProxy<T[K]>;
};

type CacheMetrics$1 = {
    hits: number;
    misses: number;
    hitRate: number;
};

interface WakeUpPathOptions {
    ensureBehavior?: boolean;
    syncDescendants?: boolean;
}

type StoreWakeupMode = 'leaf' | 'grained' | 'granular' | 'exact' | 'graied' | 'graned';
declare class CreateStoreService<TState extends StoreData = StoreData> {
    private storeName;
    readonly signalStore: SignalStore;
    private readonly dependencyTracker;
    private usingComputedStoreFallback;
    startCollect(): void;
    stopCollect(): Set<string> | null;
    registerRead(path: string): void;
    registerReadNormalized(path: string): void;
    setTrackReads(enabled: boolean): void;
    getTrackReads(): boolean;
    isCollectingReads(): boolean;
    private trackProjection;
    private readonly versionPolicy;
    setDependencyMode(mode: 'exact' | 'container'): void;
    getDependencyMode(): 'exact' | 'container';
    private warnOnWideDependencies;
    resolveVersionPath(path: string): string;
    resolveVersionPathNormalized(normalized: string): string;
    private readonly pathReader;
    private bumpScheduler;
    private versionBumpCoordinator;
    private readonly wakeupModeHandlers;
    private reactivityWakeup;
    beginAction(): void;
    endAction(): void;
    flushPendingBumps(): void;
    setAutoBatchBumps(enabled: boolean): void;
    getAutoBatchBumps(): boolean;
    setBumpNumericParent(enabled: boolean): void;
    getBumpNumericParent(): boolean;
    setVersionBumpStrategy(strategy: 'microtask' | 'raf'): void;
    setVersionBumpThrottle(ms: number): void;
    setPartialInvalidation(enabled: boolean): void;
    /** Delegated to PathReader (universal path traversal engine) */
    getPathSegments(path: string): readonly string[];
    /** No-op: PathReader handles its own cache eviction */
    clearPathSegmentCache(_pathPrefix: string): void;
    /** Delegated to PathReader */
    fastReadBySegments(root: unknown, pathSegments: readonly string[]): unknown;
    private _versionSvc?;
    private get versionSvc();
    private cloneComputedOutputs;
    private behaviorUpdatesEnabled;
    private _storeProxy?;
    private readonly devToolsEmitter;
    private _computedSvc?;
    private _behaviorSvc?;
    private get computedSvc();
    private get behaviorSvc();
    updateBehaviorsBySegments(path: string, newValue?: unknown): void;
    wakeUpMutationPath(path: string, value: unknown, options?: WakeUpPathOptions, behaviorUpdater?: (path: string, value: unknown) => void): boolean;
    wakeUpMutationPathNormalized(normalized: string, value: unknown, options?: WakeUpPathOptions, behaviorUpdater?: (path: string, value: unknown) => void): boolean;
    performMutationWithWakeUp(path: string, value: unknown, mutateFn: () => void, options?: WakeUpPathOptions, behaviorUpdater?: (path: string, value: unknown) => void): boolean;
    wakeUpArrayMutation(path: string, value: unknown, afterVersion?: () => void, behaviorUpdater?: (path: string, value: unknown) => void): void;
    wakeUpVersionPath(path: string, mode?: StoreWakeupMode): void;
    wakeUpVersionPathWithMode(path: string, mode: StoreWakeupMode): void;
    private getWakeupModeHandler;
    private getStoreProxy;
    select<TOut>(project: (s: TState) => TOut): Observable<TOut>;
    computedOf<TOut>(project: (s: TState) => TOut): Signal<TOut>;
    private observableMethodCache;
    private readonly proxyCacheManager;
    constructor(storeName: string, signalStore: SignalStore);
    getProxyFromCache(path: string): ProxyCallable | undefined;
    getOrCreateProxy<T>(path: string, createProxyFn: (path: string, value: T) => ProxyCallable, getValueFn: (path: string) => T | undefined): ProxyCallable | undefined;
    addProxyToCache(path: string, proxy: ProxyCallable): void;
    deleteProxyFromCache(path: string): void;
    isProxyInCache(path: string): boolean;
    hasIndexedProxyCacheFrom(path: string, startIndex: number): boolean;
    deleteIndexedProxyCacheRange(path: string, startIndex: number, endIndex: number): void;
    hasIndexedDerivedNodeFrom(path: string, startIndex: number): boolean;
    getProxyCacheKeys(): string[];
    getProxyCache(): {
        [key: string]: WeakRef<ProxyCallable>;
    };
    cleanupProxyCache(pathPrefix?: string): void;
    getProxyCacheMetrics(): CacheMetrics$1 & {
        cacheSize: number;
        cacheKeys: string[];
    };
    resetProxyCache(): void;
    recordProxyCacheHit(): void;
    recordProxyCacheMiss(): void;
    getProxyCacheEntry(path: string): ProxyCallable | undefined;
    setProxyCacheEntry(proxy: ProxyCallable, path: string): void;
    clearProxyCacheForPath(path: string): void;
    getProxyCacheDump(): Array<{
        key: string;
        value: string;
    }>;
    getSignalFromProxyCache(path: string): Signal<unknown> | undefined;
    setSignalInProxyCache(path: string, signalRef: Signal<unknown>): void;
    emitProxyMetrics(metrics: {
        hits: number;
        misses: number;
        hitRate: number;
        cacheSize: number;
    }): void;
    setCloneComputedOutputs(enabled: boolean): void;
    getCloneComputedOutputs(): boolean;
    setBehaviorUpdatesEnabled(enabled: boolean): void;
    getBehaviorUpdatesEnabled(): boolean;
    emitBehaviorSubscriptionStats(): void;
    emitBehaviorStats(): void;
    getCachedObservableMethod(path: string, method: string, observable: object): (...args: unknown[]) => unknown;
    createArrayQueryComputed<P extends ValidPath<TState> & string, M extends ArrayQueryMethod | 'length', A = PathValue<TState, P>, E = ArrayElement<A>, R = M extends 'length' ? number : ArrayOperationResult<E, Extract<M, ArrayQueryMethod>>['result']>(path: P, method: M, predicate: M extends 'includes' | 'indexOf' ? E : M extends 'find' | 'findIndex' | 'filter' | 'some' | 'every' ? PredicateFn<E> : M extends 'map' ? MapFn<E, unknown> : M extends 'reduce' ? ReduceFn<E, unknown> : undefined, ...args: unknown[]): Signal<R> | undefined;
    registerPipelineComputed(path: string, signalRef: Signal<unknown>): void;
    addToComputeStore(path: string): void;
    deleteFromComputeStore(path: string): void;
    getComputed(path: string): Signal<unknown> | undefined;
    addToBehaviorStoreIfExists(path: string): void;
    getObservableIfExists(path: string): Observable<unknown> | undefined;
    addToBehaviorStore(path: string): void;
    addBehaviorSubscription(path: string): Observable<unknown>;
    removeBehaviorSubscription(_path: string): void;
    hasActiveSubscriptions(path: string): boolean;
    getSubscriptionCount(path: string): number;
    getObservableWithPipe<T = unknown>(path: string, pipeFn?: (obs: Observable<unknown>) => Observable<T>): Observable<T>;
    getObservable(path: string): BehaviorSubject<unknown>;
    getTrackedObservable(path: string): Observable<unknown>;
    updateBehaviorByPrefix(pathPrefix: string, options?: {
        skipSelf?: boolean;
    }): void;
    updateDescendantBehaviorsByPrefix(pathPrefix: string): void;
    syncDescendantsAfterBranchMutation(pathPrefix: string): void;
    isBehaviorExists(path: string): boolean;
    isComputedExists(path: string): boolean;
    deleteBehavior(path: string): void;
    deleteComputed(path: string): void;
    getBehaviorStore(): Record<string, BehaviorSubject<unknown>>;
    getComputedStore(): Record<string, Signal<unknown>>;
    cleanupBehaviorStore(pathPrefix?: string): void;
    cleanupInactiveBehaviorNodes(pathPrefix?: string): void;
    cleanupComputedStore(pathPrefix?: string): void;
    destroy(): void;
    getVersion(path: string): WritableSignal<number>;
    bumpVersionsFor(path: string): void;
    bumpVersionsForNormalized(normalized: string): void;
    bumpDescendantVersionsFor(pathPrefix: string): void;
    bumpDescendantVersionsForNormalized(normalizedPrefix: string): void;
    cleanupVersionStore(pathPrefix?: string): void;
    /** @deprecated Kept for compatibility; use normal mutation wake-up paths instead. */
    bumpVersionsFromPatches(patches: Array<{
        op: string;
        path: Array<string | number>;
    }>): void;
    getVersionKeys(): string[];
    private updateVersionIfExists;
    private hasIndexedPathFromKeys;
    createAutoTrackedComputed<T = unknown>(pathKey: string, derive: (get: (path: string) => unknown) => T): Signal<T>;
    getAutoComputed<T = unknown>(pathKey: string): Signal<T> | undefined;
    deleteAutoComputed(pathKey: string): void;
}

/**
 * Enhanced interface for a generic reactive store instance.
 * Provides type-safe methods for value and array manipulation, observability, and cleanup.
 */
interface IStoreInstance<T extends StoreData = StoreData> {
    /**
     * Returns the current store value (root object).
     */
    store: T;
    /**
     * Returns a type-safe observable for a given path.
     */
    getObservable<P extends PathKeys<T>>(path: P): ObservableType<PathValue<T, P>>;
    getObservable<P extends string>(path: P): ObservableType<PathValue<T, P>>;
    getObservable(path: string): ObservableType<unknown>;
    /**
     * Type-safe projection APIs. Dependencies are collected from callable proxy reads.
     */
    select<TOut>(project: (state: T) => TOut): ObservableType<TOut>;
    computedOf<TOut>(project: (state: T) => TOut): SignalType<TOut>;
    /**
     * Sets a value at the given path with type safety.
     */
    setValue<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
    setValue<P extends string>(path: P, value: PathValue<T, P>): void;
    setValue(path: string, value: unknown): void;
    /**
     * Manually invalidates version signals without mutating the store.
     * - leaf: bumps the full branch chain, e.g. a, a.b, a.b.c
     * - grained: bumps only the exact path, e.g. a.b.c
     */
    wakeup<P extends PathKeys<T>>(path: P, mode?: StoreWakeupMode): void;
    wakeup<P extends string>(path: P, mode?: StoreWakeupMode): void;
    wakeup(path: string, mode?: StoreWakeupMode): void;
    wakeUp<P extends PathKeys<T>>(path: P, mode?: StoreWakeupMode): void;
    wakeUp<P extends string>(path: P, mode?: StoreWakeupMode): void;
    wakeUp(path: string, mode?: StoreWakeupMode): void;
    /**
     * Runs multiple public proxy/store mutations as one batched version update.
     * State writes stay synchronous; reactive version bumps flush before this returns.
     */
    batch<R>(fn: () => R): R;
    /**
     * Performs a type-safe array mutation method at the given path.
     */
    setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: Extract<ArrayMutationMethod, 'push' | 'unshift'>, ...args: unknown[]): unknown;
    setArrayMethod<P extends PathKeys<T>>(path: P, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethod<P extends PathKeys<T>>(path: P, val: SpliceOperation, method: 'splice'): unknown;
    setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, compareFn: (a: U, b: U) => number, method: 'sort'): unknown;
    setArrayMethod<P extends ValidPath<T>>(path: P, val: PathValue<T, P> extends readonly (infer U)[] ? U : never, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    setArrayMethod(path: string, val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    setArrayMethod(path: string, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethodRef?(path: string, arrayRef: unknown[], val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    /**
     * Performs a type-safe query operation on an array at the given path.
     */
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U> | U, method: 'find'): U | undefined;
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U> | U, method: 'findIndex'): number;
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U>, method: 'filter'): U[];
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, val: MapFn<U, R>, method: 'map'): R[];
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, val: ReduceFn<U, R>, method: 'reduce', initialValue: R): R;
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U>, method: 'some' | 'every'): boolean;
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: 'includes'): boolean;
    queryArray<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: 'indexOf'): number;
    queryArray<P extends PathKeys<T>>(path: P, _: unknown, method: 'length'): number;
    queryArray<P extends ValidPath<T>, M extends ArrayQueryMethod, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U extends never ? unknown : PredicateFn<U> | MapFn<U, any> | ReduceFn<U, any> | U, method: M, ...args: unknown[]): ArrayOperationResult<U, M>['result'];
    queryArray(path: string, val: unknown, method: ArrayQueryMethod | 'length', ...args: unknown[]): unknown;
    /**
     * Reads the value at the given path with proper return typing.
     */
    readStore<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
    readStore<P extends string>(path: P): PathValue<T, P> | undefined;
    readStore(path: string): unknown | undefined;
    /**
     * Sets a value and notifies observers (internal use) with type safety.
     */
    setValueObserve<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
    setValueObserve<P extends string>(path: P, value: PathValue<T, P>): void;
    setValueObserve(path: string, value: unknown): void;
    /**
     * Deletes a value at the given path with type safety.
     */
    deleteValue<P extends PathKeys<T>>(path: P): void;
    deleteValue<P extends string>(path: P): void;
    deleteValue(path: string): void;
    /**
     * Cleans up reactive resources and derived caches for a given path prefix.
     * Implementations should clear BehaviorSubjects, computed nodes, version data,
     * and any proxy or cursor caches associated with the path.
    */
    cleanupPath(path: string): void;
    /**
     * Optional hook to allow prefetching cursor nodes for proxy caching.
     */
    prefetchCursorWithNode?(path: string, value: unknown): void;
    /**
     * Optional fast-path setter bypassing validation for internal updates.
     */
    setValueFast?(path: string, value: unknown): void;
    /**
     * Type-safe BehaviorSubjects for each path.
     */
    behaviorStore: Record<string, BehaviorSubjectType<unknown>>;
    /**
     * Type-safe computed signals for each path.
     */
    computedStore: Record<string, SignalType<unknown>>;
    /**
     * Optional devtools service with proper typing.
     */
    devService?: unknown;
    /**
     * Finds an element in array with type-safe predicate.
     */
    findInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): U | undefined;
    /**
     * Finds index of element in array with type-safe predicate.
     */
    findIndexInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): number;
    /**
     * Filters array with type-safe predicate.
     */
    filterArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): U[];
    /**
     * Maps array with type-safe callback.
     */
    mapArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, callback: U extends never ? unknown : MapFn<U, R>): R[];
    /**
     * Reduces array with type-safe callback.
     */
    reduceArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, callback: U extends never ? unknown : ReduceFn<U, R>, initialValue?: R): R;
    /**
     * Checks if some elements in array match predicate.
     */
    someArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): boolean;
    /**
     * Checks if every element in array matches predicate.
     */
    everyArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): boolean;
    /**
     * Checks if array includes element.
     */
    includesInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, searchElement: U extends never ? unknown : U): boolean;
    /**
     * Gets index of element in array.
     */
    indexOfInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, searchElement: U extends never ? unknown : U): number;
    /**
     * Gets length of array at path.
     */
    lengthOfArray<P extends ValidPath<T>>(path: P): number;
    /**
     * Updates array item by index with type safety.
     */
    updateArrayItem<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, index: number, newValue: U extends never ? unknown : U): void;
    /**
     * Updates array item by finding it with predicate.
     */
    updateArrayItemByFind<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U, newValue: U extends never ? unknown : U): void;
    /**
     * Deletes elements from array by predicate.
     */
    deleteFromArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): void;
    /**
     * Deletes array element by index.
     */
    deleteByIndex<P extends ValidPath<T>>(path: P, index: number): void;
    /**
     * Gets a computed signal for a path.
     */
    getComputed<P extends PathKeys<T>>(path: P): SignalType<PathValue<T, P>>;
    getComputed<P extends string>(path: P): SignalType<PathValue<T, P>>;
    getComputed(path: string): SignalType<unknown>;
    /**
     * Gets a BehaviorSubject for a path.
     */
    getBehaviorSubject<P extends PathKeys<T>>(path: P): BehaviorSubjectType<PathValue<T, P>>;
    getBehaviorSubject<P extends string>(path: P): BehaviorSubjectType<PathValue<T, P>>;
    getBehaviorSubject(path: string): BehaviorSubjectType<unknown>;
    /**
     * Gets signal value for a path.
     */
    getSignalValue<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
    getSignalValue<P extends string>(path: P): PathValue<T, P> | undefined;
    getSignalValue(path: string): unknown | undefined;
    /**
     * Returns the current store value (root object).
     */
    returnStore(): T;
    /**
     * Updates behaviors by path segments (internal).
     */
    updateBehaviorsBySegments(path: string, newValue?: unknown): void;
    /**
     * Enables DevTools for the store.
     */
    enableDevTools(storeName: string, showVisualizer?: boolean): void;
    /**
     * Adds path to computed store.
     */
    addToComputeStore(path: string): void;
    /**
     * Removes path from computed store.
     */
    deleteFromComputeStore(path: string): void;
    /**
     * Index signature for dynamic access (kept for backward compatibility).
     */
    [key: string]: unknown;
}

/**
 * Shared types for the store library – refined for strong typing.
 */

/**
 * Type for a callable proxy created for nested paths.
 * It is a function that returns the current value and exposes deep
 * property access as further callable proxies. Additionally, it provides
 * `$signal` and `$val` convenience getters.
 */
type ProxyCallable<T = unknown> = CallableProxy<T> & {
    readonly $signal?: SignalType<T>;
    readonly $val?: T;
};
/**
 * Type for the root store proxy. Each field of the store is exposed
 * as a callable proxy while all store instance methods are also available.
 */
type StoreProxy<T extends StoreData = StoreData> = {
    [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? T[K] : ProxyCallable<T[K]>;
} & IStoreInstance<T>;

type ArrayElementType<T, P extends string> = PathValue<T, P> extends readonly (infer V)[] ? V : never;
declare class TypedArrayOperations<T extends StoreData = StoreData, P extends ValidPath<T> & string = ValidPath<T> & string> {
    private readonly signalStore;
    private readonly storeName;
    private readonly path;
    private orchestrator?;
    private orchestratorStore?;
    constructor(signalStore: SignalStore, storeName: string, path: P);
    private readonly mutationInputNormalizers;
    private readonly emptyArrayQueryFallbacks;
    private withArray;
    private asPredicate;
    private isSpliceOperation;
    private getOrchestrator;
    private emitDev;
    private normalizeMutationInput;
    private normalizeSpliceInput;
    private normalizeVariadicInput;
    private normalizeSinglePayloadInput;
    private executeMutation;
    findInArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U): U | undefined;
    findIndexInArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U): number;
    filterArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): U[];
    mapArray<U = ArrayElementType<T, P>, R = unknown>(callback: MapFn<U, R>): R[];
    reduceArray<U = ArrayElementType<T, P>, R = unknown>(callback: ReduceFn<U, R>, initialValue: R): R;
    someArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): boolean;
    everyArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): boolean;
    includesInArray<U = ArrayElementType<T, P>>(searchElement: U): boolean;
    indexOfInArray<U = ArrayElementType<T, P>>(searchElement: U): number;
    lengthOfArray(): number;
    updateArrayItem<U = ArrayElementType<T, P>>(index: number, newValue: U): void;
    updateArrayItemByFind<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U, newValue: U): void;
    setArrayMethod(val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    setArrayMethod(method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethod(val: undefined, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethodOnRef(array: unknown[], val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U> | U, method: 'find'): U | undefined;
    queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U> | U, method: 'findIndex'): number;
    queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U>, method: 'filter'): U[];
    queryArray<U = ArrayElementType<T, P>, R = unknown>(val: MapFn<U, R>, method: 'map'): R[];
    queryArray<U = ArrayElementType<T, P>, R = unknown>(val: ReduceFn<U, R>, method: 'reduce', initialValue: R): R;
    queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U>, method: 'some' | 'every'): boolean;
    queryArray<U = ArrayElementType<T, P>>(val: U, method: 'includes'): boolean;
    queryArray<U = ArrayElementType<T, P>>(val: U, method: 'indexOf'): number;
    queryArray<U = ArrayElementType<T, P>>(_: unknown, method: 'length'): number;
    deleteFromArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U): {
        method: string;
        path: P;
        args: (U | PredicateFn<U>)[];
        oldValue: unknown;
        newValue: PathValue<StoreData, P> | undefined;
        removedElements: U[];
        indexes: number[];
        item: U[];
    };
    deleteByIndex(index: number): {
        method: string;
        path: P;
        args: {
            start: number;
            deleteCount: number;
            items: never[];
        }[];
        oldValue: unknown;
        newValue: unknown;
        removedElements: never[];
        indexes: never[];
        item: undefined;
    } | {
        method: string;
        path: P;
        args: {
            start: number;
            deleteCount: number;
            items: never[];
        }[];
        oldValue: unknown;
        newValue: PathValue<StoreData, P> | undefined;
        removedElements: ({} | null)[];
        indexes: number[];
        item: unknown;
    };
}
type ElementTypeFromPath<T, P extends string> = PathValue<T, P> extends readonly (infer V)[] ? V : never;
declare class ArrayChain<T extends StoreData, P extends ValidPath<T> & string> {
    private readonly ops;
    constructor(ops: TypedArrayOperations<T, P>);
    push(value: ElementTypeFromPath<T, P>): this;
    unshift(value: ElementTypeFromPath<T, P>): this;
    pop(): this;
    shift(): this;
    sort(compareFn?: (a: ElementTypeFromPath<T, P>, b: ElementTypeFromPath<T, P>) => number): this;
    splice(start: number, deleteCount?: number, ...items: Array<ElementTypeFromPath<T, P>>): this;
    update(index: number, newValue: ElementTypeFromPath<T, P>): this;
    updateByFind(predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>, newValue: ElementTypeFromPath<T, P>): this;
    delete(predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>): this;
    deleteByIndex(index: number): this;
    find(predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>): ElementTypeFromPath<T, P> | undefined;
    findIndex(predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>): number;
    filter(predicate: PredicateFn<ElementTypeFromPath<T, P>>): Array<ElementTypeFromPath<T, P>>;
    map<R>(mapFn: MapFn<ElementTypeFromPath<T, P>, R>): R[];
    reduce<R>(reduceFn: ReduceFn<ElementTypeFromPath<T, P>, R>, initialValue: R): R;
    some(predicate: PredicateFn<ElementTypeFromPath<T, P>>): boolean;
    every(predicate: PredicateFn<ElementTypeFromPath<T, P>>): boolean;
    includes(value: ElementTypeFromPath<T, P>): boolean;
    indexOf(value: ElementTypeFromPath<T, P>): number;
    length(): number;
}

interface DevToolsAction {
    type: string;
    payload?: Record<string, unknown>;
    storeName?: string;
}
interface SetValuePayload {
    path: string;
    value: unknown;
    oldValue?: unknown;
}
interface ArrayOperationPayload {
    path: string;
    method: string;
    args: unknown[];
    oldValue: unknown[];
    newValue: unknown[];
}
interface StoreUpdatePayload {
    storeName: string;
    action: 'add' | 'remove' | 'update';
    path: string;
    keys: string[];
    snapshot?: Record<string, unknown>;
    graph?: unknown;
}
interface BehaviorStoreUpdatePayload extends StoreUpdatePayload {
    value?: unknown;
    currentState?: Record<string, BehaviorSubject<unknown>>;
}
interface VersionStoreUpdatePayload {
    path: string;
    action: 'add' | 'remove' | 'update';
    keys: string[];
    graph?: unknown;
}
interface ProxyMetricsPayload {
    path: string;
    hits: number;
    misses: number;
    hitRate: number;
    cacheSize: number;
    cacheDump: Array<{
        key: string;
        value: string;
    }>;
    cacheKeys: string[];
    graph?: unknown;
}
type StoreDevToolsAction = (DevToolsAction & {
    type: 'SET_VALUE';
    payload: SetValuePayload;
}) | (DevToolsAction & {
    type: 'SET_VALUE_OBSERVE';
    payload: SetValuePayload;
}) | (DevToolsAction & {
    type: 'ARRAY_OPERATION';
    payload: ArrayOperationPayload;
}) | (DevToolsAction & {
    type: 'COMPUTED_STORE_UPDATE';
    payload: StoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'BEHAVIOR_STORE_UPDATE';
    payload: BehaviorStoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'VERSION_STORE_UPDATE';
    payload: VersionStoreUpdatePayload;
}) | (DevToolsAction & {
    type: 'PROXY_METRICS';
    payload: ProxyMetricsPayload;
}) | (DevToolsAction & {
    type: 'UNSUBSCRIBE';
    payload: {
        path: string;
    };
}) | (DevToolsAction & {
    type: 'CLEANUP';
    payload: {
        path: string;
        cleanedPaths: string[];
        cleanedCount: number;
    };
});

type DevToolsEvent = StoreDevToolsAction & {
    storeName?: string;
};
interface AngularStoreDevtools {
    readonly action$: Observable<DevToolsEvent | null>;
    readonly readAction$: Observable<DevToolsEvent | null>;
    emitAction(event: DevToolsEvent): void;
    emitRead(event: DevToolsEvent): void;
    getBehaviorKeys(store: Record<string, unknown>): string[];
    getComputedKeys(store: Record<string, unknown>): string[];
}
declare const SIGNAL_STORE_DEVTOOLS: InjectionToken<AngularStoreDevtools>;

/**
 * Logger interface for custom logging implementations.
 */
interface ILogger {
    log(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

/**
 * Minimal interface for DevTools service (stub, extend as needed).
 */
interface IDevService {
    emitDevAction(storeName: string, action: unknown): void;
}

/**
 * Configuration options for ProxyFactory.
 */
interface ProxyFactoryConfig {
    /** Maximum number of entries in the proxy cache. */
    maxCacheSize?: number;
    /** Logger instance for warnings and errors. */
    logger?: ILogger;
    /** Optional devtools service. */
    devService?: IDevService;
    /** Optional callback for cache metrics reporting. */
    metricsCallback?: (storeName: string, metrics: {
        hits: number;
        misses: number;
        hitRate: number;
        cacheSize: number;
    }) => void;
    /** Optional store name for metrics. */
    storeName?: string;
    /** SignalStore service for proxy cache management. */
    signalStore?: SignalStore;
    /** CreateStoreService for proxy cache operations. */
    createStoreService?: CreateStoreService;
    /** Use in-place iteration instead of path splitting for better performance. */
    useInPlaceIteration?: boolean;
    /** Strict: throw on invalid paths instead of warn. */
    strictInvalidPath?: boolean;
    /** Strict: forbid root-level rxjs methods. */
    strictRootRxjs?: boolean;
    /** Strict: disallow delete (set undefined). */
    strictDeleteUndefined?: boolean;
    /** Whether rxjs methods are allowed on root proxy (non-strict default true). */
    rxjsAllowedOnRoot?: boolean;
}

interface CacheMetrics {
    hits: number;
    misses: number;
    hitRate: number;
}
declare class ProxyFactory {
    private readonly maxCacheSize;
    private readonly logger;
    private readonly metricsCallback?;
    private readonly storeName?;
    private readonly signalStore;
    private readonly useInPlaceIteration;
    private readonly createStoreService;
    private readonly strictInvalidPath;
    private readonly strictRootRxjs;
    private readonly strictDeleteUndefined;
    private readonly rxjsAllowedOnRoot;
    private metricsIntervalId;
    private readonly pathReader;
    constructor(config?: ProxyFactoryConfig);
    updateMetricsTimer(active: boolean): void;
    destroy(): void;
    getCacheMetrics(): CacheMetrics & {
        cacheSize: number;
        cacheKeys: string[];
        cacheDump: Array<{
            key: string;
            value: string;
        }>;
    };
    resetCache(): void;
    private recordCacheHit;
    private recordCacheMiss;
    private configureProxyCacheLimit;
    private clearProxyCacheLimit;
    clearCacheForPath(path: string): void;
    private getValueIteratively;
    private readDotPathInPlace;
    private cacheMake;
    createStoreProxy<T extends StoreData>(storeInstance: IStoreInstance<T>): StoreProxy<T>;
}

declare class CreateStore<T extends StoreData = StoreData> {
    private readonly signalStore;
    private readonly storeName;
    store: T;
    get computedStore(): Record<string, SignalType<unknown>>;
    get behaviorStore(): Record<string, BehaviorSubjectType<unknown>>;
    get createServiceGetter(): CreateStoreService;
    get getCreateService(): CreateStoreService;
    private readonly arrayOpsCache;
    private arrayOps;
    array<P extends ValidPath<T> & string>(path: P): ArrayChain<T, P>;
    private readonly devService?;
    private readonly createService;
    private _cursor?;
    private get cursor();
    private emitStoreUpdate;
    private snapshotForDevtools;
    private emitDevtoolsEvent;
    private computedKeys;
    private behaviorKeys;
    private emitComputedEvent;
    private emitBehaviorEvent;
    private withValidatedPath;
    private withReactiveAccessor;
    private cleanupDerivedPath;
    private queueDerivedCleanup;
    private emitBehaviorUpdateIfTracked;
    private isBranchValue;
    private mutateStoreNormalized;
    constructor(signalStore: SignalStore, storeName: string, _proxyFactory?: ProxyFactory, devService?: AngularStoreDevtools);
    private emitDevAction;
    private getComputedSnapshot;
    addToComputeStore(path: string): void;
    deleteFromComputeStore(path: string): void;
    returnStore(): T;
    setValue<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
    setValue<P extends string>(path: P, value: PathValue<T, P>): void;
    setValue(path: string, value: unknown): void;
    setArrayMethod<P extends ValidPath<T>>(path: P, val: PathValue<T, P> extends readonly (infer U)[] ? U : never, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: Extract<ArrayMutationMethod, 'push' | 'unshift'>, ...args: unknown[]): unknown;
    setArrayMethod<P extends PathKeys<T>>(path: P, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethod<P extends PathKeys<T>>(path: P, val: SpliceOperation, method: 'splice'): unknown;
    setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, compareFn: (a: U, b: U) => number, method: 'sort'): unknown;
    setArrayMethod(path: string, val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    setArrayMethod(path: string, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
    setArrayMethodRef(path: string, arrayRef: unknown[], val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U> | U, method: 'find'): U | undefined;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U> | U, method: 'findIndex'): number;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U>, method: 'filter'): U[];
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, val: MapFn<U, R>, method: 'map'): R[];
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, val: ReduceFn<U, R>, method: 'reduce', initialValue: R): R;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: PredicateFn<U>, method: 'some' | 'every'): boolean;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: 'includes'): boolean;
    queryArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, val: U, method: 'indexOf'): number;
    queryArray<P extends ValidPath<T>>(path: P, _: unknown, method: 'length'): number;
    queryArray(path: string, val: unknown, method: ArrayQueryMethod | 'length', ...args: unknown[]): unknown;
    deleteFromArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): {
        method: string;
        path: P;
        args: ((U extends never ? unknown : U | PredicateFn<U>) | PredicateFn<U extends never ? unknown : U | PredicateFn<U>>)[];
        oldValue: unknown;
        newValue: PathValue<StoreData, P> | undefined;
        removedElements: (U extends never ? unknown : U | PredicateFn<U>)[];
        indexes: number[];
        item: (U extends never ? unknown : U | PredicateFn<U>)[];
    };
    deleteByIndex<P extends ValidPath<T>>(path: P, index: number): {
        method: string;
        path: P;
        args: {
            start: number;
            deleteCount: number;
            items: never[];
        }[];
        oldValue: unknown;
        newValue: unknown;
        removedElements: never[];
        indexes: never[];
        item: undefined;
    } | {
        method: string;
        path: P;
        args: {
            start: number;
            deleteCount: number;
            items: never[];
        }[];
        oldValue: unknown;
        newValue: PathValue<StoreData, P> | undefined;
        removedElements: ({} | null)[];
        indexes: number[];
        item: unknown;
    };
    deleteValue<P extends PathKeys<T>>(path: P): void;
    deleteValue<P extends string>(path: P): void;
    deleteValue(path: string): void;
    cleanupPath(path: string): void;
    destroy(): void;
    findInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): U | undefined;
    findIndexInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U> | U): number;
    filterArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): U[];
    mapArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, callback: U extends never ? unknown : MapFn<U, R>): R[];
    reduceArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never, R = unknown>(path: P, callback: U extends never ? unknown : ReduceFn<U, R>, initialValue: R): R;
    someArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): boolean;
    everyArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: U extends never ? unknown : PredicateFn<U>): boolean;
    includesInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, searchElement: U extends never ? unknown : U): boolean;
    indexOfInArray<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, searchElement: U extends never ? unknown : U): number;
    lengthOfArray<P extends ValidPath<T>>(path: P): number;
    updateArrayItem<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, index: number, newValue: U): void;
    updateArrayItemByFind<P extends ValidPath<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(path: P, predicate: PredicateFn<U> | U, newValue: U): void;
    getComputed<P extends PathKeys<T>>(path: P): SignalType<PathValue<T, P>>;
    getComputed<P extends string>(path: P): SignalType<PathValue<T, P>>;
    getComputed(path: string): SignalType<unknown>;
    getSignalValue<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
    getSignalValue<P extends string>(path: P): PathValue<T, P> | undefined;
    getSignalValue(path: string): unknown | undefined;
    readStore<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
    readStore<P extends string>(path: P): PathValue<T, P> | undefined;
    readStore(path: string): unknown | undefined;
    getBehaviorSubject<P extends PathKeys<T>>(path: P): BehaviorSubjectType<PathValue<T, P>>;
    getBehaviorSubject<P extends string>(path: P): BehaviorSubjectType<PathValue<T, P>>;
    getBehaviorSubject(path: string): BehaviorSubjectType<unknown>;
    getObservable<P extends PathKeys<T>>(path: P): ObservableType<PathValue<T, P>>;
    getObservable<P extends string>(path: P): ObservableType<PathValue<T, P>>;
    getObservable(path: string): ObservableType<unknown>;
    private validateAndGet;
    select<TOut>(project: (s: T) => TOut): rxjs.Observable<TOut>;
    computedOf<TOut>(project: (s: T) => TOut): Signal<TOut>;
    setValueObserve<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
    setValueObserve<P extends string>(path: P, value: PathValue<T, P>): void;
    setValueObserve(path: string, value: unknown): void;
    updateBehaviorsBySegments(path: string, newValue?: unknown): void;
    wakeUpArrayMutation(path: string, value: unknown, afterVersion?: () => void): void;
    wakeUpMutationPath(path: string, value: unknown, options?: WakeUpPathOptions): boolean;
    wakeUpVersionPath(path: string): void;
    wakeup<P extends PathKeys<T>>(path: P, mode?: StoreWakeupMode): void;
    wakeup<P extends string>(path: P, mode?: StoreWakeupMode): void;
    wakeUp<P extends PathKeys<T>>(path: P, mode?: StoreWakeupMode): void;
    wakeUp<P extends string>(path: P, mode?: StoreWakeupMode): void;
    batch<R>(fn: () => R): R;
    enableDevTools(_storeName: string, showVisualizer?: boolean): void;
    setDependencyMode(mode: 'exact' | 'container'): void;
    setTrackReads(enabled: boolean): void;
    setCloneComputedOutputs(enabled: boolean): void;
    setBehaviorUpdatesEnabled(enabled: boolean): void;
    prefetchCursorWithNode(path: string, node: Record<string, unknown> | null): void;
    setValueFast(path: string, value: unknown): void;
    preciseMutationWake: boolean;
    setPreciseMutationWake(enabled: boolean): void;
    commitMutationPrecise(branch: string, value: unknown, relPaths: readonly string[]): void;
    private deletePathFromStore;
}

interface Stores {
    [key: string]: StoreData;
}

interface WaitForStoreOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
declare class SignalStore {
    private devService;
    devActive: boolean;
    private storeInstances;
    private storeProxies;
    private proxyFactories;
    private proxyCacheLimits;
    private storeWaiters;
    constructor(devService?: AngularStoreDevtools | null);
    get devAction$(): Observable<DevToolsEvent | null>;
    get devReadAction$(): Observable<DevToolsEvent | null>;
    attachDevtools(devtools: AngularStoreDevtools | null): void;
    getDevtoolsAdapter(): AngularStoreDevtools | undefined;
    emitDevAction(storeName: string, action: StoreDevToolsAction): void;
    devActivation(devActive: boolean): void;
    setMetricsThrottle(ms: number): void;
    bindDevActivation(devActive$: Observable<boolean>): Subscription;
    emitDevReadAction(storeName: string, data: StoreDevToolsAction): void;
    private lastMetricsEmit;
    private metricsThrottleMs;
    emitProxyMetrics(storeName: string, metrics: {
        hits: number;
        misses: number;
        hitRate: number;
        cacheSize: number;
    }): void;
    createStore<T extends StoreData = StoreData>(val: T, name: string, options?: {
        useInPlaceIteration?: boolean;
        dependencyMode?: 'exact' | 'container';
        cloneInitialValue?: 'none' | 'structured';
        strict?: {
            invalidPath?: boolean;
            rootRxjs?: boolean;
            deleteUndefined?: boolean;
        };
        rxjsAllowedOnRoot?: boolean;
        metricsThrottleMs?: number;
        proxyCacheMaxSize?: number;
        versionBump?: {
            strategy?: 'microtask' | 'raf';
            throttleMs?: number;
            partialInvalidation?: boolean;
        };
    }): StoreProxy<T>;
    /** Wait for a named proxy without changing the synchronous useStore/getStore contract. */
    waitForStore<T extends StoreData = StoreData>(name: string, options?: WaitForStoreOptions): Promise<StoreProxy<T>>;
    private resolveStoreWaiters;
    /**
     * Zwraca wewnętrzną instancję CreateStore używaną przez logikę biblioteki.
     * Używane jedynie wewnętrznie; dla komponentów/serwisów należy użyć useStore().
     */
    getStore(name: string): CreateStore<StoreData>;
    /**
     * Register a store instance built directly via `new CreateStore(name)` so that
     * `getStore(name)` (used by typed array operations, base manager, etc.) resolves it.
     * Idempotent: the createStore factory assigns the same instance afterwards, and a
     * second direct construction with the same name is left to the factory's own guard.
     */
    registerStoreInstance(name: string, instance: CreateStore<StoreData>): void;
    destroyStore(name: string): void;
    removeStore(name: string): void;
    /**
     * Zwraca proxy dla danego sklepu – tego powinny używać komponenty.
     */
    useStore<K extends keyof Stores & string>(name: K): StoreProxy<Stores[K]>;
    useStore(name: string): StoreProxy<StoreData>;
    createCallableProxy(nestedPath: string, storeInstance: unknown, nestedValue: unknown): ProxyCallable<unknown>;
    setValue(storeName: string, path: string, val: object): void;
    read(storeName: string, path: string): unknown;
    readStore(storeName: string, path: string): unknown;
    getSignalValue(storeName: string, path: string): unknown;
    setProxyCacheLimit(storeName: string, limit: number): void;
    getProxyCacheLimit(storeName: string): number | undefined;
    clearProxyCacheLimit(storeName: string): void;
    select<K extends keyof Stores & string, R>(storeName: K, selector: (state: Stores[K]) => R): R;
    static ɵfac: _angular_core.ɵɵFactoryDeclaration<SignalStore, [{ optional: true; }]>;
    static ɵprov: _angular_core.ɵɵInjectableDeclaration<SignalStore>;
}

export { CreateStore, SIGNAL_STORE_DEVTOOLS, SignalStore };
export type { AngularStoreDevtools, DevToolsEvent, StoreProxy, WaitForStoreOptions };
//# sourceMappingURL=index.d.ts.map
