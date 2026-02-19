# 專業級分鏡表完整技能

> 📚 **參考書籍**
> - Cinematics Storyboard Workshop (Gregg Davidson)
> - The Filmmaker's Eye (Gustavo Mercado)
> - Master Shots Vol 1-3 (Christopher Kenworthy)
> - Directing Actors (Judith Weston)

## 專業分鏡表必備25個元素

### 1. 基礎信息
| 元素 | 說明 | 範例 |
|------|------|------|
| shot_id | 鏡頭唯一編號 | E001_S001 |
| episode | 集數 | 1-100 |
| scene | 場次 | 1-5 |
| shot_number | 場內鏡頭序號 | 1-40 |
| duration | 時長(秒) | 2.5 |

### 2. 攝影元素 (Cinematography)
| 元素 | 選項 | 說明 |
|------|------|------|
| shot_type | ECU/CU/MCU/MS/MLS/LS/ELS/OTS/POV/2Shot | 景別 |
| camera_angle | Eye/High/Low/Dutch/Bird/Worm | 角度 |
| camera_movement | Static/Pan/Tilt/Dolly/Truck/Crane/Handheld/Steadicam/Drone | 運鏡 |
| lens | Wide/Normal/Telephoto/Macro | 鏡頭 |
| focus | Deep/Shallow/Rack/Split | 焦點 |

### 3. 燈光元素 (Lighting)
| 元素 | 選項 | 說明 |
|------|------|------|
| key_light | Hard/Soft/Natural/Practical | 主光 |
| lighting_style | High-key/Low-key/Rembrandt/Split/Butterfly | 風格 |
| color_temp | Warm(3200K)/Neutral(5600K)/Cool(7000K) | 色溫 |
| light_direction | Front/Side/Back/Top/Bottom | 方向 |
| shadows | Harsh/Soft/None | 陰影 |

### 4. 構圖元素 (Composition)
| 元素 | 選項 | 說明 |
|------|------|------|
| framing | Rule-of-thirds/Center/Golden-ratio/Symmetry | 構圖法則 |
| depth | Foreground/Midground/Background | 景深層次 |
| headroom | Tight/Normal/Loose | 頭頂空間 |
| lead_room | Left/Right/Center | 視線空間 |
| negative_space | Yes/No | 負空間 |

### 5. 表演元素 (Performance)
| 元素 | 說明 | 範例 |
|------|------|------|
| character | 角色名 | 小豆子 |
| emotion | 情緒狀態 | 恐懼/決絕/悲傷 |
| action | 動作描述 | 緊握母親衣角 |
| eyeline | 視線方向 | 看向門外 |
| blocking | 走位 | 從左入畫，停在中央 |

### 6. 美術元素 (Art Direction)
| 元素 | 說明 | 範例 |
|------|------|------|
| location | 場景地點 | 關家科班練功棚 |
| time_of_day | 時段 | 黃昏 |
| weather | 天氣 | 雪天 |
| props | 道具 | 菜刀、磨刀石 |
| costume | 服裝 | 破舊棉襖 |
| color_palette | 色彩基調 | 灰藍冷色 |

### 7. 聲音元素 (Audio)
| 元素 | 說明 | 範例 |
|------|------|------|
| dialogue | 對白 | "娘，我手冷" |
| sfx | 音效 | 雪地腳步聲 |
| music | 配樂提示 | 緊張弦樂漸強 |
| ambience | 環境音 | 遠處鞭炮聲 |

### 8. 轉場與節奏
| 元素 | 選項 | 說明 |
|------|------|------|
| transition_in | Cut/Dissolve/Fade/Wipe | 入場轉場 |
| transition_out | Cut/Dissolve/Fade/Wipe | 出場轉場 |
| pacing | Fast/Medium/Slow | 節奏 |
| beat | Setup/Build/Climax/Release | 敘事節拍 |

### 9. AI生成標記
| 元素 | 說明 | 範例 |
|------|------|------|
| prompt_style | 畫風提示 | 電影級寫實 |
| prompt_camera | 攝影提示 | cinematic lighting |
| prompt_mood | 情緒提示 | melancholic |
| reference | 參考畫面 | 《霸王別姬》電影 |

## 分鏡表CSV格式

