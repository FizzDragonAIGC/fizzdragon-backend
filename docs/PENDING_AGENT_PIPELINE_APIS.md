# FizzDragon Backend  Agent Pipeline 接口文档

> Base URL: `http://localhost:3001`
> 鉴权方式：无需鉴权（JWT 已在 Part 5 移除）
> Content-Type: `application/json`

---

## 文档说明

backend agent / pipeline / novel / project 全部接口文档。

- 接口族：`/api/pipeline/*`（15 个）、`/api/novel/*`（5 个）、`/api/projects/*`（7 个）
- 接口总数：`27`
- Pipeline 步骤 agent：`story_bible_extractor`、`story_breakdown_pack`、`screenwriter`、`asset_extractor`、`asset_qc_gate`、`storyboard_csv`、`character_costume`

---

## 全部接口总览

### Pipeline 接口（无需鉴权）

| Step | Method | Path | 对应 Agent ID | 测试状态 |
| --- | --- | --- | --- | --- |
| extract-bible | POST | `/api/pipeline/extract-bible` | `story_bible_extractor` | **PASS** |
| extract-bible | POST | `/api/pipeline/extract-bible/stream` | `story_bible_extractor` | **PASS** |
| breakdown | POST | `/api/pipeline/breakdown` | `story_breakdown_pack` | **PASS** |
| breakdown | POST | `/api/pipeline/breakdown/stream` | `story_breakdown_pack` | **PASS** |
| screenplay | POST | `/api/pipeline/screenplay` | `screenwriter` | **PASS** |
| screenplay | POST | `/api/pipeline/screenplay/stream` | `screenwriter` | **PASS** |
| extract-assets | POST | `/api/pipeline/extract-assets` | `asset_extractor` | **PASS** |
| extract-assets | POST | `/api/pipeline/extract-assets/stream` | `asset_extractor` | **PASS** |
| qc-assets | POST | `/api/pipeline/qc-assets` | `asset_qc_gate` | **PASS** |
| qc-assets | POST | `/api/pipeline/qc-assets/stream` | `asset_qc_gate` | **PASS** |
| storyboard | POST | `/api/pipeline/storyboard` | `storyboard_csv` | **PASS** |
| storyboard | POST | `/api/pipeline/storyboard/stream` | `storyboard_csv` | **PASS** |
| **design-characters** | POST | `/api/pipeline/design-characters` | `character_costume` | **PASS** (Part 4 新增) |
| **design-characters** | POST | `/api/pipeline/design-characters/stream` | `character_costume` | **PASS** (Part 4 新增) |
| run | POST | `/api/pipeline/run` | 多 step 编排 | **PASS** |

### Project Context & Asset Library 接口（Part 4 新增，无需鉴权）

| 功能 | Method | Path | 测试状态 |
| --- | --- | --- | --- |
| 保存 Context | PUT | `/api/projects/:projectId/context` | **PASS** |
| 读取 Context | GET | `/api/projects/:projectId/context` | **PASS** |
| 读取 Context 单字段 | GET | `/api/projects/:projectId/context/:key` | **PASS** |
| 保存资产库 | PUT | `/api/projects/:projectId/asset-library` | **PASS** |
| 读取资产库 | GET | `/api/projects/:projectId/asset-library` | **PASS** |
| 角色列表 | GET | `/api/projects/:projectId/characters` | **PASS** |
| 服装列表 | GET | `/api/projects/:projectId/costumes` | **PASS** |

### Novel 长篇处理接口（无需鉴权）

| 功能 | Method | Path | 说明 |
| --- | --- | --- | --- |
| 结构分析 | POST | `/api/novel/structure` | 分析小说章节结构 |
| 分段处理 | POST | `/api/novel/chunk` | 单段分析（前端并发调用） |
| 聚合（同步） | POST | `/api/novel/aggregate` | 分批聚合分段结果为完整 CSV |
| 聚合（SSE 流式） | POST | `/api/novel/aggregate-stream` | 流式聚合，支持思考过程推送 |
| 快速预览 | POST | `/api/novel/preview` | 采样预览小说概要 |

---

## 通用约定

### 1. 鉴权

所有接口均无需鉴权（JWT 已在 Part 5 移除）。Project 接口无 token 时使用 `_public` 存储。

### 2. Context 自动注入

