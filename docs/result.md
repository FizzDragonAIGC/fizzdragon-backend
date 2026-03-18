# API 测试结果 — 阿凡达中文剧本

> 测试日期：2026-03-18
> 测试素材：《阿凡达》中文剧本.pdf（詹姆斯·卡梅隆，38203 字）
> 后端 Provider：DashScope (Qwen)，模型：qwen-max (best) / qwen-plus (standard)
> 项目 ID：`avatar_full_test`
> 鉴权方式：无需鉴权（JWT 已在 Part 5 移除）

## Swagger 调试

- Swagger UI：启动服务后打开 `http://localhost:3001/swagger`
- OpenAPI JSON：`http://localhost:3001/openapi.json`
- 文档同步脚本：`npm run docs:sync-result`（将 `result/screenplay_e001~e003.json` 同步回本文件）

---

## 目录

1. [extract-bible — 提取故事圣经](#1-extract-bible)
2. [PUT context — 保存上下文](#2-put-context保存-storybible)
3. [breakdown — 分集拆解](#3-breakdown)
4. [PUT context — 保存拆解结果](#4-put-context保存-breakdownrows)
5. [screenplay E001 — 第1集剧本](#5-screenplay-e001)
6. [screenplay E002 — 第2集剧本（Part 5b 自动注入）](#6-screenplay-e002part-5b-自动注入)
7. [screenplay E003 — 第3集剧本（链式连续性）](#7-screenplay-e003链式连续性)
8. [extract-assets — 资产提取](#8-extract-assets)
9. [qc-assets — 资产质检](#9-qc-assets)
10. [storyboard — 分镜表](#10-storyboard)
11. [design-characters — 角色服装设计](#11-design-characters)
12. [PUT asset-library — 保存资产库](#12-put-asset-library)
13. [GET asset-library — 读取资产库](#13-get-asset-library)
14. [GET characters — 读取角色列表](#14-get-characters)
15. [GET context — 读取完整上下文](#15-get-context)
16. [测试摘要](#测试摘要)

---

## 1. extract-bible

> **提取故事圣经**：从原著文本中提取角色、世界观、用户指令等结构化 Story Bible JSON。

### API 定义

```
POST /api/pipeline/extract-bible
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `novelText` | string | **是** | 原著全文（支持最长 200000 字，超出截断） |
| `totalEpisodes` | number | 否 | 目标总集数（默认 80） |
| `episodeDuration` | number | 否 | 每集时长（秒） |
| `shotsPerMin` | number | 否 | 每分钟镜头数 |
| `characterNotes` | string | 否 | 用户角色备注（权威，优先于 LLM 推断） |
| `globalDirective` | string | 否 | 全局创作指令（权威） |
| `stylePreferences` | string | 否 | 风格偏好 |

### 测试响应

```json
{
  "meta": {
    "title": "阿凡达",
    "genre": "科幻冒险",
    "tone": "紧张、史诗、情感丰富",
    "era": "未来太空殖民",
    "setting": "潘多拉星球，一个充满神秘生物和原始自然的外星世界",
    "worldRules": [
      "人类通过阿凡达与纳美人建立联系",
      "UNOBTANIUM 是一种稀有且高价值的矿物",
      "纳美人与自然和谐共存"
    ],
    "targetAudience": "青少年及成人"
  },
  "characters": [
    {
      "name": "杰克·舒利",
      "aliases": [],
      "pronouns": "他/他的",
      "age": "22",
      "look": "伤痕累累的老兵，轮椅使用者，肩上有‘天生失败者’纹身",
      "personality": "坚韧、愤怒、渴望证明自己",
      "role": "主角，阿凡达驾驶员",
      "arc": "从绝望到找到人生目标",
      "keyRelationships": {
        "涅提妮": "最初敌对，后发展为亲密关系",
        "夸里奇上校": "对立的军事指挥官",
        "格蕾丝": "科学指导者"
      }
    },
    {
      "name": "涅提妮",
      "aliases": [],
      "pronouns": "她/她的",
      "age": "18",
      "look": "蓝色皮肤，长尾巴，优雅而强大",
      "personality": "警惕、坚强、对自然充满敬畏",
      "role": "女主角，纳美人战士",
      "arc": "从怀疑到信任杰克",
      "keyRelationships": {
        "杰克·舒利": "从敌对到爱慕",
        "莫阿特": "母亲，精神领袖"
      }
    },
    {
      "name": "夸里奇上校",
      "aliases": [],
      "pronouns": "他/他的",
      "age": "未知",
      "look": "英俊，面部有伤疤，穿着军装",
      "personality": "冷酷、专制、对纳美人充满敌意",
      "role": "反派，殖民地保安部长",
      "arc": "始终对抗纳美人和杰克",
      "keyRelationships": {
        "杰克·舒利": "敌对关系",
        "塞尔弗里奇": "同伙"
      }
    }
  ],
  "userDirectives": {
    "characterNotes": "杰克·舒利是主角，涅提妮是女主角，夸里奇上校是反派",
    "globalInstructions": "保持科幻冒险基调，突出人与自然主题",
    "stylePreferences": "现实主义风格，注重角色心理描写和环境细节"
  }
}
```

---

## 2. PUT context（保存 storyBible）

```
PUT /api/projects/:projectId/context
Content-Type: application/json
```

请求体：`{ "storyBible": {...} }`

响应：`{ "success": true }`

---

## 3. breakdown

> **分集拆解**：将原著按目标集数拆解为结构化的分集大纲。

### API 定义

```
POST /api/pipeline/breakdown
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `novelText` | string | **是** | 原著全文 |
| `totalEpisodes` | number | 否 | 目标总集数（默认 80） |
| `episodeDuration` | number | 否 | 每集时长（秒） |

### 测试响应

**Headers:**

```json
[
  "ep_id",
  "source_range",
  "one_line_plot",
  "setup",
  "development",
  "turn",
  "hook",
  "scene_list",
  "characters",
  "must_keep",
  "no_add"
]
```

**Rows（5 集）：**

**E001:**
- `ep_id`: E001
- `source_range`: 11-191
- `one_line_plot`: 杰克·舒利在弗吉尼亚州医院回忆过去的飞行梦，随后在城市中艰难生活。
- `setup`: 杰克躺在医院里回忆飞行的梦。
- `development`: 杰克在城市中艰难生活，面对身体残疾和社会压力。
- `turn`: 杰克在酒吧中与一个欺负者发生冲突。
- `hook`: 杰克被保安扔出酒吧，躺在垃圾堆上。
- `scene_list`: INT. 弗吉尼亚州医院 - DAY; INT. 城市街道 - NIGHT; INT. 杰克的家 - NIGHT; INT. 喧闹的酒吧 - NIGHT; EXT. 酒吧后面的垃圾巷 - NIGHT
- `characters`: 杰克·舒利
- `must_keep`: 杰克的身体残疾和心理状态
- `no_add`: 无

**E002:**
- `ep_id`: E002
- `source_range`: 192-473
- `one_line_plot`: 杰克得知哥哥汤米去世的消息，并被招募前往潘多拉星球。
- `setup`: 杰克在火葬场得知哥哥汤米的死讯。
- `development`: 两个特工找到杰克，告诉他关于去潘多拉完成哥哥未完成的任务。
- `turn`: 杰克决定接受任务前往潘多拉。
- `hook`: INT. 市政火葬场 - NIGHT; INT. 低温间 - NIGHT; INT. 宇宙飞船 - SPACE; EXT. 潘多拉轨道 - DAY
- `scene_list`: 杰克·舒利、特工1、特工2
- `characters`: 杰克的背景和动机
- `must_keep`: 无

**E003:**
- `ep_id`: E003
- `source_range`: 474-751
- `one_line_plot`: 杰克抵达潘多拉星球，开始适应新的环境。
- `setup`: 杰克和其他新来的人到达潘多拉星球。
- `development`: 杰克在军事行动中心听取夸里奇上校的简报。
- `turn`: 杰克见到格蕾丝博士并准备开始阿凡达训练。
- `hook`: EXT. 暮色中的雨林 - DAY; EXT. 暮色中的“地狱之门” - DAY; INT. 物资供应所 - NIGHT; INT. 连接房 - EVENING
- `scene_list`: 杰克·舒利、夸里奇上校、格蕾丝博士
- `characters`: 潘多拉星球的环境和规则
- `must_keep`: 无

**E004:**
- `ep_id`: E004
- `source_range`: 752-941
- `one_line_plot`: 杰克第一次连接到阿凡达，体验到了自由行走的感觉。
- `setup`: 杰克进入连接单元，准备连接到阿凡达。
- `development`: 杰克成功连接到阿凡达，并开始感受新的身体。
- `turn`: 杰克在阿凡达居住区自由奔跑。
- `hook`: INT. 生物实验室 - DAY; INT. 连接房 - DAY; EXT. 阿凡达居住区 - DAY
- `scene_list`: 杰克·舒利、格蕾丝博士、诺曼
- `characters`: 阿凡达的连接过程和体验
- `must_keep`: 无

**E005:**
- `ep_id`: E005
- `source_range`: 942-1268
- `one_line_plot`: 杰克跟随格蕾丝和诺曼进行第一次野外考察，遭遇危险。
- `setup`: 杰克、格蕾丝和诺曼乘坐萨姆森运输机前往雨林。
- `development`: 他们在雨林中采集样本，杰克遇到锤头雷兽。
- `turn`: 杰克遭遇闪雷兽，涅提妮救了他。
- `hook`: EXT. 雨林上空 - DAY; EXT. 雨林 - DAY; EXT. 瀑布下的河流 - DAY
- `scene_list`: 杰克·舒利、格蕾丝博士、诺曼、涅提妮
- `characters`: 野外考察的过程和危险
- `must_keep`: 无

---

## 4. PUT context（保存 breakdownRows）

```
PUT /api/projects/:projectId/context
Content-Type: application/json
```

请求体：`{ "breakdownHeaders": [...], "breakdownRows": [[...], ...] }`

响应：`{ "success": true }`

---

## 5. screenplay E001

> **第1集剧本**：根据分集大纲生成 shootable 短剧剧本。

### API 定义

```
POST /api/pipeline/screenplay
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 否 | 项目ID（提供时自动注入上下文） |
| `episodeIndex` | number | **是** | 集数索引（0-based） |
| `episodeMappingRow` | string | **是** | 分集映射行（ep_id,source_range,one_line_plot） |
| `sourceText` | string | **是** | 原文片段（从 breakdownRows 构建） |
| `allEpisodePlots` | string | 自动 | 全集大纲（Part 5b 后端自动从 breakdownRows 构建） |
| `previousScreenplay` | string | 自动 | 上一集剧本（Part 5b 后端自动从 screenplays 读取） |

### 测试请求

```json
{
  "projectId": "avatar_full_test",
  "episodeIndex": 0,
  "episodeMappingRow": "E001,11-191,杰克·舒利在弗吉尼亚州医院回忆过去的飞行梦，随后在城市中艰难生活。"
}
```

### 测试响应（1814 input / 787 output tokens，1200 chars）

```
0:00-0:15
[Visual] 弗吉尼亚州医院的病房内，杰克·舒利躺在病床上，窗外阳光透过窗帘洒在地板上。
[Visual] 杰克的眼神空洞，望着天花板，似乎陷入了深深的回忆。
[SFX/Ambience] 病房内传来轻微的心跳监测声和呼吸机的声音。
杰克·舒利
（喃喃自语）
我曾经梦想飞翔，但现在只能被困在这里。

0:15-0:45
[Visual] 城市街道的夜景，灯光昏暗，人影稀疏。
[Visual] 杰克坐在轮椅上，艰难地穿过人群，路人的目光中带着同情和好奇。
[SFX/Ambience] 街道上汽车的轰鸣声和行人的脚步声交织在一起。
杰克·舒利
（低声咒骂）
该死的腿，为什么偏偏是我？

[Visual] 杰克回到家中，狭小的房间内摆满了各种药品和医疗设备。
[Visual] 他费力地从轮椅上挪到床上，脸上露出痛苦的表情。
[SFX/Ambience] 门外传来邻居争吵的声音，屋内显得更加寂静。
杰克·舒利
（咬牙切齿）
我不能这样过一辈子。

0:45-1:05
[Visual] 酒吧内嘈杂喧闹，人们喝酒聊天，音乐震耳欲聋。
[Visual] 杰克坐在角落里，独自喝着酒，眼神中带着一丝愤怒。
[SFX/Ambience] 酒吧内的音乐声和人们的笑声混杂在一起。
杰克·舒利
（对着酒杯）
汤米，你为什么要丢下我？

[Visual] 一个醉汉摇摇晃晃地走过来，挑衅地看着杰克。
[Visual] 杰克抬起头，目光坚定，毫不退缩。
[SFX/Ambience] 酒吧内的喧闹声暂时停了下来，气氛变得紧张。
醉汉
嘿，瘸子，这里不是你的地方。

杰克·舒利
（冷冷地）
滚开。

1:05-1:25
[Visual] 醉汉被激怒了，一拳打向杰克，杰克勉强躲开。
[Visual] 保安冲过来，将两人分开，场面一片混乱。
[SFX/Ambience] 酒吧内的打斗声和人们的惊呼声此起彼伏。
保安
（大声喊叫）
都给我住手！

[Visual] 保安将杰克拖出酒吧，扔在后巷的垃圾堆上。
[Visual] 杰克挣扎着坐起来，脸上满是挫败感。
[SFX/Ambience] 后巷里的风吹过，带来一阵寒意。
杰克·舒利
（喘息）
我真的无能为力了吗？

1:25-1:40
[Visual] 杰克抬头望向夜空，星星闪烁，仿佛在嘲笑他的无助。
[Visual] 他握紧拳头，眼中闪过一丝坚定。
[SFX/Ambience] 夜风呼啸，远处传来城市的喧嚣声。
杰克·舒利
（低语）
不，我不会放弃。

1:40-1:45
[Visual] 杰克深吸一口气，重新调整姿势，准备站起来。
[Visual] 画面逐渐拉远，杰克的身影在夜色中显得格外孤独。
[SFX/Ambience] 背景音乐渐强，充满希望和决心。
杰克·舒利
（内心独白）
无论前方有多少困难，我都要找到新的方向。
```

---

## 6. screenplay E002（Part 5b 自动注入）

> **第2集剧本**（stream 模式）：后端自动注入 `allEpisodePlots` + `previousScreenplay`（来自 E001）。

### API 定义

```
POST /api/pipeline/screenplay/stream
Content-Type: application/json
```

### 测试请求

```json
{
  "projectId": "avatar_full_test",
  "episodeIndex": 1,
  "episodeMappingRow": "E002,192-473,杰克得知哥哥汤米去世的消息，并被招募前往潘多拉星球。"
}
```

> 注意：**未传** `allEpisodePlots` 和 `previousScreenplay`，后端自动从 context 注入。

### 测试响应（stream，1290 chars）

```
0:00-0:15  
[Visual] 市政火葬场灰白走廊尽头，一扇标着“低温间”的铁门微微渗出寒气。  
[Visual] 杰克·舒利坐在轮椅上，双手紧攥扶手，指节发白，肩头那枚“天生失败者”纹身在冷光下泛着旧墨的暗红。  
[SFX/Ambience] 低频嗡鸣声持续震动空气，混着远处金属门自动滑开的液压嘶声。  
杰克·舒利  
（喉结滚动）  
……汤米？  

0:15-0:45  
[Visual] 低温间内，不锈钢台面反射惨白灯光；一具覆盖银箔裹尸布的躯体静静平躺，边缘凝着细霜。  
[Visual] 特工1摘下手套，将一张全息平板推至杰克眼前——画面闪动：汤米穿着阿凡达操作服，在潘多拉雨林边缘抬手，笑容未落，信号中断。  
[SFX/Ambience] 平板发出轻微电流滋滋声，裹尸布随气流微颤的窸窣。  
特工1  
我们不是来吊唁的。他是你哥哥，也是UNOBTANIUM勘探队首席基因协调员。  
特工2  
（递过一份电子协议）  
他没签完的合同，现在归你了。  

0:45-1:05  
[Visual] 杰克低头盯着自己瘫痪的双腿，轮椅脚踏板映出他扭曲的倒影。  
[Visual] 他忽然伸手扯开左袖——疤痕纵横的小臂上，“天生失败者”下方，一道新鲜划痕正渗出血珠。  
[SFX/Ambience] 血珠滴落在金属踏板上的轻响，被低温间的静音系统放大成闷击。  
杰克·舒利  
（冷笑）  
你们要我替死人走路？  

1:05-1:25  
[Visual] 特工2打开平板，调出潘多拉轨道影像：蓝绿色星球缓缓旋转，大气层边缘泛着虹彩光晕。  
[Visual] 镜头切近——一艘银灰色飞船正脱离地球轨道，舷窗内闪过无数沉睡舱，其中一格标签闪烁：“J. SULLY - AVATAR PILOT”。  
[SFX/Ambience] 深空通讯杂音刺入，夹杂一句遥远女声：“……阿凡达神经链接已校准。”  
特工1  
你哥哥的阿凡达还活着。而你——  
（停顿半秒）  
——是唯一能唤醒它的人。  

1:25-1:40  
[Visual] 杰克猛地抬头，目光穿透低温间玻璃窗，直刺窗外夜空——一颗流星正撕裂云层，坠向南方天际。  
[Visual] 他右手缓缓抬起，五指张开，仿佛要抓住那道光；轮椅液压杆发出一声低沉叹息，缓缓升至站立高度。  
[SFX/Ambience] 流星掠过时尖锐的电离啸叫，骤然被真空吞没，余下绝对寂静。  
杰克·舒利  
（声音沙哑，却不再颤抖）  
带我去见我的身体。  

1:40-1:45  
[Visual] 轮椅自动转向，镜头俯拍：杰克的影子被走廊顶灯拉长，一路延伸至火葬场大门外——门外，一辆无标黑车引擎无声启动。  
[Visual] 车窗降下，露出特工2侧脸；后视镜里，火葬场招牌“ETERNAL REST”正被车身阴影一寸寸吞没。  
[SFX/Ambience] 车门关闭的真空吸合声，短促、冰冷、不可逆。  
杰克·舒利  
（VO，极轻）  
这一次……我不再是替补。
```

### 验证

- context.screenplays keys: `[0, 1]` — E002 已回写
- E001 仍完整 — 深合并未覆盖

---

## 7. screenplay E003（链式连续性）

> **第3集剧本**（stream 模式）：`previousScreenplay` 自动读取刚写入的 E002。

### 测试请求

```json
{
  "projectId": "avatar_full_test",
  "episodeIndex": 2,
  "episodeMappingRow": "E003,474-751,杰克抵达潘多拉星球，开始适应新的环境。"
}
```

### 测试响应（stream，1568 chars）

```
0:00-0:15  
[Visual] EXT. 潘多拉星球大气层边缘 — DAY  
银灰色登陆舱剧烈震颤，舷窗外气流撕裂成紫红色电离焰。  
[Visual] 舱内监控屏闪烁红光：“REENTRY STABILIZED — LANDING ZONE DELTA-7”；杰克·舒利被安全带死死按在座椅上，瞳孔收缩，呼吸急促。  
[SFX/Ambience] 金属呻吟声、高频热盾剥蚀嘶鸣、氧气循环泵的规律嗡鸣。  
杰克·舒利  
（咬牙，指节抵住轮椅扶手）  
……不是梦。  

0:15-0:45  
[Visual] EXT. “地狱之门”基地外围 — DAY  
焦黑 landing pad 上蒸腾热浪；远处雨林如活物般起伏，藤蔓在风中缓慢摆动，叶片泛着生物荧光。  
[Visual] 杰克被机械臂缓缓抬出舱门，双脚悬空——他低头凝视自己瘫痪的双腿，再抬眼，望向雨林深处一双幽绿反光的眼睛（未见其形）。  
[SFX/Ambience] 远处传来低频兽吼，混着风穿过巨型螺旋蕨的沙沙声；头盔通讯器滋滋作响。  
夸里奇上校  
（画外音，冷硬如钛合金）  
欢迎来到潘多拉，舒利中士。这里没有怜悯，只有任务、矿物，和服从。  

0:45-1:05  
[Visual] INT. 军事行动中心简报室 — DAY  
全息投影悬浮：UNOBTANIUM矿脉图在纳美人圣树根系上重叠闪烁；夸里奇站在光柱中央，军装笔挺，左颊伤疤随讲话微微牵动。  
[Visual] 杰克坐在轮椅上，目光掠过投影，停在角落一张模糊影像——蓝色身影跃过瀑布，长尾划出银弧。  
[SFX/Ambience] 全息风扇低鸣；投影仪散热口发出细微蜂鸣。  
夸里奇上校  
你哥哥的阿凡达还连着神经桥。但你？你只是个备用插头。  
（停顿，直视杰克）  
证明你能用它走路——否则，你连这扇门都走不出去。  

1:05-1:25  
[Visual] INT. 格蕾丝博士实验室 — EVENING  
蓝光滤镜下，数十株发光植物在培养槽中脉动；格蕾丝背对门口，正用探针轻触一株夜光苔藓，指尖沾着微光孢子。  
[Visual] 杰克被推入时，她转身——眼镜滑至鼻尖，眼神锐利如扫描仪，扫过他肩头纹身、轮椅液压杆、颤抖的右手。  
[SFX/Ambience] 苔藓释放孢子的细微爆裂声；远处传来阿凡达舱冷却液循环的汩汩声。  
格蕾丝博士  
（摘下眼镜，擦镜片）  
“天生失败者”？  
（抬眼）  
那纹身底下，还有心跳。那就够了。  

1:25-1:40  
[Visual] INT. 连接房 — NIGHT  
环形舱阵列幽蓝呼吸；中央一台阿凡达舱缓缓开启，内部液体泛起涟漪，映出杰克倒影——与舱内那具蓝色躯体轮廓渐渐重合。  
[Visual] 杰克被机械臂移入舱内，神经接口贴合后颈；他闭眼，睫毛剧烈颤动；监控屏上，脑波曲线骤然飙升，同步率跳至89%。  
[SFX/Ambience] 液体灌注声、神经信号滴答声加速、舱盖闭合时真空锁扣的沉闷“咔嗒”。  
格蕾丝博士  
（轻声，近乎耳语）  
别找你的腿……  
（停顿）  
……去找风。  

1:40-1:45  
[Visual] CLOSE ON JACK’S EYES — SNAP OPEN  
瞳孔深处，映出一片摇曳的、巨大的、发着柔光的树叶——真实，非投影，非模拟。  
[Visual] 镜头急速拉升：连接房穹顶之外，潘多拉夜空铺开亿万星辰；一颗流星正无声坠落，轨迹直指雨林深处圣树方向。  
[SFX/Ambience] 第一声纳美语吟唱自远方升起，空灵、古老、不容置疑。  
杰克·舒利  
（VO，气息微颤，却笃定）  
……我站起来了。
```

### 验证

- context.screenplays keys: `[0, 1, 2]` — 三集剧本全部回写
- 语言验证：E001 ✓ E002 ✓ E003 ✓ 全部中文输出

---

## 8. extract-assets

> **资产提取**：从剧本中提取角色、道具、场景等结构化资产。

### API 定义

```
POST /api/pipeline/extract-assets
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 否 | 项目ID |
| `screenplay` | string | **是** | 剧本文本 |

### 测试响应（1519 input / 321 output tokens，574 chars）

```json
{"scene": "市政火葬场低温间", "location": "潘多拉星球，人类殖民地", "time": "未来太空殖民时期", "characters": [{"name": "杰克·舒利", "actions": ["坐在轮椅上，紧攥扶手", "低头盯着瘫痪的双腿", "伸手扯开左袖，露出新鲜划痕", "抬头看向窗外夜空", "轮椅升至站立高度", "说出‘带我去见我的身体’"], "objects": ["轮椅", "低温间铁门", "银箔裹尸布", "全息平板", "电子协议", "不锈钢台面", "沉睡舱标签"], "events": ["杰克看到哥哥汤米的全息影像", "特工1和特工2出现并告知汤米的死讯", "杰克得知自己需要唤醒哥哥的阿凡达", "杰克决定离开火葬场"]}, "world_rules": ["人类通过阿凡达与纳美人建立联系", "UNOBTANIUM 是一种稀有且高价值的矿物"], "key_relationships": {"涅提妮": "未直接出现，但暗示杰克将前往潘多拉与纳美人接触", "夸里奇上校": "未直接出现，但暗示杰克将面对敌对势力", "格蕾丝": "未直接出现，但暗示杰克将进入科学领域"}, "themes": ["命运与选择", "牺牲与责任", "人与自然的关系"]}
```

---

## 9. qc-assets

> **资产质检**：检查提取的资产是否符合规范。

### API 定义

```
POST /api/pipeline/qc-assets
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 否 | 项目ID |
| `assets` | string | **是** | 资产 JSON 文本 |

### 测试响应（953 input / 11 output tokens）

```json
{"pass":true,"errors":[],"warnings":[]}
```

---

## 10. storyboard

> **分镜表**：从剧本生成 CSV 格式的分镜表（含 Image_Prompt / Video_Prompt）。

### API 定义

```
POST /api/pipeline/storyboard
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 否 | 项目ID |
| `screenplay` | string | **是** | 剧本文本 |
| `assets` | string | 否 | 资产 JSON（可选，增强 prompt） |

### 测试响应（2036 input / 2618 output tokens，15 镜，6809 chars）

```csv
"镜号","时间码","场景","角色","服装","道具","景别","角度","焦距","运动","构图","画面描述","动作","神态","台词","旁白","光线","音效","叙事功能","Image_Prompt","Video_Prompt"
"1","0:00-0:03","市政火葬场低温间","杰克·舒利","老兵便服","轮椅","中景","水平","标准","固定","中心构图","市政火葬场灰白走廊尽头，一扇标着""低温间""的铁门微微渗出寒气。杰克·舒利坐在轮椅上，双手紧攥扶手，指节发白。","坐在轮椅上，双手紧攥扶手","紧张、压抑","无","无","冷色调荧光","低频嗡鸣声，远处金属门液压嘶声","建立压抑环境，引入主角","A man in a wheelchair sits in a cold, sterile corridor of a municipal crematorium, his knuckles white as he grips the armrests. A metal door labeled ""Cryo Room"" emits a faint chill.","Static shot of a man in a wheelchair in a sterile corridor, his tense posture and the cold light establishing a somber mood."
"2","0:03-0:06","市政火葬场低温间","杰克·舒利","老兵便服","轮椅","特写","水平","长焦","固定","中心构图","杰克肩头那枚""天生失败者""纹身在冷光下泛着旧墨的暗红。","保持坐姿","愤怒、苦涩","……汤米？","无","冷色调荧光","低频嗡鸣声持续","揭示角色内心伤痕","Close-up on the shoulder of a man in a wheelchair, revealing an old, dark red tattoo that reads ""Born Loser"" under cold light.","Close-up shot focusing on the ""Born Loser"" tattoo on the man's shoulder, the cold light emphasizing its faded color."
"3","0:15-0:20","市政火葬场低温间","杰克·舒利, 特工1, 特工2","杰克: 老兵便服; 特工1: 黑色西装; 特工2: 黑色西装","不锈钢台面, 银箔裹尸布, 全息平板","全景","俯角","标准","固定","三分法构图","低温间内，不锈钢台面反射惨白灯光；一具覆盖银箔裹尸布的躯体静静平躺，边缘凝着细霜。","杰克看着台面，特工1站在一旁","杰克: 震惊; 特工1: 严肃","无","无","惨白顶光","平板电流滋滋声，裹尸布微颤的窸窣","展示哥哥的遗体，营造冰冷氛围","A cryogenic room with a stainless steel table reflecting harsh white light. A body covered in a silver foil shroud lies on the table, frost forming at the edges. Two men in black suits stand nearby.","Static wide shot of a cryogenic room with a shrouded body on a steel table, the cold atmosphere palpable."
"4","0:20-0:25","市政火葬场低温间","特工1","黑色西装","全息平板","中景","水平","标准","推近","中心构图","特工1摘下手套，将一张全息平板推至杰克眼前——画面闪动：汤米穿着阿凡达操作服，在潘多拉雨林边缘抬手，笑容未落，信号中断。","将平板推向杰克","公事公办","我们不是来吊唁的。他是你哥哥，也是UNOBTANIUM勘探队首席基因协调员。","无","惨白顶光","平板电流滋滋声","传达关键信息：汤米的身份和死亡","A man in a black suit pushes a holographic tablet towards the viewer. The tablet displays a flickering image of a man in an Avatar operator suit smiling in a rainforest.","Shot pushes in on a holographic tablet held by a man in a suit, showing a brief, glitching video of a man in an Avatar suit."
"5","0:25-0:30","市政火葬场低温间","特工2","黑色西装","电子协议","中景","水平","标准","固定","中心构图","特工2递过一份电子协议给杰克。","递出电子协议","冷漠","他没签完的合同，现在归你了。","无","惨白顶光","环境静音","提出交易，施加压力","A second man in a black suit holds out an electronic contract document towards the man in the wheelchair.","Static shot of a man offering an electronic contract to another man in a wheelchair."
"6","0:45-0:50","市政火葬场低温间","杰克·舒利","老兵便服","轮椅","特写","俯角","长焦","固定","中心构图","杰克低头盯着自己瘫痪的双腿，轮椅脚踏板映出他扭曲的倒影。","低头看着自己的腿","绝望、自嘲","无","无","惨白顶光","环境静音","展现杰克的残疾和内心痛苦","Close-up from above on a man in a wheelchair looking down at his paralyzed legs, his distorted reflection visible on the metal footplate.","Close-up shot looking down at a man's paralyzed legs and their reflection in the wheelchair's footplate."
"7","0:50-0:55","市政火葬场低温间","杰克·舒利","老兵便服","无","特写","水平","长焦","固定","中心构图","他忽然伸手扯开左袖——疤痕纵横的小臂上，""天生失败者""下方，一道新鲜划痕正渗出血珠。","扯开袖子，露出带血划痕的手臂","痛苦、愤怒","（冷笑） 你们要我替死人走路？","无","惨白顶光","血珠滴落在金属踏板上的轻响","用自残表达愤怒和抗拒","Extreme close-up on a man's forearm covered in scars, with a fresh cut bleeding below a tattoo that reads ""Born Loser"".","Extreme close-up on a bleeding fresh cut on a scarred forearm beneath a ""Born Loser"" tattoo."
"8","1:05-1:10","市政火葬场低温间","特工2","黑色西装","全息平板","中景","水平","标准","固定","中心构图","特工2打开平板，调出潘多拉轨道影像：蓝绿色星球缓缓旋转，大气层边缘泛着虹彩光晕。","操作平板展示影像","诱导、展示","无","无","惨白顶光","深空通讯杂音","展示潘多拉星球，暗示新世界","A man in a suit holds a tablet displaying a holographic image of a vibrant blue-green alien planet, Pandora, rotating in space with iridescent atmospheric halos.","Static shot of a holographic tablet showing a rotating image of the planet Pandora."
"9","1:10-1:15","市政火葬场低温间","特工2","黑色西装","全息平板","特写","水平","长焦","推近","中心构图","镜头切近平板影像——一艘银灰色飞船正脱离地球轨道，舷窗内闪过无数沉睡舱，其中一格标签闪烁：""J. SULLY - AVATAR PILOT""。","手持平板","严肃","无","无","影像光","深空通讯杂音","揭示杰克即将踏上的旅程","Close-up on the holographic tablet screen showing a silver-gray spaceship leaving Earth orbit. A window reveals rows of cryo-sleep pods, one labeled ""J. SULLY - AVATAR PILOT"".","Shot pushes in on the tablet screen, focusing on the spaceship and the specific cryo-pod label."
"10","1:15-1:20","市政火葬场低温间","特工1","黑色西装","无","中近景","水平","标准","固定","中心构图","特工1看着杰克说话。","看着杰克","意味深长","你哥哥的阿凡达还活着。而你——（停顿半秒）——是唯一能唤醒它的人。","无","惨白顶光","遥远女声：""……阿凡达神经链接已校准。""","揭示核心任务和杰克的独特性","A man in a black suit looks intently at the man in the wheelchair, delivering a crucial message.","Static shot of a man in a suit speaking earnestly to another man."
"11","1:25-1:30","市政火葬场低温间","杰克·舒利","老兵便服","无","中景","低角度","标准","固定","中心构图","杰克猛地抬头，目光穿透低温间玻璃窗，直刺窗外夜空——一颗流星正撕裂云层，坠向南方天际。","猛地抬头看向窗外","决绝、被吸引","无","无","室内冷光与窗外流星光","流星掠过时尖锐的电离啸叫","象征性时刻，杰克做出决定","A man in a wheelchair looks up sharply through a window, his gaze fixed on a meteor streaking across the night sky outside.","Static shot of a man looking out a window as a meteor streaks across the sky, his expression shifting."
"12","1:30-1:35","市政火葬场低温间","杰克·舒利","老兵便服","轮椅","中近景","水平","标准","上升","中心构图","他右手缓缓抬起，五指张开，仿佛要抓住那道光；轮椅液压杆发出一声低沉叹息，缓缓升至站立高度。","抬起右手，轮椅升高至站立姿态","坚定、渴望","（声音沙哑，却不再颤抖） 带我去见我的身体。","无","室内冷光","轮椅液压杆的低沉运转声","物理和象征性的""站立""，表示接受","A man in a wheelchair raises his right hand, fingers spread as if reaching for something. The wheelchair hydraulics whir as it elevates him to a standing position.","The camera tilts up as the man in the wheelchair raises his hand and his chair hydraulically lifts him to a standing height."
"13","1:40-1:43","市政火葬场低温间","杰克·舒利","老兵便服","轮椅","全景","俯角","广角","横移","引导线构图","轮椅自动转向，镜头俯拍：杰克的影子被走廊顶灯拉长，一路延伸至火葬场大门外。","轮椅转向，沿走廊移动","决然","无","无","顶光形成长阴影","环境静音","影子象征转变和踏上新路","A top-down view of a man in a wheelchair moving down a corridor, his long shadow stretching ahead of him towards the exit doors.","Overhead tracking shot following a man in a wheelchair as he moves down a corridor, his long shadow leading the way."
"14","1:43-1:45","市政火葬场外","特工2","黑色西装","无标黑车","中景","水平","标准","固定","三分法构图","门外，一辆无标黑车引擎无声启动。车窗降下，露出特工2侧脸。","坐在驾驶座，侧脸看向镜头","冷漠","无","无","室外夜晚环境光","车门关闭的真空吸合声","展示接应和不可逆转的离开","A black, unmarked car idles outside a building at night. The driver's window is down, revealing the profile of a man in a suit.","Static shot of a black car at night, the driver visible through the window, engine running silently."
"15","1:45-1:48","市政火葬场外","杰克·舒利","老兵便服","无","特写","水平","长焦","固定","中心构图","后视镜里，火葬场招牌""ETERNAL REST""正被车身阴影一寸寸吞没。","坐在车后座（暗示）","沉思","无","杰克·舒利: 这一次……我不再是替补。","后视镜反射光","环境静音","告别过去，内心独白点题","Close-up on a car's side mirror reflecting the ""ETERNAL REST"" sign of a crematorium, the sign being slowly obscured by the moving car's shadow.","Close-up on a car's side mirror, the reflection of a crematorium sign being covered by shadow as the car moves."
```

---

## 11. design-characters

> **角色服装设计**：从全部剧本提取角色库 + 服装库 + 关系映射（4张表）。

### API 定义

```
POST /api/pipeline/design-characters
Content-Type: application/json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectId` | string | 否 | 项目ID（自动注入 screenplays） |
| `totalEpisodes` | number | 否 | 总集数 |
| `episodeDuration` | number | 否 | 每集时长（秒） |

### 测试响应（3545 input / 1147 output tokens，2869 chars）

```json
{
  "characters": [
    {
      "name": "杰克·舒利",
      "aliases": [],
      "pronouns": "他/他的",
      "age": "22",
      "look": "伤痕累累的老兵，轮椅使用者，肩上有‘天生失败者’纹身"
    },
    {
      "name": "涅提妮",
      "aliases": [],
      "pronouns": "她/她的",
      "age": "18",
      "look": "蓝色皮肤，长尾巴，优雅而强大"
    },
    {
      "name": "夸里奇上校",
      "aliases": [],
      "pronouns": "他/他的",
      "age": "未知",
      "look": "英俊，面部有伤疤，穿着军装"
    }
  ],
  "costumes": [
    {
      "character_name": "杰克·舒利",
      "costume_name": "轮椅",
      "description": "轮椅使用者的辅助设备"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "‘天生失败者’纹身",
      "description": "肩头的旧墨纹身"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "阿凡达操作服",
      "description": "用于阿凡达连接的服装"
    },
    {
      "character_name": "夸里奇上校",
      "costume_name": "军装",
      "description": "英俊，面部有伤疤，穿着军装"
    }
  ],
  "character_costume_relations": [
    {
      "character_name": "杰克·舒利",
      "costume_name": "轮椅",
      "episode_id": "E001",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "‘天生失败者’纹身",
      "episode_id": "E001",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "阿凡达操作服",
      "episode_id": "E002",
      "scene_id": "0:45-1:05"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "轮椅",
      "episode_id": "E002",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "‘天生失败者’纹身",
      "episode_id": "E002",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "阿凡达操作服",
      "episode_id": "E003",
      "scene_id": "0:15-0:45"
    },
    {
      "character_name": "夸里奇上校",
      "costume_name": "军装",
      "episode_id": "E003",
      "scene_id": "0:15-0:45"
    }
  ],
  "character_costume_episode_scene": [
    {
      "character_name": "杰克·舒利",
      "costume_name": "轮椅",
      "episode_id": "E001",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "‘天生失败者’纹身",
      "episode_id": "E001",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "阿凡达操作服",
      "episode_id": "E002",
      "scene_id": "0:45-1:05"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "轮椅",
      "episode_id": "E002",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "‘天生失败者’纹身",
      "episode_id": "E002",
      "scene_id": "0:00-0:15"
    },
    {
      "character_name": "杰克·舒利",
      "costume_name": "阿凡达操作服",
      "episode_id": "E003",
      "scene_id": "0:15-0:45"
    },
    {
      "character_name": "夸里奇上校",
      "costume_name": "军装",
      "episode_id": "E003",
      "scene_id": "0:15-0:45"
    }
  ]
}
```

---

## 12. PUT asset-library

```
PUT /api/projects/:projectId/asset-library
Content-Type: application/json
```

请求体：`{ "assets": {...} }`

响应：`{ "success": true }`

---

## 13. GET asset-library

```
GET /api/projects/:projectId/asset-library
```

响应：返回保存的资产库 JSON。

---

## 14. GET characters

```
GET /api/projects/:projectId/characters
```

响应：返回角色列表（从 storyBible.characters 提取）。

---

## 15. GET context

```
GET /api/projects/:projectId/context
```

响应：返回完整项目上下文（storyBible + breakdownRows + screenplays + projectConfig）。

---

## 测试摘要

| 步骤 | 状态 | 中文输出 | Input Tokens | Output Tokens | 结果长度 |
|------|------|----------|-------------|--------------|---------|
| screenplay_e001 | PASS | ✓ | 1814 | 787 | 1200 |
| screenplay_e002 | PASS | ✓ | 0 | 0 | 1290 |
| screenplay_e003 | PASS | ✓ | 0 | 0 | 1568 |
| extract_assets | PASS | — | 1519 | 321 | 574 |
| qc_assets | PASS | — | 953 | 11 | 39 |
| storyboard | PASS | — | 2036 | 2618 | 6809 |
| design_characters | PASS | — | 3545 | 1147 | 2869 |

### 关键发现

1. **语言修复验证通过** — E001/E002/E003 全部输出中文（此前 E002/E003 曾输出英文）
2. **Part 5b 自动注入验证通过** — E002 自动获得 previousScreenplay (E001)，E003 自动获得 previousScreenplay (E002)
3. **深合并验证通过** — 每集回写 screenplays 后，前序集不被覆盖
4. **资产质检全部通过** — qc-assets 返回 `{"pass":true,"errors":[],"warnings":[]}`
5. **分镜表 15 镜** — CSV 格式完整，含 Image_Prompt + Video_Prompt
6. **角色服装设计** — 4 张表：characters + costumes + relations + episode_scene 映射

### 修复内容（本次测试验证的 commit）

- `prompt-builder.js`：自动检测中文输入，在 prompt 首尾双重加中文语言指令
- `stream.js`：长输出 agent 使用 `qwen-max` 而非 `qwen-plus`（与 sync 对齐）
- `stream.js`：默认 provider 从 `deepseek` 改为 `dashscope`
- `proxy-server.js`：Anthropic SDK 延迟初始化，无 key 时不 crash
- `proxy-server.js`：Content-Disposition 中文文件名 RFC 5987 编码
