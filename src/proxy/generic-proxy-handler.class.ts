import { BaseProxyHandler } from './base-proxy-handler.abstract';
import { IStoreInstance } from '../interfaces/store-instance.interface';
import { StoreData, StrictPath } from '../types/advanced-types';
import type { ProxyCallable } from '../interfaces/types';
import { isValidPath } from '../types/type-guards';
import { logger } from '../utils/logger';
// Deep imports on purpose: this file sits in the INITIAL bundle graph. Importing the
// jsnq barrel here would hoist every operator re-export into the initial chunk even
// though operators are only used by lazy pages (esbuild shared-chunk assignment).
import JsnqPipeline from 'jsnq/core/pipeline';
import type { JsonOperator, PipelineStats, JsonLike } from 'jsnq/core/types';
import { cloneJsonData } from 'jsnq/core/data-engine';
import {
  applyDeepSugarPatch,
  collectPipelineIntent,
  isDeepSugarAction,
  tryFastPipelineMutation,
  tryFastStructuralMutation,
} from 'jsnq/core/pipeline-fastpath';
import type { CreateStoreService } from '../core/create-store.core';
import { computed, Signal } from '@angular/core';
import { hashString } from '../utils/array-query-key.utils';

interface GenericHandlerOptions {
  /** Path prefix representing the current depth ("" for root). */
  pathPrefix: string;
  /** Should the proxy expose methods that live directly on the store instance? */
  exposeStoreMethods: boolean;
  /** Original value found at path – needed for correct array-method handling. */
  originalNestedValue?: unknown;
  /** Resolver responsible for returning the up-to-date value for any path. */
  resolveFn: (path: string) => unknown;
  /** Factory used to build deeper callable proxies. */
  nestedProxyFactory: (path: string, value: unknown) => ProxyCallable<unknown>;
  /** If false, pipe/subscribe are blocked (root level behaviour). */
  rxjsAllowedOnRoot?: boolean;
  /** Strict mode: throw on invalid path usage instead of warn. */
  strictInvalidPath?: boolean;
  /** Strict mode: throw when pipe/subscribe used on root. */
  strictRootRxjs?: boolean;
  /** Strict mode: throw when deleting (setting undefined) without explicit allowance. */
  strictDeleteUndefined?: boolean;
  /** Custom setter/deleter/cleanup hooks (root uses them). */
  setFn?: (path: string, value: unknown) => void;
  deleteFn?: (path: string) => void;
  cleanupFn?: () => void;
}

type PipelineExecutionResult = {
  value: unknown;
  stats: PipelineStats;
  results: unknown[];
};

type PipelineCountResult = {
  value: unknown;
  stats: PipelineStats;
  count: number;
};

interface StorePipelineBuilder {
  pipe: (...ops: Array<JsonOperator<JsnqPipeline>>) => StorePipelineBuilder;
  all: () => unknown;
  first: () => unknown;
  count: () => unknown;
}

type StorePipelineEntry = StorePipelineBuilder & ((...ops: Array<JsonOperator<JsnqPipeline>>) => StorePipelineBuilder);
type ProxyApiMethod =
  | 'mutate' | 'query' | 'pipeline'
  // $-prefixed, collision-free jsnq read surface (parity with solid-store)
  | '$mutate' | '$query' | '$queryOne' | '$liveQuery' | '$liveQueryOne';
type ReactivePipelineMode = 'all' | 'first' | 'count';
type ReactivePipelineResultHandler = (pipeline: JsnqPipeline) => unknown;
type EmptyPipelineResultHandler = () => unknown;
type MutatingPipelineModeResult = {
  executable: JsnqPipeline;
  results: unknown[];
  count: number;
};
type MutatingPipelineModeHandler = (pipeline: JsnqPipeline) => MutatingPipelineModeResult;
type MutatingPipelineResponseContext = MutatingPipelineModeResult & {
  stats: PipelineStats;
};
type MutatingPipelineResponseHandler = (context: MutatingPipelineResponseContext) => PipelineExecutionResult | PipelineCountResult;
type RootRxJSMethod = 'pipe' | 'subscribe';
type ArrayMutationMethodCacheEntry = { handler: Function; arrayRef: unknown[] };

