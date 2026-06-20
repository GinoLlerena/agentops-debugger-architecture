import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EvidenceItem } from '@agentops/shared';
import { I18nProvider } from '../i18n/index.js';
import { EvidenceDrawer } from './evidence.js';

const renderUI = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const translated: EvidenceItem = {
  id: 'E1',
  documentTitle: 'Fine resolution',
  documentTitleOriginal: 'Resolución de multa',
  passage: 'Status: final.',
  passageOriginal: 'Estado: firme.',
  originalLanguage: 'es',
  confidence: 'directa',
};

const spanishOnly: EvidenceItem = {
  id: 'E2',
  documentTitle: 'Resolución de multa',
  passage: 'Estado: firme.',
  confidence: 'directa',
};

describe('EvidenceDrawer — show original (5G-c)', () => {
  it('shows the translated passage with a "show original" toggle', () => {
    renderUI(<EvidenceDrawer item={translated} onClose={vi.fn()} />);
    expect(screen.getByText('Status: final.')).toBeInTheDocument();
    expect(screen.getByText('ver original')).toBeInTheDocument(); // es UI default
  });

  it('toggles to the Spanish source and back', () => {
    renderUI(<EvidenceDrawer item={translated} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('ver original'));
    expect(screen.getByText('Estado: firme.')).toBeInTheDocument();
    expect(screen.getByText('original (ES)')).toBeInTheDocument();
    // toggle label flips to "show translation"
    fireEvent.click(screen.getByText('ver traducción'));
    expect(screen.getByText('Status: final.')).toBeInTheDocument();
  });

  it('omits the toggle when the citation has no original (source-language only)', () => {
    renderUI(<EvidenceDrawer item={spanishOnly} onClose={vi.fn()} />);
    expect(screen.queryByText('ver original')).not.toBeInTheDocument();
  });
});
