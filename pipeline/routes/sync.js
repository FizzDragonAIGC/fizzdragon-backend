import { PIPELINE_STEPS } from '../config.js';
import { buildPipelinePrompt } from '../services/prompt-builder.js';
import { readProjectContext, writeProjectContext } from '../services/project-context.js';

export function registerSyncRoutes(router, deps) {
  const { callClaude, extractThinking, sanitizeForJson } = deps;

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}`, async (req, res) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        console.log(`[Pipeline:${stepId}] Response finished in ${Date.now() - startedAt}ms`);
      });
      res.on('close', () => {
        console.log(`[Pipeline:${stepId}] Response closed in ${Date.now() - startedAt}ms`);
      });

      // Auto-inject project context when projectId is provided
      if (req.body.projectId) {
        const userId = '_public';
        const ctx = readProjectContext(userId, req.body.projectId);
        if (ctx) {
          for (const [k, v] of Object.entries(ctx)) {
            if (req.body[k] === undefined && v != null) {
              req.body[k] = v;
            }
          }
          console.log(`[Pipeline:${stepId}] Injected context keys: ${Object.keys(ctx).join(',')}`);
        }
      }

      try {
        const { systemPrompt, userMessage, agentId, options } = buildPipelinePrompt(stepId, req.body, deps);
        console.log(`[Pipeline:${stepId}] Calling ${agentId}...`);

        const result = await callClaude(systemPrompt, userMessage, agentId, options);

        // Extract thinking
        const { thinking, content } = extractThinking(result.text);
        const reasoning = result.reasoning || thinking;

        // Sanitize LLM output to prevent control characters breaking JSON
        const sanitize = sanitizeForJson || (t => t);

        const payload = {
          result: sanitize(content),
          reasoning: sanitize(reasoning),
          tokens: result.tokens,
          step: stepId,
          agent: agentId
        };

        // Write back generated screenplay to project-context for cross-episode continuity
        if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && content) {
          const epIdx = req.body.episodeIndex;
          writeProjectContext('_public', req.body.projectId, {
            screenplays: { [epIdx]: content }
          }).catch(err => console.error(`[Pipeline:screenplay] Context writeback failed:`, err.message));
          console.log(`[Pipeline:screenplay] Wrote back screenplay for episode ${epIdx}`);
        }

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
