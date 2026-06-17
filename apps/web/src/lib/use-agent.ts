import { useCallback, useEffect, useRef, useState } from 'react';
import type { Resumption } from '@agentops/shared';
import { fetchSessionSnapshot } from './api.js';
import {
  hydrateChatState,
  initialChatState,
  reduceEvent,
  streamAgent,
  type ChatState,
} from './agent-stream.js';

let userSeq = 0;

/**
 * Drives one investigation session: sends a question, folds the streamed event
 * envelope into chat state, and resumes after a clarification/approval. The
 * session id is stable (route-provided) so resume targets the same snapshot.
 * The in-flight request is aborted on unmount so navigating away can't leak a
 * stream or setState into an unmounted component.
 */
export function useAgentStream(sessionId: string) {
  const [state, setState] = useState<ChatState>({ ...initialChatState, sessionId });
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Rehydrate a reopened session once on mount: restore the latest turn from the
  // persisted snapshot so the Workspace isn't blank. Skip if a run already
  // started (busy) or any message exists — never clobber live/typed state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await fetchSessionSnapshot(sessionId).catch(() => null);
      if (cancelled || !snap || busyRef.current) return;
      setState((prev) =>
        prev.messages.length === 0 && prev.status === 'idle' ? hydrateChatState(snap) : prev,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const onEvent = useCallback((e: Parameters<typeof reduceEvent>[1]) => {
    setState((prev) => reduceEvent(prev, e));
  }, []);

  const run = useCallback(
    async (path: string, body: unknown) => {
      if (busyRef.current) return;
      busyRef.current = true;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState((prev) => ({ ...prev, status: 'running' }));
      try {
        await streamAgent(path, body, onEvent, ac.signal);
      } finally {
        busyRef.current = false;
        // Defensive: if the stream ended without a terminal frame (and we weren't
        // aborted), settle so the UI never stays stuck on 'running'.
        if (!ac.signal.aborted) {
          setState((prev) => (prev.status === 'running' ? { ...prev, status: 'failed' } : prev));
        }
      }
    },
    [onEvent],
  );

  const send = useCallback(
    async (text: string) => {
      if (busyRef.current || !text.trim()) return;
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, { id: `u${++userSeq}`, kind: 'user', text }],
      }));
      await run('/agent/ask', { text, sessionId });
    },
    [run, sessionId],
  );

  const resume = useCallback(
    async (resumption: Resumption) => {
      await run('/agent/ask/resume', { sessionId, resumption });
    },
    [run, sessionId],
  );

  return { state, send, resume };
}
