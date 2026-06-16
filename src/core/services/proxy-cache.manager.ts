import { Signal } from '@angular/core';
import { ManageFinalizationRegistry } from '../../utils/manage-finalization-registry';
import { PathUtils } from '../../utils/path-utils';
import { ProxyCallable } from '../../interfaces/types';
import { SignalStore } from '../signal-store.service';
import { StoreDevToolsAction } from '../../devtools/types';
import { CacheMetricsTracker } from '../../utils/abstracts/cache-metrics';

export type CacheMetrics = { hits: number; misses: number; hitRate: number };

type CacheOrderEntry = { key: string; token: number };
type CacheOrderPredicate = (key: string) => boolean;

class PathRingOrder {
  private entries: CacheOrderEntry[] = [];
  private head = 0;
  private nextToken = 0;
  private liveTokens: Record<string, number> = Object.create(null);
  private liveCount = 0;

  add(key: string): void {
    if (this.liveTokens[key] === undefined) {
      this.liveCount++;
    }
    const token = ++this.nextToken;
    this.liveTokens[key] = token;
    this.entries.push({ key, token });
    this.compactIfSparse();
  }

  delete(key: string): void {
    if (this.liveTokens[key] === undefined) return;
    delete this.liveTokens[key];
    this.liveCount--;
  }

  deleteByPrefix(prefix: string): void {
    const pref = prefix ? `${prefix}.` : '';
    this.deleteWhere((key) => key === prefix || (!!pref && key.startsWith(pref)));
  }

  deleteWhere(predicate: CacheOrderPredicate): void {
    for (const key of Object.keys(this.liveTokens)) {
      if (predicate(key)) this.delete(key);
    }
    this.compactIfSparse();
  }

  evictOver(maxSize: number, onEvict: (key: string) => void, keep?: CacheOrderPredicate): void {
    while (this.liveCount > maxSize) {
      const oldest = this.shiftOldest(keep);
      if (!oldest) break;
      onEvict(oldest);
    }
    this.compactIfSparse();
  }

  keys(keep?: CacheOrderPredicate): string[] {
    this.compact(keep);
    const keys: string[] = [];
    for (let index = this.head; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (this.liveTokens[entry.key] === entry.token) keys.push(entry.key);
    }
    return keys;
  }

  some(predicate: CacheOrderPredicate): boolean {
    for (let index = this.head; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (this.liveTokens[entry.key] === entry.token && predicate(entry.key)) return true;
    }
    return false;
  }

  clear(): void {
    this.entries = [];
    this.head = 0;
    this.liveTokens = Object.create(null);
    this.liveCount = 0;
  }

  private shiftOldest(keep?: CacheOrderPredicate): string | undefined {
    while (this.head < this.entries.length) {
      const entry = this.entries[this.head++];
      if (this.liveTokens[entry.key] !== entry.token) continue;
      if (keep && !keep(entry.key)) {
        this.delete(entry.key);
        continue;
      }
      this.delete(entry.key);
      return entry.key;
    }
    return undefined;
  }

  private compact(keep?: CacheOrderPredicate): void {
    const next: CacheOrderEntry[] = [];
    for (let index = this.head; index < this.entries.length; index++) {
      const entry = this.entries[index];
      if (this.liveTokens[entry.key] !== entry.token) continue;
      if (keep && !keep(entry.key)) {
        this.delete(entry.key);
        continue;
      }
      next.push(entry);
    }
    this.entries = next;
    this.head = 0;
  }

  private compactIfSparse(): void {
    if (this.head < 256 && this.entries.length <= Math.max(512, this.liveCount * 4)) return;
    this.compact();
  }
}

export class ProxyCacheManager {
  private cache: Record<string, WeakRef<ProxyCallable>> = Object.create(null);
  private signalCache: Record<string, WeakRef<Signal<unknown>>> = Object.create(null);
  private readonly cacheOrder = new PathRingOrder();
  private readonly metrics = new CacheMetricsTracker();
  private readonly finalizer: ManageFinalizationRegistry<ProxyCallable, string>;

  constructor(
    private readonly storeName: string,
    private readonly signalStore: SignalStore
  ) {
    this.finalizer = new ManageFinalizationRegistry<ProxyCallable, string>((path) => {
      this.delete(path);
    });
  }

