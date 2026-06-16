// src/app/store/interfaces/store-instance.interface.ts

import {
  StoreData,
  PathValue,
  ValidPath,
  PathKeys,
  ArrayMutationMethod,
  ArrayQueryMethod,
  ArrayOperationResult,
  SpliceOperation,
  PredicateFn,
  MapFn,
  ReduceFn,
  ObservableType,
  SignalType,
  BehaviorSubjectType
} from '../types/advanced-types';
import type { StoreWakeupMode } from '../core/create-store.core';

/**
 * Enhanced interface for a generic reactive store instance.
 * Provides type-safe methods for value and array manipulation, observability, and cleanup.
 */
export interface IStoreInstance<T extends StoreData = StoreData> {
  /**
   * Returns the current store value (root object).
   */
  store: T;

  /**
   * Returns a type-safe observable for a given path.
   */
  // Strict path overload
  getObservable<P extends PathKeys<T>>(path: P): ObservableType<PathValue<T, P>>;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  getObservable<P extends string>(path: P): ObservableType<PathValue<T, P>>;
  // Dynamic string fallback
  getObservable(path: string): ObservableType<unknown>;

  /**
   * Type-safe projection APIs. Dependencies are collected from callable proxy reads.
   */
  select<TOut>(project: (state: T) => TOut): ObservableType<TOut>;
  computedOf<TOut>(project: (state: T) => TOut): SignalType<TOut>;

  /**
   * Sets a value at the given path with type safety.
   */
  // Strict path overload
  setValue<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  setValue<P extends string>(path: P, value: PathValue<T, P>): void;
  // Dynamic string fallback
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
  // Strict path overloads
  setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(
    path: P,
    val: U,
    method: Extract<ArrayMutationMethod, 'push' | 'unshift'>,
    ...args: unknown[]
  ): unknown;
  setArrayMethod<P extends PathKeys<T>>(
    path: P,
    method: Extract<ArrayMutationMethod, 'pop' | 'shift'>
  ): unknown;
  setArrayMethod<P extends PathKeys<T>>(
    path: P,
    val: SpliceOperation,
    method: 'splice'
  ): unknown;
  setArrayMethod<P extends PathKeys<T>, U = PathValue<T, P> extends readonly (infer V)[] ? V : never>(
    path: P,
    compareFn: (a: U, b: U) => number,
    method: 'sort'
  ): unknown;
  // Generic fallback (preserves existing API)
  setArrayMethod<P extends ValidPath<T>>(
    path: P,
    val: PathValue<T, P> extends readonly (infer U)[] ? U : never,
    method: ArrayMutationMethod,
    ...args: unknown[]
  ): unknown;
  // String fallback
  setArrayMethod(
    path: string,
    val: unknown,
    method: ArrayMutationMethod,
    ...args: unknown[]
  ): unknown;
  setArrayMethod(
    path: string,
    method: Extract<ArrayMutationMethod, 'pop' | 'shift'>
  ): unknown;
  setArrayMethodRef?(
    path: string,
    arrayRef: unknown[],
    val: unknown,
    method: ArrayMutationMethod,
    ...args: unknown[]
  ): unknown;

