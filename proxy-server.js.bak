// AI番劇工作台 - 30 Agents Server (Multi-Provider Mode)
// 支持: Anthropic Claude / DeepSeek / OpenRouter

import 'dotenv/config';  // 加载.env文件
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, spawn } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

// ========== 多Provider配置 ==========
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    models: {
      fast: 'claude-3-haiku-20240307',
      standard: 'claude-sonnet-4-20250514',
      best: 'claude-opus-4-20250514'
    },
    pricing: { input: 0.25/1000000, output: 1.25/1000000 }  // Haiku
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: {
      fast: 'deepseek-chat',
      standard: 'deepseek-chat',
      best: 'deepseek-reasoner'
    },
    pricing: { input: 0.014/1000000, output: 0.14/1000000 }  // 超便宜!
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: {
      fast: 'gemini-1.5-flash',
      standard: 'gemini-1.5-flash',
      best: 'gemini-1.5-pro'
    },
    pricing: { input: 0.075/1000000, output: 0.30/1000000 }  // Flash价格
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: {
      fast: 'deepseek/deepseek-chat',
      standard: 'anthropic/claude-3.5-sonnet',
      best: 'anthropic/claude-3-opus'
    },
    pricing: { input: 0.014/1000000, output: 0.14/1000000 }
  }
};

// 当前使用的Provider (可通过API切换)
let currentProvider = process.env.AI_PROVIDER || 'anthropic';
import { AGENTS, AGENT_GROUPS, STATS } from './agents-config.js';

// Skills目录路径
const SKILLS_DIR = '/home/beerbear/.openclaw/workspace/skills';

// 加载skill文件内容的缓存
const skillCache = new Map();

// 加载单个skill文件
function loadSkill(skillId) {
  if (skillCache.has(skillId)) {
    return skillCache.get(skillId);
  }
  
  const skillPath = join(SKILLS_DIR, `${skillId}.skill.md`);
  if (existsSync(skillPath)) {
    try {
      const content = readFileSync(skillPath, 'utf-8');
      // 只取核心内容，跳过过长的示例
      const trimmed = content.length > 3000 ? content.substring(0, 3000) + '\n...(更多方法论详见完整文档)' : content;
      skillCache.set(skillId, trimmed);
      return trimmed;
    } catch (e) {
      console.error(`Failed to load skill ${skillId}:`, e.message);
    }
  }
  return null;
}

// 动态配置 - maxSkills=5确保书籍方法论被加载
// 新增turbo模式：maxSkills=2, contentLimit=2000 更快
let runtimeConfig = { maxSkills: 5, contentLimit: 4000 };

// 模式預設
const MODE_PRESETS = {
  turbo: { maxSkills: 2, contentLimit: 2000 },  // 最快
  lite: { maxSkills: 3, contentLimit: 3000 },   // 快速
  standard: { maxSkills: 5, contentLimit: 4000 }, // 標準
  pro: { maxSkills: 5, contentLimit: 6000 }     // 專業
};

// 判断Agent是否需要JSON输出（劇本類Agent需要自然語言）
function needsJsonOutput(agentId) {
  // 這些Agent輸出自然語言（劇本、對話、描述）
  const naturalLanguageAgents = [
    'screenwriter',  // 編劇 - 輸出劇本
    'script',        // 劇本
    'dialogue',      // 對話
    'acting',        // 演技指導
    'interview',     // 訪談 - 輸出問題
  ];
  
  // 這些Agent需要JSON結構化輸出
  const jsonAgents = [
    'concept',       // 高概念
    'narrative',     // 章節規劃
    'chapters',      // 章節
    'character',     // 角色設計
    'artdirector',   // 美術總監
    'scene',         // 場景
    'costume',       // 服裝
    'storyboard',    // 分鏡
    'color',         // 色彩
    'artstyle',      // 畫風
    'prompt',        // Prompt生成
    'platform',      // 平台適配
    'vfx',           // 特效
    'lighting',      // 燈光
    'pose',          // 動作
    'expression',    // 表情
  ];
  
  if (naturalLanguageAgents.includes(agentId)) {
    return false;  // 自然語言
  }
  return true;  // 默認JSON
}

