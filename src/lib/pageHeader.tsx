import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type PageMeta = { title: string; subtitle?: string };

/** Pure helper — testável e usado pelo provider para short-circuit (anti React #185). */
export function mergePageMeta(prev: PageMeta, next: PageMeta): PageMeta {
  if (prev.title === next.title && (prev.subtitle || '') === (next.subtitle || '')) {
    return prev;
  }
  return { title: next.title, subtitle: next.subtitle };
}

const MetaCtx = createContext<PageMeta>({ title: 'Painel' });
const SetMetaCtx = createContext<((m: PageMeta) => void) | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [meta, setMetaState] = useState<PageMeta>({ title: 'Painel' });
  const setMeta = useCallback((next: PageMeta) => {
    setMetaState((prev) => mergePageMeta(prev, next));
  }, []);
  return (
    <SetMetaCtx.Provider value={setMeta}>
      <MetaCtx.Provider value={meta}>{children}</MetaCtx.Provider>
    </SetMetaCtx.Provider>
  );
}

export function usePageMeta() {
  return useContext(MetaCtx);
}

/** Sincroniza título do header sem remontar a sidebar (shell persistente). */
export function HeaderSync({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const setMeta = useContext(SetMetaCtx);
  const syncedRef = useRef<{ title: string; subtitle: string }>({ title: '', subtitle: '' });

  useLayoutEffect(() => {
    if (!setMeta) return;
    const sub = subtitle || '';
    if (syncedRef.current.title === title && syncedRef.current.subtitle === sub) return;
    syncedRef.current = { title, subtitle: sub };
    setMeta({ title, subtitle });
  }, [setMeta, title, subtitle]);

  return <>{children}</>;
}
