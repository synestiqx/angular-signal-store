// src/app/store/interfaces/proxy-handler.interface.ts

/**
 * Interface for proxy handler logic (base for all proxy handlers).
 */
export interface IProxyHandler<T = unknown> {
  constructPath(key: string): string;
  resolveValue(path: string): unknown;
  createNestedProxy(path: string, value: unknown): unknown;
  setValue(path: string, value: unknown): void;
  deleteValue(path: string): void;
  performCleanup(): void;
}