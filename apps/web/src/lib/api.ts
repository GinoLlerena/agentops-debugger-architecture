import { useQuery } from '@tanstack/react-query';
import {
  SessionSnapshot,
  type LedgerEvent,
  type OefaQueryResult,
  type Report,
  type Session,
} from '@agentops/shared';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch the rehydration snapshot for a session. Returns null when the session
 * doesn't exist yet (404 — a brand-new id) or the payload fails validation, so
 * the Workspace simply starts blank instead of erroring.
 */
export async function fetchSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
  const res = await fetch(`/sessions/${encodeURIComponent(sessionId)}/snapshot`);
  if (!res.ok) return null;
  const parsed = SessionSnapshot.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
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

export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report', reportId],
    enabled: Boolean(reportId),
    queryFn: () => getJson<Report>(`/reports/${encodeURIComponent(reportId!)}`),
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
