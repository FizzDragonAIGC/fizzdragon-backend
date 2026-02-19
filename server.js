import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Claude client - 支持 API Key 或 OAuth Token (Claude Max)
// 優先級：CLAUDE_CODE_OAUTH_TOKEN > ANTHROPIC_API_KEY
const apiKey = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('❌ 請設置 CLAUDE_CODE_OAUTH_TOKEN 或 ANTHROPIC_API_KEY 環境變量');
  console.log('💡 Claude Max 用戶：運行 "claude /login" 獲取 OAuth Token');
  console.log('💡 API 用戶：在 console.anthropic.com 獲取 API Key');
}

const anthropic = new Anthropic({
  apiKey: apiKey
});

console.log(`🔐 認證方式: ${process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'OAuth Token (Claude Max)' : 'API Key'}`);

const MODEL = 'claude-sonnet-4-20250514';

// ==================== Agent Prompts ====================

const AGENT_PROMPTS = {
  interview: (novel, title) => `你是專業編劇顧問，正在深度閱讀一部小說，準備進行創意訪談。

【小說】${title}（${Math.round(novel.length/10000*10)/10}萬字）

【內容摘要】
${novel.substring(0, 6000)}
${novel.length > 12000 ? '\n...[中間省略]...\n' + novel.substring(novel.length - 3000) : ''}

請分析這部小說，返回JSON：
{
  "title": "作品名",
  "genre": "類型",
  "era": "時代背景",
  "characters": [
    {"name": "角色名", "role": "主角/配角/反派", "trait": "核心特質"}
  ],
  "places": [
    {"name": "地點名", "significance": "對劇情的意義"}
  ],
  "core_conflict": "一句話核心衝突",
  "themes": ["主題1", "主題2"],
  "interview_questions": [
    "基於具體劇情的針對性問題1（例：為什麼主角選擇...）",
    "基於具體劇情的針對性問題2",
    "基於具體劇情的針對性問題3",
    "基於具體劇情的針對性問題4",
    "基於具體劇情的針對性問題5",
    "基於具體劇情的針對性問題6",
    "基於具體劇情的針對性問題7",
    "基於具體劇情的針對性問題8"
  ]
}

注意：interview_questions必須針對具體劇情，不要問通用問題。`,

  concept: (analysis, interview) => `你是專業編劇，請生成高概念分析。

【AI分析摘要】
${JSON.stringify(analysis, null, 2)}

【導演訪談回答】
${JSON.stringify(interview, null, 2)}

請返回JSON：
{
  "logline": "一句話故事（主角+行動+對手+風險，30-50字）",
  "genre": "類型（如：歷史冒險/懸疑/奇幻）",
  "theme": "核心主題",
  "audience": "目標受眾",
  "era": "時代背景",
  "tone": "基調（熱血/溫情/黑暗/幽默）",
  "hooks": ["賣點1", "賣點2", "賣點3"],
  "comparable": "對標作品（如：東方版《XXX》）"
}`,

  chapters: (novel, title, concept) => `你是專業編劇，請分析小說的章節結構。

【作品】${title}
【Logline】${concept?.logline || ''}
【類型】${concept?.genre || ''}

【小說內容】
${novel.substring(0, 15000)}
${novel.length > 15000 ? '\n...[後續省略]...' : ''}

請分析章節結構，返回JSON：
{
  "chapters": [
    {
      "id": 1,
      "title": "章節標題",
      "summary": "50字內容摘要",
      "phase": "敘事階段（開篇/鋪墊/發展/高潮/收束/結局）",
      "emotion": "情緒基調",
      "hook": "章末鉤子（讓觀眾想看下一集的懸念）",
      "estimatedShots": 80,
      "keyScenes": ["關鍵場景1", "關鍵場景2"]
    }
  ],
  "totalChapters": 10,
  "actStructure": {
    "act1": [1,2],
    "act2a": [3,4,5],
    "act2b": [6,7],
    "act3": [8,9,10]
  }
}`,

  characters: (analysis, concept, interview) => `你是角色設計專家，請基於Lajos Egri三維角色理論設計人物。

【AI分析】
${JSON.stringify(analysis, null, 2)}

【高概念】
${JSON.stringify(concept, null, 2)}

【導演訪談】
${JSON.stringify(interview, null, 2)}

請設計角色，返回JSON：
{
  "main": [
    {
      "name": "角色名",
      "role": "主角",
      "physiology": {"age": 25, "gender": "男", "appearance": "外貌描述"},
      "sociology": {"occupation": "職業", "class": "階層", "relationships": "社會關係"},
      "psychology": {"want": "表面慾望", "need": "深層需要", "wound": "心理創傷", "arc": "成長弧線"},
      "keyTraits": ["特點1", "特點2"],
      "voiceStyle": "說話風格"
    }
  ],
  "supporting": [
    {
      "name": "配角名",
      "role": "配角/反派/導師",
      "function": "敘事功能",
      "relationToProtag": "與主角關係",
      "keyTraits": ["特點"],
      "physiology": {"age": 30, "appearance": "簡述"}
    }
  ]
}`,

  design: (characters, concept, analysis) => `你是美術指導，請設計服化道和場景。

【類型】${concept?.genre || ''}
【時代】${concept?.era || ''}
【角色】${JSON.stringify(characters, null, 2)}
【場景】${JSON.stringify(analysis?.places, null, 2)}

請返回JSON：
{
  "visualStyle": {
    "tone": "整體視覺基調",
    "colorPalette": "主色調方案",
    "reference": "參考作品"
  },
  "scenes": [
    {
      "name": "場景名",
      "icon": "emoji",
      "brief": "一句話描述",
      "structure": "空間結構",
      "lighting": "光線設計",
      "atmosphere": "氛圍色調",
      "props": ["道具1", "道具2"]
    }
  ],
  "costumes": [
    {
      "character": "角色名",
      "description": "服裝描述",
      "colorScheme": "配色"
    }
  ],
  "keyProps": [
    {
      "name": "道具名",
      "description": "外觀+功能描述",
      "significance": "敘事意義"
    }
  ]
}`,

  script: (chapter, characters, concept) => `你是專業編劇，請將小說章節改編為劇本格式。

【類型】${concept?.genre || ''}
【角色】${characters?.main?.map(c=>c.name).join('、') || ''}

【章節內容】
${chapter.content?.substring(0, 8000) || chapter.summary || ''}

請返回JSON：
{
  "chapter": ${chapter.id || 1},
  "title": "${chapter.title || ''}",
  "scenes": [
    {
      "heading": "INT./EXT. 場景 - 時間",
      "action": "場景描述（視覺化的動作描寫）",
      "beats": [
        {"type": "action", "content": "動作描述"},
        {"type": "dialogue", "character": "角色名", "parenthetical": "表演指示", "line": "台詞"}
      ],
      "transition": "CUT TO"
    }
  ]
}`,

  storyboard: (script, characters, visualStyle) => `你是分鏡師+AI繪圖專家，請為劇本生成分鏡表。

【視覺風格】${visualStyle?.tone || ''}
【角色】${characters?.main?.map(c=>c.name).join('、') || ''}

【劇本】
${JSON.stringify(script?.scenes?.slice(0,3), null, 2)}

請為前10個鏡頭返回JSON：
{
  "shots": [
    {
      "id": 1,
      "scene": "場景名",
      "shotSize": "遠景/全景/中景/近景/特寫",
      "angle": "平視/俯拍/仰拍",
      "movement": "固定/推/拉/搖/移/跟",
      "duration": 6,
      "description": "鏡頭內容描述",
      "subject": "主體",
      "emotion": "情緒氛圍",
      "aiPrompt": "Midjourney Prompt（英文，包含風格、光線、構圖）--ar 16:9"
    }
  ]
}`
};

