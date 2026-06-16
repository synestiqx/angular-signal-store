import { PathUtils } from '../../utils/path-utils';
import { VersionBumpScheduler } from '../../utils/version-bump-scheduler';
import { VersionBumpPolicy } from './version-bump-policy';

export interface VersionBumpHooks {
  hasNodes: () => boolean;
  hasExistingNodes: () => boolean;
  keys: () => string[];
  updateIfExists: (path: string) => void;
  cleanup: (pathPrefix?: string) => void;
}

export interface VersionBumpCoordinatorCacheMetrics {
  ancestorPathCache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
  };
}

type ExplicitBumpTarget = 'grained' | 'leaf';
type PolicyBumpTarget = 'partial' | 'branch';
type BumpTargetResolver = (normalized: string) => string[];

export class VersionBumpCoordinator {
  // Insertion-order FIFO cache. Version target calculation is pure, so eviction only affects performance.
  private readonly ancestorPathCache = new Map<string, string[]>();
  private static readonly MAX_ANCESTOR_CACHE_SIZE = 1000;
  private ancestorCacheHits = 0;
  private ancestorCacheMisses = 0;
  private ancestorCacheEvictions = 0;
  private readonly explicitBumpTargets: Record<ExplicitBumpTarget, BumpTargetResolver> = {
    grained: (normalized) => [normalized],
    leaf: (normalized) => [...this.getAncestorPaths(normalized)].reverse(),
  };
  private readonly policyBumpTargets: Record<PolicyBumpTarget, BumpTargetResolver> = {
    partial: (normalized) => {
      this.hooks.updateIfExists(normalized);
      return [];
    },
    branch: (normalized) => this.getAncestorPaths(normalized),
  };

  constructor(
    private readonly policy: VersionBumpPolicy,
    private readonly scheduler: VersionBumpScheduler,
    private readonly hooks: VersionBumpHooks
  ) {}

  resolvePath(path: string): string {
    return this.resolveNormalizedPath(PathUtils.normalizePath(path));
  }

  resolveNormalizedPath(normalized: string): string {
    return PathUtils.resolveVersionPath(normalized, {
      dependencyMode: this.policy.getDependencyMode(),
      bumpNumericParent: this.policy.getBumpNumericParent()
    });
  }

  bumpPath(path: string): void {
    this.bumpWithTargets(path, this.getPolicyBumpTarget());
  }

  bumpPathNormalized(normalized: string): void {
    this.bumpWithNormalizedTargets(normalized, this.getPolicyBumpTarget());
  }

  bumpExact(path: string): void {
    this.bumpWithTargets(path, this.explicitBumpTargets.grained);
  }

  bumpExactNormalized(normalized: string): void {
    this.bumpWithNormalizedTargets(normalized, this.explicitBumpTargets.grained);
  }

  bumpLeafBranch(path: string): void {
    this.bumpWithTargets(path, this.explicitBumpTargets.leaf);
  }

  bumpLeafBranchNormalized(normalized: string): void {
    this.bumpWithNormalizedTargets(normalized, this.explicitBumpTargets.leaf);
  }

  bumpDescendants(pathPrefix: string): void {
    this.bumpDescendantsNormalized(PathUtils.normalizePath(pathPrefix));
  }

  bumpDescendantsNormalized(normalized: string): void {
    if (!this.hooks.hasExistingNodes()) return;
    const prefix = `${normalized}.`;
    const targets: string[] = [];
    for (const key of this.hooks.keys()) {
      if (key.startsWith(prefix)) targets.push(key);
    }
    this.applyTargets(targets);
  }

  bumpFromPatches(patches: Array<{ op: string; path: Array<string | number> }>): void {
    if (!Array.isArray(patches) || patches.length === 0) return;
    const toBump = new Set<string>();
    for (const patch of patches) {
      if (!patch || !Array.isArray(patch.path)) continue;
      const segments = patch.path.map(String).filter(Boolean);
      if (segments.length === 0) continue;
      const path = segments.join('.');
      for (const target of PathUtils.enumerateAncestors(path, {
        includeNumericParent: this.policy.getBumpNumericParent()
      })) {
        toBump.add(target);
      }
      if (patch.op === 'remove') this.hooks.cleanup(path);
    }
    for (const path of toBump) this.hooks.updateIfExists(path);
  }

  clear(): void {
    this.ancestorPathCache.clear();
  }

  resetCache(): void {
    this.clear();
    this.ancestorCacheHits = 0;
    this.ancestorCacheMisses = 0;
    this.ancestorCacheEvictions = 0;
  }

  /**
   * Diagnostic cache metrics for tests, perf lab, and dev tooling.
   * These counters are local to this coordinator and reset with resetCache().
   */
  getCacheMetrics(): VersionBumpCoordinatorCacheMetrics {
    const total = this.ancestorCacheHits + this.ancestorCacheMisses;
    return {
      ancestorPathCache: {
        size: this.ancestorPathCache.size,
        maxSize: VersionBumpCoordinator.MAX_ANCESTOR_CACHE_SIZE,
        hits: this.ancestorCacheHits,
        misses: this.ancestorCacheMisses,
        evictions: this.ancestorCacheEvictions,
        hitRate: total > 0 ? this.ancestorCacheHits / total : 0,
      },
    };
  }

  destroy(): void {
    this.scheduler.destroy();
    this.clear();
  }

  private getAncestorPaths(normalizedPath: string): string[] {
    const cached = this.ancestorPathCache.get(normalizedPath);
    if (cached) {
      this.ancestorCacheHits++;
      return cached;
    }
    this.ancestorCacheMisses++;
    if (this.ancestorPathCache.size >= VersionBumpCoordinator.MAX_ANCESTOR_CACHE_SIZE) {
      const firstKey = this.ancestorPathCache.keys().next().value;
      if (firstKey) {
        this.ancestorPathCache.delete(firstKey);
        this.ancestorCacheEvictions++;
      }
    }
    const ancestors = PathUtils.enumerateAncestors(normalizedPath, {
      includeNumericParent: this.policy.getBumpNumericParent()
    });
    this.ancestorPathCache.set(normalizedPath, ancestors);
    return ancestors;
  }

  private applyTargets(targets: string[]): void {
    if (targets.length === 0) return;
    if (this.policy.getAutoBatchBumps()) {
      this.scheduler.queue(targets);
      this.scheduler.schedule();
      return;
    }
    for (const target of targets) this.hooks.updateIfExists(target);
  }

  private bumpWithTargets(path: string, getTargets: (normalized: string) => string[]): void {
    this.bumpWithNormalizedTargets(PathUtils.normalizePath(path), getTargets);
  }

  private bumpWithNormalizedTargets(normalized: string, getTargets: (normalized: string) => string[]): void {
    if (!this.hooks.hasNodes()) return;
    this.applyTargets(getTargets(normalized));
  }

  private getPolicyBumpTarget(): BumpTargetResolver {
    return this.policy.getPartialInvalidation()
      ? this.policyBumpTargets.partial
      : this.policyBumpTargets.branch;
  }
}
