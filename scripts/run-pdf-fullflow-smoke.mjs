#!/usr/bin/env node

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const RUN_DATE = new Date().toISOString().slice(0, 10);

const DEFAULTS = {
  pdfPath: '/Users/jiangchengji/小说/《阿凡达》中文剧本.pdf',
  baseUrl: 'http://localhost:3001',
  projectId: `avatar_pdf_fullflow_${RUN_DATE.replace(/-/g, '')}`,
  totalEpisodes: 5,
  episodeDuration: 90,
  shotsPerMin: 8,
  screenplayEpisodes: 5,
  screenplayConcurrency: Math.max(1, Number(process.env.MAX_CONCURRENT_PIPELINE || 6)),
  storyboardEpisodeIndex: 3,
  provider: 'dashscope',
  startAt: 'extract-bible'
};

const OUTPUT_DIR = path.resolve(
  process.env.PDF_FULLFLOW_OUTPUT_DIR || path.join(
    process.cwd(),
    'docs',
    `avatar-pdf-fullflow-${RUN_DATE}`
  )
);

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--pdf' && next) {
      args.pdfPath = next;
      i += 1;
    } else if (arg === '--base-url' && next) {
      args.baseUrl = next;
      i += 1;
    } else if (arg === '--project-id' && next) {
      args.projectId = next;
      i += 1;
    } else if (arg === '--episodes' && next) {
      args.totalEpisodes = Number(next);
      i += 1;
    } else if (arg === '--episode-duration' && next) {
      args.episodeDuration = Number(next);
      i += 1;
    } else if (arg === '--screenplay-concurrency' && next) {
      args.screenplayConcurrency = Number(next);
      i += 1;
    } else if (arg === '--shots-per-min' && next) {
      args.shotsPerMin = Number(next);
      i += 1;
    } else if (arg === '--screenplay-episodes' && next) {
      args.screenplayEpisodes = Number(next);
      i += 1;
    } else if (arg === '--storyboard-episode' && next) {
      args.storyboardEpisodeIndex = Number(next) - 1;
      i += 1;
    } else if (arg === '--provider' && next) {
      args.provider = next;
      i += 1;
    } else if (arg === '--start-at' && next) {
      args.startAt = next;
      i += 1;
    }
  }
  return args;
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function extractPdfText(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], {
    maxBuffer: 1024 * 1024 * 20
  });
  return stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function fetchJson(url, options = {}, timeoutMs = 10 * 60 * 1000) {
  const startedAt = Date.now();
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--max-time',
    String(Math.ceil(timeoutMs / 1000)),
    '--write-out',
    '\n__CURL_STATUS__:%{http_code}'
  ];

  const method = options.method || 'GET';
  if (method) {
    args.push('-X', method);
  }

  for (const [key, value] of Object.entries(options.headers || {})) {
    args.push('-H', `${key}: ${value}`);
  }

  if (options.body != null) {
    args.push('--data-binary', options.body);
  }

  args.push(url);

  const { stdout, stderr } = await execFileAsync('curl', args, {
    maxBuffer: 1024 * 1024 * 20
  });

  const marker = '\n__CURL_STATUS__:';
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`curl status marker missing for ${url}. stderr=${stderr}`);
  }

  const bodyText = stdout.slice(0, markerIndex);
  const statusText = stdout.slice(markerIndex + marker.length).trim();
  const statusCode = Number(statusText);

  let json;
  try {
    json = bodyText ? JSON.parse(bodyText) : {};
  } catch (err) {
    throw new Error(`Non-JSON response from ${url}: ${bodyText.slice(0, 500)}`);
  }

  if (!Number.isFinite(statusCode) || statusCode >= 400) {
    throw new Error(`${statusCode || 'UNKNOWN'} ${JSON.stringify(json).slice(0, 500)}`);
  }

  return { json, durationMs: Date.now() - startedAt };
}

function stripCodeFence(text) {
  const raw = String(text ?? '').trim();
  if (!raw.startsWith('```')) return raw;
  return raw
    .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

function extractJsonBlock(text) {
  const raw = stripCodeFence(text);
  if (!raw) return raw;
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return raw.slice(firstBracket, lastBracket + 1);
  }
  return raw;
}