Pipeline 所有步骤（sync + stream）支持 **context 自动注入**：当请求体包含 `projectId` 时，后端自动从 `project.data.context` 读取 `storyBible`、`screenplays`、`breakdownRows` 等上游数据，合并到请求体。**body 显式传入的字段优先级更高。**

```json
{
  "projectId": "avatar_test_001",
  "totalEpisodes": 5
}
```

上例中，后端会自动注入 context 中保存的 `storyBible`、`screenplays` 等，无需前端重复传入。

### 3. 通用错误响应

```json
{
  "error": "Missing required field: novelText",
  "step": "extract-bible"
}
```

### 4. 同步接口统一返回格式

```json
{
  "result": "agent 输出正文",
  "reasoning": "可选的思考内容",
  "tokens": { "input": 1234, "output": 567 },
  "step": "breakdown",
  "agent": "story_breakdown_pack"
}
```

### 5. 流式接口统一返回格式

所有 stream 接口使用 `text/event-stream`：

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"..."}
data: {"type":"done","fullText":"...","fullThinking":"...","tokens":{"input":123,"output":456}}
data: {"type":"error","error":"..."}
```

---

## Pipeline 接口

### 1. 提取 Story Bible

#### `POST /api/pipeline/extract-bible`

**Agent:** `story_bible_extractor`
**Summary:** 从小说全文中提取结构化的 Story Bible JSON

**请求体：**

```json
{
  "novelText": "小说全文（必填）",
  "totalEpisodes": 80,
  "episodeDuration": 90,
  "shotsPerMin": 8,
  "characterNotes": "用户补充的人物要求",
  "globalDirective": "全局创作要求",
  "stylePreferences": "风格偏好"
}
```

**测试结果（阿凡达）：**

```
Tokens: {input: 517, output: 443}
Result: {"meta":{"title":"Avatar","genre":"Science Fiction","tone":"Epic, Emotional",...},"characters":[{"name":"Jake Sully","pronouns":"he/him",...}]}
```

#### `POST /api/pipeline/extract-bible/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 2. 剧情拆解

#### `POST /api/pipeline/breakdown`

**Agent:** `story_breakdown_pack`
**Summary:** 根据小说正文生成分集剧情拆解 CSV

**请求体：**

```json
{
  "novelText": "小说全文（必填）",
  "totalEpisodes": 80,
  "storyBible": { "meta": {}, "characters": [] }
}
```

**输出 CSV 表头：** `ep_id,arc_block,source_range,source_text`

**测试结果（阿凡达）：**

```
Result: E001,1-2,Jake Sully到达潘多拉...
E002,3-4,Grace Augustine领导阿凡达项目...
```

#### `POST /api/pipeline/breakdown/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 3. 单集剧本生成

#### `POST /api/pipeline/screenplay`

**Agent:** `screenwriter`
**Summary:** 根据单集映射行和原文片段生成一集剧本

**请求体：**

```json
{
  "episodeMappingRow": "E001,1-20,剧情摘要,...（必填）",
  "sourceText": "该集对应的原文片段（必填）",
  "characterPronouns": { "Jake Sully": "he/him", "Neytiri": "she/her" },
  "screenwriterMode": "shootable_90s_pro",
  "storyBible": { "meta": {}, "characters": [] }
}
```

**测试结果（阿凡达）：**

```
Tokens: {input: 905, output: 768}
Has time blocks: True
Result: "0:00-0:15\nINT. PANDORA SPACEPORT - DAY\n[Visual] Jake Sully in wheelchair..."
```

#### `POST /api/pipeline/screenplay/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 4. 资产提取

#### `POST /api/pipeline/extract-assets`

**Agent:** `asset_extractor`
**Summary:** 从剧本中提取角色、服装、道具、场景等资产

**请求体：**

```json
{
  "screenplay": "剧本文本（必填）",
  "storyBible": { "meta": {}, "characters": [] }
}
```

**测试结果（阿凡达）：** `Tokens: {input: 294, output: 255}` — 正确提取角色（Jake Sully, Grace Augustine, Neytiri）

#### `POST /api/pipeline/extract-assets/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 5. 资产 QC

#### `POST /api/pipeline/qc-assets`

**Agent:** `asset_qc_gate`
**Summary:** 对提取出的资产结果进行一致性校验

**请求体：**

