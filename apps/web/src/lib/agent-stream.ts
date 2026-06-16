import {
  ChartSpec,
  StreamEvent,
  type EvidenceItem,
  type ExecutionStatus,
  type DomainTaskPacket,
} from '@agentops/shared';

export type CanvasTab = 'resumen' | 'datos' | 'documentos' | 'informe';

/**
 * Client-side model of a chat turn, folded from the typed SSE event envelope.
 * The Plan card morphs into a live checklist in place (UX §4.4–4.5): we keep one
 * 'plan' message and mutate its task rows as task_* events arrive.
 */
export type TaskRowStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface TaskRow {
  taskId: string;
  title: string;
  agentId?: string;
  status: TaskRowStatus;
  caption?: string;
  progress?: number;
  result?: string;
}

export type ChatMessage =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'plan'; reasoning: string; tasks: TaskRow[] }
  | {
      id: string;
      kind: 'result';
      text: string;
      evidence: EvidenceItem[];
      resultSummary?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: 'clarification';
      question: string;
      candidates: { id: string; label: string; ruc?: string; sector?: string; note?: string }[];
    }
  | { id: string; kind: 'approval'; interruptId: string; description: string }
  | { id: string; kind: 'notice'; text: string }
  | { id: string; kind: 'error'; message: string };

export interface ChatState {
  sessionId?: string;
  status: ExecutionStatus | 'idle';
  messages: ChatMessage[];
  /** Evidence accumulated across the turn — feeds the canvas + evidence drawer. */
  evidence: EvidenceItem[];
  /** Charts the agent asked the canvas to render (chart_data artifacts). */
  charts: ChartSpec[];
  /** Canvas tab the agent requested via an open_tab uiAction (agent-driven UI). */
  requestedTab?: CanvasTab;
}

export const initialChatState: ChatState = {
  status: 'idle',
  messages: [],
  evidence: [],
  charts: [],
};

let seq = 0;
const nextId = (): string => `m${++seq}`;

/** Update the most recent plan message's task rows immutably. */
function patchLastPlan(
  messages: ChatMessage[],
  taskId: string,
  patch: Partial<TaskRow>,
): ChatMessage[] {
  let planIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.kind === 'plan') {
      planIndex = i;
      break;
    }
  }
  if (planIndex === -1) return messages;
  const plan = messages[planIndex] as Extract<ChatMessage, { kind: 'plan' }>;
  const tasks = plan.tasks.map((t) => (t.taskId === taskId ? { ...t, ...patch } : t));
  const copy = messages.slice();
  copy[planIndex] = { ...plan, tasks };
  return copy;
}

