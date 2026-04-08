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

function compactText(text, maxLength = 120) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function buildSegmentDigest(novelText, segs) {
  const lines = String(novelText || '').split(/\r?\n/);
  return segs.map((seg, index) => {
    const epId = `E${String(index + 1).padStart(3, '0')}`;
    const previewLines = lines
      .slice(Math.max(0, seg.startLine - 1), Math.min(lines.length, seg.startLine + 2))
      .map((line) => compactText(line, 60))
      .filter(Boolean);
    const preview = compactText(previewLines.join(' / '), 160) || compactText(seg.title, 120) || '无预览';
    return `${epId},${seg.startLine}-${seg.endLine},${preview}`;
  }).join('\n');
}

function extractCanonNames(storyBible) {
  const characters = Array.isArray(storyBible?.characters)
    ? storyBible.characters
    : Array.isArray(storyBible?.character_library)
      ? storyBible.character_library
      : [];
  return characters
    .map((character) => character?.name)
    .filter(Boolean)
    .slice(0, 30)
    .join('、');
}

function normalizeSceneText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStoryboardSceneCanon(assets, episodeIndex) {
  const assetPayload = assets && typeof assets === 'object' && !Array.isArray(assets)
    ? assets
    : null;
  if (!assetPayload) return null;

  const targetEpisodeId = Number.isInteger(episodeIndex)
    ? `E${String(episodeIndex + 1).padStart(3, '0')}`
    : '';

  const sceneLibrary = Array.isArray(assetPayload.scene_library) ? assetPayload.scene_library : [];
  const allLinks = Array.isArray(assetPayload.episode_scene_asset_links) ? assetPayload.episode_scene_asset_links : [];
  const links = targetEpisodeId
    ? allLinks.filter((link) => String(link?.episode_id || '').trim() === targetEpisodeId)
    : allLinks;

  const sceneNames = new Set();
  links.forEach((link) => {
    const slugline = normalizeSceneText(link?.scene_name || link?.slugline);
    if (slugline) sceneNames.add(slugline);
  });

  sceneLibrary.forEach((scene) => {
    const name = normalizeSceneText(scene?.name || scene?.slugline);
    if (!name) return;
    if (!links.length || links.some((link) => {
      const linkSceneSetId = normalizeSceneText(link?.scene_set_id);
      const sceneSetId = normalizeSceneText(scene?.scene_set_id);
      if (linkSceneSetId && sceneSetId) {
        return linkSceneSetId === sceneSetId;
      }
      const slugline = normalizeSceneText(link?.scene_name || link?.slugline);
      return slugline && slugline === name;
    })) {
      sceneNames.add(name);
    }
  });

  const orderedNames = Array.from(sceneNames).filter(Boolean);
  if (!orderedNames.length) return null;

  return {
    targetEpisodeId,
    sceneNames: orderedNames
  };
}

