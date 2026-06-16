// src/app/store/interfaces/logger.interface.ts

/**
 * Logger interface for custom logging implementations.
 */
export interface ILogger {
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
} 