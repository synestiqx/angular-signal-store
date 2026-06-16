import type {
  ArrayQueryMethod,
  MapFn,
  PredicateFn,
  ReduceFn
} from '../types/advanced-types';

export type ArrayQueryMethodWithLength = ArrayQueryMethod | 'length';
export type ArrayQueryInput<E> = PredicateFn<E> | MapFn<E, unknown> | ReduceFn<E, unknown> | E | undefined;

export interface ArrayQueryExecutorOptions {
  cloneFoundObject?: boolean;
}

interface ArrayQueryContext<E> {
  arrayRef: E[];
  input: ArrayQueryInput<E>;
  args: unknown[];
  options: ArrayQueryExecutorOptions;
}

type ArrayQueryHandler = <E>(context: ArrayQueryContext<E>) => unknown;

function asPredicate<E>(input: ArrayQueryInput<E>): PredicateFn<E> {
  return typeof input === 'function'
    ? (input as PredicateFn<E>)
    : (item: E) => item === (input as E);
}

class ArrayQueryExecutor {
  private static readonly handlers: Record<ArrayQueryMethodWithLength, ArrayQueryHandler> = {
    find: (context) => ArrayQueryExecutor.find(context),
    findIndex: (context) => ArrayQueryExecutor.findIndex(context),
    filter: (context) => ArrayQueryExecutor.filter(context),
    map: (context) => ArrayQueryExecutor.map(context),
    reduce: (context) => ArrayQueryExecutor.reduce(context),
    some: (context) => ArrayQueryExecutor.some(context),
    every: (context) => ArrayQueryExecutor.every(context),
    includes: (context) => ArrayQueryExecutor.includes(context),
    indexOf: (context) => ArrayQueryExecutor.indexOf(context),
    length: (context) => ArrayQueryExecutor.lengthQuery(context)
  };

  static execute<E>(
    arrayRef: E[],
    method: ArrayQueryMethodWithLength,
    input: ArrayQueryInput<E>,
    args: unknown[],
    options: ArrayQueryExecutorOptions
  ): unknown {
    return ArrayQueryExecutor.handlers[method]({ arrayRef, input, args, options });
  }

  private static find<E>({ arrayRef, input, options }: ArrayQueryContext<E>): unknown {
    const result = arrayRef.find(asPredicate(input));
    if (options.cloneFoundObject && result && typeof result === 'object') {
      return { ...(result as Record<string, unknown>) };
    }
    return result;
  }

  private static findIndex<E>({ arrayRef, input }: ArrayQueryContext<E>): number {
    return arrayRef.findIndex(asPredicate(input));
  }

  private static filter<E>({ arrayRef, input }: ArrayQueryContext<E>): E[] {
    return arrayRef.filter(input as PredicateFn<E>);
  }

  private static map<E>({ arrayRef, input }: ArrayQueryContext<E>): unknown[] {
    return arrayRef.map(input as MapFn<E, unknown>);
  }

  private static reduce<E>({ arrayRef, input, args }: ArrayQueryContext<E>): unknown {
    return args.length > 0
      ? arrayRef.reduce(input as ReduceFn<E, E>, args[0] as E)
      : arrayRef.reduce(input as ReduceFn<E, E>);
  }

  private static some<E>({ arrayRef, input }: ArrayQueryContext<E>): boolean {
    return arrayRef.some(input as PredicateFn<E>);
  }

  private static every<E>({ arrayRef, input }: ArrayQueryContext<E>): boolean {
    return arrayRef.every(input as PredicateFn<E>);
  }

  private static includes<E>({ arrayRef, input }: ArrayQueryContext<E>): boolean {
    return arrayRef.includes(input as E);
  }

  private static indexOf<E>({ arrayRef, input }: ArrayQueryContext<E>): number {
    return arrayRef.indexOf(input as E);
  }

  private static lengthQuery<E>({ arrayRef }: ArrayQueryContext<E>): number {
    return arrayRef.length;
  }
}

export function executeArrayQuery<E>(
  arrayRef: E[],
  method: ArrayQueryMethodWithLength,
  input: ArrayQueryInput<E>,
  args: unknown[] = [],
  options: ArrayQueryExecutorOptions = {}
): unknown {
  return ArrayQueryExecutor.execute(arrayRef, method, input, args, options);
}
