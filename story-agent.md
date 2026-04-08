# Story Agent / Skill 对照文档


---

## 1. Pipeline 主流程总览

主流程映射来自：`fizzdragon-backend/pipeline/config.js`

| Pipeline Step | Agent ID | 用途 |
|---|---|---|
| `extract-bible` | `story_bible_extractor` | 提取全局概念 / Story Bible |
| `breakdown` | `story_breakdown_pack` | 长篇原文拆为剧集映射 |
| `screenplay` | `screenwriter` | 生成可拍剧本 |
| `extract-assets` | `asset_extractor` | 从剧本提取角色/服装/道具/场景/链接 |
| `design-characters` | `character_costume` | 提取人物+服装+跨场次连续性 |
| `qc-assets` | `asset_qc_gate` | 资产一致性/连续性门禁 |
| `storyboard` | `storyboard_csv` | 生成 22 列分镜 CSV |

---

## 2. 三层关系：阶段 -> Agent -> Skill

系统当前的关系是：

1. **Pipeline Step** 决定调用哪个 Agent
2. **Agent** 决定挂哪些 Skill
3. **Skill** 决定该阶段的方法、约束、输出规范

因此你在排查问题时，可以按下面顺序看：

- 先看 `pipeline/config.js`：这一步到底调了哪个 agent
- 再看 `agents-config.js`：这个 agent 挂了哪些 skill
- 最后看具体 `skills/*.skill.md`：规则到底怎么写的

---

## 3. 剧集 / 拆分相关

### 3.1 Story Bible（全局概念）

#### Agent
- **Agent ID**: `story_bible_extractor`
- **位置**: `agents-config.js`

#### 作用
- 从小说全文 + 用户指令中提取结构化 Story Bible JSON
- 作为后续拆分、剧本、分镜、角色资产的全局锚点

#### 输出重点
- `meta`
- `characters`
- `userDirectives`

#### 相关说明
- 这是 pipeline 的 `extract-bible` 阶段入口

---

### 3.2 剧集拆分 / 剧情拆解

#### Agent
- **Agent ID**: `story_breakdown_pack`
- **位置**: `agents-config.js:159`
- **名称**: `🧩 劇情拆解包（80集映射）`
- **Group**: `統籌`

#### Skills
- `language_follow`
- `episode_mapping_csv`
- `story_architect`
- `episode_planner`
- `netflix_streaming`

#### 用途
- 把长篇原文拆成可下游消费的“剧集映射 CSV”
- 强调：
  - source anchoring
  - 连续性
  - 可拍性
  - 不改写原著主线

#### 适合回答的问题
- 剧集拆分用哪个 agent？
- 拆分阶段用了哪些 skill？

#### 一句话总结
> **剧集拆分 = `story_breakdown_pack` + `episode_mapping_csv` / `story_architect` / `episode_planner` / `netflix_streaming`**

---

### 3.3 格式重组（非 pipeline 主步骤，但常见于前处理）

#### Agent
- **Agent ID**: `format_adapter`
- **位置**: `agents-config.js:1495`
- **名称**: `✂️ 格式重組`
- **Group**: `統籌`

#### Skills
- `format_adapter`
- `core_methodology`

#### 用途
- 将已有影视剧本重组为短剧格式
- 更偏“结构重排 / 切分优化”，不是全文新创作

#### 什么时候看它
- 当用户问“长剧本转短剧分集格式用什么”时
- 当拆分前需要做格式适配时

---

## 4. 剧本相关

### 4.1 编剧 / 剧本生成

#### Agent
- **Agent ID**: `screenwriter`
- **位置**: `agents-config.js:466`
- **名称**: `✍️ 編劇`
- **Group**: `故事`

#### Skills
- `language_follow`
- `netflix_streaming`
- `screenplay_complete`
- `dialogue_complete`
- `screenplay_expand`

#### 用途
- 生成可拍摄剧本文本
- 输出要求是自然语言剧本，不是 JSON
- 强调：
  - 语言跟随输入
  - 对白节奏
  - Netflix-style hook
  - 可拍性与场次结构

#### 适合回答的问题
- 剧本生成用哪个 agent？
- 台词风格 / 对白节奏靠哪些 skill？

#### 一句话总结
> **剧本生成 = `screenwriter` + `screenplay_complete` / `dialogue_complete` / `screenplay_expand` / `netflix_streaming`**

---

### 4.2 叙事结构 / 章节规划

#### Agent
- **Agent ID**: `narrative`
- **位置**: `agents-config.js:505`
- **名称**: `📖 敘事/章節`
- **Group**: `故事`

#### Skills
- `core_methodology`

