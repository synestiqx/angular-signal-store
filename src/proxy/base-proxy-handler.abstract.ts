import { IStoreInstance } from '../interfaces/store-instance.interface';
import { RxJSBindingUtils } from '../utils/rxjs-binding.utils';
import { ArrayMethodHandler } from '../utils/array-method-handler.utils';
import { ArrayMutationMethod, ArrayQueryMethod, StoreData } from '../types/advanced-types';
import { isArrayPath, isValidPath } from '../types/type-guards';
import { PathUtils } from '../utils/path-utils';
import { CreateStoreService } from '../core/create-store.core';

// Narrow internal shape we rely on (present on implementation)
type InternalDeps = { createService: CreateStoreService };
type ProxyRxJSMethod = 'pipe' | 'subscribe';
type ArrayProxyMethod = ArrayMutationMethod | ArrayQueryMethod | 'length';
type ArrayProxyMethodContext = {
  targetPath: string;
  candidate: unknown[];
  nestedCache?: Record<string, unknown>;
};
type ArrayMutationMethodCacheEntry = {
  handler: Function;
  arrayRef: unknown[];
};
type ArrayMutationMethodCache = Record<string, ArrayMutationMethodCacheEntry | undefined>;

export abstract class BaseProxyHandler<T extends StoreData = StoreData> {
  protected static readonly UNHANDLED = Symbol('proxy-handler-unhandled');
  protected readonly storeInstance: IStoreInstance<T>;
  protected readonly rxjsBindingUtils: RxJSBindingUtils;
  
  constructor(storeInstance: IStoreInstance<T>) {
    this.storeInstance = storeInstance;
    const deps = storeInstance as unknown as InternalDeps;
    this.rxjsBindingUtils = new RxJSBindingUtils(deps.createService);
  }

  // Wspólna logika sprawdzania symboli
  protected isSymbolKey(key: PropertyKey): key is symbol {
    return typeof key === 'symbol';
  }

  // Wspólna logika konwersji klucza
  protected keyToString(key: PropertyKey): string {
    return String(key);
  }

  protected resolveRxJSPath(_keyStr: string, path: string): string | null {
    return path;
  }

  // Wspólna logika RxJS methods
  protected handleRxJSMethods(keyStr: string, path: string): Function | null {
    if (keyStr !== 'pipe' && keyStr !== 'subscribe') {
      return null;
    }

    const resolvedPath = this.resolveRxJSPath(keyStr, path);
    if (!resolvedPath) {
      return null;
    }

    return keyStr === 'pipe'
      ? this.rxjsBindingUtils.getRxJSMethod(resolvedPath, 'pipe')
      : this.rxjsBindingUtils.getRxJSMethod(resolvedPath, 'subscribe');
  }

  protected getArrayMethodPath(path: string): string {
    return path;
  }

  protected getArrayMethodCandidate(value: unknown): unknown {
    return value;
  }

  protected getPropertyCache(): Record<string, unknown> | undefined {
    return undefined;
  }

  protected getArrayMutationCleanup(nestedCache?: Record<string, unknown>): (() => void) | undefined {
    if (!nestedCache) return undefined;
    return () => {
      for (const key in nestedCache) delete nestedCache[key];
    };
  }

  protected getArrayQueryCache(nestedCache?: Record<string, unknown>): Record<string, unknown> | undefined {
    return nestedCache;
  }

  protected getArrayMutationMethodCache(_nestedCache?: Record<string, unknown>): ArrayMutationMethodCache | undefined {
    return undefined;
  }

  // Wspólna logika array methods
  protected handleArrayMethods(keyStr: string, path: string, value: unknown, nestedCache?: Record<string, unknown>): Function | number | null {
    const kind = BaseProxyHandler.classifyArrayProxyMethod(keyStr);
    if (kind === null) return null;

    const targetPath = this.getArrayMethodPath(path);
    let candidate = this.getArrayMethodCandidate(value);

    if (!Array.isArray(candidate)) {
      candidate = this.resolveValue(targetPath);
    }

    if (!Array.isArray(candidate)) {
      return null;
    }

    const context = { targetPath, candidate, nestedCache };
    if (kind === 'mutation') return this.getOrCreateArrayMutationMethod(keyStr as ArrayMutationMethod, context);
    if (kind === 'query') return this.createArrayQueryMethod(keyStr as ArrayQueryMethod, context);
    return this.resolveArrayLength(context);
  }

  // Single source of truth for proxy-exposed array members; the kind drives dispatch
  // in handleArrayMethods, so the casts there are guaranteed by this classifier.
  private static classifyArrayProxyMethod(keyStr: string): 'mutation' | 'query' | 'length' | null {
    switch (keyStr) {
      case 'push':
      case 'pop':
      case 'shift':
      case 'unshift':
      case 'splice':
      case 'reverse':
      case 'sort':
        return 'mutation';
      case 'find':
      case 'findIndex':
      case 'filter':
      case 'map':
      case 'reduce':
      case 'some':
      case 'every':
      case 'includes':
      case 'indexOf':
        return 'query';
      case 'length':
        return 'length';
      default:
        return null;
    }
  }

  private getOrCreateArrayMutationMethod(method: ArrayMutationMethod, context: ArrayProxyMethodContext): Function | null {
    const cache = this.getArrayMutationMethodCache(context.nestedCache);
    const cached = cache?.[method];
    if (cached) {
      cached.arrayRef = context.candidate;
      return cached.handler;
    }

    const entry = this.createArrayMutationMethod(method, context);
    if (cache && entry) cache[method] = entry;
    return entry?.handler ?? null;
  }

