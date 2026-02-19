# Character Design Complete - 角色設計完整指南

## 核心理念
角色設計不只是外觀，而是**視覺化的心理學**。每個設計決定都應反映角色的內在。

---

## 一、剪影設計 (Silhouette Design)

### 1.1 三大基礎形狀
| 形狀 | 性格暗示 | 適用角色 |
|------|----------|----------|
| 圓形 | 友善、可愛、親和 | 配角、喜劇角色、導師 |
| 方形 | 穩重、可靠、強壯 | 英雄、保護者、父親形象 |
| 三角形 | 危險、神秘、野心 | 反派、謀士、衝突角色 |

### 1.2 識別度測試
- **遠景測試**：10米外能否認出角色？
- **剪影測試**：純黑剪影能否區分？
- **標誌性特徵**：帽子/髮型/武器/姿勢

---

## 二、面部特徵 (Facial Features)

### 2.1 五官設計原則
```
眼睛 = 情感窗口
  - 大眼 → 天真、情感外露
  - 小眼 → 精明、內斂
  - 上挑 → 傲慢、挑釁
  - 下垂 → 溫柔、憂鬱

眉毛 = 情緒指示器
  - 粗眉 → 剛毅、直爽
  - 細眉 → 優雅、陰險
  - 上揚 → 驚訝、關注
  - 下壓 → 憤怒、專注

嘴巴 = 性格表達
  - 厚唇 → 感性、熱情
  - 薄唇 → 理性、刻薄
  - 上揚 → 樂觀、自信
  - 下垂 → 悲觀、嚴肅
```

### 2.2 默認表情
每個角色需要一個「靜態表情」：
- 主角：微微自信的笑 / 堅定的凝視
- 反派：玩味的冷笑 / 居高臨下的審視
- 配角：根據功能設計（搞笑=誇張、智者=平靜）

---

## 三、體型比例 (Body Proportions)

### 3.1 頭身比
| 頭身比 | 風格 | 適用 |
|--------|------|------|
| 2-3頭身 | Q版/萌系 | 搞笑、輕鬆番劇 |
| 5-6頭身 | 少年向 | 熱血、冒險 |
| 7-8頭身 | 寫實 | 劇情向、成人向 |
| 9+頭身 | 超模 | 時尚、高貴角色 |

### 3.2 體型與性格
- **瘦高**：敏捷、神秘、脆弱感
- **健壯**：力量、保護、威脅感
- **圓潤**：親和、喜劇、享樂
- **纖細**：優雅、靈巧、脆弱

---

## 四、AI生成Prompt公式

### 4.1 角色形象Prompt結構（150-200字英文）

```
[Character Name], [age] year old [gender], [role in story].

FACE: [eye shape and color], [eyebrow style], [nose], [mouth], [skin tone], [facial hair if any], [distinctive facial feature].

HAIR: [style], [length], [color], [texture], [any accessories].

BUILD: [height descriptor], [body type], [posture], [head-to-body ratio].

EXPRESSION: [default mood], [eye direction], [mouth position].

COSTUME: [main outfit], [colors], [accessories], [style era].

SILHOUETTE: [dominant shape], [most recognizable feature from distance].

MOOD/AURA: [overall vibe], [color association], [lighting suggestion].

--style [art style], character design sheet, full body, multiple angles, white background
```

### 4.2 範例

**主角 - 熱血少年**
```
Kai Chen, 17 year old male, protagonist hero.

FACE: Large determined eyes with amber irises, thick straight eyebrows, sharp nose, confident smirk, tanned skin, small scar on left cheek.

HAIR: Spiky black hair with red highlights, medium length, windswept style, red headband.

BUILD: Athletic 175cm, lean muscular, slightly forward-leaning eager posture, 7 head ratio.

EXPRESSION: Determined gaze, slight smile, eyes looking ahead.

COSTUME: Red and black jacket with flame patterns, white t-shirt, cargo pants, combat boots, fingerless gloves.

SILHOUETTE: Triangle (dynamic), recognizable by spiky hair and headband.

MOOD/AURA: Energetic, warm orange-red color theme, backlit heroic lighting.

--style anime, Shonen Jump, character design sheet, full body, front/side/back views, white background, detailed
```

**反派 - 陰謀家**
```
Lord Varen, 45 year old male, main antagonist.

FACE: Narrow calculating eyes with pale grey irises, thin arched eyebrows, aquiline nose, thin-lipped cold smile, pale porcelain skin, sharp cheekbones.

HAIR: Slicked back silver hair, long to shoulders, immaculate, silver hair ornament.

BUILD: Tall imposing 190cm, slender but commanding, perfectly straight posture, 8.5 head ratio.

EXPRESSION: Condescending half-smile, looking down, one eyebrow raised.

COSTUME: Black and purple noble robes with silver embroidery, high collar, black gloves, silver rings, cape with inner red lining.

SILHOUETTE: Inverted triangle (threatening), recognizable by tall figure and cape silhouette.

MOOD/AURA: Menacing elegance, cold purple-black theme, dramatic side lighting with shadows.

--style dark fantasy, detailed realistic, character design sheet, full body, 3/4 view, dark gradient background
```

---

## 五、角色對比設計

### 5.1 主角 vs 反派
| 元素 | 主角 | 反派 |
|------|------|------|
| 形狀 | 圓/方 | 三角/尖銳 |
| 顏色 | 暖色/明亮 | 冷色/暗沉 |
| 線條 | 流暢/開放 | 銳利/封閉 |
| 姿勢 | 前傾/開放 | 後仰/封閉 |

### 5.2 視覺對比原則
- **體型對比**：高vs矮、壯vs瘦
- **色彩對比**：互補色或明度對比
- **設計密度**：簡潔vs繁複

---

## 六、輸出要求

### JSON輸出格式
```json
{
  "name": "角色名",
  "role": "主角/配角/反派",
  "visual_summary": "一句話視覺描述",
  "silhouette": {
    "dominant_shape": "圓/方/三角",
    "distinctive_feature": "標誌性特徵",
    "recognition_distance": "遠/中/近景識別"
  },
  "face": {
    "eyes": "形狀+顏色+特點",
    "eyebrows": "形狀+粗細",
    "nose": "形狀",
    "mouth": "形狀+常態",
    "skin": "膚色+質感",
    "distinctive": "面部標記/傷疤/紋身"
  },
  "hair": {
    "style": "髮型名稱",
    "length": "長度",
    "color": "顏色",
    "accessories": "髮飾"
  },
  "body": {
    "height": "身高描述",
    "build": "體型",
    "posture": "姿態",
    "head_ratio": "頭身比"
  },
  "expression": {
    "default_mood": "默認情緒",
    "signature_look": "標誌性表情"
  },
  "color_palette": ["主色", "輔色", "點綴色"],
  "ai_prompt_short": "50字英文快速生成prompt",
  "ai_prompt_full": "150-200字完整英文prompt（按上述公式）",
  "design_notes": "設計師備註"
}
```

---

## 參考資料
- 《The Art of Character Design》 - Disney Animation
- 《Creating Characters with Personality》 - Tom Bancroft
- 《角色設計的藝術》 - 宮崎駿訪談
