import { coerceCharacterCostumeAssets, validateCharacterCostumeAssets } from './character-costume-normalizer.js';

const LEGACY_BREAKDOWN_HEADER = 'ep_id,source_range,one_line_plot,setup,development,turn,hook,scene_list,characters,must_keep,no_add';
const BREAKDOWN_HEADER = 'ep_id,source_range,episode_title,one_line_plot,setup,development,turn,hook,scene_list,characters,must_keep,no_add';
const PROP_LIBRARY_MAX_COUNT = 6;
const BREAKDOWN_COLUMNS = BREAKDOWN_HEADER.split(',');
const LEGACY_STORYBOARD_HEADER = '镜号,时间码,场景,角色,服装,道具,景别,角度,焦距,运动,构图,画面描述,动作,神态,台词,旁白,光线,音效,叙事功能,Image_Prompt,Video_Prompt';
const STORYBOARD_HEADER = '镜号,时间码,场景,角色,服装,道具,景别,角度,焦距,运动,构图,画面描述,动作,神态,台词,旁白,光线,音效,叙事功能,画风,Image_Prompt,Video_Prompt';
const LEGACY_STORYBOARD_COLUMNS = LEGACY_STORYBOARD_HEADER.split(',');
const STORYBOARD_COLUMNS = STORYBOARD_HEADER.split(',');
const STORYBOARD_STYLE_COLUMN_INDEX = STORYBOARD_COLUMNS.indexOf('画风');
const STORYBOARD_ROW_START_RE = /"?\d{1,3}"?\s*[,，]\s*"?\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?"?/g;
const STORYBOARD_ROW_LINE_RE = /^"?\d{1,3}"?\s*[,，]\s*"?\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?"?/;
const STORYBOARD_MIN_SHOT_DURATION = 3;
const STORYBOARD_MAX_SHOT_DURATION = 5;
const STORYBOARD_DEFAULT_SHOT_DURATION = 4;

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function chooseLanguageText(seed, chineseText, englishText) {
  return hasChineseText(seed) ? chineseText : englishText;
}

function stripCodeFence(text) {
  const raw = String(text ?? '').trim();
  if (!raw.startsWith('```')) return raw;
  return raw.replace(/^```[a-zA-Z0-9_-]*\s*/, '').replace(/\s*```$/, '').trim();
}

function stripThinkingBlock(text) {
  return String(text ?? '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
    .trim();
}

function extractJsonSlice(text) {
  const raw = stripCodeFence(text);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) return raw.slice(firstBracket, lastBracket + 1);
  return raw;
}

function repairJsonLikeText(text) {
  let repaired = String(text ?? '');
  let output = '';
  let inQuotes = false;
  let escaping = false;

  for (let i = 0; i < repaired.length; i += 1) {
    const ch = repaired[i];
    if (ch === '"' && !escaping) {
      inQuotes = !inQuotes;
      output += ch;
      continue;
    }
    if (inQuotes && (ch === '\n' || ch === '\r')) {
      output += '\\n';
      escaping = false;
      continue;
    }
    output += ch;
    if (ch === '\\' && !escaping) escaping = true;
    else escaping = false;
  }

  repaired = output
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  return repaired;
}

export function parseLooseJson(text) {
  const jsonText = extractJsonSlice(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    const repaired = repairJsonLikeText(jsonText);
    try {
      return JSON.parse(repaired);
    } catch {
      return JSON.parse(`[${repaired}]`);
    }
  }
}

export function normalizeBreakdownCsv(text) {
  const cleanedLines = stripCodeFence(text)
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!cleanedLines.length) return BREAKDOWN_HEADER;

  const dataLines = cleanedLines.filter((line) => line.startsWith('ep_id,') || /^E\d{3},/.test(line));
  if (!dataLines.length) return cleanedLines.join('\n');

  const hasHeader = dataLines[0] === BREAKDOWN_HEADER || dataLines[0] === LEGACY_BREAKDOWN_HEADER || dataLines[0].startsWith('ep_id,');
  const rows = [];

  for (let index = hasHeader ? 1 : 0; index < dataLines.length; index += 1) {
    const line = dataLines[index];
    if (!/^E\d{3},/.test(line)) continue;
    rows.push(encodeBreakdownRow(normalizeBreakdownCells(parseCsvLine(line))));
  }

  return `${BREAKDOWN_HEADER}\n${rows.join('\n')}\n`;
}

function splitSingleLineStoryboardRows(text) {
  let fixed = text.trim();
  if (fixed.startsWith('"镜号","时间码"')) {
    const normalizedHeader = fixed.includes('"画风"')
      ? STORYBOARD_HEADER
      : LEGACY_STORYBOARD_HEADER;
    fixed = fixed.replace(/^"镜号","时间码".*?"Video_Prompt"\s*/, `${normalizedHeader}\n`);
  }

  const lines = fixed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return fixed;

  let header = '';
  let bodyLines = lines;
  const normalizedHeader = normalizeStoryboardHeader(lines[0]);
  if (normalizedHeader === STORYBOARD_HEADER || normalizedHeader === LEGACY_STORYBOARD_HEADER) {
    header = normalizedHeader;
    bodyLines = lines.slice(1);
  }

  const bodyText = bodyLines.join('\n').trim();
  if (!bodyText) {
    return header ? `${header}\n` : fixed;
  }

  const directLineCount = bodyLines.filter((line) => STORYBOARD_ROW_LINE_RE.test(line)).length;
  const rowMatches = Array.from(bodyText.matchAll(STORYBOARD_ROW_START_RE));

  if (rowMatches.length <= 1 || rowMatches.length <= directLineCount) {
    const normalizedBody = fixed.includes('\n')
      ? bodyText
      : bodyText.replace(/"\s+(?="\d{1,3}",)/g, '"\n');
    return header ? `${header}\n${normalizedBody}` : normalizedBody;
  }

  const rebuiltRows = [];
  for (let index = 0; index < rowMatches.length; index += 1) {
    const start = rowMatches[index].index ?? 0;
    const end = index + 1 < rowMatches.length
      ? (rowMatches[index + 1].index ?? bodyText.length)
      : bodyText.length;
    const segment = bodyText
      .slice(start, end)
      .trim()
      .replace(/^[,，\s]+/, '')
      .replace(/[，,]\s*$/, '');
    if (segment) {
      rebuiltRows.push(segment);
    }
  }

  const rebuiltBody = rebuiltRows.join('\n');
  return header ? `${header}\n${rebuiltBody}` : rebuiltBody;
}

function normalizeStoryboardHeader(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('"镜号","时间码"')) return trimmed;
  if (trimmed.includes('"画风"')) {
    return STORYBOARD_HEADER;
  }
  return LEGACY_STORYBOARD_HEADER;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === ',') {
      cells.push(current);
      current = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

function parseStoryboardRowCells(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return [];
  if (!trimmed.includes('"') && trimmed.includes('，')) {
    const cells = trimmed.split('，').map((cell) => String(cell ?? '').trim());
    if (cells.length >= LEGACY_STORYBOARD_COLUMNS.length - 1) {
      return cells;
    }
  }
  return parseCsvLine(trimmed);
}

function parseTimeTokenToSeconds(value) {
  const token = String(value || '').trim();
  if (!token) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);

  const parts = token.split(':').map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) {
    return NaN;
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatSecondsToTimeToken(totalSeconds) {
  const normalized = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeStoryboardTimecode(value, fallbackStartSeconds = 0) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?)/);
  const parsedStart = match ? parseTimeTokenToSeconds(match[1]) : NaN;
  const parsedEnd = match ? parseTimeTokenToSeconds(match[2]) : NaN;
  const rawDuration = Number.isFinite(parsedStart) && Number.isFinite(parsedEnd) && parsedEnd >= parsedStart
    ? parsedEnd - parsedStart
    : NaN;
  const normalizedDuration = Number.isFinite(rawDuration)
    ? Math.min(STORYBOARD_MAX_SHOT_DURATION, Math.max(STORYBOARD_MIN_SHOT_DURATION, Math.round(rawDuration)))
    : STORYBOARD_DEFAULT_SHOT_DURATION;
  const startSeconds = Math.max(0, Math.round(Number(fallbackStartSeconds) || 0));
  const endSeconds = startSeconds + normalizedDuration;

  return {
    startSeconds,
    endSeconds,
    text: `${formatSecondsToTimeToken(startSeconds)}-${formatSecondsToTimeToken(endSeconds)}`
  };
}

function deriveEpisodeTitleFromPlot(plot) {
  return String(plot ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^(镜头切至|切至|画面切到|本集讲述)[:：\s-]*/u, '')
    .replace(/^第\s*\d+\s*集[:：\s-]*/u, '')
    .replace(/[。！？!?].*$/u, '')
    .replace(/[；;].*$/u, '')
    .trim();
}

function normalizeBreakdownCells(cells) {
  const trimmedCells = cells.map((cell) => String(cell ?? '').trim());
  if (!trimmedCells.length) {
    return Array(BREAKDOWN_COLUMNS.length).fill('');
  }

  if (trimmedCells.length === BREAKDOWN_COLUMNS.length) {
    return trimmedCells;
  }

  if (trimmedCells.length === BREAKDOWN_COLUMNS.length - 1) {
    const legacyPlot = trimmedCells[2] || '';
    return [
      trimmedCells[0] || '',
      trimmedCells[1] || '',
      deriveEpisodeTitleFromPlot(legacyPlot),
      ...trimmedCells.slice(2)
    ];
  }

  if (trimmedCells.length > BREAKDOWN_COLUMNS.length) {
    return trimmedCells
      .slice(0, BREAKDOWN_COLUMNS.length - 1)
      .concat(trimmedCells.slice(BREAKDOWN_COLUMNS.length - 1).join('，'));
  }

  return trimmedCells.concat(Array(BREAKDOWN_COLUMNS.length - trimmedCells.length).fill(''));
}

function encodeBreakdownRow(cells) {
  return cells.map((value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`).join(',');
}

function encodeCsvRow(cells) {
  return cells.map((value) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`).join(',');
}

function slugifyAssetId(value, fallbackPrefix = 'asset', index = 0) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `${fallbackPrefix}_${String(index + 1).padStart(2, '0')}`;
}

function humanizeSlugId(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (hasChineseText(text)) return text;
  return text
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}

function normalizeSceneId(value, episodeId = 'E001', index = 0) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^E\d{3}_S\d{2}$/.test(normalized)) {
    return normalized;
  }
  return `${episodeId}_S${String(index + 1).padStart(2, '0')}`;
}

function toLegacyLibraryArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([legacyId, row]) => ({
    ...(row && typeof row === 'object' ? row : {}),
    _legacyId: legacyId
  }));
}

