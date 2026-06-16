import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../lib/agent-stream.js';
import { ChatThread } from './chat-messages.js';

const noop = { onOpenEvidence: vi.fn(), onResume: vi.fn(), busy: false };

describe('ChatThread', () => {
  it('renders a plan checklist, a result, and evidence chips', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', kind: 'user', text: 'Sanciones de X' },
      {
        id: 'p1',
        kind: 'plan',
        reasoning: 'Combino datos con documentos.',
        tasks: [{ taskId: 'data', title: 'Datos OEFA', status: 'done', result: '8 registros' }],
      },
      {
        id: 'r1',
        kind: 'result',
        text: '8 sanciones firmes.',
        evidence: [{ id: 'E', documentTitle: 'Res. 1', passage: 'p', confidence: 'directa' }],
      },
    ];
    render(<ChatThread messages={messages} handlers={noop} />);
    expect(screen.getByText('Combino datos con documentos.')).toBeInTheDocument();
    expect(screen.getByText('Datos OEFA')).toBeInTheDocument();
    expect(screen.getByText('8 sanciones firmes.')).toBeInTheDocument();
    expect(screen.getByText('E1')).toBeInTheDocument(); // evidence chip
  });

  it('resumes with the selected candidate ruc on a clarification', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'c1',
        kind: 'clarification',
        question: '¿Cuál?',
        candidates: [{ id: 'c1', label: 'Minera Las Bambas', ruc: '20543210981' }],
      },
    ];
    render(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    fireEvent.click(screen.getByText('Minera Las Bambas'));
    expect(onResume).toHaveBeenCalledWith({ type: 'clarification', answer: '20543210981' });
  });

  it('falls back to the candidate label (not the opaque id) when no ruc', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'c1',
        kind: 'clarification',
        question: '¿Cuál sector?',
        candidates: [{ id: 'c1', label: 'Minería' }],
      },
    ];
    render(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    fireEvent.click(screen.getByText('Minería'));
    expect(onResume).toHaveBeenCalledWith({ type: 'clarification', answer: 'Minería' });
  });

  it('approve/cancel buttons fire the approval resumption', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      { id: 'a1', kind: 'approval', interruptId: 'i1', description: 'Guardar informe' },
    ];
    render(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    fireEvent.click(screen.getByText('Aprobar y guardar informe'));
    expect(onResume).toHaveBeenCalledWith({ type: 'approval', approved: true });
  });
});
