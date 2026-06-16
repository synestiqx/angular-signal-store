import {
  StoreData,
  ArrayMutationMethod,
  ArrayQueryMethod,
  PredicateFn,
  MapFn,
  ReduceFn,
  PathValue,
  ValidPath,
  SpliceOperation
} from '../types/advanced-types';
import { StoreErrorFactory } from '../types/errors';
import { SignalStore } from '../core/signal-store.service';
import { PathUtils } from '../utils/path-utils';
import { ArrayMutationOrchestrator } from '../utils/abstracts/array-mutation-orchestrator';
import { executeArrayQuery } from '../utils/array-query-executor';

type ArrayElementType<T, P extends string> = PathValue<T, P> extends readonly (infer V)[] ? V : never;
type ArrayQueryPredicate<E, M extends ArrayQueryMethod | 'length'> =
  M extends 'find' | 'findIndex' | 'filter' | 'some' | 'every' ? PredicateFn<E> :
  M extends 'map' ? MapFn<E, unknown> :
  M extends 'reduce' ? ReduceFn<E, unknown> :
  M extends 'includes' | 'indexOf' ? E :
  undefined;

type StoreInstance = ReturnType<SignalStore['getStore']> & {
  createServiceGetter: {
    cleanupBehaviorStore?: (path: string) => void;
    cleanupComputedStore?: (path: string) => void;
    cleanupVersionStore?: (path: string) => void;
    clearProxyCacheForPath?: (path: string) => void;
    deleteIndexedProxyCacheRange?: (path: string, startIndex: number, endIndex: number) => void;
    hasIndexedProxyCacheFrom?: (path: string, startIndex: number) => boolean;
    hasIndexedDerivedNodeFrom?: (path: string, startIndex: number) => boolean;
  };
  wakeUpArrayMutation: (path: string, value: unknown, afterVersion?: () => void) => void;
  wakeUpVersionPath: (path: string) => void;
};

type NormalizedMutationInput = { method: ArrayMutationMethod; payload: unknown; devArgs: unknown[] };
type MutationInputNormalizer = (value: unknown, args: unknown[]) => NormalizedMutationInput;
type ArrayQueryMethodWithLength = ArrayQueryMethod | 'length';
type EmptyArrayQueryFallback = () => unknown;

export class TypedArrayOperations<
  T extends StoreData = StoreData,
  P extends ValidPath<T> & string = ValidPath<T> & string
