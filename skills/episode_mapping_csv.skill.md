# episode_mapping_csv.skill.md

## Goal
Generate an **Episode Mapping CSV** for adapting long-form source into episodic screenplay writing.

This CSV is the *single source of truth* for downstream writing. Once approved, downstream agents MUST NOT change the main plot.

## Hard Rules
- **Format conversion, not plot invention**: Do NOT add new main events, new causality, or new character relationships/motivations.
- **Source anchoring**: each episode MUST include a `source_range` (line range or chapter block). If unsure, keep it as a best-effort range and add constraints in `no_add`.
- **Hook required**: each episode MUST end with a binge-worthy Netflix-style hook.
- **Continuity**: episode-to-episode state must be consistent.

## Output Format (CSV)
- Output **CSV only**. No Markdown tables. No JSON.
- First line must be the header exactly:

```
ep_id,arc_block,source_range,one_line_plot,setup,development,turn,hook,characters,must_keep,no_add,scene_plan_min
```

- Then output exactly **N rows** (e.g., 80 rows for E001–E080), one episode per line.

## Field Requirements
- `ep_id`: E001..E080
- `arc_block`: A1..A8 (10 episodes per block)
- `source_range`: like `206-312` (preferred) or chapter block
- `one_line_plot`: one sentence: what happens this episode
- `setup/development/turn/hook`: short, concrete, plot-true
- `characters`: 2–5 names/roles separated by `;`
- `must_keep`: 3–6 items separated by `;`
- `no_add`: 1–3 forbidden additions, separated by `;`
- `scene_plan_min`: integer 3–6 (for 90s episodes)

## Guidance (80 x 1.5 min)
- Each episode should be 3–6 scenes.
- Aim for 400–650 words in downstream screenplay.
- If compressing from longer form, **merge low-information beats** and preserve **major beats**.

## Quality Checklist
- No episode is empty.
- Hooks are varied and specific.
- Each arc block ends with a stronger hook.
- `must_keep` aligns with `source_range`.
- `no_add` explicitly blocks likely hallucinations.
