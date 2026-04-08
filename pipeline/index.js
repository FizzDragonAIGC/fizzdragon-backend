import { Router } from 'express';
import { createRoutes } from './routes/index.js';

export function createPipelineRouter(deps) {
  const router = Router();
  createRoutes(router, deps);
  return router;
}