  private createArrayMutationMethod(method: ArrayMutationMethod, context: ArrayProxyMethodContext): ArrayMutationMethodCacheEntry | null {
    const targetPath = context.targetPath;
    const cleanup = this.getArrayMutationCleanup(context.nestedCache);
    const storeInstance = this.storeInstance;
    const entry: ArrayMutationMethodCacheEntry = {
      arrayRef: context.candidate,
      handler: function (this: unknown, ...args: unknown[]) {
        const calledAsMethod = this !== undefined && this !== globalThis;

        return ArrayMethodHandler.executeMutatingMethod<T>(
          method,
          targetPath,
          storeInstance,
          args,
          cleanup,
          calledAsMethod ? entry.arrayRef : undefined
        );
      }
    };
    return entry;
  }

  private createArrayQueryMethod(method: ArrayQueryMethod, context: ArrayProxyMethodContext): Function | null {
    if (!isArrayPath(this.storeInstance, context.targetPath)) return null;
    return ArrayMethodHandler.createQueryMethod<T>(
      method,
      context.targetPath,
      this.storeInstance,
      this.getArrayQueryCache(context.nestedCache) as any
    );
  }

  private resolveArrayLength(context: ArrayProxyMethodContext): number | null {
    const actualValue = Array.isArray(context.candidate)
      ? context.candidate
      : this.storeInstance.readStore(context.targetPath);
    return Array.isArray(actualValue) ? actualValue.length : null;
  }

  // Wspólna logika walidacji ścieżek: zawsze deleguj do PathUtils.isValidPath (SSOT)
  protected isValidPath(path: string): boolean {
    return PathUtils.isValidPath(path);
  }

  protected getCachedProperty(_keyStr: string, _currentPath: string): unknown | typeof BaseProxyHandler.UNHANDLED {
    return BaseProxyHandler.UNHANDLED;
  }

  protected cacheResolvedProperty(
    _keyStr: string,
    _currentPath: string,
    _currentValue: unknown,
    resolvedValue: unknown
  ): unknown {
    return resolvedValue;
  }

  protected afterSetProperty(_keyStr: string, _targetPath: string, _value: unknown): void {}

  protected afterDeleteProperty(_keyStr: string, _targetPath: string): void {}

  private resolveHelperProperty(keyStr: string, currentPath: string): unknown | typeof BaseProxyHandler.UNHANDLED {
    if (keyStr !== '$val' && keyStr !== '$signal') {
      return BaseProxyHandler.UNHANDLED;
    }

    const basePath = this.resolveHelperBasePath(keyStr, currentPath);
    if (!basePath || !isValidPath<T>(basePath)) {
      return undefined;
    }

    return keyStr === '$val'
      ? this.storeInstance.readStore(basePath)
      : this.storeInstance.getComputed(basePath);
  }

  private resolveHelperBasePath(keyStr: string, currentPath: string): string {
    const suffix = `.${keyStr}`;
    return currentPath.endsWith(suffix) ? currentPath.slice(0, -suffix.length) : '';
  }

  // Wspólny proxy getter pattern
  public createProxyGetter(target: object): ProxyHandler<object>['get'] {
    return (_, key: PropertyKey) => {
      if (this.isSymbolKey(key)) {
        return (key === Symbol.toPrimitive || key === Symbol.toStringTag)
          ? (target as Record<symbol, unknown>)[key]
          : undefined;
      }

      const keyStr = this.keyToString(key);
      let value = this.getCachedProperty(keyStr, '');
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      const currentPath = this.constructPath(keyStr);
      value = this.getCachedProperty(keyStr, currentPath);
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      value = this.resolveHelperProperty(keyStr, currentPath);
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      value = this.handleStoreInstanceMethods(keyStr) ?? BaseProxyHandler.UNHANDLED;
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      value = this.handleRxJSMethods(keyStr, currentPath) ?? BaseProxyHandler.UNHANDLED;
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      value = this.handleArrayMethods(keyStr, currentPath, undefined, this.getPropertyCache()) ?? BaseProxyHandler.UNHANDLED;
      if (value !== BaseProxyHandler.UNHANDLED) {
        return value;
      }

      const currentValue = this.resolveValue(currentPath);
      if (currentValue === undefined) {
        return undefined;
      }

      const resolvedValue = this.createNestedProxy(currentPath, currentValue, keyStr);
      return this.cacheResolvedProperty(keyStr, currentPath, currentValue, resolvedValue);
    };
  }

  // Wspólny proxy setter pattern  
  public createProxySetter(): ProxyHandler<object>['set'] {
    return (_, key: PropertyKey, value: unknown) => {
      if (this.isSymbolKey(key)) {
        return false;
      }
      
      const keyStr = this.keyToString(key);
      const targetPath = this.constructPath(keyStr);
      
      this.setValue(targetPath, value);
      this.performCleanup();
      this.afterSetProperty(keyStr, targetPath, value);
      
      return true;
    };
  }

  // Wspólny proxy deleter pattern
  public createProxyDeleter(): ProxyHandler<object>['deleteProperty'] {
    return (_, key: PropertyKey) => {
      if (this.isSymbolKey(key)) {
        return false;
      }
      
      const keyStr = this.keyToString(key);
      const targetPath = this.constructPath(keyStr);
      
      this.deleteValue(targetPath);
      this.performCleanup();
      this.afterDeleteProperty(keyStr, targetPath);
      
      return true;
    };
  }

  // Abstrakcyjne metody do implementacji przez dzieci
  protected abstract constructPath(key: string): string;
  protected abstract resolveValue(path: string): unknown;
  protected abstract createNestedProxy(path: string, value: unknown, key: string): unknown;
  protected abstract handleStoreInstanceMethods(keyStr: string): Function | null;
  protected abstract setValue(path: string, value: unknown): void;
  protected abstract deleteValue(path: string): void;
  protected abstract performCleanup(): void;
}
