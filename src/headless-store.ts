import { PathUtils } from './utils/path-utils';

class HeadlessCreateStore<T extends Record<string, unknown>> {
  private state: T;
  private proxyCache = new Map<string, unknown>();

  constructor(initial: T) {
    this.state = initial ?? ({} as T);
  }

  getProxy(): T {
    return this.getOrCreateProxy('') as T;
  }

  setValue(path: string, value: unknown): void {
    PathUtils.setByPath(this.state, path, value);
  }

  private getOrCreateProxy(basePath: string): unknown {
    const cacheKey = basePath || '__root__';
    if (this.proxyCache.has(cacheKey)) return this.proxyCache.get(cacheKey);

    const handler: ProxyHandler<Record<string, unknown>> = {
      get: (_target, prop: string) => {
        if (prop === '__isProxy') return true;
        const fullPath = basePath ? `${basePath}.${prop}` : prop;
        const value = PathUtils.getByPath(this.state as unknown as Record<string, unknown>, fullPath);

        if (Array.isArray(value)) {
          return this.makeCallableGetter(fullPath);
        }
        if (value != null && typeof value === 'object') {
          return this.getOrCreateProxy(fullPath);
        }
        return this.makeCallableGetter(fullPath);
      },
      set: (_target, prop: string, newValue: unknown) => {
        const fullPath = basePath ? `${basePath}.${prop}` : prop;
        PathUtils.setByPath(this.state as unknown as Record<string, unknown>, fullPath, newValue);
        return true;
      },
      deleteProperty: (_target, prop: string) => {
        const fullPath = basePath ? `${basePath}.${prop}` : prop;
        PathUtils.setByPath(this.state as unknown as Record<string, unknown>, fullPath, undefined);
        return true;
      }
    };

    const proxy = new Proxy({}, handler);
    this.proxyCache.set(cacheKey, proxy);
    return proxy;
  }

  private makeCallableGetter(path: string): () => unknown {
    return () => PathUtils.getByPath(this.state as unknown as Record<string, unknown>, path);
  }
}

export class HeadlessSignalStore {
  private stores: Record<string, HeadlessCreateStore<Record<string, unknown>>> = {};

  createStore<T extends Record<string, unknown>>(val: T, name: string): T {
    this.stores[name] = new HeadlessCreateStore<T>(val);
    return this.stores[name].getProxy() as T;
  }

  setValue(storeName: string, path: string, val: unknown): void {
    const store = this.stores[storeName];
    if (!store) throw new Error(`Store '${storeName}' not found`);
    store.setValue(path, val);
  }
}
