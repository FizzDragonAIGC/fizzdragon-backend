import {
  buildCharacterPortraitPrompt,
  buildCharacterTurnaroundPrompt,
  buildCostumeFullbodyPrompt,
  buildCostumePortraitPrompt
} from './character-costume-normalizer.js';

function slugify(value, prefix, index) {
  const ascii = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || `${prefix}_${String(index + 1).padStart(3, '0')}`;
}

function getStoryBibleCharacters(storyBible) {
  const raw = Array.isArray(storyBible?.characters)
    ? storyBible.characters
    : Array.isArray(storyBible?.character_library)
      ? storyBible.character_library
      : [];
  return raw.filter(Boolean);
}

function toEpisodeId(index) {
  return `E${String(index + 1).padStart(3, '0')}`;
}

export function shouldPreferDeterministicCharacterCostume(body) {
  const provider = String(body?.provider || '').toLowerCase();
  const screenplays = body?.screenplays;
  const screenplayCount = screenplays && typeof screenplays === 'object'
    ? Object.keys(screenplays).length
    : 0;
  return provider === 'dashscope' && screenplayCount >= 20;
}

export function buildDeterministicCharacterCostume(body) {
  const storyBibleCharacters = getStoryBibleCharacters(body?.storyBible);
  const screenplays = body?.screenplays && typeof body.screenplays === 'object'
    ? body.screenplays
    : {};

  const characterLibrary = storyBibleCharacters.map((character, index) => ({
    character_id: slugify(character?.name, 'character', index),
    name: character?.name || `角色${index + 1}`,
    aliases: Array.isArray(character?.aliases) ? character.aliases : [],
    pronouns: character?.pronouns || 'they/them',
    role: character?.role || character?.archetype || 'supporting character',
    base_look: character?.look || character?.appearance || character?.description || 'grounded distinctive appearance',
    image_prompt_portrait: buildCharacterPortraitPrompt({
      name: character?.name || `Character ${index + 1}`,
      role: character?.role || character?.archetype || 'supporting character',
      baseLook: character?.look || character?.appearance || character?.description || 'grounded distinctive appearance'
    }),
    image_prompt_turnaround: buildCharacterTurnaroundPrompt({
      name: character?.name || `Character ${index + 1}`,
      role: character?.role || character?.archetype || 'supporting character',
      baseLook: character?.look || character?.appearance || character?.description || 'grounded distinctive appearance'
    })
  }));

  const costumeLibrary = characterLibrary.map((character, index) => ({
    costume_id: `costume_${String(index + 1).padStart(3, '0')}`,
    name: `${character.name}默认造型`,
    category: 'default',
    components: `${character.name} signature layers`,
    materials_texture: 'practical mixed fabric with readable wear',
    condition_states: ['clean'],
    prompt_fullbody: buildCostumeFullbodyPrompt({
      costumeName: `${character.name} default costume`,
      category: 'default',
      components: `${character.name} signature layers`,
      materialsTexture: 'practical mixed fabric with readable wear'
    }),
    prompt_portrait: buildCostumePortraitPrompt({
      costumeName: `${character.name} default costume`,
      category: 'default',
      components: `${character.name} signature layers`,
      materialsTexture: 'practical mixed fabric with readable wear'
    }),
    continuity_notes: `${character.name} default deterministic fallback costume`
  }));

  const characterCostumeLibrary = characterLibrary.map((character, index) => ({
    character_id: character.character_id,
    costume_id: costumeLibrary[index]?.costume_id || 'costume_001',
    is_default: true,
    usage_tags: ['default'],
    fit_notes: 'deterministic fallback binding',
    props_bundle: []
  }));

  const characterCostumeEpisodeSceneLibrary = [];
  Object.entries(screenplays)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([episodeIndex, screenplay]) => {
      const epNumber = Number(episodeIndex);
      const epId = toEpisodeId(epNumber);
      const text = String(screenplay || '');
      const matchedCharacters = characterLibrary.filter((character) => text.includes(character.name));
      const usedCharacters = matchedCharacters.length ? matchedCharacters.slice(0, 4) : characterLibrary.slice(0, 2);

      usedCharacters.forEach((character, sceneOffset) => {
        const costume = characterCostumeLibrary.find((item) => item.character_id === character.character_id);
        characterCostumeEpisodeSceneLibrary.push({
          episode_id: epId,
          scene_id: `${epId}_S${String(sceneOffset + 1).padStart(2, '0')}`,
          slugline: `${character.name} fallback scene`,
          character_id: character.character_id,
          costume_id: costume?.costume_id || 'costume_001',
          continuity_delta: '',
          must_match: true,
          notes: 'deterministic fallback'
        });
      });
    });

  return {
    costume_library: costumeLibrary,
    character_library: characterLibrary,
    character_costume_library: characterCostumeLibrary,
    character_costume_episode_scene_library: characterCostumeEpisodeSceneLibrary
  };
}
