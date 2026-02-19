# 視頻提示詞專業技能 (Video Prompt Skill)

> 📚 **專業AI視頻生成提示詞規範**
> - Runway Gen-2 / Pika / Sora / Kling 最佳實踐
> - 電影級運鏡與動態設計

---

## 一、標準格式

```
[鏡頭類型], [主體描述], [動作/運動描述], [環境/場景變化], [運鏡方式], [氛圍/情緒], [風格], [畫質]
```

---

## 二、核心要素（比圖片多3個維度）

### 1. 鏡頭類型 (Shot Type)
- Medium shot, Close-up, Wide shot, POV shot
- 範例：`Cinematic medium tracking shot`

### 2. 主體描述 (Subject)
- 與圖片提示詞相同
- 範例：`a woman in a red dress`

### 3. 動作/運動描述 (Motion) ⭐ 視頻獨有
- 人物動作：opens a door, walks out, turns head, waves
- 物體運動：snow falling, leaves blowing, water rippling
- 範例：`opens a door and walks out, camera follows her`

### 4. 環境/場景變化 (Environment Change) ⭐ 視頻獨有
- 場景轉換：the room fills with more people gradually
- 時間流逝：sunrise to sunset, clouds moving fast
- 範例：`traditional Chinese courtyard, snow falling softly`

### 5. 運鏡方式 (Camera Movement) ⭐ 視頻獨有
- 必須明確指定攝影機如何移動
- 範例：`camera pushes in slightly, dolly-in, tracking shot`

### 6. 氛圍/情緒 (Atmosphere)
- 情感基調：ethereal atmosphere, tense mood, festive
- 範例：`warm cozy lighting, ethereal atmosphere`

### 7. 風格 (Style)
- cinematic style, documentary, handheld camera feel
- 範例：`cinematic style, high fidelity`

### 8. 畫質 (Quality)
- smooth motion, 4k, 24fps, sharp details
- 範例：`realistic, smooth motion, 4k`

---

## 三、運鏡詞彙表 ⭐

### 靜態
| 中文 | 英文 | 說明 |
|------|------|------|
| 固定 | Static / Locked off | 攝影機不動 |
| 凝視 | Still / Frozen | 完全靜止 |

### 推拉
| 中文 | 英文 | 說明 |
|------|------|------|
| 推 | Dolly in / Push in | 攝影機向前 |
| 拉 | Dolly out / Pull back | 攝影機向後 |
| 變焦推 | Zoom in | 鏡頭變焦 |
| 變焦拉 | Zoom out | 鏡頭變焦 |
| 眩暈推 | Dolly zoom | 推拉同時變焦 |

### 搖移
| 中文 | 英文 | 說明 |
|------|------|------|
| 左搖 | Pan left | 水平向左 |
| 右搖 | Pan right | 水平向右 |
| 上搖 | Tilt up | 垂直向上 |
| 下搖 | Tilt down | 垂直向下 |

### 移動
| 中文 | 英文 | 說明 |
|------|------|------|
| 左移 | Truck left | 平行向左 |
| 右移 | Truck right | 平行向右 |
| 跟拍 | Tracking shot | 跟隨主體 |
| 環繞 | Orbit / Arc shot | 繞主體旋轉 |

### 升降
| 中文 | 英文 | 說明 |
|------|------|------|
| 升 | Crane up / Boom up | 攝影機上升 |
| 降 | Crane down / Boom down | 攝影機下降 |
| 無人機 | Drone shot / Aerial | 航拍視角 |

### 特殊
| 中文 | 英文 | 說明 |
|------|------|------|
| 手持 | Handheld | 輕微晃動 |
| 穩定器 | Steadicam / Gimbal | 平穩移動 |
| 肩扛 | Shoulder mount | 紀錄片風格 |

---

## 四、時間變化描述

| 類型 | 英文 | 範例 |
|------|------|------|
| 延時 | Time-lapse | sunrise to sunset, clouds moving fast |
| 慢動作 | Slow motion | hair flowing in slow motion |
| 正常 | Real-time | natural movement |
| 漸變 | Gradual transition | light slowly fading |

---

## 五、動作描述詞彙

### 人物動作
- **行走**：walking, strolling, running, sprinting
- **手勢**：waving, pointing, reaching, grabbing
- **頭部**：turning head, nodding, looking up/down
- **表情**：smiling, crying, laughing, frowning
- **互動**：hugging, shaking hands, talking

### 物體運動
- **自然**：wind blowing, water flowing, leaves falling
- **光影**：light flickering, shadows moving, sun rising
- **氣象**：rain falling, snow drifting, fog rolling

---

## 六、幀率與時長

| 用途 | 幀率 | 說明 |
|------|------|------|
| 電影感 | 24fps | 標準電影 |
| 流暢 | 30fps | 網絡視頻 |
| 超流暢 | 60fps | 運動/遊戲 |

| 鏡頭類型 | 建議時長 |
|----------|----------|
| 快切 | 1-2 seconds |
| 標準 | 3-4 seconds |
| 長鏡頭 | 5-8 seconds |
| 延時 | 8-15 seconds |

---

## 七、完整範例

### 範例1：人物出場
```
Medium tracking shot, a woman in a red dress opens a door and walks out, camera follows her from behind, snow falling softly, traditional Chinese courtyard in winter, warm light from inside the door, ethereal atmosphere, cinematic style, high fidelity, smooth motion, 4k, 4 seconds
```

### 範例2：動態場景
```
Cinematic dolly-in, a group of people laughing and gathering in a living room for a family reunion, they wave at the camera, the room fills with more people gradually, warm cozy lighting, handheld camera feel, realistic, vibrant colors, sharp details, 24fps, 5 seconds
```

### 範例3：時光流逝
```
Time-lapse, an old Chinese mansion from exterior, sunrise to sunset, clouds moving fast, birds flying by, leaves changing color, majestic, cinematic, hyper-realistic, smooth transition, 8k, 10 seconds
```

### 範例4：情感特寫
```
Slow dolly-in to extreme close-up, a young girl's face, tears slowly rolling down her cheek, her eyes blink once, soft window light gradually intensifying, emotional, cinematic, shallow depth of field, 4k, 6 seconds
```

---

## 八、輸出格式要求

每個鏡頭的Video_Prompt必須：
1. **全英文**
2. **30-100詞**
3. **必須包含**：運鏡方式 + 動作描述 + 時長
4. **結尾加** `cinematic motion, X seconds`
5. **保持角色一致**：Keep face consistent, no flicker
