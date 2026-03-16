import { PIPELINE_STEPS } from '../config.js';
import { buildPipelinePrompt } from '../services/prompt-builder.js';

export function registerStreamRoutes(router, deps) {
  const { requireAuth } = deps;

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}/stream`, requireAuth, async (req, res) => {
      console.log(`[Pipeline:${stepId}/stream] Request received, body keys: ${Object.keys(req.body).join(',')}`);

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      let closed = false;
      req.on('close', () => { closed = true; });

      const write = (data) => {
        if (!closed) {
          try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
        }
      };

      try {
        const { systemPrompt, userMessage, agentId } = buildPipelinePrompt(stepId, req.body, deps);
        console.log(`[Pipeline:${stepId}/stream] Calling ${agentId}, prompt length: ${systemPrompt.length + userMessage.length}`);

        // Determine provider
        const currentProvider = process.env.AI_PROVIDER || 'deepseek';
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
        } else {
          // OpenAI-compatible (DeepSeek etc.) - direct streaming
          const providerName = currentProvider.toUpperCase();
          const apiKey = process.env[`${providerName}_API_KEY`] || process.env.DEEPSEEK_API_KEY;
          const baseUrl = PROVIDERS?.[currentProvider]?.baseUrl || 'https://api.deepseek.com';
          const model = PROVIDERS?.[currentProvider]?.models?.standard || 'deepseek-chat';

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
        }
      } catch (err) {
        console.error(`[Pipeline:${stepId}/stream] Error:`, err.message);
        write({ type: 'error', error: err.message });
      }

      if (!closed) res.end();
    });
  }
}