```csv
shot_id,episode,scene,shot_number,duration,shot_type,camera_angle,camera_movement,lens,focus,key_light,lighting_style,color_temp,light_direction,shadows,framing,depth,headroom,lead_room,character,emotion,action,eyeline,blocking,location,time_of_day,weather,props,costume,color_palette,dialogue,sfx,music,ambience,transition_in,transition_out,pacing,beat,prompt_style,prompt_camera,prompt_mood,reference
```

## 場景分鏡規劃

### 每集40鏡頭分配
```
開場 (5鏡): 建立場景、時間、人物
發展 (15鏡): 推進情節、對話互動
轉折 (10鏡): 衝突升級、情緒變化
高潮 (7鏡): 關鍵時刻、視覺衝擊
收尾 (3鏡): 結果呈現、懸念埋設
```

### 鏡頭節奏曲線
```
1-5: 穩定建立 (Static/Wide)
6-20: 逐漸緊湊 (Medium shots, more movement)
21-30: 緊張升級 (Close-ups, faster cuts)
31-37: 高潮爆發 (Extreme close-ups, dynamic)
38-40: 緩和/懸念 (Pull back, linger)
```

---

## 🆕 AI生成Prompt輸出 (必須包含)

> ⚠️ **重要更新 (2026-02-17)**
> 每個鏡頭必須輸出完整的AI生成提示詞，不要只輸出標籤碎片！

### 10. 完整Prompt字段 (必填)

| 字段 | 說明 | 長度 |
|------|------|------|
| **画面描述** | 中文完整句子描述畫面，像在看電影 | 50-100字 |
| **Image_Prompt** | 英文圖片生成提示詞 (MJ/SD/Flux用) | 50-150詞 |
| **Video_Prompt** | 英文視頻生成提示詞 (Runway/Pika/Kling用) | 30-80詞 |
| **importance** | 鏡頭重要性等級 | S/A/B/C |

### 画面描述 寫法示例
```
❌ 錯誤: "CU, 小豆子, 恐懼, 看向門外"
✅ 正確: "特寫鏡頭，小豆子蜷縮在角落，臉上滿是恐懼。他的眼睛緊緊盯著門外的方向，眼眶中閃爍著淚光。昏暗的燭光在他臉上投下搖曳的陰影，整個畫面籠罩在壓抑的灰藍色調中。"
```

### Image_Prompt 寫法示例 (MJ/SD/Flux/Nano)

**高質量Prompt公式**：Subject Details + Environment + Lighting + Camera + Style + Negative

```
❌ 錯誤: "CU shot, 小豆子, 恐懼, high-key lighting"
✅ 正確: "Cinematic close-up shot of a young Chinese opera boy (age 8, shaved head, tear-stained face, wearing blue cotton training uniform) crouching in a corner with terrified expression, tears welling up in his eyes, looking towards the door. 1920s Beijing opera school interior, wooden floor, dim candlelight casting flickering shadows on his face. Low-key dramatic lighting, warm candlelight as key light, deep shadows. 85mm lens, f/2.8, shallow depth of field, eyes sharp. Desaturated blue-gray color palette, film grain, emotional, cinematic quality, 8K. --ar 16:9 --style raw"
```

**Image Prompt 結構化元素：**
| 區塊 | 說明 | 範例 |
|------|------|------|
| **Subject** | 主體詳細描述（年齡/外貌/服裝/姿勢/表情） | "young Chinese opera boy, age 8, shaved head, wearing blue training uniform" |
| **Environment** | 場景環境細節 | "1920s Beijing opera school interior, wooden floor, paper windows" |
| **Lighting** | 燈光風格和方向 | "low-key dramatic lighting, candlelight as key light, deep shadows" |
| **Camera** | 鏡頭技術參數 | "85mm lens, f/2.8, shallow depth of field, eye-level angle" |
| **Style** | 視覺風格和品質 | "cinematic, film grain, emotional, 8K quality" |
| **Negative** | 要避免的元素（可選） | "--no cartoon, distorted face, extra fingers" |

**Negative Prompt 常用排除項：**
```
--no distorted face, extra fingers, mutated hands, blurry, low quality, cartoon, anime style, oversaturated, plastic skin, bad anatomy, watermark, text
```

