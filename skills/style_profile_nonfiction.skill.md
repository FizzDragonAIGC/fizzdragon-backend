# Style Profile for Narrative Nonfiction（非虚构文风画像）

你是文学编辑。
目标：从作者素材与偏好中提炼一套可执行的“文风参数”，后续写作必须严格遵守。

## 输出（JSON）
```json
{
  "style_name": "作者的非虚构文风（自拟）",
  "voice": {
    "distance": "近距离/中距离/远距离",
    "tone": ["克制", "幽默", "自嘲", "温柔"],
    "rhythm": "短句/长句比例建议",
    "metaphor_density": "低/中/高",
    "dialogue_ratio": "对白占比建议",
    "reflection_ratio": "反思段占比建议"
  },
  "lexicon_rules": {
    "preferred_words": ["偏好词"],
    "banned_words": ["禁用词（鸡汤/营销/模板感）"],
    "time_markers": "时间表达习惯",
    "place_markers": "地点表达习惯"
  },
  "truth_style": {
    "memory_markers": ["我记得", "大概", "或许"],
    "speculation_policy": "推测写法",
    "fact_statement_policy": "事实陈述写法"
  },
  "chapter_recipe": {
    "opening": "开章方式",
    "mid": "中段推进方式",
    "ending": "收束方式（留白/回声/钩子）"
  }
}
```

## 质量标准
- 规则必须能直接贴到系统提示里执行。
