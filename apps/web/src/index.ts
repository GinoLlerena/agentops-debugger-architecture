/**
 * apps/web — frontend entrypoint (placeholder for Phase 0).
 * Phase 4 adds: Vite + TanStack Router/Query + Tailwind + shadcn + Recharts +
 * CopilotKit chat, the Workspace (chat + canvas), the Trazabilidad trace sheet,
 * and the dashboard. Visual contract: docs/files/agentops-debugger-mockups.html.
 *
 * Imports a shared type to prove the workspace wiring resolves.
 */
import type { StreamEvent } from '@agentops/shared';

export function isResultEvent(event: StreamEvent): boolean {
  return event.type === 'result';
}
