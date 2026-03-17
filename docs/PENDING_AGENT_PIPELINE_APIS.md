# FizzDragon Backend  Agent Pipeline 接口文档

> 范围：仅覆盖当前未提交的 backend 新增接口
> Base URL: `http://localhost:3001`
> 鉴权方式：`Authorization: Bearer <JWT>`（Pipeline 接口需要，Novel 接口不需要）
> Content-Type: `application/json`

---

## 文档说明

这份文档整理当前未提交代码里新增的 backend agent / pipeline / novel 接口，不包含老的 `/api/agent/:agentId`、`/api/agent-stream/:agentId` 等通用接口。

- 新增接口族：`/api/pipeline/*`（13 个）、`/api/novel/*`（5 个）
- 新增接口总数：`18`
- 本次 diff 里真正新增的 agent 配置：`story_bible_extractor`
- 其它 pipeline step 是对已有 agent 的流程化封装

## 全部接口总览

### Pipeline 接口（需要 JWT 鉴权）

| Step | Method | Path | 对应 Agent ID | 是否本次新增 Agent |
| --- | --- | --- | --- | --- |
| extract-bible | POST | `/api/pipeline/extract-bible` | `story_bible_extractor` | 是 |
| extract-bible | POST | `/api/pipeline/extract-bible/stream` | `story_bible_extractor` | 是 |
| breakdown | POST | `/api/pipeline/breakdown` | `story_breakdown_pack` | 否 |
| breakdown | POST | `/api/pipeline/breakdown/stream` | `story_breakdown_pack` | 否 |
| screenplay | POST | `/api/pipeline/screenplay` | `screenwriter` | 否 |
| screenplay | POST | `/api/pipeline/screenplay/stream` | `screenwriter` | 否 |
| extract-assets | POST | `/api/pipeline/extract-assets` | `asset_extractor` | 否 |
| extract-assets | POST | `/api/pipeline/extract-assets/stream` | `asset_extractor` | 否 |
| qc-assets | POST | `/api/pipeline/qc-assets` | `asset_qc_gate` | 否 |
| qc-assets | POST | `/api/pipeline/qc-assets/stream` | `asset_qc_gate` | 否 |
| storyboard | POST | `/api/pipeline/storyboard` | `storyboard_csv` | 否 |
| storyboard | POST | `/api/pipeline/storyboard/stream` | `storyboard_csv` | 否 |
| run | POST | `/api/pipeline/run` | 多 step 编排 | 否 |

### Novel 长篇处理接口（无需鉴权）

| 功能 | Method | Path | 说明 |
| --- | --- | --- | --- |
| 结构分析 | POST | `/api/novel/structure` | 分析小说章节结构 |
| 分段处理 | POST | `/api/novel/chunk` | 单段分析（前端并发调用） |
| 聚合（同步） | POST | `/api/novel/aggregate` | 分批聚合分段结果为完整 CSV |
| 聚合（SSE 流式） | POST | `/api/novel/aggregate-stream` | 流式聚合，支持思考过程推送 |
| 快速预览 | POST | `/api/novel/preview` | 采样预览小说概要 |

## 通用约定

### 1. 鉴权

本文档中的所有接口都需要 JWT 鉴权。

**请求头**
```http
Authorization: Bearer <token>
```

### 2. 通用错误响应

**400 / 500 Response**
```json
{
  "error": "Missing required field: novelText",
  "step": "extract-bible"
}
```

### 3. 同步接口统一返回格式

所有同步 step 接口返回结构一致：

```json
{
  "result": "agent 输出正文",
  "reasoning": "可选的思考内容",
  "tokens": {
    "input": 1234,
    "output": 567
  },
  "step": "breakdown",
  "agent": "story_breakdown_pack"
}
```

### 4. 流式接口统一返回格式

所有 stream 接口都使用 `text/event-stream`。

