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

function sumTokens(...tokenSets) {
  return tokenSets.reduce((acc, tokens) => ({
    input: acc.input + (tokens?.input || 0),
    output: acc.output + (tokens?.output || 0)
  }), { input: 0, output: 0 });
}

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function buildExtractAssetsRepairPrompt(body, normalized, deps = {}) {
  const episodeId = Number.isInteger(body?.episodeIndex)
    ? `E${String(body.episodeIndex + 1).padStart(3, '0')}`
    : null;
  const inputHasChinese = hasChineseText(body?.screenplay || '');
  const agentId = 'asset_extractor_repair';
  const agent = deps?.AGENTS?.[agentId];
  const skillsContent = agent?.skills && typeof deps?.loadAgentSkills === 'function'
    ? deps.loadAgentSkills(agent.skills)
    : '';
  const systemPrompt = agent
    ? `${agent.prompt}\n\n---\n## 专业方法论参考（必须运用以下方法分析用户内容）：\n${skillsContent}\n---\n\n**重要：请基于以上方法论修复用户提供的 JSON。只修复 schema、命名、引用与归类问题，不要改写剧情，不要新增设定。**`
    : '';
  const userMessage = inputHasChinese
    ? `当前任务：修复 extract-assets 的不合法 JSON。\n\n请严格遵守当前 repair agent 已挂载的 skills 中关于 5 库 schema、道具抽取、场景抽取、语言跟随的全部规则，只修复 schema、命名、引用与场景/道具归类问题，不要改写剧情。\n${episodeId ? `当前集数：${episodeId}\n` : ''}\n当前剧本：\n${body.screenplay || ''}\n\n校验错误：\n${JSON.stringify(normalized.details?.errors || [], null, 2)}\n\n待修复 JSON：\n${normalized.raw || ''}`
    : `Current task: repair invalid extract-assets JSON.\n\nStrictly follow the currently loaded skills on the repair agent for the 5-library schema, prop extraction, scene extraction, and language-following rules. Only fix schema, naming, references, and scene/prop classification issues. Do not rewrite the story.\n${episodeId ? `Current episode: ${episodeId}\n` : ''}\nCurrent screenplay:\n${body.screenplay || ''}\n\nValidation errors:\n${JSON.stringify(normalized.details?.errors || [], null, 2)}\n\nBroken JSON to repair:\n${normalized.raw || ''}`;
  return {
    systemPrompt,
    userMessage,
    agentId
  };
}