> {
  private orchestrator?: ArrayMutationOrchestrator;
  private orchestratorStore?: StoreInstance;

  constructor(
    private readonly signalStore: SignalStore,
    private readonly storeName: string,
    private readonly path: P
  ) {}

  private readonly mutationInputNormalizers: Record<ArrayMutationMethod, MutationInputNormalizer> = {
    splice: (value) => this.normalizeSpliceInput(value),
    push: (value, args) => this.normalizeVariadicInput('push', value, args),
    unshift: (value, args) => this.normalizeVariadicInput('unshift', value, args),
    pop: (value, args) => this.normalizeSinglePayloadInput('pop', value, args),
    shift: (value, args) => this.normalizeSinglePayloadInput('shift', value, args),
    sort: (value, args) => this.normalizeSinglePayloadInput('sort', value, args),
    reverse: (value, args) => this.normalizeSinglePayloadInput('reverse', value, args)
  };
  private readonly emptyArrayQueryFallbacks: Record<ArrayQueryMethodWithLength, EmptyArrayQueryFallback> = {
    length: () => 0,
    filter: () => [],
    map: () => [],
    find: () => undefined,
    findIndex: () => undefined,
    reduce: () => undefined,
    some: () => undefined,
    every: () => undefined,
    includes: () => undefined,
    indexOf: () => undefined
  };

  private withArray<R>(strict: boolean, fn: (store: StoreInstance, array: unknown[] | undefined, value: unknown) => R): R {
    if (!PathUtils.isValidPath(this.path)) {
      throw StoreErrorFactory.pathValidation(this.path, 'Invalid path format for array operation');
    }
    const store = this.signalStore.getStore(this.storeName) as StoreInstance;
    const ref = PathUtils.getByPath(store.returnStore(), this.path as P);
    if (ref !== undefined && !Array.isArray(ref)) {
      throw StoreErrorFactory.typeValidation(this.path, 'array', typeof ref);
    }
    const array = Array.isArray(ref) ? (ref as unknown[]) : undefined;
    if (strict && !array) {
      throw new Error(`Path ${String(this.path)} does not point to an array`);
    }
    return fn(store, array, ref);
  }

  private asPredicate<U>(predicateOrValue: PredicateFn<U> | U): PredicateFn<U> {
    return typeof predicateOrValue === 'function'
      ? (predicateOrValue as PredicateFn<U>)
      : (item: U) => item === (predicateOrValue as U);
  }

  private isSpliceOperation(value: unknown): value is SpliceOperation {
    return !!value && typeof value === 'object' && 'start' in value && 'deleteCount' in value && 'items' in value;
  }

  private getOrchestrator(store: StoreInstance): ArrayMutationOrchestrator {
    if (this.orchestrator && this.orchestratorStore === store) {
      return this.orchestrator;
    }
    const getter = store.createServiceGetter;
    this.orchestrator = new ArrayMutationOrchestrator(
      (p) => store.wakeUpVersionPath(p),
      (p, value, afterVersion) => store.wakeUpArrayMutation(p, value, afterVersion),
      (p) => getter.clearProxyCacheForPath?.(p),
      (p) => getter.cleanupBehaviorStore?.(p),
      (p) => getter.cleanupComputedStore?.(p),
      (p) => getter.cleanupVersionStore?.(p),
      (p, startIndex, endIndex) => getter.deleteIndexedProxyCacheRange?.(p, startIndex, endIndex),
      (p, startIndex) => getter.hasIndexedProxyCacheFrom?.(p, startIndex) ?? true,
      (p, startIndex) => getter.hasIndexedDerivedNodeFrom?.(p, startIndex) ?? true
    );
    this.orchestratorStore = store;
    return this.orchestrator;
  }

  private emitDev(method: ArrayMutationMethod, args: unknown[], oldValue: unknown, newValue: unknown): void {
    if (!this.signalStore.devActive) return;
    this.signalStore.emitDevAction(this.storeName, {
      type: 'ARRAY_OPERATION',
      payload: {
        path: String(this.path),
        method: String(method),
        args,
        oldValue: (oldValue as unknown[]) ?? [],
        newValue: (newValue as unknown[]) ?? []
      }
    });
  }

  private normalizeMutationInput(
    a: unknown,
    method?: ArrayMutationMethod,
    args: unknown[] = []
  ): NormalizedMutationInput {
    if (typeof a === 'string' && (a === 'pop' || a === 'shift')) {
      return this.mutationInputNormalizers[a](undefined, args);
    }
    if (!method) {
      throw new Error('Missing array mutation method');
    }
    return this.mutationInputNormalizers[method](a, args);
  }

  private normalizeSpliceInput(value: unknown): NormalizedMutationInput {
    if (!this.isSpliceOperation(value)) {
      throw new Error('Invalid splice operation payload');
    }
    const op: SpliceOperation = {
      start: value.start,
      deleteCount: value.deleteCount,
      items: Array.isArray(value.items) ? value.items : []
    };
    return { method: 'splice', payload: op, devArgs: [op.start, op.deleteCount, ...op.items] };
  }

  private normalizeVariadicInput(method: Extract<ArrayMutationMethod, 'push' | 'unshift'>, value: unknown, args: unknown[]): NormalizedMutationInput {
    const items = [value, ...args];
    return { method, payload: items, devArgs: items };
  }

  private normalizeSinglePayloadInput(
    method: Exclude<ArrayMutationMethod, 'splice' | 'push' | 'unshift'>,
    value: unknown,
    args: unknown[]
  ): NormalizedMutationInput {
    return { method, payload: value, devArgs: [value, ...args] };
  }

  private executeMutation(
    store: StoreInstance,
    array: unknown[],
    oldValue: unknown,
    info: NormalizedMutationInput
  ): unknown {
    const mutation = this.getOrchestrator(store).mutate(this.path, array, info.method, info.payload);
    this.emitDev(info.method, info.devArgs, oldValue, array);
    return mutation.result;
  }

  findInArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U): U | undefined { return this.queryArray(predicate, 'find') as U | undefined; }
  findIndexInArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U): number { return this.queryArray(predicate, 'findIndex') as number; }
  filterArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): U[] { return this.queryArray(predicate, 'filter') as U[]; }
  mapArray<U = ArrayElementType<T, P>, R = unknown>(callback: MapFn<U, R>): R[] { return this.queryArray(callback, 'map') as R[]; }
  reduceArray<U = ArrayElementType<T, P>, R = unknown>(callback: ReduceFn<U, R>, initialValue: R): R { return this.queryArray(callback, 'reduce', initialValue) as R; }
  someArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): boolean { return this.queryArray(predicate, 'some') as boolean; }
  everyArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U>): boolean { return this.queryArray(predicate, 'every') as boolean; }
  includesInArray<U = ArrayElementType<T, P>>(searchElement: U): boolean { return this.queryArray(searchElement, 'includes') as boolean; }
  indexOfInArray<U = ArrayElementType<T, P>>(searchElement: U): number { return this.queryArray(searchElement, 'indexOf') as number; }
  lengthOfArray(): number { return this.queryArray(undefined as unknown, 'length') as number; }

  updateArrayItem<U = ArrayElementType<T, P>>(index: number, newValue: U): void {
    try {
      this.withArray(true, (store, array) => {
        this.getOrchestrator(store).updateItem(this.path, array as unknown[], index, newValue);
      });
    } catch (error) {
      throw StoreErrorFactory.arrayOperation(
        this.path,
        'updateItem',
        'Update array item operation failed',
        error as Error
      );
    }
  }

  updateArrayItemByFind<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U, newValue: U): void {
    try {
      this.withArray(true, (store, array) => {
        const target = array as U[];
        const predicateFn = this.asPredicate(predicate);
        const index = target.findIndex(predicateFn as PredicateFn<U>);
        if (index !== -1) {
          this.getOrchestrator(store).updateItem(this.path, array as unknown[], index, newValue);
          return;
        }
        store.wakeUpVersionPath(this.path);
      });
    } catch (error) {
      throw StoreErrorFactory.arrayOperation(
        this.path,
        'updateItemByFind',
        'Update array item by find operation failed',
        error as Error
      );
    }
  }

  setArrayMethod(val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown;
  setArrayMethod(method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
  setArrayMethod(val: undefined, method: Extract<ArrayMutationMethod, 'pop' | 'shift'>): unknown;
  setArrayMethod(a: unknown, method?: ArrayMutationMethod, ...args: unknown[]): unknown {
    let info: NormalizedMutationInput | undefined;
    try {
      info = this.normalizeMutationInput(a, method, args);
      return this.withArray(true, (store, array, oldValue) => {
        return this.executeMutation(store, array as unknown[], oldValue, info!);
      });
    } catch (error) {
      const methodName = info?.method ?? (typeof a === 'string' ? (a as ArrayMutationMethod) : method ?? 'unknown');
      throw StoreErrorFactory.arrayOperation(
        this.path,
        methodName,
        `${String(methodName)} operation failed`,
        error as Error
      );
    }
  }

  setArrayMethodOnRef(array: unknown[], val: unknown, method: ArrayMutationMethod, ...args: unknown[]): unknown {
    let info: NormalizedMutationInput | undefined;
    try {
      if (!PathUtils.isValidPath(this.path)) {
        throw StoreErrorFactory.pathValidation(this.path, 'Invalid path format for array operation');
      }
      info = this.normalizeMutationInput(val, method, args);
      const store = this.signalStore.getStore(this.storeName) as StoreInstance;
      return this.executeMutation(store, array, array, info);
    } catch (error) {
      const methodName = info?.method ?? method ?? 'unknown';
      throw StoreErrorFactory.arrayOperation(
        this.path,
        methodName,
        `${String(methodName)} operation failed`,
        error as Error
      );
    }
  }

  queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U> | U, method: 'find'): U | undefined;
  queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U> | U, method: 'findIndex'): number;
  queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U>, method: 'filter'): U[];
  queryArray<U = ArrayElementType<T, P>, R = unknown>(val: MapFn<U, R>, method: 'map'): R[];
  queryArray<U = ArrayElementType<T, P>, R = unknown>(val: ReduceFn<U, R>, method: 'reduce', initialValue: R): R;
  queryArray<U = ArrayElementType<T, P>>(val: PredicateFn<U>, method: 'some' | 'every'): boolean;
  queryArray<U = ArrayElementType<T, P>>(val: U, method: 'includes'): boolean;
  queryArray<U = ArrayElementType<T, P>>(val: U, method: 'indexOf'): number;
  queryArray<U = ArrayElementType<T, P>>(_: unknown, method: 'length'): number;
  queryArray<M extends ArrayQueryMethod, U = ArrayElementType<T, P>>(
    val: ArrayQueryPredicate<U, M | 'length'>,
    method: M | 'length',
    ...extra: unknown[]
  ): unknown {
    try {
      return this.withArray(false, (_, array) => {
        if (!Array.isArray(array)) {
          return this.emptyArrayQueryFallbacks[method]();
        }
        return executeArrayQuery(array as U[], method, val as ArrayQueryPredicate<U, M | 'length'>, extra);
      });
    } catch (error) {
      throw StoreErrorFactory.arrayOperation(
        this.path,
        method as ArrayQueryMethod,
        'Query array operation failed',
        error as Error
      );
    }
  }

  deleteFromArray<U = ArrayElementType<T, P>>(predicate: PredicateFn<U> | U) {
    try {
      return this.withArray(true, (store, array, oldValue) => {
        const target = array as U[];
        const oldLength = target.length;
        const predicateFn = this.asPredicate(predicate);
        const indexes: number[] = [];
        const removed: U[] = [];
        target.forEach((item, index, arr) => {
          if (predicateFn(item, index, arr)) {
            indexes.push(index);
            removed.push(item);
          }
        });
        const filtered = target.filter((item, index, arr) => !predicateFn(item, index, arr));
        target.length = 0;
        target.push(...filtered);
        const newLength = target.length;
        const orchestrator = this.getOrchestrator(store);
        const newValue = store.readStore(this.path as P);
        orchestrator.finalizeArrayChange(
          this.path,
          newValue,
          oldLength,
          newLength,
          indexes.length ? Math.min(...indexes) : null
        );
        return {
          method: 'filter',
          path: this.path,
          args: [predicate],
          oldValue,
          newValue,
          removedElements: removed,
          indexes,
          item: removed
        };
      });
    } catch (error) {
      throw StoreErrorFactory.arrayOperation(
        this.path,
        'deleteFromArray',
        'Delete from array operation failed',
        error as Error
      );
    }
  }

  deleteByIndex(index: number) {
    try {
      return this.withArray(true, (store, array, oldValue) => {
        const target = array as unknown[];
        const oldLength = target.length;
        if (index < 0 || index >= target.length) {
          store.wakeUpVersionPath(this.path);
          return {
            method: 'splice',
            path: this.path,
            args: [{ start: index, deleteCount: 0, items: [] }],
            oldValue,
            newValue: oldValue,
            removedElements: [],
            indexes: [],
            item: undefined
          };
        }
        const [removed] = target.splice(index, 1);
        const orch = this.getOrchestrator(store);
        const newLength = target.length;
        orch.finalizeArrayChange(this.path, target, oldLength, newLength, index);
        const newValue = store.readStore(this.path as P);
        const removedItems = removed !== undefined ? [removed] : [];
        return {
          method: 'splice',
          path: this.path,
          args: [{ start: index, deleteCount: 1, items: [] }],
          oldValue,
          newValue,
          removedElements: removedItems,
          indexes: removedItems.length ? [index] : [],
          item: removed
        };
      });
    } catch (error) {
      throw StoreErrorFactory.arrayOperation(
        this.path,
        'deleteByIndex',
        'Delete by index operation failed',
        error as Error
      );
    }
  }
}

