let devEnabled = false;

export function setLoggerActive(active: boolean): void {
  devEnabled = active;
}

function log(method: 'debug' | 'info' | 'warn', args: unknown[]): void {
  if (!devEnabled) return;
  (console[method] as (...a: unknown[]) => void)(...args);
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', args),
  info: (...args: unknown[]) => log('info', args),
  warn: (...args: unknown[]) => log('warn', args)
};
