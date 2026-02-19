/**
 * Moodboard API - 畫風測試與反推
 * 
 * 功能1: 生成測試圖 (需配置圖片生成API)
 * 功能2: 上傳圖片反推畫風 (使用Claude Vision)
 */

const fetch = require('node-fetch');

// ============== 配置 ==============
const IMAGE_PROVIDERS = {
  // Together.ai - 支持Flux (最便宜)
  together: {
    name: 'Together.ai (Flux)',
    baseUrl: 'https://api.together.xyz/v1/images/generations',
    model: 'black-forest-labs/FLUX.1-schnell-Free',
    getApiKey: () => process.env.TOGETHER_API_KEY
  },
  // OpenAI DALL-E
  dalle: {
    name: 'OpenAI DALL-E 3',
    baseUrl: 'https://api.openai.com/v1/images/generations',
    model: 'dall-e-3',
    getApiKey: () => process.env.OPENAI_API_KEY
  },
  // Replicate - 支持多种模型
  replicate: {
    name: 'Replicate',
    baseUrl: 'https://api.replicate.com/v1/predictions',
    model: 'stability-ai/sdxl',
    getApiKey: () => process.env.REPLICATE_API_TOKEN
  }
};

// 默認使用Together (免費Flux)
const DEFAULT_PROVIDER = 'together';

// ============== 生成測試圖 ==============
async function generateMoodboardImage(prompt, options = {}) {
  const provider = IMAGE_PROVIDERS[options.provider || DEFAULT_PROVIDER];
  const apiKey = provider.getApiKey();
  
  if (!apiKey) {
    throw new Error(`未配置 ${provider.name} API Key，請在 .env 中設置`);
  }
  
  console.log(`[Moodboard] 使用 ${provider.name} 生成測試圖...`);
  
  // Together.ai / Flux
  if (options.provider === 'together' || !options.provider) {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        prompt: prompt,
        width: options.width || 1024,
        height: options.height || 768,
        steps: options.steps || 4,
        n: 1
      })
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Together API error: ${err}`);
    }
    
    const data = await response.json();
    return {
      url: data.data?.[0]?.url || data.output?.[0],
      provider: provider.name,
      model: provider.model,
      prompt: prompt
    };
  }
  
  // DALL-E
  if (options.provider === 'dalle') {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        prompt: prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1
      })
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DALL-E API error: ${err}`);
    }
    
    const data = await response.json();
    return {
      url: data.data?.[0]?.url,
      provider: provider.name,
      model: provider.model,
      prompt: prompt
    };
  }
  
  throw new Error(`不支持的Provider: ${options.provider}`);
}

// ============== 圖片反推畫風 (Claude Vision) ==============
async function analyzeImageStyle(imageBase64, options = {}) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  
  // 優先用DeepSeek (便宜)，但需要確認是否支持Vision
  // Claude肯定支持Vision
  if (!anthropicKey) {
    throw new Error('圖片分析需要 ANTHROPIC_API_KEY (Claude Vision)');
  }
  
  console.log('[Moodboard] 使用 Claude Vision 分析圖片風格...');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',  // 用Haiku便宜
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageBase64.startsWith('data:') 
                ? imageBase64.split(';')[0].split(':')[1] 
                : 'image/jpeg',
              data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
            }
          },
          {
            type: 'text',
            text: `分析這張圖片的視覺風格，輸出JSON格式：

{
  "style_name": "風格名稱（如：新海誠風格、賽博朋克、水彩等）",
  "mood": "整體氛圍（如：溫暖、冷峻、夢幻等）",
  "color_palette": ["主色1", "主色2", "主色3"],
  "lighting": "光線特點",
  "texture": "質感特點",
  "composition": "構圖特點",
  "art_reference": "最接近的藝術家/作品/流派",
  "prompt_keywords": ["關鍵詞1", "關鍵詞2", ...],
  "full_prompt": "完整的AI繪圖Prompt（英文，可直接用於Midjourney/Stable Diffusion）"
}

只輸出JSON，不要解釋。`
          }
        ]
      }]
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude Vision error: ${err}`);
  }
  
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  
  try {
    // 清理JSON
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('[Moodboard] JSON解析失敗:', e);
    return { raw: text, error: 'JSON解析失敗' };
  }
}

// ============== Express路由 ==============
function setupMoodboardRoutes(app) {
  // 生成測試圖
  app.post('/api/moodboard/generate', async (req, res) => {
    try {
      const { prompt, provider, width, height } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: '缺少prompt' });
      }
      
      const result = await generateMoodboardImage(prompt, { provider, width, height });
      res.json(result);
    } catch (err) {
      console.error('[Moodboard] 生成失敗:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
  
  // 圖片反推
  app.post('/api/moodboard/analyze', async (req, res) => {
    try {
      const { image } = req.body;  // base64
      
      if (!image) {
        return res.status(400).json({ error: '缺少圖片數據' });
      }
      
      const result = await analyzeImageStyle(image);
      res.json(result);
    } catch (err) {
      console.error('[Moodboard] 分析失敗:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
  
  // 獲取可用的圖片生成服務
  app.get('/api/moodboard/providers', (req, res) => {
    const available = [];
    for (const [id, provider] of Object.entries(IMAGE_PROVIDERS)) {
      const hasKey = !!provider.getApiKey();
      available.push({
        id,
        name: provider.name,
        available: hasKey,
        model: provider.model
      });
    }
    res.json({ providers: available, default: DEFAULT_PROVIDER });
  });
  
  console.log('✅ Moodboard API 已啟用');
}

module.exports = { setupMoodboardRoutes, generateMoodboardImage, analyzeImageStyle };