export class GenericProxyHandler<T extends StoreData = StoreData> extends BaseProxyHandler<T> {
  private static readonly operatorIds = new WeakMap<Function, number>();
  private static nextOperatorId = 0;
  // Per-proxy cache for array query computed signals (WeakRef to allow GC) – flat JSON map
  private readonly arrayQueryCache: Record<string, WeakRef<object> | undefined> = Object.create(null);
  private readonly arrayMutationMethodCache: Record<string, ArrayMutationMethodCacheEntry | undefined> = Object.create(null);
  // Strong nested cache per level to speed up repeated child gets – flat JSON map
  private readonly nestedCache: Record<string, unknown> = Object.create(null);
  private nestedCacheSize = 0;
  private readonly reactivePipelineResultHandlers: Record<ReactivePipelineMode, ReactivePipelineResultHandler> = {
    all: (pipeline) => pipeline.all(),
    first: (pipeline) => {
      const first = pipeline.first();
      return first !== null && first !== undefined ? first : undefined;
    },
    count: (pipeline) => pipeline.count()
  };
  private readonly emptyPipelineResultHandlers: Record<ReactivePipelineMode, EmptyPipelineResultHandler> = {
    all: () => [],
    first: () => undefined,
    count: () => 0
  };
  private readonly mutatingPipelineModeHandlers: Record<ReactivePipelineMode, MutatingPipelineModeHandler> = {
    all: (pipeline) => this.executeMutatingAll(pipeline),
    first: (pipeline) => this.executeMutatingFirst(pipeline),
    count: (pipeline) => this.executeMutatingCount(pipeline)
  };
  private readonly mutatingPipelineResponseHandlers: Record<ReactivePipelineMode, MutatingPipelineResponseHandler> = {
    all: (context) => this.toPipelineExecutionResult(context),
    first: (context) => this.toPipelineExecutionResult(context),
    count: (context) => this.toPipelineCountResult(context)
  };
  constructor(
    storeInstance: IStoreInstance<T>,
    private readonly options: GenericHandlerOptions
  ) {
    super(storeInstance);
  }

  /**
   * Detects if operators contain mutation operations (update, delete, insert, move, copy, etc.)
   * OPTIMIZED: Uses typed metadata flag instead of slow toString() + string.includes()
   */
  private hasMutationOperators(operators: Array<JsonOperator<JsnqPipeline>>): boolean {
    return operators.some(op => op.__isMutation === true);
  }

  private getOperatorCacheSegment(operator: JsonOperator<JsnqPipeline>): string {
    const metadataKey = operator.__cacheKey;
    if (metadataKey) {
      return String(metadataKey);
    }

    const fn = operator as unknown as Function;
    let id = GenericProxyHandler.operatorIds.get(fn);
    if (id === undefined) {
      id = ++GenericProxyHandler.nextOperatorId;
      GenericProxyHandler.operatorIds.set(fn, id);
    }
    return `fn:${id}`;
  }

  private clearNestedCache(): void {
    for (const key in this.nestedCache) {
      delete this.nestedCache[key];
    }
    this.nestedCacheSize = 0;
  }

  private deleteNestedCacheKey(key: string): void {
    if (Object.prototype.hasOwnProperty.call(this.nestedCache, key)) {
      delete this.nestedCache[key];
      this.nestedCacheSize--;
    }
  }

  private clonePipelineInput<TValue>(value: TValue): TValue {
    // Same JSON-like clone contract as the rest of jsnq (pipeline autoClone, SolidStore).
    return cloneJsonData(value);
  }

  private shouldTrackPipelineOperations(): boolean {
    const service = (this.storeInstance as unknown as {
      createServiceGetter?: CreateStoreService<StoreData>;
    }).createServiceGetter;
    return service?.signalStore?.devActive === true;
  }

  /**
   * Smart pipeline builder that auto-detects mutations and routes to mutate or reactive pipeline
   */
  private createSmartPipelineBuilder(pathPrefix: string): Function {
    return (...operators: Array<JsonOperator<JsnqPipeline>>) => {
      const builder = this.hasMutationOperators(operators)
        ? this.createMutatingPipelineBuilder(pathPrefix)
        : this.createReactivePipelineBuilder(pathPrefix);
      return builder(...operators);
    };
  }