type ElementTypeFromPath<T, P extends string> = PathValue<T, P> extends readonly (infer V)[] ? V : never;

export class ArrayChain<T extends StoreData, P extends ValidPath<T> & string> {
  constructor(private readonly ops: TypedArrayOperations<T, P>) {}
  push(value: ElementTypeFromPath<T, P>): this { this.ops.setArrayMethod(value, 'push'); return this; }
  unshift(value: ElementTypeFromPath<T, P>): this { this.ops.setArrayMethod(value, 'unshift'); return this; }
  pop(): this { this.ops.setArrayMethod('pop'); return this; }
  shift(): this { this.ops.setArrayMethod('shift'); return this; }
  sort(compareFn?: (a: ElementTypeFromPath<T, P>, b: ElementTypeFromPath<T, P>) => number): this { this.ops.setArrayMethod(compareFn, 'sort'); return this; }
  splice(start: number, deleteCount = 0, ...items: Array<ElementTypeFromPath<T, P>>): this { this.ops.setArrayMethod({ start, deleteCount, items }, 'splice'); return this; }
  update(index: number, newValue: ElementTypeFromPath<T, P>): this { this.ops.updateArrayItem<ElementTypeFromPath<T, P>>(index, newValue); return this; }
  updateByFind(
    predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>,
    newValue: ElementTypeFromPath<T, P>
  ): this { this.ops.updateArrayItemByFind<ElementTypeFromPath<T, P>>(predicateOrValue, newValue); return this; }
  delete(predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>): this { this.ops.deleteFromArray<ElementTypeFromPath<T, P>>(predicateOrValue); return this; }
  deleteByIndex(index: number): this { this.ops.deleteByIndex(index); return this; }
  find(
    predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>
  ): ElementTypeFromPath<T, P> | undefined { return this.ops.findInArray<ElementTypeFromPath<T, P>>(predicateOrValue); }
  findIndex(
    predicateOrValue: ElementTypeFromPath<T, P> | PredicateFn<ElementTypeFromPath<T, P>>
  ): number { return this.ops.findIndexInArray<ElementTypeFromPath<T, P>>(predicateOrValue); }
  filter(
    predicate: PredicateFn<ElementTypeFromPath<T, P>>
  ): Array<ElementTypeFromPath<T, P>> { return this.ops.filterArray<ElementTypeFromPath<T, P>>(predicate); }
  map<R>(mapFn: MapFn<ElementTypeFromPath<T, P>, R>): R[] { return this.ops.mapArray<ElementTypeFromPath<T, P>, R>(mapFn); }
  reduce<R>(reduceFn: ReduceFn<ElementTypeFromPath<T, P>, R>, initialValue: R): R { return this.ops.reduceArray<ElementTypeFromPath<T, P>, R>(reduceFn, initialValue); }
  some(predicate: PredicateFn<ElementTypeFromPath<T, P>>): boolean { return this.ops.someArray<ElementTypeFromPath<T, P>>(predicate); }
  every(predicate: PredicateFn<ElementTypeFromPath<T, P>>): boolean { return this.ops.everyArray<ElementTypeFromPath<T, P>>(predicate); }
  includes(value: ElementTypeFromPath<T, P>): boolean { return this.ops.includesInArray<ElementTypeFromPath<T, P>>(value); }
  indexOf(value: ElementTypeFromPath<T, P>): number { return this.ops.indexOfInArray<ElementTypeFromPath<T, P>>(value); }
  length(): number { return this.ops.lengthOfArray(); }
}
