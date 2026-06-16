import { PathUtils } from './path-utils';

/**
 * Generic flat map store with path-based operations.
 * Normalization cache avoids repeated regex operations.
 * Prefix operations use simple linear scan (sufficient for typical store sizes).
 */
export class FlatStoreMap<T> {
  private map: Record<string, T> = Object.create(null);
  private normalizeCache: Record<string, string> = Object.create(null);
  private cacheHits = 0;
  private cacheMisses = 0;
  private _cachedSize = 0;
  private _sizeValid = false;

  private normalize(path: string): string {
    let normalized = this.normalizeCache[path];
    if (normalized === undefined) {
      normalized = PathUtils.normalizePath(path);
      this.normalizeCache[path] = normalized;
      this.cacheMisses++;
    } else {
      this.cacheHits++;
    }
    return normalized;
  }

  get(path: string): T | undefined {
    return this.map[this.normalize(path)];
  }

  set(path: string, value: T): void {
    const normalized = this.normalize(path);
    const existed = this.map[normalized] !== undefined;
    this.map[normalized] = value;
    if (!existed) this.invalidateSize();
  }

  has(path: string): boolean {
    return this.map[this.normalize(path)] !== undefined;
  }

  exists(path: string, checkFn?: (value: T) => boolean): boolean {
    const normalized = this.normalize(path);
    const value = this.map[normalized];
    return value !== undefined && (!checkFn || checkFn(value));
  }

  delete(path: string): boolean {
    const normalized = this.normalize(path);
    const existed = this.map[normalized] !== undefined;
    if (existed) {
      delete this.map[normalized];
      this.invalidateSize();
    }
    delete this.normalizeCache[path];
    return existed;
  }

  deleteByPrefix(prefix: string, onDelete?: (key: string, value: T) => void): number {
    const normalized = this.normalize(prefix);
    const prefixMatch = normalized ? normalized + '.' : '';
    const keys = Object.keys(this.map);
    let deletedCount = 0;

    for (const key of keys) {
      if (key === normalized || key.startsWith(prefixMatch)) {
        if (onDelete) {
          try { onDelete(key, this.map[key]); } catch (e) {
            console.warn('FlatStoreMap onDelete error:', e);
          }
        }
        delete this.map[key];
        deletedCount++;
      }
    }

    // Cleanup normalize cache
    const cacheKeys = Object.keys(this.normalizeCache);
    for (const cacheKey of cacheKeys) {
      const cachedNormalized = this.normalizeCache[cacheKey];
      if (cachedNormalized === normalized || cachedNormalized.startsWith(prefixMatch)) {
        delete this.normalizeCache[cacheKey];
      }
    }

    if (deletedCount > 0) this.invalidateSize();
    return deletedCount;
  }

  getByPrefix(prefix: string): string[] {
    const normalized = this.normalize(prefix);
    const prefixMatch = normalized ? normalized + '.' : '';
    const result: string[] = [];
    for (const key of Object.keys(this.map)) {
      if (key === normalized || key.startsWith(prefixMatch)) {
        result.push(key);
      }
    }
    return result;
  }

  keys(): string[] {
    return Object.keys(this.map);
  }

  values(): T[] {
    return Object.values(this.map);
  }

  toObject(): Record<string, T> {
    return { ...this.map };
  }

  clear(): void {
    this.map = Object.create(null);
    this.normalizeCache = Object.create(null);
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this._sizeValid = false;
    this._cachedSize = 0;
  }

  get size(): number {
    if (!this._sizeValid) {
      this._cachedSize = Object.keys(this.map).length;
      this._sizeValid = true;
    }
    return this._cachedSize;
  }

  private invalidateSize(): void {
    this._sizeValid = false;
  }

  forEach(callback: (value: T, key: string) => void): void {
    Object.keys(this.map).forEach(key => {
      callback(this.map[key], key);
    });
  }

  getOrCreate(path: string, factory: (normalizedPath: string) => T): T {
    const normalized = this.normalize(path);
    let value = this.map[normalized];

    if (value === undefined) {
      value = factory(normalized);
      this.map[normalized] = value;
      this.invalidateSize();
    }

    return value;
  }

  addIfMissing(path: string, factory: (normalizedPath: string) => T | undefined): void {
    const normalized = this.normalize(path);

    if (this.map[normalized] === undefined) {
      const value = factory(normalized);
      if (value !== undefined) {
        this.map[normalized] = value;
        this.invalidateSize();
      }
    }
  }

  getCacheStats(): { hits: number; misses: number; hitRate: number; cacheSize: number; prefixIndexSize: number; indexActive: boolean } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      cacheSize: Object.keys(this.normalizeCache).length,
      prefixIndexSize: 0,
      indexActive: false,
    };
  }

  hasPrefix(prefix: string): boolean {
    const normalized = this.normalize(prefix);
    const prefixMatch = normalized ? normalized + '.' : '';
    for (const key of Object.keys(this.map)) {
      if (key === normalized || key.startsWith(prefixMatch)) return true;
    }
    return false;
  }

  countByPrefix(prefix: string): number {
    const normalized = this.normalize(prefix);
    const prefixMatch = normalized ? normalized + '.' : '';
    let count = 0;
    for (const key of Object.keys(this.map)) {
      if (key === normalized || key.startsWith(prefixMatch)) count++;
    }
    return count;
  }
}
