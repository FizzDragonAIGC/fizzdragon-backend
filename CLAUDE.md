# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start proxy-server.js on port 3001 (default)
node proxy-server.js # Direct start

# Health check
curl http://localhost:3001/api/health

# Ad-hoc tests (not wired to `npm test`)
node test-full-flow.js
node test-full-pipeline.js
```

No build step is needed — this is a plain Node.js ES-module project.

## Architecture

This is an **AI-powered IP-to-anime production backend**. The main server (`proxy-server.js`, ~111KB) orchestrates 50+ specialized agents that each hold a system prompt and a set of attached "skills" (markdown knowledge bases). A frontend calls agent endpoints; the backend injects skills into the agent's system prompt and routes the request to an LLM provider.

### Key files

| File | Role |
|------|------|
| `proxy-server.js` | Main Express API server: auth, routing, provider abstraction, JSON repair, streaming |
| `agents-config.js` | 50+ agent definitions (name, group, skills[], prompt) + `AGENT_GROUPS` + `STATS` |
| `skills/*.skill.md` | 100+ skill knowledge bases loaded at runtime and injected into agent prompts |
| `pipeline.js` / `pipeline-full.js` | Batch processing for large multi-episode projects |
| `db.js` | Supabase client setup; server falls back to local `user_projects/` if Supabase is unavailable |
| `ARCHITECTURE_V2.md` | 5-stage batch pipeline design (131 calls vs 3 000 — 23× optimization) |
| `AGENT_SKILLS_CONFIG.md` | Agent ↔ skill mapping matrix |

### Runtime flow

```
POST /api/agent/:agentId  (or /api/agent-stream/:agentId)
  → JWT auth
  → loadAgentSkills()   # reads up to 5 .skill.md files from /skills/, cached in memory
  → build system prompt (agent.prompt + injected skill content)
  → route to provider   # anthropic | deepseek | gemini | openrouter (set via AI_PROVIDER env var)
  → safeJSONParse()     # auto-repairs malformed JSON (especially from DeepSeek)
  → return structured output or stream
```

### Agent groups (Chinese department names)

| Group | Purpose |
|-------|---------|
| 統籌 | Coordination: director, concept, script_parser, story_breakdown |
| 故事 | Story: narrative, screenwriter, novelist, scene_architect |
| 導演 | Direction: storyboard, cinematography, chief_director |
| 美術 | Art: artstyle, character, production_design, costume, props |
| AI輸出 | AI Output: image_prompt, video_prompt, vfx |
| 音樂 | Music: music, foley |
| 輔助 | Support: novel_processor, asset_extractor, asset_qc_gate |

### Adding or modifying agents / skills

- **New skill:** create `skills/<id>.skill.md`, then add the skill ID to the relevant agent's `skills[]` array in `agents-config.js`.
- **New agent:** add an entry to the `AGENTS` object in `agents-config.js` following the existing shape (`name`, `group`, `skills[]`, `prompt`).
- `loadAgentSkills()` in `proxy-server.js` caps skill injection at `maxSkills = 5`. Skills beyond that are silently dropped.

### Multi-provider routing

The `AI_PROVIDER` environment variable selects the LLM backend. Valid values: `anthropic` (default), `deepseek`, `gemini`, `openrouter`. Provider config (model tiers, pricing, base URLs) is defined near the top of `proxy-server.js`.

### JSON repair utilities (proxy-server.js)

Several agents return structured JSON. Use these helpers when adding new endpoints:
- `safeJSONParse(text)` — parse with auto-repair fallback via `repairJSON()`
- `sanitizeForJson(text)` — strip control chars before parsing
- `sanitizePlainText(text)` — fix mojibake and smart punctuation

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `PORT` | No | Default 3001 |
| `AI_PROVIDER` | No | `anthropic` \| `deepseek` \| `gemini` \| `openrouter` |
| `SUPABASE_URL` | No | Falls back to local file storage |
| `SUPABASE_KEY` | No | |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Admin operations |
| `NODE_ENV` | No | Set to `production` on Render |

## Deployment

Render.com (`render.yaml`): `npm install` → `npm start`. No container, no Docker.