function safeJsonParse(text, label) {
  const jsonText = extractJsonBlock(text);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const wrapped = `[${jsonText}]`;
    try {
      return JSON.parse(wrapped);
    } catch {
      // fall through to the original error below
    }
    throw new Error(`${label} JSON parse failed: ${err.message}\nPreview: ${jsonText.slice(0, 500)}`);
  }
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function parseBreakdownCsv(text) {
  const defaultHeaders = [
    'ep_id',
    'source_range',
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
  const cleaned = stripCodeFence(text)
    .replace(/^\uFEFF/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = cleaned.findIndex((line) => line.startsWith('ep_id,'));
  const headerLine = headerIndex >= 0 ? cleaned[headerIndex] : defaultHeaders.join(',');
  const headers = headerIndex >= 0 ? parseCsvLine(headerLine) : defaultHeaders;
  const rows = [];

  for (const line of cleaned.slice(headerIndex >= 0 ? headerIndex + 1 : 0)) {
    if (!/^E\d{3},/.test(line)) continue;
    const parsed = parseCsvLine(line);
    if (parsed.length > headers.length) {
      const fixed = parsed.slice(0, headers.length - 1);
      fixed.push(parsed.slice(headers.length - 1).join(','));
      rows.push(fixed);
    } else if (parsed.length < headers.length) {
      rows.push(parsed.concat(Array(headers.length - parsed.length).fill('')));
    } else {
      rows.push(parsed);
    }
  }

  if (!rows.length) {
    throw new Error('Breakdown rows are empty after parsing.');
  }

  return { headers, rows, csv: [headerLine, ...rows.map((row) => row.join(','))].join('\n') };
}

function indexByHeader(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
}

function parseSourceRange(sourceRange) {
  const normalized = String(sourceRange || '').replace(/[—–~～至]/g, '-');
  const match = normalized.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2])
  };
}

function excerptFromRange(lines, sourceRange) {
  const parsed = parseSourceRange(sourceRange);
  if (!parsed) return '';
  const start = Math.max(1, parsed.start);
  const end = Math.max(start, parsed.end);
  return lines.slice(start - 1, end).join('\n').trim();
}

function summarizeStep(payload, durationMs) {
  return {
    durationMs,
    tokens: payload.tokens || {},
    step: payload.step,
    agent: payload.agent
  };
}

function toPrettyJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function markdownPreview(text, limit = 1200) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '(empty)';
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}\n...(truncated)` : trimmed;
}

async function saveText(filePath, content) {
  await writeFile(filePath, String(content), 'utf8');
}

async function saveJson(filePath, data) {
  await writeFile(filePath, toPrettyJson(data), 'utf8');
}

async function loadJson(filePath) {
  const text = await import('fs/promises').then((fs) => fs.readFile(filePath, 'utf8'));
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(process.argv);
  const startStageRank = {
    'extract-bible': 0,
    'breakdown': 1,
    'screenplay': 2,
    'assets': 3
  };
  const startRank = startStageRank[args.startAt] ?? 0;
  const runSeed = Number(process.env.PIPELINE_STABLE_SEED || 20260319);
  const withProvider = (payload) => {
    const merged = {
      generationMode: 'stable',
      seed: runSeed,
      ...payload
    };
    if (args.provider) {
      merged.provider = args.provider;
    }
    return merged;
  };

  if (!existsSync(args.pdfPath)) {
    throw new Error(`PDF not found: ${args.pdfPath}`);
  }

  await ensureDir(OUTPUT_DIR);

  log(`Output dir: ${OUTPUT_DIR}`);
  log(`Project ID: ${args.projectId}`);

  const summary = {
    projectId: args.projectId,
    pdfPath: args.pdfPath,
    baseUrl: args.baseUrl,
    totalEpisodes: args.totalEpisodes,
    episodeDuration: args.episodeDuration,
    shotsPerMin: args.shotsPerMin,
    generationMode: 'stable',
    seed: runSeed,
    screenplayEpisodes: args.screenplayEpisodes,
    screenplayConcurrency: args.screenplayConcurrency,
    storyboardEpisodeIndex: args.storyboardEpisodeIndex,
    steps: {},
    generatedFiles: [],
    totals: {
      inputTokens: 0,
      outputTokens: 0
    }
  };

  const health = await fetchJson(`${args.baseUrl}/api/health`);
  summary.health = health.json;
  await saveJson(path.join(OUTPUT_DIR, '00-health.json'), health.json);
  summary.generatedFiles.push('00-health.json');

  const novelText = await extractPdfText(args.pdfPath);
  const sourceLines = novelText.split('\n');
  await saveText(path.join(OUTPUT_DIR, '01-source.txt'), novelText);
  summary.generatedFiles.push('01-source.txt');
  summary.sourceStats = {
    characters: novelText.length,
    lines: sourceLines.length
  };

  const projectConfig = {
    sourcePdf: args.pdfPath,
    totalEpisodes: args.totalEpisodes,
    episodeDuration: args.episodeDuration,
    shotsPerMin: args.shotsPerMin,
    provider: args.provider || null,
    generationMode: 'stable',
    seed: runSeed,
    generatedAt: new Date().toISOString()
  };
  await fetchJson(`${args.baseUrl}/api/projects/${args.projectId}/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectConfig })
  });

  let storyBible;
  if (startRank <= 0) {
    log('1/6 extract-bible');
    const bibleResp = await fetchJson(`${args.baseUrl}/api/pipeline/extract-bible`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withProvider({
        projectId: args.projectId,
        novelText,
        totalEpisodes: args.totalEpisodes,
        episodeDuration: args.episodeDuration,
        shotsPerMin: args.shotsPerMin
      }))
    });
    await saveJson(path.join(OUTPUT_DIR, '02-extract-bible.raw.json'), bibleResp.json);
    summary.generatedFiles.push('02-extract-bible.raw.json');
    summary.steps.extractBible = summarizeStep(bibleResp.json, bibleResp.durationMs);
    summary.totals.inputTokens += bibleResp.json.tokens?.input || 0;
    summary.totals.outputTokens += bibleResp.json.tokens?.output || 0;

    storyBible = safeJsonParse(bibleResp.json.result, 'extract-bible');
    await saveJson(path.join(OUTPUT_DIR, '03-story-bible.json'), storyBible);
    summary.generatedFiles.push('03-story-bible.json');
  } else {
    storyBible = await loadJson(path.join(OUTPUT_DIR, '03-story-bible.json'));
    if (existsSync(path.join(OUTPUT_DIR, '02-extract-bible.raw.json'))) {
      summary.generatedFiles.push('02-extract-bible.raw.json');
    }
    summary.generatedFiles.push('03-story-bible.json');
  }

  await fetchJson(`${args.baseUrl}/api/projects/${args.projectId}/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyBible })
  });

  let breakdown;
  if (startRank <= 1) {
    log('2/6 breakdown');
    const breakdownResp = await fetchJson(`${args.baseUrl}/api/pipeline/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withProvider({
        projectId: args.projectId,
        novelText,
        totalEpisodes: args.totalEpisodes
      }))
    });
    await saveJson(path.join(OUTPUT_DIR, '04-breakdown.raw.json'), breakdownResp.json);
    summary.generatedFiles.push('04-breakdown.raw.json');
    summary.steps.breakdown = summarizeStep(breakdownResp.json, breakdownResp.durationMs);
    summary.totals.inputTokens += breakdownResp.json.tokens?.input || 0;
    summary.totals.outputTokens += breakdownResp.json.tokens?.output || 0;

    breakdown = parseBreakdownCsv(breakdownResp.json.result);
    await saveText(path.join(OUTPUT_DIR, '05-breakdown.csv'), breakdown.csv);
    await saveJson(path.join(OUTPUT_DIR, '06-breakdown.json'), {
      headers: breakdown.headers,
      rows: breakdown.rows.map((row) => indexByHeader(breakdown.headers, row))
    });
    summary.generatedFiles.push('05-breakdown.csv', '06-breakdown.json');
  } else {
    if (existsSync(path.join(OUTPUT_DIR, '06-breakdown.json'))) {
      const breakdownJson = await loadJson(path.join(OUTPUT_DIR, '06-breakdown.json'));
      breakdown = {
        headers: breakdownJson.headers,
        rows: breakdownJson.rows.map((row) => breakdownJson.headers.map((header) => row[header] ?? '')),
        csv: existsSync(path.join(OUTPUT_DIR, '05-breakdown.csv'))
          ? await import('fs/promises').then((fs) => fs.readFile(path.join(OUTPUT_DIR, '05-breakdown.csv'), 'utf8'))
          : ''
      };
    } else {
      const breakdownRaw = await loadJson(path.join(OUTPUT_DIR, '04-breakdown.raw.json'));
      breakdown = parseBreakdownCsv(breakdownRaw.result);
      await saveText(path.join(OUTPUT_DIR, '05-breakdown.csv'), breakdown.csv);
      await saveJson(path.join(OUTPUT_DIR, '06-breakdown.json'), {
        headers: breakdown.headers,
        rows: breakdown.rows.map((row) => indexByHeader(breakdown.headers, row))
      });
    }
    summary.generatedFiles.push('04-breakdown.raw.json', '05-breakdown.csv', '06-breakdown.json');
  }

  await fetchJson(`${args.baseUrl}/api/projects/${args.projectId}/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      breakdownHeaders: breakdown.headers,
      breakdownRows: breakdown.rows
    })
  });

  const screenplayCount = Math.min(args.screenplayEpisodes, breakdown.rows.length);
  const screenplayMap = {};

  if (startRank <= 2) {
    log(`3/6 screenplays x ${screenplayCount} (concurrency ${args.screenplayConcurrency})`);
    let nextEpisodeIndex = 0;
    const workerCount = Math.max(1, Math.min(args.screenplayConcurrency || 1, screenplayCount));
    const runScreenplayWorker = async () => {
      while (nextEpisodeIndex < screenplayCount) {
        const episodeIndex = nextEpisodeIndex;
        nextEpisodeIndex += 1;

      const row = breakdown.rows[episodeIndex];
      const rowObj = indexByHeader(breakdown.headers, row);
      const sourceText = excerptFromRange(sourceLines, rowObj.source_range) || JSON.stringify(rowObj, null, 2);
      const epId = rowObj.ep_id || `E${String(episodeIndex + 1).padStart(3, '0')}`;
      const rawName = `07-screenplay-${epId}.raw.json`;
      const textName = `08-screenplay-${epId}.txt`;

      if (existsSync(path.join(OUTPUT_DIR, rawName)) && existsSync(path.join(OUTPUT_DIR, textName))) {
        screenplayMap[episodeIndex] = await import('fs/promises')
          .then((fs) => fs.readFile(path.join(OUTPUT_DIR, textName), 'utf8'));
        summary.generatedFiles.push(rawName, textName);
        continue;
      }

      const screenplayResp = await fetchJson(`${args.baseUrl}/api/pipeline/screenplay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withProvider({
          projectId: args.projectId,
          disableContextKeys: workerCount > 1 ? ['screenplays'] : [],
          episodeIndex,
          episodeMappingRow: rowObj,
          sourceText
        }))
      });

      await saveJson(path.join(OUTPUT_DIR, rawName), screenplayResp.json);
      await saveText(path.join(OUTPUT_DIR, textName), screenplayResp.json.result || '');
      summary.generatedFiles.push(rawName, textName);
      summary.steps[`screenplay_${epId}`] = summarizeStep(screenplayResp.json, screenplayResp.durationMs);
      summary.totals.inputTokens += screenplayResp.json.tokens?.input || 0;
      summary.totals.outputTokens += screenplayResp.json.tokens?.output || 0;
      screenplayMap[episodeIndex] = screenplayResp.json.result || '';
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runScreenplayWorker()));
  } else {
    for (let episodeIndex = 0; episodeIndex < screenplayCount; episodeIndex += 1) {
      const epId = indexByHeader(breakdown.headers, breakdown.rows[episodeIndex]).ep_id
        || `E${String(episodeIndex + 1).padStart(3, '0')}`;
      const textName = `08-screenplay-${epId}.txt`;
      if (!existsSync(path.join(OUTPUT_DIR, textName))) {
        throw new Error(`Missing screenplay file for resume: ${textName}`);
      }
      screenplayMap[episodeIndex] = await import('fs/promises')
        .then((fs) => fs.readFile(path.join(OUTPUT_DIR, textName), 'utf8'));
      summary.generatedFiles.push(textName);
      const rawName = `07-screenplay-${epId}.raw.json`;
      if (existsSync(path.join(OUTPUT_DIR, rawName))) {
        summary.generatedFiles.push(rawName);
      }
    }
  }

  let designCharacters;
  if (startRank <= 2) {
    log('4/6 design-characters');
    const designResp = await fetchJson(`${args.baseUrl}/api/pipeline/design-characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withProvider({
        projectId: args.projectId,
        totalEpisodes: args.totalEpisodes,
        episodeDuration: args.episodeDuration
      }))
    });
    await saveJson(path.join(OUTPUT_DIR, '09-design-characters.raw.json'), designResp.json);
    summary.generatedFiles.push('09-design-characters.raw.json');
    summary.steps.designCharacters = summarizeStep(designResp.json, designResp.durationMs);
    summary.totals.inputTokens += designResp.json.tokens?.input || 0;
    summary.totals.outputTokens += designResp.json.tokens?.output || 0;

    designCharacters = safeJsonParse(designResp.json.result, 'design-characters');
    await saveJson(path.join(OUTPUT_DIR, '10-design-characters.json'), designCharacters);
    summary.generatedFiles.push('10-design-characters.json');
  } else {
    designCharacters = await loadJson(path.join(OUTPUT_DIR, '10-design-characters.json'));
    if (existsSync(path.join(OUTPUT_DIR, '09-design-characters.raw.json'))) {
      summary.generatedFiles.push('09-design-characters.raw.json');
    }
    summary.generatedFiles.push('10-design-characters.json');
  }

  const storyboardEpisodeIndex = Math.min(
    Math.max(args.storyboardEpisodeIndex, 0),
    screenplayCount - 1
  );
  const storyboardRow = breakdown.rows[storyboardEpisodeIndex];
  const storyboardRowObj = indexByHeader(breakdown.headers, storyboardRow);
  const storyboardEpId = storyboardRowObj.ep_id || `E${String(storyboardEpisodeIndex + 1).padStart(3, '0')}`;
  const selectedScreenplay = screenplayMap[storyboardEpisodeIndex];

  log(`5/6 asset extraction + qc for ${storyboardEpId}`);
  const assetsResp = await fetchJson(`${args.baseUrl}/api/pipeline/extract-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withProvider({
      projectId: args.projectId,
      episodeIndex: storyboardEpisodeIndex,
      screenplay: selectedScreenplay
    }))
  });
  await saveJson(path.join(OUTPUT_DIR, `11-extract-assets-${storyboardEpId}.raw.json`), assetsResp.json);
  summary.generatedFiles.push(`11-extract-assets-${storyboardEpId}.raw.json`);
  summary.steps.extractAssets = summarizeStep(assetsResp.json, assetsResp.durationMs);
  summary.totals.inputTokens += assetsResp.json.tokens?.input || 0;
  summary.totals.outputTokens += assetsResp.json.tokens?.output || 0;

  const assets = safeJsonParse(assetsResp.json.result, 'extract-assets');
  await saveJson(path.join(OUTPUT_DIR, `12-extract-assets-${storyboardEpId}.json`), assets);
  summary.generatedFiles.push(`12-extract-assets-${storyboardEpId}.json`);

  const qcResp = await fetchJson(`${args.baseUrl}/api/pipeline/qc-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withProvider({
      projectId: args.projectId,
      assets: assetsResp.json.result
    }))
  });
  await saveJson(path.join(OUTPUT_DIR, `13-qc-assets-${storyboardEpId}.raw.json`), qcResp.json);
  summary.generatedFiles.push(`13-qc-assets-${storyboardEpId}.raw.json`);
  summary.steps.qcAssets = summarizeStep(qcResp.json, qcResp.durationMs);
  summary.totals.inputTokens += qcResp.json.tokens?.input || 0;
  summary.totals.outputTokens += qcResp.json.tokens?.output || 0;

  const qcAssets = safeJsonParse(qcResp.json.result, 'qc-assets');
  await saveJson(path.join(OUTPUT_DIR, `14-qc-assets-${storyboardEpId}.json`), qcAssets);
  summary.generatedFiles.push(`14-qc-assets-${storyboardEpId}.json`);

  log(`6/6 storyboard for ${storyboardEpId}`);
  const storyboardResp = await fetchJson(`${args.baseUrl}/api/pipeline/storyboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withProvider({
      projectId: args.projectId,
      screenplay: selectedScreenplay,
      assets: assetsResp.json.result
    }))
  });
  await saveJson(path.join(OUTPUT_DIR, `15-storyboard-${storyboardEpId}.raw.json`), storyboardResp.json);
  await saveText(path.join(OUTPUT_DIR, `16-storyboard-${storyboardEpId}.csv`), storyboardResp.json.result || '');
  summary.generatedFiles.push(`15-storyboard-${storyboardEpId}.raw.json`, `16-storyboard-${storyboardEpId}.csv`);
  summary.steps.storyboard = summarizeStep(storyboardResp.json, storyboardResp.durationMs);
  summary.totals.inputTokens += storyboardResp.json.tokens?.input || 0;
  summary.totals.outputTokens += storyboardResp.json.tokens?.output || 0;

  const contextResp = await fetchJson(`${args.baseUrl}/api/projects/${args.projectId}/context`);
  await saveJson(path.join(OUTPUT_DIR, '17-final-context.json'), contextResp.json);
  summary.generatedFiles.push('17-final-context.json');

  summary.storyBible = {
    title: storyBible.meta?.title || null,
    characterCount: Array.isArray(storyBible.characters) ? storyBible.characters.length : 0
  };
  summary.breakdown = {
    headers: breakdown.headers,
    rowCount: breakdown.rows.length,
    episodes: breakdown.rows.map((row) => indexByHeader(breakdown.headers, row))
  };
  summary.generatedScreenplays = Object.entries(screenplayMap).map(([episodeIndex, text]) => ({
    episodeIndex: Number(episodeIndex),
    epId: indexByHeader(breakdown.headers, breakdown.rows[Number(episodeIndex)]).ep_id,
    length: text.length
  }));
  summary.designCharacters = {
    characterCount: Array.isArray(designCharacters.character_library)
      ? designCharacters.character_library.length
      : Array.isArray(designCharacters.characters)
        ? designCharacters.characters.length
        : null
  };
  summary.qcAssets = qcAssets;
  summary.storyboard = {
    epId: storyboardEpId,
    lineCount: String(storyboardResp.json.result || '')
      .split('\n')
      .filter(Boolean).length
  };

  await saveJson(path.join(OUTPUT_DIR, '18-summary.json'), summary);
  summary.generatedFiles.push('18-summary.json');

  const report = [
    '# 阿凡达 PDF 全流程冒烟结果',
    '',
    `- 测试日期: ${new Date().toISOString()}`,
    `- Project ID: \`${args.projectId}\``,
    `- PDF: \`${args.pdfPath}\``,
    `- Provider: ${summary.health.providerName || summary.health.provider || 'unknown'}`,
    `- 配置: ${args.totalEpisodes} 集, 每集 ${args.episodeDuration} 秒, ${args.shotsPerMin} 镜/分钟`,
    `- 生成模式: stable (seed=${runSeed})`,
    `- 剧本生成: 并发 ${Math.max(1, Math.min(args.screenplayConcurrency || 1, screenplayCount))}，共 ${screenplayCount} 集`,
    `- 分镜验证集数: ${storyboardEpId}`,
    '',
    '## 结果概览',
    '',
    `- Story Bible 角色数: ${summary.storyBible.characterCount}`,
    `- Breakdown 集数: ${summary.breakdown.rowCount}`,
    `- Character Design 角色数: ${summary.designCharacters.characterCount}`,
    `- QC pass: ${qcAssets.pass === true ? 'true' : 'false'}`,
    `- Storyboard 行数: ${summary.storyboard.lineCount}`,
    `- Token 合计: input=${summary.totals.inputTokens}, output=${summary.totals.outputTokens}`,
    '',
    '## Breakdown',
    '',
    '```json',
    JSON.stringify(summary.breakdown.episodes, null, 2),
    '```',
    '',
    '## Story Bible 预览',
    '',
    '```json',
    JSON.stringify(storyBible, null, 2),
    '```',
    '',
    '## Character Design 预览',
    '',
    '```json',
    JSON.stringify(designCharacters, null, 2),
    '```',
    '',
    `## Storyboard (${storyboardEpId}) 预览`,
    '',
    '```csv',
    markdownPreview(storyboardResp.json.result || '', 4000),
    '```',
    '',
    '## QC',
    '',
    '```json',
    JSON.stringify(qcAssets, null, 2),
    '```',
    '',
    '## 产物',
    ''
  ];

  for (const file of summary.generatedFiles) {
    report.push(`- ${file}`);
  }

  await saveText(path.join(OUTPUT_DIR, 'README.md'), `${report.join('\n')}\n`);
  log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