  /**
   * Performs a type-safe query operation on an array at the given path.
   */
  // Strict path overloads
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: PredicateFn<U> | U, method: 'find'): U | undefined;
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: PredicateFn<U> | U, method: 'findIndex'): number;
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: PredicateFn<U>, method: 'filter'): U[];
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never,
    R = unknown
  >(path: P, val: MapFn<U, R>, method: 'map'): R[];
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never,
    R = unknown
  >(path: P, val: ReduceFn<U, R>, method: 'reduce', initialValue: R): R;
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: PredicateFn<U>, method: 'some' | 'every'): boolean;
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: U, method: 'includes'): boolean;
  queryArray<
    P extends PathKeys<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(path: P, val: U, method: 'indexOf'): number;
  queryArray<P extends PathKeys<T>>(path: P, _: unknown, method: 'length'): number;
  // Generic fallback (preserves existing API)
  queryArray<
    P extends ValidPath<T>,
    M extends ArrayQueryMethod,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    val: U extends never ? unknown : PredicateFn<U> | MapFn<U, any> | ReduceFn<U, any> | U,
    method: M,
    ...args: unknown[]
  ): ArrayOperationResult<U, M>['result'];
  // String fallback
  queryArray(
    path: string,
    val: unknown,
    method: ArrayQueryMethod | 'length',
    ...args: unknown[]
  ): unknown;

  /**
   * Reads the value at the given path with proper return typing.
   */
  // Strict path overload
  readStore<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  readStore<P extends string>(path: P): PathValue<T, P> | undefined;
  // Dynamic string fallback
  readStore(path: string): unknown | undefined;

  /**
   * Sets a value and notifies observers (internal use) with type safety.
   */
  // Strict path overload
  setValueObserve<P extends PathKeys<T>>(path: P, value: PathValue<T, P>): void;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  setValueObserve<P extends string>(path: P, value: PathValue<T, P>): void;
  // Dynamic string fallback
  setValueObserve(path: string, value: unknown): void;

  /**
   * Deletes a value at the given path with type safety.
   */
  // Strict path overload
  deleteValue<P extends PathKeys<T>>(path: P): void;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  deleteValue<P extends string>(path: P): void;
  // Dynamic string fallback
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

  // Enhanced array-specific methods for better type safety
  
  /**
   * Finds an element in array with type-safe predicate.
   */
  findInArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U> | U
  ): U | undefined;

  /**
   * Finds index of element in array with type-safe predicate.
   */
  findIndexInArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U> | U
  ): number;

  /**
   * Filters array with type-safe predicate.
   */
  filterArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U>
  ): U[];

  /**
   * Maps array with type-safe callback.
   */
  mapArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never,
    R = unknown
  >(
    path: P,
    callback: U extends never ? unknown : MapFn<U, R>
  ): R[];

  /**
   * Reduces array with type-safe callback.
   */
  reduceArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never,
    R = unknown
  >(
    path: P,
    callback: U extends never ? unknown : ReduceFn<U, R>,
    initialValue?: R
  ): R;

  /**
   * Checks if some elements in array match predicate.
   */
  someArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U>
  ): boolean;

  /**
   * Checks if every element in array matches predicate.
   */
  everyArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U>
  ): boolean;

  /**
   * Checks if array includes element.
   */
  includesInArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    searchElement: U extends never ? unknown : U
  ): boolean;

  /**
   * Gets index of element in array.
   */
  indexOfInArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    searchElement: U extends never ? unknown : U
  ): number;

  /**
   * Gets length of array at path.
   */
  lengthOfArray<P extends ValidPath<T>>(path: P): number;

  /**
   * Updates array item by index with type safety.
   */
  updateArrayItem<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    index: number,
    newValue: U extends never ? unknown : U
  ): void;

  /**
   * Updates array item by finding it with predicate.
   */
  updateArrayItemByFind<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U> | U,
    newValue: U extends never ? unknown : U
  ): void;

  /**
   * Deletes elements from array by predicate.
   */
  deleteFromArray<
    P extends ValidPath<T>,
    U = PathValue<T, P> extends readonly (infer V)[] ? V : never
  >(
    path: P,
    predicate: U extends never ? unknown : PredicateFn<U> | U
  ): void;

  /**
   * Deletes array element by index.
   */
  deleteByIndex<P extends ValidPath<T>>(path: P, index: number): void;

  /**
   * Gets a computed signal for a path.
   */
  // Strict path overload
  getComputed<P extends PathKeys<T>>(path: P): SignalType<PathValue<T, P>>;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  getComputed<P extends string>(path: P): SignalType<PathValue<T, P>>;
  // Dynamic string fallback
  getComputed(path: string): SignalType<unknown>;

  /**
   * Gets a BehaviorSubject for a path.
   */
  // Strict path overload
  getBehaviorSubject<P extends PathKeys<T>>(path: P): BehaviorSubjectType<PathValue<T, P>>;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  getBehaviorSubject<P extends string>(path: P): BehaviorSubjectType<PathValue<T, P>>;
  // Dynamic string fallback
  getBehaviorSubject(path: string): BehaviorSubjectType<unknown>;

  /**
   * Gets signal value for a path.
   */
  // Strict path overload
  getSignalValue<P extends PathKeys<T>>(path: P): PathValue<T, P> | undefined;
  // Literal-string fallback keeps deep paths typed when PathKeys depth is exceeded
  getSignalValue<P extends string>(path: P): PathValue<T, P> | undefined;
  // Dynamic string fallback
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
