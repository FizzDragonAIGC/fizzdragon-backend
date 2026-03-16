# FizzDragon Backend API Reference

> Base URL: `http://localhost:3001`
> 前端代理: `/agent-api` → `http://localhost:3001/api`

---

## 目录

1. [系统 & 健康检查](#1-系统--健康检查)
2. [认证](#2-认证)
3. [Agent 调用](#3-agent-调用)
4. [Pipeline 流程](#4-pipeline-流程)
5. [小说处理](#5-小说处理)
6. [图片生成](#6-图片生成)
7. [Moodboard / 风格分析](#7-moodboard--风格分析)
8. [项目管理 (V3 Legacy)](#8-项目管理-v3-legacy)
9. [用户项目持久化](#9-用户项目持久化)
10. [管理接口](#10-管理接口)

---

## 1. 系统 & 健康检查

### `GET /api/health`

健康检查，返回后端状态和配置信息。**无需认证。**

**Response:**
```json
{
  "status": "ok",
  "mode": "direct-api",
  "provider": "deepseek",
  "providerName": "DeepSeek",
  "hasApiKey": true,
  "availableProviders": ["anthropic", "deepseek", "gemini", "openrouter"],
  "stats": { "totalAgents": 52, "totalSkills": 10, "groups": 9 },
  "tokenUsage": { "input": 4436, "output": 4292, "cost": 0.00066 },
  "config": { "maxSkills": 5, "contentLimit": 2500 }
}
```

### `GET /api/config`

获取运行时配置。

### `POST /api/config`

更新运行时配置。

**Request:**
```json
{ "maxSkills": 5, "contentLimit": 2500, "provider": "deepseek" }
```

### `GET /api/providers`

获取可用 LLM 提供商列表。

### `GET /api/tokens`

获取当前 token 使用量。

### `POST /api/tokens/reset`

重置 token 计数器。

---

## 2. 认证

使用 JWT Token 认证。Token 通过 `Authorization: Bearer <token>` 头传递。

### `POST /api/auth/register`

注册新用户。

**Request:**
```json
{ "username": "fd_auto_123", "password": "fd_auto_123_agent" }
```

**Response:**
```json
{ "token": "eyJhbG...", "user": { "id": "...", "username": "fd_auto_123" } }
```

### `POST /api/auth/login`

用户登录。

**Request:**
```json
{ "username": "fd_auto_123", "password": "fd_auto_123_agent" }
```

**Response:**
```json
{ "token": "eyJhbG...", "user": { "id": "...", "username": "fd_auto_123" } }
```

### `GET /api/auth/verify`

验证 Token 是否有效。**需要 JWT。**

**Response:**
```json
{ "ok": true, "user": { "id": "...", "username": "..." } }
```

### `GET /api/auth/me`

获取当前用户信息。**需要 JWT。**

### `POST /api/auth/logout`

登出。

---

## 3. Agent 调用

### `GET /api/agents`

列出所有可用 Agent。

**Response:**
```json
{
  "agents": [
    { "id": "story_bible_extractor", "name": "Story Bible Extractor", "group": "..." },
    { "id": "screenwriter_90s", "name": "Screenwriter 90s", "group": "..." }
  ],
  "groups": [...],
  "stats": { "totalAgents": 52, "totalSkills": 10 }
}
```

### `POST /api/agent/:agentId`

同步调用 Agent。等待完整响应后返回。

**Request:**
```json
{
  "content": "用户输入内容",
  "context": "可选上下文",
  "novel": "可选小说原文",
  "useReasoner": false,
  "provider": "deepseek"
}
```

**Response:**
```json
{
  "result": "Agent 返回的完整文本",
  "reasoning": "思考过程（如果有）",
  "tokens": { "input": 1234, "output": 5678 }
}
```

### `POST /api/agent-stream/:agentId`

流式调用 Agent（SSE）。实时返回生成内容。

**Request:** 同上

**Response (SSE):**
```
data: {"chunk":"生成的","type":"chunk"}
data: {"chunk":"内容片段","type":"chunk"}
data: {"done":true,"fullText":"完整文本","tokens":{"input":123,"output":456}}
```

---

## 4. Pipeline 流程

Pipeline 是多步骤的编剧流水线，支持逐步执行和全流程编排。

### 4.1 Pipeline 步骤（逐步调用）

前端"编辑剧本"Tab 使用的核心 API。

#### `POST /api/pipeline/breakdown/stream`

**剧情拆解** — 将小说按集数拆解为 CSV 格式的剧集规划。

**Request:**
```json
{
  "novelText": "小说全文...",
  "totalEpisodes": 3,
  "storyBible": { "meta": {...}, "characters": [...] }
}
```

**Response (SSE):**
```
data: {"type":"thinking","content":"思考过程..."}
data: {"type":"chunk","content":"CSV 内容片段..."}
data: {"type":"done","fullText":"完整CSV","fullThinking":"完整思考","tokens":{"input":...,"output":...}}
```

**CSV 输出格式（表头）：**
```
ep_id,source_range,one_line_plot,setup,development,turn,hook,scene_list,characters,must_keep,no_add
```

#### `POST /api/pipeline/screenplay/stream`

**编剧** — 根据拆解结果逐集生成剧本。

**Request:**
```json
{
  "episodeMappingRow": "E001,1-8,剧情摘要...",
  "sourceText": "小说原文",
  "screenwriterMode": "shootable_90s_pro",
  "storyBible": { "meta": {...}, "characters": [...] }
}
```

**Response (SSE):**
```
data: {"type":"chunk","content":"0:00-0:15\n[Visual] 月光森林..."}
data: {"type":"done","fullText":"完整剧本","tokens":{...}}
```

**剧本输出格式：**
```
0:00-0:15
[Visual] EXT. 月光森林 - NIGHT. 银色月光穿过树冠。
[SFX/Ambience] 脚踩落叶声，远处猫头鹰叫。
李明: (自言自语) 没有，没有踪迹。

0:15-0:45
[Visual] 白色闪光穿过树林。白狼走入月光中。
白狼凝视李明，歪着头。
李明: (低声) 你是什么？
```

#### `POST /api/pipeline/extract-assets/stream`

**资产提取** — 从剧本中提取角色、服装、道具、场景。

**Request:**
```json
{
  "screenplay": "剧本文本...",
  "episodeIndex": 0,
  "storyBible": {...}
}
```

#### `POST /api/pipeline/qc-assets`

**资产QC** — 对提取的资产进行一致性检查。

**Request:**
```json
{
  "assets": { "0": {...}, "1": {...} },
  "storyBible": {...}
}
```

#### `POST /api/pipeline/storyboard/stream`

**分镜生成** — 根据剧本生成分镜 CSV。

**Request:**
```json
{
  "screenplay": "剧本文本...",
  "episodeIndex": 0,
  "storyBible": {...}
}
```

**CSV 输出表头（22列）：**
```
镜号,时间码,场景,角色,服装,道具,景别,角度,焦距,运动,构图,画面描述,动作,神态,台词,旁白,光线,音效,叙事功能,Image_Prompt,Video_Prompt
```

### 4.2 Pipeline 编排（全流程）

#### `GET /api/pipeline/modes`

获取可用 Pipeline 模式。

**Response:**
```json
{
  "modes": [
    { "id": "turbo", "name": "Turbo", "description": "..." },
    { "id": "lite", "name": "Lite", "description": "..." },
    { "id": "standard", "name": "Standard", "description": "..." },
    { "id": "pro", "name": "Pro", "description": "..." }
  ]
}
```

#### `POST /api/pipeline/create`

创建一个新的 Pipeline 实例。

**Request:**
```json
{
  "title": "月光森林",
  "sourceText": "小说原文...",
  "totalEpisodes": 3,
  "minutesPerEpisode": 1.5,
  "mode": "standard"
}
```

#### `POST /api/pipeline/:id/run`

运行完整 Pipeline（SSE 全流程编排）。

**Response (SSE):**
```
data: {"type":"step_start","step":"extract-bible","label":"故事圣经"}
data: {"type":"thinking","step":"extract-bible","content":"..."}
data: {"type":"chunk","step":"extract-bible","content":"..."}
data: {"type":"step_complete","step":"extract-bible","result":{...}}
data: {"type":"step_start","step":"breakdown","label":"剧情拆解"}
...
data: {"type":"pipeline_complete","results":{...}}
```

#### `POST /api/pipeline/:id/run-episodes`

运行指定集数的 Pipeline。

**Request:**
```json
{ "episodes": [0, 1, 2] }
```

#### `GET /api/pipeline/:id`

获取 Pipeline 状态。

#### `GET /api/pipeline/:id/storyboard`

获取 Pipeline 的分镜结果。

#### `GET /api/pipelines`

列出所有 Pipeline 实例。

---

## 5. 小说处理

用于长篇小说的分块处理。

### `POST /api/novel/structure`

分析小说结构。

**Request:**
```json
{ "novel": "小说全文（可以很长）" }
```

### `POST /api/novel/chunk`

处理小说的一个分块。

**Request:**
```json
{
  "novel": "分块文本",
  "chunkIndex": 0,
  "chunkSize": 20000,
  "totalChunks": 5,
  "context": "上下文",
  "agentId": "story_bible_extractor"
}
```

### `POST /api/novel/aggregate`

聚合多个分块的处理结果。

**Request:**
```json
{
  "chunks": ["结果1", "结果2"],
  "targetEpisodes": 80,
  "title": "小说标题"
}
```

### `POST /api/novel/preview`

快速预览长篇小说（采样分析）。

**Request:**
```json
{ "novel": "超长小说文本", "sampleSize": 5000 }
```

---

## 6. 图片生成

### 6.1 Replicate（SDXL / Flux）

#### `POST /api/generate-image`

**Request:**
```json
{
  "prompt": "a moonlit forest with a white wolf",
  "model": "flux_schnell",
  "aspectRatio": "16:9"
}
```

**可用模型：** `sdxl`, `flux_schnell`, `flux_dev`, `sdxl_lightning`

**Response:**
```json
{ "success": true, "url": "https://...", "model": "flux_schnell", "prompt": "..." }
```

#### `GET /api/generate-image/status`

检查图片生成服务状态和可用模型。

### 6.2 阿里云通义万相

#### `POST /api/aliyun/generate`

**Request:**
```json
{
  "prompt": "月光森林中的白狼",
  "size": "1024*1024",
  "negativePrompt": "blurry, low quality"
}
```

#### `POST /api/aliyun/characters`

批量生成角色图片。

**Request:**
```json
{
  "characters": [
    { "name": "李明", "description": "年轻猎人，体格健壮" },
    { "name": "月灵", "description": "白发女子，气质神秘" }
  ]
}
```

#### `GET /api/aliyun/status`

检查阿里云服务状态。

---

## 7. Moodboard / 风格分析

### `GET /api/moodboard/providers`

获取可用图片生成提供商。

### `POST /api/moodboard/generate`

生成测试图片。

**Request:**
```json
{ "prompt": "cinematic moonlit forest", "provider": "together" }
```

**可用 provider：** `together`, `dalle`

### `POST /api/moodboard/analyze`

分析图片风格。

**Request:**
```json
{ "image": "base64编码的图片数据" }
```

**Response:**
```json
{
  "style_name": "Cinematic Fantasy",
  "mood": "Mysterious, ethereal",
  "color_palette": ["#1a1a2e", "#16213e", "#e2e2e2"],
  "lighting": "Low-key moonlight",
  "art_reference": "Wong Kar-wai meets Studio Ghibli",
  "prompt_keywords": ["cinematic", "moonlit", "fantasy"],
  "full_prompt": "完整的风格提示词"
}
```

---

## 8. 项目管理 (V3 Legacy)

旧版项目 API，基于项目维度管理剧本和分镜。

### `POST /api/project/create`

创建项目。

**Request:**
```json
{
  "title": "月光森林",
  "episodes": 3,
  "durationPerEpisode": 90,
  "content": "小说原文",
  "artStyle": "cinematic"
}
```

### `POST /api/project/:projectId/scripts/generate`

生成项目的所有剧本。

### `GET /api/project/:projectId/scripts`

获取项目的剧本列表。

### `PUT /api/project/:projectId/scripts/:episode`

更新指定集的剧本。

### `POST /api/project/:projectId/storyboard/:episode/generate`

生成指定集的分镜。

### `POST /api/project/:projectId/storyboard/generate-all`

批量生成所有分镜。

### `GET /api/project/:projectId/storyboard/:episode`

获取指定集的分镜。

### `GET /api/project/:projectId/storyboard`

导出项目分镜（支持 `?format=csv`）。

### `GET /api/project/:projectId`

获取项目状态。

### `GET /api/projects`

列出所有项目。

---

## 9. 用户项目持久化

支持 Supabase 和本地文件存储。

### `GET /api/user-projects/:userId`

获取用户的所有项目。**需要 JWT。**

### `POST /api/user-projects/:userId`

保存用户项目。**需要 JWT。**

### `PUT /api/user-projects/:userId/:projectId`

更新单个项目。**需要 JWT。**

---

## 10. 管理接口

### `GET /api/admin/users`

列出所有注册用户。

### `POST /api/admin/kick`

移除用户。

**Request:**
```json
{ "username": "fd_auto_123" }
```

### `GET /api/queue`

获取请求队列状态。

---

## 通用说明

### SSE 流式响应格式

Pipeline stream 和 agent-stream 使用 Server-Sent Events：

```
data: {"type":"thinking","content":"思考内容片段"}
data: {"type":"chunk","content":"正文内容片段"}
data: {"type":"done","fullText":"完整结果","fullThinking":"完整思考","tokens":{"input":123,"output":456}}
data: {"type":"error","error":"错误信息"}
```

### 错误响应格式

```json
{ "error": "错误描述信息" }
```

HTTP 状态码：
- `200` 成功
- `400` 请求参数错误
- `401` 未认证 / Token 过期
- `404` 资源不存在
- `500` 服务器内部错误

### LLM 提供商配置

通过环境变量或 `/api/config` 切换：

| Provider | 环境变量 | 说明 |
|----------|---------|------|
| `deepseek` | `DEEPSEEK_API_KEY` | 默认，性价比高 |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude 系列 |
| `gemini` | `GEMINI_API_KEY` | Google Gemini |
| `openrouter` | `OPENROUTER_API_KEY` | 多模型路由 |

### 前端对接要点

1. 前端通过 Vite 代理 `/agent-api` → `http://localhost:3001/api`
2. Agent 认证基于 FD 平台用户 ID 自动注册/登录（`fd_auto_{userId}`），用户无感知
3. "编辑剧本"核心流程：
   - `story_bible_extractor`（同步 Agent 调用）→ 故事圣经 JSON
   - `breakdown/stream`（Pipeline 流式）→ 剧集拆解 CSV
   - `screenplay/stream`（Pipeline 流式，逐集调用 N 次）→ 每集剧本文本
4. 创建剧集和同步世界观走 FD 平台自身 API，不经过 Agent 后端
