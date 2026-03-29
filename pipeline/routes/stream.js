import { PIPELINE_STEPS } from '../config.js';
import { buildPipelinePrompt } from '../services/prompt-builder.js';
import { readProjectContext, writeProjectContext } from '../services/project-context.js';
import { normalizePipelineStepOutput } from '../services/output-normalizer.js';
import { buildDeterministicBreakdownCsv, shouldUseDeterministicBreakdownFallback } from '../services/deterministic-breakdown.js';
import { buildDeterministicCharacterCostume, shouldPreferDeterministicCharacterCostume } from '../services/deterministic-character-costume.js';
import { ensureNovelTextFromAttachment } from '../services/attachment-to-text.js';
import {
  attachResponseLogging,
  createRequestLogger,
  summarizeError,
  summarizeNormalization,
  summarizePipelineBody,
  summarizeTokens
} from '../utils/logger.js';

const PIPELINE_THINKING_HINTS = {
  'extract-bible': '正在抽取世界观、角色关系与核心规则。',
  breakdown: '正在分析原文结构并拆解剧集节奏。',
  screenplay: '正在根据当前剧集映射撰写可拍剧本。',
  storyboard: '正在把剧本拆成镜头级分镜。',
  'extract-assets': '正在从当前内容中提取角色、场景和道具。',
  'design-characters': '正在汇总角色设定、服装关系与跨集出场信息。'
};

class ThinkingStreamDetector {
  constructor() {
    this.buffer = '';
    this.inThinking = false;
  }

  feed(chunk) {
    const events = [];
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (!this.inThinking) {
        const openIdx = this.buffer.indexOf('<thinking>');
        if (openIdx === -1) {
          const safeCut = this.buffer.length > 10 ? this.buffer.length - 10 : 0;
          if (safeCut > 0) {
            events.push({ type: 'content', text: this.buffer.substring(0, safeCut) });
            this.buffer = this.buffer.substring(safeCut);
          }
          break;
        }

        if (openIdx > 0) {
          events.push({ type: 'content', text: this.buffer.substring(0, openIdx) });
        }
        this.buffer = this.buffer.substring(openIdx + 10);
        this.inThinking = true;
      } else {
        const closeIdx = this.buffer.indexOf('</thinking>');
        if (closeIdx === -1) {
          const safeCut = this.buffer.length > 11 ? this.buffer.length - 11 : 0;
          if (safeCut > 0) {
            events.push({ type: 'thinking', text: this.buffer.substring(0, safeCut) });
            this.buffer = this.buffer.substring(safeCut);
          }
          break;
        }

        if (closeIdx > 0) {
          events.push({ type: 'thinking', text: this.buffer.substring(0, closeIdx) });
        }
        this.buffer = this.buffer.substring(closeIdx + 11);
        this.inThinking = false;
      }
    }

    return events;
  }

  flush() {
    if (!this.buffer.length) {
      return [];
    }
    const events = [{ type: this.inThinking ? 'thinking' : 'content', text: this.buffer }];
    this.buffer = '';
    return events;
  }
}

function injectProjectContext(reqBody, ctx, logger) {
  const disabledContextKeys = new Set(Array.isArray(reqBody?.disableContextKeys) ? reqBody.disableContextKeys : []);
  const injectedKeys = [];

  for (const [k, v] of Object.entries(ctx || {})) {
    if (disabledContextKeys.has(k)) continue;
    if (reqBody[k] === undefined && v != null) {
      reqBody[k] = v;
      injectedKeys.push(k);
    }
  }

  logger.info('Injected project context', {
    injectedKeys,
    disabledContextKeys: Array.from(disabledContextKeys)
  });
}

