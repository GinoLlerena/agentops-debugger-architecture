import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './components/AppShell.js';
import { Dashboard } from './routes/Dashboard.js';
import { Workspace } from './routes/Workspace.js';
import { newSessionId } from './lib/ids.js';

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
  component: Workspace,
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