  /**
   * Creates immediate execution pipeline method that auto-clones data and updates store.
   * Usage: this.menuStore.allItems.mutate(where(...), update(...))
   */
  private createMutateMethod(): Function {
    return (...operators: Array<JsonOperator<JsnqPipeline>>) => {
      const fast = this.tryFastMutate(operators);
      if (fast) return fast.value;
      return this.executeMutatingPipeline(operators, 'all')?.value;
    };
  }

  /**
   * COW hot paths for mutate(): the shared jsnq engine (pipeline-fastpath.ts) computes
   * the next value without deep-cloning untouched branches, then we commit it exactly like
   * the pipeline path would. Covers the flat-array where+actions shape, the single-action
   * structural shortcuts (root insert, flat delete_key, insert_to-inside-array) and the
   * sugar deep patch. Returns undefined outside the guards, in which case the full
   * clone+pipeline flow below runs unchanged.
   */
  private tryFastMutate(operators: Array<JsonOperator<JsnqPipeline>>): { value: unknown } | undefined {
    const currentPath = this.fullPathPrefix;
    const storeInstance = this.storeInstance as unknown as IStoreInstance<StoreData> & {
      createServiceGetter?: CreateStoreService<StoreData>;
      deleteValue?: (path: string) => void;
      setValue?: (path: string, value: unknown) => void;
      readStore?: (path: string) => unknown;
      store?: StoreData;
      preciseMutationWake?: boolean;
      commitMutationPrecise?: (branch: string, value: unknown, relPaths: readonly string[]) => void;
    };
    const currentValue = currentPath
      ? storeInstance.readStore?.(currentPath)
      : (storeInstance.store as StoreData);
    if (currentValue === undefined) return undefined;

    const collectAffectedPaths = !!(
      storeInstance.preciseMutationWake &&
      currentPath &&
      storeInstance.commitMutationPrecise
    );
    const fast = tryFastPipelineMutation(currentValue, operators, { collectAffectedPaths });
    if (fast) {
      if (fast.mutations > 0) {
        // Opt-in fine-grained wake for sub-path branches (flat value-action shape only) —
        // mirrors SolidStore: wake exactly the changed leaves instead of the whole branch.
        if (storeInstance.preciseMutationWake && currentPath && storeInstance.commitMutationPrecise) {
          const paths = fast.affectedPaths;
          if (paths && paths.length > 0) {
            storeInstance.commitMutationPrecise(currentPath, fast.value, paths);
            return { value: fast.value };
          }
        }
        this.commitPipelineData(storeInstance, currentPath, fast.value as JsonLike);
      }
      return { value: fast.value };
    }

    const intent = collectPipelineIntent(operators);

    const structural = tryFastStructuralMutation(currentValue, intent);
    if (structural) {
      this.commitPipelineData(storeInstance, currentPath, structural.value as JsonLike);
      return { value: structural.value };
    }

    // Sugar deep patch (where + update({patch})): not representable in the raw pipeline,
    // shared helper is the canonical semantics for every host.
    if (intent.criteria.length > 0 && intent.actions.length > 0 && intent.actions.every(isDeepSugarAction)) {
      const patched = applyDeepSugarPatch(currentValue, intent.criteria, intent.actions);
      this.commitPipelineData(storeInstance, currentPath, patched as JsonLike);
      return { value: patched };
    }

    return undefined;
  }

  private createMutatingPipelineBuilder(_pathPrefix: string): StorePipelineEntry {
    const operators: Array<JsonOperator<JsnqPipeline>> = [];

    const execute = (mode: ReactivePipelineMode): PipelineExecutionResult | PipelineCountResult | undefined => {
      return this.executeMutatingPipeline(operators, mode);
    };

    const builder: StorePipelineBuilder = {
      pipe: (...ops: Array<JsonOperator<JsnqPipeline>>) => {
        operators.push(...ops);
        return builder;
      },
      all: () => execute('all'),
      first: () => execute('first'),
      count: () => execute('count')
    };

    const entry = ((...ops: Array<JsonOperator<JsnqPipeline>>) => {
      if (ops.length) {
        builder.pipe(...ops);
      }
      return builder;
    }) as StorePipelineEntry;

    entry.pipe = builder.pipe;
    entry.all = builder.all;
    entry.first = builder.first;
    entry.count = builder.count;

    return entry;
  }

