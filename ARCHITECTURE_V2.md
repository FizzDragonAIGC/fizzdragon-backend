# AI番剧制作系统 - 架构V2

## 核心原则
**每个Agent处理所有内容，而不是每个镜头调用一次**

## 流水线架构

```
原作输入
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage 1: 结构规划 (Structure Planning)              │
│  └── structure_agent: 生成完整集数和场景结构          │
│      输入: 原作内容 + 目标集数/时长                    │
│      输出: 100集的场景列表 (JSON)                     │
│      调用次数: 1次                                    │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage 2: 分镜设计 (Shot Design)                     │
│  └── storyboard_agent: 为所有场景生成镜头             │
│      输入: Stage 1的场景结构                          │
│      输出: 每个场景的镜头列表 (shot_id, 画面描述)      │
│      调用次数: 按批次 (每批10集)                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage 3: 运镜设计 (Camera Movement)                 │
│  └── cinematography_agent: 为所有镜头添加运镜         │
│      输入: Stage 2的镜头列表                          │
│      输出: 每个镜头的运镜描述                          │
│      调用次数: 按批次 (每批100镜头)                   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage 4: 灯光设计 (Lighting Design)                 │
│  └── lighting_agent: 为所有镜头添加灯光               │
│      输入: Stage 3的结果                              │
│      输出: 每个镜头的灯光描述                          │
│      调用次数: 按批次 (每批100镜头)                   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Stage 5: Prompt生成 (Prompt Generation)             │
│  └── prompt_agent: 为所有镜头生成AI提示词             │
│      输入: 前面所有Stage的结果                        │
│      输出: Image_Prompt + Video_Prompt               │
│      调用次数: 按批次 (每批50镜头)                    │
└─────────────────────────────────────────────────────┘
    │
    ▼
最终输出: 完整分镜表JSON/CSV
```

## 批次处理逻辑

### 为什么需要批次？
- DeepSeek单次输出限制: 8192 tokens
- 100集 × 30镜头 = 3000镜头
- 每镜头约500-800字 → 一次无法输出全部

### 批次策略
| Stage | 每批处理量 | 100集所需批次 |
|-------|-----------|--------------|
| 结构规划 | 100集 | 1次 |
| 分镜设计 | 10集 | 10次 |
| 运镜设计 | 100镜头 | 30次 |
| 灯光设计 | 100镜头 | 30次 |
| Prompt生成 | 50镜头 | 60次 |

### 总调用次数
- **旧架构**: 3000镜头 × 1次/镜头 = **3000次**
- **新架构**: 1 + 10 + 30 + 30 + 60 = **131次**
- **优化比**: 23倍 ↓

## 数据流转格式

### Stage 1 输出 (结构)
```json
{
  "title": "霸王别姬",
  "total_episodes": 100,
  "episodes": [
    {
      "ep": 1,
      "title": "序曲·重逢",
      "era": "1977年",
      "scenes": [
        { "scene_id": "E01_SC01", "location": "老剧院外", "characters": ["程蝶衣", "段小楼"], "action": "两人重逢" },
        { "scene_id": "E01_SC02", "location": "剧院内", "characters": ["程蝶衣", "段小楼"], "action": "走入空旷舞台" }
      ]
    }
  ]
}
```

### Stage 2 输出 (镜头)
```json
{
  "shots": [
    { "shot_id": "E01_S001", "scene_id": "E01_SC01", "画面描述": "1977年冬日清晨..." },
    { "shot_id": "E01_S002", "scene_id": "E01_SC01", "画面描述": "两个中年男人的背影..." }
  ]
}
```

### Stage 3 输出 (运镜)
```json
{
  "shots": [
    { "shot_id": "E01_S001", "视频描述": "固定机位大全景，时长6秒..." },
    { "shot_id": "E01_S002", "视频描述": "跟拍中景，时长4秒..." }
  ]
}
```

### Stage 4 输出 (灯光)
```json
{
  "shots": [
    { "shot_id": "E01_S001", "lighting": "cold morning side light, desaturated" },
    { "shot_id": "E01_S002", "lighting": "backlit silhouettes, rim lighting" }
  ]
}
```

### Stage 5 输出 (Prompt)
```json
{
  "shots": [
    { 
      "shot_id": "E01_S001", 
      "Image_Prompt": "Abandoned Beijing opera theater exterior, winter morning 1977...",
      "Video_Prompt": "Static wide establishing shot..."
    }
  ]
}
```

## 后端实现

### 新增API端点

```javascript
// 流水线处理API
POST /api/pipeline/start
Body: { content, episodes, duration, stages: ['structure', 'storyboard', 'camera', 'lighting', 'prompt'] }
Response: { pipelineId }

// 查询进度
GET /api/pipeline/:pipelineId/status
Response: { status, currentStage, progress, completedShots }

// 获取结果
GET /api/pipeline/:pipelineId/result
Response: { shots: [...] }
```

### 后端批次处理伪代码

```javascript
async function runPipeline(content, episodes, duration) {
  // Stage 1: 结构规划 (1次调用)
  const structure = await callAgent('structure', { content, episodes, duration });
  
  // Stage 2: 分镜设计 (按10集一批)
  const shots = [];
  for (let batch = 0; batch < episodes; batch += 10) {
    const batchEpisodes = structure.episodes.slice(batch, batch + 10);
    const batchShots = await callAgent('storyboard', { scenes: batchEpisodes });
    shots.push(...batchShots);
  }
  
  // Stage 3-5: 类似的批次处理...
  
  return mergeResults(shots);
}
```

## 前端交互

1. 用户选择集数和时长
2. 点击「一键生成」
3. 前端调用 `/api/pipeline/start`
4. 显示进度条：`Stage 1/5: 结构规划中... (10%)`
5. 自动轮询进度
6. 完成后展示结果

## 优势

1. **效率**: 131次调用 vs 3000次调用
2. **一致性**: 同一个Agent处理所有同类任务，风格统一
3. **可维护**: 每个Stage独立，可单独优化
4. **可恢复**: 如果某Stage失败，可从断点继续
