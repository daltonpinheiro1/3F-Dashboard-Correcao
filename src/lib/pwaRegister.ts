/** Registro PWA — shell offline para supervisores. */
export function registerPwa(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* opcional */
    });
  });
}

const CHUNK_RELOAD_KEY = '3f-chunk-reload-at';
const CHUNK_RELOAD_WINDOW_MS = 30_000;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  return CHUNK_ERROR_RE.test(message);
}

/** Recarrega uma vez quando um chunk do deploy anterior some; evita loop em falha persistente. */
export function reloadOnceForStaleChunk(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  reload: () => void,
  now = Date.now(),
): boolean {
  try {
    const last = Number(storage?.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Number.isFinite(last) && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage?.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    /* storage bloqueado: segue com reload único desta chamada */
  }
  reload();
  return true;
}

function sessionStorageSafe(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function installStaleChunkRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForStaleChunk(sessionStorageSafe(), () => window.location.reload())) {
      event.preventDefault();
    }
  });
}

export function reloadForStaleChunk(): boolean {
  return reloadOnceForStaleChunk(sessionStorageSafe(), () => window.location.reload());
}
