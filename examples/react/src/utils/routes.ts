/** Hash-based routes used in this app. Add new routes here. */
export const ROUTES = {
  sign: '#sign',
} as const;

/**
 * Builds a full URL to an in-app hash route, prepending Vite's base path so
 * links work whether the app is served from / (dev) or a subpath (e.g. GitHub Pages).
 */
export function appUrl(hash: string): string {
  console.log('BASE URL', import.meta.env.BASE_URL);
  return `${window.location.origin}${import.meta.env.BASE_URL}${hash}`;
}