```json
{
  "assets": { "character_library": [], "scene_library": [], "prop_library": [] },
  "storyBible": { "meta": {}, "characters": [] }
}
```

**测试结果（阿凡达）：** `{"pass":true,"errors":[],"warnings":[]}`

#### `POST /api/pipeline/qc-assets/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 6. 分镜生成

#### `POST /api/pipeline/storyboard`

**Agent:** `storyboard_csv`
**Summary:** 根据剧本和可用资产生成分镜 CSV

**请求体：**

```json
{
  "screenplay": "剧本文本（必填）",
  "assets": { "characters": [], "props": [], "scenes": [] },
  "storyBible": { "meta": {}, "characters": [] }
}
```

**测试结果（阿凡达）：**

```
Tokens: {input: 603, output: 328}
CSV 表头: 镜号,时间码,场景,角色,服装,道具,景别,角度,焦距,运动,构图,画面描述,动作,神态,台词,旁白,光线,音效,叙事功能,Image_Prompt,Video_Prompt
```

#### `POST /api/pipeline/storyboard/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 7. 角色服装设计（Part 4 新增）

#### `POST /api/pipeline/design-characters`

**Agent:** `character_costume`
**Summary:** 从全部剧本中提取角色和服装资产库（4张表）

**请求体：**

```json
{
  "screenplays": { "0": "=== E001 ===\n剧本1...", "1": "=== E002 ===\n剧本2..." },
  "screenplay": "单剧本文本（与 screenplays 二选一）",
  "storyBible": { "meta": {}, "characters": [] },
  "totalEpisodes": 80,
  "episodeDuration": 90,
  "globalDirective": "总提示词",
  "assets": "已有基础资产（可选）"
}
```

**必填：** `screenplays` 或 `screenplay`（二选一）

**支持 Context 自动注入 — 可只传 `projectId`：**

```json
{
  "projectId": "avatar_test_001",
  "totalEpisodes": 5,
  "episodeDuration": 90
}
```

后端自动从 context 读取 `screenplays` + `storyBible`，无需前端传入。

**测试结果（阿凡达，仅传 projectId + context 自动注入）：**

```
Tokens: {input: 1177, output: 1920}
Result: {
  "characters": [
    {"name": "Jake Sully", "aliases": ["杰克"], "pronouns": "he/him", ...},
    {"name": "Neytiri", "aliases": ["奈蒂莉"], "pronouns": "she/her", ...},
    ...
  ],
  "costumes": [...]
}
```

#### `POST /api/pipeline/design-characters/stream`

请求体与同步接口相同，返回 SSE 流。

---

### 8. Pipeline 编排运行

#### `POST /api/pipeline/run`

**Summary:** 通过 SSE 串行执行多个 pipeline step

**请求体：**

```json
{
  "novelText": "小说全文",
  "totalEpisodes": 80,
  "steps": ["extract-bible", "breakdown"],
  "storyBible": {},
  "characterNotes": "", "globalDirective": "", "stylePreferences": "",
  "episodeDuration": 90, "shotsPerMin": 8,
  "episodeMappingRow": "", "sourceText": "",
  "characterPronouns": {}, "screenwriterMode": "shootable_90s_pro",
  "screenplay": "", "assets": {}
}
```

**SSE 事件：**

```text
data: {"type":"step_start","step":"breakdown","stepIndex":0,"totalSteps":1}
data: {"type":"thinking","step":"breakdown","content":"..."}
data: {"type":"chunk","step":"breakdown","content":"..."}
data: {"type":"step_complete","step":"breakdown","result":"...","tokens":{...}}
data: {"type":"pipeline_complete","results":{"breakdown":"..."}}
data: {"type":"error","step":"breakdown","error":"...","recoverable":true}
data: {"type":"heartbeat"}
```

---

## Project Context API（Part 4 新增）

### 9. 保存 Pipeline Context

#### `PUT /api/projects/:projectId/context`

**Summary:** Merge-patch 保存 pipeline 上下文到 `project.data.context`，不覆盖未传入的字段

**请求体：**

```json
{
  "storyBible": { "meta": {"title": "阿凡达"}, "characters": [...] },
  "screenplays": { "0": "剧本1...", "1": "剧本2..." },
  "breakdownRows": [...],
  "breakdownHeaders": [...],
  "projectConfig": { "totalEpisodes": 5, "episodeDuration": 90 },
  "assetLibrary": { "character_library": [...], "costume_library": [...] }
}
```

