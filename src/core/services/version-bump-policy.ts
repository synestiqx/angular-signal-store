import type { VersionDependencyMode } from '../../utils/path-utils';

export class VersionBumpPolicy {
  private autoBatchBumps = false;
  private bumpNumericParentForIndices = true;
  private versionPartialInvalidation = false;
  private dependencyMode: VersionDependencyMode = 'exact';

  setAutoBatchBumps(enabled: boolean): void {
    this.autoBatchBumps = !!enabled;
  }

  getAutoBatchBumps(): boolean {
    return this.autoBatchBumps;
  }

  setBumpNumericParent(enabled: boolean): void {
    this.bumpNumericParentForIndices = !!enabled;
  }

  getBumpNumericParent(): boolean {
    return this.bumpNumericParentForIndices;
  }

  setPartialInvalidation(enabled: boolean): void {
    this.versionPartialInvalidation = !!enabled;
  }

  getPartialInvalidation(): boolean {
    return this.versionPartialInvalidation;
  }

  setDependencyMode(mode: VersionDependencyMode): void {
    this.dependencyMode = mode;
  }

  getDependencyMode(): VersionDependencyMode {
    return this.dependencyMode;
  }
}
