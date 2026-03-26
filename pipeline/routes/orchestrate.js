import { buildPipelinePrompt } from '../services/prompt-builder.js';
import { ensureNovelTextFromAttachment } from '../services/attachment-to-text.js';
import { normalizePipelineStepOutput } from '../services/output-normalizer.js';
import { createSSEWriter, startHeartbeat } from '../utils/sse.js';

function resolveOrchestrateModel(stepId, deps) {
  const providerId = typeof deps.getCurrentProvider === 'function'
    ? deps.getCurrentProvider()
    : 'anthropic';
  const provider = deps.PROVIDERS?.[providerId];
  if (!provider?.models) return undefined;

  // Story Bible extraction blocks the whole run chain; prefer lower latency here.
  if (stepId === 'extract-bible') {
    return provider.models.standard || provider.models.fast || provider.models.best;
  }

  const longOutputSteps = new Set(['extract-bible', 'breakdown', 'screenplay', 'extract-assets', 'storyboard', 'design-characters']);
  return longOutputSteps.has(stepId)
    ? (provider.models.best || provider.models.standard)
    : provider.models.standard;
}

export function createOrchestrateHandler(deps) {
  const { callClaudeWithStreaming } = deps;

  return async (req, res) => {
    const writer = createSSEWriter(res, req);
    const stopHeartbeat = startHeartbeat(writer);

    if (!writer.closed) {
      try {
        res.write(':ok\n\n');
      } catch {
        stopHeartbeat();
        writer.end();
        return;
      }
    }

    await ensureNovelTextFromAttachment(req.body);

    const { novelText, totalEpisodes = 80, steps: requestedSteps } = req.body;

    // Default pipeline: breakdown only in the run endpoint (screenplay is per-episode)
    const stepsToRun = requestedSteps || ['breakdown'];
    const results = {};

    try {
      for (let i = 0; i < stepsToRun.length; i++) {
        if (writer.closed) break;

        const stepId = stepsToRun[i];
        writer.write({ type: 'step_start', step: stepId, stepIndex: i, totalSteps: stepsToRun.length });
        await new Promise((resolve) => setImmediate(resolve));

        // Build body for this step based on previous results
        let stepBody;
        // If extract-bible has been run, attach its result as storyBible to all subsequent steps
        const storyBible = results['extract-bible'] || req.body.storyBible || null;

        switch (stepId) {
          case 'extract-bible':
            stepBody = {
              novelText,
              totalEpisodes,
              characterNotes: req.body.characterNotes,
              globalDirective: req.body.globalDirective,
              stylePreferences: req.body.stylePreferences,
              episodeDuration: req.body.episodeDuration,
              shotsPerMin: req.body.shotsPerMin
            };
            break;
          case 'breakdown':
            stepBody = {
              novelText,
              totalEpisodes,
              storyBible,
              breakdownStartEpisode: req.body.breakdownStartEpisode,
              breakdownEndEpisode: req.body.breakdownEndEpisode
            };
            break;
          case 'screenplay':
            stepBody = { ...req.body, storyBible };
            break;
          case 'extract-assets':
            stepBody = { screenplay: results.screenplay || req.body.screenplay, storyBible };
            break;
          case 'qc-assets':
            stepBody = { assets: results['extract-assets'] || req.body.assets, storyBible };
            break;
          case 'storyboard':
            stepBody = {
              screenplay: results.screenplay || req.body.screenplay,
              assets: results['extract-assets'] || req.body.assets || req.body.assetLibrary,
              storyBible
            };
            break;
          default:
            stepBody = req.body;
        }

        try {
          const { systemPrompt, userMessage, agentId } = buildPipelinePrompt(stepId, stepBody, deps);
          let stepThinking = '';
          let stepContent = '';
          const model = resolveOrchestrateModel(stepId, deps);

          await callClaudeWithStreaming(systemPrompt, userMessage, agentId, {
            ...(model ? { model } : {}),
            maxTokens: 16000
          }, {
            onThinking: (chunk) => {
              stepThinking += chunk;
              writer.write({ type: 'thinking', step: stepId, content: chunk });
            },
            onContent: (chunk) => {
              stepContent += chunk;
              writer.write({ type: 'chunk', step: stepId, content: chunk });
            },
            onDone: (fullText, fullThinking, tokens) => {
              const normalized = normalizePipelineStepOutput(stepId, fullText, stepBody);
              if (normalized.error) {
                writer.write({ type: 'error', step: stepId, error: normalized.error, details: normalized.details, raw: normalized.raw, recoverable: true });
                return;
              }

              const normalizedText = normalized.result;
              // For extract-bible, try to parse JSON for downstream use
              let resultValue = normalizedText;
              if (stepId === 'extract-bible') {
                try {
                  resultValue = JSON.parse(normalizedText);
                } catch {
                  // Try to extract JSON from response
                  const jsonMatch = normalizedText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    try { resultValue = JSON.parse(jsonMatch[0]); } catch { /* keep as string */ }
                  }
                }
              }
              results[stepId] = resultValue;
              writer.write({ type: 'step_complete', step: stepId, result: normalizedText, thinking: fullThinking, tokens });
            },
            onError: (err) => {
              writer.write({ type: 'error', step: stepId, error: err.message, recoverable: true });
            }
          });
        } catch (err) {
          writer.write({ type: 'error', step: stepId, error: err.message, recoverable: i < stepsToRun.length - 1 });
        }
      }

      writer.write({ type: 'pipeline_complete', results });
    } catch (err) {
      writer.write({ type: 'error', error: err.message, recoverable: false });
    }

    stopHeartbeat();
    writer.end();
  };
}

export function registerOrchestrateRoute(router, deps) {
  router.post('/run', createOrchestrateHandler(deps));
}
