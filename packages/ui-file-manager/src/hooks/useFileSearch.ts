import { useState, useEffect, useMemo } from 'react';
import type { FileItem, FilterConfig } from '../types';

const defaultNormalizeSearch = (query: string): string => {
  return query
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
};

export function useFileSearch(items: FileItem[], config?: FilterConfig) {
  const [query, setQuery] = useState('');

  const normalizeSearch = config?.normalizeSearch || defaultNormalizeSearch;

  const shouldMatch = config?.shouldMatch || ((item: FileItem, q: string) => {
    return item.name.toLowerCase().includes(q.toLowerCase());
  });

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return items;
    }

    const normalizedQuery = normalizeSearch(query);
    return items.filter((item) => shouldMatch(item, normalizedQuery));
  }, [items, query, normalizeSearch, shouldMatch]);

  return {
    query,
    setQuery,
    filtered,
  };
}