典型 SSE 事件如下：

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"..."}
data: {"type":"done","fullText":"...","fullThinking":"...","tokens":{"input":123,"output":456}}
data: {"type":"error","error":"..."}
```

---

## 1. 提取 Story Bible

### `POST /api/pipeline/extract-bible`

**Tags:** `Pipeline`  
**Summary:** 从小说全文中提取结构化的 Story Bible JSON  
**Agent:** `story_bible_extractor`

#### 请求体

```json
{
  "novelText": "小说全文",
  "totalEpisodes": 80,
  "episodeDuration": 90,
  "shotsPerMin": 8,
  "characterNotes": "用户补充的人物要求",
  "globalDirective": "全局创作要求",
  "stylePreferences": "风格偏好"
}
```

#### 必填字段

- `novelText`

#### 200 响应

```json
{
  "result": "{\"meta\":{},\"characters\":[],\"userDirectives\":{}}",
  "reasoning": null,
  "tokens": {
    "input": 1234,
    "output": 567
  },
  "step": "extract-bible",
  "agent": "story_bible_extractor"
}
```

### `POST /api/pipeline/extract-bible/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回 Story Bible 提取结果  
**Agent:** `story_bible_extractor`

#### 请求体

与 `/api/pipeline/extract-bible` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"{\"meta\":..."}
data: {"type":"done","fullText":"{\"meta\":{},\"characters\":[]}","fullThinking":"...","tokens":{"input":1234,"output":567}}
```

---

## 2. 剧情拆解

### `POST /api/pipeline/breakdown`

**Tags:** `Pipeline`  
**Summary:** 根据小说正文生成分集剧情拆解 CSV  
**Agent:** `story_breakdown_pack`

#### 请求体

```json
{
  "novelText": "小说全文",
  "totalEpisodes": 80,
  "storyBible": {
    "meta": {},
    "characters": []
  }
}
```

#### 必填字段

- `novelText`

#### 200 响应

```json
{
  "result": "ep_id,arc_block,source_range\nE001,A1,8-28\nE002,A1,29-54\n...",
  "reasoning": null,
  "tokens": {
    "input": 2000,
    "output": 1200
  },
  "step": "breakdown",
  "agent": "story_breakdown_pack"
}
```

#### 输出说明

预期 CSV 表头：

```text
ep_id,arc_block,source_range
```

| 字段 | 说明 |
| --- | --- |
| `ep_id` | 集号，格式 `E001`-`E080` |
| `arc_block` | 故事弧段标记，如 `A1`、`A2`、`B1`、`C1` 等，相邻集属同一弧段时使用相同标记 |
| `source_range` | 原文行号范围，如 `8-28`，后续编剧步骤根据此范围提取原文进行改编 |

### `POST /api/pipeline/breakdown/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回剧情拆解结果  
**Agent:** `story_breakdown_pack`

#### 请求体

与 `/api/pipeline/breakdown` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"ep_id,arc_block,source_range\nE001,A1,8-28"}
data: {"type":"done","fullText":"ep_id,arc_block,source_range\nE001,A1,8-28\n...","fullThinking":"...","tokens":{"input":2000,"output":1200}}
```

---

## 3. 单集剧本生成

### `POST /api/pipeline/screenplay`

**Tags:** `Pipeline`  
**Summary:** 根据单集映射行和原文片段生成一集剧本  
**Agent:** `screenwriter`

#### 请求体

```json
{
  "episodeMappingRow": "E001,1-20,剧情摘要,...",
  "sourceText": "该集对应的原文片段",
  "characterPronouns": {
    "Alice": "she/her",
    "Bob": "he/him"
  },
  "screenwriterMode": "shootable_90s_pro",
  "storyBible": {
    "meta": {},
    "characters": []
  }
}
```

#### 必填字段

- `episodeMappingRow`
- `sourceText`

#### 200 响应

```json
{
  "result": "0:00-0:15\n[Visual] ...",
  "reasoning": null,
  "tokens": {
    "input": 1800,
    "output": 1500
  },
  "step": "screenplay",
  "agent": "screenwriter"
}
```

#### 说明

- 默认 `screenwriterMode` 为 `shootable_90s_pro`
- 在 `shootable_90s_pro` 模式下，提示词强制要求输出 6 个固定时间段

### `POST /api/pipeline/screenplay/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回单集剧本生成结果  
**Agent:** `screenwriter`

#### 请求体

