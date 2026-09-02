export const LOG_PREFIX = '[privy-near-connect]';

export type Logger = {
  debug: (...args: unknown[]) => void;
};

export function createLogger(prefix: string, enabled: boolean | undefined = false): Logger {
  return {
    debug: (...args: unknown[]) => {
      if (enabled) console.debug(prefix, ...args);
    },
  };
}
