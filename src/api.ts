const rawApiBase = import.meta.env.VITE_INDEXER_API?.trim();

export const API_BASE = rawApiBase
  ? rawApiBase.replace(/\/+$/, '')
  : '/api';

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};
