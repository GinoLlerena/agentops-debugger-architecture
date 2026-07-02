import { describe, expect, it } from 'vitest';
import { interpretPlanOutput, type PlanOutput } from './planner.js';

const idgen = (() => {
  let n = 0;
  return () => `t${++n}`;
})();

const task = {
  domain: 'oefa_data' as const,
  operation: 'search' as const,
  title: 'Buscar registros',
  instruction: 'Resolver la entidad y consultar sanciones.',
  inputs: {},
  dependsOn: [],
};

describe('interpretPlanOutput — live planner output variance', () => {
  it('tasks → plan, with code-assigned taskIds', () => {
    const { result, degenerate } = interpretPlanOutput({ tasks: [task] }, idgen, 'es');
    expect(degenerate).toBe(false);
    expect(result.kind).toBe('plan');
    if (result.kind !== 'plan') return;
    expect(result.tasks[0]!.taskId).toMatch(/^t\d+$/);
  });

  it('clarification wins over kind omission', () => {
    const out: PlanOutput = {
      clarification: {
        question: '¿Cuál administrado?',
        candidates: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    };
    const { result, degenerate } = interpretPlanOutput(out, idgen, 'es');
    expect(degenerate).toBe(false);
    expect(result.kind).toBe('clarification');
  });

  it('explicit reply with text passes through', () => {
    const { result, degenerate } = interpretPlanOutput({ kind: 'reply', text: 'Respuesta.' }, idgen, 'es');
    expect(degenerate).toBe(false);
    expect(result.kind === 'reply' && result.text).toBe('Respuesta.');
  });

  it("a 'plan' with zero tasks is NOT a plan — falls through to reply", () => {
    const { result } = interpretPlanOutput({ kind: 'plan', reasoning: 'r' }, idgen, 'es');
    expect(result.kind).toBe('reply');
  });

  it('degenerate output (nothing usable) is flagged for retry, with an honest fallback', () => {
    const { result, degenerate } = interpretPlanOutput({}, idgen, 'es');
    expect(degenerate).toBe(true);
    // must not claim sources were consulted when nothing ran
    expect(result.kind === 'reply' && result.text).not.toMatch(/fuentes consultadas/);
    expect(result.kind === 'reply' && result.text).toContain('reformúlala');
  });

  it('degenerate fallback is localized', () => {
    const { result } = interpretPlanOutput({}, idgen, 'en');
    expect(result.kind === 'reply' && result.text).toContain('rephrase');
  });

  it('reasoning-only output becomes the reply text (not degenerate)', () => {
    const { result, degenerate } = interpretPlanOutput({ reasoning: 'Análisis breve.' }, idgen, 'es');
    expect(degenerate).toBe(false);
    expect(result.kind === 'reply' && result.text).toBe('Análisis breve.');
  });
});

describe('interpretPlanOutput — report draft/save pairing', () => {
  const save = {
    domain: 'report_admin' as const,
    operation: 'create' as const,
    title: 'Guardar informe',
    instruction: 'Guardar el informe aprobado.',
    inputs: {},
    dependsOn: [],
  };
  const draft = { ...save, domain: 'report' as const, title: 'Borrador' };

  it('inserts a report/create draft before an unpaired report_admin/create save', () => {
    const { result } = interpretPlanOutput({ tasks: [task, save] }, idgen, 'es');
    expect(result.kind).toBe('plan');
    if (result.kind !== 'plan') return;
    const ops = result.tasks.map((t) => `${t.domain}/${t.operation}`);
    expect(ops).toEqual(['oefa_data/search', 'report/create', 'report_admin/create']);
  });

  it('leaves an already-paired plan untouched', () => {
    const { result } = interpretPlanOutput({ tasks: [task, draft, save] }, idgen, 'es');
    if (result.kind !== 'plan') return;
    expect(result.tasks).toHaveLength(3);
  });

  it('does not inject a draft when there is no save task', () => {
    const { result } = interpretPlanOutput({ tasks: [task] }, idgen, 'es');
    if (result.kind !== 'plan') return;
    expect(result.tasks).toHaveLength(1);
  });
});
