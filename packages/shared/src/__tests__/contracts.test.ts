import { describe, expect, it } from 'vitest';
import {
  AgentManifest,
  DomainTaskPacket,
  DomainTaskResult,
  EvidenceItem,
  Finding,
  LedgerEvent,
  MANDATORY_DISCLAIMER,
  NormalizedUserRequest,
  OefaDatasetConfig,
  OefaQueryResult,
  OefaRecord,
  OrchestratorState,
  Report,
  Session,
  StreamEvent,
} from '../index.js';
import * as fx from '../__fixtures__/valid.js';

/**
 * Contract tests (architecture §8.2.1, plan §4): every schema parses its valid
 * fixture and rejects malformed input. The discipline this sets up is the whole
 * point of Phase 0 — typed cross-boundary contracts are the Technical-Depth core.
 */

describe('schemas parse their valid fixtures', () => {
  const cases: Array<[string, { safeParse: (v: unknown) => { success: boolean } }, unknown]> = [
    ['OefaRecord', OefaRecord, fx.validOefaRecord],
    ['OefaDatasetConfig', OefaDatasetConfig, fx.validOefaDatasetConfig],
    ['OefaQueryResult', OefaQueryResult, fx.validOefaQueryResult],
    ['EvidenceItem', EvidenceItem, fx.validEvidenceItem],
    ['Finding', Finding, fx.validFinding],
    ['DomainTaskPacket', DomainTaskPacket, fx.validDomainTaskPacket],
    ['DomainTaskResult', DomainTaskResult, fx.validDomainTaskResult],
    ['AgentManifest', AgentManifest, fx.validAgentManifest],
    ['LedgerEvent', LedgerEvent, fx.validLedgerEvent],
    ['OrchestratorState', OrchestratorState, fx.validOrchestratorState],
    ['Report', Report, fx.validReport],
    ['Session', Session, fx.validSession],
    ['NormalizedUserRequest', NormalizedUserRequest, fx.validNormalizedUserRequest],
    ['StreamEvent(plan)', StreamEvent, fx.validStreamEventPlan],
    ['StreamEvent(result)', StreamEvent, fx.validStreamEventResult],
  ];

  it.each(cases)('%s accepts its fixture', (_name, schema, fixture) => {
    expect(schema.safeParse(fixture).success).toBe(true);
  });
});

describe('schemas reject malformed input', () => {
  it('OefaRecord requires administrado', () => {
    const { administrado: _omit, ...bad } = fx.validOefaRecord;
    expect(OefaRecord.safeParse(bad).success).toBe(false);
  });

  it('OefaRecord rejects an unknown resolutionStatus', () => {
    expect(OefaRecord.safeParse({ ...fx.validOefaRecord, resolutionStatus: 'maybe' }).success).toBe(
      false,
    );
  });

  it('EvidenceItem rejects an invalid confidence label', () => {
    expect(EvidenceItem.safeParse({ ...fx.validEvidenceItem, confidence: 'alta' }).success).toBe(
      false,
    );
  });

  it('DomainTaskPacket rejects an unknown domain', () => {
    expect(
      DomainTaskPacket.safeParse({ ...fx.validDomainTaskPacket, domain: 'weather' }).success,
    ).toBe(false);
  });

  it('DomainTaskPacket rejects an unknown operation', () => {
    expect(
      DomainTaskPacket.safeParse({ ...fx.validDomainTaskPacket, operation: 'launch' }).success,
    ).toBe(false);
  });

  it('AgentManifest requires at least one owned domain', () => {
    expect(AgentManifest.safeParse({ ...fx.validAgentManifest, ownsDomains: [] }).success).toBe(
      false,
    );
  });

  it('LedgerEvent rejects an unknown event type', () => {
    expect(LedgerEvent.safeParse({ ...fx.validLedgerEvent, type: 'hacked' }).success).toBe(false);
  });

  it('LedgerEvent rejects a negative seq', () => {
    expect(LedgerEvent.safeParse({ ...fx.validLedgerEvent, seq: -1 }).success).toBe(false);
  });

  it('Report rejects a tampered (non-mandatory) disclaimer', () => {
    expect(
      Report.safeParse({ ...fx.validReport, disclaimer: 'No legal disclaimer.' }).success,
    ).toBe(false);
  });

  it('StreamEvent rejects an unknown event type', () => {
    expect(StreamEvent.safeParse({ type: 'whoops', payload: {} }).success).toBe(false);
  });
});

describe('defaults and invariants', () => {
  it('OefaRecord defaults resolutionStatus to "desconocido" and fromCache to false', () => {
    const minimal = {
      id: 'x',
      administrado: 'ACME S.A.',
      sourceDatasetId: 'd',
      sourceDatasetGuid: 'G',
      fetchedAt: '2026-06-13T00:00:00.000Z',
    };
    const parsed = OefaRecord.parse(minimal);
    expect(parsed.resolutionStatus).toBe('desconocido');
    expect(parsed.fromCache).toBe(false);
  });

  it('Report fills the mandatory disclaimer when omitted', () => {
    const { disclaimer: _omit, ...noDisclaimer } = fx.validReport;
    const parsed = Report.parse(noDisclaimer);
    expect(parsed.disclaimer).toBe(MANDATORY_DISCLAIMER);
  });

  it('DomainTaskResult fills array defaults when omitted', () => {
    const parsed = DomainTaskResult.parse({
      taskId: 't',
      agentId: 'a',
      status: 'completed',
      summary: 'ok',
    });
    expect(parsed.artifacts).toEqual([]);
    expect(parsed.findings).toEqual([]);
    expect(parsed.nextTasks).toEqual([]);
  });
});