function buildStoryboardRepairPrompt(body, normalized, deps = {}) {
  const inputHasChinese = hasChineseText(body?.screenplay || '');
  const agentId = 'storyboard_repair';
  const agent = deps?.AGENTS?.[agentId];
  const skillsContent = agent?.skills && typeof deps?.loadAgentSkills === 'function'
    ? deps.loadAgentSkills(agent.skills)
    : '';
  const systemPrompt = agent
    ? `${agent.prompt}\n\n---\n## 专业方法论参考（必须运用以下方法分析用户内容）：\n${skillsContent}\n---\n\n**重要：请基于以上方法论修复用户提供的 CSV。只修复 contract、列级缺失、scene/prop 归类与 canon 复用问题，不要改写剧本。**`
    : '';
  const assets = body?.assets || body?.assetLibrary;
  const assetsText = assets ? `\n\n可用资产 / Available assets:\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}` : '';
  const userMessage = inputHasChinese
    ? `当前任务：修复 storyboard 的不合法 CSV。\n\n请严格遵守当前 repair agent 已挂载的 storyboard skills 与 repair rules，只做最小修复，不要重写整份分镜。\n\n当前剧本：\n${body.screenplay || ''}${assetsText}\n\n校验错误：\n${JSON.stringify(normalized.details || {}, null, 2)}\n\n待修复 CSV：\n${normalized.raw || ''}`
    : `Current task: repair invalid storyboard CSV.\n\nStrictly follow the currently loaded storyboard skills and repair rules on the repair agent. Make the minimum necessary fixes only; do not regenerate the whole storyboard.\n\nCurrent screenplay:\n${body.screenplay || ''}${assetsText}\n\nValidation errors:\n${JSON.stringify(normalized.details || {}, null, 2)}\n\nBroken CSV to repair:\n${normalized.raw || ''}`;
  return {
    systemPrompt,
    userMessage,
    agentId
  };
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

export function registerSyncRoutes(router, deps) {
  const { callClaude, extractThinking, sanitizeForJson } = deps;

  for (const stepId of PIPELINE_STEPS) {
    router.post(`/${stepId}`, async (req, res) => {
      const requestLogger = createRequestLogger(req, res, {
        route: 'pipeline.sync',
        stepId
      });
      const startedAt = attachResponseLogging(req, res, requestLogger);

      requestLogger.info('Pipeline sync request received', {
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

      try {
        if ((stepId === 'extract-bible' || stepId === 'breakdown') && !String(req.body?.novelText || '').trim()) {
          await ensureNovelTextFromAttachment(req.body, {
            logger: requestLogger.child({ phase: 'attachment' })
          });
        }

        if (stepId === 'design-characters' && shouldPreferDeterministicCharacterCostume(req.body)) {
          const deterministicAssets = buildDeterministicCharacterCostume(req.body);
          const payload = {
            result: JSON.stringify(deterministicAssets),
            reasoning: null,
            tokens: { input: 0, output: 0 },
            step: stepId,
            agent: 'deterministic_character_costume_fallback',
            provider: 'deterministic-local'
          };
          const body = JSON.stringify(payload);
          res.status(200);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
          res.end(body);
          requestLogger.warn('Used deterministic character costume path', {
            reason: 'long_dashscope_character_costume',
            durationMs: Date.now() - startedAt
          });
          return;
        }

        const { systemPrompt, userMessage, agentId, options } = buildPipelinePrompt(stepId, req.body, deps);
        const lockedProvider = req.body.provider || (typeof deps.getCurrentProvider === 'function' ? deps.getCurrentProvider() : '');
        const requestOptions = lockedProvider
          ? { ...options, provider: lockedProvider, disableFallback: true }
          : options;

        requestLogger.info('Dispatching pipeline sync call', {
          agentId,
          provider: lockedProvider || null,
          systemPromptLength: systemPrompt.length,
          userMessageLength: userMessage.length,
          requestOptions
        });

        const result = await callClaude(systemPrompt, userMessage, agentId, requestOptions);
        let effectiveResult = result;

        // Extract thinking
        const { thinking, content } = extractThinking(result.text);
        const reasoning = result.reasoning || thinking;

        // Sanitize LLM output to prevent control characters breaking JSON
        const sanitize = sanitizeForJson || (t => t);
        let normalized = normalizePipelineStepOutput(stepId, sanitize(content), req.body);

        requestLogger.info('Primary model response received', {
          agentId,
          provider: result.provider || lockedProvider || null,
          tokens: summarizeTokens(result.tokens),
          normalization: summarizeNormalization(normalized)
        });

        if (stepId === 'extract-assets' && normalized.error) {
          requestLogger.warn('Extract-assets normalization failed; invoking repair agent', {
            normalization: summarizeNormalization(normalized)
          });
          const repairPrompt = buildExtractAssetsRepairPrompt(req.body, normalized, deps);
          const repairResult = await callClaude(
            repairPrompt.systemPrompt,
            repairPrompt.userMessage,
            repairPrompt.agentId,
            requestOptions
          );
          const { content: repairedContent } = extractThinking(repairResult.text || '');
          normalized = normalizePipelineStepOutput(stepId, sanitize(repairedContent), req.body);
          effectiveResult = {
            ...effectiveResult,
            tokens: sumTokens(result.tokens, repairResult.tokens),
            provider: repairResult.provider || result.provider
          };
          requestLogger.info('Extract-assets repair completed', {
            repairAgentId: repairPrompt.agentId,
            provider: repairResult.provider || null,
            tokens: summarizeTokens(effectiveResult.tokens),
            normalization: summarizeNormalization(normalized)
          });
        }

        if (stepId === 'storyboard' && normalized.error === 'storyboard_csv_malformed') {
          requestLogger.warn('Storyboard normalization failed; invoking repair agent', {
            normalization: summarizeNormalization(normalized)
          });
          const repairPrompt = buildStoryboardRepairPrompt(req.body, normalized, deps);
          const repairResult = await callClaude(
            repairPrompt.systemPrompt,
            repairPrompt.userMessage,
            repairPrompt.agentId,
            requestOptions
          );
          const { content: repairedContent } = extractThinking(repairResult.text || '');
          normalized = normalizePipelineStepOutput(stepId, sanitize(repairedContent), req.body);
          effectiveResult = {
            ...effectiveResult,
            tokens: sumTokens(result.tokens, repairResult.tokens),
            provider: repairResult.provider || result.provider
          };
          requestLogger.info('Storyboard repair completed', {
            repairAgentId: repairPrompt.agentId,
            provider: repairResult.provider || null,
            tokens: summarizeTokens(effectiveResult.tokens),
            normalization: summarizeNormalization(normalized)
          });
        }

        if (normalized.error) {
          if (stepId === 'design-characters') {
            const deterministicAssets = buildDeterministicCharacterCostume(req.body);
            const payload = {
              result: JSON.stringify(deterministicAssets),
              reasoning: '角色设计模型结果解析失败，已自动切换为本地确定性生成。',
              tokens: { input: 0, output: 0 },
              step: stepId,
              agent: 'deterministic_character_costume_fallback',
              provider: 'deterministic-local'
            };
            const body = JSON.stringify(payload);
            res.status(200);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
            res.end(body);
            requestLogger.warn('Used deterministic character costume fallback after normalization error', {
              normalization: summarizeNormalization(normalized),
              durationMs: Date.now() - startedAt
            });
            return;
          }
          requestLogger.warn('Pipeline sync normalization failed', {
            normalization: summarizeNormalization(normalized),
            durationMs: Date.now() - startedAt
          });
          const payload = {
            error: normalized.error,
            step: stepId,
            details: normalized.details,
            raw: normalized.raw
          };
          const body = JSON.stringify(payload);
          res.status(500);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
          res.end(body);
          return;
        }

        const payload = {
          result: normalized.result,
          reasoning: sanitize(reasoning),
          tokens: effectiveResult.tokens,
          step: stepId,
          agent: agentId,
          provider: effectiveResult.provider || req.body.provider || null
        };

        // Write back generated screenplay to project-context for cross-episode continuity
        if (stepId === 'screenplay' && req.body.projectId && req.body.episodeIndex != null && normalized.result) {
          const epIdx = req.body.episodeIndex;
          writeProjectContext('_public', req.body.projectId, {
            screenplays: { [epIdx]: normalized.result }
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

        requestLogger.info('Pipeline sync request completed', {
          agentId,
          provider: effectiveResult.provider || req.body.provider || null,
          tokens: summarizeTokens(effectiveResult.tokens),
          normalization: summarizeNormalization(normalized),
          durationMs: Date.now() - startedAt
        });

        const body = JSON.stringify(payload);
        res.status(200);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
        res.end(body);
      } catch (err) {
        if (stepId === 'breakdown' && shouldUseDeterministicBreakdownFallback(err)) {
          try {
            const fallbackCsv = buildDeterministicBreakdownCsv(req.body, deps);
            const payload = {
              result: fallbackCsv,
              reasoning: null,
              tokens: { input: 0, output: 0 },
              step: stepId,
              agent: 'deterministic_breakdown_fallback',
              provider: 'deterministic-local'
            };
            const body = JSON.stringify(payload);
            res.status(200);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
            res.end(body);
            requestLogger.warn('Used deterministic breakdown fallback', {
              error: summarizeError(err),
              durationMs: Date.now() - startedAt
            });
            return;
          } catch (fallbackErr) {
            requestLogger.error('Deterministic breakdown fallback failed', {
              error: summarizeError(fallbackErr),
              durationMs: Date.now() - startedAt
            });
          }
        }

        requestLogger.error('Pipeline sync request failed', {
          error: summarizeError(err),
          request: summarizePipelineBody(req.body),
          durationMs: Date.now() - startedAt
        });
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