#### 用途
- 做章节规划、情感节奏、起承转合分配
- 更偏 story architecture，不直接输出可拍剧本

#### 一句话总结
> **叙事规划 = `narrative` + `core_methodology`**

---

## 5. 分镜相关

### 5.1 新分镜主入口（22 列 CSV）

#### Agent
- **Agent ID**: `storyboard_csv`
- **位置**: `agents-config.js:715`
- **名称**: `📑 分镜表CSV(单表)`
- **Group**: `導演`

#### Skills
- `language_follow`
- `storyboard_scene_pack`
- `storyboard_shot_pack`
- `storyboard_csv_22col_master`

#### 用途
- 生成最终 22 列分镜 CSV
- 内部流程是：
  1. scene pack（场次级）
  2. shot pack（镜头级）
  3. csv master（最终装配）

#### 关键 skill 作用
- `storyboard_scene_pack`: 场次级统一信息（scene、lighting、canon 复用等）
- `storyboard_shot_pack`: 镜头级字段（镜号、动作、画面描述、台词、旁白等）
- `storyboard_csv_22col_master`: 22 列 CSV 合同、列规则、装配输出

#### 一句话总结
> **新分镜主链 = `storyboard_csv` + `storyboard_scene_pack` / `storyboard_shot_pack` / `storyboard_csv_22col_master`**

---

### 5.2 分镜修复入口

#### Agent
- **Agent ID**: `storyboard_repair`
- **位置**: `agents-config.js:741`
- **名称**: `🩹 分镜CSV修复`
- **Group**: `導演`

#### Skills
- `language_follow`
- `storyboard_scene_pack`
- `storyboard_shot_pack`
- `storyboard_csv_22col_master`
- `storyboard_csv_repair_rules`

#### 用途
- 修复不合法 / 不完整 / 不符合 22 列 contract 的 storyboard CSV
- 修复内容包括：
  - 表头
  - 列数
  - 非空列
  - scene canon 复用
  - scene / prop 列归类
  - Image/Video Prompt 缺失
  - 旁白/台词列规则

#### 一句话总结
> **分镜修复 = `storyboard_repair` + `storyboard_csv_repair_rules`（并继承 scene/shot/csv master 规则）**

---

### 5.3 旧分镜入口（兼容）

#### Agent
- **Agent ID**: `storyboard`
- **位置**: `agents-config.js:766`
- **名称**: `🎥 分鏡`
- **Group**: `導演`

#### Skills
- `storyboard_master`
- `creative_master`
- `screenplay_complete`
- `novel_processing_complete`

#### 用途
- 旧入口，保留兼容
- 与 `storyboard_csv` 相比，它更像“旧版综合型分镜 agent”

#### 使用建议
- 新链路优先看 `storyboard_csv`
- 旧逻辑排查时再看 `storyboard`

---

## 6. 角色相关

### 6.1 角色设计主入口

#### Agent
- **Agent ID**: `character`
- **位置**: `agents-config.js:939`
- **名称**: `👤 角色設計`
- **Group**: `美術`

#### Skills
- `character_complete`
- `narrative_complete`

#### 用途
- 做角色设计、人物小传、外貌描述
- 输出 JSON，并要求包含：
  - `name`
  - `role`
  - `bio`
  - `appearance`
  - `ai_prompt`
  - `relationships`

#### 关键点
- `ai_prompt` 是这个 agent 的核心输出之一
- 当前角色 Prompt 问题，优先先看这个 agent 和 `character_complete.skill.md`

#### 一句话总结
> **角色设计 = `character` + `character_complete` / `narrative_complete`**

---

### 6.2 人物 + 服装联合抽取（制作资产）

#### Agent
- **Agent ID**: `character_costume`
- **位置**: `agents-config.js:182`
- **名称**: `人物_服装智能体`
- **Group**: `制作资产`

#### Skills
- `language_follow`
- `character_costume_asset_extractor`
- `costume_design`

#### 用途
- 从最终剧本里抽取：
  - 人物
  - 服装
  - 场次一致性关系
- 输出 4 张表，偏资产抽取而不是“角色创作设计”

#### 一句话总结
> **人物+服装资产抽取 = `character_costume` + `character_costume_asset_extractor` / `costume_design`**

---

## 7. 资产相关

### 7.1 资产抽取

#### Agent
- **Agent ID**: `asset_extractor`
- **位置**: `agents-config.js:201`
- **名称**: `🧱 资产抽取（人物/服装/道具/场景/链接）`
- **Group**: `制作资产`

#### Skills
- `language_follow`
- `asset_extractor_master`
- `prop_extraction_rules`
- `scene_extraction_rules`

