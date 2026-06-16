// src/app/store/interfaces/proxy-factory-config.interface.ts

import { ILogger } from './logger.interface';
import { IDevService } from './devtools.interface';
import { SignalStore } from '../core/signal-store.service';
import { CreateStoreService } from '../core/create-store.core';

/**
 * Configuration options for ProxyFactory.
 */
export interface ProxyFactoryConfig {
  /** Maximum number of entries in the proxy cache. */
  maxCacheSize?: number;
  /** Logger instance for warnings and errors. */
  logger?: ILogger;
  /** Optional devtools service. */
  devService?: IDevService;
  /** Optional callback for cache metrics reporting. */
  metricsCallback?: (storeName: string, metrics: { hits: number; misses: number; hitRate: number; cacheSize: number }) => void;
  /** Optional store name for metrics. */
  storeName?: string;
  /** SignalStore service for proxy cache management. */
  signalStore?: SignalStore;
  /** CreateStoreService for proxy cache operations. */
  createStoreService?: CreateStoreService;
  /** Use in-place iteration instead of path splitting for better performance. */
  useInPlaceIteration?: boolean;
  /** Strict: throw on invalid paths instead of warn. */
  strictInvalidPath?: boolean;
  /** Strict: forbid root-level rxjs methods. */
  strictRootRxjs?: boolean;
  /** Strict: disallow delete (set undefined). */
  strictDeleteUndefined?: boolean;
  /** Whether rxjs methods are allowed on root proxy (non-strict default true). */
  rxjsAllowedOnRoot?: boolean;
} 
