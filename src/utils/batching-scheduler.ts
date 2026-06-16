/**
 * Unified batching scheduler for version bumps and other deferred operations.
 * Reduces code duplication across managers.
 */
export class BatchingScheduler {
  private batchingDepth = 0;
  private pendingItems = new Set<string>();
  private flushScheduled = false;
  private strategy: 'microtask' | 'raf' = 'microtask';
  private throttleMs = 0;
  private lastFlushTimestamp = 0;
  private rafId: number | null = null;

  constructor(
    private readonly flushCallback: (items: Set<string>) => void,
    strategy: 'microtask' | 'raf' = 'microtask',
    throttleMs = 0
  ) {
    this.strategy = strategy;
    this.throttleMs = throttleMs;
  }

  setStrategy(strategy: 'microtask' | 'raf'): void { this.strategy = strategy; }
  setThrottle(ms: number): void { this.throttleMs = Math.max(0, ms); }

  beginBatch(): void { this.batchingDepth++; }

  endBatch(): void {
    if (this.batchingDepth === 0) return;
    this.batchingDepth--;
    if (this.batchingDepth === 0) this.scheduleFlush();
  }

  queue(items: string[] | string): void {
    if (Array.isArray(items)) {
      items.forEach(item => this.pendingItems.add(item));
    } else {
      this.pendingItems.add(items);
    }
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;

    if (this.strategy === 'raf' && typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => this.executeFlush());
    } else {
      Promise.resolve().then(() => this.executeFlush());
    }
  }

  private executeFlush(): void {
    this.flushScheduled = false;
    this.rafId = null;

    if (this.pendingItems.size === 0) return;

    // Throttling check
    if (this.throttleMs > 0) {
      const now = Date.now();
      if (now - this.lastFlushTimestamp < this.throttleMs) {
        setTimeout(() => this.executeFlush(), this.throttleMs - (now - this.lastFlushTimestamp));
        return;
      }
      this.lastFlushTimestamp = now;
    }

    const items = new Set(this.pendingItems);
    this.pendingItems.clear();
    this.flushCallback(items);
  }

  forceFlush(): void {
    if (this.pendingItems.size > 0) {
      this.executeFlush();
    }
  }

  clear(): void {
    this.pendingItems.clear();
    this.flushScheduled = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
