import { useCallback, useEffect, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

function cmpValues(a: unknown, b: unknown, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1;
  const na = a == null || a === '' ? null : a;
  const nb = b == null || b === '' ? null : b;
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  if (typeof na === 'number' && typeof nb === 'number') {
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return (na - nb) * mul;
  }
  const sa = String(na).toLowerCase();
  const sb = String(nb).toLowerCase();
  if (sa < sb) return -1 * mul;
  if (sa > sb) return 1 * mul;
  return 0;
}

/**
 * Ordenação clicável para tabelas.
 * Clique 1 = asc · clique 2 = desc · clique 3 = limpa (volta à ordem original).
 */
export function useTableSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => unknown,
  defaultKey: string | null = null,
  defaultDir: SortDir = 'asc',
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  useEffect(() => {
    setSortKey(defaultKey);
    setSortDir(defaultDir);
  }, [defaultKey, defaultDir]);

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey !== key) {
        setSortKey(key);
        setSortDir('asc');
        return;
      }
      if (sortDir === 'asc') {
        setSortDir('desc');
        return;
      }
      setSortKey(null);
      setSortDir('asc');
    },
    [sortKey, sortDir],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const key = sortKey;
    const dir = sortDir;
    return [...rows].sort((a, b) => cmpValues(getValue(a, key), getValue(b, key), dir));
  }, [rows, sortKey, sortDir, getValue]);

  return { sorted, sortKey, sortDir, toggleSort };
}

/** Atalho: lê campos do próprio objeto (inclui chaves derivadas `_…`). */
export function useTableSortFields<T extends Record<string, unknown>>(
  rows: T[],
  defaultKey: string | null = null,
  defaultDir: SortDir = 'asc',
) {
  const getValue = useCallback((row: T, key: string) => row[key], []);
  return useTableSort(rows, getValue, defaultKey, defaultDir);
}