  private executeMutatingPipeline(
    operators: Array<JsonOperator<JsnqPipeline>>,
    mode: ReactivePipelineMode
  ): PipelineExecutionResult | PipelineCountResult | undefined {
    const currentPath = this.fullPathPrefix;
    const storeInstance = this.storeInstance as unknown as IStoreInstance<StoreData> & {
      createServiceGetter?: CreateStoreService<StoreData>;
      deleteValue?: (path: string) => void;
      setValue?: (path: string, value: unknown) => void;
      readStore?: (path: string) => unknown;
      store?: StoreData;
    };

    const currentValue = currentPath
      ? storeInstance.readStore?.(currentPath)
      : (storeInstance.store as StoreData);

    if (currentValue === undefined) {
      logger.warn(`Cannot mutate undefined value at path: ${currentPath || 'root'}`);
      return undefined;
    }

    let pipeline = new JsnqPipeline(this.clonePipelineInput(currentValue) as JsonLike, {
      trackOperations: this.shouldTrackPipelineOperations(),
    });
    for (const op of operators) {
      pipeline = op(pipeline);
    }

    const executed = this.mutatingPipelineModeHandlers[mode](pipeline);
    const stats = executed.executable.getStats();

    if (this.getPipelineMutationCount(stats) > 0) {
      this.commitPipelineData(storeInstance, currentPath, executed.executable.data);
    }

    return this.mutatingPipelineResponseHandlers[mode]({ ...executed, stats });
  }

  private executeMutatingAll(pipeline: JsnqPipeline): MutatingPipelineModeResult {
    const results = pipeline.all();
    return { executable: pipeline, results, count: results.length };
  }

  private executeMutatingFirst(pipeline: JsnqPipeline): MutatingPipelineModeResult {
    const executable = pipeline.with({ options: { ...(pipeline.options as object), earlyTermination: true } });
    const results = executable.all();
    return { executable, results, count: results.length };
  }

  private executeMutatingCount(pipeline: JsnqPipeline): MutatingPipelineModeResult {
    const count = pipeline.count();
    return { executable: pipeline, results: [], count };
  }

  private toPipelineExecutionResult(context: MutatingPipelineResponseContext): PipelineExecutionResult {
    return { value: context.executable.data, stats: context.stats, results: context.results };
  }

  private toPipelineCountResult(context: MutatingPipelineResponseContext): PipelineCountResult {
    return { value: context.executable.data, stats: context.stats, count: context.count };
  }

  private getPipelineMutationCount(stats: PipelineStats): number {
    return (
      stats.replaces +
      stats.updates +
      stats.mergeUpdates +
      stats.deletedKeys +
      stats.deletedElements +
      stats.inserted +
      stats.moved +
      stats.copied
    );
  }

  private commitPipelineData(
    storeInstance: IStoreInstance<StoreData> & {
      createServiceGetter?: CreateStoreService<StoreData>;
      deleteValue?: (path: string) => void;
      setValue?: (path: string, value: unknown) => void;
      store?: StoreData;
    },
    currentPath: string,
    data: JsonLike
  ): void {
    const service = storeInstance.createServiceGetter;
    service?.beginAction?.();

    try {
      if (currentPath && currentPath.length > 0) {
        storeInstance.setValue?.(currentPath, data);
        return;
      }

      const newRoot = data as Record<string, unknown>;
      const currentRoot = storeInstance.store as Record<string, unknown>;
      const keys = new Set<string>([
        ...Object.keys(currentRoot || {}),
        ...Object.keys(newRoot || {}),
      ]);
      for (const key of keys) {
        if (!(key in newRoot)) {
          storeInstance.deleteValue?.(key);
        } else {
          storeInstance.setValue?.(key, newRoot[key]);
        }
      }
    } finally {
      service?.endAction?.();
    }
  }

