/**
 * Optional JSNQ integration for @adsq/angular-signal-store.
 *
 * Import this entry point once in an application that uses `mutate`, `$query`,
 * `$queryOne`, `$liveQuery`, or `$liveQueryOne`:
 *
 * ```ts
 * import '@adsq/angular-signal-store/jsnq';
 * ```
 *
 * Importing it registers the engine synchronously as a side effect — there is no dynamic
 * import and no promise to await, so a mutation issued immediately after bootstrap works.
 * Applications that only read and write store paths never load this file, and therefore do
 * not pay for the query engine.
 */
import JsnqPipeline from '@adsq/jsnq/core/pipeline';
import {
  applyDeepSugarPatch,
  collectPipelineIntent,
  isDeepSugarAction,
  tryFastPipelineMutation,
  tryFastStructuralMutation,
} from '@adsq/jsnq/core/pipeline-fastpath';
import { registerJsnqBridge } from './core/jsnq-contract';
import type { JsnqBridge } from './core/jsnq-contract';

const angularJsnqBridge: JsnqBridge = {
  createPipeline: (data, options) => new JsnqPipeline(data as never, options),
  tryFastPipelineMutation: (value, operators, options) =>
    tryFastPipelineMutation(value as never, operators as never, options as never) as never,
  tryFastStructuralMutation: (value, intent) =>
    tryFastStructuralMutation(value as never, intent as never) as never,
  collectPipelineIntent: (operators) => collectPipelineIntent(operators as never) as never,
  isDeepSugarAction: (action) => isDeepSugarAction(action as never),
  applyDeepSugarPatch: (value, criteria, actions) =>
    applyDeepSugarPatch(value as never, criteria as never, actions as never) as never,
};

registerJsnqBridge(angularJsnqBridge);

export { angularJsnqBridge };
