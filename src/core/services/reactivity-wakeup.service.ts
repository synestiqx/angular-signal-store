import { PathUtils } from '../../utils/path-utils';

export interface WakeUpPathOptions {
  ensureBehavior?: boolean;
  syncDescendants?: boolean;
}

export interface WakeUpHooks {
  behaviorUpdatesEnabled: () => boolean;
  updateBehavior: (path: string, value: unknown) => void;
  ensureBehavior: (path: string) => void;
  bumpVersion: (path: string) => void;
  bumpVersionNormalized: (normalized: string) => void;
  updateDescendantBehaviors: (pathPrefix: string) => void;
  bumpDescendantVersions: (pathPrefix: string) => void;
  bumpDescendantVersionsNormalized: (normalizedPrefix: string) => void;
  clearProxyCache: (pathPrefix: string) => void;
  updateBehaviorByPrefix: (pathPrefix: string, options?: { skipSelf?: boolean }) => void;
}

export class ReactivityWakeupService {
  constructor(private readonly hooks: WakeUpHooks) {}

  wakeUpPath(
    path: string,
    value: unknown,
    options: WakeUpPathOptions = {},
    behaviorUpdater?: (path: string, value: unknown) => void
  ): boolean {
    return this.wakeUpPathNormalized(PathUtils.normalizePath(path), value, options, behaviorUpdater);
  }

  wakeUpPathNormalized(
    normalized: string,
    value: unknown,
    options: WakeUpPathOptions = {},
    behaviorUpdater?: (path: string, value: unknown) => void
  ): boolean {
    const behaviorsEnabled = this.hooks.behaviorUpdatesEnabled();
    this.hooks.bumpVersionNormalized(normalized);
    if (behaviorsEnabled) {
      (behaviorUpdater ?? this.hooks.updateBehavior)(normalized, value);
      if (options.ensureBehavior) this.hooks.ensureBehavior(normalized);
    }
    if (options.syncDescendants) this.wakeUpBranchNormalized(normalized);
    return behaviorsEnabled;
  }

  performMutationWithWakeUp(
    path: string,
    value: unknown,
    mutateFn: () => void,
    options: WakeUpPathOptions = {},
    behaviorUpdater?: (path: string, value: unknown) => void
  ): boolean {
    mutateFn();
    return this.wakeUpPath(path, value, options, behaviorUpdater);
  }

  wakeUpArrayPath(
    path: string,
    value: unknown,
    afterVersion?: () => void,
    behaviorUpdater?: (path: string, value: unknown) => void
  ): void {
    const normalized = PathUtils.normalizePath(path);
    this.hooks.bumpVersion(normalized);
    afterVersion?.();
    (behaviorUpdater ?? this.hooks.updateBehavior)(normalized, value);
    this.hooks.updateBehaviorByPrefix(normalized, { skipSelf: true });
  }

  wakeUpVersionOnly(path: string): void {
    this.hooks.bumpVersion(PathUtils.normalizePath(path));
  }

  wakeUpBranch(pathPrefix: string): void {
    this.wakeUpBranchNormalized(PathUtils.normalizePath(pathPrefix));
  }

  wakeUpBranchNormalized(normalized: string): void {
    this.hooks.updateDescendantBehaviors(normalized);
    this.hooks.bumpDescendantVersionsNormalized(normalized);
    this.hooks.clearProxyCache(normalized);
  }
}
