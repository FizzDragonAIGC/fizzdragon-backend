/**
 * 重测脚本 — 验证剧本语言修复（中文输入→中文输出）
 * 清除旧英文剧本 → 重跑 E001–E003 + 下游全流程
 *
 * Usage: node test-rerun.js
 * Requires: server running on localhost:3001
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001/api';
const PROJECT_ID = 'avatar_full_test';
const RESULT_DIR = path.join(__dirname, 'result');

if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

function readContext() {
  const file = path.join(__dirname, 'user_projects/_public.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return data[PROJECT_ID]?.data?.context || {};
}

async function callSync(stepId, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${stepId}] Calling sync...`);
  const start = Date.now();
  const resp = await fetch(`${BASE}/pipeline/${stepId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const json = await resp.json();
  if (json.error) { console.error(`[${stepId}] ERROR (${elapsed}s):`, json.error); return null; }
  const tokens = json.tokens || {};
  console.log(`[${stepId}] OK (${elapsed}s) tokens: in=${tokens.input || '?'} out=${tokens.output || '?'}`);
  console.log(`[${stepId}] Result preview: ${String(json.result || '').substring(0, 300)}...`);
  return json;
}

async function callStream(stepId, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${stepId}/stream] Calling stream...`);
  const start = Date.now();
  const resp = await fetch(`${BASE}/pipeline/${stepId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[${stepId}/stream] HTTP ${resp.status}: ${text}`);
    return null;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '', fullThinking = '', tokens = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk') { fullText += data.content; process.stdout.write('.'); }
        else if (data.type === 'thinking') { fullThinking += data.content; }
        else if (data.type === 'done') {
          fullText = data.fullText || fullText;
          fullThinking = data.fullThinking || fullThinking;
          tokens = data.tokens || {};
        }
        else if (data.type === 'error') { console.error(`\n[${stepId}/stream] ERROR:`, data.error); return null; }
      } catch {}
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[${stepId}/stream] OK (${elapsed}s) len=${fullText.length}`);
  console.log(`[${stepId}/stream] Preview: ${fullText.substring(0, 300)}...`);
  return { result: fullText, reasoning: fullThinking, tokens, step: stepId };
}

function saveResult(name, data) {
  fs.writeFileSync(path.join(RESULT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  → Saved result/${name}.json`);
}

function buildSourceText(ctx, epIndex) {
  const headers = ctx.breakdownHeaders || [];
  const row = ctx.breakdownRows?.[epIndex];
  if (!row) return null;
  return headers.map((h, i) => row[i] ? `${h}: ${row[i]}` : '').filter(Boolean).join('\n');
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

// ═══════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  重测：阿凡达全流程（验证语言修复）');
  console.log('═══════════════════════════════════════════════\n');

  // Step 0: Clear old screenplays from context (direct file manipulation because
  // deep merge with {} is a no-op for DEEP_MERGE_KEYS)
  console.log('[PREP] Clearing old screenplays from context (direct file edit)...');
  const projFile = path.join(__dirname, 'user_projects/_public.json');
  const projData = JSON.parse(fs.readFileSync(projFile, 'utf-8'));
  if (projData[PROJECT_ID]?.data?.context?.screenplays) {
    projData[PROJECT_ID].data.context.screenplays = {};
    fs.writeFileSync(projFile, JSON.stringify(projData, null, 2));
  }
  const ctxBefore = readContext();
  console.log(`[PREP] Context keys: ${Object.keys(ctxBefore).join(', ')}`);
  console.log(`[PREP] screenplays cleared: keys=[${Object.keys(ctxBefore.screenplays || {}).join(',')}]`);
  console.log(`[PREP] breakdownRows: ${ctxBefore.breakdownRows?.length} episodes`);

  const results = {};

  // ── E001 Screenplay (sync) ──
  {
    const epIndex = 0;
    const row = ctxBefore.breakdownRows?.[epIndex];
    const sourceText = buildSourceText(ctxBefore, epIndex);
    const mappingRow = row ? `${row[0]},${row[1]},${row[2]}` : '';

    console.log(`\n>>> E001 (episodeIndex=${epIndex})`);
    console.log(`  mappingRow: ${mappingRow}`);

    const res = await callSync('screenplay', {
      projectId: PROJECT_ID,
      episodeIndex: epIndex,
      episodeMappingRow: mappingRow,
      sourceText: sourceText
    });
    if (res) {
      results.screenplay_e001 = res;
      saveResult('screenplay_e001', res);
      const chinese = hasChinese(res.result);
      console.log(`  ★ 语言检测: ${chinese ? '✓ 包含中文' : '✗ 没有中文（BUG!）'}`);
    }
  }

  // ── E002 Screenplay (stream, auto-inject previousScreenplay) ──
  {
    const epIndex = 1;
    const row = ctxBefore.breakdownRows?.[epIndex];
    const sourceText = buildSourceText(ctxBefore, epIndex);
    const mappingRow = row ? `${row[0]},${row[1]},${row[2]}` : '';

    console.log(`\n>>> E002 (episodeIndex=${epIndex}, auto-inject previousScreenplay)`);

    const res = await callStream('screenplay', {
      projectId: PROJECT_ID,
      episodeIndex: epIndex,
      episodeMappingRow: mappingRow,
      sourceText: sourceText
    });
    if (res) {
      results.screenplay_e002 = res;
      saveResult('screenplay_e002', res);
      const chinese = hasChinese(res.result);
      console.log(`  ★ 语言检测: ${chinese ? '✓ 包含中文' : '✗ 没有中文（BUG!）'}`);
      // Verify writeback
      const ctxAfter = readContext();
      const keys = Object.keys(ctxAfter.screenplays || {});
      console.log(`  ★ context.screenplays keys: [${keys.join(',')}]`);
      const e001intact = ctxAfter.screenplays?.['0'] || ctxAfter.screenplays?.[0];
      console.log(`  ★ E001 intact: ${e001intact ? `✓ (${e001intact.length} chars)` : '✗ MISSING'}`);
    }
  }

  // ── E003 Screenplay (stream, chain continuity) ──
  {
    const epIndex = 2;
    const row = ctxBefore.breakdownRows?.[epIndex];
    const sourceText = buildSourceText(ctxBefore, epIndex);
    const mappingRow = row ? `${row[0]},${row[1]},${row[2]}` : '';

    console.log(`\n>>> E003 (episodeIndex=${epIndex}, chain continuity)`);

    const res = await callStream('screenplay', {
      projectId: PROJECT_ID,
      episodeIndex: epIndex,
      episodeMappingRow: mappingRow,
      sourceText: sourceText
    });
    if (res) {
      results.screenplay_e003 = res;
      saveResult('screenplay_e003', res);
      const chinese = hasChinese(res.result);
      console.log(`  ★ 语言检测: ${chinese ? '✓ 包含中文' : '✗ 没有中文（BUG!）'}`);
      const ctxAfter = readContext();
      console.log(`  ★ context.screenplays keys: [${Object.keys(ctxAfter.screenplays || {}).join(',')}]`);
    }
  }

  // ── extract-assets (using E002 screenplay) ──
  {
    const screenplay = results.screenplay_e002?.result;
    if (screenplay) {
      const res = await callSync('extract-assets', {
        projectId: PROJECT_ID,
        screenplay: screenplay
      });
      if (res) { results.extract_assets = res; saveResult('extract-assets', res); }
    }
  }

  // ── qc-assets ──
  {
    const assets = results.extract_assets?.result;
    if (assets) {
      const res = await callSync('qc-assets', {
        projectId: PROJECT_ID,
        assets: assets
      });
      if (res) { results.qc_assets = res; saveResult('qc-assets', res); }
    }
  }

  // ── storyboard ──
  {
    const screenplay = results.screenplay_e002?.result;
    const assets = results.extract_assets?.result;
    if (screenplay) {
      const res = await callSync('storyboard', {
        projectId: PROJECT_ID,
        screenplay: screenplay,
        ...(assets ? { assets } : {})
      });
      if (res) { results.storyboard = res; saveResult('storyboard', res); }
    }
  }

  // ── design-characters (context auto-inject) ──
  {
    const res = await callSync('design-characters', {
      projectId: PROJECT_ID,
      totalEpisodes: 5,
      episodeDuration: 90
    });
    if (res) { results.design_characters = res; saveResult('design-characters', res); }
  }

  // ═══════ SUMMARY ═══════
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  测试总结');
  console.log('═'.repeat(60));

  const summary = {};
  for (const [key, val] of Object.entries(results)) {
    const hasResult = !!val?.result;
    const chinese = hasResult ? hasChinese(val.result) : false;
    summary[key] = {
      status: hasResult ? 'PASS' : 'FAIL',
      chinese: key.startsWith('screenplay') ? (chinese ? '✓' : '✗') : '—',
      tokens: val?.tokens || {},
      resultLength: val?.result?.length || 0
    };
    const s = summary[key];
    console.log(`  ${key.padEnd(25)} ${s.status}  中文:${s.chinese}  len:${s.resultLength}  tokens:${s.tokens.input || '?'}/${s.tokens.output || '?'}`);
  }

  fs.writeFileSync(path.join(RESULT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nAll results → ${RESULT_DIR}/`);

  const finalCtx = readContext();
  console.log(`Final screenplays: [${Object.keys(finalCtx.screenplays || {}).join(',')}]`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
