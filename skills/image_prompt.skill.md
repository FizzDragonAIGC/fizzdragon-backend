# 圖片提示詞專業技能 (Image Prompt Skill)

> 📚 **專業AI圖像生成提示詞規範**
> - Stable Diffusion / MidJourney / DALL-E 3 最佳實踐
> - 電影級視覺美學標準

---

## 一、標準格式

```
[主體描述], [動作/姿態], [環境/場景], [光影/色彩], [風格/藝術家參考], [畫質/渲染參數]
```

---

## 二、六大核心要素

### 1. 主體描述 (Subject)
- 人物：性別、年齡、外貌、服裝
- 物件：材質、狀態、細節
- 範例：`A middle-aged Chinese woman in a traditional cheongsam`

### 2. 動作/姿態 (Action/Pose)
- 靜態姿勢：standing, sitting, leaning
- 表情：smiling gently, looking pensive, crying
- 範例：`standing by an old wooden door, smiling gently`

### 3. 環境/場景 (Environment)
- 地點：courtyard, mountain peak, riverside
- 天氣/時間：misty morning, golden hour, snowy winter
- 範例：`traditional Chinese courtyard in winter, snow falling`

### 4. 光影/色彩 (Lighting/Color)
- 光線類型：warm sunlight, dramatic lighting, soft diffused light
- 色調：warm tones, cool blue palette, desaturated
- 範例：`warm afternoon sunlight streaming through, golden hour`

### 5. 風格/藝術家參考 (Style)
- 攝影風格：cinematic, photorealistic, documentary
- 藝術家：by WLOP, Greg Rutkowski, Artgerm
- 範例：`concept art by WLOP and Greg Rutkowski, volumetric lighting`

### 6. 畫質/渲染參數 (Quality)
- 解析度：8K, 4K, highly detailed
- 相機：shot on Arri Alexa, 85mm lens
- 效果：film grain, shallow depth of field
- 範例：`8k, highly detailed, shot on Arri Alexa, film grain`

---

## 三、景別對照表

| 中文 | 英文 | 描述 |
|------|------|------|
| 大遠景 | Extreme wide shot (EWS) | 環境為主，人物渺小 |
| 遠景 | Wide shot (WS) | 全身+完整環境 |
| 全景 | Full shot (FS) | 人物全身 |
| 中景 | Medium shot (MS) | 腰部以上 |
| 中近景 | Medium close-up (MCU) | 胸部以上 |
| 近景 | Close-up (CU) | 面部為主 |
| 大特寫 | Extreme close-up (ECU) | 眼睛/嘴唇等細節 |

---

## 四、角度對照表

| 中文 | 英文 | 效果 |
|------|------|------|
| 平視 | Eye-level | 客觀、平等 |
| 俯拍 | High angle | 渺小、脆弱 |
| 仰拍 | Low angle | 威嚴、強大 |
| 鳥瞰 | Bird's-eye view | 全局、上帝視角 |
| 蟲眼 | Worm's-eye view | 極端仰視 |
| 荷蘭角 | Dutch angle | 不安、緊張 |

---

## 五、光線詞彙

| 類型 | 英文 | 氛圍 |
|------|------|------|
| 高調 | High-key lighting | 明亮、輕快 |
| 低調 | Low-key lighting | 神秘、戲劇 |
| 側光 | Side lighting | 立體、質感 |
| 逆光 | Backlight/Rim light | 剪影、神聖 |
| 倫勃朗 | Rembrandt lighting | 經典、藝術 |
| 丁達爾 | Tyndall effect/God rays | 光束、夢幻 |
| 黃金時刻 | Golden hour | 溫暖、浪漫 |
| 藍調時刻 | Blue hour | 憂鬱、冷靜 |

---

## 六、負向提示詞 (Negative Prompt)

```
NSFW, distorted, ugly, blurry, low quality, bad anatomy, watermark, text, deformed, disfigured, extra limbs, duplicate, cartoon, anime (unless intended)
```

---

## 七、完整範例

### 範例1：電影感劇照
```
A middle-aged Chinese woman in a traditional cheongsam, standing by an old wooden door, smiling gently, warm afternoon sunlight streaming through, soft focus background, shallow depth of field, cinematic lighting, photorealistic, 8k, highly detailed, shot on Arri Alexa, film grain, --ar 16:9
```

### 範例2：古風人物
```
A handsome young swordsman in ancient Chinese attire, holding a sword, standing on a misty mountain peak, dramatic sky, golden hour, epic atmosphere, concept art by WLOP and Greg Rutkowski, volumetric lighting, ultra-detailed, masterpiece, 8K, --ar 16:9
```

### 範例3：情感特寫
```
Extreme close-up of a young Chinese girl's face, tears rolling down her cheeks, eyes filled with longing, soft window light illuminating her face, shallow depth of field, cinematic, emotional, highly detailed skin texture, 8K, photorealistic, --ar 16:9
```

---

## 八、輸出格式要求

每個鏡頭的Image_Prompt必須：
1. **全英文**
2. **50-150詞**
3. **包含6要素**：主體+動作+環境+光影+風格+畫質
4. **結尾加** `8K, --ar 16:9`
