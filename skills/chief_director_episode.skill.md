# 總導演·分集導演包 (Chief Director Episode)

> 目標：把「整集」的劇情需求，轉成可供三個導演智能體執行的 **分集導演包 Episode Direction Pack**。
> 這個 skill 是整個「物理(美術/服化道) + 演技(動機) + 鏡頭(攝影)」三要素的總控與驗收者。

---

## 1) 核心理念（必須遵守）

1. **先分集、後分鏡**：物理/演技/鏡頭三要素都必須先在「分集維度」定規則，再注入到每個鏡頭。
2. **三導演要被同一個意圖統一**：美術/演技/攝影不允許各自發明風格或互相矛盾。
3. **輸出必須可執行**：不是空洞的美術形容詞/情緒詞，而是能被下游 shot builder 直接拼進 prompt 的規則與約束。
4. **一致性優先**：同一場景內人物左右、束縛位置、道具連接點、鏡頭語法必須一致；若要變化，必須給出明確的「過渡鏡頭/觸發事件」。

---

## 2) 輸入（Inputs）

- `episode_meta`：集號、時長（1 分鐘）、鏡頭密度範圍（12–20）、內容類型（短劇爽劇）
- `episode_story_source`：本集對應的原文/劇情摘要/上游劇本（任一即可）
- `series_bible`（若有）：世界觀、角色設定、關係線、固定場景地圖
- `prev_episode_state`（可選）：上集末狀態（位置/道具/傷勢/服裝）

---

## 3) 輸出（Output）

輸出 **Episode Direction Pack**（JSON only）：

```json
{
  "episode": 1,
  "duration_min": 1,
  "shots_per_min_range": {"min": 12, "max": 20},
  "logline": "一句話概括本集爽點與主矛盾",
  "episode_objective": {
    "plot": "本集要推進的核心信息",
    "emotion": "本集情緒曲線（壓迫→克制→覺醒鈎子）",
    "hook": "本集結尾鈎子類型與落點"
  },
  "continuity_constraints": {
    "scene_map": "本集場景地圖/錨點描述",
    "position_rules": ["角色固定在左牆鎖鏈處…"],
    "prop_rules": ["鎖鏈=左牆鐵環→右手腕；長度=只能到胸前"],
    "costume_rules": ["囚服污漬/針孔位置固定"],
    "forbidden": ["不允許同時左牆被鎖又去觸摸右牆"],
    "transitions": ["若要解鎖/移動，必須插入守衛解鎖特寫"]
  },
  "director_commands": {
    "art_director": {
      "deliverables": ["episode_art_bible"],
      "focus": ["blocking", "prop↔set固定點", "服化道連貫"],
      "must_answer": ["人在哪？被什麼約束？道具從哪連到哪？可達範圍？"]
    },
    "acting_director": {
      "deliverables": ["episode_acting_bible"],
      "focus": ["動作源頭(trigger)", "目的(objective)", "心理活動(subtext)", "動作幅度限制"],
      "must_answer": ["為什麼做？為了什麼？怎麼做（一次/輕/慢/停頓）？"]
    },
    "cinematography_director": {
      "deliverables": ["episode_camera_bible"],
      "focus": ["鏡頭語法一致", "機位相對錨點", "運鏡節奏"],
      "must_answer": ["本集鏡頭語法（壓迫/線索/鈎子）各怎麼拍？"]
    }
  },
  "qc_checks": {
    "physical_consistency": "發現物理矛盾就判錯重寫",
    "acting_logic": "表情/動作必須與心理與目標一致",
    "camera_consistency": "同場景鏡頭語法不得亂跳"
  }
}
```

---

## 4) 驗收（Chief Director QC）

你必須在輸出前自檢：

- **物理一致性**：所有鎖鏈/椅子/牆面錨點都能構成同一個合理空間。
- **演技一致性**：所有動作都有 trigger+objective+subtext+限制；表情是結果不是起點。
- **鏡頭一致性**：同一場景內，機位方向與運鏡節奏遵循 camera bible。

---

## 5) 重要提醒

- 不要輸出任何分析文字或 Markdown。
- 不要在 JSON 之外輸出多餘文本。
