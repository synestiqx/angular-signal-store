// src/app/store/types/type-guards.ts

/**
 * Strażnicy typów (type guards) dla walidacji w runtime i lepszego typowania.
 * Uwaga: walidacja formatu ścieżek odbywa się WYŁĄCZNIE przez PathUtils.isValidPath (SSOT).
 */

import { StoreData, StrictPath, PathValue } from './advanced-types';
import { IStoreInstance } from '../interfaces/store-instance.interface';
import { PathUtils } from '../utils/path-utils';

/**
 * Type guard to validate store instance
 */
export function isValidStoreInstance<T extends StoreData>(
  instance: unknown
): instance is IStoreInstance<T> {
  return (
    instance !== null &&
    instance !== undefined &&
    typeof instance === 'object' &&
    'store' in instance &&
    typeof (instance as Record<string, unknown>)['store'] === 'object' &&
    (instance as Record<string, unknown>)['store'] !== null &&
    'readStore' in instance &&
    typeof (instance as Record<string, unknown>)['readStore'] === 'function'
  );
}

/**
 * Type guard to validate if store instance matches specific type constraint
 */
export function isStoreInstanceOfType<T extends StoreData>(
  instance: IStoreInstance<any>
): instance is IStoreInstance<T> {
  try {
    const storeValue = instance.store;
    return storeValue !== null && 
           typeof storeValue === 'object' && 
           !Array.isArray(storeValue);
  } catch {
    return false;
  }
}

/**
 * Walidacja formatu ścieżki – deleguje do PathUtils.isValidPath (SSOT).
 */
export function isValidPath<T extends StoreData>(
  path: string
): path is StrictPath<T> {
  return PathUtils.isValidPath(path) as boolean;
}

/**
 * Type guard to check if path points to an array
 */
export function isArrayPath<T extends StoreData>(
  storeInstance: IStoreInstance<T>,
  path: string
): path is StrictPath<T> {
  // Najpierw walidacja formatu ścieżki (SSOT), istnienie może być false
  if (!isValidPath<T>(path)) {
    return false;
  }
  
  try {
    const value = storeInstance.readStore(path as StrictPath<T>);
    return Array.isArray(value);
  } catch {
    return false;
  }
}

/**
 * Type guard to check if value is a valid store data object
 */
export function isStoreData(value: unknown): value is StoreData {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

/**
 * Type guard to check if path exists in store
 */
export function pathExists<T extends StoreData>(
  storeInstance: IStoreInstance<T>,
  path: string
): path is StrictPath<T> {
  // Najpierw walidacja formatu ścieżki (SSOT)
  if (!isValidPath<T>(path)) {
    return false;
  }
  
  try {
    const value = storeInstance.readStore(path as StrictPath<T>);
    return value !== undefined;
  } catch {
    return false;
  }
}

/**
 * Type guard for array mutation methods
 */
export function isArrayMutationMethod(method: string): method is 'push' | 'pop' | 'shift' | 'unshift' | 'splice' | 'reverse' | 'sort' {
  return ['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort'].includes(method);
}

/**
 * Type guard for array query methods
 */
export function isArrayQueryMethod(method: string): method is 'find' | 'findIndex' | 'filter' | 'map' | 'reduce' | 'some' | 'every' | 'includes' | 'indexOf' {
  return ['find', 'findIndex', 'filter', 'map', 'reduce', 'some', 'every', 'includes', 'indexOf'].includes(method);
}

/**
 * Enhanced type guard that combines path validation and value existence
 */
export function isValidStorePath<T extends StoreData, P extends string>(
  storeInstance: IStoreInstance<T>,
  path: P
): path is P & StrictPath<T> {
  return isValidPath<T>(path) && pathExists(storeInstance, path);
}

/**
 * Type predicate for safe path value access
 */
export function hasPathValue<T extends StoreData, P extends StrictPath<T>>(
  storeInstance: IStoreInstance<T>,
  path: P
): storeInstance is IStoreInstance<T> & { readStore(path: P): NonNullable<PathValue<T, P>> } {
  try {
    const value = storeInstance.readStore(path);
    return value !== undefined && value !== null;
  } catch {
    return false;
  }
}
