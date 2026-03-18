import { buildPipelinePrompt } from '../services/prompt-builder.js';
import { createSSEWriter, startHeartbeat } from '../utils/sse.js';

export function registerOrchestrateRoute(router, deps) {
  const { callClaudeWithStreaming } = deps;
  const noopAuth = (req, res, next) => next();

  router.post('/run', noopAuth, async (req, res) => {
    const writer = createSSEWriter(res, req);
    const stopHeartbeat = startHeartbeat(writer);

    const { novelText, totalEpisodes = 80, steps: requestedSteps } = req.body;

    // Default pipeline: breakdown only in the run endpoint (screenplay is per-episode)
    const stepsToRun = requestedSteps || ['breakdown'];
    const results = {};

    try {
      for (let i = 0; i < stepsToRun.length; i++) {
        if (writer.closed) break;

        const stepId = stepsToRun[i];
        writer.write({ type: 'step_start', step: stepId, stepIndex: i, totalSteps: stepsToRun.length });

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
            stepBody = { novelText, totalEpisodes, storyBible };
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
              assets: results['extract-assets'] || req.body.assets,
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

          await callClaudeWithStreaming(systemPrompt, userMessage, agentId, {
            model: 'claude-sonnet-4-20250514',
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
              // For extract-bible, try to parse JSON for downstream use
              let resultValue = fullText;
              if (stepId === 'extract-bible') {
                try {
                  resultValue = JSON.parse(fullText);
                } catch {
                  // Try to extract JSON from response
                  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    try { resultValue = JSON.parse(jsonMatch[0]); } catch { /* keep as string */ }
                  }
                }
              }
              results[stepId] = resultValue;
              writer.write({ type: 'step_complete', step: stepId, result: fullText, thinking: fullThinking, tokens });
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
  });
}