  /**
   * Creates reactive pipeline builder (for queries without mutations)
   * Returns Signal-based results
   */
  private createReactivePipelineBuilder(pathPrefix: string): StorePipelineEntry {
    const normalizedPath = pathPrefix;
    const storeInstance = this.storeInstance as unknown as IStoreInstance<StoreData> & {
      createServiceGetter?: CreateStoreService<StoreData>;
      deleteValue?: (path: string) => void;
      setValue?: (path: string, value: unknown) => void;
      readStore?: (path: string) => unknown;
      store?: StoreData;
    };

    const service = storeInstance.createServiceGetter;

    const collectOps = (): StorePipelineBuilder => {
      const operators: Array<JsonOperator<JsnqPipeline>> = [];

      const createCacheKey = (mode: string): string => {
        // Serialize operators with their metadata if available
        const opsSerialized = operators.map((op) => this.getOperatorCacheSegment(op)).join('|');
        const hash = hashString(opsSerialized + mode);
        const prefix = normalizedPath && normalizedPath.length > 0 ? `${normalizedPath}.` : '';
        return `${prefix}$pipeline.${hash}`;
      };

      const execute = (mode: ReactivePipelineMode): Signal<unknown> => {
        const cacheKey = createCacheKey(mode);

        // Check if cached computed exists
        const cached = service?.getSignalFromProxyCache?.(cacheKey);
        if (cached) {
          return cached as Signal<unknown>;
        }

        // Create new computed signal
        const sig = computed(() => {
          // Track version for reactivity
          const versionPath = service?.resolveVersionPathNormalized
            ? service.resolveVersionPathNormalized(normalizedPath)
            : service?.resolveVersionPath?.(normalizedPath) || normalizedPath;
          const version = service?.getVersion?.(versionPath);
          version?.();

          const currentValue = normalizedPath
            ? storeInstance.readStore?.(normalizedPath)
            : (storeInstance.store as StoreData);

          if (currentValue === undefined) {
            return this.emptyPipelineResultHandlers[mode]();
          }

          const hasMutations = collectPipelineIntent(operators).actions.length > 0;
          let pipeline = new JsnqPipeline(
            (hasMutations ? cloneJsonData(currentValue) : currentValue) as JsonLike,
            { trackOperations: this.shouldTrackPipelineOperations() },
          );
          for (const op of operators) {
            pipeline = op(pipeline);
          }

          return this.reactivePipelineResultHandlers[mode](pipeline);
        });

        // Cache the computed signal in both proxy cache and computed store
        if (service?.registerPipelineComputed) {
          service.registerPipelineComputed(cacheKey, sig as Signal<unknown>);
        } else {
          service?.setSignalInProxyCache?.(cacheKey, sig);
        }

        return sig;
      };

      const builder: StorePipelineBuilder = {
        pipe: (...ops: Array<JsonOperator<JsnqPipeline>>) => {
          operators.push(...ops);
          return builder;
        },
        all: () => execute('all') as Signal<unknown[]>,
        first: () => execute('first') as Signal<unknown>,
        count: () => execute('count') as Signal<number>,
      };

      return builder;
    };

    const builder = collectOps();
    const entry = ((...ops: Array<JsonOperator<JsnqPipeline>>) => {
      if (ops.length) {
        builder.pipe(...ops);
      }
      return builder;
    }) as StorePipelineEntry;

    entry.pipe = builder.pipe;
    entry.all = builder.all;
    entry.first = builder.first;
    entry.count = builder.count;

    return entry;
  }