/** Pure reducer: fold one typed StreamEvent into the chat state. */
export function reduceEvent(state: ChatState, event: StreamEvent): ChatState {
  switch (event.type) {
    case 'plan': {
      const tasks: TaskRow[] = event.payload.tasks.map((t: DomainTaskPacket) => ({
        taskId: t.taskId,
        title: t.title,
        agentId: t.agentId,
        status: 'pending',
      }));
      // A plan marks a new turn: reset per-turn canvas state so a follow-up
      // query never shows the previous turn's charts/evidence or a stale tab.
      return {
        ...state,
        status: 'running',
        evidence: [],
        charts: [],
        requestedTab: undefined,
        messages: [
          ...state.messages,
          { id: nextId(), kind: 'plan', reasoning: event.payload.reasoning, tasks },
        ],
      };
    }
    case 'task_start':
      return {
        ...state,
        messages: patchLastPlan(state.messages, event.payload.taskId, {
          status: 'running',
          agentId: event.payload.agentId,
        }),
      };
    case 'task_progress':
      return {
        ...state,
        messages: patchLastPlan(state.messages, event.payload.taskId, {
          caption: event.payload.caption,
          progress: event.payload.progress,
        }),
      };
    case 'task_done':
      return {
        ...state,
        messages: patchLastPlan(state.messages, event.payload.taskId, {
          status: event.payload.status === 'completed' ? 'done' : event.payload.status,
          result: event.payload.result,
        }),
      };
    case 'clarification_required':
      return {
        ...state,
        status: 'waiting',
        messages: [
          ...state.messages,
          {
            id: nextId(),
            kind: 'clarification',
            question: event.payload.question,
            candidates: event.payload.candidates,
          },
        ],
      };
    case 'approval_required':
      return {
        ...state,
        status: 'waiting',
        messages: [
          ...state.messages,
          {
            id: nextId(),
            kind: 'approval',
            interruptId: event.payload.interruptId,
            description: event.payload.description,
          },
        ],
      };
    case 'result': {
      // Accumulate evidence across the turn, de-duped by id (the canvas reads it).
      const byId = new Map(state.evidence.map((e) => [e.id, e]));
      for (const e of event.payload.evidence) if (!byId.has(e.id)) byId.set(e.id, e);
      // Collect chart_data artifacts the agent streamed — validate at the boundary
      // (ArtifactRecord.data is opaque), so a malformed chart can't crash the canvas.
      const chartById = new Map(state.charts.map((c) => [c.id, c]));
      for (const a of event.payload.artifacts) {
        if (a.kind !== 'chart_data') continue;
        const parsed = ChartSpec.safeParse(a.data);
        if (parsed.success) chartById.set(a.id, parsed.data);
      }
      // Apply open_tab uiActions (the agent driving the canvas).
      let requestedTab = state.requestedTab;
      for (const ua of event.payload.uiActions) if (ua.action === 'open_tab') requestedTab = ua.tab;
      return {
        ...state,
        evidence: [...byId.values()],
        charts: [...chartById.values()],
        requestedTab,
        messages: [
          ...state.messages,
          {
            id: nextId(),
            kind: 'result',
            text: event.payload.text,
            evidence: event.payload.evidence,
            resultSummary: event.payload.resultSummary,
          },
        ],
      };
    }
    case 'error':
      // An error is terminal: settle status so the UI never stays stuck on 'running'.
      return {
        ...state,
        status: 'failed',
        messages: [
          ...state.messages,
          { id: nextId(), kind: 'error', message: event.payload.message },
        ],
      };
    case 'done':
      return { ...state, sessionId: event.payload.sessionId, status: event.payload.status };
    default:
      return state;
  }
}

/** Parse a buffer of SSE text into complete events; returns leftover partial text. */
export function parseSSEBuffer(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? ''; // last item is an incomplete block (no trailing \n\n yet)
  for (const block of blocks) {
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    try {
      const parsed = StreamEvent.safeParse(JSON.parse(dataLine.slice('data:'.length).trim()));
      if (parsed.success) events.push(parsed.data);
    } catch {
      /* skip malformed frame */
    }
  }
  return { events, rest };
}

/**
 * POST to an /agent/* endpoint and invoke `onEvent` for each streamed event.
 * Never throws: any failure (non-ok response, missing body, network/read error)
 * is surfaced as a synthetic `error` event so the caller can always settle state.
 * An intentional abort is silent (no error event).
 */
export async function streamAgent(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      onEvent({
        type: 'error',
        payload: {
          code: String(res.status),
          message: (detail as { error?: string }).error ?? `Error ${res.status}`,
        },
      });
      return;
    }
    if (!res.body) {
      onEvent({ type: 'error', payload: { code: 'no_body', message: 'Respuesta sin cuerpo.' } });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSEBuffer(buffer);
      buffer = rest;
      for (const event of events) onEvent(event);
    }
    buffer += decoder.decode(); // flush any pending multibyte bytes
    const { events } = parseSSEBuffer(`${buffer}\n\n`); // flush any trailing frame
    for (const event of events) onEvent(event);
  } catch (err) {
    if (signal?.aborted) return; // intentional cancellation — stay silent
    onEvent({
      type: 'error',
      payload: { code: 'network', message: err instanceof Error ? err.message : 'Error de red' },
    });
  }
}