所有字段均可选，只写入传入的字段。

**测试结果（阿凡达）：**

```json
{"status": "ok"}
```

验证：先 PUT storyBible，再 PUT screenplays，两次合并后 GET 返回完整 context 包含两者。

---

### 10. 读取 Pipeline Context

#### `GET /api/projects/:projectId/context`

**Summary:** 返回完整的 pipeline context 对象

**测试结果（阿凡达）：**

```json
{
  "storyBible": { "meta": {"title": "阿凡达", ...}, "characters": [...] },
  "projectConfig": { "totalEpisodes": 5, "episodeDuration": 90 },
  "screenplays": { "0": "...", "1": "..." }
}
```

---

### 11. 读取 Context 单个字段

#### `GET /api/projects/:projectId/context/:key`

**参数：** `:key` = `storyBible` | `screenplays` | `breakdownRows` | `breakdownHeaders` | `projectConfig` | `assetLibrary`

**测试结果（阿凡达）：**

- `GET .../context/storyBible` → `{"meta":{"title":"阿凡达",...},"characters":[...]}`
- `GET .../context/screenplays` → `{"0":"...","1":"..."}`
- `GET .../context/nonexistent` → `null`

---

## Project Asset Library API

### 12. 保存资产库

#### `PUT /api/projects/:projectId/asset-library`

**Summary:** 保存完整资产库（character_library, costume_library, scene_library, prop_library）

**请求体：**

```json
{
  "character_library": [
    {"name": "Jake Sully", "gender": "男", "age": "28", "appearance": "...", "personality": "勇敢坚韧"}
  ],
  "costume_library": [
    {"character": "Jake Sully", "name": "海军陆战队制服", "description": "迷彩军装，轮椅"}
  ],
  "scene_library": [
    {"name": "潘多拉丛林", "description": "生物荧光植物密布的外星丛林"}
  ],
  "prop_library": [
    {"name": "阿凡达连接舱", "description": "高科技意识连接设备"}
  ]
}
```

**测试结果：** `{"status": "ok"}`

---

### 13. 读取资产库

#### `GET /api/projects/:projectId/asset-library`

**测试结果（阿凡达）：**

```
Keys: character_library, costume_library, scene_library, prop_library
Characters: 4, Costumes: 5, Scenes: 4, Props: 3
```

---

### 14. 角色列表

#### `GET /api/projects/:projectId/characters`

**Summary:** 只返回 `character_library` 数组（供 @ 选择器用）

**测试结果（阿凡达）：**

```
- Jake Sully: 勇敢坚韧
- Neytiri: 骄傲勇敢
- Colonel Quaritch: 冷酷无情
- Grace Augustine: 严肃专业
```

---

### 15. 服装列表

#### `GET /api/projects/:projectId/costumes`

**Summary:** 只返回 `costume_library` 数组

**测试结果（阿凡达）：**

```
- Jake Sully: 海军陆战队制服
- Jake Sully: 阿凡达战甲
- Neytiri: 猎人装束
- Colonel Quaritch: AMP机甲
- Grace Augustine: 实验室白大褂
```

---

## Novel 长篇处理接口

### 16. 小说结构分析

#### `POST /api/novel/structure`

**鉴权:** 无需

```json
{ "novel": "小说全文（必填）" }
```

**200 响应：**

```json
{
  "result": "{\"title\":\"...\",\"totalChars\":869046,\"estimatedEpisodes\":80}",
  "totalChars": 869046
}
```

---

### 17. 分段处理

#### `POST /api/novel/chunk`

**鉴权:** 无需

```json
{
  "chunkText": "预切片的文本段",
  "chunkIndex": 0,
  "chunkSize": 100000,
  "totalChunks": 9,
  "agentId": "story_breakdown_pack",
  "context": { "previousSummary": "前文摘要" }
}
```

**200 响应：**

```json
{
  "result": "agent 对该段的分析输出",
  "chunkIndex": 0,
  "processed": "0-100000",
  "tokens": { "input": 24920, "output": 2984 }
}
```

---

### 18. 聚合分段结果（同步）

#### `POST /api/novel/aggregate`

**鉴权:** 无需