function formatTimestamp(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function resolveEpisodeDurationMinutes(body) {
  const candidates = [
    body?.episodeDuration,
    body?.projectConfig?.episodeDuration,
    body?.minutesPerEpisode
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function buildShootableTimeBlocks(episodeDurationMinutes) {
  const fallbackBreakpoints = [15, 45, 65, 85, 100, 105];
  const totalSeconds = episodeDurationMinutes
    ? Math.max(30, Math.round(episodeDurationMinutes * 60))
    : 105;

  if (totalSeconds === 105) {
    return fallbackBreakpoints.map((end, index) => {
      const start = index === 0 ? 0 : fallbackBreakpoints[index - 1];
      return `${formatTimestamp(start)}-${formatTimestamp(end)}`;
    });
  }

  const ratioBreakpoints = [15 / 105, 45 / 105, 65 / 105, 85 / 105, 100 / 105];
  const stepUnit = totalSeconds >= 60 ? 5 : 1;
  const breakpoints = [];
  let previous = 0;

  for (let index = 0; index < ratioBreakpoints.length; index += 1) {
    const raw = ratioBreakpoints[index] * totalSeconds;
    let candidate = Math.round(raw / stepUnit) * stepUnit;
    const remainingSlots = ratioBreakpoints.length - index;
    const minimumEnd = previous + stepUnit;
    const maximumEnd = totalSeconds - (remainingSlots * stepUnit);
    candidate = Math.max(minimumEnd, candidate);
    candidate = Math.min(maximumEnd, candidate);
    breakpoints.push(candidate);
    previous = candidate;
  }
  breakpoints.push(totalSeconds);

  return breakpoints.map((end, index) => {
    const start = index === 0 ? 0 : breakpoints[index - 1];
    return `${formatTimestamp(start)}-${formatTimestamp(end)}`;
  });
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
      // 语言只跟随主体剧本/小说正文，不受附加备注字段干扰
      const inputHasChinese = hasChineseText(novelText);

      userMessage = inputHasChinese
        ? '请从下面的小说中提炼一个紧凑的 Story Bible JSON。\n\n【语言规则】输入内容为中文，你的字段值必须全部使用中文。不要翻译成英文，不要中英混写；只有 JSON 字段名保持既定 schema 形式。\n\n'
        : 'Extract a compact Story Bible JSON from the following novel.\n\nLANGUAGE RULE: Output language must follow the input language. If the source is English, keep every field value in English only.\n\n';

      // Include project config context
      const configParts = [];
      if (totalEpisodes) configParts.push(inputHasChinese ? `目标集数：${totalEpisodes}` : `Target episodes: ${totalEpisodes}`);
      if (episodeDuration) configParts.push(inputHasChinese ? `每集时长：${episodeDuration} 分钟` : `Episode duration: ${episodeDuration} minutes`);
      if (shotsPerMin) configParts.push(inputHasChinese ? `每分钟镜头数：${shotsPerMin}` : `Shots per minute: ${shotsPerMin}`);
      if (configParts.length) {
        userMessage += `${inputHasChinese ? '项目配置' : 'PROJECT CONFIG'}:\n${configParts.join('\n')}\n\n`;
      }

      // Include user directives
      const directiveParts = [];
      if (characterNotes) directiveParts.push(`${inputHasChinese ? '角色备注（来自用户，优先级最高）' : 'CHARACTER NOTES (from user, authoritative)'}:\n${characterNotes}`);
      if (globalDirective) directiveParts.push(`${inputHasChinese ? '全局要求（来自用户，优先级最高）' : 'GLOBAL DIRECTIVE (from user, authoritative)'}:\n${globalDirective}`);
      if (stylePreferences) directiveParts.push(`${inputHasChinese ? '风格偏好（来自用户）' : 'STYLE PREFERENCES (from user)'}:\n${stylePreferences}`);
      if (directiveParts.length) {
        userMessage += `${inputHasChinese ? '用户指令' : 'USER DIRECTIVES'}:\n${directiveParts.join('\n\n')}\n\n`;
      }

      userMessage += `${inputHasChinese ? '小说正文' : 'NOVEL TEXT'}:\n${truncated}`;
      break;
    }

    case 'breakdown': {
      const { novelText, totalEpisodes = 80, breakdownStartEpisode, breakdownEndEpisode } = body;
      if (!novelText) throw new Error('Missing required field: novelText');
      const target = totalEpisodes;
      const segs = buildSourceRanges(novelText, target);
      const requestedStart = Math.max(1, Number.isFinite(Number(breakdownStartEpisode)) ? Number(breakdownStartEpisode) : 1);
      const requestedEnd = Math.min(
        target,
        Number.isFinite(Number(breakdownEndEpisode)) ? Number(breakdownEndEpisode) : target
      );
      const batchSegs = segs.slice(requestedStart - 1, requestedEnd);

      const indexLines = batchSegs.map((s, i) => {
        const epNo = requestedStart + i;
        const ep = 'E' + String(epNo).padStart(3, '0');
        return `${ep},${s.startLine}-${s.endLine},${s.title.replace(/,/g, ' ')}`;
      }).join('\n');
      const segmentDigest = buildSegmentDigest(novelText, batchSegs.map((seg, index) => ({
        ...seg,
        _epNo: requestedStart + index
      }))).split('\n').map((line, index) => {
        const epNo = requestedStart + index;
        return line.replace(/^E\d{3}/, `E${String(epNo).padStart(3, '0')}`);
      }).join('\n');
      userMessage = `SOURCE RANGE INDEX (ep_id,source_range,segment_title)\n${indexLines}\n\nSEGMENT DIGEST (ep_id,source_range,preview)\n${segmentDigest}\n\n任务：基于 STORY BIBLE + SOURCE RANGE INDEX + SEGMENT DIGEST，为全剧 ${target} 集中的第 ${requestedStart}-${requestedEnd} 集生成剧集映射 CSV。\n\n请严格遵守当前 agent 已挂载的 skills 中关于 episode mapping CSV 的 schema、字段语义、source anchoring 和 anti-invention 规则。SOURCE RANGE INDEX 是权威输入，禁止擅自改写已提供的 source_range。`;
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
      const episodeDurationMinutes = resolveEpisodeDurationMinutes(body);
      const timeBlocks = buildShootableTimeBlocks(episodeDurationMinutes);
      const runtimeLabel = episodeDurationMinutes ? `${episodeDurationMinutes} minutes` : 'approximately 1.75 minutes';
      const totalEpisodes = Number(body?.totalEpisodes || body?.projectConfig?.totalEpisodes || 0) || null;
      const truncated = sourceText.length > 200000 ? sourceText.substring(0, 200000) + '\n...(已截断)' : sourceText;

      // Use pronouns from bible if not explicitly provided
      const effectivePronouns = characterPronouns || extractPronounsFromBible(storyBible);

      if (screenwriterMode === 'shootable_90s_pro') {
        // Detect input language: if episodeMappingRow or sourceText contains Chinese, output in Chinese
        const inputHasChinese = /[\u4e00-\u9fff]/.test(typeof episodeMappingRow === 'string' ? episodeMappingRow : '') || /[\u4e00-\u9fff]/.test(sourceText || '');
        const langDirective = inputHasChinese
          ? `【语言规则】输入内容为中文，你的全部输出必须使用中文。场景描述、画面描述、动作、对白、旁白全部用中文书写。只有格式标记（[Visual]、[SFX/Ambience]、时间码）保持英文。角色名保持原文。\n\n`
          : `【LANGUAGE RULE】Output language MUST match the input language.\n\n`;
        const thinkingDirective = inputHasChinese
          ? `【思考过程输出规则】先输出一个 <thinking>...</thinking> 区块，内容只允许写本集改编策略、连续性衔接、关键冲突安排，控制在 200 字以内。写完后立刻开始正式剧本正文。\n\n`
          : `THINKING OUTPUT RULE: Start with one <thinking>...</thinking> block containing only adaptation strategy, continuity handoff, and key conflict planning for this episode, within 200 words. Immediately continue with the final screenplay body after that block.\n\n`;

        userMessage = `IMPORTANT: You are writing a SHOOTABLE shortdrama screenplay.\n${langDirective}${thinkingDirective}` +
          `PROJECT CONFIG:\n` +
          `- Episode runtime: ${runtimeLabel}\n` +
          `${totalEpisodes ? `- Total episodes: ${totalEpisodes}\n` : ''}` +
          `${Number.isInteger(episodeIndex) ? `- Current episode: E${String(episodeIndex + 1).padStart(3, '0')}\n` : ''}\n` +
          `PRONOUN CANON (must obey):\n` +
          `- If context.characterPronouns is provided, you MUST follow it strictly (never misgender any character).\n` +
          `- If pronouns for a character are NOT provided, avoid gendered pronouns (he/she). Use the character's name or they/them.\n\n` +
          `MODE: shootable_90s_pro\n` +
          `HARD TEMPLATE: Output exactly 6 time blocks with headers:\n` +
          `${timeBlocks.join('\n')}\n\n` +
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
      const { screenplay, episodeIndex } = body;
      if (!screenplay) throw new Error('Missing required field: screenplay');
      const inputHasChinese = hasChineseText(screenplay);
      const episodeId = Number.isInteger(episodeIndex) ? `E${String(episodeIndex + 1).padStart(3, '0')}` : '';
      const episodeHint = episodeId
        ? (inputHasChinese ? `当前集数：${episodeId}\n` : `Current episode: ${episodeId}\n`)
        : '';
      const canonNames = extractCanonNames(storyBible);
      userMessage = inputHasChinese
        ? `${episodeHint}请从以下最终剧本抽取 5 库资产 JSON。\n\n请严格遵守当前 agent 已挂载的 skills 中关于 5 库 schema、道具抽取、场景抽取、语言跟随的全部规则，不要自行发明额外 schema。\n${canonNames ? `角色命名只能参考以下 canon 名称列表，但未出场角色不要加入输出：${canonNames}\n\n` : '\n'}内容：\n${screenplay}`
        : `${episodeHint}Extract a 5-library asset JSON from the final screenplay below.\n\nStrictly follow the currently loaded skills for the 5-library schema, prop extraction, scene extraction, and language-following rules. Do not invent any extra schema outside those skills.\n${canonNames ? `Character naming may reference this canon name list, but do not output characters not present in this episode: ${canonNames}\n\n` : '\n'}Screenplay:\n${screenplay}`;
      break;
    }

    case 'qc-assets': {
      const { assets } = body;
      if (!assets) throw new Error('Missing required field: assets');
      userMessage = `请严格校验以下资产 JSON 是否满足 5 库 schema 与连续性规则。若不满足，pass 必须为 false。\n\n内容：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    case 'storyboard': {
      const { screenplay } = body;
      const assets = body.assets || body.assetLibrary;
      if (!screenplay) throw new Error('Missing required field: screenplay');
      const inputHasChinese = hasChineseText(screenplay);
      const sceneCanon = buildStoryboardSceneCanon(assets, body?.episodeIndex);
      const assetsContext = assets
        ? (inputHasChinese
          ? `\n\n可用资产：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`
          : `\n\nAvailable assets:\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`)
        : '';
      const sceneCanonText = sceneCanon
        ? (inputHasChinese
          ? `\n\n场景 canon（运行时权威上下文，优先复用，不要改名）：\n${sceneCanon.sceneNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`
          : `\n\nScene canon (runtime authoritative context, reuse these names when possible without renaming):\n${sceneCanon.sceneNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`)
        : '';
      userMessage = inputHasChinese
        ? `请把以下剧本输出为 22 列 CSV 纯文本。\n\n请严格遵守当前 agent 已挂载的 storyboard skills 中关于 22 列 CSV contract、scene pack / shot pack、场景 canon 复用、道具列与场景列语义边界、空值占位、Image/Video Prompt 非空等全部规则。特别要求：\n- 台词列只允许写角色对白；没有对白就写“无”。\n- 台词列若存在说话人，必须是**单一**真实说话人，格式如“醉汉：你这个废人，滚出这里！”。\n- 不能把镜头出场角色名单合并成多人前缀；禁止输出“角色A、角色B：...”这类多人 speaker。\n- 旁白列只允许写真实 VO / 内心独白 / 画外音；没有旁白就写“无”。\n- 不要把环境描述、光线、氛围、构图、镜头说明、场景 prose 写进旁白列。\n${sceneCanonText}内容：\n${screenplay}${assetsContext}`
        : `Output the screenplay below as a 22-column CSV in plain text.\n\nStrictly follow the currently loaded storyboard skills for the 22-column CSV contract, scene pack / shot pack behavior, scene canon reuse, scene-vs-prop column semantics, placeholder empty values, and non-empty Image/Video prompts. Special requirements:\n- Dialogue column may contain spoken lines only; if none, write None.\n- If dialogue has a speaker, it must be exactly one real speaker, e.g. "Drunk man: Get out of here!"\n- Never combine all characters in the shot into a multi-speaker prefix like "A, B: ...".\n- Narration column may contain VO / inner monologue / voice-over only; if none, write None.\n- Never place scene/environment prose, lighting, atmosphere, composition, or camera notes into the narration column.\n${sceneCanonText}Screenplay:\n${screenplay}${assetsContext}`;
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
      userMessage = `项目参数：总集数=${totalEpisodes}，每集=${episodeDuration}分钟\n\n`;
      if (globalDirective) userMessage += `总提示词：${globalDirective}\n\n`;
      userMessage += `先输出一个 <thinking>...</thinking> 区块，内容只允许写角色/服装抽取与连续性归一策略、哪些角色需要合并或区分，控制在 120 字以内；然后立刻输出最终 JSON。\n\n请严格遵守当前 agent 已挂载的 extraction / continuity skills，不要把人物创作设计理论当作补写依据。以下是全部剧本（含集号标记），请提取角色和服装资产库（4张表），episode_id/scene_id 必须对应标记中的集号：\n${fullText}`;
      if (assets) userMessage += `\n\n已有基础资产：\n${typeof assets === 'string' ? assets : JSON.stringify(assets)}`;
      if (storyBible) userMessage = injectBibleContext(userMessage, storyBible);
      break;
    }

    default:
      throw new Error(`Unhandled pipeline step: ${stepId}`);
  }

  // Append format instruction
  if (stepId === 'extract-assets' || stepId === 'design-characters') {
    const thinkingLanguageRule = (stepId === 'extract-assets' && !hasChineseText(body?.screenplay || ''))
      ? 'The `<thinking>` block must be brief English only. Do not output Chinese, checklist boilerplate, constraints, or self-check text.'
      : '`<thinking>` 必须是中文短句，不能写英文 checklist、Constraint、Ready to generate、自我校验。';
    userMessage += `\n\n**重要：只允许输出两部分内容：先输出一个 \`<thinking>...</thinking>\`，再输出纯 JSON 正文。${thinkingLanguageRule} 不要输出代码块，不要输出额外说明。JSON 必须直接以 \`{\` 开头、以 \`}\` 结尾。**`;
  } else if (needsJsonOutput(agentId)) {
    userMessage += '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字。只输出{开头}结尾的JSON。**';
  } else if (stepId === 'screenplay') {
    userMessage += '\n\n**重要：只允许输出两部分内容：先输出一个 `<thinking>...</thinking>`，再输出最终剧本正文。不要输出 JSON，不要输出代码块，不要输出额外说明。**';
  } else if (stepId === 'storyboard') {
    const thinkingLanguageRule = hasChineseText(body?.screenplay || '')
      ? '`<thinking>` 必须是中文短句，不能写英文 checklist、Constraint、Ready to generate、自我校验。'
      : 'The `<thinking>` block must be brief English only. Do not output Chinese, checklist boilerplate, constraints, or self-check text.';
    userMessage += `\n\n**重要：只允许输出两部分内容：先输出一个 \`<thinking>...</thinking>\`，再输出最终 CSV 正文。${thinkingLanguageRule} 不要输出 JSON，不要输出代码块，不要输出额外说明。**`;
  } else {
    userMessage += '\n\n**重要：只输出最终正文（自然语言），不要JSON，不要代码块，不要解释/思考过程；输出语言必须跟随输入语言。**';
  }

  options.generationMode = body.generationMode || 'stable';
  if (body.temperature != null) options.temperature = body.temperature;
  if (body.topP != null) options.top_p = body.topP;
  if (body.topK != null) options.top_k = body.topK;
  if (body.seed != null) options.seed = body.seed;

  return { systemPrompt, userMessage, agentId, options };
}