// ==================== API Endpoints ====================

// 採訪Agent
app.post('/api/interview', async (req, res) => {
  try {
    const { novel, title } = req.body;
    if (!novel) return res.status(400).json({ error: '缺少小說內容' });

    console.log(`[採訪Agent] 分析中... ${title || '未命名'} (${novel.length}字)`);
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.interview(novel, title || '未命名')
      }]
    });

    const text = message.content[0].text;
    const json = extractJSON(text);
    
    console.log(`[採訪Agent] 完成! 識別角色: ${json.characters?.length || 0}`);
    res.json(json);
  } catch (err) {
    console.error('[採訪Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 高概念Agent
app.post('/api/concept', async (req, res) => {
  try {
    const { analysis, interview } = req.body;
    
    console.log('[高概念Agent] 生成中...');
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.concept(analysis, interview)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[高概念Agent] 完成! Logline: ${json.logline?.substring(0,30)}...`);
    res.json(json);
  } catch (err) {
    console.error('[高概念Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 章節Agent
app.post('/api/chapters', async (req, res) => {
  try {
    const { novel, title, concept } = req.body;
    
    console.log('[章節Agent] 分析中...');
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.chapters(novel, title, concept)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[章節Agent] 完成! 章節數: ${json.chapters?.length || json.totalChapters}`);
    res.json(json);
  } catch (err) {
    console.error('[章節Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 角色Agent
app.post('/api/characters', async (req, res) => {
  try {
    const { analysis, concept, interview } = req.body;
    
    console.log('[角色Agent] 設計中...');
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.characters(analysis, concept, interview)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[角色Agent] 完成! 主角: ${json.main?.length}, 配角: ${json.supporting?.length}`);
    res.json(json);
  } catch (err) {
    console.error('[角色Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 美術Agent
app.post('/api/design', async (req, res) => {
  try {
    const { characters, concept, analysis } = req.body;
    
    console.log('[美術Agent] 設計中...');
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.design(characters, concept, analysis)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[美術Agent] 完成! 場景: ${json.scenes?.length}, 服裝: ${json.costumes?.length}`);
    res.json(json);
  } catch (err) {
    console.error('[美術Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 編劇Agent
app.post('/api/script', async (req, res) => {
  try {
    const { chapter, characters, concept } = req.body;
    
    console.log(`[編劇Agent] 改編第${chapter.id}章...`);
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.script(chapter, characters, concept)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[編劇Agent] 完成! 場景數: ${json.scenes?.length}`);
    res.json(json);
  } catch (err) {
    console.error('[編劇Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 分鏡Agent
app.post('/api/storyboard', async (req, res) => {
  try {
    const { script, characters, visualStyle } = req.body;
    
    console.log('[分鏡Agent] 生成中...');
    
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: AGENT_PROMPTS.storyboard(script, characters, visualStyle)
      }]
    });

    const json = extractJSON(message.content[0].text);
    console.log(`[分鏡Agent] 完成! 鏡頭數: ${json.shots?.length}`);
    res.json(json);
  } catch (err) {
    console.error('[分鏡Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    model: MODEL,
    hasApiKey: !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
    authMode: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth' : (process.env.ANTHROPIC_API_KEY ? 'apikey' : 'none')
  });
});

// ==================== Utilities ====================

function extractJSON(text) {
  // 嘗試提取JSON
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                   text.match(/```\s*([\s\S]*?)\s*```/) ||
                   text.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr);
  }
  throw new Error('無法解析JSON');
}

// ==================== Start Server ====================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🎬 AI番劇工作台 Agent Server                ║
║   Model: ${MODEL}                    ║
║   Port: ${PORT}                                   ║
║   API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ 已配置' : '✗ 未配置'}                         ║
╚═══════════════════════════════════════════════╝
  `);
});
