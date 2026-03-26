const BREAKDOWN_HEADERS = [
  'ep_id',
  'source_range',
  'episode_title',
  'one_line_plot',
  'setup',
  'development',
  'turn',
  'hook',
  'scene_list',
  'characters',
  'must_keep',
  'no_add'
];

function splitNovelToLines(text, target = 80) {
  let rawText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let lines = rawText.split('\n');

  if (lines.length < target * 2) {
    rawText = rawText
      .replace(/([。！？!?])\s*/g, '$1\n')
      .replace(/(\.)\s+(?=[A-Z\u4e00-\u9fff])/g, '$1\n')
      .replace(/\s{2,}/g, '\n')
      .replace(/((?:INT|EXT|内景|外景|镜头切至)[.．：:].+)/g, '\n$1\n');
    lines = rawText.split('\n').filter((line) => line.trim().length > 0);
  }

  return lines;
}

function compactText(text, maxLength = 80) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '')
    .replace(/,/g, '，')
    .trim()
    .slice(0, maxLength) || '无';
}

function normalizeMatchText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s·•・‧.．,，:：;；!！?？"'“”‘’()（）\[\]【】<>{}\-—_]/g, '');
}

function isLowSignalText(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;

  const normalized = normalizeMatchText(raw);
  if (!normalized) return true;

  return (
    normalized === '镜头切至' ||
    normalized === 'cutto' ||
    normalized === '场景' ||
    normalized === '内景' ||
    normalized === '外景' ||
    normalized === '镜头' ||
    /^segment\d+[ab]?$/.test(normalized) ||
    /^scene\d+$/.test(normalized) ||
    /^(int|ext|intext)$/.test(normalized)
  );
}

function getBibleCharacters(storyBible) {
  const raw = Array.isArray(storyBible?.characters)
    ? storyBible.characters
    : Array.isArray(storyBible?.character_library)
      ? storyBible.character_library
      : [];
  return raw
    .map((item) => ({
      name: compactText(item?.name || item?.character_name || '', 40),
      aliases: Array.isArray(item?.aliases) ? item.aliases.map((alias) => compactText(alias, 40)) : []
    }))
    .filter((item) => item.name && item.name !== '无');
}

function extractPreview(lines, startLine, endLine) {
  const slice = lines
    .slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine))
    .map((line) => compactText(line, 120))
    .filter((line) => line && line !== '无')
    .slice(0, 6);

  return slice;
}

function buildSceneList(previewLines, sourceRange) {
  const sceneLines = previewLines
    .filter((line) => /^(INT\.|EXT\.|INT\/EXT\.|内景|外景|场景|镜头)/i.test(line) && !isLowSignalText(line))
    .slice(0, 4);
  if (sceneLines.length) {
    return sceneLines.join('; ');
  }

  const informative = previewLines.filter((line) => line && !isLowSignalText(line)).slice(0, 2);
  if (informative.length) {
    return informative.join('; ');
  }

  return `按原文 ${sourceRange} 推进`;
}

function buildCharacterList(previewLines, storyBible) {
  const preview = normalizeMatchText(previewLines.join(' '));
  const matched = [];
  for (const character of getBibleCharacters(storyBible)) {
    const found = preview.includes(normalizeMatchText(character.name))
      || character.aliases.some((alias) => alias && preview.includes(normalizeMatchText(alias)));
    if (found) matched.push(character.name);
  }
  if (matched.length) {
    return matched.slice(0, 4).join('、');
  }

  return '';
}

function buildStoryBeat(previewLines, fallbackText) {
  const informative = previewLines.filter((line) => line && !isLowSignalText(line));
  const joined = compactText((informative.length ? informative : previewLines).join(' / '), 200);
  if (joined !== '无') return joined;
  return compactText(fallbackText, 80);
}

function pickInformativeLine(previewLines, startIndex = 0) {
  for (let index = startIndex; index < previewLines.length; index += 1) {
    if (!isLowSignalText(previewLines[index])) {
      return previewLines[index];
    }
  }
  return previewLines.find((line) => String(line || '').trim()) || '';
}

function pickInformativeTailLine(previewLines) {
  for (let index = previewLines.length - 1; index >= 0; index -= 1) {
    if (!isLowSignalText(previewLines[index])) {
      return previewLines[index];
    }
  }
  return previewLines.at(-1) || previewLines[0] || '';
}

function selectOneLinePlot(segTitle, beat, previewLines) {
  const compactTitle = compactText(segTitle, 80);
  if (compactTitle !== '无' && !isLowSignalText(compactTitle)) {
    return compactTitle;
  }

  const informative = pickInformativeLine(previewLines, 0);
  if (informative) {
    return compactText(informative, 80);
  }

  return compactText(beat, 80);
}

function sanitizeEpisodeTitleText(text, maxLength = 18) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^(镜头切至|切至|画面切到|本集讲述)[:：\s-]*/u, '')
    .replace(/^第\s*\d+\s*集[:：\s-]*/u, '')
    .replace(/[。！？!?].*$/u, '')
    .replace(/[；;].*$/u, '')
    .trim();

  if (!cleaned || isLowSignalText(cleaned)) {
    return '';
  }

  return cleaned.slice(0, maxLength).trim();
}

function buildEpisodeTitle(segTitle, beat, previewLines) {
  const candidates = [
    segTitle,
    pickInformativeLine(previewLines, 0),
    pickInformativeLine(previewLines, 1),
    beat
  ];

  for (const candidate of candidates) {
    const title = sanitizeEpisodeTitleText(candidate);
    if (title) {
      return title;
    }
  }

  return '本集推进';
}

export function shouldUseDeterministicBreakdownFallback(err) {
  const message = String(err?.message || err || '');
  return (
    message.includes('InvalidParameter') ||
    message.includes('30720') ||
    message.includes('請求超時') ||
    message.includes('timeout') ||
    message.includes('ETIMEDOUT')
  );
}

export function buildDeterministicBreakdownCsv(body, deps) {
  const { novelText, totalEpisodes = 80, storyBible } = body;
  const { buildSourceRanges } = deps;

  if (!novelText) {
    throw new Error('deterministic_breakdown_missing_novel_text');
  }

  const target = Math.max(1, Number(totalEpisodes) || 80);
  const segs = buildSourceRanges(novelText, target);
  const lines = splitNovelToLines(novelText, target);
  const rows = [BREAKDOWN_HEADERS.join(',')];

  for (let index = 0; index < segs.length; index += 1) {
    const seg = segs[index];
    const epId = `E${String(index + 1).padStart(3, '0')}`;
    const sourceRange = `${seg.startLine}-${seg.endLine}`;
    const previewLines = extractPreview(lines, seg.startLine, seg.endLine);
    const beat = buildStoryBeat(previewLines, seg.title);
    const sceneList = buildSceneList(previewLines, sourceRange);
    const characters = buildCharacterList(previewLines, storyBible);

    const row = [
      epId,
      sourceRange,
      buildEpisodeTitle(seg.title, beat, previewLines),
      selectOneLinePlot(seg.title, beat, previewLines),
      compactText(pickInformativeLine(previewLines, 0) || beat, 80),
      compactText(pickInformativeLine(previewLines, 1) || beat, 80),
      compactText(pickInformativeLine(previewLines, 2) || beat, 80),
      compactText(pickInformativeTailLine(previewLines) || beat, 80),
      compactText(sceneList, 200),
      characters,
      `保留原文 ${sourceRange} 的核心事件与角色动机`,
      '禁止新增原著主线之外的关键剧情'
    ];

    rows.push(row.join(','));
  }

  return rows.join('\n');
}
