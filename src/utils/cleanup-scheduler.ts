import { PathUtils } from './path-utils';

/**
 * Manages deferred cleanup operations with automatic cancellation.
 * Eliminates code duplication for timer-based cleanup logic.
 */
export class CleanupScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Schedule a cleanup operation for a given key (path).
   * Automatically cancels any existing timer for the same key.
   */
  schedule(key: string, cleanupFn: () => void, delayMs: number): void {
    const normalized = PathUtils.normalizePath(key);
    this.cancel(normalized);

    const timer = setTimeout(() => {
      this.timers.delete(normalized);
      try {
        cleanupFn();
      } catch (error) {
        // Silently ignore cleanup errors to prevent crashes
        console.warn(`Cleanup failed for key "${normalized}":`, error);
      }
    }, delayMs);

    this.timers.set(normalized, timer);
  }

  /**
   * Cancel a scheduled cleanup operation.
   */
  cancel(key: string): void {
    const normalized = PathUtils.normalizePath(key);
    const timer = this.timers.get(normalized);

    if (timer) {
      clearTimeout(timer);
      this.timers.delete(normalized);
    }
  }

  /**
   * Cancel all scheduled cleanup operations.
   */
  cancelAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Check if a cleanup is scheduled for a given key.
   */
  isScheduled(key: string): boolean {
    const normalized = PathUtils.normalizePath(key);
    return this.timers.has(normalized);
  }

  /**
   * Get count of scheduled cleanups.
   */
  get size(): number {
    return this.timers.size;
  }

  /**
   * Get all scheduled keys.
   */
  keys(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Clear all timers without executing cleanup functions.
   */
  destroy(): void {
    this.cancelAll();
  }
}