  get(path: string): ProxyCallable | undefined {
    const proxy = this.peek(path);
    if (proxy) {
      this.metrics.hit();
    }
    return proxy;
  }

  peek(path: string): ProxyCallable | undefined {
    const normalized = PathUtils.normalizePath(path);
    const ref = this.cache[normalized];
    if (!ref) return undefined;
    const proxy = ref.deref();
    if (!proxy) {
      this.delete(normalized);
      return undefined;
    }
    return proxy;
  }

  getOrCreate<T>(
    path: string,
    factory: (path: string, value: T) => ProxyCallable,
    valueReader: (path: string) => T | undefined
  ): ProxyCallable | undefined {
    const normalized = PathUtils.normalizePath(path);
    const cached = this.peek(normalized);
    if (cached) {
      this.metrics.hit();
      return cached;
    }

    const value = valueReader(normalized);
    if (value === undefined) {
      return undefined;
    }

    const proxy = factory(normalized, value);
    this.storeEntry(normalized, proxy);
    this.metrics.miss();
    this.evictIfNeeded();
    return proxy;
  }

  add(path: string, proxy: ProxyCallable): void {
    const normalized = PathUtils.normalizePath(path);
    this.storeEntry(normalized, proxy);
    this.evictIfNeeded();
  }

  delete(path: string): void {
    const normalized = PathUtils.normalizePath(path);
    this.deleteByPrefix(this.cache, normalized);
    this.deleteByPrefix(this.signalCache, normalized);
    this.cacheOrder.deleteByPrefix(normalized);
  }

  cleanup(pathPrefix?: string): void {
    if (!pathPrefix) {
      this.reset();
      return;
    }
    this.delete(pathPrefix);
  }

  reset(): void {
    this.cache = Object.create(null);
    this.signalCache = Object.create(null);
    this.cacheOrder.clear();
    this.metrics.reset();
  }

  metricsSnapshot(): CacheMetrics & { cacheSize: number; cacheKeys: string[] } {
    const cacheKeys = this.keys();
    return {
      ...this.metrics.snapshot(),
      cacheSize: cacheKeys.length,
      cacheKeys
    };
  }

  emitMetrics(metrics: { hits: number; misses: number; hitRate: number; cacheSize: number }): void {
    if (!this.signalStore.devActive) return;
    const cacheDump = this.dump();
    const proxyAction: StoreDevToolsAction = {
      type: 'PROXY_METRICS',
      payload: {
        path: 'proxy-cache',
        ...metrics,
        cacheDump,
        cacheKeys: cacheDump.map(({ key }) => key),
        graph: undefined
      }
    };
    this.signalStore.emitDevAction(this.storeName, proxyAction);
  }

  getSignal(path: string): Signal<unknown> | undefined {
    const normalized = PathUtils.normalizePath(path);
    const ref = this.signalCache[normalized];
    if (!ref) return undefined;
    const signal = ref.deref();
    if (!signal) {
      delete this.signalCache[normalized];
      return undefined;
    }
    return signal;
  }

  setSignal(path: string, signalRef: Signal<unknown>): void {
    if (!signalRef) return;
    const normalized = PathUtils.normalizePath(path);
    this.signalCache[normalized] = new WeakRef(signalRef);
  }

  keys(): string[] {
    return this.cacheOrder.keys((key) => this.isLiveProxyKey(key));
  }

  entries(): Record<string, WeakRef<ProxyCallable>> {
    return { ...this.cache };
  }

  isCached(path: string): boolean {
    return this.existsInMap(this.cache, path, (v) => !!v.deref?.());
  }

  hasIndexedChildAtOrAfter(path: string, startIndex: number): boolean {
    const normalized = PathUtils.normalizePath(path);
    const prefix = normalized ? `${normalized}.` : '';
    if (!prefix) return false;
    if (this.cacheOrder.some((key) => this.isIndexedChildAtOrAfter(key, prefix, startIndex))) return true;
    for (const key of Object.keys(this.signalCache)) {
      if (this.isIndexedChildAtOrAfter(key, prefix, startIndex)) return true;
    }
    return false;
  }