```json
{
  "chunks": ["段落1结果", "段落2结果"],
  "targetEpisodes": 80,
  "title": "小说标题",
  "novelText": "小说全文（用于 source_range）",
  "chunkSize": 100000
}
```

**200 响应：**

```json
{ "result": "ep_id,arc_block,source_range,source_text\nE001,A1,8-28,\"原文...\"\n..." }
```

---

### 19. 聚合分段结果（SSE 流式）

#### `POST /api/novel/aggregate-stream`

**鉴权:** 无需

请求体与同步聚合相同。

**SSE 事件类型：**

| type | 字段 | 说明 |
| --- | --- | --- |
| `progress` | `message`, `batch`, `totalBatches` | 进度消息 |
| `batch_thinking` | `batch`, `content` | 模型思考过程 |
| `batch_content` | `batch`, `content` | 模型 CSV 输出 |
| `batch_done` | `batch`, `totalBatches`, `episodes`, `status` | 单批完成 |
| `heartbeat` | `completed`, `total` | 心跳 |
| `done` | `result`, `episodes`, `targetEpisodes` | 全部完成 |
| `error` | `error` | 错误 |

---

### 20. 快速预览

#### `POST /api/novel/preview`

**鉴权:** 无需

```json
{
  "novel": "小说全文（必填）",
  "sampleSize": 3000
}
```

**200 响应：**

```json
{ "result": "{\"title\":\"\",\"genre\":\"\",\"mainCharacters\":[],\"estimatedEpisodes\":80}" }
```

---

## 测试摘要（阿凡达 Avatar）

测试日期：2026-03-18
测试 Provider：DashScope (Qwen)
测试项目 ID：`avatar_test_001`

| 接口 | 状态 | Tokens (in/out) | 备注 |
| --- | --- | --- | --- |
| extract-bible | **PASS** | 517/443 | 正确提取 4 角色 |
| breakdown | **PASS** | — | 长文本场景下 LLM 延迟较高 |
| screenplay | **PASS** | 905/768 | 正确输出 6 时间段 |
| extract-assets | **PASS** | 294/255 | 正确提取角色/场景 |
| qc-assets | **PASS** | 223/11 | QC 通过 |
| storyboard | **PASS** | 603/328 | 正确输出 21 列 CSV |
| design-characters | **PASS** | 1177/1920 | 正确提取角色+服装（context 自动注入） |
| PUT context | **PASS** | — | merge patch 正确，不覆盖已有字段 |
| GET context | **PASS** | — | 返回完整 context |
| GET context/:key | **PASS** | — | 支持单字段读取，不存在返回 null |
| PUT asset-library | **PASS** | — | 4 角色 5 服装 4 场景 3 道具 |
| GET asset-library | **PASS** | — | 完整返回 |
| GET characters | **PASS** | — | 只返回 character_library |
| GET costumes | **PASS** | — | 只返回 costume_library |

---

## 代码依据

- Pipeline 路由注册：`proxy-server.js`、`pipeline/routes/sync.js`、`pipeline/routes/stream.js`、`pipeline/routes/orchestrate.js`
- Context 层：`pipeline/services/project-context.js`（Part 4 新增）
- Novel 路由注册：`proxy-server.js`（`/api/novel/*`）
- Step 与 agent 映射：`pipeline/config.js`
- 请求字段与组装规则：`pipeline/services/prompt-builder.js`
- SSE 工具：`pipeline/utils/sse.js`
- Agent 配置：`agents-config.js`

## 相关文件

- `fizzdragon-backend/proxy-server.js` — 主服务器 + Context/Asset Library 路由
- `fizzdragon-backend/pipeline/config.js` — step ↔ agent 映射
- `fizzdragon-backend/pipeline/routes/sync.js` — 同步 pipeline 路由（含 context 注入）
- `fizzdragon-backend/pipeline/routes/stream.js` — 流式 pipeline 路由（含 context 注入）
- `fizzdragon-backend/pipeline/routes/orchestrate.js` — 编排路由
- `fizzdragon-backend/pipeline/services/prompt-builder.js` — 提示词构建
- `fizzdragon-backend/pipeline/services/project-context.js` — Context 读写（Part 4 新增）
- `fizzdragon-backend/pipeline/utils/sse.js` — SSE 工具
- `fizzdragon-backend/agents-config.js` — Agent 配置
