/** Classifica erros de Pages Functions — evita banner "offline" em 401/503. */
export type ApiReachability = 'api' | 'offline';

export function throwDashboardApiError(
  status: number,
  data: { error?: string },
  fallback: string,
  onReachability?: (mode: ApiReachability) => void,
): never {
  const msg = data.error || fallback;

  if (status === 401) {
    onReachability?.('api');
    const hint = /sess[aã]o|logout|expirad/i.test(msg) ? msg : `${msg} Faça logout/login.`;
    throw new Error(hint);
  }

  if (status === 403 || status === 503 || status === 429 || status === 400 || status === 409) {
    onReachability?.('api');
    throw new Error(msg);
  }

  if (status === 502 || status === 504) {
    onReachability?.('offline');
    throw new Error(msg);
  }

  onReachability?.('api');
  throw new Error(msg);
}
