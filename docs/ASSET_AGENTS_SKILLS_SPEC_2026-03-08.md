# 资产系统（人物/服装/道具/场景）智能体设计稿（2026-03-08）

（此文档从 workspace/docs 同步到仓库，作为团队在 GitHub 上的权威规格说明。）

目标：把“从剧本提取资产（Extractor）”与“美术设计（Designer）”彻底解耦，并用系统级 QC 保证人物一致性/角色一致性/连续性。

---

## A. 智能体列表（Agent IDs / Names）

### A1) Extractor（只读剧本 → 只写资产；禁止改剧情）
1) `asset_extractor`（总提取器，推荐做成一个入口，输出 5 库）
   - Name：🧱 资产抽取（人物/服装/道具/场景/链接）
   - Output：严格 JSON（5 库）

### A2) Designers（只读资产库 → 只写“设计方案/Prompt”；禁止新增角色/设定）
2) `design_character_look` - 🎭 人物造型设计（Character Look Bible）
3) `design_costume_bible` - 👗 服装设计（Costume Bible）
4) `design_props_bible` - 🧰 道具设计（Props Bible）
5) `design_scene_bible` - 🏗️ 场景/布景设计（Scene/Set Bible）
6) `design_character_costume_pairing` - 🧷 人物+服装组合设计（Pairing Bible）

### A3) QC
7) `asset_qc_gate` - ✅ 资产一致性/连续性门禁（QC Gate）

---

## 详细规格
请参考同名原始设计稿：
- `/home/beerbear/.openclaw/workspace/docs/ASSET_AGENTS_SKILLS_SPEC_2026-03-08.md`

> 注：本仓库版本会持续与系统实现同步更新。