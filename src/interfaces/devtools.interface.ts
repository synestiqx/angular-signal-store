// src/app/store/interfaces/devtools.interface.ts

/**
 * Minimal interface for DevTools service (stub, extend as needed).
 */
export interface IDevService {
  emitDevAction(storeName: string, action: unknown): void;
  // Add more methods as needed
} 