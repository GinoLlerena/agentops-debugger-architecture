import { useQuery } from '@tanstack/react-query';
import type { LedgerEvent, OefaQueryResult, Session } from '@agentops/shared';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => getJson<{ status: string; mode: 'live' | 'offline' }>('/health'),
    staleTime: 60_000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => getJson<{ sessions: Session[] }>('/sessions').then((r) => r.sessions),
  });
}

export function useTrace(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ['trace', sessionId],
    enabled,
    queryFn: () =>
      getJson<{ sessionId: string; events: LedgerEvent[] }>(
        `/trace/${encodeURIComponent(sessionId)}`,
      ).then((r) => r.events),
  });
}

export function useOefaSearch(params: Record<string, string>, enabled = true) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['oefa-search', qs],
    enabled,
    queryFn: () => getJson<OefaQueryResult>(`/oefa/search?${qs}`),
  });
}