// 加载agent的所有skills内容（根据版本配置动态调整）
function loadAgentSkills(skillIds) {
  const maxSkills = runtimeConfig.maxSkills || 1;
  const loaded = [];
  const skills = skillIds.slice(0, maxSkills);
  
  for (const skillId of skills) {
    const content = loadSkill(skillId);
    if (content) {
      // 根据配置精简内容
      const limit = maxSkills === 1 ? 400 : maxSkills === 2 ? 600 : 800;
      const shortened = content.length > limit ? content.substring(0, limit) + '...' : content;
      loaded.push(`[${skillId}]: ${shortened}`);
    }
  }
  
  return loaded.join('\n');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取.env文件
try {
  const envPath = join(__dirname, '.env');
  if (existsSync(envPath)) {
    const envFile = readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    });
    console.log('Loaded .env file');
  }
} catch (e) {
  console.log('No .env file found');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..')));

const PORT = process.env.PORT || 3001;

// 通过OpenClaw CLI调用Claude
async function callViaOpenClaw(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}\n\n---\n\n请直接输出结果，不要额外解释。`;
    
    // 写入临时文件
    const tmpFile = `/tmp/agent-prompt-${Date.now()}.txt`;
    writeFileSync(tmpFile, fullPrompt);
    
    try {
      // 使用openclaw的chat功能（非交互模式）
      const result = execSync(`cat "${tmpFile}" | timeout 120 openclaw chat --no-stream 2>/dev/null || cat "${tmpFile}" | timeout 120 claude --no-stream 2>/dev/null`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 130000
      });
      resolve(result.trim());
    } catch (err) {
      // 如果CLI不可用，尝试直接HTTP调用OpenClaw gateway
      reject(new Error('OpenClaw CLI调用失败: ' + err.message));
    }
  });
}

// 通过OpenClaw Gateway API调用
async function callViaGateway(systemPrompt, userMessage) {
  const gatewayUrl = 'http://localhost:18789';
  
  // 检查gateway是否运行
  try {
    const healthCheck = await fetch(`${gatewayUrl}/health`, { timeout: 3000 });
    if (!healthCheck.ok) throw new Error('Gateway not healthy');
  } catch {
    throw new Error('OpenClaw Gateway未运行');
  }
  
  // 使用sessions API发送消息
  const response = await fetch(`${gatewayUrl}/api/sessions/send`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer a6e87e79f0b77f8e315b3cd91f5679d3c86b819cd82d798d'
    },
    body: JSON.stringify({
      message: `${systemPrompt}\n\n${userMessage}`,
      timeoutSeconds: 120
    })
  });
  
  if (!response.ok) {
    throw new Error(`Gateway API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.result || data.message || JSON.stringify(data);
}

// 直接调用Anthropic API (如果有标准API key)
async function callAnthropicDirect(systemPrompt, userMessage, model = 'claude-sonnet-4-20250514') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes('oat01')) {
    throw new Error('NO_STANDARD_API_KEY');
  }
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${err}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}

// Token统计
let totalTokens = { input: 0, output: 0, cost: 0 };
const TOKEN_PRICE = { input: 0.003 / 1000, output: 0.015 / 1000 }; // Sonnet pricing

// 請求隊列管理 - 確保同時只處理一個Claude請求
let isProcessing = false;
let requestQueue = [];

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  const { resolve, reject, systemPrompt, userMessage, agentId } = requestQueue.shift();
  
  try {
    const result = await callClaudeInternal(systemPrompt, userMessage, agentId);
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    isProcessing = false;
    processQueue(); // 處理下一個請求
  }
}

// 包裝函數，將請求加入隊列
async function callClaude(systemPrompt, userMessage, agentId = '') {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, systemPrompt, userMessage, agentId });
    console.log(`[Queue] Added request, queue length: ${requestQueue.length}`);
    processQueue();
  });
}

