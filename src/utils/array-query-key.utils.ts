// Shared helpers to build stable cache keys and hashed segments for array queries

export function serializeForKey(v: unknown): string {
  if (typeof v === 'function') return v.toString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit
  }
  return Math.abs(hash).toString(36);
}

export function buildMethodHashSegment(method: string, predicate: unknown, args: unknown[]): string {
  const keySeed = serializeForKey(predicate) + (args.length ? serializeForKey(args) : '');
  return `${method}_${hashString(keySeed)}`;
}

export function buildArrayQueryCacheKey(path: string, method: string, predicate: unknown, args: unknown[]): string {
  // Stable, human-readable key for per-proxy cache
  const safe = serializeForKey(predicate);
  const rest = args.length ? serializeForKey(args) : '';
  return `${path}|${method}|${safe}|${rest}`;
}
