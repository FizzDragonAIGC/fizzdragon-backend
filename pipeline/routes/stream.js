import { PIPELINE_STEPS } from '../config.js';
import { buildPipelinePrompt } from '../services/prompt-builder.js';
import { readProjectContext, writeProjectContext } from '../services/project-context.js';

export function registerStreamRoutes(router, deps) {

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}/stream`, async (req, res) => {
      console.log(`[Pipeline:${stepId}/stream] Request received, body keys: ${Object.keys(req.body).join(',')}`);

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
          console.log(`[Pipeline:${stepId}/stream] Injected context keys: ${Object.keys(ctx).join(',')}`);
        }
      }
      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders();
      // Send initial SSE comment to keep connection alive during API call
      res.write(':ok\n\n');

      const write = (data) => {
        if (!res.writableEnded) {
          try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
        }
      };

      try {
        const { systemPrompt, userMessage, agentId } = buildPipelinePrompt(stepId, req.body, deps);
        console.log(`[Pipeline:${stepId}/stream] Calling ${agentId}, prompt length: ${systemPrompt.length + userMessage.length}`);

        // Determine provider
        const currentProvider = process.env.AI_PROVIDER || 'dashscope';
        const PROVIDERS = deps._PROVIDERS || null;

        if (currentProvider === 'anthropic' && deps.anthropic) {
          // Anthropic SDK streaming
          const createParams = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            stream: true
          };
          const stream = deps.anthropic.messages.stream(createParams);
          let fullText = '';
          let fullThinking = '';

          stream.on('thinking', (thinking) => {
            fullThinking += thinking;
            write({ type: 'thinking', content: thinking });
          });
          stream.on('text', (text) => {
            fullText += text;
            write({ type: 'chunk', content: text });
          });

          const finalMessage = await stream.finalMessage();
          const tokens = {
            input: finalMessage.usage?.input_tokens || 0,
            output: finalMessage.usage?.output_tokens || 0
          };
          write({ type: 'done', fullText, fullThinking: fullThinking || null, tokens });

          // Write back generated screenplay to project-context for cross-episode continuity
          if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && fullText) {
            const epIdx = req.body.episodeIndex;
            writeProjectContext('_public', req.body.projectId, {
              screenplays: { [epIdx]: fullText }
            }).catch(err => console.error(`[Pipeline:screenplay/stream] Context writeback failed:`, err.message));
            console.log(`[Pipeline:screenplay/stream] Wrote back screenplay for episode ${epIdx}`);
          }
        } else {
          // OpenAI-compatible (DeepSeek etc.) - direct streaming
          const providerName = currentProvider.toUpperCase();
          const apiKey = deps.getApiKeyForProvider ? deps.getApiKeyForProvider(currentProvider) : process.env[`${providerName}_API_KEY`];
          const baseUrl = PROVIDERS?.[currentProvider]?.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
          // Use 'best' model for long-output agents (same as sync callClaude logic)
          const longOutputAgents = ['storyboard', 'novelist', 'screenwriter', 'narrative', 'story_architect', 'episode_planner', 'aggregate', 'story_breakdown_pack'];
          const modelTier = longOutputAgents.includes(agentId) ? 'best' : 'standard';
          const model = PROVIDERS?.[currentProvider]?.models?.[modelTier] || PROVIDERS?.[currentProvider]?.models?.standard || 'qwen-max';

          console.log(`[Pipeline:${stepId}/stream] Calling ${currentProvider} (${model}), baseUrl=${baseUrl}, hasKey=${!!apiKey}`);

          const fetchUrl = `${baseUrl}/chat/completions`;
          console.log(`[Pipeline:${stepId}/stream] Fetching: ${fetchUrl}`);
          const ac = new AbortController();
          const fetchTimer = setTimeout(() => ac.abort(), 600000); // 10 min — align with frontend timeout
          const apiResp = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              max_tokens: 8192,
              stream: true,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ]
            }),
            signal: ac.signal
          });
          clearTimeout(fetchTimer);
          console.log(`[Pipeline:${stepId}/stream] Fetch returned status: ${apiResp.status}`);

          if (!apiResp.ok) {
            const errText = await apiResp.text().catch(() => '');
            throw new Error(`${currentProvider} API error: ${apiResp.status} ${errText}`);
          }

          const reader = apiResp.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let fullThinking = '';
          let inputTokens = 0;
          let outputTokens = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

            for (const line of lines) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.reasoning_content) {
                  fullThinking += delta.reasoning_content;
                  write({ type: 'thinking', content: delta.reasoning_content });
                } else if (delta?.content) {
                  fullText += delta.content;
                  write({ type: 'chunk', content: delta.content });
                }

                if (parsed.usage) {
                  inputTokens = parsed.usage.prompt_tokens || 0;
                  outputTokens = parsed.usage.completion_tokens || 0;
                }
              } catch {}
            }
          }

          write({ type: 'done', fullText, fullThinking: fullThinking || null, tokens: { input: inputTokens, output: outputTokens } });

          // Write back generated screenplay to project-context for cross-episode continuity
          if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && fullText) {
            const epIdx = req.body.episodeIndex;
            writeProjectContext('_public', req.body.projectId, {
              screenplays: { [epIdx]: fullText }
            }).catch(err => console.error(`[Pipeline:screenplay/stream] Context writeback failed:`, err.message));
            console.log(`[Pipeline:screenplay/stream] Wrote back screenplay for episode ${epIdx}`);
          }
        }
      } catch (err) {
        console.error(`[Pipeline:${stepId}/stream] Error:`, err.message);
        write({ type: 'error', error: err.message });
      }

      if (!res.writableEnded) res.end();
    });
  }
}
