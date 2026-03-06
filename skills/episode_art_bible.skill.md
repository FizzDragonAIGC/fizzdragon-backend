# 分集美術聖經 (Episode Art Bible)

> 角色與環境與道具的「物理一致性」規則集：把本集所有鏡頭的空間、道具連接、服化道連貫寫死。
> 這份輸出會被 shot builder 注入到每個鏡頭的 description / Image_Prompt / Video_Prompt。

---

## 必須回答（每集必填）

1) **核心場景錨點（Scene Anchors）**
- 以俯視/文字地圖方式描述：門、窗、小窗、床、牆面A/B/C/D、監控、桶、走廊方向。

2) **角色位置與姿態（Blocking）**
- 角色在場景中的固定位置：例如「左牆鐵環處」「床邊地面」「門內側陰影」。
- 姿態：跪/坐/靠/趴/站（必須與束縛相容）。

3) **道具↔環境關係（Prop↔Set）**
- 道具固定點：鎖鏈固定在哪個牆面/鐵環/床架。
- 道具物理參數：長度範圍（可達半徑）、是否可拖曳、是否上鎖。

4) **人↔道具關係（Human↔Prop）**
- 接觸點：右手腕/左手腕/腳踝/頸圈等。
- 可達範圍：手臂能伸到哪裡（避免「左牆被鎖卻摸到右牆」）。

5) **服化道連貫（Costume/Makeup Continuity）**
- 污漬/血跡/針孔的位置與程度（本集內保持一致或按事件升級）。

6) **禁止項（Forbidden）**
- 明確列出本集不可出現的物理矛盾。

---

## 輸出格式（JSON only）

```json
{
  "episode": 1,
  "scene_anchors": {
    "map_text": "俯視圖文字描述",
    "anchors": ["Door", "SmallWindow", "LeftWallRing", "Bed", "Camera"]
  },
  "blocking_rules": {
    "default_position": "角色固定位置",
    "allowed_positions": ["..."],
    "forbidden_positions": ["..."],
    "pose_constraints": ["被鎖時只能坐地/靠牆，不能自由走動"]
  },
  "prop_set_rules": {
    "chains": {"anchor": "LeftWallRing", "connect_to": "RightWrist", "length": "short", "reach": "chest_only"},
    "bin": {"location": "CorridorOutsideDoor"}
  },
  "human_prop_rules": {
    "reach_limits": ["右手最多到胸前", "無法跨越房間"],
    "contact_points": ["右手腕金屬束縛"]
  },
  "costume_continuity": {
    "base_costume": "囚服",
    "marks": ["右前臂針孔（泛紅）"]
  },
  "forbidden": [
    "同一鏡頭內同時左牆被鎖又去觸摸右牆",
    "鎖扣固定點前後不一致"
  ]
}
```

---

## 注意
- 不要輸出 Markdown 解釋。
- 只輸出 JSON。
