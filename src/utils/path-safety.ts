export const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isForbiddenPathSegment(segment: string | number | undefined | null): boolean {
  return segment !== undefined && segment !== null && FORBIDDEN_PATH_SEGMENTS.has(String(segment));
}

export function hasForbiddenPathSegment(segments: readonly unknown[]): boolean {
  return segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(String(segment)));
}