  /**
   * one-shot snapshot query using the JSNQ DSL. Returns matched values (not result
   * nodes), mirroring solid-store's $query/$queryOne. Non-reactive — reads the current value once.
   */
  private createSnapshotQueryMethod(mode: 'all' | 'first'): (...ops: Array<JsonOperator<JsnqPipeline>>) => unknown {
    const path = this.fullPathPrefix;
    return (...ops: Array<JsonOperator<JsnqPipeline>>) => {
      const current = path
        ? this.storeInstance.readStore?.(path)
        : (this.storeInstance.store as StoreData);
      if (current === undefined) return mode === 'first' ? null : [];
      const hasMutations = collectPipelineIntent(ops).actions.length > 0;
      let pipeline = new JsnqPipeline((hasMutations ? cloneJsonData(current) : current) as JsonLike, {
        trackOperations: this.shouldTrackPipelineOperations(),
      });
      for (const op of ops) pipeline = op(pipeline);
      if (mode === 'first') {
        return pipeline.first();
      }
      return (pipeline.all() as Array<{ data?: unknown }>).map(
        (node) => (node && typeof node === 'object' && 'data' in node ? node.data : node)
      );
    };
  }

  /**
   * reactive live query — a callable accessor (read it in a computed/effect/template)
   * that recomputes when the queried branch changes. Built on the existing reactive pipeline
   * builder (version-tracked Angular computed); maps result nodes to matched values.
   */
  private createLiveQueryMethod(mode: 'all' | 'first'): (...ops: Array<JsonOperator<JsnqPipeline>>) => (() => unknown) {
    const path = this.fullPathPrefix;
    return (...ops: Array<JsonOperator<JsnqPipeline>>) => {
      const entry = this.createReactivePipelineBuilder(path) as StorePipelineEntry;
      const chained = entry(...ops);
      if (mode === 'first') {
        const sig = chained.first() as Signal<unknown>;
        return () => {
          return sig() ?? null;
        };
      }
      const sig = chained.all() as Signal<unknown[]>;
      return () => ((sig() as Array<{ data?: unknown }>) ?? []).map(
        (node) => (node && typeof node === 'object' && 'data' in node ? node.data : node)
      );
    };
  }

  /* -------------------------------------------------------------------------- */
  /*                                  helpers                                   */
  /* -------------------------------------------------------------------------- */
  private get fullPathPrefix(): string {
    return this.options.pathPrefix || '';
  }

  /* -------------------------------------------------------------------------- */
  /*                       BaseProxyHandler abstract impl                       */
  /* -------------------------------------------------------------------------- */
  protected constructPath(key: string): string {
    return this.fullPathPrefix ? `${this.fullPathPrefix}.${key}` : key;
  }

  protected resolveValue(path: string): unknown {
    return this.options.resolveFn(path);
  }

  protected createNestedProxy(path: string, value: unknown, _key: string): unknown {
    const direct = this.options.nestedProxyFactory(path, value);
    return direct;
  }

  protected handleStoreInstanceMethods(keyStr: string): Function | null {
    const proxyApiMethod = this.createProxyApiMethod(keyStr);
    if (proxyApiMethod) {
      return proxyApiMethod;
    }

    if (!this.options.exposeStoreMethods) {
      return null;
    }
    return typeof (this.storeInstance as Record<string, unknown>)[keyStr] === 'function'
      ? (this.storeInstance as unknown as Record<string, Function>)[keyStr].bind(this.storeInstance)
      : null;
  }

  private createProxyApiMethod(keyStr: string): Function | null {
    switch (keyStr as ProxyApiMethod) {
      case 'mutate':
      case '$mutate':
        return this.createMutateMethod();
      case 'query':
        return this.createReactivePipelineBuilder(this.fullPathPrefix);
      case 'pipeline':
        return this.createSmartPipelineBuilder(this.fullPathPrefix);
      case '$query':
        return this.createSnapshotQueryMethod('all');
      case '$queryOne':
        return this.createSnapshotQueryMethod('first');
      case '$liveQuery':
        return this.createLiveQueryMethod('all');
      case '$liveQueryOne':
        return this.createLiveQueryMethod('first');
      default:
        return null;
    }
  }

  protected setValue(path: string, value: unknown): void {
    if (value === undefined && this.options.strictDeleteUndefined) {
      throw new Error(`Setting undefined is not allowed in strict mode for path: ${path}`);
    }
    if (this.options.setFn) {
      this.options.setFn(path, value);
    } else if (isValidPath<T>(path)) {
      this.storeInstance.setValue(path as StrictPath<T>, value as unknown as never);
    } else {
      if (this.options.strictInvalidPath) {
        throw new Error(`Invalid path for setValue: ${path}`);
      } else {
        logger.warn(`Invalid path for setValue: ${path}`);
      }
    }
  }