export function registerStreamRoutes(router, deps) {

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}/stream`, async (req, res) => {
      const requestLogger = createRequestLogger(req, res, {
        route: 'pipeline.stream',
        stepId
      });
      const startedAt = attachResponseLogging(req, res, requestLogger);

      requestLogger.info('Pipeline stream request received', {
        request: summarizePipelineBody(req.body)
      });

      // Auto-inject project context when projectId is provided
      if (req.body.projectId) {
        const userId = '_public';
        const ctx = readProjectContext(userId, req.body.projectId);
        if (ctx) {
          injectProjectContext(req.body, ctx, requestLogger);
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

      const writeDeterministicCharacterCostume = (reason) => {
        const deterministicAssets = buildDeterministicCharacterCostume(req.body);
        requestLogger.warn('Used deterministic character costume stream fallback', {
          reason,
          durationMs: Date.now() - startedAt
        });
        write({
          type: 'thinking',
          content: reason || '角色设计改为本地确定性生成，避免流式返回无效内容。'
        });
        write({
          type: 'done',
          fullText: JSON.stringify(deterministicAssets),
          fullThinking: null,
          tokens: { input: 0, output: 0 },
          agent: 'deterministic_character_costume_fallback',
          provider: 'deterministic-local'
        });
      };

      try {
        const initialThinking = PIPELINE_THINKING_HINTS[stepId];
        if (initialThinking) {
          write({ type: 'thinking', content: initialThinking });
        }

        if ((stepId === 'extract-bible' || stepId === 'breakdown') && !String(req.body?.novelText || '').trim()) {
          await ensureNovelTextFromAttachment(req.body, {
            logger: requestLogger.child({ phase: 'attachment' })
          });
        }

        if (stepId === 'design-characters' && shouldPreferDeterministicCharacterCostume(req.body)) {
          // DashScope long-form character-costume streaming is known to emit invalid zero chunks here.
          writeDeterministicCharacterCostume('角色设计改为本地确定性生成，避免长文本流式返回无效内容。');
          if (!res.writableEnded) res.end();
          return;
        }

        const { systemPrompt, userMessage, agentId } = buildPipelinePrompt(stepId, req.body, deps);
        requestLogger.info('Dispatching pipeline stream call', {
          agentId,
          systemPromptLength: systemPrompt.length,
          userMessageLength: userMessage.length
        });

        // Determine provider
        const currentProvider = req.body.provider || process.env.AI_PROVIDER || 'dashscope';
        const PROVIDERS = deps._PROVIDERS || null;
        let thinkingStarted = false;
        let contentStarted = false;

        if (currentProvider === 'anthropic' && deps.anthropic) {
          // Anthropic SDK streaming
          const createParams = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            stream: true
          };
          requestLogger.info('Starting anthropic streaming request', {
            provider: currentProvider,
            model: createParams.model
          });
          const stream = deps.anthropic.messages.stream(createParams);
          let fullText = '';
          let fullThinking = '';

          stream.on('thinking', (thinking) => {
            fullThinking += thinking;
            if (!thinkingStarted) {
              thinkingStarted = true;
              requestLogger.info('Thinking stream started', {
                firstChunkLength: thinking.length,
                provider: currentProvider
              });
            }
            write({ type: 'thinking', content: thinking });
          });
          stream.on('text', (text) => {
            fullText += text;
             if (!contentStarted) {
              contentStarted = true;
              requestLogger.info('Content stream started', {
                firstChunkLength: text.length,
                provider: currentProvider
              });
            }
            write({ type: 'chunk', content: text });
          });

          const finalMessage = await stream.finalMessage();
          const tokens = {
            input: finalMessage.usage?.input_tokens || 0,
            output: finalMessage.usage?.output_tokens || 0
          };
          const normalized = normalizePipelineStepOutput(stepId, fullText, req.body);
          if (normalized.error) {
            if (stepId === 'design-characters') {
              writeDeterministicCharacterCostume('角色设计模型结果解析失败，已自动切换为本地确定性生成。');
              if (!res.writableEnded) res.end();
              return;
            }
            requestLogger.warn('Anthropic stream normalization failed', {
              provider: currentProvider,
              model: createParams.model,
              tokens: summarizeTokens(tokens),
              normalization: summarizeNormalization(normalized),
              durationMs: Date.now() - startedAt
            });
            write({ type: 'error', error: normalized.error, details: normalized.details, raw: normalized.raw });
            if (!res.writableEnded) res.end();
            return;
          }
          fullText = normalized.result;
          requestLogger.info('Anthropic stream completed', {
            provider: currentProvider,
            model: createParams.model,
            tokens: summarizeTokens(tokens),
            normalization: summarizeNormalization(normalized),
            durationMs: Date.now() - startedAt
          });
          write({ type: 'done', fullText, fullThinking: fullThinking || null, tokens });

          // Write back generated screenplay to project-context for cross-episode continuity
          if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && fullText) {
            const epIdx = req.body.episodeIndex;
            writeProjectContext('_public', req.body.projectId, {
              screenplays: { [epIdx]: fullText }
            })
              .then(() => {
                requestLogger.info('Screenplay written back to project context', {
                  episodeIndex: epIdx
                });
              })
              .catch((err) => {
                requestLogger.error('Screenplay context writeback failed', {
                  episodeIndex: epIdx,
                  error: summarizeError(err)
                });
              });
          }
        } else {
          // OpenAI-compatible (DeepSeek etc.) - direct streaming
          const providerName = currentProvider.toUpperCase();
          const apiKey = deps.getApiKeyForProvider ? deps.getApiKeyForProvider(currentProvider) : process.env[`${providerName}_API_KEY`];
          const baseUrl = PROVIDERS?.[currentProvider]?.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
          // Use 'best' model for long-output agents (same as sync callClaude logic)
          const longOutputAgents = ['storyboard', 'storyboard_csv', 'novelist', 'screenwriter', 'narrative', 'story_architect', 'episode_planner', 'aggregate', 'story_breakdown_pack'];
          const modelTier = longOutputAgents.includes(agentId) ? 'best' : 'standard';
          const model = PROVIDERS?.[currentProvider]?.models?.[modelTier] || PROVIDERS?.[currentProvider]?.models?.standard || 'qwen-max';

          requestLogger.info('Starting compatible streaming request', {
            provider: currentProvider,
            model,
            modelTier,
            baseUrl,
            hasApiKey: Boolean(apiKey)
          });

          const fetchUrl = `${baseUrl}/chat/completions`;
          requestLogger.info('Calling provider stream endpoint', {
            provider: currentProvider,
            model,
            fetchUrl
          });
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
          requestLogger.info('Provider stream endpoint responded', {
            provider: currentProvider,
            model,
            statusCode: apiResp.status
          });

          if (!apiResp.ok) {
            const errText = await apiResp.text().catch(() => '');
            throw new Error(`${currentProvider} API error: ${apiResp.status} ${errText}`);
          }

          const reader = apiResp.body.getReader();
          const decoder = new TextDecoder();
          const detector = new ThinkingStreamDetector();
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
                  if (!thinkingStarted) {
                    thinkingStarted = true;
                    requestLogger.info('Thinking stream started', {
                      provider: currentProvider,
                      model,
                      firstChunkLength: delta.reasoning_content.length
                    });
                  }
                  write({ type: 'thinking', content: delta.reasoning_content });
                } else if (delta?.content) {
                  const events = detector.feed(delta.content);
                  for (const event of events) {
                    if (event.type === 'thinking') {
                      fullThinking += event.text;
                      if (!thinkingStarted) {
                        thinkingStarted = true;
                        requestLogger.info('Thinking stream started', {
                          provider: currentProvider,
                          model,
                          firstChunkLength: event.text.length
                        });
                      }
                      write({ type: 'thinking', content: event.text });
                    } else {
                      fullText += event.text;
                      if (!contentStarted) {
                        contentStarted = true;
                        requestLogger.info('Content stream started', {
                          provider: currentProvider,
                          model,
                          firstChunkLength: event.text.length
                        });
                      }
                      write({ type: 'chunk', content: event.text });
                    }
                  }
                }

                if (parsed.usage) {
                  inputTokens = parsed.usage.prompt_tokens || 0;
                  outputTokens = parsed.usage.completion_tokens || 0;
                }
              } catch {}
            }
          }

          for (const event of detector.flush()) {
            if (event.type === 'thinking') {
              fullThinking += event.text;
              write({ type: 'thinking', content: event.text });
            } else {
              fullText += event.text;
              write({ type: 'chunk', content: event.text });
            }
          }

          const normalized = normalizePipelineStepOutput(stepId, fullText, req.body);
          if (normalized.error) {
            if (stepId === 'design-characters') {
              writeDeterministicCharacterCostume('角色设计模型结果解析失败，已自动切换为本地确定性生成。');
              if (!res.writableEnded) res.end();
              return;
            }
            requestLogger.warn('Compatible stream normalization failed', {
              provider: currentProvider,
              model,
              tokens: summarizeTokens({ input: inputTokens, output: outputTokens }),
              normalization: summarizeNormalization(normalized),
              durationMs: Date.now() - startedAt
            });
            write({ type: 'error', error: normalized.error, details: normalized.details, raw: normalized.raw });
            if (!res.writableEnded) res.end();
            return;
          }
          fullText = normalized.result;
          requestLogger.info('Compatible stream completed', {
            provider: currentProvider,
            model,
            tokens: summarizeTokens({ input: inputTokens, output: outputTokens }),
            normalization: summarizeNormalization(normalized),
            durationMs: Date.now() - startedAt
          });
          write({ type: 'done', fullText, fullThinking: fullThinking || null, tokens: { input: inputTokens, output: outputTokens } });

          // Write back generated screenplay to project-context for cross-episode continuity
          if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && fullText) {
            const epIdx = req.body.episodeIndex;
            writeProjectContext('_public', req.body.projectId, {
              screenplays: { [epIdx]: fullText }
            })
              .then(() => {
                requestLogger.info('Screenplay written back to project context', {
                  episodeIndex: epIdx
                });
              })
              .catch((err) => {
                requestLogger.error('Screenplay context writeback failed', {
                  episodeIndex: epIdx,
                  error: summarizeError(err)
                });
              });
          }
        }
      } catch (err) {
        if (stepId === 'breakdown' && shouldUseDeterministicBreakdownFallback(err)) {
          try {
            const fallbackCsv = buildDeterministicBreakdownCsv(req.body, deps);
            write({
              type: 'done',
              fullText: fallbackCsv,
              fullThinking: null,
              tokens: { input: 0, output: 0 },
              agent: 'deterministic_breakdown_fallback',
              provider: 'deterministic-local'
            });
            requestLogger.warn('Used deterministic breakdown stream fallback', {
              error: summarizeError(err),
              durationMs: Date.now() - startedAt
            });
            if (!res.writableEnded) res.end();
            return;
          } catch (fallbackErr) {
            requestLogger.error('Deterministic breakdown stream fallback failed', {
              error: summarizeError(fallbackErr),
              durationMs: Date.now() - startedAt
            });
          }
        }

        requestLogger.error('Pipeline stream request failed', {
          error: summarizeError(err),
          request: summarizePipelineBody(req.body),
          durationMs: Date.now() - startedAt
        });
        write({ type: 'error', error: err.message });
      }

      if (!res.writableEnded) res.end();
    });
  }
}
