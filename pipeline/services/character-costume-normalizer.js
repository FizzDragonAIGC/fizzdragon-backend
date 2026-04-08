const SLUG_RE = /^[a-z0-9_]+$/;
const EPISODE_ID_RE = /^E\d{3}$/;
const SCENE_ID_RE = /^E\d{3}_S\d{2}$/;

function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${text(key)}: ${text(item)}`.trim())
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean);
  }
  return text(value)
    .split(/[,\n/，、；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStructured(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function arrayValue(value) {
  const parsed = parseStructured(value);
  return Array.isArray(parsed) ? parsed : [];
}

function objectValue(value) {
  const parsed = parseStructured(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function toLegacyLibraryArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([legacyId, row]) => ({
    ...(row && typeof row === 'object' ? row : {}),
    _legacyId: legacyId
  }));
}

function slugifyId(value, fallbackPrefix = 'asset', index = 0) {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `${fallbackPrefix}_${String(index + 1).padStart(2, '0')}`;
}

function humanizeSlug(value, fallback = '') {
  const normalized = text(value);
  if (!normalized) return fallback;
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}

function normalizeEpisodeId(value, index = 0) {
  const normalized = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (EPISODE_ID_RE.test(normalized)) return normalized;
  return `E${String(index + 1).padStart(3, '0')}`;
}

function normalizeSceneId(value, episodeId = 'E001', index = 0) {
  const normalized = text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (SCENE_ID_RE.test(normalized)) return normalized;
  return `${episodeId}_S${String(index + 1).padStart(2, '0')}`;
}

function normalizePronounMap(characterPronouns = {}) {
  if (!characterPronouns || typeof characterPronouns !== 'object') {
    return new Map();
  }
  return new Map(
    Object.entries(characterPronouns)
      .map(([name, pronouns]) => [text(name).toLowerCase(), text(pronouns)])
      .filter(([name, pronouns]) => name && pronouns)
  );
}

function normalizePronouns(value, fallback = 'they/them') {
  const normalized = text(value);
  return normalized || fallback;
}

function englishPhrase(value, fallback) {
  const normalized = text(value);
  return normalized || fallback;
}

export function buildCharacterPortraitPrompt({ name = '', role = '', baseLook = '' } = {}) {
  return [
    englishPhrase(name, 'character'),
    englishPhrase(role, 'dramatic protagonist'),
    englishPhrase(baseLook, 'distinctive grounded appearance'),
    'live-action realistic cinematic suspense portrait',
    'natural skin texture',
    'grounded lighting',
    'high detail'
  ].join(', ');
}

export function buildCharacterTurnaroundPrompt({ name = '', role = '', baseLook = '' } = {}) {
  return [
    englishPhrase(name, 'character'),
    englishPhrase(role, 'dramatic protagonist'),
    englishPhrase(baseLook, 'distinctive grounded appearance'),
    'full-body turnaround sheet',
    'front side back views',
    'live-action realistic cinematic suspense',
    'studio-neutral lighting',
    'high detail'
  ].join(', ');
}

export function buildCostumeFullbodyPrompt({ costumeName = '', category = '', components = '', materialsTexture = '' } = {}) {
  return [
    englishPhrase(costumeName, 'costume'),
    englishPhrase(category, 'screen costume'),
    englishPhrase(components, 'layered garment components'),
    englishPhrase(materialsTexture, 'readable material texture'),
    'full-body costume concept',
    'live-action realistic cinematic suspense',
    'studio-neutral lighting',
    'high detail'
  ].join(', ');
}

export function buildCostumePortraitPrompt({ costumeName = '', category = '', components = '', materialsTexture = '' } = {}) {
  return [
    englishPhrase(costumeName, 'costume'),
    englishPhrase(category, 'screen costume'),
    englishPhrase(components, 'layered garment components'),
    englishPhrase(materialsTexture, 'readable material texture'),
    'portrait costume detail study',
    'live-action realistic cinematic suspense',
    'close-up textile detail',
    'high detail'
  ].join(', ');
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function coerceBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = text(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function ensureUniqueId(baseId, seen, fallbackPrefix, index) {
  const initial = slugifyId(baseId, fallbackPrefix, index);
  if (!seen.has(initial)) {
    seen.add(initial);
    return initial;
  }
  let suffix = 2;
  while (seen.has(`${initial}_${suffix}`)) {
    suffix += 1;
  }
  const uniqueId = `${initial}_${suffix}`;
  seen.add(uniqueId);
  return uniqueId;
}

export function coerceCharacterCostumeAssets(data, body = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const pronounMap = normalizePronounMap(body?.characterPronouns || body?.storyBible?.characterPronouns);
  const characterLibrary = [];
  const costumeLibrary = [];
  const characterIdSet = new Set();
  const costumeIdSet = new Set();
  const characterByName = new Map();
  const characterById = new Map();
  const costumeByName = new Map();
  const costumeById = new Map();

  const registerCharacter = (row = {}, index = characterLibrary.length) => {
    const explicitName = text(row?.name || row?.character_name || row?.characterName);
    const characterId = ensureUniqueId(
      row?.character_id || row?.characterId || row?._legacyId || explicitName,
      characterIdSet,
      'character',
      index
    );
    const name = explicitName || humanizeSlug(characterId, `Character ${index + 1}`);
    const pronouns = normalizePronouns(pronounMap.get(name.toLowerCase()) || row?.pronouns || row?.pronoun);
    const role = text(row?.role || row?.archetype || row?.type) || 'supporting character';
    const baseLook = text(row?.base_look || row?.look || row?.appearance || row?.description) || 'grounded distinctive features';
    const character = {
      character_id: characterId,
      name,
      pronouns,
      role,
      base_look: baseLook,
      image_prompt_portrait: text(row?.image_prompt_portrait || row?.imagePromptPortrait)
        || buildCharacterPortraitPrompt({ name, role, baseLook }),
      image_prompt_turnaround: text(row?.image_prompt_turnaround || row?.imagePromptTurnaround)
        || buildCharacterTurnaroundPrompt({ name, role, baseLook })
    };
    characterLibrary.push(character);
    characterById.set(character.character_id, character);
    characterByName.set(character.name.toLowerCase(), character);
    return character;
  };

  const registerCostume = (row = {}, index = costumeLibrary.length) => {
    const explicitName = text(row?.name || row?.costume_name || row?.costumeName);
    const costumeId = ensureUniqueId(
      row?.costume_id || row?.costumeId || row?._legacyId || explicitName,
      costumeIdSet,
      'costume',
      index
    );
    const name = explicitName || humanizeSlug(costumeId, `Costume ${index + 1}`);
    const category = text(row?.category || row?.type) || 'default';
    const components = text(row?.components || row?.key_visual_elements || row?.description) || 'core garment set';
    const materialsTexture = text(row?.materials_texture || row?.materialsTexture || row?.description) || 'mixed practical materials';
    const costume = {
      costume_id: costumeId,
      name,
      category,
      components,
      materials_texture: materialsTexture,
      condition_states: uniqueArray(splitList(row?.condition_states || row?.conditionStates || ['clean'])).length
        ? uniqueArray(splitList(row?.condition_states || row?.conditionStates || ['clean']))
        : ['clean'],
      prompt_fullbody: text(row?.prompt_fullbody || row?.promptFullbody)
        || buildCostumeFullbodyPrompt({ costumeName: name, category, components, materialsTexture }),
      prompt_portrait: text(row?.prompt_portrait || row?.promptPortrait)
        || buildCostumePortraitPrompt({ costumeName: name, category, components, materialsTexture }),
      continuity_notes: text(row?.continuity_notes || row?.continuityNotes || row?.notes || row?.typical_scenes || row?.description)
    };
    costumeLibrary.push(costume);
    costumeById.set(costume.costume_id, costume);
    costumeByName.set(costume.name.toLowerCase(), costume);
    return costume;
  };

  toLegacyLibraryArray(data.character_library).forEach((row, index) => {
    registerCharacter(row, index);
  });
  toLegacyLibraryArray(data.costume_library).forEach((row, index) => {
    registerCostume(row, index);
  });

  const resolveCharacter = (ref, nameHint = '') => {
    const refText = text(ref);
    const nameText = text(nameHint);
    const slug = slugifyId(refText || nameText, 'character', characterLibrary.length);
    if (characterById.has(refText)) return characterById.get(refText);
    if (characterById.has(slug)) return characterById.get(slug);
    if (nameText && characterByName.has(nameText.toLowerCase())) return characterByName.get(nameText.toLowerCase());
    if (refText && characterByName.has(refText.toLowerCase())) return characterByName.get(refText.toLowerCase());
    return registerCharacter({
      character_id: refText || slug,
      name: nameText || (refText && !SLUG_RE.test(refText) ? refText : humanizeSlug(slug, `Character ${characterLibrary.length + 1}`))
    }, characterLibrary.length);
  };

  const resolveCostume = (ref, nameHint = '') => {
    const refText = text(ref);
    const nameText = text(nameHint);
    const slug = slugifyId(refText || nameText, 'costume', costumeLibrary.length);
    if (costumeById.has(refText)) return costumeById.get(refText);
    if (costumeById.has(slug)) return costumeById.get(slug);
    if (nameText && costumeByName.has(nameText.toLowerCase())) return costumeByName.get(nameText.toLowerCase());
    if (refText && costumeByName.has(refText.toLowerCase())) return costumeByName.get(refText.toLowerCase());
    return registerCostume({
      costume_id: refText || slug,
      name: nameText || (refText && !SLUG_RE.test(refText) ? refText : humanizeSlug(slug, `Costume ${costumeLibrary.length + 1}`))
    }, costumeLibrary.length);
  };

  const relationshipSource = toLegacyLibraryArray(
    Array.isArray(data.character_costume_library) ? data.character_costume_library : data.character_costume_relationships
  );
  const sceneSource = toLegacyLibraryArray(
    Array.isArray(data.character_costume_episode_scene_library) ? data.character_costume_episode_scene_library : data.character_costume_scenes
  );

  const characterCostumeLibrary = relationshipSource.map((row, index) => {
    const character = resolveCharacter(row?.character_id || row?.characterId || row?.character_name || row?.characterName, row?.character_name || row?.characterName);
    const costume = resolveCostume(row?.costume_id || row?.costumeId || row?.costume_name || row?.costumeName, row?.costume_name || row?.costumeName);
    return {
      character_id: character.character_id,
      costume_id: costume.costume_id,
      is_default: coerceBoolean(row?.is_default, false),
      usage_tags: uniqueArray(splitList(row?.usage_tags || row?.usageTags || row?.relationship_type)),
      fit_notes: text(row?.fit_notes || row?.fitNotes || row?.notes || row?.relationship_description),
      props_bundle: uniqueArray(splitList(row?.props_bundle || row?.propsBundle))
    };
  }).filter((row) => row.character_id && row.costume_id);

  const relationKeySet = new Set(characterCostumeLibrary.map((row) => `${row.character_id}::${row.costume_id}`));
  const characterCostumeEpisodeSceneLibrary = sceneSource.map((row, index) => {
    const episodeId = normalizeEpisodeId(row?.episode_id || row?.episodeId, index);
    const character = resolveCharacter(row?.character_id || row?.characterId || row?.character_name || row?.characterName, row?.character_name || row?.characterName);
    const costume = resolveCostume(row?.costume_id || row?.costumeId || row?.costume_name || row?.costumeName, row?.costume_name || row?.costumeName);
    const pairKey = `${character.character_id}::${costume.costume_id}`;
    if (!relationKeySet.has(pairKey)) {
      relationKeySet.add(pairKey);
      characterCostumeLibrary.push({
        character_id: character.character_id,
        costume_id: costume.costume_id,
        is_default: false,
        usage_tags: [],
        fit_notes: '',
        props_bundle: []
      });
    }
    return {
      episode_id: episodeId,
      scene_id: normalizeSceneId(row?.scene_id || row?.sceneId, episodeId, index),
      slugline: text(row?.slugline || row?.scene_description || row?.sceneDescription || row?.notes || `${character.name} scene`),
      character_id: character.character_id,
      costume_id: costume.costume_id,
      continuity_delta: text(row?.continuity_delta || row?.continuityDelta),
      must_match: coerceBoolean(row?.must_match, true),
      notes: text(row?.notes || row?.scene_description || row?.sceneDescription)
    };
  }).filter((row) => row.character_id && row.costume_id);

  const defaultSeen = new Set();
  for (const row of characterCostumeLibrary) {
    if (row.is_default) {
      defaultSeen.add(row.character_id);
    }
  }
  for (const row of characterCostumeLibrary) {
    if (defaultSeen.has(row.character_id)) continue;
    row.is_default = true;
    defaultSeen.add(row.character_id);
  }

  return {
    costume_library: costumeLibrary,
    character_library: characterLibrary,
    character_costume_library: characterCostumeLibrary,
    character_costume_episode_scene_library: characterCostumeEpisodeSceneLibrary
  };
}

export function validateCharacterCostumeAssets(data) {
  const errors = [];
  const requiredTop = [
    'costume_library',
    'character_library',
    'character_costume_library',
    'character_costume_episode_scene_library'
  ];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      pass: false,
      errors: [{ message: 'character_costume output must be a JSON object with 4 libraries', location: 'root' }],
      warnings: []
    };
  }

  for (const key of requiredTop) {
    if (!Array.isArray(data[key])) {
      errors.push({ message: `Missing required top-level array: ${key}`, location: key });
    }
  }

  const characterIds = new Set();
  const costumeIds = new Set();

  (Array.isArray(data.character_library) ? data.character_library : []).forEach((row, index) => {
    const location = `character_library[${index}]`;
    if (!SLUG_RE.test(text(row?.character_id))) {
      errors.push({ message: 'character_id must be lowercase slug', location: `${location}.character_id` });
    }
    if (!text(row?.name)) errors.push({ message: 'name is required', location: `${location}.name` });
    if (!text(row?.pronouns)) errors.push({ message: 'pronouns is required', location: `${location}.pronouns` });
    if (!text(row?.role)) errors.push({ message: 'role is required', location: `${location}.role` });
    if (!text(row?.base_look)) errors.push({ message: 'base_look is required', location: `${location}.base_look` });
    if (!text(row?.image_prompt_portrait)) errors.push({ message: 'image_prompt_portrait is required', location: `${location}.image_prompt_portrait` });
    if (!text(row?.image_prompt_turnaround)) errors.push({ message: 'image_prompt_turnaround is required', location: `${location}.image_prompt_turnaround` });
    if (text(row?.character_id)) characterIds.add(text(row.character_id));
  });

  (Array.isArray(data.costume_library) ? data.costume_library : []).forEach((row, index) => {
    const location = `costume_library[${index}]`;
    if (!SLUG_RE.test(text(row?.costume_id))) {
      errors.push({ message: 'costume_id must be lowercase slug', location: `${location}.costume_id` });
    }
    if (!text(row?.name)) errors.push({ message: 'name is required', location: `${location}.name` });
    if (!text(row?.category)) errors.push({ message: 'category is required', location: `${location}.category` });
    if (!text(row?.components)) errors.push({ message: 'components is required', location: `${location}.components` });
    if (!text(row?.materials_texture)) errors.push({ message: 'materials_texture is required', location: `${location}.materials_texture` });
    if (!Array.isArray(row?.condition_states)) errors.push({ message: 'condition_states must be an array', location: `${location}.condition_states` });
    if (!text(row?.prompt_fullbody)) errors.push({ message: 'prompt_fullbody is required', location: `${location}.prompt_fullbody` });
    if (!text(row?.prompt_portrait)) errors.push({ message: 'prompt_portrait is required', location: `${location}.prompt_portrait` });
    if (text(row?.costume_id)) costumeIds.add(text(row.costume_id));
  });

  (Array.isArray(data.character_costume_library) ? data.character_costume_library : []).forEach((row, index) => {
    const location = `character_costume_library[${index}]`;
    if (!characterIds.has(text(row?.character_id))) {
      errors.push({ message: `Unknown character_id referenced: ${row?.character_id || ''}`, location: `${location}.character_id` });
    }
    if (!costumeIds.has(text(row?.costume_id))) {
      errors.push({ message: `Unknown costume_id referenced: ${row?.costume_id || ''}`, location: `${location}.costume_id` });
    }
    if (typeof row?.is_default !== 'boolean') {
      errors.push({ message: 'is_default must be boolean', location: `${location}.is_default` });
    }
    if (!Array.isArray(row?.usage_tags)) {
      errors.push({ message: 'usage_tags must be an array', location: `${location}.usage_tags` });
    }
    if (!Array.isArray(row?.props_bundle)) {
      errors.push({ message: 'props_bundle must be an array', location: `${location}.props_bundle` });
    }
  });

  (Array.isArray(data.character_costume_episode_scene_library) ? data.character_costume_episode_scene_library : []).forEach((row, index) => {
    const location = `character_costume_episode_scene_library[${index}]`;
    if (!EPISODE_ID_RE.test(text(row?.episode_id).toUpperCase())) {
      errors.push({ message: 'episode_id must be E###', location: `${location}.episode_id` });
    }
    if (!SCENE_ID_RE.test(text(row?.scene_id).toUpperCase())) {
      errors.push({ message: 'scene_id must be E###_S##', location: `${location}.scene_id` });
    }
    if (!text(row?.slugline)) errors.push({ message: 'slugline is required', location: `${location}.slugline` });
    if (!characterIds.has(text(row?.character_id))) {
      errors.push({ message: `Unknown character_id referenced: ${row?.character_id || ''}`, location: `${location}.character_id` });
    }
    if (!costumeIds.has(text(row?.costume_id))) {
      errors.push({ message: `Unknown costume_id referenced: ${row?.costume_id || ''}`, location: `${location}.costume_id` });
    }
    if (typeof row?.must_match !== 'boolean') {
      errors.push({ message: 'must_match must be boolean', location: `${location}.must_match` });
    }
  });

  return { pass: errors.length === 0, errors, warnings: [] };
}
