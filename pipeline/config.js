// Pipeline 步骤 → agent 映射
export const PIPELINE_AGENT_MAP = {
  'extract-bible': 'story_bible_extractor',
  'breakdown': 'story_breakdown_pack',
  'screenplay': 'screenwriter',
  'extract-assets': 'asset_extractor',
  'qc-assets': 'asset_qc_gate',
  'storyboard': 'storyboard_csv'
};

export const PIPELINE_STEPS = Object.keys(PIPELINE_AGENT_MAP);
