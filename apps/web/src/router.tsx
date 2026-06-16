import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { AppShell } from './components/AppShell.js';
import { Dashboard } from './routes/Dashboard.js';
import { Workspace } from './routes/Workspace.js';
import { newSessionId } from './lib/ids.js';

/** Remount the Workspace when the session id changes so each session gets a fresh
 *  hook instance (no stale chat carried across navigation). */
function WorkspaceRoute() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  return <Workspace key={sessionId} sessionId={sessionId} />;
}

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sesiones/$sessionId',
  component: WorkspaceRoute,
});

// /nueva → mint a fresh session id and redirect into the Workspace.
const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nueva',
  beforeLoad: () => {
    throw redirect({ to: '/sesiones/$sessionId', params: { sessionId: newSessionId() } });
  },
});

const routeTree = rootRoute.addChildren([dashboardRoute, workspaceRoute, newRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