// 初始化Anthropic SDK
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ========== DeepSeek/OpenRouter API调用 (OpenAI兼容) ==========
async function callOpenAICompatible(systemPrompt, userMessage, agentId = '') {
  const provider = PROVIDERS[currentProvider];
  const baseUrl = provider.baseUrl;
  const apiKey = currentProvider === 'deepseek' 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error(`Missing API key for ${currentProvider}. Set ${currentProvider.toUpperCase()}_API_KEY in .env`);
  }
  
  const needsLongOutput = agentId === 'storyboard' || agentId === 'narrative';
  const model = needsLongOutput ? provider.models.standard : provider.models.fast;
  
  // DeepSeek max_tokens限制8192
  const maxTokens = currentProvider === 'deepseek' 
    ? Math.min(needsLongOutput ? 8000 : 4096, 8192)
    : (needsLongOutput ? 16000 : 4096);
  
  console.log(`Calling ${provider.name} (${agentId || 'unknown'}) model: ${model}, max_tokens: ${maxTokens}`);
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(currentProvider === 'openrouter' ? { 'HTTP-Referer': 'https://fizzdragon.com' } : {})
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        stream: false,  // 暂时关闭流式，后续可开启
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**') }
        ]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider.name} API error: ${response.status} ${errText}`);
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    
    totalTokens.input += inputTokens;
    totalTokens.output += outputTokens;
    totalTokens.cost += inputTokens * provider.pricing.input + outputTokens * provider.pricing.output;
    
    console.log(`Tokens: in=${inputTokens}, out=${outputTokens}, cost=$${(inputTokens * provider.pricing.input + outputTokens * provider.pricing.output).toFixed(6)}`);
    
    return {
      text: text.trim(),
      tokens: { input: inputTokens, output: outputTokens }
    };
  } catch (err) {
    console.error(`${provider.name} API error:`, err.message);
    throw err;
  }
}

// ========== Anthropic Claude API调用 ==========
async function callAnthropicAPI(systemPrompt, userMessage, agentId = '') {
  const needsLongOutput = agentId === 'storyboard' || agentId === 'narrative';
  let model = 'claude-3-haiku-20240307';
  let maxTokens = 4096;
  
  if (needsLongOutput) {
    model = 'claude-sonnet-4-20250514';
    maxTokens = 16000;
  }
  
  console.log(`Calling Anthropic (${agentId || 'unknown'}) model: ${model}`);
  
  try {
    const response = await anthropic.messages.create({
      model: model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**') }
      ]
    });
    
    const text = response.content[0]?.text || '';
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    
    const pricing = PROVIDERS.anthropic.pricing;
    totalTokens.input += inputTokens;
    totalTokens.output += outputTokens;
    totalTokens.cost += inputTokens * pricing.input + outputTokens * pricing.output;
    
    console.log(`Tokens: in=${inputTokens}, out=${outputTokens}`);
    
    return {
      text: text.trim(),
      tokens: { input: inputTokens, output: outputTokens }
    };
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    throw err;
  }
}

// ========== Google Gemini API调用 ==========
async function callGeminiAPI(systemPrompt, userMessage, agentId = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in .env');
  }
  
  const provider = PROVIDERS.gemini;
  const needsLongOutput = agentId === 'storyboard' || agentId === 'narrative';
  const model = needsLongOutput ? provider.models.standard : provider.models.fast;
  
  console.log(`Calling Gemini (${agentId || 'unknown'}) model: ${model}`);
  
  try {
    const response = await fetch(
      `${provider.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**') }] }
          ],
          generationConfig: {
            maxOutputTokens: needsLongOutput ? 8000 : 4096,
            temperature: 0.7
          }
        })
      }
    );
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errText}`);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    
    totalTokens.input += inputTokens;
    totalTokens.output += outputTokens;
    totalTokens.cost += inputTokens * provider.pricing.input + outputTokens * provider.pricing.output;
    
    console.log(`Tokens: in=${inputTokens}, out=${outputTokens}`);
    
    return {
      text: text.trim(),
      tokens: { input: inputTokens, output: outputTokens }
    };
  } catch (err) {
    console.error('Gemini API error:', err.message);
    throw err;
  }
}

// ========== 统一调用入口 ==========
async function callClaudeInternal(systemPrompt, userMessage, agentId = '') {
  if (currentProvider === 'anthropic') {
    return callAnthropicAPI(systemPrompt, userMessage, agentId);
  } else if (currentProvider === 'gemini') {
    return callGeminiAPI(systemPrompt, userMessage, agentId);
  } else {
    return callOpenAICompatible(systemPrompt, userMessage, agentId);
  }
}

// 单个Agent API路由
app.post('/api/agent/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { content, context } = req.body;
  
  const agent = AGENTS[agentId];
  if (!agent) {
    return res.status(400).json({ 
      error: `Unknown agent: ${agentId}`,
      availableAgents: Object.keys(AGENTS)
    });
  }
  
  if (!content) {
    return res.status(400).json({ error: '缺少内容' });
  }
  
  try {
    console.log(`[${agent.name}] Processing with ${agent.skills.length} skills...`);
    
    // 加载技能方法论内容
    const skillsContent = loadAgentSkills(agent.skills);
    console.log(`[${agent.name}] Loaded ${agent.skills.slice(0, 5).length} skill files`);
    
    // 构建包含完整方法论的prompt
    const systemPrompt = `${agent.prompt}

---
## 专业方法论参考（必须运用以下方法分析用户内容）：
${skillsContent}
---