与 `/api/pipeline/screenplay` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"0:00-0:15\n[Visual] ..."}
data: {"type":"done","fullText":"完整剧本","fullThinking":"...","tokens":{"input":1800,"output":1500}}
```

---

## 4. 资产提取

### `POST /api/pipeline/extract-assets`

**Tags:** `Pipeline`  
**Summary:** 从剧本中提取角色、服装、道具、场景等资产  
**Agent:** `asset_extractor`

#### 请求体

```json
{
  "screenplay": "剧本文本",
  "storyBible": {
    "meta": {},
    "characters": []
  }
}
```

#### 必填字段

- `screenplay`

#### 200 响应

```json
{
  "result": "{...资产提取结果...}",
  "reasoning": null,
  "tokens": {
    "input": 900,
    "output": 700
  },
  "step": "extract-assets",
  "agent": "asset_extractor"
}
```

### `POST /api/pipeline/extract-assets/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回资产提取结果  
**Agent:** `asset_extractor`

#### 请求体

与 `/api/pipeline/extract-assets` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"..."}
data: {"type":"done","fullText":"...","fullThinking":"...","tokens":{"input":900,"output":700}}
```

---

## 5. 资产 QC

### `POST /api/pipeline/qc-assets`

**Tags:** `Pipeline`  
**Summary:** 对提取出的资产结果进行一致性校验  
**Agent:** `asset_qc_gate`

#### 请求体

```json
{
  "assets": {
    "characters": [],
    "costumes": [],
    "props": [],
    "scenes": []
  },
  "storyBible": {
    "meta": {},
    "characters": []
  }
}
```

#### 必填字段

- `assets`

#### 200 响应

```json
{
  "result": "{...QC结果...}",
  "reasoning": null,
  "tokens": {
    "input": 600,
    "output": 400
  },
  "step": "qc-assets",
  "agent": "asset_qc_gate"
}
```

### `POST /api/pipeline/qc-assets/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回资产 QC 结果  
**Agent:** `asset_qc_gate`

#### 请求体

