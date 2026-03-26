import assert from 'node:assert/strict';

import { normalizePipelineStepOutput } from '../pipeline/services/output-normalizer.js';
import { buildDeterministicCharacterCostume } from '../pipeline/services/deterministic-character-costume.js';
import { validateCharacterCostumeAssets } from '../pipeline/services/character-costume-normalizer.js';

function parseResult(payload) {
  assert.ok(payload?.result, 'expected normalized result');
  return JSON.parse(payload.result);
}

function testExtractAssetsCharacterSlugRepair() {
  const normalized = normalizePipelineStepOutput('extract-assets', JSON.stringify({
    character_library: [
      { name: '杰克·舒利', character_id: 'jack_sully', ai_prompt: 'Jake Sully, disabled marine veteran, determined gaze, cinematic portrait' }
    ],
    costume_library: [],
    prop_library: [],
    scene_library: [
      {
        name: '市政火葬场',
        description: '冷白灯光打在金属台面上，空气湿冷，空间纵深清楚。',
        prompt: '市政火葬场，冷白灯光照亮金属台面，墙面与地面带有旧锈痕和潮湿反光，空间边界稳定，空气湿冷，整体色调灰冷压抑。'
      }
    ],
    episode_scene_asset_links: [
      {
        episode_id: 'E001',
        scene_id: 'E001_S01',
        scene_name: '市政火葬场',
        characters: ['杰克·舒利'],
        costume_by_character: {},
        props_carried_by_character: {},
        scene_props_base: []
      }
    ]
  }), {
    episodeIndex: 0,
    screenplay: 'INT. 市政火葬场 - NIGHT'
  });

  const parsed = parseResult(normalized);
  assert.deepEqual(parsed.episode_scene_asset_links[0].characters, ['jack_sully']);
  assert.equal(parsed.character_library[0].character_id, 'jack_sully');
  assert.equal(parsed.character_library[0].ai_prompt, 'Jake Sully, disabled marine veteran, determined gaze, cinematic portrait');
  assert.equal(parsed.character_library[0].image_prompt_portrait, 'Jake Sully, disabled marine veteran, determined gaze, cinematic portrait');
}

function testExtractAssetsScenePromptRepairAndPreserve() {
  const repaired = normalizePipelineStepOutput('extract-assets', JSON.stringify({
    character_library: [],
    costume_library: [],
    prop_library: [],
    scene_library: [
      {
        name: '市政火葬场',
        description: '冷白灯光打在金属台面上，空气湿冷，空间纵深清楚。',
        prompt: '市政火葬场'
      }
    ],
    episode_scene_asset_links: [
      {
        episode_id: 'E001',
        scene_id: 'E001_S01',
        scene_name: '市政火葬场',
        characters: [],
        costume_by_character: {},
        props_carried_by_character: {},
        scene_props_base: []
      }
    ]
  }), {
    episodeIndex: 0,
    screenplay: 'INT. 市政火葬场 - NIGHT'
  });
  const repairedParsed = parseResult(repaired);
  assert.match(repairedParsed.scene_library[0].prompt, /空间|材质|光|色调|湿/i);
  assert.notEqual(repairedParsed.scene_library[0].prompt, '市政火葬场');

  const validPrompt = '市政火葬场，空间边界稳定，金属台面与墙面旧锈痕清晰可见，冷白灯光切出硬质明暗层次，空气湿冷并带轻微反光，整体色调灰冷压抑。';
  const preserved = normalizePipelineStepOutput('extract-assets', JSON.stringify({
    character_library: [],
    costume_library: [],
    prop_library: [],
    scene_library: [
      {
        name: '市政火葬场',
        description: '冷白灯光打在金属台面上，空气湿冷，空间纵深清楚。',
        prompt: validPrompt
      }
    ],
    episode_scene_asset_links: [
      {
        episode_id: 'E001',
        scene_id: 'E001_S01',
        scene_name: '市政火葬场',
        characters: [],
        costume_by_character: {},
        props_carried_by_character: {},
        scene_props_base: []
      }
    ]
  }), {
    episodeIndex: 0,
    screenplay: 'INT. 市政火葬场 - NIGHT'
  });
  const preservedParsed = parseResult(preserved);
  assert.equal(preservedParsed.scene_library[0].prompt, validPrompt);
  assert.equal(preservedParsed.scene_library[0].scene_prompt, validPrompt);
  assert.equal(preservedParsed.scene_library[0].environment_prompt, validPrompt);
}

function testDesignCharactersCanonicalization() {
  const normalized = normalizePipelineStepOutput('design-characters', JSON.stringify({
    character_library: [
      {
        character_name: '杰克·舒利',
        pronouns: '他/他的',
        role: '主角',
        look: '轮椅使用者，肩上有纹身'
      }
    ],
    costume_library: [
      {
        costume_name: '医院病号服',
        description: '弗吉尼亚州医院的病号服',
        category: '现代地球服装'
      }
    ],
    character_costume_relationships: [
      {
        character_name: '杰克·舒利',
        costume_name: '医院病号服',
        relationship_type: 'default',
        notes: '默认造型'
      }
    ],
    character_costume_scenes: [
      {
        episode_id: 'E001',
        scene_id: 'E001S1',
        character_name: '杰克·舒利',
        costume_name: '医院病号服',
        scene_description: '医院病房'
      }
    ]
  }));

  const parsed = parseResult(normalized);
  assert.equal(parsed.character_library[0].character_id, 'character_01');
  assert.ok(parsed.character_library[0].image_prompt_portrait);
  assert.ok(parsed.costume_library[0].prompt_fullbody);
  assert.equal(parsed.character_costume_library[0].character_id, 'character_01');
  assert.equal(parsed.character_costume_episode_scene_library[0].scene_id, 'E001_S01');
}

function testDeterministicFallbackCanonicalShape() {
  const payload = buildDeterministicCharacterCostume({
    storyBible: {
      character_library: [
        { name: '杰克·舒利', role: '主角', look: '轮椅使用者' }
      ]
    },
    screenplays: {
      0: '杰克·舒利在医院里醒来。'
    }
  });
  const qc = validateCharacterCostumeAssets(payload);
  assert.equal(qc.pass, true, JSON.stringify(qc.errors));
}

testExtractAssetsCharacterSlugRepair();
testExtractAssetsScenePromptRepairAndPreserve();
testDesignCharactersCanonicalization();
testDeterministicFallbackCanonicalShape();

console.log('asset normalization checks passed');
