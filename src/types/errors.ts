// src/app/store/types/errors.ts

/**
 * Comprehensive error types and classes for type-safe error handling
 */

// Base error interface
export interface IStoreError {
  readonly type: StoreErrorType;
  readonly message: string;
  readonly path?: string;
  readonly originalError?: Error;
  readonly timestamp: number;
}

// Error type enumeration
export type StoreErrorType = 
  | 'PATH_ERROR'
  | 'TYPE_ERROR' 
  | 'VALIDATION_ERROR'
  | 'OPERATION_ERROR'
  | 'ARRAY_ERROR'
  | 'PROXY_ERROR'
  | 'COMPUTE_ERROR';

// Base store error class
export abstract class BaseStoreError extends Error implements IStoreError {
  public readonly timestamp: number = Date.now();
  
  constructor(
    public readonly type: StoreErrorType,
    message: string,
    public readonly path?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintain proper stack trace for V8
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

// Specific error classes
export class PathAccessError extends BaseStoreError {
  constructor(path: string, operation: string, originalError?: Error) {
    super(
      'PATH_ERROR', 
      `Failed to access path "${path}" during ${operation}`,
      path,
      originalError
    );
  }
}

export class PathValidationError extends BaseStoreError {
  constructor(path: string, reason: string) {
    super(
      'VALIDATION_ERROR',
      `Invalid path "${path}": ${reason}`,
      path
    );
  }
}

export class TypeValidationError extends BaseStoreError {
  constructor(path: string, expectedType: string, actualType: string) {
    super(
      'TYPE_ERROR',
      `Type mismatch at path "${path}": expected ${expectedType}, got ${actualType}`,
      path
    );
  }
}

export class ArrayOperationError extends BaseStoreError {
  constructor(
    path: string, 
    operation: string, 
    reason: string,
    originalError?: Error
  ) {
    super(
      'ARRAY_ERROR',
      `Array operation "${operation}" failed at path "${path}": ${reason}`,
      path,
      originalError
    );
  }
}

export class ProxyOperationError extends BaseStoreError {
  constructor(path: string, operation: string, originalError?: Error) {
    super(
      'PROXY_ERROR',
      `Proxy operation "${operation}" failed at path "${path}"`,
      path,
      originalError
    );
  }
}

export class ComputeOperationError extends BaseStoreError {
  constructor(path: string, reason: string, originalError?: Error) {
    super(
      'COMPUTE_ERROR',
      `Compute operation failed at path "${path}": ${reason}`,
      path,
      originalError
    );
  }
}

// Error factory for consistent error creation
export class StoreErrorFactory {
  static pathAccess(path: string, operation: string, originalError?: Error): PathAccessError {
    return new PathAccessError(path, operation, originalError);
  }

  static pathValidation(path: string, reason: string): PathValidationError {
    return new PathValidationError(path, reason);
  }

  static typeValidation(path: string, expectedType: string, actualType: string): TypeValidationError {
    return new TypeValidationError(path, expectedType, actualType);
  }

  static arrayOperation(
    path: string, 
    operation: string, 
    reason: string, 
    originalError?: Error
  ): ArrayOperationError {
    return new ArrayOperationError(path, operation, reason, originalError);
  }

  static proxyOperation(path: string, operation: string, originalError?: Error): ProxyOperationError {
    return new ProxyOperationError(path, operation, originalError);
  }

  static computeOperation(path: string, reason: string, originalError?: Error): ComputeOperationError {
    return new ComputeOperationError(path, reason, originalError);
  }
}

// Type guard for store errors
export function isStoreError(error: unknown): error is BaseStoreError {
  return error instanceof BaseStoreError;
}

// Error result wrapper for operations that can fail
export type OperationResult<T, E = BaseStoreError> = 
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: E };

// Helper to create success result
export function createSuccessResult<T>(data: T): OperationResult<T> {
  return { success: true, data, error: null };
}

// Helper to create error result
export function createErrorResult<E extends BaseStoreError>(error: E): OperationResult<never, E> {
  return { success: false, data: null, error };
}

// Safe operation wrapper
export function safeOperation<T>(
  operation: () => T,
  errorFactory: (error: Error) => BaseStoreError
): OperationResult<T> {
  try {
    const result = operation();
    return createSuccessResult(result);
  } catch (error) {
    const storeError = errorFactory(error instanceof Error ? error : new Error(String(error)));
    return createErrorResult(storeError);
  }
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Enhanced error interface with severity
export interface IEnhancedStoreError extends IStoreError {
  readonly severity: ErrorSeverity;
  readonly context?: Record<string, unknown>;
}

// Enhanced error base class
export abstract class EnhancedStoreError extends BaseStoreError implements IEnhancedStoreError {
  constructor(
    type: StoreErrorType,
    message: string,
    public readonly severity: ErrorSeverity,
    path?: string,
    originalError?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(type, message, path, originalError);
  }
}