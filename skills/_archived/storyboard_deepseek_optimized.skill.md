# DeepSeek優化分鏡系統技能

> 基於3輪DeepSeek專業諮詢的優化方案

## 新增關鍵元素 (DeepSeek建議)

### 1. 視覺節奏 (Visual Rhythm)
| 字段 | 說明 | 選項 |
|------|------|------|
| shot_duration | 鏡頭時長 | 1-10秒 |
| cut_style | 剪輯風格 | Hard-cut/Dissolve/Fade/Wipe/Match-cut/J-cut/L-cut |
| transition_intent | 轉場意圖 | 時間流逝/情緒轉換/空間跳躍/心理過渡 |

### 2. 情感弧線 (Emotional Arc)
| 字段 | 說明 | 選項 |
|------|------|------|
| emotional_intensity | 情感強度 | 1-10級 |
| purpose_in_arc | 敘事作用 | 鋪墊/升溫/爆發/回落/餘韻 |
| emotional_target | 情感目標 | 緊張/釋放/悲傷/希望/絕望 |

### 3. 視覺潛台詞 (Visual Subtext)
| 字段 | 說明 | 範例 |
|------|------|------|
| visual_subtext | 畫面潛台詞 | "被困在回憶中" |
| show_not_tell | 視覺暗示 | 冷卻的咖啡暗示時間流逝 |
| symbolic_element | 象徵元素 | 破碎的鏡子代表自我分裂 |

### 4. 空間敘事 (Space Narrative)
| 字段 | 說明 | 選項 |
|------|------|------|
| fg_element | 前景元素 | 遮擋物/引導線/象徵物 |
| mg_focus | 中景焦點 | 主角/互動/動作 |
| bg_ambiance | 背景氛圍 | 城市燈光/自然景觀/虛化 |
| space_emotion | 空間情緒 | 壓抑/開闊/疏離/溫馨 |
| negative_space | 負空間運用 | 大量(孤獨)/緊湊(緊張) |

### 5. 大師參考 (Master Reference)
| 字段 | 說明 | 範例 |
|------|------|------|
| director_ref | 導演風格 | 庫布里克/王家衛/宮崎駿/諾蘭 |
| cinematographer_ref | 攝影風格 | Roger Deakins/Vittorio Storaro |
| film_ref | 影片參考 | 《花樣年華》《閃靈》 |

## 文化風格差異 (5種)

### 中國 (中式美學)
- **構圖**: 留白與意境，框中景哲學
- **運動**: 舒緩如山水畫長卷
- **光影**: 墨分五色，柔光散射
- **色彩**: 朱紅/黛青，飽和度克制

### 日本 (日本動畫/電影)
- **構圖**: 關鍵幀繪畫性，空鏡頭物哀
- **運動**: 一拍三節奏，動態模糊
- **光影**: 動畫式高光，侘寂自然光
- **表演**: 細微的「間」停頓

### 好萊塢 (經典/現代)
- **構圖**: 三分法，視線引導，過肩鏡頭
- **運動**: 流暢無縫，英雄慢動作
- **光影**: 三點布光，倫勃朗光
- **敘事**: 緊密服務三幕劇結構

### 歐洲 (藝術電影)
- **構圖**: 實驗性，打破第四面牆
- **運動**: 長鏡頭，緩慢推軌
- **光影**: 自然光，粗糲真實
- **表演**: 內斂生活化

### 印度 (寶萊塢)
- **構圖**: 極度鮮艷，裝飾對稱
- **運動**: 旋轉升降，與音樂咬合
- **光影**: 高飽和色光
- **節奏**: 馬薩拉混合模式

## 避免機械重複策略

1. **定義視覺主旋律與變奏**: 每個場景設定核心構圖，但強制包含打破常規的視角
2. **引入不完美參數**: 手持晃動、焦點呼吸、光影偶然性
3. **角色心理驅動鏡頭**: 自信=低角度穩定; 困惑=傾斜構圖; 回忆=柔焦低飽和
4. **混合導演風格**: 日常戲用宮崎駿風格，懸疑戲用庫布里克風格

## 評估標準

### 量化指標
| 指標 | 公式 | 達標值 |
|------|------|--------|
| 構圖變化率 | 不同構圖數/總鏡頭數 | >60% |
| 光影敘事轉折 | 光影變化點數/情節轉折數 | ≥80% |
| 情感強度曲線 | 高潮點強度/平均強度 | ≥2.5x |
| 視角多樣性 | 不同角度數/總鏡頭數 | >50% |
| 潛台詞覆蓋率 | 有潛台詞鏡頭/關鍵鏡頭 | ≥70% |

### 類型特殊要求
- **動作**: 對角線構圖>40%, 快速剪輯序列清晰度
- **情感**: 特寫佔比>30%, 慢動作/前景遮擋運用
- **懸疑**: 封閉構圖>50%, 暗調高光比, 信息控制

## 輸出格式 (優化後55字段)

```csv
# 基礎 (5)
shot_id, episode, scene, shot_number, duration

# 攝影 (5)
shot_type, camera_angle, camera_movement, lens, focus

# 燈光 (5)
key_light, lighting_style, color_temp, light_direction, shadows

# 構圖 (4)
framing, depth, headroom, lead_room

# 表演 (5)
character, emotion, action, eyeline, blocking

# 美術 (6)
location, time_of_day, weather, props, costume, color_palette

# 聲音 (4)
dialogue, sfx, music, ambience

# 節奏 (5)
transition_in, transition_out, pacing, beat, phase

# 新增: 視覺節奏 (3)
shot_duration, cut_style, transition_intent

# 新增: 情感弧線 (3)
emotional_intensity, purpose_in_arc, emotional_target

# 新增: 視覺潛台詞 (3)
visual_subtext, show_not_tell, symbolic_element

# 新增: 空間敘事 (5)
fg_element, mg_focus, bg_ambiance, space_emotion, negative_space

# 新增: 大師參考 (3)
director_ref, cinematographer_ref, film_ref

# AI生成提示 (4)
prompt_style, prompt_camera, prompt_mood, prompt_lighting
```