与 `/api/pipeline/qc-assets` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"..."}
data: {"type":"done","fullText":"...","fullThinking":"...","tokens":{"input":600,"output":400}}
```

---

## 6. 分镜生成

### `POST /api/pipeline/storyboard`

**Tags:** `Pipeline`  
**Summary:** 根据剧本和可用资产生成分镜内容  
**Agent:** `storyboard_csv`

#### 请求体

```json
{
  "screenplay": "剧本文本",
  "assets": {
    "characters": [],
    "props": [],
    "scenes": []
  },
  "storyBible": {
    "meta": {},
    "characters": []
  }
}
```

#### 必填字段

- `screenplay`

#### 200 响应

```json
{
  "result": "shot_no,scene,visual,style,angle,size,motion,dialogue,...",
  "reasoning": null,
  "tokens": {
    "input": 1100,
    "output": 950
  },
  "step": "storyboard",
  "agent": "storyboard_csv"
}
```

### `POST /api/pipeline/storyboard/stream`

**Tags:** `Pipeline`  
**Summary:** 以 SSE 方式流式返回分镜生成结果  
**Agent:** `storyboard_csv`

#### 请求体

与 `/api/pipeline/storyboard` 相同。

#### SSE 示例

```text
data: {"type":"thinking","content":"..."}
data: {"type":"chunk","content":"shot_no,scene,..."}
data: {"type":"done","fullText":"完整分镜","fullThinking":"...","tokens":{"input":1100,"output":950}}
```

---

## 7. Pipeline 编排运行

### `POST /api/pipeline/run`

**Tags:** `Pipeline`  
**Summary:** 通过 SSE 串行执行多个 pipeline step  
**Route Type:** 编排接口

#### 请求体

```json
{
  "novelText": "小说全文",
  "totalEpisodes": 80,
  "steps": ["extract-bible", "breakdown"],
  "storyBible": {
    "meta": {},
    "characters": []
  },
  "characterNotes": "人物补充要求",
  "globalDirective": "全局要求",
  "stylePreferences": "风格偏好",
  "episodeDuration": 90,
  "shotsPerMin": 8,
  "episodeMappingRow": "E001,...",
  "sourceText": "原文片段",
  "characterPronouns": {
    "Alice": "she/her"
  },
  "screenwriterMode": "shootable_90s_pro",
  "screenplay": "剧本文本",
  "assets": {
    "characters": [],
    "props": []
  }
}
```

#### 说明

- 默认 `steps` 为 `["breakdown"]`
- 如果先执行 `extract-bible`，其结果会自动注入后续 step，作为 `storyBible`
- 不同步骤依赖的字段不同，缺字段时会在对应 step 返回错误

#### SSE 示例

```text
data: {"type":"step_start","step":"breakdown","stepIndex":0,"totalSteps":1}
data: {"type":"thinking","step":"breakdown","content":"..."}
data: {"type":"chunk","step":"breakdown","content":"..."}
data: {"type":"step_complete","step":"breakdown","result":"...","thinking":"...","tokens":{"input":123,"output":456}}
data: {"type":"pipeline_complete","results":{"breakdown":"..."}}
data: {"type":"error","step":"breakdown","error":"...","recoverable":true}
data: {"type":"heartbeat"}
```

---

## 8. 小说结构分析

### `POST /api/novel/structure`

**Tags:** `Novel`
**Summary:** 采样小说前 10000 字，分析章节结构，推荐集数和分段大小
**鉴权:** 无需

#### 请求体

```json
{
  "novel": "小说全文"
}
```

#### 必填字段

- `novel`

#### 200 响应

```json
{
  "result": "{\"title\":\"...\",\"totalChars\":869046,\"structure\":[...],\"estimatedEpisodes\":80,\"chunkSize\":100000}",
  "totalChars": 869046
}
```

---

## 9. 分段处理

### `POST /api/novel/chunk`

**Tags:** `Novel`
**Summary:** 对长篇小说的单个分段调用 agent 分析，前端并发多次调用
**鉴权:** 无需

#### 请求体

```json
{
  "chunkText": "预切片的文本段",
  "chunkIndex": 0,
  "chunkSize": 100000,
  "totalChunks": 9,
  "agentId": "story_breakdown_pack",
  "context": {
    "previousSummary": "前文摘要"
  }
}
```

或使用后端切片：

```json
{
  "novel": "小说全文",
  "chunkIndex": 0,
  "chunkSize": 100000,
  "totalChunks": 9,
  "agentId": "story_breakdown_pack"
}
```

#### 必填字段

- `chunkText` 或 `novel`（二选一）

#### 200 响应

```json
{
  "result": "agent 对该段的分析输出",
  "chunkIndex": 0,
  "processed": "0-100000",
  "tokens": { "input": 24920, "output": 2984 }
}
```

---

## 10. 聚合分段结果（同步）

### `POST /api/novel/aggregate`

**Tags:** `Novel`
**Summary:** 将多段分析结果聚合为完整的分集拆解 CSV，分批调用模型（每批 27 集），同步返回
**鉴权:** 无需

#### 请求体

```json
{
  "chunks": ["段落1分析结果", "段落2分析结果", "..."],
  "targetEpisodes": 80,
  "title": "小说标题",
  "novelText": "小说全文（用于计算 source_range）",
  "chunkSize": 100000
}
```

#### 必填字段

- `chunks`

#### 200 响应

```json
{
  "result": "ep_id,arc_block,source_range\nE001,A1,8-28\nE002,A1,29-54\n..."
}
```

#### 说明

- 内部按 BATCH_SIZE=27 分批并行调用模型
- 如果模型输出 CSV 解析失败，会尝试 JSON 解析转换
- 不足集数时使用 `buildAggregateCsvFromChunkResults` 确定性补齐
- 同步接口，大量集数时可能超时（推荐用 aggregate-stream）

---

## 11. 聚合分段结果（SSE 流式）

### `POST /api/novel/aggregate-stream`

**Tags:** `Novel`
**Summary:** 流式版聚合，通过 SSE 推送进度、模型思考过程和内容，避免超时
**鉴权:** 无需
**模型:** `callClaudeWithStreaming`（默认 `deepseek-chat`），支持 `<thinking>` 标签检测

#### 请求体

```json
{
  "chunks": ["段落1分析结果", "段落2分析结果", "..."],
  "targetEpisodes": 80,
  "title": "小说标题",
  "novelText": "小说全文（用于计算 source_range）",
  "chunkSize": 100000
}
```

#### 必填字段

- `chunks`

#### SSE 事件类型

| 事件 type | 字段 | 说明 |
| --- | --- | --- |
| `progress` | `message`, `batch`, `totalBatches` | 进度消息（开始聚合、分批数、补齐缺失等） |
| `batch_thinking` | `batch`, `content` | 模型思考过程（`<thinking>` 标签内容），逐 chunk 推送 |
| `batch_content` | `batch`, `content` | 模型输出内容（CSV），逐 chunk 推送 |
| `batch_done` | `batch`, `totalBatches`, `episodes`, `status` | 单批完成，status: `ok` / `ok_converted` / `ok_fallback` / `parse_failed` / `error` |
| `heartbeat` | `completed`, `total` | 每 15 秒心跳，防止连接超时 |
| `done` | `result`, `episodes`, `targetEpisodes` | 全部完成，`result` 为合并后的完整 CSV |
| `error` | `error` | 错误信息 |

#### SSE 示例

```text
data: {"type":"progress","message":"開始聚合 80 集","batch":0,"totalBatches":0}
data: {"type":"progress","message":"分 3 批並行調用模型","batch":0,"totalBatches":3}
data: {"type":"batch_thinking","batch":1,"content":"本批次覆蓋原文行8-637..."}
data: {"type":"batch_content","batch":1,"content":"ep_id,arc_block,source_range\nE001,A1,8-28"}
data: {"type":"batch_content","batch":1,"content":"\nE002,A1,29-54"}
data: {"type":"heartbeat","completed":1,"total":3}
data: {"type":"batch_done","batch":1,"totalBatches":3,"episodes":27,"status":"ok"}
data: {"type":"batch_done","batch":2,"totalBatches":3,"episodes":27,"status":"ok"}
data: {"type":"batch_done","batch":3,"totalBatches":3,"episodes":26,"status":"ok"}
data: {"type":"progress","message":"模型產出 80/80 集","batch":3,"totalBatches":3}
data: {"type":"done","result":"ep_id,arc_block,source_range\nE001,A1,8-28\n...","episodes":80,"targetEpisodes":80}
```

#### 内部流程

1. 按 `BATCH_SIZE=27` 将目标集数分为 N 批（80 集 → 3 批：27+27+26）
2. 3 批并行调用 `callClaudeWithStreaming`（直连 DeepSeek，不经过 request queue）
3. 流式推送 `batch_thinking`（模型 `<thinking>` 标签内的推理）和 `batch_content`（CSV 输出）
4. 每批完成后推送 `batch_done`，合并所有批次 CSV
5. 不足集数时用 `buildAggregateCsvFromChunkResults` 确定性补齐
6. 按 ep_id 排序后推送 `done` 事件
7. 如果流式调用失败，fallback 到非流式 `callClaude`（单次重试）

#### 错误处理

- 单批流式失败 → fallback 到非流式 `callClaude`，推送 `batch_done` status=`ok_fallback`
- fallback 也失败 → 推送 `batch_done` status=`error`
- 全局异常 → 推送 `error` 事件并结束连接

---

## 12. 快速预览

### `POST /api/novel/preview`

**Tags:** `Novel`
**Summary:** 采样小说开头、中间、结尾各 3000 字，快速生成概要
**鉴权:** 无需

#### 请求体

```json
{
  "novel": "小说全文",
  "sampleSize": 3000
}
```

#### 必填字段

- `novel`

#### 200 响应

```json
{
  "result": "{\"title\":\"推测标题\",\"genre\":\"类型\",\"themes\":[],\"mainCharacters\":[],\"plotSummary\":\"...\",\"estimatedEpisodes\":80,\"style\":\"...\"}"
}
```

---

## 代码依据

- Pipeline 路由注册：`proxy-server.js`、`pipeline/routes/sync.js`、`pipeline/routes/orchestrate.js`
- Novel 路由注册：`proxy-server.js`（`/api/novel/*`）
- Step 与 agent 映射：`pipeline/config.js`
- 请求字段与组装规则：`pipeline/services/prompt-builder.js`
- SSE 工具：`pipeline/utils/sse.js`（`createSSEWriter`、`startHeartbeat`）
- 新增 agent 配置：`agents-config.js`
- 流式模型调用：`callClaudeWithStreaming()`（支持 `options.model` 覆盖、`ThinkingStreamDetector` 自动检测 `<thinking>` 标签）
- 自测脚本：`test-aggregate-stream.js`

## 相关文件

- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/proxy-server.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/pipeline/config.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/pipeline/routes/sync.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/pipeline/routes/orchestrate.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/pipeline/services/prompt-builder.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/pipeline/utils/sse.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/agents-config.js`
- `/Users/jiangchengji/ai/fizzdragon/fizzdragon-backend/test-aggregate-stream.js`
