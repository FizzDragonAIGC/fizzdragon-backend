import { registerSyncRoutes } from './sync.js';
import { registerOrchestrateRoute } from './orchestrate.js';

export function createRoutes(router, deps) {
  registerSyncRoutes(router, deps);
  // Stream routes registered on main app (see proxy-server.js) to avoid Express sub-router SSE buffering
  registerOrchestrateRoute(router, deps);
}
