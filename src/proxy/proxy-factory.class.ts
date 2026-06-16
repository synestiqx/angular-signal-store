import { ProxyFactoryConfig } from '../interfaces/proxy-factory-config.interface';
import { ILogger } from '../interfaces/logger.interface';
import { StoreProxy, ProxyCallable } from '../interfaces/types';
import { IStoreInstance } from '../interfaces/store-instance.interface';
import { BaseProxyHandler } from './base-proxy-handler.abstract';
import { createCallableProxy, type CallableProxyOptions } from './callable-proxy.util';
import { GenericProxyHandler } from './generic-proxy-handler.class';
import { StoreData } from '../types/advanced-types';
import { SignalStore } from '../core/signal-store.service';
import { CreateStoreService } from '../core/create-store.core';
import { PathUtils } from '../utils/path-utils';
import { PathReader } from '../utils/abstracts/path-reader';

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
}

export class ProxyFactory {
  private readonly maxCacheSize: number;
  private readonly logger: ILogger;
  private readonly metricsCallback?: (storeName: string, metrics: { hits: number; misses: number; hitRate: number; cacheSize: number }) => void;
  private readonly storeName?: string;
  private readonly signalStore: SignalStore;
  private readonly useInPlaceIteration: boolean;
  private readonly createStoreService: CreateStoreService;
  private readonly strictInvalidPath: boolean;
  private readonly strictRootRxjs: boolean;
  private readonly strictDeleteUndefined: boolean;
  private readonly rxjsAllowedOnRoot: boolean;
  private metricsIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly pathReader = new PathReader();

  constructor(config: ProxyFactoryConfig = {}) {
    this.maxCacheSize = config.maxCacheSize ?? 1000;
    this.logger = config.logger ?? console;
    this.metricsCallback = config.metricsCallback;
    this.storeName = config.storeName;
    this.signalStore = config.signalStore!;
    this.useInPlaceIteration = config.useInPlaceIteration ?? false;
    this.createStoreService = config.createStoreService!;
    this.strictInvalidPath = !!config.strictInvalidPath;
    this.strictRootRxjs = !!config.strictRootRxjs;
    this.strictDeleteUndefined = !!config.strictDeleteUndefined;
    this.rxjsAllowedOnRoot = config.rxjsAllowedOnRoot ?? true;
    this.configureProxyCacheLimit();

    if (this.metricsCallback && this.storeName) {
      this.updateMetricsTimer(!!this.signalStore?.devActive);
    }
  }

  public updateMetricsTimer(active: boolean) {
    if (!this.metricsCallback || !this.storeName) return;
    if (active) {
      if (this.metricsIntervalId) return;
      this.metricsIntervalId = setInterval(() => {
        const metrics = this.createStoreService.getProxyCacheMetrics();
        if (this.metricsCallback) {
          this.metricsCallback(this.storeName!, metrics);
        }
      }, 2000);
    } else {
      if (this.metricsIntervalId) {
        clearInterval(this.metricsIntervalId);
        this.metricsIntervalId = null;
      }
    }
  }

  destroy() {
    if (this.storeName) {
      this.createStoreService.resetProxyCache();
      this.clearProxyCacheLimit();
    }
    if (this.metricsIntervalId) {
      clearInterval(this.metricsIntervalId);
      this.metricsIntervalId = null;
    }
  }

  getCacheMetrics(): CacheMetrics & { cacheSize: number; cacheKeys: string[]; cacheDump: Array<{ key: string; value: string }> } {
    if (!this.storeName) {
      return { hits: 0, misses: 0, hitRate: 0, cacheSize: 0, cacheKeys: [], cacheDump: [] };
    }
    const metrics = this.createStoreService.getProxyCacheMetrics();
    const cacheDump = this.createStoreService.getProxyCacheDump();
    return {
      ...metrics,
      cacheSize: metrics.cacheKeys.length,
      cacheKeys: metrics.cacheKeys,
      cacheDump
    };
  }

  resetCache() {
    if (this.storeName) {
      this.createStoreService.resetProxyCache();
    }
  }

  private recordCacheHit() {
    if (this.storeName) {
      this.createStoreService.recordProxyCacheHit();
    }
  }

  private recordCacheMiss() {
    if (this.storeName) {
      this.createStoreService.recordProxyCacheMiss();
    }
  }

  private configureProxyCacheLimit(): void {
    if (!this.storeName || !this.signalStore) return;
    this.signalStore.setProxyCacheLimit(this.storeName, this.maxCacheSize);
  }

  private clearProxyCacheLimit(): void {
    if (!this.storeName || !this.signalStore) return;
    this.signalStore.clearProxyCacheLimit(this.storeName);
  }

  clearCacheForPath(path: string) {
    if (this.storeName) {
      this.createStoreService.clearProxyCacheForPath(path);
    }
  }

  private getValueIteratively<R = unknown, S extends StoreData = StoreData>(storeInstance: IStoreInstance<S>, path: string): R | undefined {
    if (this.useInPlaceIteration && path.indexOf('[') === -1) {
      return this.readDotPathInPlace<R>(storeInstance.store as unknown as Record<string, unknown>, path);
    }
    return this.pathReader.read<R>(storeInstance.store as unknown as Record<string, unknown>, path);
  }

