import { PathUtils } from './path-utils';
import { StoreErrorFactory } from '../types/errors';
import { StoreData } from '../types/advanced-types';

/**
 * Centralized path validation and normalization utilities.
 * Provides consistent error handling for path operations.
 */
export class PathValidator {
  /**
   * Validates and normalizes a path in one operation.
   * @throws {PathValidationError} if path is invalid
   */
  static validateAndNormalize(path: string): string {
    if (!PathUtils.isValidPath(path)) {
      throw StoreErrorFactory.pathValidation(path, 'Invalid path format');
    }
    return PathUtils.normalizePath(path);
  }

  /**
   * Validates path and ensures it exists in the store.
   * @throws {PathValidationError} if path is invalid
   * @throws {PathAccessError} if path doesn't exist
   */
  static ensureExists<T extends StoreData>(
    store: { readStore: (path: string) => unknown },
    path: string
  ): string {
    const normalized = this.validateAndNormalize(path);
    if (store.readStore(normalized) === undefined) {
      throw StoreErrorFactory.pathAccess(
        path,
        'read',
        new Error('Path does not exist in store')
      );
    }
    return normalized;
  }

  /**
   * Safe validation - returns result object instead of throwing.
   */
  static safeValidateAndNormalize(
    path: string
  ): { valid: true; path: string } | { valid: false; error: string } {
    try {
      const normalized = this.validateAndNormalize(path);
      return { valid: true, path: normalized };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check if path is valid without throwing.
   */
  static isValid(path: string): boolean {
    return PathUtils.isValidPath(path);
  }

  /**
   * Normalize path without validation (use carefully).
   */
  static normalizeUnsafe(path: string): string {
    try {
      return PathUtils.normalizePath(path);
    } catch {
      return path;
    }
  }
}