# Script Parser Skill (劇本拆分)

## 🎯 功能
將用戶上傳的完整劇本自動拆分成章節結構

## 📥 輸入
- 完整劇本文本（任意格式）

## 📤 輸出格式
```json
{
  "title": "劇本標題",
  "total_episodes": 10,
  "detected_format": "標準場景格式 / 小說式 / 對話式",
  "characters": ["角色1", "角色2"],
  "episodes": [
    {
      "ep": 1,
      "title": "章節標題",
      "start_marker": "【第一場】或第一句台詞",
      "end_marker": "結束位置標記",
      "scenes": ["場景1", "場景2"],
      "characters": ["出場角色"],
      "word_count": 1500,
      "estimated_duration": "5分鐘",
      "content": "完整章節內容（原文）"
    }
  ],
  "summary": {
    "total_scenes": 45,
    "total_characters": 8,
    "total_words": 15000,
    "estimated_total_duration": "50分鐘"
  }
}
```

## 🔍 拆分規則

### 自動識別分割點
1. **場景標記**: 【場景】、INT.、EXT.、第X場
2. **章節標記**: 第X章、EP.X、第X集
3. **時間跳躍**: 「三年後」「隔天」「次日」
4. **空間轉換**: 新場景出現
5. **段落分隔**: 連續空行

### 智能合併
- 單場景太短（<500字）→ 合併到前一章
- 單場景太長（>3000字）→ 建議拆分

### 角色識別
- 對話前的角色名
- 動作描述中的人物
- 去重並統計出場次數

## ⚠️ 注意事項
- 保留原文，不修改內容
- 標記每章的起止位置
- 統計字數和預估時長（150字/分鐘）
