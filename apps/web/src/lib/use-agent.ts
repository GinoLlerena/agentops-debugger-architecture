import { useCallback, useRef, useState } from 'react';
import type { Resumption } from '@agentops/shared';
import {
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
 */
export function useAgentStream(sessionId: string) {
  const [state, setState] = useState<ChatState>({ ...initialChatState, sessionId });
  const busyRef = useRef(false);

  const onEvent = useCallback((e: Parameters<typeof reduceEvent>[1]) => {
    setState((prev) => reduceEvent(prev, e));
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (busyRef.current || !text.trim()) return;
      busyRef.current = true;
      setState((prev) => ({
        ...prev,
        status: 'running',
        messages: [...prev.messages, { id: `u${++userSeq}`, kind: 'user', text }],
      }));
      try {
        await streamAgent('/agent/ask', { text, sessionId }, onEvent);
      } finally {
        busyRef.current = false;
      }
    },
    [sessionId, onEvent],
  );

  const resume = useCallback(
    async (resumption: Resumption) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setState((prev) => ({ ...prev, status: 'running' }));
      try {
        await streamAgent('/agent/ask/resume', { sessionId, resumption }, onEvent);
      } finally {
        busyRef.current = false;
      }
    },
    [sessionId, onEvent],
  );

  return { state, send, resume };
}
