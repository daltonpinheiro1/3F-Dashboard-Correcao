import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PageMeta = { title: string; subtitle?: string };

type PageMetaCtxValue = {
  meta: PageMeta;
  setMeta: (m: PageMeta) => void;
};

const PageMetaCtx = createContext<PageMetaCtxValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [meta, setMetaState] = useState<PageMeta>({ title: 'Painel' });
  /** Só atualiza se título/subtítulo mudaram — evita re-render em loop com HeaderSync. */
  const setMeta = useCallback((next: PageMeta) => {
    setMetaState((prev) => {
      if (prev.title === next.title && (prev.subtitle || '') === (next.subtitle || '')) {
        return prev;
      }
      return { title: next.title, subtitle: next.subtitle };
    });
  }, []);
  const value = useMemo(() => ({ meta, setMeta }), [meta, setMeta]);
  return <PageMetaCtx.Provider value={value}>{children}</PageMetaCtx.Provider>;
}

export function usePageMeta() {
  return useContext(PageMetaCtx)?.meta ?? { title: 'Painel' };
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
  const setMeta = useContext(PageMetaCtx)?.setMeta;
  useLayoutEffect(() => {
    setMeta?.({ title, subtitle });
  }, [setMeta, title, subtitle]);
  return <>{children}</>;
}
