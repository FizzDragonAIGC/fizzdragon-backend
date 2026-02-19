import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// OpenClaw API配置
const OPENCLAW_URL = 'http://127.0.0.1:18789/v1/chat/completions';
const OPENCLAW_TOKEN = 'a6e87e79f0b77f8e315b3cd91f5679d3c86b819cd82d798d';

// 调用OpenClaw API
async function callClaude(prompt, systemPrompt = '') {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(OPENCLAW_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openclaw',
      messages: messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 解析JSON（从可能包含markdown的响应中）
function parseJSON(text) {
  // 尝试从markdown代码块中提取
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                    text.match(/```\s*([\s\S]*?)\s*```/) ||
                    text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr.trim());
  }
  throw new Error('无法解析JSON: ' + text.substring(0, 100));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'openclaw-api', 
    hasToken: true,
    hasApiKey: true
  });
});

// ==================== Agent Prompts ====================

const PROMPTS = {
  interview: (novel, title) => `你是專業編劇顧問，正在深度閱讀一部小說，準備進行創意訪談。

【小說】${title}（${Math.round(novel.length/10000*10)/10}萬字）

【內容摘要】
${novel.substring(0, 8000)}
${novel.length > 16000 ? '\n...[中間省略]...\n' + novel.substring(novel.length - 4000) : ''}

請分析這部小說，返回JSON（不要其他文字）：
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
    "基於具體劇情的針對性問題1",
    "基於具體劇情的針對性問題2"
  ]
}`,

  concept: (input) => `你是專業編劇，請生成高概念分析。

【輸入】
${JSON.stringify(input, null, 2)}

返回JSON（不要其他文字）：
{
  "logline": "一句話故事（主角+行動+對手+風險，30-50字）",
  "genre": "類型",
  "tone": "基調",
  "target_audience": "受眾",
  "unique_selling_point": "賣點",
  "comparable_works": ["參考作品1", "參考作品2"]
}`,

  chapters: (novel, title) => `分析小說章節結構。

【小說】${title}
${novel.substring(0, 15000)}

返回JSON（不要其他文字）：
{
  "totalChapters": 10,
  "chapters": [
    {"id": 1, "title": "章節標題", "summary": "摘要", "key_events": ["事件1"], "characters": ["角色1"]}
  ]
}`,

  characters: (input) => `設計角色視覺。

【輸入】${JSON.stringify(input)}

返回JSON（不要其他文字）：
{
  "main": [{"name": "", "age": "", "appearance": "", "costume": "", "personality": ""}],
  "supporting": []
}`,

  art: (input) => `設計美術風格。

【輸入】${JSON.stringify(input)}

返回JSON（不要其他文字）：
{
  "style": "整體美術風格",
  "color_palette": ["色彩1", "色彩2"],
  "scenes": [{"name": "場景名", "description": "描述"}],
  "costumes": [{"character": "角色", "description": "服裝描述"}]
}`,

  script: (chapter) => `改編章節為劇本。

【章節】${JSON.stringify(chapter)}

返回JSON（不要其他文字）：
{
  "chapter_id": 1,
  "scenes": [
    {"id": 1, "location": "地點", "time": "時間", "characters": [], "action": "動作描述", "dialogue": [{"character": "角色", "line": "台詞"}]}
  ]
}`,

  storyboard: (scene) => `生成分鏡。

【場景】${JSON.stringify(scene)}

返回JSON（不要其他文字）：
{
  "scene_id": 1,
  "shots": [
    {"id": 1, "type": "特寫/中景/遠景", "angle": "角度", "description": "畫面描述", "characters": [], "dialogue": "", "duration": 3, "prompt": "AI繪圖prompt（英文）"}
  ]
}`
};

// ==================== API Endpoints ====================

// 採訪Agent
app.post('/api/interview', async (req, res) => {
  try {
    const { novel, content, title } = req.body;
    const text = novel || content;
    if (!text) return res.status(400).json({ error: '缺少小說內容' });

    console.log(`[採訪Agent] 分析中... ${title || '未命名'} (${text.length}字)`);
    
    const result = await callClaude(PROMPTS.interview(text, title || '未命名'));
    const json = parseJSON(result);
    
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
    const { analysis, interview, title, genre, logline } = req.body;
    console.log('[高概念Agent] 生成中...');
    
    const result = await callClaude(PROMPTS.concept({ analysis, interview, title, genre, logline }));
    const json = parseJSON(result);
    
    console.log(`[高概念Agent] 完成!`);
    res.json(json);
  } catch (err) {
    console.error('[高概念Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 章節Agent
app.post('/api/chapters', async (req, res) => {
  try {
    const { novel, content, concept, title } = req.body;
    const text = novel || content;
    console.log('[章節Agent] 分析中...');
    
    const result = await callClaude(PROMPTS.chapters(text || '', title || ''));
    const json = parseJSON(result);
    
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
    const { concept, chapters } = req.body;
    console.log('[角色Agent] 設計中...');
    
    const result = await callClaude(PROMPTS.characters({ concept, chapters }));
    const json = parseJSON(result);
    
    console.log(`[角色Agent] 完成!`);
    res.json(json);
  } catch (err) {
    console.error('[角色Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 美術Agent
app.post('/api/art', async (req, res) => {
  try {
    const { concept, chapters, characters } = req.body;
    console.log('[美術Agent] 設計中...');
    
    const result = await callClaude(PROMPTS.art({ concept, chapters, characters }));
    const json = parseJSON(result);
    
    console.log(`[美術Agent] 完成!`);
    res.json(json);
  } catch (err) {
    console.error('[美術Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 編劇Agent
app.post('/api/script', async (req, res) => {
  try {
    const { chapter, novel, concept, characters } = req.body;
    console.log(`[編劇Agent] 改編第${chapter?.id || '?'}章...`);
    
    const result = await callClaude(PROMPTS.script(chapter));
    const json = parseJSON(result);
    
    console.log(`[編劇Agent] 完成!`);
    res.json(json);
  } catch (err) {
    console.error('[編劇Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 分鏡Agent
app.post('/api/storyboard', async (req, res) => {
  try {
    const { scene, characters, art } = req.body;
    console.log('[分鏡Agent] 生成中...');
    
    const result = await callClaude(PROMPTS.storyboard(scene));
    const json = parseJSON(result);
    
    console.log(`[分鏡Agent] 完成!`);
    res.json(json);
  } catch (err) {
    console.error('[分鏡Agent] 錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🎬 AI番劇工作台 Agent Server                ║
║   Mode: OpenClaw API                          ║
║   Port: ${PORT}                                   ║
║   Endpoints: 7 agents + health                ║
╚═══════════════════════════════════════════════╝
  `);
});