  private readDotPathInPlace<R>(root: Record<string, unknown> | undefined, path: string): R | undefined {
    if (!root || !path) return undefined;
    let current: unknown = root;
    let start = 0;

    for (let i = 0; i <= path.length; i++) {
      if (i !== path.length && path.charCodeAt(i) !== 46) continue;
      if (current == null) return undefined;
      const segment = path.slice(start, i);
      current = (current as Record<string, unknown>)[segment];
      start = i + 1;
    }

    return current as R | undefined;
  }

  private cacheMake<S extends StoreData>(
    path: string,
    value: unknown,
    storeInstance: IStoreInstance<S>,
    nestedProxyFactory: (path: string, value: unknown) => ProxyCallable,
    callableOptions: CallableProxyOptions
  ): ProxyCallable {
    const cached = this.createStoreService.getProxyCacheEntry(path);
    if (cached) {
      this.recordCacheHit();
      return cached;
    }

    this.recordCacheMiss();

    const callableProxy = createCallableProxy(
      path,
      storeInstance as unknown as IStoreInstance<StoreData>,
      value,
      nestedProxyFactory,
      callableOptions
    ) as ProxyCallable;
    this.createStoreService.setProxyCacheEntry(callableProxy, path);

    if (path.includes('.')) {
      const segments = path.split('.');
      let prefix = '';
      for (let i = 0; i < segments.length - 1; i++) {
        prefix = prefix ? `${prefix}.${segments[i]}` : segments[i];
        if (!this.createStoreService.getProxyCacheEntry(prefix)) {
          const intermediateValue = this.getValueIteratively<unknown, S>(storeInstance, prefix);
          if (intermediateValue !== undefined) {
              const intermediateProxy = createCallableProxy(
                prefix,
                storeInstance as unknown as IStoreInstance<StoreData>,
                intermediateValue,
                nestedProxyFactory,
                callableOptions
              ) as ProxyCallable;
            this.createStoreService.setProxyCacheEntry(intermediateProxy, prefix);
            try {
              storeInstance.prefetchCursorWithNode?.(prefix, intermediateValue);
            } catch (e) {
              console.warn('ProxyFactory prefetchCursor error:', e);
            }
          }
        }
      }
    }

    return callableProxy;
  }

  createStoreProxy<T extends StoreData>(storeInstance: IStoreInstance<T>): StoreProxy<T> {
    const setFn = (p: string, v: unknown): void => {
      if (v === undefined && this.strictDeleteUndefined) {
        throw new Error(`Setting undefined is not allowed in strict mode for path: ${p}`);
      }
      if (v === undefined) {
        deleteFn(p);
        return;
      }
      const fast = storeInstance.setValueFast;
      if (typeof fast === 'function') {
        if (!PathUtils.isValidPath(p)) {
          if (this.strictInvalidPath) throw new Error(`Invalid path for setValueFast: ${p}`);
          this.logger.warn(`Invalid path for setValueFast: ${p}`);
          return;
        }
        fast.call(storeInstance, p, v);
        return;
      }
      if (!PathUtils.isValidPath(p)) {
        if (this.strictInvalidPath) throw new Error(`Invalid path for setValue: ${p}`);
        this.logger.warn(`Invalid path for setValue: ${p}`);
        return;
      }
      storeInstance.setValueObserve(p as never, v as never);
    };

    const deleteFn = (p: string): void => {
      if (this.strictDeleteUndefined) {
        throw new Error(`Delete operation is not allowed in strict mode for path: ${p}`);
      }
      if (!PathUtils.isValidPath(p)) {
        if (this.strictInvalidPath) throw new Error(`Invalid path for deleteValue: ${p}`);
        this.logger.warn(`Invalid path for deleteValue: ${p}`);
        return;
      }
      if (storeInstance.deleteValue) {
        storeInstance.deleteValue(p as never);
      } else {
        storeInstance.cleanupPath(p);
        storeInstance.setValue(p as never, undefined as never);
      }
    };

    const callableOptions: CallableProxyOptions = {
      strictInvalidPath: this.strictInvalidPath,
      strictDeleteUndefined: this.strictDeleteUndefined,
      setFn,
      deleteFn,
    };

    const nestedProxyFactory = (path: string, value: unknown): ProxyCallable => {
      try {
        return this.cacheMake(path, value, storeInstance, nestedProxyFactory, callableOptions);
      } catch (error) {
        this.logger.warn(`Error creating proxy for path ${path}:`, error);
        return createCallableProxy(
          path,
          storeInstance as unknown as IStoreInstance<StoreData>,
          value,
          nestedProxyFactory,
          callableOptions
        ) as ProxyCallable;
      }
    };

    const handler = new GenericProxyHandler<T>(storeInstance, {
      pathPrefix: '',
      exposeStoreMethods: true,
      resolveFn: (path) => this.getValueIteratively(storeInstance, path),
      nestedProxyFactory,
      rxjsAllowedOnRoot: this.rxjsAllowedOnRoot,
      strictInvalidPath: this.strictInvalidPath,
      strictRootRxjs: this.strictRootRxjs,
      strictDeleteUndefined: this.strictDeleteUndefined,
      originalNestedValue: undefined,
      setFn,
      deleteFn,
    });

    const proxyStore = new Proxy({}, {
      get: handler.createProxyGetter({}),
      set: handler.createProxySetter(),
      deleteProperty: handler.createProxyDeleter()
    });
    return proxyStore as StoreProxy<T>;
  }
}
