import { useEffect, useState } from 'react';
import { CONFIDENCE_LABELS, localizeLabel, type EvidenceItem } from '@agentops/shared';
import { useI18n } from '../i18n/index.js';
import { Sheet } from './ui.js';

/** The signature evidence chip [E1] (UX §4.7): confidence by border AND label. */
export function EvidenceChip({
  item,
  label,
  onOpen,
}: {
  item: EvidenceItem;
  label: string;
  onOpen: (item: EvidenceItem) => void;
}) {
  const { t } = useI18n();
  const none = item.confidence === 'sin_evidencia';
  const dashed = item.confidence === 'inferencia';
  const cls = none
    ? 'border-gris-ev text-gris-ev'
    : dashed
      ? 'border-dashed border-azul-dato text-azul-dato'
      : 'border-verde-fiscal text-verde-fiscal';
  return (
    <button
      onClick={() => onOpen(item)}
      title={item.passage}
      className={`mono mx-0.5 rounded-chip border bg-superficie px-1 text-2xs ${cls}`}
    >
      {none ? t('evidence.noSource') : label}
    </button>
  );
}

export function EvidenceDrawer({
  item,
  onClose,
}: {
  item: EvidenceItem | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  // Translated citations carry the Spanish source in the `*Original` sidecars;
  // offer a social-media-style toggle so the user can verify against the source.
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => setShowOriginal(false), [item?.id]); // reset when a new citation opens
  const hasOriginal =
    item?.originalLanguage != null &&
    (item.passageOriginal != null || item.documentTitleOriginal != null);
  const original = Boolean(hasOriginal && showOriginal);
  const passage = original ? (item?.passageOriginal ?? item?.passage) : item?.passage;
  const documentTitle = original
    ? (item?.documentTitleOriginal ?? item?.documentTitle)
    : item?.documentTitle;
  return (
    <Sheet open={item !== null} onClose={onClose} title={t('evidence.title')} width={440}>
      {item && (
        <div className="space-y-3 text-sm">
          <p className="rounded-card border-l-2 border-verde-fiscal bg-papel p-3 leading-relaxed">
            {passage}
          </p>
          {hasOriginal && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setShowOriginal((v) => !v)}
                className="font-semibold text-azul-dato hover:underline"
              >
                {original ? t('evidence.showTranslation') : t('evidence.showOriginal')}
              </button>
              {original && (
                <span className="rounded-chip bg-papel px-1.5 py-0.5 text-2xs text-gris-ev">
                  {t('evidence.originalTag', { lang: item.originalLanguage!.toUpperCase() })}
                </span>
              )}
            </div>
          )}
          <dl className="space-y-1.5 text-xs text-gris-ev">
            <Row label={t('evidence.document')} value={documentTitle ?? ''} />
            {item.resolutionNumber && (
              <Row label={t('evidence.resolution')} value={item.resolutionNumber} mono />
            )}
            {item.page != null && <Row label={t('evidence.page')} value={String(item.page)} />}
            {item.date && <Row label={t('evidence.date')} value={item.date} mono />}
            <Row
              label={t('evidence.confidence')}
              value={localizeLabel(CONFIDENCE_LABELS, item.confidence, language)}
            />
          </dl>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm font-semibold text-azul-dato hover:underline"
            >
              {item.page != null
                ? t('evidence.openOriginalPage', { page: item.page })
                : t('evidence.openOriginal')}{' '}
              →
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 flex-shrink-0">{label}</dt>
      <dd className={mono ? 'mono text-verde-tinta' : 'text-verde-tinta'}>{value}</dd>
    </div>
  );
}