function deriveSceneName(description, index = 0) {
  const base = String(description ?? '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/[。！？!?；;\n]/)[0]
    .trim()
    .slice(0, 24);
  return base || chooseLanguageText(description, `场景${String(index + 1).padStart(2, '0')}`, `Scene ${String(index + 1).padStart(2, '0')}`);
}

function inferCharactersFromText(text, characterLibrary = []) {
  const haystack = String(text ?? '');
  if (!haystack) return [];
  return characterLibrary
    .filter((row) => row?.name && haystack.includes(String(row.name)))
    .map((row) => row.character_id)
    .filter(Boolean);
}

function buildPrimaryCostumeMap(costumeLibrary = []) {
  const costumeMap = new Map();
  costumeLibrary.forEach((row) => {
    const characterId = String(row?.character_id || '').trim();
    const costumeId = String(row?.costume_id || '').trim();
    if (!characterId || !costumeId || costumeMap.has(characterId)) return;
    costumeMap.set(characterId, costumeId);
  });
  return costumeMap;
}

function buildCharacterAliasMap(characterLibrary = []) {
  const aliasMap = new Map();
  characterLibrary.forEach((character) => {
    [
      character?.character_id,
      character?.characterId,
      character?.id,
      character?.name
    ]
      .map((value) => normalizeSceneFieldText(value).toLowerCase())
      .filter(Boolean)
      .forEach((key) => {
        if (!aliasMap.has(key)) {
          aliasMap.set(key, String(character?.character_id || '').trim());
        }
      });
  });
  return aliasMap;
}

function hasNonEmptyPlainObject(value) {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0;
}

function parseStructuredString(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function coerceArrayValue(value) {
  const parsed = parseStructuredString(value);
  return Array.isArray(parsed) ? parsed : [];
}

function coercePlainObjectValue(value) {
  const parsed = parseStructuredString(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function extractInlineScreenplayHeading(line = '') {
  const text = String(line || '').trim();
  if (!text) return '';

  const match = text.match(/(?:^|\b)(INT|EXT)\.\s*([A-Za-z0-9\u4e00-\u9fa5'’\-\s]+?)(?:\s*-\s*(DAY|NIGHT|DAWN|DUSK))?(?=[。：:。!！?\n]|$)/i);
  if (!match) return '';

  const prefix = String(match[1] || '').toUpperCase();
  const location = String(match[2] || '').trim().replace(/\s+/g, ' ');
  const time = String(match[3] || '').trim().toUpperCase();
  if (!location) return '';

  return `${prefix}. ${location}${time ? ` - ${time}` : ''}`.trim();
}

function parseScreenplaySceneBlocks(screenplay = '') {
  const text = String(screenplay || '').replace(/\r/g, '');
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const joined = current.lines.join('\n').trim();
    if (joined) {
      blocks.push({
        heading: current.heading || '',
        text: joined
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const trimmed = line.trim();
    const isSceneMarker = /^\[\s*Scene\s+\d+\s*\]$/i.test(trimmed);
    const inlineHeading = /^(?:INT|EXT)\./i.test(trimmed)
      ? trimmed
      : extractInlineScreenplayHeading(trimmed);
    const isHeading = !!inlineHeading;

    if (isSceneMarker) {
      if (current) {
        pushCurrent();
      }
      current = { heading: '', lines: [] };
      current.lines.push(trimmed);
      continue;
    }

    if (isHeading) {
      const currentOnlyHasSceneMarker = current
        && current.lines.length === 1
        && /^\[\s*Scene\s+\d+\s*\]$/i.test(String(current.lines[0] || '').trim())
        && !current.heading;

      if (current && !currentOnlyHasSceneMarker) {
        pushCurrent();
        current = { heading: '', lines: [] };
      }
      if (!current) {
        current = { heading: '', lines: [] };
      }
      current.heading = inlineHeading;
      current.lines.push(trimmed);
      continue;
    }

    if (!current) {
      current = { heading: '', lines: [] };
    }
    current.lines.push(line);
  }

  pushCurrent();
  return blocks;
}

function buildScreenplaySceneContexts(screenplay = '', sceneLibrary = [], characterLibrary = [], characterNames = [], propNames = []) {
  const blocks = parseScreenplaySceneBlocks(screenplay);
  if (!blocks.length) return [];

  return blocks.map((block, index) => {
    const fallbackScene = sceneLibrary[index] || null;
    const derivedName = deriveEnvironmentSceneName(
      `${block.heading}\n${block.text}`,
      index,
      characterNames,
      propNames,
      { previousName: sceneLibrary[index - 1]?.name || '' }
    ) || fallbackScene?.name || '';

    return {
      index,
      heading: block.heading,
      text: block.text,
      sceneName: derivedName,
      characters: inferCharactersFromText(block.text, characterLibrary)
    };
  });
}

const SCENE_FIELD_CAMERA_PREFIX_RE = /^(?:镜头(?:切至|转到|拉至)?|画面(?:切至|转到)?|切至|cut\s+to|camera(?:\s+moves?)?)[:：\s-]*/i;
const SCENE_FIELD_FORBIDDEN_TOKEN_RE = /(镜头|特写|近景|中景|全景|远景|推镜|拉镜|摇镜|移镜|跟拍|运镜|构图|台词|对白|旁白|dialogue|narration|voiceover|camera|close-?up|wide shot)/i;
const SCENE_FIELD_HUMAN_ACTION_RE = /(他|她|他们|她们|角色|人物|人群|众人|瞳孔|眼睛|左眼|右眼|嘴角|脸部|面部|手指|手掌|双手|呼吸|心跳|低头|抬眼|回头|伸手|抓住|盯住|注视|看向|望向|说话|开口|喊|叫|哭|笑|奔跑|冲出|扑向|掀开|举起|翻转|摸向|传来|突然|猛地|开始|正在|倏然|骤然)/;
const SCENE_FIELD_GENERIC_PROP_RE = /(轮椅|坦克|枪|炮|刀|剑|平板|手机|火把|照片|耳机|义眼|尸体|宇航服|无线电|对讲机|纹身|托盘)/;
const SCENE_LOCATION_PATTERN_RE = /([A-Za-z0-9\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5'’\s-]{0,48}(?:火葬场|实验室|控制室|驾驶舱|冷冻舱|舱室|船舱|舱内|车厢|走廊|廊下|病房|教室|法庭|法院|神庙|寺庙|正殿|偏殿|内室|佛龛|宫殿|庭院|院落|街道|街景|小巷|巷道|路口|桥面|桥下|港口|码头|车站|站台|轨道站|基地|废墟|营地|酒吧|公寓|医院|监狱|雨林|森林|丛林|山谷|洞穴|海岸|海面|海上|沙漠|雪原|星球|大气层|广场|屋顶|甲板|船舷|大厅|仓库|工厂|城区|街区|拖船|远洋轮|observation deck|service corridor|corridor|hallway|passageway|control room|laboratory|lab|cockpit|bridge|chamber|cabin|courtroom|temple|sanctum|shrine|palace|courtyard|street|alley|intersection|port|harbor|dock|station|platform|base|ruins|camp|bar|apartment|hospital|prison|rainforest|forest|jungle|valley|cave|coast|shore|sea|ocean|desert|snowfield|planet|atmosphere|square|rooftop|deck|hall|warehouse|factory|district|tugboat|freighter))/gi;
const SCENE_ATMOSPHERE_KEYWORDS = ['夜色', '雨夜', '晨光', '暮色', '黄昏', '冷白灯光', '冷光', '暖光', '火光', '霓虹', '极光', '雾气', '烟尘', '尘埃', '湿热空气', '荧光', '菌丝', '藤蔓', '废墟', '残破', '静谧', '压迫感', '肃杀', '阴冷', '潮湿', '金属感', '工业感', '蓝紫色', '幽蓝', '猩红', '风沙', '暴雨', '雪雾', 'night', 'rain', 'rainy', 'dawn', 'sunrise', 'dusk', 'twilight', 'cold light', 'warm light', 'firelight', 'neon', 'aurora', 'mist', 'fog', 'dust', 'humidity', 'fluorescent', 'vines', 'ruins', 'quiet', 'oppressive', 'cold', 'damp', 'metallic', 'industrial', 'blue-gray', 'crimson', 'storm'];
const SCENE_PLACEHOLDER_NAME_RE = /^(?:场景|scene)\s*[_-]?\s*\d{1,3}$/i;
const SCENE_PLACEHOLDER_FRAGMENT_RE = /(?:场景|scene)\s*[_-]?\s*\d{1,3}/i;
const SCENE_PLACEHOLDER_ID_RE = /^E\d{3}_S\d{2,3}$/i;
const SCENE_SUFFIX_RE = /(?:场景|scene)$/i;
const SCENE_ENVIRONMENT_NOUN_RE = /(火葬场|实验室|控制室|驾驶舱|冷冻舱|低温间|冷藏间|冷冻间|低温舱|舱室|船舱|舱内|车厢|走廊|廊下|病房|教室|法庭|法院|神庙|寺庙|正殿|偏殿|内室|佛龛|宫殿|庭院|院落|街道|街景|小巷|巷道|路口|桥面|桥下|港口|码头|车站|站台|轨道站|基地|废墟|营地|酒吧|公寓|医院|监狱|雨林|森林|丛林|山谷|洞穴|海岸|海面|海上|沙漠|雪原|星球|大气层|广场|屋顶|甲板|船舷|大厅|仓库|工厂|城区|街区|拖船|远洋轮|住处|居所|住所|家|房间|住宅|卧室|客厅|厨房|书房|浴室|home|house|room|bedroom|living room|kitchen|study|apartment|observation deck|service corridor|corridor|hallway|passageway|control room|laboratory|lab|cockpit|bridge|chamber|cabin|courtroom|temple|sanctum|shrine|palace|courtyard|street|alley|intersection|port|harbor|dock|station|platform|base|ruins|camp|bar|apartment|hospital|prison|rainforest|forest|jungle|valley|cave|coast|shore|sea|ocean|desert|snowfield|planet|atmosphere|square|rooftop|deck|hall|warehouse|factory|district|tugboat|freighter)$/i;
const SCENE_ENVIRONMENT_SUFFIX_RE = /(内部|外部|内景|外景|区域|地带|空间|边缘|周边|轨道|窗区|观察区|入口|出口|上空|interior|exterior|orbit|viewport area|window area)$/i;
const SCENE_SCREENPLAY_HEADING_TOKEN_RE = /(?:^|[\s\-])(?:INT\.?|EXT\.?|DAY|NIGHT|DAWN|DUSK)(?:$|[\s\-.])/i;
const SCENE_NAME_TIME_PREFIX_RE = /^(?:(?:夜晚|夜色|夜间|白天|清晨|晨光|黎明|黄昏|暮色|傍晚|深夜|雨夜|暴雨|阴沉|雾气|潮湿|冷光|暖光)(?:的|中)?|(?:night(?:\s+time)?|day(?:time)?|dawn|dusk|sunrise|sunset|rainy|foggy)\b)/i;
const SCENE_OBSERVER_PHRASE_RE = /(可以看到|远处可见|窗外(?:能)?看到|窗外可见|看见|看到|映出|映着|透过窗户|透过舷窗|透过玻璃|阳光洒进|月光洒进|镜头推进|镜头切至|seen through|outside the window|through the window)/i;
const SCENE_OBSERVER_VISIBLE_CONTEXT_RE = /(?:(?:远处|窗外|外面|外部|高处|低处|上方|下方|前方|后方)[^，,。；;\n]{0,10}可见|可见[^，,。；;\n]{0,10}(?:远处|窗外|外面|外部|高处|低处|上方|下方|前方|后方|星空|山体|山脉|行星|建筑|塔楼|目标))/i;
const SCENE_OBSERVER_ENGLISH_RE = /(?:can\s+see|visible\s+through|seen\s+through|outside\s+the\s+window|through\s+the\s+window|in\s+the\s+distance)/i;
const SCENE_NAME_EVENT_PHRASE_RE = /(悬着|切出|泛着|洒进|推进|切至|登船|靠近|跑过|驶出|看向|望向|回头|有人|众人|人群|沉默|鸣笛|推进到|推进至|飘过|掠过|passing|running|approaches|looks?\s+at)/i;
const PROP_ENVIRONMENT_FORBIDDEN_RE = /^(?:雨水|雨滴|雨幕|积水|水汽|水雾|雾气|雾霾|烟尘|尘埃|火光|灯光|光束|阳光|月光|星光|风|风声|空气|阴影|倒影|回声|血迹|汗水|泪水|泥土|沙尘|地面|天空|云层|雪花|雪雾|霓虹|极光|菌丝|藤蔓|树影|波纹|余烬|气流)$/;
const PROP_GENERIC_FORBIDDEN_RE = /^(?:火把|平板|刀|枪|耳机|照片|手机|对讲机|无线电|方向盘|仪表盘|控制杆|托盘|背包|纸张|文件|信纸|杯子|酒杯|桌子|椅子|门把手)$/;
const SCENE_STRUCTURE_HINTS = [
  { match: /港口|码头/, detail: '开阔泊位与潮湿岸线相连，木桩、缆绳和停泊船体形成纵深层次' },
  { match: /汽车内部|车内|车厢|驾驶舱/, detail: '座椅、仪表区与车窗边界围合出紧凑封闭空间，前后景层次明确' },
  { match: /拖船舱内|船舱|舱内|舱室/, detail: '低矮舱顶压缩空间纵深，斑驳金属舱壁与潮湿木板表面带出陈旧工业质感' },
  { match: /甲板|船舷/, detail: '开敞甲板暴露在外部天光下，粗粝金属栏杆与湿滑木板构成冷硬层次' },
  { match: /大厅/, detail: '高挑空间向内延展，墙面与地面形成明确透视，入口与深处保持稳定层次' },
  { match: /监狱|牢房/, detail: '狭窄围合空间带有强烈压迫感，冰冷墙面与铁质结构呈现封闭秩序' },
  { match: /院落|庭院/, detail: '围合院墙限定活动边界，地面与檐廊层次清晰，空间开合分明' },
  { match: /街道|街区|路口|小巷/, detail: '线性通道向远处延伸，两侧立面与地面材质共同塑造连续透视' },
  { match: /登记大厅内|大厅内/, detail: '室内入口、柜台与等候区域分区清晰，硬质墙面和地砖强调秩序感' },
  { match: /紧凑|狭窄|空旷|开阔|围合|封闭|纵深|层次|边界|前后景|通道/, detail: '空间边界稳定，层次与纵深关系清晰' },
  { match: /座椅|长椅|扶手|车窗|窗框|柜台|过道|走道|门框/, detail: '固定结构部件明确，空间组织关系可读' }
];
const SCENE_MATERIAL_HINTS = [
  { match: /金属|铁|铁锈|舱壁|船体|栏杆/, detail: '表面呈现冷硬金属与旧锈痕' },
  { match: /木板|甲板|码头|木桩/, detail: '潮湿木质表面带着磨损纹理' },
  { match: /石|砖|地砖|墙面/, detail: '硬质石砖与墙面肌理清晰可辨' },
  { match: /皮革|塑料|玻璃|饰条|仪表台|不锈钢|钢制|碳纤维/, detail: '皮革、塑料、金属与玻璃表面反光层次清晰' }
];
const SCENE_LIGHT_HINTS = [
  { match: /清晨|晨光|黎明/, detail: '清晨冷光斜切空间边缘' },
  { match: /黄昏|暮色/, detail: '低位暮色把空间压成偏暗轮廓' },
  { match: /夜色|夜晚/, detail: '夜间低照度让明暗反差更集中' },
  { match: /阴沉|灰雾|雾气/, detail: '阴沉天光被灰雾过滤成钝冷色层' },
  { match: /冷光|冷白灯光/, detail: '冷白光源把材质边缘照得更硬' },
  { match: /暖光|火光/, detail: '暖色照明让局部表面泛出偏铜色反光' },
  { match: /日间|日光|自然光/, detail: '日间自然光从侧面压出稳定明暗层次' },
  { match: /柔和|明亮|昏暗|偏暗|低照度|灯光|照明/, detail: '照明强弱与方向把空间明暗层次拉开' }
];
const SCENE_WEATHER_HINTS = [
  { match: /潮湿|湿冷|湿热|水汽/, detail: '空气湿度让表面反光更黏重' },
  { match: /暴雨|雨夜|雨幕|雨水/, detail: '潮湿雨意压低可见度并加重地面反光' },
  { match: /风沙|沙尘/, detail: '悬浮颗粒削弱远处边界清晰度' },
  { match: /干燥/, detail: '空气偏干，空间轮廓显得更清晰' }
];
const SCENE_COLOR_HINTS = [
  { match: /阴冷|灰雾|灰/, detail: '整体色调偏灰冷并带压迫感' },
  { match: /幽蓝|蓝紫色|冷光/, detail: '色温偏蓝，空间显得克制而疏离' },
  { match: /猩红|火光|暖光/, detail: '局部暖色与暗部形成强对比' },
  { match: /工业感|金属感/, detail: '整体视觉强调冷硬工业秩序' },
  { match: /灰黑|冷白|黑灰|偏暗|偏冷白|偏冷|低饱和/, detail: '整体色调明确，氛围克制冷静' }
];

function normalizePropText(value) {
  return String(value ?? '')
    .replace(/<mention\s+[^>]*>([\s\S]*?)<\/mention>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isForbiddenPropName(value) {
  const name = normalizePropText(value);
  if (!name) return true;
  return PROP_ENVIRONMENT_FORBIDDEN_RE.test(name) || PROP_GENERIC_FORBIDDEN_RE.test(name);
}

function buildPropDescriptionFallback(name = '', description = '', prompt = '') {
  const normalizedName = normalizePropText(name);
  const normalizedDescription = normalizePropText(description);
  const seed = `${normalizedName} ${normalizedDescription} ${normalizePropText(prompt)}`.trim();
  if (normalizedDescription && !hasThinPropDescription({ name: normalizedName, description: normalizedDescription })) {
    return normalizedDescription;
  }
  return chooseLanguageText(
    seed,
    `${normalizedName}是可直接拿取或使用的实体道具，外形轮廓明确，材质与结构细节清晰可辨。`,
    `${normalizedName} is a concrete prop with a clear silhouette, readable material texture, and practical structural detail.`
  );
}

function buildPropPromptFallback(name = '', description = '', prompt = '') {
  const normalizedName = normalizePropText(name);
  const normalizedPrompt = normalizePropText(prompt);
  const resolvedDescription = buildPropDescriptionFallback(name, description, prompt);
  const seed = `${normalizedName} ${resolvedDescription} ${normalizedPrompt}`.trim();
  if (normalizedPrompt && !hasThinPropPrompt({ name: normalizedName, description: resolvedDescription, prompt: normalizedPrompt })) {
    return normalizedPrompt;
  }
  return chooseLanguageText(
    seed,
    `${normalizedName}，实体道具轮廓完整，材质纹理与结构细节清晰，表面保留真实使用痕迹，能够明确看出它的实际用途与手感。`,
    `${normalizedName}, a concrete prop with a complete silhouette, clear material texture and structural detail, visible wear from use, and an immediately readable practical function.`
  );
}

function buildNormalizedPropRecord(row = {}, index = 0) {
  const name = normalizePropText(row?.name || row?.label || row?.prop_name || row?.propName || row?.道具名);
  const description = normalizePropText(row?.description || row?.notes || row?.brief || '');
  const prompt = normalizePropText(row?.prompt || row?.prop_prompt || row?.image_prompt || row?.道具提示词 || '');
  if (isForbiddenPropName(name) || looksLikeEnvironmentPropName(name)) return null;
  const languageSeed = `${name} ${description} ${prompt}`;
  const resolvedDescription = buildPropDescriptionFallback(name, description, prompt);
  const resolvedPrompt = buildPropPromptFallback(name, resolvedDescription, prompt);

  return {
    prop_id: slugifyAssetId(row?.prop_id || row?._legacyId || name, 'prop', index),
    name: name || chooseLanguageText(languageSeed, `道具${index + 1}`, `Prop ${index + 1}`),
    description: resolvedDescription,
    prompt: resolvedPrompt
  };
}

function finalizePropLibrary(rows = []) {
  const deduped = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const normalized = buildNormalizedPropRecord(row, index);
    if (!normalized) return;
    const key = normalizePropText(normalized.name).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(normalized);
  });

  return deduped.slice(0, PROP_LIBRARY_MAX_COUNT);
}

function normalizeSceneFieldText(value) {
  return String(value ?? '')
    .replace(/<mention\s+[^>]*>([\s\S]*?)<\/mention>/gi, '$1')
    .replace(/<(?!br\s*\/?)[^>]+>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/(^|[\s\n])@(?=\S)/g, '$1')
    .replace(SCENE_FIELD_CAMERA_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSceneEnvironmentIssues(text, characterNames = [], propNames = []) {
  const value = normalizeSceneFieldText(text);
  const issues = [];
  if (!value) return issues;

  if (SCENE_FIELD_FORBIDDEN_TOKEN_RE.test(value)) {
    issues.push('contains_camera_or_dialogue_terms');
  }
  if (SCENE_FIELD_HUMAN_ACTION_RE.test(value)) {
    issues.push('contains_human_or_action_terms');
  }
  if (SCENE_FIELD_GENERIC_PROP_RE.test(value)) {
    issues.push('contains_generic_prop_terms');
  }
  const hitCharacter = characterNames.find((name) => name && value.includes(name));
  if (hitCharacter) {
    issues.push(`contains_character:${hitCharacter}`);
  }

  const hitProp = propNames.find((name) => name && value.includes(name));
  if (hitProp) {
    issues.push(`contains_prop:${hitProp}`);
  }

  return issues;
}

function looksLikeEnvironmentPropName(value) {
  const name = normalizePropText(value);
  if (!name) return false;
  return looksLikeEnvironmentScenePhrase(name) || extractSceneLocationCandidates(name).length > 0;
}

function splitSceneTextFragments(text) {
  return normalizeSceneFieldText(text)
    .split(/[\n。！？!?；;]+/)
    .flatMap((part) => part.split(/[，,、]/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractSceneLocationCandidates(text) {
  const value = normalizeSceneFieldText(text);
  if (!value) return [];

  const candidates = [];
  const intExtMatch = value.match(/(?:INT|EXT)\.\s*([A-Za-z0-9\u4e00-\u9fa5\s-]{1,40}?)(?:\s*-\s*(?:DAY|NIGHT|DAWN|DUSK))?(?=$|[，,。；;\n])/i);
  if (intExtMatch?.[1]) {
    candidates.push(intExtMatch[1].trim());
  }

  for (const match of value.matchAll(SCENE_LOCATION_PATTERN_RE)) {
    const hit = normalizeSceneFieldText(match?.[1] || match?.[0]);
    if (hit) candidates.push(hit);
  }

  return [...new Set(candidates
    .map((item) => item.replace(/\s*-\s*(?:DAY|NIGHT|DAWN|DUSK)$/i, '').trim())
    .filter(Boolean))];
}

function extractStableEnvironmentCandidates(text, characterNames = [], propNames = []) {
  const value = normalizeSceneFieldText(text);
  if (!value) return [];

  const candidates = [];
  for (let start = 0; start < value.length; start += 1) {
    const chunk = value.slice(start);
    const regex = new RegExp(SCENE_LOCATION_PATTERN_RE.source, 'gi');
    for (const match of chunk.matchAll(regex)) {
      const hit = normalizeSceneFieldText(match?.[1] || match?.[0]);
      if (!hit) continue;
      const candidate = truncateSceneName(
        stripSceneSuffix(
          stripSceneNameLeadingTimeOrWeatherPhrase(hit)
            .replace(/^(?:进入|走进|走入|踏入|来到|回到|抵达|前往|通往|进|入|到|往|向|朝|在)\s*/i, '')
        )
      );
      if (!candidate) continue;
      if (isReliableEnvironmentSceneName(candidate, characterNames, propNames)) {
        candidates.push(candidate);
      }
    }
  }

  return [...new Set(candidates)].sort((a, b) => a.length - b.length);
}

function extractSceneAtmosphereKeywords(text) {
  const value = normalizeSceneFieldText(text);
  if (!value) return [];
  return SCENE_ATMOSPHERE_KEYWORDS.filter((keyword) => value.includes(keyword));
}

function truncateSceneName(value, maxLength = 20) {
  return normalizeSceneFieldText(value).slice(0, maxLength).trim();
}

function stripSceneSuffix(value) {
  const text = normalizeSceneFieldText(value);
  if (!text) return '';
  if (!SCENE_SUFFIX_RE.test(text)) return text;
  return text.replace(SCENE_SUFFIX_RE, '').trim();
}

function stripSceneNameLeadingTimeOrWeatherPhrase(value) {
  const text = normalizeSceneFieldText(value);
  if (!text) return '';
  const stripped = text
    .replace(SCENE_NAME_TIME_PREFIX_RE, '')
    .replace(/^(?:的|之|在|于|中|里|内|下)\s*/i, '')
    .trim();
  return stripped || text;
}

function isPlaceholderSceneName(value) {
  const text = normalizeSceneFieldText(value);
  if (!text) return false;
  return SCENE_PLACEHOLDER_NAME_RE.test(text)
    || SCENE_PLACEHOLDER_ID_RE.test(text)
    || SCENE_PLACEHOLDER_FRAGMENT_RE.test(text);
}

function looksLikeEnvironmentScenePhrase(value) {
  const text = normalizeSceneFieldText(value);
  if (!text) return false;
  if (extractSceneLocationCandidates(text).length > 0) {
    return true;
  }
  const stripped = stripSceneSuffix(text);
  return SCENE_ENVIRONMENT_NOUN_RE.test(stripped) || SCENE_ENVIRONMENT_SUFFIX_RE.test(stripped);
}

function uniqueSceneIssues(issues = []) {
  return [...new Set(issues.filter(Boolean))];
}

function hasSceneObserverPhrasing(value) {
  const text = normalizeSceneFieldText(value);
  if (!text) return false;
  return SCENE_OBSERVER_PHRASE_RE.test(text)
    || SCENE_OBSERVER_VISIBLE_CONTEXT_RE.test(text)
    || SCENE_OBSERVER_ENGLISH_RE.test(text);
}

function detectSceneNameRuleIssues(value, characterNames = [], propNames = []) {
  const rawText = normalizeSceneFieldText(value);
  if (!rawText) return [];

  const text = stripSceneNameLeadingTimeOrWeatherPhrase(rawText);
  const hadTimePrefix = SCENE_NAME_TIME_PREFIX_RE.test(rawText);
  const issues = detectSceneEnvironmentIssues(text, characterNames, propNames);
  const stripped = stripSceneSuffix(text)
    .replace(/\s*-\s*(?:DAY|NIGHT|DAWN|DUSK)\b/gi, '')
    .trim();

  if (SCENE_SCREENPLAY_HEADING_TOKEN_RE.test(text) || /\b(?:DAY|NIGHT|DAWN|DUSK)\b/i.test(text)) {
    issues.push('contains_screenplay_heading_tokens');
  }
  if (hasSceneObserverPhrasing(text)) {
    issues.push('contains_observer_phrasing');
  }
  if (SCENE_NAME_EVENT_PHRASE_RE.test(text)) {
    issues.push('contains_event_or_action_phrase');
  }
  if (hadTimePrefix && !looksLikeEnvironmentScenePhrase(stripped)) {
    issues.push('starts_with_time_or_weather_phrase');
  }
  if (/[。！？!?]/.test(text)) {
    issues.push('looks_sentence_like');
  }
  if (text.length > 24 && !looksLikeEnvironmentScenePhrase(stripped)) {
    issues.push('too_long_for_stable_scene_name');
  }
  if (!looksLikeEnvironmentScenePhrase(stripped)) {
    issues.push('not_stable_environment_anchor');
  }

  return uniqueSceneIssues(issues);
}

function detectSceneDescriptionRuleIssues(scene = {}, characterNames = [], propNames = []) {
  const description = normalizeSceneFieldText(scene?.description);
  if (!description) return [];

  const issues = detectSceneEnvironmentIssues(description, characterNames, propNames);
  if (SCENE_SCREENPLAY_HEADING_TOKEN_RE.test(description)) {
    issues.push('contains_screenplay_heading_tokens');
  }
  if (hasSceneObserverPhrasing(description)) {
    issues.push('contains_observer_phrasing');
  }
  if (!isQualifiedSceneDescription(description)) {
    issues.push('missing_environment_dimensions');
  }
  if (hasThinSceneDescription(scene)) {
    issues.push('too_thin_or_repeats_name');
  }

  return uniqueSceneIssues(issues);
}

function detectScenePromptRuleIssues(scene = {}, characterNames = [], propNames = []) {
  const prompt = normalizeSceneFieldText(scene?.prompt);
  if (!prompt) return ['missing_prompt'];

  const issues = detectSceneEnvironmentIssues(prompt, characterNames, propNames);
  if (SCENE_SCREENPLAY_HEADING_TOKEN_RE.test(prompt)) {
    issues.push('contains_screenplay_heading_tokens');
  }
  if (hasSceneObserverPhrasing(prompt)) {
    issues.push('contains_observer_phrasing');
  }
  if (!isQualifiedScenePrompt(prompt)) {
    issues.push('missing_environment_dimensions');
  }
  if (hasThinScenePrompt(scene)) {
    issues.push('too_thin_or_repeats_name_description');
  }

  return uniqueSceneIssues(issues);
}

function isReliableEnvironmentSceneName(value, characterNames = [], propNames = []) {
  const text = stripSceneNameLeadingTimeOrWeatherPhrase(value);
  if (!text) return false;
  if (isPlaceholderSceneName(text)) return false;
  if (/[。,:：]/.test(text)) return false;
  if (detectSceneNameRuleIssues(text, characterNames, propNames).length) return false;
  return looksLikeEnvironmentScenePhrase(text);
}

function pickPreferredSceneSourceText(...values) {
  const normalizedValues = values
    .map((value) => normalizeSceneFieldText(value))
    .filter(Boolean);

  return normalizedValues.find((value) => !isPlaceholderSceneName(value))
    || normalizedValues[0]
    || '';
}

function deriveEnvironmentSceneName(text, index = 0, characterNames = [], propNames = [], options = {}) {
  const normalizedText = stripSceneNameLeadingTimeOrWeatherPhrase(text);
  const directCandidate = truncateSceneName(stripSceneSuffix(normalizedText));
  if (
    directCandidate
    && !/[。,:：]/.test(directCandidate)
    && !/^(?:INT|EXT)\./i.test(directCandidate)
    && isReliableEnvironmentSceneName(directCandidate, characterNames, propNames)
  ) {
    return directCandidate;
  }

  const stableCandidates = extractStableEnvironmentCandidates(normalizedText, characterNames, propNames);
  if (stableCandidates.length) {
    return stableCandidates[0];
  }

  const locationCandidate = extractSceneLocationCandidates(normalizedText)
    .find((item) => !detectSceneEnvironmentIssues(item, characterNames, propNames).length);
  if (locationCandidate) {
    return truncateSceneName(locationCandidate);
  }

  const previousName = truncateSceneName(options.previousName);
  if (previousName && isReliableEnvironmentSceneName(previousName, characterNames, propNames)) {
    return previousName;
  }

  if (options.allowAtmosphereFallback) {
    const atmosphere = extractSceneAtmosphereKeywords(text);
    if (atmosphere.length) {
      return truncateSceneName(hasChineseText(text) ? `${atmosphere[0]}场景` : `${atmosphere[0]} scene`);
    }
  }

  if (options.allowPlaceholderFallback) {
    return chooseLanguageText(text, `${String(index + 1).padStart(2, '0')}号空间`, `Space ${String(index + 1).padStart(2, '0')} chamber`);
  }

  return '';
}

function collectSceneDetailHints(text, catalog) {
  const value = normalizeSceneFieldText(text);
  if (!value) return [];
  return catalog
    .filter(({ match }) => match.test(value))
    .map(({ detail }) => detail)
    .filter(Boolean);
}

function countSceneEnvironmentDimensions(text) {
  const value = normalizeSceneFieldText(text);
  if (!value) return 0;

  let dimensions = 0;
  if (extractSceneLocationCandidates(value).length || looksLikeEnvironmentScenePhrase(value)) dimensions += 1;
  if (collectSceneDetailHints(value, SCENE_STRUCTURE_HINTS).length) dimensions += 1;
  if (collectSceneDetailHints(value, SCENE_MATERIAL_HINTS).length) dimensions += 1;
  if (collectSceneDetailHints(value, SCENE_LIGHT_HINTS).length || extractSceneAtmosphereKeywords(value).length) dimensions += 1;
  if (collectSceneDetailHints(value, SCENE_WEATHER_HINTS).length) dimensions += 1;
  if (collectSceneDetailHints(value, SCENE_COLOR_HINTS).length) dimensions += 1;
  return dimensions;
}

function isQualifiedSceneDescription(text) {
  const value = normalizeSceneFieldText(text);
  if (!value || value.length < 10) return false;
  if (normalizeSemanticCompareText(value).length <= 6) return false;
  return countSceneEnvironmentDimensions(value) >= 2;
}

function isQualifiedScenePrompt(text) {
  const value = normalizeSceneFieldText(text);
  if (!value || value.length < 18) return false;
  return countSceneEnvironmentDimensions(value) >= 3;
}

function hasOnlyEnvironmentLikeFragments(text, minimumQualifiedFragments = 1) {
  const fragments = splitSceneTextFragments(text);
  if (!fragments.length) return false;

  let qualifiedCount = 0;
  for (const fragment of fragments) {
    const normalized = normalizeSceneFieldText(fragment);
    if (!normalized) continue;
    const fragmentLooksEnvironmental = looksLikeEnvironmentScenePhrase(normalized)
      || countSceneEnvironmentDimensions(normalized) >= 1
      || extractSceneAtmosphereKeywords(normalized).length > 0;
    if (!fragmentLooksEnvironmental) {
      return false;
    }
    qualifiedCount += 1;
  }

  return qualifiedCount >= minimumQualifiedFragments;
}

function isSafeSceneEnvironmentFragment(fragment, characterNames = [], propNames = []) {
  const normalized = normalizeSceneFieldText(fragment);
  if (!normalized) return false;
  if (detectSceneEnvironmentIssues(normalized, characterNames, propNames).length) return false;
  if (SCENE_SCREENPLAY_HEADING_TOKEN_RE.test(normalized)) return false;
  if (hasSceneObserverPhrasing(normalized)) return false;
  if (SCENE_NAME_EVENT_PHRASE_RE.test(normalized)) return false;
  return looksLikeEnvironmentScenePhrase(normalized)
    || countSceneEnvironmentDimensions(normalized) >= 1
    || extractSceneAtmosphereKeywords(normalized).length > 0;
}

function buildSceneDescriptionFromHints(text, fallbackName = '') {
  const safeName = truncateSceneName(fallbackName);
  if (!safeName) return '';
  const useChinese = hasChineseText(`${safeName} ${text}`);

  const structure = collectSceneDetailHints(`${safeName} ${text}`, SCENE_STRUCTURE_HINTS)[0]
    || (useChinese ? '空间边界稳定清晰，前后景层次明确' : 'stable spatial boundaries with readable foreground-to-background depth');
  const material = collectSceneDetailHints(text, SCENE_MATERIAL_HINTS)[0]
    || ((safeName.includes('港口') || safeName.includes('码头') || /\b(port|harbor|dock)\b/i.test(safeName))
      ? (useChinese ? '岸边木质与船体金属交错出粗粝表面' : 'weathered wood by the edge contrasts with rough ship metal surfaces')
      : (useChinese ? '墙面与地面材质呈现清晰触感' : 'wall and floor materials retain clear tactile texture'));
  const light = collectSceneDetailHints(text, SCENE_LIGHT_HINTS)[0]
    || (useChinese ? '自然或人工光线把空间轮廓压得分明' : 'natural or artificial light defines the contours of the space');
  const weather = collectSceneDetailHints(text, SCENE_WEATHER_HINTS)[0]
    || '';
  const color = collectSceneDetailHints(text, SCENE_COLOR_HINTS)[0]
    || '';

  return useChinese
    ? [
      `${safeName}以${structure}。`,
      `${material}，${light}${weather ? `，${weather}` : ''}。`,
      color ? `${color}。` : ''
    ].filter(Boolean).join('').slice(0, 300)
    : [
      `${safeName} features ${structure}.`,
      `${material}, ${light}${weather ? `, ${weather}` : ''}.`,
      color ? `${color}.` : ''
    ].filter(Boolean).join(' ').slice(0, 300);
}

function buildScenePromptFromHints(text, fallbackName = '') {
  const safeName = truncateSceneName(fallbackName);
  if (!safeName) return '';
  const useChinese = hasChineseText(`${safeName} ${text}`);

  const structure = collectSceneDetailHints(`${safeName} ${text}`, SCENE_STRUCTURE_HINTS)[0]
    || (useChinese ? '空间边界稳定，纵深关系清楚' : 'stable spatial boundaries and readable depth');
  const material = collectSceneDetailHints(text, SCENE_MATERIAL_HINTS)[0]
    || (useChinese ? '表面材质粗粝，细节明确' : 'rough tactile surfaces with clear material detail');
  const light = collectSceneDetailHints(text, SCENE_LIGHT_HINTS)[0]
    || (useChinese ? '光线偏冷，明暗层次清晰' : 'cool lighting with clear contrast separation');
  const weather = collectSceneDetailHints(text, SCENE_WEATHER_HINTS)[0]
    || (useChinese ? '空气湿度明显' : 'noticeable humidity in the air');
  const color = collectSceneDetailHints(text, SCENE_COLOR_HINTS)[0]
    || (useChinese ? '整体色调克制压抑' : 'a restrained muted color atmosphere');

  return [
    safeName,
    structure,
    material,
    light,
    weather,
    color
  ].filter(Boolean).join(useChinese ? '，' : ', ').slice(0, 500);
}

function deriveEnvironmentSceneDescription(text, fallbackName = '', characterNames = [], propNames = []) {
  const cleanFragments = [...new Set(splitSceneTextFragments(text)
    .filter((fragment) => isSafeSceneEnvironmentFragment(fragment, characterNames, propNames))
  )];
  const fragments = cleanFragments
    .filter((fragment) => isQualifiedSceneDescription(fragment))
    .slice(0, 3);

  if (fragments.length) {
    const joined = fragments.join('，').slice(0, 300);
    if (joined.length >= 8 && normalizeSemanticCompareText(joined) !== normalizeSemanticCompareText(fallbackName)) {
      return joined;
    }
  }

  return buildSceneDescriptionFromHints(text, fallbackName);
}

function deriveEnvironmentScenePrompt(text, fallbackName = '', characterNames = [], propNames = []) {
  const safeName = truncateSceneName(fallbackName) || deriveEnvironmentSceneName(text, 0, characterNames, propNames);
  if (!safeName) return '';
  const description = deriveEnvironmentSceneDescription(text, safeName, characterNames, propNames);
  return buildScenePromptFromHints(`${text} ${description}`, safeName);
}

function hasProvidedSceneTextConflicts(text, characterNames = [], propNames = []) {
  const value = normalizeSceneFieldText(text);
  if (!value) return true;
  return detectSceneEnvironmentIssues(value, characterNames, propNames).length > 0;
}

function preserveProvidedSceneDescription(row = {}, characterNames = [], propNames = []) {
  const directDescription = normalizeSceneFieldText(
    row?.description
    || row?.brief
    || row?.layout
    || row?.notes
    || row?.summary
    || row?.scene_description
    || row?.environment_description
    || row?.environmentDescription
    || ''
  );
  if (!directDescription) return '';
  if (/^(?:INT|EXT)\./i.test(directDescription)) return '';
  if (detectSceneDescriptionRuleIssues({ ...row, description: directDescription }, characterNames, propNames).length) return '';
  if (!hasOnlyEnvironmentLikeFragments(directDescription, 1)) return '';
  return directDescription.slice(0, 300);
}

function preserveProvidedScenePrompt(row = {}, characterNames = [], propNames = []) {
  const prompt = normalizeSceneFieldText(
    row?.prompt
    || row?.scene_prompt
    || row?.image_prompt
    || ''
  );
  if (!prompt) return '';
  if (detectScenePromptRuleIssues({ ...row, prompt }, characterNames, propNames).length) return '';
  if (!hasOnlyEnvironmentLikeFragments(prompt, 3)) return '';
  return prompt.slice(0, 500);
}

function sanitizeSceneRecord(row = {}, index = 0, characterNames = [], propNames = [], options = {}) {
  const previousName = normalizeSceneFieldText(options?.previousName || '');
  const allowPlaceholderFallback = options?.allowPlaceholderFallback === true;
  const allowAtmosphereFallback = options?.allowAtmosphereFallback === true;
  const sourceName = pickPreferredSceneSourceText(
    row?.slugline,
    row?.name,
    row?.scene_name,
    row?.sceneName,
    row?.environment,
    row?.scene,
    row?.setting,
    row?.location,
    row?.label,
    row?.场景名
  );
  const sourceDescription = pickPreferredSceneSourceText(
    row?.description,
    row?.brief,
    row?.layout,
    row?.notes,
    row?.summary,
    row?.scene_description,
    sourceName
  );
  const sourcePrompt = pickPreferredSceneSourceText(
    row?.prompt,
    row?.scene_prompt,
    row?.image_prompt,
    row?.environment_prompt,
    row?.environmentPrompt
  );
  const sourceBundle = [sourceName, sourceDescription, sourcePrompt].filter(Boolean).join('。');
  const preferredName = truncateSceneName(stripSceneNameLeadingTimeOrWeatherPhrase(sourceName));
  let name = preferredName;

  if (!name) {
    name = deriveEnvironmentSceneName(sourceBundle, index, characterNames, propNames, {
      previousName,
      allowPlaceholderFallback,
      allowAtmosphereFallback
    });
  }

  if (!name && previousName) {
    name = previousName;
  }

  let description = preserveProvidedSceneDescription(row, characterNames, propNames);
  if (!description) {
    description = deriveEnvironmentSceneDescription(sourceBundle, name, characterNames, propNames);
  }

  let prompt = preserveProvidedScenePrompt(row, characterNames, propNames);
  if (!prompt) {
    prompt = deriveEnvironmentScenePrompt(sourceBundle, name, characterNames, propNames);
  }

  if (
    description
    && prompt
    && normalizeSemanticCompareText(description) === normalizeSemanticCompareText(prompt)
  ) {
    prompt = buildScenePromptFromHints([name, description].filter(Boolean).join('。'), name);
  }

  if (!description && name) {
    description = buildSceneDescriptionFromHints(sourceBundle, name);
  }

  if (!prompt && name) {
    prompt = buildScenePromptFromHints([name, description, sourceBundle].filter(Boolean).join('。'), name);
  }

  return {
    ...row,
    name,
    scene_name: name,
    sceneName: name,
    slugline: normalizeSceneFieldText(row?.slugline || name),
    description,
    prompt
  };
}

function buildSceneAliasCandidates(scene = {}) {
  const rawCandidates = [
    scene?._sceneId,
    scene?._legacyId,
    scene?.scene_set_id,
    scene?.sceneSetId,
    scene?.environment,
    scene?.scene,
    scene?.setting,
    scene?.location,
    scene?.name,
    scene?.scene_name,
    scene?.sceneName,
    scene?.slugline
  ];
  const aliases = rawCandidates.flatMap((value) => {
    const normalized = normalizeSceneFieldText(value);
    if (!normalized) return [];
    const withoutPrefix = stripSceneNameLeadingTimeOrWeatherPhrase(normalized);
    return [
      normalized,
      stripSceneSuffix(normalized),
      withoutPrefix,
      stripSceneSuffix(withoutPrefix),
      ...extractSceneLocationCandidates(normalized),
      ...extractSceneLocationCandidates(withoutPrefix)
    ].filter(Boolean);
  });
  return [...new Set(aliases)];
}

function finalizeSceneLibrary(rawRows = [], episodeId, characterNames = [], propNames = [], options = {}) {
  const sceneLibrary = [];
  const seen = new Map();
  let previousSceneName = '';

  toLegacyLibraryArray(rawRows).forEach((row, index) => {
    const sceneId = normalizeSceneId(row?.scene_id || row?.sceneId || row?._legacyId, episodeId, index);
    const sanitizedScene = sanitizeSceneRecord({
      ...row,
      name: normalizeSceneFieldText(
        row?.name
        || row?.scene_name
        || row?.sceneName
        || row?.environment
        || row?.scene
        || row?.setting
        || row?.location
        || ''
      ),
      description: normalizeSceneFieldText(
        row?.description
        || row?.brief
        || row?.layout
        || row?.notes
        || row?.summary
        || row?.scene_description
        || row?.environment_description
        || row?.environmentDescription
        || row?.slugline
        || ''
      )
    }, index, characterNames, propNames, {
      previousName: previousSceneName,
      allowPlaceholderFallback: options?.allowPlaceholderFallback === true,
      allowAtmosphereFallback: options?.allowAtmosphereFallback === true
    });

    if (!sanitizedScene.name) {
      return;
    }

    const sceneRecord = {
      _sceneId: sceneId,
      _legacyId: row?._legacyId || '',
      scene_set_id: slugifyAssetId(row?.scene_set_id || row?.sceneSetId || row?._legacyId || sanitizedScene.name, 'scene', index),
      name: sanitizedScene.name,
      slugline: normalizeSceneFieldText(row?.slugline || sanitizedScene.slugline || sanitizedScene.name),
      description: sanitizedScene.description || sanitizedScene.name,
      prompt: sanitizedScene.prompt || '',
      scene_prompt: sanitizedScene.prompt || '',
      environment_prompt: sanitizedScene.prompt || ''
    };

    if (!sceneRecord.name) {
      return;
    }
    const key = normalizeSceneFieldText(sceneRecord.name).toLowerCase();
    const existingIndex = seen.get(key);

    previousSceneName = sceneRecord.name;

    if (Number.isInteger(existingIndex)) {
      const existing = sceneLibrary[existingIndex];
      sceneLibrary[existingIndex] = {
        ...existing,
        slugline: existing.slugline || sceneRecord.slugline,
        description: existing.description || sceneRecord.description,
        prompt: existing.prompt || sceneRecord.prompt,
        scene_prompt: existing.scene_prompt || sceneRecord.scene_prompt || existing.prompt || sceneRecord.prompt,
        environment_prompt: existing.environment_prompt || sceneRecord.environment_prompt || existing.scene_prompt || sceneRecord.scene_prompt || existing.prompt || sceneRecord.prompt
      };
      return;
    }

    seen.set(key, sceneLibrary.length);
    sceneLibrary.push(sceneRecord);
  });

  return sceneLibrary;
}

function buildFallbackSceneLibraryFromScreenplay(screenplay = '', episodeId = 'E001', characterLibrary = [], characterNames = [], propNames = []) {
  const sceneContexts = buildScreenplaySceneContexts(screenplay, [], characterLibrary, characterNames, propNames);
  if (!sceneContexts.length) return [];

  return finalizeSceneLibrary(
    sceneContexts.map((context) => ({
      scene_id: normalizeSceneId('', episodeId, context.index),
      name: context.sceneName || '',
      slugline: context.sceneName || '',
      description: [context.heading, context.text].filter(Boolean).join('\n'),
      prompt: context.text || context.heading || ''
    })),
    episodeId,
    characterNames,
    propNames,
    {
      allowPlaceholderFallback: true,
      allowAtmosphereFallback: true
    }
  );
}

function expandEpisodeSceneAssetLinks(rawLinks, episodeId = 'E001') {
  if (Array.isArray(rawLinks)) return rawLinks;
  if (!rawLinks || typeof rawLinks !== 'object') return [];

  const episodeEntries = Object.entries(rawLinks).filter(([key]) => /^E\d{3}$/i.test(String(key).trim()));
  if (!episodeEntries.length) {
    return toLegacyLibraryArray(rawLinks);
  }

  return episodeEntries.flatMap(([rawEpisodeId, value]) => {
    const normalizedEpisodeId = String(rawEpisodeId).trim().toUpperCase() || episodeId;
    if (Array.isArray(value)) {
      return value.map((sceneId) => ({
        episode_id: normalizedEpisodeId,
        scene_id: sceneId
      }));
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const scenes = Array.isArray(value.scenes)
      ? value.scenes
      : Array.isArray(value.scene_ids)
        ? value.scene_ids
        : Array.isArray(value.sceneIds)
          ? value.sceneIds
          : [];

    if (scenes.length > 0) {
      return scenes.map((sceneId) => ({
        episode_id: normalizedEpisodeId,
        scene_id: sceneId,
        scene_name: value.scene_name || value.sceneName || value.environment || value.scene || value.location || '',
        slugline: value.slugline || value.scene_name || value.sceneName || value.environment || value.scene || value.location || '',
        characters: coerceArrayValue(value.characters),
        costume_by_character: hasNonEmptyPlainObject(coercePlainObjectValue(value.costume_by_character))
          ? coercePlainObjectValue(value.costume_by_character)
          : {}
      }));
    }

    return [{
      ...value,
      episode_id: value.episode_id || normalizedEpisodeId
    }];
  });
}

function buildSceneAliasMap(sceneLibrary = []) {
  const aliasMap = new Map();
  sceneLibrary.forEach((scene) => {
    buildSceneAliasCandidates(scene).forEach((alias) => {
      const key = normalizeSceneFieldText(alias);
      if (key && !aliasMap.has(key)) {
        aliasMap.set(key, scene);
      }
    });
  });
  return aliasMap;
}

function buildPropAliasMap(propLibrary = []) {
  const aliasMap = new Map();
  propLibrary.forEach((prop) => {
    const propId = normalizePropText(prop?.prop_id);
    const name = normalizePropText(prop?.name);
    [propId, name]
      .map((value) => value.toLowerCase())
      .filter(Boolean)
      .forEach((key) => {
        if (!aliasMap.has(key)) {
          aliasMap.set(key, propId || name);
        }
      });
  });
  return aliasMap;
}

function normalizePropReferenceList(value, propAliasMap) {
  const source = coerceArrayValue(value);
  const names = source
    .map((item) => normalizePropText(typeof item === 'string' ? item : item?.name))
    .filter(Boolean)
    .map((name) => propAliasMap.get(name.toLowerCase()) || name);

  return Array.from(new Set(names));
}

function normalizePropsByCharacter(value, propAliasMap) {
  const source = coercePlainObjectValue(value);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(source)
      .map(([characterId, propRefs]) => [characterId, normalizePropReferenceList(propRefs, propAliasMap)])
      .filter(([, propRefs]) => propRefs.length > 0)
  );
}

function normalizeCharacterPromptValue(row = {}) {
  return String(
    row?.ai_prompt
    || row?.aiPrompt
    || row?.image_prompt_portrait
    || row?.imagePromptPortrait
    || row?.prompt_portrait
    || row?.promptPortrait
    || row?.prompt
    || ''
  ).trim();
}

function normalizeCharacterDescriptionValue(row = {}) {
  return String(
    row?.description
    || row?.appearance
    || row?.bio
    || row?.look
    || row?.base_look
    || ''
  ).trim();
}

function normalizeExtractedCharacterRecord(row = {}, index = 0, screenplay = '') {
  const name = row?.name || chooseLanguageText(screenplay || row?.description || row?.appearance || '', `角色${index + 1}`, `Character ${index + 1}`);
  const description = normalizeCharacterDescriptionValue(row);
  const prompt = normalizeCharacterPromptValue(row) || description;

  return {
    character_id: slugifyAssetId(row?.character_id || row?._legacyId || row?.name, 'character', index),
    name,
    description,
    bio: String(row?.bio || description).trim(),
    role: String(row?.role || row?.archetype || '').trim(),
    appearance: String(row?.appearance || row?.look || row?.base_look || description).trim(),
    prompt,
    ai_prompt: prompt,
    aiPrompt: prompt,
    image_prompt_portrait: String(row?.image_prompt_portrait || row?.imagePromptPortrait || prompt).trim(),
    imagePromptPortrait: String(row?.imagePromptPortrait || row?.image_prompt_portrait || prompt).trim(),
    prompt_portrait: String(row?.prompt_portrait || row?.promptPortrait || prompt).trim(),
    promptPortrait: String(row?.promptPortrait || row?.prompt_portrait || prompt).trim()
  };
}

function normalizeEpisodeSceneAssetLinks(rawLinks = [], sceneLibrary = [], episodeId, characterLibrary = [], costumeLibrary = [], characterNames = [], propNames = [], propLibrary = [], screenplay = '') {
  const aliasMap = buildSceneAliasMap(sceneLibrary);
  const propAliasMap = buildPropAliasMap(propLibrary);
  const characterAliasMap = buildCharacterAliasMap(characterLibrary);
  const costumeMap = buildPrimaryCostumeMap(costumeLibrary);
  const sceneContexts = buildScreenplaySceneContexts(screenplay, sceneLibrary, characterLibrary, characterNames, propNames);
  let previousScene = null;

  const normalizedLinks = expandEpisodeSceneAssetLinks(rawLinks, episodeId).map((row, index) => {
    const sceneId = normalizeSceneId(row?.scene_id || row?.sceneId, episodeId, index);
    const directMatch = sceneLibrary.find((scene) => (
      scene._sceneId === sceneId
      || String(scene._legacyId || '').toUpperCase() === String(row?.scene_id || row?.sceneId || '').toUpperCase()
      || scene.scene_set_id === row?.scene_set_id
      || scene.name === row?.scene_name
    )) || null;

    const candidateText = [
      directMatch?.name,
      directMatch?.slugline,
      row?.scene_name,
      row?.sceneName,
      row?.slugline,
      row?.environment,
      row?.scene,
      row?.location
    ]
      .filter(Boolean)
      .join('。');
    const derivedSceneName = deriveEnvironmentSceneName(
      candidateText,
      index,
      characterNames,
      propNames,
      { previousName: previousScene?.name || '' }
    );
    const resolvedScene = directMatch
      || aliasMap.get(normalizeSceneFieldText(derivedSceneName))
      || previousScene
      || null;

    if (!resolvedScene?.name) {
      return null;
    }

    previousScene = resolvedScene;
    const indexedSceneContext = sceneContexts[index] || null;
    const matchedSceneContext = sceneContexts.find((context) => (
      normalizeSceneFieldText(context.sceneName) === normalizeSceneFieldText(resolvedScene.name)
      || normalizeSceneFieldText(context.heading).includes(normalizeSceneFieldText(resolvedScene.name))
    )) || indexedSceneContext;
    const inferredCharacters = inferCharactersFromText(
      [resolvedScene?.description, row?.description, row?.slugline].filter(Boolean).join('\n'),
      characterLibrary
    );
    const rawCostumeByCharacter = coercePlainObjectValue(row?.costume_by_character);
    const rawCharacters = coerceArrayValue(row?.characters);
    const carriedCharacterIds = Object.keys(coercePlainObjectValue(row?.props_carried_by_character));
    const costumeCharacterIds = Object.keys(rawCostumeByCharacter);
    const normalizeCharacterRef = (value, fallbackIndex = 0) => {
      const normalized = normalizeSceneFieldText(value).toLowerCase();
      if (!normalized) return '';
      return characterAliasMap.get(normalized)
        || slugifyAssetId(normalized, 'character_ref', fallbackIndex);
    };
    const rawResolvedCharacters = Array.from(new Set(
      (rawCharacters.length
        ? rawCharacters
        : (matchedSceneContext?.characters?.length ? matchedSceneContext.characters : inferredCharacters)
      ).concat(carriedCharacterIds, costumeCharacterIds)
    ));
    const characters = rawResolvedCharacters
      .map((characterId, characterIndex) => normalizeCharacterRef(characterId, characterIndex))
      .filter(Boolean);
    const costumeByCharacter = hasNonEmptyPlainObject(rawCostumeByCharacter)
      ? Object.fromEntries(
        Object.entries(rawCostumeByCharacter)
          .map(([characterId, costumeId], characterIndex) => [
            normalizeCharacterRef(characterId, characterIndex),
            costumeId
          ])
          .filter(([characterId, costumeId]) => Boolean(characterId && costumeId))
      )
      : Object.fromEntries(
        characters
          .map((characterId) => [characterId, costumeMap.get(characterId)])
      .filter(([, costumeId]) => Boolean(costumeId))
      );
    const propsCarriedByCharacter = Object.fromEntries(
      Object.entries(normalizePropsByCharacter(row?.props_carried_by_character, propAliasMap))
        .map(([characterId, propRefs], characterIndex) => [
          normalizeCharacterRef(characterId, characterIndex),
          propRefs
        ])
        .filter(([characterId, propRefs]) => Boolean(characterId && propRefs.length > 0))
    );
    const scenePropsBase = normalizePropReferenceList(row?.scene_props_base, propAliasMap);

    return {
      episode_id: row?.episode_id || episodeId,
      scene_id: sceneId,
      scene_set_id: resolvedScene.scene_set_id,
      scene_name: resolvedScene.name,
      slugline: resolvedScene.slugline || resolvedScene.name,
      characters,
      costume_by_character: costumeByCharacter,
      props_carried_by_character: propsCarriedByCharacter,
      scene_props_base: scenePropsBase
    };
  }).filter(Boolean);

  if (normalizedLinks.length > 0) {
    const linkedSceneKeys = new Set(normalizedLinks.map((row) => (
      String(row?.scene_set_id || row?.scene_name || '').trim().toLowerCase()
    )).filter(Boolean));
    const inferredMissingLinks = sceneLibrary
      .filter((scene) => {
        const key = String(scene?.scene_set_id || scene?.name || '').trim().toLowerCase();
        return key && !linkedSceneKeys.has(key);
      })
      .map((scene, index) => ({
        episode_id: episodeId,
        scene_id: normalizeSceneId(scene._sceneId, episodeId, normalizedLinks.length + index),
        scene_set_id: scene.scene_set_id,
        scene_name: scene.name,
        slugline: scene.slugline,
        characters: (sceneContexts.find((context) => normalizeSceneFieldText(context.sceneName) === normalizeSceneFieldText(scene.name))?.characters)
          || inferCharactersFromText(scene.description, characterLibrary),
        costume_by_character: {},
        props_carried_by_character: {},
        scene_props_base: []
      }));
    return normalizedLinks.concat(inferredMissingLinks);
  }

  return sceneLibrary.map((scene, index) => ({
    episode_id: episodeId,
    scene_id: normalizeSceneId(scene._sceneId, episodeId, index),
    scene_set_id: scene.scene_set_id,
    scene_name: scene.name,
    slugline: scene.slugline,
    characters: (sceneContexts[index]?.characters?.length ? sceneContexts[index].characters : inferCharactersFromText(scene.description, characterLibrary)),
    costume_by_character: {},
    props_carried_by_character: {},
    scene_props_base: []
  }));
}

function coerceExtractedAssets(data, body = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  if (typeof data.result === 'string') {
    try {
      return coerceExtractedAssets(parseLooseJson(data.result), body);
    } catch {
      return data;
    }
  }

  if (data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets)) {
    const legacyAssets = data.assets;
    const episodeId = Number.isInteger(body?.episodeIndex)
      ? `E${String(body.episodeIndex + 1).padStart(3, '0')}`
      : 'E001';
    const characterLibrary = toLegacyLibraryArray(legacyAssets.characters).map((row, index) => (
      normalizeExtractedCharacterRecord(row, index, body?.screenplay || '')
    ));
    const propLibrary = finalizePropLibrary(toLegacyLibraryArray(legacyAssets.items));
    const characterNames = characterLibrary.map((row) => String(row?.name || '').trim()).filter(Boolean);
    const propNames = propLibrary.map((row) => String(row?.name || '').trim()).filter(Boolean);
    const sceneLibrary = (() => {
      const extractedScenes = finalizeSceneLibrary(legacyAssets.locations, episodeId, characterNames, propNames);
      if (extractedScenes.length > 0) {
        return extractedScenes;
      }
      return buildFallbackSceneLibraryFromScreenplay(body?.screenplay || '', episodeId, characterLibrary, characterNames, propNames);
    })();
    return {
      character_library: characterLibrary,
      costume_library: [],
      prop_library: propLibrary,
      scene_library: sceneLibrary.map(({ _sceneId, _legacyId, ...scene }) => scene),
      episode_scene_asset_links: normalizeEpisodeSceneAssetLinks([], sceneLibrary, episodeId, characterLibrary, [], characterNames, propNames, propLibrary, body?.screenplay || '')
    };
  }

  const episodeId = Number.isInteger(body?.episodeIndex)
    ? `E${String(body.episodeIndex + 1).padStart(3, '0')}`
    : 'E001';
  const characterLibrary = toLegacyLibraryArray(data.character_library).map((row, index) => (
    normalizeExtractedCharacterRecord(row, index, body?.screenplay || '')
  ));
  const costumeLibrary = toLegacyLibraryArray(data.costume_library).map((row, index) => ({
    costume_id: slugifyAssetId(row?.costume_id || row?._legacyId || row?.name, 'costume', index),
    name: row?.name || chooseLanguageText(body?.screenplay || row?.description || '', `服装${index + 1}`, `Costume ${index + 1}`),
    description: row?.description || '',
    character_id: slugifyAssetId(row?.character_id || row?.characterId || '', 'character_ref', index)
  }));
  const propLibrary = finalizePropLibrary(toLegacyLibraryArray(data.prop_library));
  const characterNames = characterLibrary.map((row) => String(row?.name || '').trim()).filter(Boolean);
  const propNames = propLibrary.map((row) => String(row?.name || '').trim()).filter(Boolean);
  const sceneLibrary = (() => {
    const extractedScenes = finalizeSceneLibrary(data.scene_library, episodeId, characterNames, propNames);
    if (extractedScenes.length > 0) {
      return extractedScenes;
    }
    return buildFallbackSceneLibraryFromScreenplay(body?.screenplay || '', episodeId, characterLibrary, characterNames, propNames);
  })();
  const episodeSceneAssetLinks = normalizeEpisodeSceneAssetLinks(
    data.episode_scene_asset_links,
    sceneLibrary,
    episodeId,
    characterLibrary,
    costumeLibrary,
    characterNames,
    propNames,
    propLibrary,
    body?.screenplay || ''
  );
  const knownCharacterIds = new Set(characterLibrary.map((row) => row.character_id).filter(Boolean));
  const supplementalCharacterIds = new Set();
  episodeSceneAssetLinks.forEach((row) => {
    coerceArrayValue(row?.characters).forEach((characterId) => {
      if (characterId && !knownCharacterIds.has(characterId)) supplementalCharacterIds.add(characterId);
    });
    Object.keys(coercePlainObjectValue(row?.costume_by_character)).forEach((characterId) => {
      if (characterId && !knownCharacterIds.has(characterId)) supplementalCharacterIds.add(characterId);
    });
    Object.keys(coercePlainObjectValue(row?.props_carried_by_character)).forEach((characterId) => {
      if (characterId && !knownCharacterIds.has(characterId)) supplementalCharacterIds.add(characterId);
    });
  });
  const supplementalCharacters = Array.from(supplementalCharacterIds).map((characterId, index) => ({
    character_id: slugifyAssetId(characterId, 'character_ref', index),
    name: humanizeSlugId(characterId, chooseLanguageText(body?.screenplay || '', `角色${characterLibrary.length + index + 1}`, `Character ${characterLibrary.length + index + 1}`)),
    description: '',
    bio: '',
    appearance: '',
    prompt: '',
    ai_prompt: '',
    aiPrompt: '',
    image_prompt_portrait: '',
    imagePromptPortrait: '',
    prompt_portrait: '',
    promptPortrait: ''
  }));

  return {
    character_library: characterLibrary.concat(supplementalCharacters),
    costume_library: costumeLibrary,
    prop_library: propLibrary,
    scene_library: sceneLibrary.map(({ _sceneId, _legacyId, ...scene }) => scene),
    episode_scene_asset_links: episodeSceneAssetLinks
  };
}

function buildStoryboardSceneCanon(assets, episodeIndex) {
  const assetPayload = assets && typeof assets === 'object' && !Array.isArray(assets)
    ? assets
    : null;
  if (!assetPayload) return null;

  const targetEpisodeId = Number.isInteger(episodeIndex)
    ? `E${String(episodeIndex + 1).padStart(3, '0')}`
    : '';
  const rawSceneLibrary = Array.isArray(assetPayload.scene_library) ? assetPayload.scene_library : [];
  const rawLinks = Array.isArray(assetPayload.episode_scene_asset_links) ? assetPayload.episode_scene_asset_links : [];
  const links = targetEpisodeId
    ? rawLinks.filter((link) => String(link?.episode_id || '').trim() === targetEpisodeId)
    : rawLinks;

  const sceneLibrary = rawSceneLibrary.filter((scene) => {
    if (!scene?.name) return false;
    if (!links.length) return true;
    return links.some((link) => (
      String(link?.scene_set_id || '').trim() === String(scene?.scene_set_id || '').trim()
      || String(link?.scene_name || link?.slugline || '').trim() === String(scene?.name || scene?.slugline || '').trim()
    ));
  });

  if (!sceneLibrary.length) return null;
  return {
    sceneLibrary,
    aliasMap: buildSceneAliasMap(sceneLibrary)
  };
}

function resolveStoryboardSceneName(rawValue, sceneCanon, previousSceneName = '') {
  const text = normalizeSceneFieldText(rawValue);
  if (!text) {
    return previousSceneName || '';
  }

  const directMatch = sceneCanon?.aliasMap?.get(text);
  if (directMatch?.name) {
    return directMatch.name;
  }

  const derivedName = deriveEnvironmentSceneName(
    text,
    0,
    [],
    [],
    { previousName: previousSceneName || '' }
  );
  if (!derivedName) {
    return previousSceneName || '';
  }

  const derivedMatch = sceneCanon?.aliasMap?.get(normalizeSceneFieldText(derivedName));
  if (derivedMatch?.name) {
    return derivedMatch.name;
  }

  return isReliableEnvironmentSceneName(derivedName, [], []) ? derivedName : (previousSceneName || '');
}

export function normalizeStoryboardCsv(text, body = {}) {
  const normalizedText = splitSingleLineStoryboardRows(
    stripThinkingBlock(stripCodeFence(text).replace(/^\ufeff/, ''))
  );
  const lines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return `${STORYBOARD_HEADER}\n`;

  const expectedColumns = STORYBOARD_COLUMNS;
  const requiredColumns = new Set(expectedColumns.filter((column) => !['场景', '道具', '旁白', '音效', '台词', '叙事功能', '画风'].includes(column)));
  const normalizedHeader = normalizeStoryboardHeader(lines[0]);
  const firstRowCells = parseCsvLine(lines[0]);
  const firstLineLooksLikeData = /^"?\d{1,3}"?$/.test(String(firstRowCells[0] || '').trim());
  const hasHeader = (
    normalizedHeader === STORYBOARD_HEADER
    || normalizedHeader === LEGACY_STORYBOARD_HEADER
  ) && !firstLineLooksLikeData;
  const dataStartIndex = hasHeader ? 1 : 0;
  const rawDataText = lines.slice(dataStartIndex).join('\n');
  const detectedRowStartCount = Array.from(rawDataText.matchAll(STORYBOARD_ROW_START_RE)).length;
  const sceneCanon = buildStoryboardSceneCanon(body.assets || body.assetLibrary, body?.episodeIndex);
  const sceneColumnIndex = expectedColumns.indexOf('场景');
  const timecodeColumnIndex = expectedColumns.indexOf('时间码');
  const emptyValue = chooseLanguageText(body?.screenplay || text, '无', 'None');
  let previousSceneName = '';
  let nextShotStartSeconds = 0;

  const out = [STORYBOARD_HEADER];
  for (let index = dataStartIndex; index < lines.length; index += 1) {
    let cells = parseStoryboardRowCells(lines[index]);
    if (cells.length === LEGACY_STORYBOARD_COLUMNS.length) {
      cells = [
        ...cells.slice(0, STORYBOARD_STYLE_COLUMN_INDEX),
        '',
        ...cells.slice(STORYBOARD_STYLE_COLUMN_INDEX)
      ];
    }
    if (cells.length > expectedColumns.length) {
      cells = cells.slice(0, expectedColumns.length - 1).concat(cells.slice(expectedColumns.length - 1).join('，'));
    }
    if (cells.length < expectedColumns.length) {
      cells = cells.concat(Array(expectedColumns.length - cells.length).fill(''));
    }
    cells[0] = String(out.length).padStart(3, '0');
    if (timecodeColumnIndex >= 0) {
      const normalizedTimecode = normalizeStoryboardTimecode(cells[timecodeColumnIndex], nextShotStartSeconds);
      cells[timecodeColumnIndex] = normalizedTimecode.text;
      nextShotStartSeconds = normalizedTimecode.endSeconds;
    }
    if (sceneColumnIndex >= 0) {
      const resolvedSceneName = resolveStoryboardSceneName(cells[sceneColumnIndex], sceneCanon, previousSceneName);
      cells[sceneColumnIndex] = resolvedSceneName;
      if (resolvedSceneName) {
        previousSceneName = resolvedSceneName;
      }
    }
    expectedColumns.forEach((column, columnIndex) => {
      if (requiredColumns.has(column) && !String(cells[columnIndex] ?? '').trim()) {
        cells[columnIndex] = emptyValue;
      }
    });
    out.push(encodeCsvRow(cells));
  }

  const parsedRowCount = out.length - 1;
  if (detectedRowStartCount > 1 && parsedRowCount < detectedRowStartCount) {
    throw new Error(`Expected ${detectedRowStartCount} storyboard rows but normalized only ${parsedRowCount}`);
  }

  return `${out.join('\n')}\n`;
}

export function validateExtractedAssets(data, body = {}) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { pass: false, errors: [{ message: 'Extractor output must be a JSON object with 5 libraries', location: 'root' }], warnings: [] };
  }

  const requiredTop = [
    'character_library',
    'costume_library',
    'prop_library',
    'scene_library',
    'episode_scene_asset_links'
  ];

  for (const key of requiredTop) {
    if (!Array.isArray(data[key])) {
      errors.push({ message: `Missing required top-level array: ${key}`, location: key });
    }
  }

  const slugRe = /^[a-z0-9_]+$/;
  const episodeRe = /^E\d{3}$/;
  const sceneRe = /^E\d{3}_S\d{2}$/;

  if (Array.isArray(data.character_library)) {
    data.character_library.forEach((row, index) => {
      if (!row?.character_id || !slugRe.test(String(row.character_id))) {
        errors.push({ message: 'character_id must be lowercase slug', location: `character_library[${index}].character_id` });
      }
      if (!row?.name) {
        errors.push({ message: 'name is required', location: `character_library[${index}].name` });
      }
    });
  }

  if (Array.isArray(data.costume_library)) {
    data.costume_library.forEach((row, index) => {
      if (!row?.costume_id || !slugRe.test(String(row.costume_id))) {
        errors.push({ message: 'costume_id must be lowercase slug', location: `costume_library[${index}].costume_id` });
      }
    });
  }

  if (Array.isArray(data.prop_library)) {
    data.prop_library.forEach((row, index) => {
      if (!row?.prop_id || !slugRe.test(String(row.prop_id))) {
        errors.push({ message: 'prop_id must be lowercase slug', location: `prop_library[${index}].prop_id` });
      }
      ['name', 'description', 'prompt'].forEach((field) => {
        if (!String(row?.[field] || '').trim()) {
          errors.push({ message: `${field} is required`, location: `prop_library[${index}].${field}` });
        }
      });
    });
  }

  if (Array.isArray(data.scene_library)) {
    data.scene_library.forEach((row, index) => {
      if (!row?.scene_set_id || !slugRe.test(String(row.scene_set_id))) {
        errors.push({ message: 'scene_set_id must be lowercase slug', location: `scene_library[${index}].scene_set_id` });
      }
      if (!row?.slugline) {
        errors.push({ message: 'slugline is required', location: `scene_library[${index}].slugline` });
      }
    });
  }

  const characterIds = new Set(Array.isArray(data.character_library) ? data.character_library.map((row) => row?.character_id).filter(Boolean) : []);
  const propIds = new Set(Array.isArray(data.prop_library) ? data.prop_library.map((row) => row?.prop_id).filter(Boolean) : []);
  const characterNames = Array.isArray(data.character_library)
    ? data.character_library.map((row) => String(row?.name || '').trim()).filter(Boolean)
    : [];
  const propNames = Array.isArray(data.prop_library)
    ? data.prop_library.map((row) => String(row?.name || '').trim()).filter(Boolean)
    : [];

  if (Array.isArray(data.episode_scene_asset_links)) {
    const seen = new Set();
    data.episode_scene_asset_links.forEach((row, index) => {
      const location = `episode_scene_asset_links[${index}]`;
      if (!row?.episode_id || !episodeRe.test(String(row.episode_id))) {
        errors.push({ message: 'episode_id must match E###', location: `${location}.episode_id` });
      }
      if (!row?.scene_id || !sceneRe.test(String(row.scene_id))) {
        errors.push({ message: 'scene_id must match E###_S##', location: `${location}.scene_id` });
      }
      if (!row?.slugline) {
        errors.push({ message: 'slugline is required', location: `${location}.slugline` });
      }
      if (!Array.isArray(row?.characters)) {
        errors.push({ message: 'characters must be an array', location: `${location}.characters` });
      }
      if (!row?.costume_by_character || typeof row.costume_by_character !== 'object' || Array.isArray(row.costume_by_character)) {
        errors.push({ message: 'costume_by_character must be an object', location: `${location}.costume_by_character` });
      }
      if (!row?.props_carried_by_character || typeof row.props_carried_by_character !== 'object' || Array.isArray(row.props_carried_by_character)) {
        errors.push({ message: 'props_carried_by_character must be an object', location: `${location}.props_carried_by_character` });
      }
      if (!Array.isArray(row?.scene_props_base)) {
        errors.push({ message: 'scene_props_base must be an array', location: `${location}.scene_props_base` });
      }

      const sceneCharacters = Array.isArray(row?.characters) ? row.characters : [];
      for (const characterId of sceneCharacters) {
        if (!characterIds.has(characterId)) {
          errors.push({ message: `Unknown character_id referenced: ${characterId}`, location: `${location}.characters` });
        }
      }

      const propsCarriedByCharacter = row?.props_carried_by_character && typeof row.props_carried_by_character === 'object' && !Array.isArray(row.props_carried_by_character)
        ? row.props_carried_by_character
        : {};
      Object.entries(propsCarriedByCharacter).forEach(([characterId, propRefs]) => {
        if (!characterIds.has(characterId)) {
          errors.push({ message: `Unknown character_id referenced: ${characterId}`, location: `${location}.props_carried_by_character` });
        }
        if (!Array.isArray(propRefs)) {
          errors.push({ message: 'props_carried_by_character values must be arrays', location: `${location}.props_carried_by_character.${characterId}` });
          return;
        }
        propRefs.forEach((propId) => {
          if (!propIds.has(String(propId || '').trim())) {
            errors.push({ message: `Unknown prop_id referenced: ${propId}`, location: `${location}.props_carried_by_character.${characterId}` });
          }
        });
      });

      const scenePropsBase = Array.isArray(row?.scene_props_base) ? row.scene_props_base : [];
      scenePropsBase.forEach((propId) => {
        if (!propIds.has(String(propId || '').trim())) {
          errors.push({ message: `Unknown prop_id referenced: ${propId}`, location: `${location}.scene_props_base` });
        }
      });

      if (row?.scene_id && Array.isArray(row?.characters)) {
        sceneCharacters.forEach((characterId) => {
          const dedupeKey = `${row.scene_id}:${characterId}`;
          if (seen.has(dedupeKey)) {
            errors.push({ message: `Duplicate character within scene: ${characterId}`, location });
          } else {
            seen.add(dedupeKey);
          }
        });
      }
    });
  }

  const semanticQc = validateExtractedAssetSemantics(data, body);
  errors.push(...semanticQc.errors);
  warnings.push(...semanticQc.warnings);

  return { pass: errors.length === 0, errors, warnings };
}

function countScreenplaySceneCues(screenplay = '') {
  const text = String(screenplay || '');
  if (!text) return 0;

  const sceneBlockCount = (text.match(/\[\s*Scene\s+\d+\s*\]/gi) || []).length;
  const intExtCount = text
    .split('\n')
    .map((line) => extractInlineScreenplayHeading(line))
    .filter(Boolean)
    .length;
  return Math.max(sceneBlockCount, intExtCount);
}

function normalizeSemanticCompareText(value) {
  return normalizeSceneFieldText(value)
    .replace(/[\s，,。；;：:、]/g, '')
    .trim();
}

function hasThinScenePrompt(scene = {}) {
  const prompt = normalizeSceneFieldText(scene?.prompt);
  if (!prompt) return true;
  if (prompt.length < 12) return true;

  const normalizedPrompt = normalizeSemanticCompareText(prompt);
  const sourceTexts = [
    scene?.name,
    scene?.slugline,
    scene?.description
  ]
    .map(normalizeSemanticCompareText)
    .filter(Boolean);

  if (sourceTexts.some((source) => normalizedPrompt === source)) return true;

  const meaningfulSegments = prompt
    .split(/[，,]/)
    .map((segment) => normalizeSceneFieldText(segment))
    .filter(Boolean)
    .filter((segment) => segment !== '环境空镜' && segment !== '纯场景氛围' && !segment.startsWith('环境关键词：'));

  if (meaningfulSegments.length < 2) return true;

  const promptOnlyRepeatsKnownFields = meaningfulSegments.every((segment) => {
    const normalizedSegment = normalizeSemanticCompareText(segment);
    return sourceTexts.includes(normalizedSegment);
  });

  return promptOnlyRepeatsKnownFields;
}

function hasThinSceneDescription(scene = {}) {
  const description = normalizeSceneFieldText(scene?.description);
  if (!description) return true;
  if (description.length < 8) return true;

  const normalizedDescription = normalizeSemanticCompareText(description);
  const sourceTexts = [
    scene?.name,
    scene?.slugline
  ]
    .map(normalizeSemanticCompareText)
    .filter(Boolean);

  return sourceTexts.some((source) => normalizedDescription === source);
}

function hasThinPropDescription(prop = {}) {
  const name = normalizePropText(prop?.name);
  if (!name) return false;

  const description = normalizePropText(prop?.description);
  if (!description) return true;
  if (description.length < 8) return true;

  return normalizeSemanticCompareText(description) === normalizeSemanticCompareText(name);
}

function hasThinPropPrompt(prop = {}) {
  const name = normalizePropText(prop?.name);
  if (!name) return false;

  const prompt = normalizePropText(prop?.prompt);
  if (!prompt) return true;
  if (prompt.length < 12) return true;

  const description = normalizePropText(prop?.description);
  const normalizedPrompt = normalizeSemanticCompareText(prompt);
  return normalizedPrompt === normalizeSemanticCompareText(name)
    || (description && normalizedPrompt === normalizeSemanticCompareText(description));
}

function validateExtractedAssetSemantics(data, body = {}) {
  const errors = [];
  const warnings = [];

  const screenplay = String(body?.screenplay || '');
  const sceneCueCount = countScreenplaySceneCues(screenplay);
  const sceneLibrary = Array.isArray(data?.scene_library) ? data.scene_library : [];
  const sceneLinks = Array.isArray(data?.episode_scene_asset_links) ? data.episode_scene_asset_links : [];

  if (sceneCueCount > 0 && sceneLibrary.length === 0) {
    errors.push({
      message: `screenplay contains ${sceneCueCount} explicit scene cues, so scene_library cannot be empty`,
      location: 'scene_library'
    });
  }

  if (sceneLibrary.length > 0 && sceneLinks.length === 0) {
    errors.push({
      message: 'episode_scene_asset_links cannot be empty when scene_library is present',
      location: 'episode_scene_asset_links'
    });
  }

  sceneLibrary.forEach((scene, index) => {
    if (hasThinSceneDescription(scene)) {
      warnings.push({
        message: 'scene description is too short or only repeats the scene name',
        location: `scene_library[${index}].description`
      });
    }
    if (hasThinScenePrompt(scene)) {
      warnings.push({
        message: 'scene prompt is too short or only repeats the scene name/description',
        location: `scene_library[${index}].prompt`
      });
    }
  });

  const propLibrary = Array.isArray(data?.prop_library) ? data.prop_library : [];
  propLibrary.forEach((prop, index) => {
    if (hasThinPropDescription(prop)) {
      warnings.push({
        message: 'prop description is too short and should include visual/material/use detail',
        location: `prop_library[${index}].description`
      });
    }
    if (hasThinPropPrompt(prop)) {
      warnings.push({
        message: 'prop prompt is too short and should expand beyond the prop name/description',
        location: `prop_library[${index}].prompt`
      });
    }
  });

  return { pass: errors.length === 0, errors, warnings };
}

export function normalizePipelineStepOutput(stepId, rawText, body = {}) {
  const text = String(rawText ?? '');

  if (stepId === 'breakdown') {
    return { result: normalizeBreakdownCsv(text) };
  }

  if (stepId === 'extract-assets') {
    try {
      const data = coerceExtractedAssets(parseLooseJson(text), body);
      const qc = validateExtractedAssets(data, body);
      if (!qc.pass) {
        return {
          error: 'extract_assets_schema_failed',
          details: qc,
          raw: text.slice(0, 4000)
        };
      }
      return { result: JSON.stringify(data) };
    } catch (err) {
      return {
        error: 'extract_assets_json_parse_failed',
        details: { message: err.message },
        raw: text.slice(0, 4000)
      };
    }
  }

  if (stepId === 'design-characters') {
    try {
      const data = coerceCharacterCostumeAssets(parseLooseJson(text), body);
      const qc = validateCharacterCostumeAssets(data);
      if (!qc.pass) {
        return {
          error: 'design_characters_schema_failed',
          details: qc,
          raw: text.slice(0, 4000)
        };
      }
      return { result: JSON.stringify(data) };
    } catch (err) {
      return {
        error: 'design_characters_json_parse_failed',
        details: { message: err.message },
        raw: text.slice(0, 4000)
      };
    }
  }

  if (stepId === 'storyboard') {
    try {
      return { result: normalizeStoryboardCsv(text, body) };
    } catch (err) {
      return {
        error: 'storyboard_csv_malformed',
        details: { message: err.message },
        raw: text.slice(0, 4000)
      };
    }
  }

  if (stepId === 'qc-assets') {
    const assetsInput = typeof body.assets === 'string' ? parseLooseJson(body.assets) : body.assets;
    return { result: JSON.stringify(validateExtractedAssets(assetsInput, body)) };
  }

  return { result: text };
}

export { BREAKDOWN_HEADER, STORYBOARD_HEADER };
