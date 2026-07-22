/**
 * Schedules version signal bumps with optional batching, RAF scheduling and throttling.
 * Extracted from CreateStoreService so the lifecycle is explicit and testable.
 */
export class VersionBumpScheduler {
  private depth = 0;
  private pending = new Set<string>();
  private scheduled = false;
  private strategy: 'microtask' | 'raf' = 'microtask';
  private throttle = 0;
  private lastFlush = 0;
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly flush: (items: Set<string>) => void) {}

  begin(): void {
    this.depth++;
  }

  end(): void {
    if (this.depth === 0) return;
    this.depth--;
    if (this.depth === 0) this.schedule();
  }

  flushNow(): void {
    if (this.depth > 0) return;
    this.scheduled = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.pending.size === 0) return;
    const items = new Set(this.pending);
    this.pending.clear();
    this.flush(items);
    this.lastFlush = Date.now();
  }

  queue(paths: string[]): void {
    for (const path of paths) this.pending.add(path);
  }

  setStrategy(strategy: 'microtask' | 'raf'): void {
    this.strategy = strategy;
  }

  setThrottle(ms: number): void {
    this.throttle = Math.max(0, ms);
  }

  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (this.strategy === 'raf' && typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => this.execute());
    } else {
      Promise.resolve().then(() => this.execute());
    }
  }

  destroy(): void {
    this.pending.clear();
    this.depth = 0;
    this.scheduled = false;
    this.lastFlush = 0;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = null;
  }

  private execute(): void {
    this.scheduled = false;
    this.rafId = null;
    if (this.pending.size === 0) return;
    if (this.throttle > 0) {
      const now = Date.now();
      if (now - this.lastFlush < this.throttle) {
        this.timeoutId = setTimeout(() => {
          this.timeoutId = null;
          this.execute();
        }, this.throttle - (now - this.lastFlush));
        return;
      }
      this.lastFlush = now;
    }
    const items = new Set(this.pending);
    this.pending.clear();
    this.flush(items);
  }
}
