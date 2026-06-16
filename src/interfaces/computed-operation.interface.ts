// src/app/store/interfaces/computed-operation.interface.ts

/**
 * Interface for computed operation logic.
 */
export interface IComputedOperation<T = unknown> {
  addToComputeStore(computedStore: Record<string, unknown>, store: unknown, getByPath: (obj: T, path: string) => unknown, path: string): void;
  deleteFromComputeStore(computedStore: Record<string, unknown>, path: string): void;
  // Add more methods as needed
} 