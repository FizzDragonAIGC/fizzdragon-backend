import { PIPELINE_AGENT_MAP } from '../config.js';

/**
 * Inject Story Bible context at the top of userMessage.
 * Bible is authoritative — all downstream steps must obey it.
 */
function injectBibleContext(userMessage, storyBible) {
  if (!storyBible) return userMessage;
  const bibleStr = typeof storyBible === 'string' ? storyBible : JSON.stringify(storyBible);
  return `STORY BIBLE (authoritative global context — must obey):\n${bibleStr}\n\n---\n${userMessage}`;
}

/**
 * Extract character pronouns map from Story Bible for screenplay compatibility.
 * Returns { "CharName": "he/him", ... }
 */
function extractPronounsFromBible(storyBible) {
  if (!storyBible?.characters) return null;
  const pronouns = {};
  for (const c of storyBible.characters) {
    if (c.name && c.pronouns) {
      pronouns[c.name] = c.pronouns;
      // Also map aliases
      if (c.aliases) {
        for (const alias of c.aliases) {
          pronouns[alias] = c.pronouns;
        }
      }
    }
  }
  return Object.keys(pronouns).length > 0 ? pronouns : null;
}

export function buildPipelinePrompt(stepId, body, deps) {
  const { AGENTS, loadAgentSkills, needsJsonOutput, buildSourceRanges } = deps;

  const agentId = PIPELINE_AGENT_MAP[stepId];
  if (!agentId) throw new Error(`Unknown pipeline step: ${stepId}`);

  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const skillsContent = loadAgentSkills(agent.skills);
  const systemPrompt = `${agent.prompt}\n\n---\n## 专业方法论参考（必须运用以下方法分析用户内容）：\n${skillsContent}\n---\n\n**重要：请基于以上方法论，深度分析用户提供的内容。你的回答必须体现出对内容的具体理解，不能给出通用的模板回答。**`;

  let userMessage;
  const options = {};

  // Extract storyBible from body (injected by frontend or orchestrator)
  const { storyBible } = body;

  switch (stepId) {
    case 'extract-bible': {
      const { novelText, totalEpisodes, episodeDuration, shotsPerMin, characterNotes, globalDirective, stylePreferences } = body;
      if (!novelText) throw new Error('Missing required field: novelText');
      const truncated = novelText.length > 200000 ? novelText.substring(0, 200000) + '\n...(truncated)' : novelText;

      userMessage = `Extract a compact Story Bible JSON from the following novel.\n\n`;

      // Include project config context
      const configParts = [];
      if (totalEpisodes) configParts.push(`Target episodes: ${totalEpisodes}`);
      if (episodeDuration) configParts.push(`Episode duration: ${episodeDuration}s`);
      if (shotsPerMin) configParts.push(`Shots per minute: ${shotsPerMin}`);
      if (configParts.length) {
        userMessage += `PROJECT CONFIG:\n${configParts.join('\n')}\n\n`;
      }

      // Include user directives
      const directiveParts = [];
      if (characterNotes) directiveParts.push(`CHARACTER NOTES (from user, authoritative):\n${characterNotes}`);
      if (globalDirective) directiveParts.push(`GLOBAL DIRECTIVE (from user, authoritative):\n${globalDirective}`);
      if (stylePreferences) directiveParts.push(`STYLE PREFERENCES (from user):\n${stylePreferences}`);
      if (directiveParts.length) {
        userMessage += `USER DIRECTIVES:\n${directiveParts.join('\n\n')}\n\n`;
      }

      userMessage += `NOVEL TEXT:\n${truncated}`;
      break;
    }

    case 'breakdown': {
      const { novelText, totalEpisodes = 80 } = body;
      if (!novelText) throw new Error('Missing required field: novelText');
      const target = totalEpisodes;
      const truncated = novelText.length > 200000 ? novelText.substring(0, 200000) + '\n...(已截断)' : novelText;
      const segs = buildSourceRanges(truncated, target);
      const indexLines = segs.map((s, i) => {
        const ep = 'E' + String(i + 1).padStart(3, '0');
        return `${ep},${s.startLine}-${s.endLine},${s.title.replace(/,/g, ' ')}`;
      }).join('\n');
      userMessage = `SOURCE RANGE INDEX (ep_id,source_range,segment_title)\n${indexLines}\n\nSTORY CONTENT:\n${truncated}`;
      // Inject bible if present
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    case 'screenplay': {
      const { episodeMappingRow, sourceText, characterPronouns,
              episodeIndex,
              screenwriterMode = 'shootable_90s_pro' } = body;
      if (!episodeMappingRow) throw new Error('Missing required field: episodeMappingRow');
      if (!sourceText) throw new Error('Missing required field: sourceText');

      // ── Auto-build continuity fields from injected project-context ──
      let { allEpisodePlots, previousScreenplay } = body;

      // Build allEpisodePlots from breakdownRows/breakdownHeaders if not provided
      if (!allEpisodePlots && body.breakdownRows && body.breakdownHeaders) {
        const headers = body.breakdownHeaders;
        const rows = body.breakdownRows;
        const plotIdx = headers.indexOf('one_line_plot');
        allEpisodePlots = rows.map((row, i) => {
          const plot = plotIdx >= 0 ? row[plotIdx] : (row[1] || row[0] || '');
          return `E${String(i + 1).padStart(3, '0')}: ${plot}`;
        }).join('\n');
      }

      // Build previousScreenplay from screenplays map if not provided
      if (!previousScreenplay && episodeIndex > 0 && body.screenplays) {
        previousScreenplay = body.screenplays[episodeIndex - 1]
          || body.screenplays[String(episodeIndex - 1)]
          || null;
      }
      const truncated = sourceText.length > 200000 ? sourceText.substring(0, 200000) + '\n...(已截断)' : sourceText;

      // Use pronouns from bible if not explicitly provided
      const effectivePronouns = characterPronouns || extractPronounsFromBible(storyBible);

      if (screenwriterMode === 'shootable_90s_pro') {
        // Detect input language: if episodeMappingRow or sourceText contains Chinese, output in Chinese
        const inputHasChinese = /[\u4e00-\u9fff]/.test(typeof episodeMappingRow === 'string' ? episodeMappingRow : '') || /[\u4e00-\u9fff]/.test(sourceText || '');
        const langDirective = inputHasChinese
          ? `【语言规则】输入内容为中文，你的全部输出必须使用中文。场景描述、画面描述、动作、对白、旁白全部用中文书写。只有格式标记（[Visual]、[SFX/Ambience]、时间码）保持英文。角色名保持原文。\n\n`
          : `【LANGUAGE RULE】Output language MUST match the input language.\n\n`;

        userMessage = `IMPORTANT: You are writing a SHOOTABLE shortdrama screenplay.\n${langDirective}` +
          `PRONOUN CANON (must obey):\n` +
          `- If context.characterPronouns is provided, you MUST follow it strictly (never misgender any character).\n` +
          `- If pronouns for a character are NOT provided, avoid gendered pronouns (he/she). Use the character's name or they/them.\n\n` +
          `MODE: shootable_90s_pro\n` +
          `HARD TEMPLATE: Output exactly 6 time blocks with headers:\n` +
          `0:00-0:15\n0:15-0:45\n0:45-1:05\n1:05-1:25\n1:25-1:40\n1:40-1:45\n\n` +
          `For EACH time block you MUST include:\n- at least 2 lines starting with [Visual]\n- at least 1 line starting with [SFX/Ambience]\n- at least 1 externalized beat (action or dialogue). Dialogue format: NAME: line\n\n` +
          `VO RULE: Max 2 VO lines total for the whole episode. VO cannot explain lore/worldbuilding.\n` +
          `NO AFTER NOTES: No tables/checklists/writer notes.\n\n` +
          `EPISODE MAPPING ROW (authoritative, do not deviate):\n${typeof episodeMappingRow === 'string' ? episodeMappingRow : JSON.stringify(episodeMappingRow)}\n\n` +
          `CHARACTER PRONOUNS (JSON, authoritative; if absent, do NOT use he/she for that character):\n${effectivePronouns ? JSON.stringify(effectivePronouns) : '{ }'}\n\n` +
          `STORY CONTENT (source excerpt/range referenced by mapping):\n${truncated}`;
      } else {
        userMessage = `请根据以下剧情大纲编写一集短剧剧本：\n\n剧情大纲：${typeof episodeMappingRow === 'string' ? episodeMappingRow : JSON.stringify(episodeMappingRow)}\n\n原文：\n${truncated}`;
      }

      // 注入全集大纲（让 LLM 知道整体弧线）
      if (allEpisodePlots) {
        userMessage += `\n\nFULL SERIES OUTLINE (for arc awareness, do NOT repeat prior episodes):\n${allEpisodePlots}\n`;
      }

      // 注入全集大纲和上一集剧本时，强调语言跟随规则
      if (previousScreenplay) {
        const prev = previousScreenplay.length > 3000
          ? previousScreenplay.substring(0, 3000) + '\n...(truncated)'
          : previousScreenplay;
        userMessage += `\n\nPREVIOUS EPISODE SCREENPLAY (maintain continuity — do NOT repeat scenes, pick up where this left off):\n${prev}\n`;
      }

      // Inject bible if present
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);

      // Re-emphasize language rule at the end (critical for models that drift to English)
      if (/[\u4e00-\u9fff]/.test(typeof episodeMappingRow === 'string' ? episodeMappingRow : '') || /[\u4e00-\u9fff]/.test(sourceText || '')) {
        userMessage += `\n\n【再次强调语言规则】你必须用中文写剧本正文。场景描述、画面描述、动作、对白用中文。上一集剧本如果是英文，请忽略其语言，你仍然必须用中文输出。格式标记 [Visual]/[SFX/Ambience] 和时间码保持英文。`;
      }
      break;
    }

    case 'extract-assets': {
      const { screenplay } = body;
      if (!screenplay) throw new Error('Missing required field: screenplay');
      userMessage = `内容：\n${screenplay}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    case 'qc-assets': {
      const { assets } = body;
      if (!assets) throw new Error('Missing required field: assets');
      userMessage = `内容：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    case 'storyboard': {
      const { screenplay, assets } = body;
      if (!screenplay) throw new Error('Missing required field: screenplay');
      const assetsContext = assets ? `\n\n可用资产：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}` : '';
      userMessage = `内容：\n${screenplay}${assetsContext}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    case 'design-characters': {
      const { screenplay, screenplays: screenplaysObj, assets, totalEpisodes = 80, episodeDuration = 60, globalDirective } = body;
      // 优先使用 screenplaysObj（多集带ID），兼容旧的单 screenplay
      let fullText;
      if (screenplaysObj && typeof screenplaysObj === 'object') {
        fullText = Object.entries(screenplaysObj)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([idx, text]) => `=== E${String(Number(idx) + 1).padStart(3, '0')}: 第${Number(idx) + 1}集 ===\n${text}`)
          .join('\n\n');
      } else if (screenplay) {
        fullText = screenplay;
      } else {
        throw new Error('Missing required field: screenplay or screenplays');
      }
      userMessage = `项目参数：总集数=${totalEpisodes}，每集=${episodeDuration}秒\n\n`;
      if (globalDirective) userMessage += `总提示词：${globalDirective}\n\n`;
      userMessage += `以下是全部剧本（含集号标记），请提取角色和服装资产库（4张表），episode_id/scene_id 必须对应标记中的集号：\n${fullText}`;
      if (assets) userMessage += `\n\n已有基础资产：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    default:
      throw new Error(`Unhandled pipeline step: ${stepId}`);
  }

  // Append format instruction
  if (needsJsonOutput(agentId)) {
    userMessage += '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字。只输出{开头}结尾的JSON。**';
  } else {
    userMessage += '\n\n**重要：只输出最终正文（自然语言），不要JSON，不要代码块，不要解释/思考过程；输出语言必须跟随输入语言。**';
  }

  return { systemPrompt, userMessage, agentId, options };
}
