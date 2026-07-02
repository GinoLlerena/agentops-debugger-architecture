import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../lib/agent-stream.js';
import { I18nProvider } from '../i18n/index.js';
import { ChatThread } from './chat-messages.js';

// waiting: true because most cases exercise an actionable HITL card.
const noop = { onOpenEvidence: vi.fn(), onResume: vi.fn(), busy: false, waiting: true };

/** Components use `useI18n`, so every render needs the provider (defaults to es). */
const renderUI = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

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
    renderUI(<ChatThread messages={messages} handlers={noop} />);
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
    renderUI(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
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
    renderUI(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    fireEvent.click(screen.getByText('Minería'));
    expect(onResume).toHaveBeenCalledWith({ type: 'clarification', answer: 'Minería' });
  });

  it('approve/cancel buttons fire the approval resumption', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      { id: 'a1', kind: 'approval', interruptId: 'i1', description: 'Guardar informe' },
    ];
    renderUI(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    fireEvent.click(screen.getByText('Aprobar y guardar informe'));
    expect(onResume).toHaveBeenCalledWith({ type: 'approval', approved: true });
  });

  it('a consumed approval card is inert once the session is no longer waiting', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      { id: 'a1', kind: 'approval', interruptId: 'i1', description: 'Guardar informe' },
      { id: 'r1', kind: 'result', text: 'Informe guardado.', evidence: [] },
    ];
    renderUI(<ChatThread messages={messages} handlers={{ ...noop, onResume, waiting: false }} />);
    const approve = screen.getByText('Aprobar y guardar informe');
    expect(approve).toBeDisabled();
    fireEvent.click(approve);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('only the latest interrupt card is actionable while waiting', () => {
    const onResume = vi.fn();
    const messages: ChatMessage[] = [
      {
        id: 'c1',
        kind: 'clarification',
        question: '¿Cuál?',
        candidates: [{ id: 'x', label: 'Antigua' }],
      },
      { id: 'a1', kind: 'approval', interruptId: 'i2', description: 'Guardar informe' },
    ];
    renderUI(<ChatThread messages={messages} handlers={{ ...noop, onResume }} />);
    // the older clarification is inert; the newest approval is live
    fireEvent.click(screen.getByText('Antigua'));
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Aprobar y guardar informe'));
    expect(onResume).toHaveBeenCalledWith({ type: 'approval', approved: true });
  });

  it('translates coded stream errors to the active language', () => {
    const messages: ChatMessage[] = [
      { id: 'e1', kind: 'error', message: 'Error de red', code: 'network' },
    ];
    renderUI(<ChatThread messages={messages} handlers={noop} />);
    // default provider language is es
    expect(screen.getByText(/Error de red\. Revisa tu conexión/)).toBeInTheDocument();
  });
});