  deleteIndexedRange(path: string, startIndex: number, endIndex: number): void {
    if (startIndex < 0 || endIndex <= startIndex) return;
    const normalized = PathUtils.normalizePath(path);
    const prefix = normalized ? `${normalized}.` : '';
    if (!prefix) return;
    const shouldDelete = (key: string) => this.isIndexedChildInRange(key, prefix, startIndex, endIndex);
    this.deleteWhere(this.cache, shouldDelete);
    this.deleteWhere(this.signalCache, shouldDelete);
    this.cacheOrder.deleteWhere(shouldDelete);
  }

  markHit(): void {
    this.metrics.hit();
  }

  markMiss(): void {
    this.metrics.miss();
  }

  dump(): Array<{ key: string; value: string }> {
    return this.keys().map((key) => ({ key, value: '[ProxyCallable]' }));
  }

  private getMaxCacheSize(): number {
    const configured = this.signalStore.getProxyCacheLimit(this.storeName);
    if (typeof configured === 'number' && Number.isFinite(configured)) {
      return Math.max(0, Math.floor(configured));
    }
    return 1000;
  }

  private storeEntry(path: string, proxy: ProxyCallable): void {
    const normalized = PathUtils.normalizePath(path);
    this.cache[normalized] = this.finalizer.create(proxy, normalized);
    this.cacheOrder.add(normalized);
  }

  private evictIfNeeded(): void {
    const maxSize = this.getMaxCacheSize();
    if (maxSize < 0) return;

    this.cacheOrder.evictOver(
      maxSize,
      (oldest) => {
        delete this.cache[oldest];
        delete this.signalCache[oldest];
      },
      (key) => this.isLiveProxyKey(key)
    );
  }

  private compactOrder(): void {
    this.cacheOrder.keys((key) => this.isLiveProxyKey(key));
  }

  private existsInMap<T>(map: Record<string, T>, path: string, predicate?: (value: T) => boolean): boolean {
    const normalized = PathUtils.normalizePath(path);
    const value = map[normalized];
    return value !== undefined && (!predicate || predicate(value));
  }

  private isIndexedChildAtOrAfter(key: string, prefix: string, startIndex: number): boolean {
    if (!key.startsWith(prefix)) return false;
    const dotIndex = key.indexOf('.', prefix.length);
    const segment = dotIndex === -1 ? key.slice(prefix.length) : key.slice(prefix.length, dotIndex);
    if (!segment) return false;
    const index = Number(segment);
    return Number.isInteger(index) && index >= startIndex;
  }

  private isIndexedChildInRange(key: string, prefix: string, startIndex: number, endIndex: number): boolean {
    if (!key.startsWith(prefix)) return false;
    const dotIndex = key.indexOf('.', prefix.length);
    const segment = dotIndex === -1 ? key.slice(prefix.length) : key.slice(prefix.length, dotIndex);
    if (!segment) return false;
    const index = Number(segment);
    return Number.isInteger(index) && index >= startIndex && index < endIndex;
  }

  private isLiveProxyKey(key: string): boolean {
    const ref = this.cache[key];
    if (ref?.deref()) return true;
    delete this.cache[key];
    delete this.signalCache[key];
    return false;
  }

  private deleteByPrefix<K extends string, V>(map: Record<K, V>, prefix: string, onDelete?: (key: K, value: V) => void): void {
    const normalized = PathUtils.normalizePath(prefix);
    const pref = normalized ? normalized + '.' : '';
    for (const key of Object.keys(map) as K[]) {
      if (key === normalized || key.startsWith(pref)) {
        if (onDelete) {
          try {
            onDelete(key, map[key]);
          } catch {
            // ignore cleanup errors
          }
        }
        delete map[key];
      }
    }
  }

  private deleteWhere<K extends string, V>(map: Record<K, V>, predicate: (key: K) => boolean, onDelete?: (key: K, value: V) => void): void {
    for (const key of Object.keys(map) as K[]) {
      if (!predicate(key)) continue;
      if (onDelete) {
        try {
          onDelete(key, map[key]);
        } catch {
          // ignore cleanup errors
        }
      }
      delete map[key];
    }
  }
}