  protected deleteValue(path: string): void {
    if (this.options.deleteFn) {
      // In strict mode, allow deletion when a dedicated deleteFn is provided
      // (implementation is expected to perform safe cleanup). Otherwise, block.
      this.options.deleteFn(path);
    } else if (isValidPath<T>(path)) {
      if (this.options.strictDeleteUndefined) {
        throw new Error(`Delete operation is not allowed in strict mode for path: ${path}`);
      }
      this.storeInstance.setValue(path as StrictPath<T>, undefined as unknown as never);
    } else {
      if (this.options.strictInvalidPath) {
        throw new Error(`Invalid path for deleteValue: ${path}`);
      } else {
        logger.warn(`Invalid path for deleteValue: ${path}`);
      }
    }
  }

  protected performCleanup(): void {
    if (this.options.cleanupFn) {
      this.options.cleanupFn();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          Special-case method hooks                          */
  /* -------------------------------------------------------------------------- */
  protected override resolveRxJSPath(keyStr: string, path: string): string | null {
    return (keyStr === 'pipe' || keyStr === 'subscribe')
      ? this.resolveRootRxJSPath(keyStr, path)
      : path;
  }

  private resolveRootRxJSPath(keyStr: RootRxJSMethod, _path: string): string | null {
    if (this.options.rxjsAllowedOnRoot === false) {
      if (this.options.strictRootRxjs) {
        throw new Error(`RxJS method '${keyStr}' is not allowed on root proxy in strict mode`);
      }
      return null; // Block pipe/subscribe on root-level proxy
    }

    // For RxJS helper methods (pipe / subscribe) we want them to operate on the *current* proxy path,
    // not on a fictitious "path.method" path that includes the method name. The Base implementation
    // receives the full "path.method" string, so we need to strip the trailing method part before
    // delegating.
    return this.fullPathPrefix;
  }

  protected override getArrayMethodPath(path: string): string {
    return this.fullPathPrefix || path;
  }

  protected override getArrayMethodCandidate(value: unknown): unknown {
    return this.fullPathPrefix ? this.resolveValue(this.fullPathPrefix) : (this.options.originalNestedValue ?? value);
  }

  protected override getPropertyCache(): Record<string, unknown> {
    return this.nestedCache;
  }

  protected override getArrayMutationCleanup(): (() => void) | undefined {
    return () => this.clearNestedCache();
  }

  protected override getArrayQueryCache(): Record<string, unknown> {
    return this.arrayQueryCache as unknown as Record<string, unknown>;
  }

  protected override getArrayMutationMethodCache(): Record<string, ArrayMutationMethodCacheEntry | undefined> {
    return this.arrayMutationMethodCache;
  }

  protected override getCachedProperty(
    keyStr: string,
    _currentPath: string
  ): unknown | typeof BaseProxyHandler.UNHANDLED {
    if (Object.prototype.hasOwnProperty.call(this.nestedCache, keyStr)) {
      return this.nestedCache[keyStr];
    }
    return BaseProxyHandler.UNHANDLED;
  }

  protected override cacheResolvedProperty(
    keyStr: string,
    _currentPath: string,
    _currentValue: unknown,
    resolvedValue: unknown
  ): unknown {
    const hadKey = Object.prototype.hasOwnProperty.call(this.nestedCache, keyStr);
    if (!hadKey && this.nestedCacheSize > 200) {
      this.clearNestedCache();
    }
    if (!hadKey) this.nestedCacheSize++;
    this.nestedCache[keyStr] = resolvedValue;
    return resolvedValue;
  }

  protected override afterSetProperty(keyStr: string, _targetPath: string, value: unknown): void {
    if (value === undefined) {
      this.deleteNestedCacheKey(keyStr);
    }
  }

  protected override afterDeleteProperty(keyStr: string): void {
    this.deleteNestedCacheKey(keyStr);
  }
}
