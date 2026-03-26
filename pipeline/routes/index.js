import { registerSyncRoutes } from './sync.js';

export function createRoutes(router, deps) {
  registerSyncRoutes(router, deps);
}
