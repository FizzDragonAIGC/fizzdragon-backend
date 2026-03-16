import { PIPELINE_STEPS } from '../config.js';
import { buildPipelinePrompt } from '../services/prompt-builder.js';

export function registerSyncRoutes(router, deps) {
  const { requireAuth, callClaude, extractThinking } = deps;

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}`, requireAuth, async (req, res) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        console.log(`[Pipeline:${stepId}] Response finished in ${Date.now() - startedAt}ms`);
      });
      res.on('close', () => {
        console.log(`[Pipeline:${stepId}] Response closed in ${Date.now() - startedAt}ms`);
      });

      try {
        const { systemPrompt, userMessage, agentId, options } = buildPipelinePrompt(stepId, req.body, deps);
        console.log(`[Pipeline:${stepId}] Calling ${agentId}...`);

        const result = await callClaude(systemPrompt, userMessage, agentId, options);

        // Extract thinking
        const { thinking, content } = extractThinking(result.text);
        const reasoning = result.reasoning || thinking;

        const payload = {
          result: content,
          reasoning,
          tokens: result.tokens,
          step: stepId,
          agent: agentId
        };

        const body = JSON.stringify(payload);
        res.status(200);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
        res.end(body);
      } catch (err) {
        console.error(`[Pipeline:${stepId}] Error:`, err.message);
        const payload = {
          error: err.message,
          step: stepId
        };
        const body = JSON.stringify(payload);
        res.status(err.message.includes('Missing required') ? 400 : 500);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
        res.end(body);
      }
    });
  }
}
