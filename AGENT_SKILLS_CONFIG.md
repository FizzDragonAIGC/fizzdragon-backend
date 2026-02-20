# 智能体 × Skill 配置表

> 固定配置，maxSkills=5

## 可用Skills（13个）

| Skill | 描述 | 适用场景 |
|-------|------|---------|
| `narrative_complete` | 敘事結構（McKee、Campbell、Blake Snyder） | 故事分析、章節規劃 |
| `character_complete` | 角色設計（G.W.L.T.框架、心理學） | 角色創建、人物小傳 |
| `novel_processing_complete` | 小說處理（長文本分析） | 導入分析 |
| `screenplay_complete` | 劇本寫作（場景、對白格式） | 劇本生成 |
| `dialogue_complete` | 對白設計（潛台詞、風格） | 對話寫作 |
| `interview_complete` | 創意訪談（問題設計） | 用戶訪談 |
| `storyboard_complete` | 分鏡設計（構圖、運鏡） | 分鏡生成 |
| `cinematography_complete` | 攝影燈光（色調、氛圍） | 視覺設計 |
| `music_complete` | 音樂設計（配樂、音效） | 音樂選擇 |
| `voiceover_complete` | 旁白配音（語氣、節奏） | 旁白設計 |
| `image_prompt` | AI圖片Prompt | 圖片生成 |
| `video_prompt` | AI視頻Prompt | 視頻生成 |
| `ad_creative` | 廣告創意 | 廣告模式 |

---

## 核心智能体配置（影視模式）

### 📊 統籌組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🎬 director | narrative_complete, cinematography_complete | 2 |
| 💡 concept | narrative_complete, character_complete, novel_processing_complete | 3 |

### 📝 故事組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🎤 interview | interview_complete, character_complete, narrative_complete | 3 |
| 📖 narrative | narrative_complete, novel_processing_complete, character_complete | 3 |
| ✍️ screenwriter | screenplay_complete, dialogue_complete, character_complete, narrative_complete | 4 |

### 🎥 導演組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🎥 storyboard | storyboard_complete, cinematography_complete, music_complete, dialogue_complete, voiceover_complete, character_complete, narrative_complete, screenplay_complete, novel_processing_complete | **9** |
| 📷 cinematography | cinematography_complete | 1 |

### 🎨 美術組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🎨 artstyle | cinematography_complete, character_complete | 2 |
| 👤 character | character_complete, narrative_complete | 2 |
| 👔 production_design | character_complete, cinematography_complete | 2 |

### 🖼️ AI輸出組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🖼️ prompt | image_prompt, video_prompt | 2 |
| 🖼️ image_prompt | image_prompt, cinematography_complete | 2 |
| 📹 video_prompt | video_prompt, cinematography_complete | 2 |
| ✨ vfx | cinematography_complete, storyboard_complete | 2 |

### 🎵 音樂組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🎵 music | music_complete | 1 |

### 📚 輔助組

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 🏛️ era | screenplay_complete, character_complete | 2 |
| 📖 novel_processor | novel_processing_complete, narrative_complete | 2 |
| 📝 script_reviewer | screenplay_complete, narrative_complete | 2 |

---

## 廣告模式智能体

| 智能体 | Skills | 數量 |
|--------|--------|------|
| 📺 ad_director | ad_creative | 1 |
| 📊 ad_strategy | ad_creative | 1 |
| 🎨 ad_visual | storyboard_complete, cinematography_complete | 2 |
| ✍️ ad_copywriter | ad_creative | 1 |

---

## 配置原則

1. **核心分析類**（concept, narrative, character）：3+ skills
2. **創作輸出類**（screenwriter, storyboard）：4+ skills
3. **輔助工具類**（prompt, vfx）：2 skills
4. **單一功能類**（music, cinematography）：1 skill

## 修改記錄

- 2026-02-20: 初始配置固定