#### 用途
- 从剧本里抽取 5 库：
  - `character_library`
  - `costume_library`
  - `prop_library`
  - `scene_library`
  - `episode_scene_asset_links`

#### 关键 skill 作用
- `asset_extractor_master`: 5 库总 schema
- `prop_extraction_rules`: 道具语义约束
- `scene_extraction_rules`: 场景语义约束

#### 一句话总结
> **资产抽取 = `asset_extractor` + `asset_extractor_master` / `prop_extraction_rules` / `scene_extraction_rules`**

---

### 7.2 资产抽取修复

#### Agent
- **Agent ID**: `asset_extractor_repair`
- **位置**: `agents-config.js:216`
- **名称**: `🩹 资产抽取修复`
- **Group**: `制作资产`

#### Skills
- `language_follow`
- `asset_extractor_master`
- `prop_extraction_rules`
- `scene_extraction_rules`

#### 用途
- 修复不合法或不完整的 extract-assets JSON
- 只修：
  - schema
  - 命名
  - 引用
  - scene / prop 归类
- 不重新创作剧情

#### 一句话总结
> **资产修复 = `asset_extractor_repair` + 同一组抽取 schema/scene/prop 规则**

---

### 7.3 资产门禁 / QC

#### Agent
- **Agent ID**: `asset_qc_gate`
- **位置**: `agents-config.js:232`
- **名称**: `✅ 资产一致性/连续性门禁`
- **Group**: `制作资产`

#### Skills
- `asset_qc_gate_rules`

#### 用途
- 对 extract-assets 输出做一致性 / 连续性校验
- 输出严格 JSON：`{ pass, errors, warnings }`

#### 一句话总结
> **资产 QC = `asset_qc_gate` + `asset_qc_gate_rules`**

---

## 8. 服装 / 道具 / 场景设计相关

### 8.1 人物造型设计
- **Agent ID**: `design_character_look`
- **Skills**:
  - `language_follow`
  - `design_character_look_bible`

### 8.2 服装设计
- **Agent ID**: `design_costume_bible`
- **Skills**:
  - `language_follow`
  - `design_costume_bible`

### 8.3 道具设计
- **Agent ID**: `design_props_bible`
- **Skills**:
  - `language_follow`
  - `design_props_bible`

### 8.4 场景 / 布景设计
- **Agent ID**: `design_scene_bible`
- **Skills**:
  - `language_follow`
  - `design_scene_bible`

#### 用途
- 这一组不负责“从剧本抽取”，而是负责在已有资产基础上做更详细的 Bible 级设计

---

## 9. 快速问答索引

### 剧集拆分用哪个 agent？挂了哪些 skill？
- Agent: `story_breakdown_pack`
- Skills:
  - `language_follow`
  - `episode_mapping_csv`
  - `story_architect`
  - `episode_planner`
  - `netflix_streaming`

### 剧本生成用哪个 agent？挂了哪些 skill？
- Agent: `screenwriter`
- Skills:
  - `language_follow`
  - `netflix_streaming`
  - `screenplay_complete`
  - `dialogue_complete`
  - `screenplay_expand`

### 分镜用哪个 agent？挂了哪些 skill？
- 新入口：`storyboard_csv`
  - `language_follow`
  - `storyboard_scene_pack`
  - `storyboard_shot_pack`
  - `storyboard_csv_22col_master`
- 修复入口：`storyboard_repair`
  - 上述 4 个 + `storyboard_csv_repair_rules`
- 旧入口：`storyboard`
  - `storyboard_master`
  - `creative_master`
  - `screenplay_complete`
  - `novel_processing_complete`

### 角色用哪个 agent？挂了哪些 skill？
- Agent: `character`
- Skills:
  - `character_complete`
  - `narrative_complete`

### 资产抽取与修复分别用哪个 agent？
- 抽取：`asset_extractor`
- 修复：`asset_extractor_repair`
- 门禁：`asset_qc_gate`

---

## 10. 备注

1. **当前主链路优先看 pipeline**
   - 以 `pipeline/config.js` 为入口，明确 step -> agent

2. **分镜有新旧两套入口**
   - 新：`storyboard_csv`
   - 旧：`storyboard`
   - 排查线上主链路时优先看 `storyboard_csv`

3. **角色与人物资产不是同一件事**
   - `character`：偏角色创作设计（bio / appearance / ai_prompt）
   - `character_costume`：偏制作资产抽取（人物 + 服装 + 连续性）

4. **文档用途**
   - 这个文档是“故事生产主链路”的快速索引，不是所有 agent 的全量百科
   - 若要继续扩展，可再按 group（統籌 / 故事 / 導演 / 制作资产 / 美術 / AI輸出）补完整表
