/**
 * Project Context — 读写 pipeline 上下文（storyBible、screenplays 等）
 * 复用 user_projects/{userId}.json 存储，在 project.data.context 下
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isSupabaseEnabled, saveUserProject } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const USER_PROJECTS_DIR = join(dirname(__filename), '../../user_projects');

// Ensure directory exists
if (!existsSync(USER_PROJECTS_DIR)) {
  mkdirSync(USER_PROJECTS_DIR, { recursive: true });
}

/**
 * Read the full context object for a project
 * Falls back to '_public' storage if user-specific context not found
 * @returns {object|null} context — { storyBible, screenplays, breakdownRows, breakdownHeaders, projectConfig, assetLibrary }
 */
export function readProjectContext(userId, projectId) {
  const candidates = userId && userId !== '_public' ? [userId, '_public'] : ['_public'];
  for (const uid of candidates) {
    const filePath = join(USER_PROJECTS_DIR, `${uid}.json`);
    try {
      if (!existsSync(filePath)) continue;
      const projects = JSON.parse(readFileSync(filePath, 'utf-8'));
      const project = projects[projectId];
      const ctx = project?.data?.context;
      if (ctx && Object.keys(ctx).length > 0) return ctx;
    } catch { /* continue to fallback */ }
  }
  return null;
}

// Keys whose values are plain objects and should be deep-merged (not overwritten)
const DEEP_MERGE_KEYS = new Set(['screenplays']);

/**
 * Merge-write a partial context into the project's data.context
 * Only overwrites keys present in `patch`; leaves untouched keys as-is.
 * Keys listed in DEEP_MERGE_KEYS are merged one level deeper (Object.assign on sub-object).
 */
export async function writeProjectContext(userId, projectId, patch) {
  const filePath = join(USER_PROJECTS_DIR, `${userId}.json`);
  let projects = {};
  if (existsSync(filePath)) {
    projects = JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  if (!projects[projectId]) projects[projectId] = {};
  if (!projects[projectId].data) projects[projectId].data = {};
  if (!projects[projectId].data.context) projects[projectId].data.context = {};

  const ctx = projects[projectId].data.context;

  // Merge patch into existing context, with deep merge for specific keys
  for (const [k, v] of Object.entries(patch)) {
    if (DEEP_MERGE_KEYS.has(k) && v && typeof v === 'object' && !Array.isArray(v)
        && ctx[k] && typeof ctx[k] === 'object' && !Array.isArray(ctx[k])) {
      Object.assign(ctx[k], v);
    } else {
      ctx[k] = v;
    }
  }

  writeFileSync(filePath, JSON.stringify(projects, null, 2));

  // Sync to Supabase
  if (isSupabaseEnabled()) {
    await saveUserProject(userId, projectId, projects[projectId]);
  }
}
