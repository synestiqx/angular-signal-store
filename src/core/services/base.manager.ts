import type { CreateStoreService } from '../create-store.core';
import type { SignalStore } from '../signal-store.service';
import type { AngularStoreDevtools } from '../devtools-contract';
import { PathUtils } from '../../utils/path-utils';
import { PathValidator } from '../../utils/path-validator';
import type { StoreDevToolsAction } from '../../devtools/types';
import type { StoreData } from '../../types/advanced-types';
import { DevToolsEmitter } from '../../utils/abstracts/dev-tools-emitter';

/**
 * Base class for all store managers (BehaviorManager, ComputedManager, VersionManager).
 * Provides common functionality and eliminates code duplication.
 */
export abstract class BaseManager<TStore extends StoreData = StoreData> {
  // Cache store reference for performance (avoids repeated lookups)
  private _storeRef: Record<string, unknown> | null = null;
  protected readonly devToolsEmitter: DevToolsEmitter;

  constructor(
    protected readonly core: CreateStoreService<TStore>,
    protected readonly storeName: string
  ) {
    this.devToolsEmitter = new DevToolsEmitter(
      () => this.signalStore.devActive,
      (event) => {
        const ds = this.devService;
        if (ds) ds.emitAction(event);
      },
      (event) => {
        const ds = this.devService;
        if (ds) ds.emitRead(event);
      }
    );
  }

  /**
   * Get SignalStore instance (convenience accessor).
   */
  protected get signalStore(): SignalStore {
    return this.core.signalStore;
  }

  /**
   * Get cached reference to the store data (avoids repeated getStore() calls).
   * CRITICAL PERFORMANCE: Called frequently in computed() callbacks.
   */
  protected get storeRef(): Record<string, unknown> {
    if (!this._storeRef) {
      this._storeRef = this.signalStore.getStore(this.storeName).returnStore();
    }
    return this._storeRef;
  }

  /**
   * Get DevService instance (lazy loaded, only when devActive).
   */
  protected get devService(): AngularStoreDevtools | undefined {
    return this.signalStore.devActive ? this.signalStore.getDevtoolsAdapter() : undefined;
  }

  /**
   * Check if DevTools is active.
   */
  protected get devActive(): boolean {
    return this.signalStore.devActive;
  }

  /**
   * Normalize path using PathUtils.
   */
  protected normalizePath(path: string): string {
    return PathUtils.normalizePath(path);
  }

  /**
   * Validate and normalize path in one operation.
   * @throws {PathValidationError} if path is invalid
   */
  protected validateAndNormalizePath(path: string): string {
    return PathValidator.validateAndNormalize(path);
  }

  /**
   * Check if path is valid without throwing.
   */
  protected isValidPath(path: string): boolean {
    return PathValidator.isValid(path);
  }

  /**
   * Check if path has a value in the store.
   */
  protected pathHasValue(path: string): boolean {
    const normalized = this.normalizePath(path);
    return this.signalStore.readStore(this.storeName, normalized) !== undefined;
  }

  /**
   * Read value from store at given path.
   */
  protected readStore(path: string): unknown {
    const normalized = this.normalizePath(path);
    return this.signalStore.readStore(this.storeName, normalized);
  }

  /**
   * Safe operation wrapper - catches and logs errors without throwing.
   */
  protected safeExecute<T>(operation: () => T, defaultValue: T): T {
    try {
      return operation();
    } catch (error) {
      if (this.devActive) {
        console.warn(`[${this.constructor.name}] Operation failed:`, error);
      }
      return defaultValue;
    }
  }

  /**
   * Emit DevTools action through unified emitter.
   */
  protected emitDevTools(action: StoreDevToolsAction): void {
    this.devToolsEmitter.emit(this.storeName, action);
  }

  /**
   * Abstract method to be implemented by subclasses for cleanup.
   */
  abstract cleanup(pathPrefix?: string): void;

  /**
   * Abstract method to get all keys managed by this manager.
   */
  abstract keys(): string[];
}