**重要：请基于以上方法论，深度分析用户提供的内容。你的回答必须体现出对内容的具体理解，不能给出通用的模板回答。**`;

    // 根据版本配置限制内容长度
    const limit = runtimeConfig.contentLimit || 2000;
    const truncatedContent = content.length > limit ? content.substring(0, limit) + '\n...(已截断)' : content;
    
    const userMessage = context 
      ? `背景：${JSON.stringify(context)}\n\n内容：\n${truncatedContent}`
      : `内容：\n${truncatedContent}`;
    
    const result = await callClaude(systemPrompt, userMessage, agentId);
    
    console.log(`[${agent.name}] Done!`);
    res.json({ 
      result: result.text, 
      agent: agentId,
      agentName: agent.name,
      skillsUsed: agent.skills,
      tokens: result.tokens,
      totalTokens: totalTokens
    });
  } catch (err) {
    console.error(`[${agent.name}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 动态配置API（必须在/:legacy之前）
app.post('/api/config', (req, res) => {
  const { maxSkills, contentLimit, provider } = req.body;
  if (maxSkills) runtimeConfig.maxSkills = Math.min(maxSkills, 5);
  if (contentLimit) runtimeConfig.contentLimit = Math.min(contentLimit, 10000);
  
  // 切换Provider
  if (provider && PROVIDERS[provider]) {
    currentProvider = provider;
    console.log(`🔄 Provider switched to: ${PROVIDERS[provider].name}`);
  }
  
  console.log(`Config updated: provider=${currentProvider}, maxSkills=${runtimeConfig.maxSkills}, contentLimit=${runtimeConfig.contentLimit}`);
  res.json({ status: 'ok', config: runtimeConfig });
});

app.get('/api/config', (req, res) => {
  res.json(runtimeConfig);
});

// 兼容旧API
const LEGACY_MAP = {
  interview: 'interview', concept: 'concept', chapters: 'narrative',
  characters: 'character', design: 'artdirector', script: 'screenwriter',
  storyboard: 'storyboard'
};

app.post('/api/:legacy', async (req, res, next) => {
  // 跳过特殊路由（交给后续handler处理）
  const specialRoutes = ['stream', 'config', 'tokens', 'agents', 'providers'];
  if (specialRoutes.includes(req.params.legacy)) {
    return next('route');
  }
  
  const agentId = LEGACY_MAP[req.params.legacy] || req.params.legacy;
  req.params.agentId = agentId;
  
  const agent = AGENTS[agentId];
  if (!agent) {
    return res.status(400).json({ error: `Unknown: ${req.params.legacy}` });
  }
  
  // 🚀 根據mode應用預設配置
  const { mode } = req.body;
  if (mode && MODE_PRESETS[mode]) {
    const preset = MODE_PRESETS[mode];
    runtimeConfig.maxSkills = preset.maxSkills;
    runtimeConfig.contentLimit = preset.contentLimit;
  }
  
  const { content, context, novel, title, analysis, interview, chapters, characters, concept } = req.body;
  
  // 根據不同Agent類型構建內容
  let actualContent = content || novel || '';
  let contextData = context || {};
  
  // 高概念Agent：使用analysis和interview
  if (agentId === 'concept' && (analysis || interview)) {
    actualContent = JSON.stringify({ analysis, interview }, null, 2);
    contextData = { type: 'concept_generation' };
  }
  // 章節Agent：使用analysis和concept
  else if (agentId === 'narrative' && (analysis || concept || novel)) {
    const { versionType, versionName, versionDesc, targetEpisodes, targetDuration, generateDetailedPlan, config } = req.body;
    
    if (generateDetailedPlan && versionType) {
      // 生成詳細版本規劃
      actualContent = JSON.stringify({ 
        analysis, 
        concept, 
        novel: novel?.substring?.(0, 8000),
        versionType,
        versionName,
        versionDesc,
        targetEpisodes,
        targetDuration
      }, null, 2);
      contextData = { 
        type: 'version_plan_generation',
        task: `請為「${versionName}」生成詳細的${targetEpisodes}集改編方案，每集${targetDuration}分鐘。
        
版本特點：${versionDesc}

輸出JSON格式：
{
  "overview": "整體改編策略說明（100字）",
  "episodes": [
    {
      "title": "集標題",
      "summary": "本集主要內容（50字）",
      "highlight": "本集最大亮點/看點",
      "hook": "結尾懸念/下集預告鉤子",
      "deletedContent": "本版本刪減的內容（如有）",
      "phase": "起/承/轉/合"
    }
  ]
}`
      };
    } else if (config?.batchMode) {
      // 分批模式 - 用於長篇(50+集)
      const start = config.startEpisode || 1;
      const end = config.endEpisode || 25;
      const total = config.totalEpisodes || 100;
      const prevHook = config.previousHook || '';
      const batchSize = end - start + 1;
      
      // 確定這批的敘事階段
      const q1 = Math.ceil(total / 4);
      const q2 = Math.ceil(total / 2);
      const q3 = Math.ceil(total * 3 / 4);
      
      let phaseGuide = '';
      if (end <= q1) phaseGuide = '本批為「起」（建置期）- 世界觀、角色介紹';
      else if (start <= q1 && end <= q2) phaseGuide = '本批跨越「起→承」- 從建置過渡到發展';
      else if (end <= q2) phaseGuide = '本批為「承」（發展期）- 矛盾發展';
      else if (start <= q2 && end <= q3) phaseGuide = '本批跨越「承→轉」- 從發展進入衝突';
      else if (end <= q3) phaseGuide = '本批為「轉」（衝突期）- 衝突升級、危機爆發';
      else if (start <= q3) phaseGuide = '本批跨越「轉→合」- 從衝突走向結局';
      else phaseGuide = '本批為「合」（收尾期）- 高潮爆發、大結局';
      
      actualContent = JSON.stringify({ 
        novel: novel?.substring?.(0, 6000),
        wordCount: config?.wordCount || 0,
        batchInfo: { start, end, total, prevHook }
      }, null, 2);
      
      contextData = { 
        type: 'batch_chapter_generation',
        task: `【分批生成】請規劃第 ${start}-${end} 集（全劇共 ${total} 集）

${prevHook ? `【前集結尾】${prevHook}\n請確保與此銜接！\n` : '【這是第一批】'}

**${phaseGuide}**

輸出JSON格式：
{
  "chapters": [
    // 必須剛好 ${batchSize} 個（第${start}集到第${end}集）
    {
      "title": "有意義的標題（如：命運的相遇、暗流湧動）",
      "summary": "內容摘要（30字）",
      "highlight": "本集亮點",
      "hook": "結尾鉤子（用於銜接下一集）",
      "phase": "起/承/轉/合"
    },
    // ...
  ],
  "nextHook": "下一批的開頭提示（用於銜接第${end+1}集）"
}

**標題要求：每集標題必須是有意義的中文短語（3-8字），不能是數字！**
**重要：必須生成剛好 ${batchSize} 集（第${start}到第${end}集）！**`
      };
    } else {
      // 常規章節分析 - 按用戶指定的集數生成
      const targetEps = config?.targetEpisodes || 12;
      const targetDur = config?.durationPerEpisode || 8;
      
      actualContent = JSON.stringify({ 
        analysis, 
        concept, 
        interview,  // 訪談創意方向
        novel: novel?.substring?.(0, 10000),
        wordCount: config?.wordCount || 0,
        userConfig: config
      }, null, 2);
      contextData = { 
        type: 'chapter_breakdown',
        task: `請將這個故事拆分成 **${targetEps} 集**，每集約 ${targetDur} 分鐘的AI番劇。

**重要：必須輸出剛好 ${targetEps} 個章節（episodes），不能多也不能少！**

根據故事內容（情節密度、節奏、衝突）合理分配每集內容：
- 對於長篇：合併原始章節，每集可能包含多個原始章節
- 對於短篇：拆分原始章節，一個原始章節可能分為多集
- 保持每集有完整的敘事弧線（開頭-發展-高潮-結尾）

輸出JSON格式：
{
  "analysis": {
    "plotDensity": "情節密度評估（高/中/低）",
    "pacing": "節奏評估",
    "conflictCount": "主要衝突數量",
    "adaptationStrategy": "如何將原內容適配到${targetEps}集（30字）"
  },
  "chapters": [
    // 必須剛好 ${targetEps} 個！
    {
      "title": "有意義的標題（如：命運的相遇、暗流湧動、真相大白）",
      "summary": "內容摘要（30字）",
      "highlight": "本集亮點",
      "hook": "結尾鉤子",
      "phase": "起/承/轉/合"
    },
    // ... 共 ${targetEps} 集
  ]
}

**標題要求：每集標題必須是有意義的中文短語（3-8字），如「風起雲湧」「命運轉折」，不能是數字！**

**phase分配規則：**
- 前${Math.ceil(targetEps/4)}集 = "起"（建置期）
- 第${Math.ceil(targetEps/4)+1}-${Math.ceil(targetEps/2)}集 = "承"（發展期）  
- 第${Math.ceil(targetEps/2)+1}-${Math.ceil(targetEps*3/4)}集 = "轉"（衝突期）
- 最後${targetEps - Math.ceil(targetEps*3/4)}集 = "合"（收尾期）`
      };
    }
  }
  // 角色Agent：使用novel、chapters和analysis（必須包含原文！）
  else if (agentId === 'character' && (chapters || analysis || novel)) {
    const novelText = novel ? (typeof novel === 'string' ? novel : novel.text || '') : '';
    actualContent = JSON.stringify({ 
      novel: novelText.substring(0, 15000),  // 原文很重要
      chapters, 
      analysis,
      interview,  // 訪談創意方向
      concept     // 高概念
    }, null, 2);
    contextData = { type: 'character_design' };
  }
  
  if (!actualContent) {
    return res.status(400).json({ error: '缺少內容數據' });
  }
  
  try {
    console.log(`[${agent.name}] Processing with ${agent.skills.length} skills...`);
    
    // 加载技能方法论内容
    const skillsContent = loadAgentSkills(agent.skills);
    console.log(`[${agent.name}] Loaded skill files for deep analysis`);
    
    // 构建包含完整方法论的prompt
    const systemPrompt = `${agent.prompt}

---
## 专业方法论参考（必须运用以下方法分析）：
${skillsContent}
---

**核心要求：**
1. 必须深度阅读和理解用户提供的具体内容
2. 运用上述方法论分析这个特定的故事/内容
3. 所有问题/回答都必须针对这个具体内容，不能给通用模板
4. 体现出你对角色、情节、主题的深度理解

**输出格式要求：**
- 直接输出JSON，不要解释
- 保持简洁，每个字段不超过50字
- 确保JSON完整闭合`;

    // 限制内容长度（最重要！防止超时）
    const limit = runtimeConfig.contentLimit || 2000;
    const truncatedContent = actualContent.length > limit 
      ? actualContent.substring(0, limit) + '\n...(內容已截斷，共' + actualContent.length + '字)'
      : actualContent;
    
    const userMessage = Object.keys(contextData).length > 0
      ? `背景：${JSON.stringify(contextData)}\n\n${title ? '標題：'+title+'\n\n' : ''}请深度分析以下内容：\n${truncatedContent}`
      : `${title ? '標題：'+title+'\n\n' : ''}请深度分析以下内容：\n${truncatedContent}`;
    
    const result = await callClaude(systemPrompt, userMessage, agentId);
    
    console.log(`[${agent.name}] Done!`);
    res.json({ result: result.text, agent: agentId, skillsUsed: agent.skills, tokens: result.tokens, totalTokens });
  } catch (err) {
    console.error(`[${agent.name}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Agents列表
app.get('/api/agents', (req, res) => {
  res.json({
    agents: Object.entries(AGENTS).map(([id, a]) => ({
      id, name: a.name, group: a.group, skillCount: a.skills.length
    })),
    groups: AGENT_GROUPS,
    stats: STATS
  });
});

// Token统计API
app.get('/api/tokens', (req, res) => {
  res.json(totalTokens);
});

// 重置token统计
app.post('/api/tokens/reset', (req, res) => {
  totalTokens = { input: 0, output: 0, cost: 0 };
  res.json({ status: 'reset', totalTokens });
});

// 健康检查 (支持 /health 和 /api/health)
app.get(['/health', '/api/health'], async (req, res) => {
  const provider = PROVIDERS[currentProvider];
  res.json({ 
    status: 'ok',
    mode: 'direct-api',
    provider: currentProvider,
    providerName: provider?.name || currentProvider,
    hasApiKey: currentProvider === 'anthropic' 
      ? !!process.env.ANTHROPIC_API_KEY
      : currentProvider === 'deepseek'
        ? !!process.env.DEEPSEEK_API_KEY
        : currentProvider === 'gemini'
          ? !!process.env.GEMINI_API_KEY
          : !!process.env.OPENROUTER_API_KEY,
    availableProviders: Object.keys(PROVIDERS),
    stats: STATS,
    tokenUsage: totalTokens,
    config: runtimeConfig
  });
});

// 获取可用providers
app.get('/api/providers', (req, res) => {
  res.json({
    current: currentProvider,
    available: Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      name: p.name,
      pricing: p.pricing,
      hasKey: id === 'anthropic' 
        ? !!process.env.ANTHROPIC_API_KEY
        : id === 'deepseek'
          ? !!process.env.DEEPSEEK_API_KEY
          : id === 'gemini'
            ? !!process.env.GEMINI_API_KEY
            : !!process.env.OPENROUTER_API_KEY
    }))
  });
});

// ========== 流式输出API (SSE) ==========
app.post('/api/stream', async (req, res) => {
  const { prompt, systemPrompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: '缺少prompt' });
  }
  
  // 设置SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const provider = PROVIDERS[currentProvider];
  const apiKey = currentProvider === 'deepseek' 
    ? process.env.DEEPSEEK_API_KEY
    : process.env.ANTHROPIC_API_KEY;
  const baseUrl = provider?.baseUrl || 'https://api.deepseek.com/v1';
  const model = provider?.models?.standard || 'deepseek-chat';
  
  console.log(`[Stream] Starting stream with ${provider?.name}`);
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 8000,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt || '你是一位專業的小說作家。' },
          { role: 'user', content: prompt }
        ]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      res.end();
      return;
    }
    
    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    console.log(`[Stream] Stream completed`);
    
  } catch (err) {
    console.error('[Stream] Error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ========== Moodboard API ==========
// 圖片生成Provider配置
const IMAGE_PROVIDERS = {
  together: {
    name: 'Together.ai (Flux)',
    baseUrl: 'https://api.together.xyz/v1/images/generations',
    model: 'black-forest-labs/FLUX.1-schnell-Free',
    getApiKey: () => process.env.TOGETHER_API_KEY
  },
  dalle: {
    name: 'OpenAI DALL-E 3',
    baseUrl: 'https://api.openai.com/v1/images/generations',
    model: 'dall-e-3',
    getApiKey: () => process.env.OPENAI_API_KEY
  }
};

// 獲取可用的圖片生成服務
app.get('/api/moodboard/providers', (req, res) => {
  const available = [];
  for (const [id, provider] of Object.entries(IMAGE_PROVIDERS)) {
    available.push({
      id,
      name: provider.name,
      available: !!provider.getApiKey(),
      model: provider.model
    });
  }
  res.json({ providers: available });
});

// 生成測試圖
app.post('/api/moodboard/generate', async (req, res) => {
  try {
    const { prompt, provider = 'together' } = req.body;
    if (!prompt) return res.status(400).json({ error: '缺少prompt' });
    
    const imgProvider = IMAGE_PROVIDERS[provider];
    const apiKey = imgProvider?.getApiKey();
    
    if (!apiKey) {
      return res.status(400).json({ 
        error: `未配置 ${imgProvider?.name || provider} API Key`,
        hint: '請在 .env 中設置 TOGETHER_API_KEY 或 OPENAI_API_KEY'
      });
    }
    
    console.log(`[Moodboard] 使用 ${imgProvider.name} 生成測試圖...`);
    
    const response = await fetch(imgProvider.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(provider === 'dalle' ? {
        model: imgProvider.model,
        prompt: prompt,
        size: '1024x1024',
        n: 1
      } : {
        model: imgProvider.model,
        prompt: prompt,
        width: 1024,
        height: 768,
        steps: 4,
        n: 1
      })
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }
    
    const data = await response.json();
    res.json({
      url: data.data?.[0]?.url || data.output?.[0],
      provider: imgProvider.name,
      prompt
    });
  } catch (err) {
    console.error('[Moodboard] 生成失敗:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 圖片反推畫風 (Claude Vision)
app.post('/api/moodboard/analyze', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: '缺少圖片數據' });
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: '圖片分析需要 ANTHROPIC_API_KEY' });
    }
    
    console.log('[Moodboard] 使用 Claude Vision 分析圖片...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.includes('data:') ? image.split(';')[0].split(':')[1] : 'image/jpeg',
                data: image.replace(/^data:image\/\w+;base64,/, '')
              }
            },
            {
              type: 'text',
              text: `分析這張圖片的視覺風格，輸出JSON：
{
  "style_name": "風格名稱",
  "mood": "氛圍",
  "color_palette": ["主色1", "主色2", "主色3"],
  "lighting": "光線特點",
  "art_reference": "最接近的藝術風格/作品",
  "prompt_keywords": ["關鍵詞1", "關鍵詞2"],
  "full_prompt": "完整AI繪圖Prompt（英文）"
}
只輸出JSON。`
            }
          ]
        }]
      })
    });
    
    if (!response.ok) throw new Error(await response.text());
    
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      res.json(JSON.parse(jsonStr));
    } catch(parseErr) {
      console.error('[Moodboard] JSON解析失敗:', parseErr.message);
      res.json({ raw: text, error: 'JSON解析失敗，返回原始文本' });
    }
  } catch (err) {
    console.error('[Moodboard] 分析失敗:', err.message);
    res.status(500).json({ error: err.message });
  }
});

console.log('✅ Moodboard API 已啟用');

// ========== 長篇小說處理API ==========

// 1. 提取小說結構（章節列表）
app.post('/api/novel/structure', async (req, res) => {
  const { novel } = req.body;
  if (!novel) return res.status(400).json({ error: '缺少小說內容' });
  
  console.log(`[📚 長篇處理] 分析結構... (${novel.length}字)`);
  
  // 提取前10000字用於結構分析
  const sample = novel.substring(0, 10000);
  
  const systemPrompt = `你是小說結構分析專家。分析這部小說的章節結構。

輸出JSON格式：
{
  "title": "小說標題",
  "totalChars": 字數,
  "structure": [
    {"part": "第一部", "chapters": ["第一章", "第二章", ...]},
    ...
  ],
  "estimatedEpisodes": 建議集數,
  "chunkSize": 建議分段大小(字數)
}

直接輸出JSON，不要解釋。`;

  try {
    const result = await callClaude(systemPrompt, `分析這部小說的結構：\n\n${sample}\n\n(共${novel.length}字)`, 'structure');
    res.json({ result: result.text, totalChars: novel.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 分段處理長篇小說
app.post('/api/novel/chunk', async (req, res) => {
  const { novel, chunkIndex, chunkSize = 8000, totalChunks, context, agentId = 'interview' } = req.body;
  
  if (!novel) return res.status(400).json({ error: '缺少小說內容' });
  
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, novel.length);
  const chunk = novel.substring(start, end);
  
  console.log(`[📚 長篇處理] 處理第 ${chunkIndex + 1}/${totalChunks} 段 (${start}-${end})`);
  
  const agent = AGENTS[agentId];
  if (!agent) return res.status(400).json({ error: `無效的Agent: ${agentId}` });
  
  const skillsContent = loadAgentSkills(agent.skills);
  
  const systemPrompt = `${agent.prompt}

## 專業方法論：
${skillsContent}

## 重要：這是長篇小說的第 ${chunkIndex + 1}/${totalChunks} 段
- 前文摘要：${context?.previousSummary || '這是開頭'}
- 當前位置：第 ${start}-${end} 字
- 請分析這一段的內容，提取關鍵信息

直接輸出JSON。`;

  try {
    const result = await callClaude(systemPrompt, chunk, agentId);
    res.json({ 
      result: result.text, 
      chunkIndex, 
      processed: `${start}-${end}`,
      tokens: result.tokens 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 聚合分段結果
app.post('/api/novel/aggregate', async (req, res) => {
  const { chunks, targetEpisodes, title } = req.body;
  
  if (!chunks || !chunks.length) return res.status(400).json({ error: '缺少分段數據' });
  
  console.log(`[📚 長篇處理] 聚合 ${chunks.length} 段結果 → ${targetEpisodes} 集`);
  
  const systemPrompt = `你是番劇策劃專家。根據分段分析結果，規劃完整的集數大綱。

## 要求
- 目標集數：${targetEpisodes}集
- 每集3-8分鐘
- 包含起承轉合節奏
- 每集有明確的戲劇鉤子

輸出JSON：
{
  "title": "${title || '未命名'}",
  "totalEpisodes": ${targetEpisodes},
  "episodes": [
    {
      "ep": 1,
      "title": "第1集標題",
      "summary": "劇情摘要",
      "scenes": ["場景1", "場景2"],
      "hook": "本集鉤子",
      "phase": "起/承/轉/合"
    },
    ...
  ]
}`;

  try {
    const chunksStr = chunks.map((c, i) => `[段落${i+1}]:\n${c}`).join('\n\n');
    const result = await callClaude(systemPrompt, chunksStr.substring(0, 15000), 'aggregate');
    res.json({ result: result.text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 快速預覽（用於超長小說）
app.post('/api/novel/preview', async (req, res) => {
  const { novel, sampleSize = 3000 } = req.body;
  
  if (!novel) return res.status(400).json({ error: '缺少小說內容' });
  
  const totalLength = novel.length;
  
  // 採樣：開頭 + 中間 + 結尾
  const samples = [
    { label: '開頭', text: novel.substring(0, sampleSize) },
    { label: '中段', text: novel.substring(Math.floor(totalLength/2) - sampleSize/2, Math.floor(totalLength/2) + sampleSize/2) },
    { label: '結尾', text: novel.substring(totalLength - sampleSize) }
  ];
  
  console.log(`[📚 長篇處理] 快速預覽 (${totalLength}字，採樣${sampleSize*3}字)`);
  
  const systemPrompt = `快速分析這部長篇小說的核心內容。

輸出JSON：
{
  "title": "推測標題",
  "genre": "類型",
  "themes": ["主題1", "主題2"],
  "mainCharacters": ["角色1", "角色2"],
  "plotSummary": "劇情概要(100字內)",
  "estimatedEpisodes": 建議集數,
  "style": "敘事風格"
}`;

  try {
    const sampleText = samples.map(s => `【${s.label}】\n${s.text}`).join('\n\n---\n\n');
    const result = await callClaude(systemPrompt, `小說總長：${totalLength}字\n\n${sampleText}`, 'preview');
    res.json({ 
      result: result.text, 
      totalLength,
      sampledLength: sampleSize * 3,
      recommendedChunks: Math.ceil(totalLength / 8000)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

console.log('✅ 長篇小說處理API 已啟用');

app.listen(PORT, () => {
  const provider = PROVIDERS[currentProvider];
  console.log(`🎬 AI番劇 Agent Server v3 (Multi-Provider)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   🤖 Provider: ${provider?.name || currentProvider}`);
  console.log(`   📊 ${STATS.totalAgents} Agents | ${STATS.totalSkills} Skills`);
});