**相機參數快查：**
| 景別 | 推薦鏡頭 | 光圈 | 景深 |
|------|----------|------|------|
| ECU特寫 | 100mm macro | f/2.0 | 極淺 |
| CU近景 | 85mm | f/2.8 | 淺 |
| MS中景 | 50mm | f/4 | 中等 |
| LS全景 | 35mm | f/5.6 | 深 |
| ELS大遠景 | 24mm wide | f/8 | 極深 |

### Video_Prompt 寫法示例 (Seedance 2.0 / Runway / Pika / Kling)

**公式**: Subject + Action + Camera Movement + Scene + Style + Constraints

```
❌ 錯誤: "小豆子看門"
✅ 正確: "A terrified young Chinese opera boy with tear-stained face slowly turns his head towards the door. Candlelight flickers on his wet cheeks, casting dancing shadows. Camera slowly pushes in from medium shot to extreme close-up. 1920s Beijing opera school interior, low-key dramatic lighting, warm candlelight tones. Cinematic quality, film grain, emotional mood. Keep face and clothing consistent, no flicker, high detail. 4 seconds."
```

**Video Prompt 必備元素：**
| 元素 | 說明 | 範例 |
|------|------|------|
| Subject | 主體詳細描述 | "A young Chinese opera boy wearing blue training uniform" |
| Action | 動作描述（動詞開頭） | "slowly turns his head", "tears streaming down" |
| Camera | 鏡頭運動 | "camera slowly pushes in", "tracking shot follows" |
| Scene | 場景環境 | "1920s Beijing opera school, dim interior" |
| Style | 視覺風格 | "cinematic, film grain, low-key lighting" |
| Constraints | 一致性規則 | "Keep face consistent, no flicker, high detail" |
| Duration | 時長 | "4 seconds", "5s" |

**物理細節（增加真實感）：**
- 頭髮/衣物：「A light breeze moves her hair and dress」
- 光影互動：「Candlelight casting flickering shadows」
- 水/雨：「wet fabric, rain splashing on ground」
- 反射：「Neon signs reflecting on wet ground」

**一致性咒語（防止閃爍/變形）：**
```
Keep the same character, same clothing, same hairstyle, no face changes, no flicker, high consistency, perfect anatomy.
```

### 重要性等級 (importance)
| 等級 | 比例 | 說明 |
|------|------|------|
| **S** | 5% | HERO SHOT - 必須精心設計，視覺衝擊力最強 |
| **A** | 15% | KEY SHOT - 劇情轉折點，情感高潮 |
| **B** | 30% | IMPORTANT - 推進敘事，角色刻畫 |
| **C** | 50% | STANDARD - 常規過渡，節奏填充 |

### 完整輸出JSON格式

```json
{
  "shot_id": "E001_S001",
  "episode": 1,
  "scene_num": 1,
  "shot_number": 1,
  "duration": 3.5,
  "importance": "A",
  "shot_type": "CU",
  "camera_angle": "Eye-level",
  "camera_movement": "Static",
  "character": "小豆子",
  "emotion": "恐懼",
  "action": "蜷縮角落，看向門外",
  "location": "關家科班",
  "time_of_day": "夜晚",
  "lighting_style": "Low-key",
  "color_palette": "灰藍冷色",
  "画面描述": "特寫鏡頭，小豆子蜷縮在角落，臉上滿是恐懼。他的眼睛緊緊盯著門外的方向，眼眶中閃爍著淚光。昏暗的燭光在他臉上投下搖曳的陰影，整個畫面籠罩在壓抑的灰藍色調中。",
  "Image_Prompt": "Cinematic close-up shot of a young Chinese opera boy crouching in a corner, terrified expression, tears welling up in his eyes, looking towards the door, dim candlelight casting flickering shadows on his face, 1920s Beijing opera school interior, low-key lighting, desaturated blue-gray color palette, shallow depth of field, film grain, emotional, dramatic, 8K, --ar 16:9",
  "Video_Prompt": "A terrified young Chinese opera boy slowly turns his head towards the door, tears streaming down his face, candlelight flickering, camera slowly pushing in, emotional close-up, 1920s Beijing, cinematic, 4 seconds"
}
```

---

> 💡 **核心要點**: 
> 1. 畫面描述要有電影感，讓人能「看到」畫面
> 2. Image_Prompt 要包含風格、構圖、燈光、色調、技術參數
> 3. Video_Prompt 要強調動作、鏡頭運動、時長
> 4. 每個鏡頭必須標注 importance 等級
