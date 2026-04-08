/**
 * Part 5b 自测 — 阿凡达项目
 * 测试 screenplay 自动注入 allEpisodePlots + previousScreenplay，以及回写 context
 * 然后依次测试 extract-assets → qc-assets → storyboard → design-characters
 *
 * Usage: node test-part5b.js
 * Requires: server running on localhost:3001
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001/api/pipeline';
const PROJECT_ID = 'avatar_full_test';
const RESULT_DIR = path.join(__dirname, 'result');

// Ensure result dir exists
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });

function readContext() {
  const file = path.join(__dirname, 'user_projects/_public.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return data[PROJECT_ID]?.data?.context || {};
}

async function callSync(stepId, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${stepId}] Calling sync...`);
  console.log(`[${stepId}] Body keys: ${Object.keys(body).join(', ')}`);
  const start = Date.now();

  const resp = await fetch(`${BASE}/${stepId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const json = await resp.json();

  if (json.error) {
    console.error(`[${stepId}] ERROR (${elapsed}s):`, json.error);
    return null;
  }

  const tokens = json.tokens || {};
  console.log(`[${stepId}] OK (${elapsed}s) tokens: in=${tokens.input || '?'} out=${tokens.output || '?'}`);
  console.log(`[${stepId}] Result preview: ${(json.result || '').substring(0, 200)}...`);

  return json;
}

async function callStream(stepId, body) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${stepId}/stream] Calling stream...`);
  console.log(`[${stepId}/stream] Body keys: ${Object.keys(body).join(', ')}`);
  const start = Date.now();

  const resp = await fetch(`${BASE}/${stepId}/stream`, {
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
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk') { fullText += data.content; process.stdout.write('.'); }
        else if (data.type === 'thinking') { fullThinking += data.content; }
        else if (data.type === 'done') {
          fullText = data.fullText || fullText;
          fullThinking = data.fullThinking || fullThinking;
          tokens = data.tokens || {};
        }
        else if (data.type === 'error') {
          console.error(`\n[${stepId}/stream] ERROR:`, data.error);
          return null;
        }
      } catch {}
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[${stepId}/stream] OK (${elapsed}s) tokens: in=${tokens.input || '?'} out=${tokens.output || '?'}`);
  console.log(`[${stepId}/stream] Result preview: ${fullText.substring(0, 200)}...`);

  return { result: fullText, reasoning: fullThinking, tokens, step: stepId };
}

function saveResult(stepId, data, suffix = '') {
  const filename = `${stepId}${suffix}.json`;
  fs.writeFileSync(path.join(RESULT_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`[${stepId}] Saved → result/${filename}`);
}

// ─────────────────────────────────────────────
// Build sourceText from breakdown row data
// ─────────────────────────────────────────────
function buildSourceText(ctx, epIndex) {
  const headers = ctx.breakdownHeaders || [];
  const row = ctx.breakdownRows?.[epIndex];
  if (!row) return null;
  // Build a structured source excerpt from breakdown data
  const parts = [];
  headers.forEach((h, i) => {
    if (row[i]) parts.push(`${h}: ${row[i]}`);
  });
  return parts.join('\n');
}

// ═════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════
async function main() {
  console.log('Part 5b Self-Test — Avatar (阿凡达)');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Provider: dashscope (Qwen)`);
  console.log(`Result dir: ${RESULT_DIR}`);

  const ctx = readContext();
  console.log(`\nContext: ${Object.keys(ctx).join(', ')}`);
  console.log(`  breakdownRows: ${ctx.breakdownRows?.length} episodes`);
  console.log(`  screenplays: keys=[${Object.keys(ctx.screenplays || {}).join(',')}]`);

  const results = {};

  // ── Step 1: Screenplay E002 (index=1) via STREAM ──
  // Should auto-inject allEpisodePlots + previousScreenplay from context
  {
    const epIndex = 1;
    const row = ctx.breakdownRows?.[epIndex];
    const sourceText = buildSourceText(ctx, epIndex);
    const mappingRow = row ? `${row[0]},${row[1]},${row[2]}` : '';

    console.log(`\n--- Screenplay E002 (episodeIndex=${epIndex}) ---`);
    console.log(`  mappingRow: ${mappingRow}`);
    console.log(`  sourceText length: ${sourceText?.length}`);
    console.log(`  NOT passing allEpisodePlots or previousScreenplay (backend should auto-inject)`);

    const res = await callStream('screenplay', {
      projectId: PROJECT_ID,
      episodeIndex: epIndex,
      episodeMappingRow: mappingRow,
      sourceText: sourceText
      // allEpisodePlots: NOT passed — backend auto-builds from breakdownRows
      // previousScreenplay: NOT passed — backend auto-reads from screenplays[0]
    });

    if (res) {
      results.screenplay_e002 = res;
      saveResult('screenplay', res, '_e002');

      // Verify writeback
      const ctxAfter = readContext();
      const wrote = ctxAfter.screenplays?.[1] || ctxAfter.screenplays?.['1'];
      console.log(`\n[VERIFY] Screenplay writeback: ${wrote ? `OK (${wrote.length} chars)` : 'MISSING!'}`);
      if (wrote) {
        console.log(`[VERIFY] screenplays keys after: [${Object.keys(ctxAfter.screenplays || {}).join(',')}]`);
        // Confirm episode 0 still exists (not overwritten by deep merge)
        const ep0 = ctxAfter.screenplays?.[0] || ctxAfter.screenplays?.['0'];
        console.log(`[VERIFY] Episode 0 still intact: ${ep0 ? `OK (${ep0.length} chars)` : 'MISSING — deep merge broken!'}`);
      }
    }
  }

  // ── Step 2: Screenplay E003 (index=2) via STREAM ──
  // Tests that previousScreenplay now comes from the just-written E002
  {
    const epIndex = 2;
    const row = ctx.breakdownRows?.[epIndex];
    const sourceText = buildSourceText(ctx, epIndex);
    const mappingRow = row ? `${row[0]},${row[1]},${row[2]}` : '';

    console.log(`\n--- Screenplay E003 (episodeIndex=${epIndex}) ---`);
    console.log(`  NOT passing previousScreenplay (should auto-read E002 from context writeback)`);

    const res = await callStream('screenplay', {
      projectId: PROJECT_ID,
      episodeIndex: epIndex,
      episodeMappingRow: mappingRow,
      sourceText: sourceText
    });

    if (res) {
      results.screenplay_e003 = res;
      saveResult('screenplay', res, '_e003');

      // Verify writeback chain
      const ctxAfter = readContext();
      console.log(`[VERIFY] screenplays keys: [${Object.keys(ctxAfter.screenplays || {}).join(',')}]`);
    }
  }

  // ── Step 3: extract-assets (using E002 screenplay) ──
  {
    const screenplay = results.screenplay_e002?.result;
    if (screenplay) {
      const res = await callSync('extract-assets', {
        projectId: PROJECT_ID,
        screenplay: screenplay
      });
      if (res) {
        results.extract_assets = res;
        saveResult('extract-assets', res);
      }
    } else {
      console.log('\n[SKIP] extract-assets — no screenplay result');
    }
  }

  // ── Step 4: qc-assets ──
  {
    const assetsText = results.extract_assets?.result;
    if (assetsText) {
      const res = await callSync('qc-assets', {
        projectId: PROJECT_ID,
        assets: assetsText
      });
      if (res) {
        results.qc_assets = res;
        saveResult('qc-assets', res);
      }
    } else {
      console.log('\n[SKIP] qc-assets — no assets result');
    }
  }

  // ── Step 5: storyboard (using E002 screenplay + assets) ──
  {
    const screenplay = results.screenplay_e002?.result;
    const assets = results.extract_assets?.result;
    if (screenplay) {
      const res = await callSync('storyboard', {
        projectId: PROJECT_ID,
        screenplay: screenplay,
        ...(assets ? { assets } : {})
      });
      if (res) {
        results.storyboard = res;
        saveResult('storyboard', res);
      }
    } else {
      console.log('\n[SKIP] storyboard — no screenplay result');
    }
  }

  // ── Step 6: design-characters (uses screenplays from context) ──
  {
    const res = await callSync('design-characters', {
      projectId: PROJECT_ID,
      totalEpisodes: 5,
      episodeDuration: 90
      // screenplays auto-injected from context
    });
    if (res) {
      results.design_characters = res;
      saveResult('design-characters', res);
    }
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const summary = {};
  for (const [key, val] of Object.entries(results)) {
    summary[key] = {
      status: val?.result ? 'PASS' : 'FAIL',
      tokens: val?.tokens || {},
      resultLength: val?.result?.length || 0
    };
    const s = summary[key];
    console.log(`  ${key.padEnd(25)} ${s.status}  tokens: ${s.tokens.input || '?'}/${s.tokens.output || '?'}  len: ${s.resultLength}`);
  }

  // Save summary
  fs.writeFileSync(path.join(RESULT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nAll results saved to ${RESULT_DIR}/`);

  // Final context state
  const finalCtx = readContext();
  console.log(`\nFinal context screenplays: [${Object.keys(finalCtx.screenplays || {}).join(',')}]`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
