// src/app/store/interfaces/path-utils.interface.ts

/**
 * Interface for path utility logic.
 */
export interface IPathUtils {
  getByPath<T>(obj: T, path: string): T[keyof T];
  setByPath<T>(obj: T, path: string, value: T[keyof T]): void;
  normalizePath(path: string): string;
} 