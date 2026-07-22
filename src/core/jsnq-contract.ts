/**
 * Registration contract for the optional JSNQ integration.
 *
 * The core proxy must not import the JSNQ pipeline: doing so pulls the whole query and
 * mutation engine into the main entry point even for applications that only read and write
 * paths. Instead the core holds this contract, and the `@adsq/angular-signal-store/jsnq`
 * entry point registers an implementation as a side effect of being imported.
 *
 * Registration is synchronous. There is deliberately no dynamic `import()` here: a store
 * mutation must not depend on a promise resolving first.
 */
/**
 * The seam between the core and the engine is intentionally untyped: the core must not
 * import concrete JSNQ pipeline types at runtime, so operators and pipelines cross this
 * boundary as `unknown` and are re-cast by the caller that owns the real types.
 */
export interface JsnqBridge {
  createPipeline(data: unknown, options: { trackOperations: boolean }): unknown;
  tryFastPipelineMutation(
    value: unknown,
    operators: readonly unknown[],
    options: { collectAffectedPaths: boolean },
  ): FastMutationResult | null | undefined;
  tryFastStructuralMutation(value: unknown, intent: PipelineIntent): FastMutationResult | null | undefined;
  collectPipelineIntent(operators: readonly unknown[]): PipelineIntent;
  isDeepSugarAction(action: unknown): boolean;
  applyDeepSugarPatch(value: unknown, criteria: unknown[], actions: unknown[]): FastMutationResult | null | undefined;
}

export interface FastMutationResult {
  value: unknown;
  mutations: number;
  affectedPaths?: string[];
}

export interface PipelineIntent {
  criteria: unknown[];
  actions: unknown[];
}

let bridge: JsnqBridge | undefined;

/** Called by the `@adsq/angular-signal-store/jsnq` entry point. */
export function registerJsnqBridge(implementation: JsnqBridge): void {
  bridge = implementation;
}

/** True once the optional entry point has been imported. */
export function hasJsnqBridge(): boolean {
  return bridge !== undefined;
}

/** Returns the bridge or throws an actionable error naming the missing import. */
export function requireJsnqBridge(api: string): JsnqBridge {
  if (!bridge) {
    throw new Error(
      `${api}() needs the JSNQ integration. Import '@adsq/angular-signal-store/jsnq' once ` +
        `in your application bootstrap to enable mutate/$query/$liveQuery. It is a separate ` +
        `entry point so applications that only read and write store paths do not pay for the ` +
        `query engine.`,
    );
  }
  return bridge;
}
