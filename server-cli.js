import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const MODEL = 'claude-sonnet-4-20250514';

// 用claude CLI调用API
async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const claude = spawn('claude', ['-p', prompt, '--output-format', 'text'], {
      env: { ...process.env, HOME: '/home/beerbear' }
    });
    
    claude.stdout.on('data', (data) => chunks.push(data));
    claude.stderr.on('data', (data) => console.error('[Claude stderr]', data.toString()));
    claude.on('close', (code) => {
      if (code === 0) {
        resolve(chunks.join(''));
      } else {
        reject(new Error(`Claude CLI exited with code ${code}`));
      }
    });
    claude.on('error', (err) => reject(err));
  });
}

// 解析JSON（从可能包含markdown的响应中）
function parseJSON(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonStr);
  }
  throw new Error('无法解析JSON');
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL, mode: 'claude-cli', hasToken: true, hasApiKey: true });
});

// 採訪Agent
app.post('/api/interview', async (req, res) => {
  try {
    const { novel, title, content } = req.body;
    const text = novel || content;
    if (!text) return res.status(400).json({ error: '缺少小說內容' });

    console.log(`[採訪Agent] 分析中... ${title || '未命名'} (${text.length}字)`);
    
    const prompt = `你是專業編劇顧問。分析這部小說，返回JSON：
{"title":"","genre":"","era":"","characters":[{"name":"","role":"主角/配角","trait":""}],"places":[{"name":"","significance":""}],"core_conflict":"","themes":[],"interview_questions":["問題1","問題2"]}

【小說】${title || '未命名'}
${text.substring(0, 8000)}`;
    
    const result = await callClaude(prompt);
    const json = parseJSON(result);
    console.log(`[採訪Agent] 完成!`);
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
    
    const prompt = `你是專業編劇，生成高概念分析。返回JSON：
{"logline":"一句話故事","genre":"類型","tone":"基調","target_audience":"受眾","unique_selling_point":"賣點","comparable_works":["參考作品"]}

【輸入】
${JSON.stringify({ analysis, interview, title, genre, logline }, null, 2)}`;
    
    const result = await callClaude(prompt);
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
    const { novel, concept, title } = req.body;
    console.log('[章節Agent] 分析中...');
    
    const prompt = `分析小說章節結構，返回JSON：
{"totalChapters":10,"chapters":[{"id":1,"title":"","summary":"","key_events":[],"characters":[]}]}

【小說】${title || ''}
${(novel || '').substring(0, 10000)}`;
    
    const result = await callClaude(prompt);
    const json = parseJSON(result);
    console.log(`[章節Agent] 完成!`);
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
    
    const prompt = `設計角色視覺，返回JSON：
{"main":[{"name":"","age":"","appearance":"","costume":"","personality":""}],"supporting":[]}

【輸入】${JSON.stringify({ concept, chapters })}`;
    
    const result = await callClaude(prompt);
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
    
    const prompt = `設計美術風格，返回JSON：
{"style":"","color_palette":[],"scenes":[{"name":"","description":""}],"costumes":[]}

【輸入】${JSON.stringify({ concept, chapters, characters })}`;
    
    const result = await callClaude(prompt);
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
    
    const prompt = `改編章節為劇本，返回JSON：
{"chapter_id":1,"scenes":[{"id":1,"location":"","time":"","characters":[],"action":"","dialogue":[{"character":"","line":""}]}]}

【章節】${JSON.stringify(chapter)}`;
    
    const result = await callClaude(prompt);
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
    
    const prompt = `生成分鏡，返回JSON：
{"scene_id":1,"shots":[{"id":1,"type":"特寫/中景/遠景","angle":"","description":"","characters":[],"dialogue":"","duration":3,"prompt":"AI繪圖prompt"}]}

【場景】${JSON.stringify(scene)}`;
    
    const result = await callClaude(prompt);
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
║   Mode: Claude CLI                            ║
║   Port: ${PORT}                                   ║
║   Endpoints: 7 agents + health                ║
╚═══════════════════════════════════════════════╝
  `);
});
