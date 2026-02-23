// AI番劇工作台 - 30 Agents Server (Multi-Provider Mode)
// 支持: Anthropic Claude / DeepSeek / OpenRouter

import 'dotenv/config';  // 加载.env文件
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
      standard: 'deepseek-chat',    // 改为chat，reasoner太慢会超时
      best: 'deepseek-chat'         // 同上
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
      fast: 'deepseek/deepseek-reasoner',
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
// Skills目录 - 使用本地合并版_complete
const SKILLS_DIR = '/home/beerbear/.openclaw/workspace/ai_drama_studio_v2/workbench/v3/server/skills';

// 加载skill文件内容的缓存
const skillCache = new Map();

// 清理文本中可能导致JSON序列化问题的字符
function sanitizeForJson(text) {
  if (!text) return text;
  // 移除控制字符(除了换行、回车、制表符)
  // 移除可能导致hex escape问题的字符
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
    .replace(/\uFFFD/g, '') // 移除替换字符
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '') // 移除孤立的高代理
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''); // 移除孤立的低代理
}

// 加载单个skill文件
function loadSkill(skillId) {
  if (skillCache.has(skillId)) {
    return skillCache.get(skillId);
  }
  
  const skillPath = join(SKILLS_DIR, `${skillId}.skill.md`);
  if (existsSync(skillPath)) {
    try {
      const content = readFileSync(skillPath, 'utf-8');
      // 清理可能有问题的字符
      const sanitized = sanitizeForJson(content);
      // 只取核心内容，跳过过长的示例
      const trimmed = sanitized.length > 3000 ? sanitized.substring(0, 3000) + '\n...(更多方法论详见完整文档)' : sanitized;
      skillCache.set(skillId, trimmed);
      return trimmed;
    } catch (e) {
      console.error(`Failed to load skill ${skillId}:`, e.message);
    }
  }
  return null;
}

// 动态配置 - maxSkills=2避免DeepSeek hex escape问题
// 当需要更多skills时可通过API调整
let runtimeConfig = { maxSkills: 5, contentLimit: 2500 };

// 模式預設
const MODE_PRESETS = {
  turbo: { maxSkills: 5, contentLimit: 2000 },  // 最快
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
    'nonfiction_rewriter', // 非虛構擴寫 - 輸出正文
    'nonfiction_writer',   // 非虛構藍圖 - 也可輸出自然語言（但我們主要用JSON），保守设为自然語言以免被强制JSON
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
    'production_design', // 服化道設計
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

// JSON修复函数 - 修复DeepSeek偶尔输出的格式问题
function repairJSON(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;
  
  let fixed = jsonStr;
  
  // 模式1: "key":值" → "key":"值"  (缺少开始引号，有结束引号)
  fixed = fixed.replace(/"(\w+)":\s*([^"\s\[\]{},][^"]*?)"/g, '"$1": "$2"');
  
  // 模式2: "key":值, → "key":"值",  (完全没引号，后跟逗号/括号)
  fixed = fixed.replace(/"(\w+)":\s*([^"\s\[\]{},][^,}\]]*?)([,}\]])/g, (match, key, value, end) => {
    // 跳过数字、布尔、null
    if (/^(true|false|null|-?\d+\.?\d*)$/i.test(value.trim())) return match;
    return `"${key}": "${value.trim()}"${end}`;
  });
  
  // 清理末尾逗号: ,} → }
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // 修复单引号: 'value' → "value"
  fixed = fixed.replace(/'([^']+)'/g, '"$1"');
  
  return fixed;
}

// 安全JSON解析（带修复）
function safeJSONParse(jsonStr, agentId = 'unknown') {
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    console.log(`⚠️ ${agentId} JSON解析失败，尝试修复...`);
    try {
      const fixed = repairJSON(jsonStr);
      const result = JSON.parse(fixed);
      console.log(`✅ ${agentId} JSON修复成功`);
      return result;
    } catch (e2) {
      console.error(`❌ ${agentId} JSON修复失败:`, e2.message);
      throw e1; // 抛出原始错误
    }
  }
}

// ========== 角色数据后处理 - 确保必要字段存在 ==========
function validateAndFixCharacters(data) {
  if (!data || !data.characters) return data;
  
  data.characters = data.characters.map(char => {
    // 确保有 ai_prompt - 如果没有，根据 appearance 自动生成
    if (!char.ai_prompt && !char.prompt) {
      const name = char.name || 'Character';
      const role = char.role || 'character';
      const appearance = char.appearance || '';
      
      // 从外貌描述提取关键信息生成英文prompt
      char.ai_prompt = `${name}, ${role}. ${appearance.substring(0, 200)}. --style cinematic portrait, character design, 8K`;
      console.log(`[Validate] 自動補充 ${name} 的 ai_prompt`);
    }
    
    // 统一字段名
    if (char.prompt && !char.ai_prompt) {
      char.ai_prompt = char.prompt;
    }
    
    // 确保有 bio
    if (!char.bio && char.psychology) {
      const p = char.psychology;
      char.bio = `【人物小傳】${char.name || '角色'}，${char.role || ''}。` +
        (p.want ? `\nWant: ${p.want}` : '') +
        (p.need ? `\nNeed: ${p.need}` : '') +
        (p.wound ? `\nWound: ${p.wound}` : '') +
        (p.lie ? `\nLie: ${p.lie}` : '') +
        (p.arc ? `\n弧線: ${p.arc}` : '');
      console.log(`[Validate] 自動補充 ${char.name} 的 bio`);
    }
    
    return char;
  });
  
  return data;
}

// 加载agent的所有skills内容（根据版本配置动态调整）
function loadAgentSkills(skillIds) {
  const maxSkills = runtimeConfig.maxSkills || 1;
  const loaded = [];
  const skills = skillIds.slice(0, maxSkills);
  
  for (const skillId of skills) {
    const content = loadSkill(skillId);
    if (content) {
      // 根据配置精简内容 - 增加限制以确保skill被完整使用
      const limit = maxSkills === 1 ? 2000 : maxSkills === 2 ? 1500 : maxSkills <= 3 ? 1200 : 1000;
      const shortened = content.length > limit ? content.substring(0, limit) + '\n...(方法論核心已載入)' : content;
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
// CORS配置 - 确保所有响应都有CORS头（包括错误响应）
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// 手动添加CORS头，确保错误响应也有
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// 🔧 显式处理所有OPTIONS预检请求
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..')));

// ==================== 用户认证系统（注册/登录/JWT）====================

const USERS_FILE = join(__dirname, 'users.json');
const userRequests = new Map(); // 用户当前请求状态

// 注册
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '缺少 username/password' });
  if (String(username).length < 3) return res.status(400).json({ error: '用户名至少3位' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少6位' });

  const users = loadUsers();
  // users: { byUsername: { [username]: user } }
  const byUsername = users.byUsername || {};
  if (byUsername[username]) return res.status(400).json({ error: '用户名已存在' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: crypto.randomUUID(), username, passwordHash, createdAt: new Date().toISOString() };
  byUsername[username] = user;
  users.byUsername = byUsername;
  saveUsers(users);

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '缺少 username/password' });

  const users = loadUsers();
  const user = users.byUsername?.[username];
  if (!user) return res.status(400).json({ error: '用户名或密码错误' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: '用户名或密码错误' });

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

// 验证
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

// 兼容旧前端：verify/logout
app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ ok: true, user: { id: req.user.id, username: req.user.username } });
});
app.post('/api/auth/logout', (req, res) => {
  // JWT无服务端会话，前端清token即可
  res.json({ ok: true });
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET 未配置：当前为临时密钥（重启会使登录失效）。请在Render环境变量中设置 JWT_SECRET');
}

function issueToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// 读取用户数据
function loadUsers() {
  try {
    if (existsSync(USERS_FILE)) {
      return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

// 保存用户数据
function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 生成token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 哈希密码
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'fizzdragon_salt').digest('hex');
}

// 验证token中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.split(' ')[1];
  const users = loadUsers();
  const user = Object.values(users).find(u => u.token === token);
  
  if (!user) {
    return res.status(401).json({ error: 'Token无效' });
  }
  
  req.user = user;
  next();
}

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名3-20个字符' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6个字符' });
  }
  
  const users = loadUsers();
  
  if (users[username]) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  
  users[username] = {
    username,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
    token: null
  };
  
  saveUsers(users);
  console.log(`[Auth] 新用户注册: ${username}`);
  res.json({ ok: true, message: '注册成功' });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' });
  }
  
  const users = loadUsers();
  const user = users[username];
  
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  // 生成新token
  const token = generateToken();
  users[username].token = token;
  users[username].lastLogin = new Date().toISOString();
  saveUsers(users);
  
  console.log(`[Auth] 用户登录: ${username}`);
  res.json({
    ok: true,
    token,
    user: { username, createdAt: user.createdAt }
  });
});

// 验证token
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.split(' ')[1];
  const users = loadUsers();
  const user = Object.values(users).find(u => u.token === token);
  
  if (!user) {
    return res.status(401).json({ error: 'Token无效' });
  }
  
  res.json({ ok: true, user: { username: user.username } });
});

// 登出
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const users = loadUsers();
    const user = Object.values(users).find(u => u.token === token);
    if (user) {
      users[user.username].token = null;
      saveUsers(users);
      console.log(`[Auth] 用户登出: ${user.username}`);
    }
  }
  res.json({ ok: true });
});

// 🔧 管理员接口：列出所有用户（不显示密码）
app.get('/api/admin/users', (req, res) => {
  const users = loadUsers();
  const userList = Object.entries(users).map(([username, data]) => ({
    username,
    createdAt: data.createdAt || 'unknown',
    lastLogin: data.lastLogin || 'never',
    isOnline: !!data.token,
    projectCount: data.projectCount || 0
  }));
  res.json({ 
    total: userList.length,
    users: userList 
  });
});

// 🔧 管理员接口：踢出用户（清除token）
app.post('/api/admin/kick', (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: '缺少用户名' });
  }
  
  const users = loadUsers();
  if (!users[username]) {
    return res.status(404).json({ error: '用户不存在' });
  }
  
  users[username].token = null;
  saveUsers(users);
  console.log(`[Admin] 踢出用户: ${username}`);
  res.json({ ok: true, message: `已踢出用户 ${username}` });
});

// 检查用户是否有正在进行的请求
function checkUserRequest(username) {
  return userRequests.get(username) || null;
}

// 设置用户请求状态
function setUserRequest(username, requestInfo) {
  userRequests.set(username, requestInfo);
}

// 清除用户请求状态
function clearUserRequest(username) {
  userRequests.delete(username);
}

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
      max_tokens: 4096,
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

// ========== 並發限制 + 請求隊列管理 ==========
const MAX_CONCURRENT = 3;  // 最多3個智能體同時運行
let activeRequests = 0;    // 當前運行中的請求數
let requestQueue = [];     // 等待隊列
let requestIdCounter = 0;  // 請求ID計數器

// 獲取隊列狀態
function getQueueStatus() {
  return {
    maxConcurrent: MAX_CONCURRENT,
    activeRequests,
    queueLength: requestQueue.length,
    queue: requestQueue.map((req, i) => ({
      position: i + 1,
      agentId: req.agentId,
      requestId: req.requestId
    }))
  };
}

async function processQueue() {
  // 如果達到並發上限或隊列為空，不處理
  while (activeRequests < MAX_CONCURRENT && requestQueue.length > 0) {
    const { resolve, reject, systemPrompt, userMessage, agentId, options, requestId } = requestQueue.shift();
    activeRequests++;
    console.log(`[Queue] 開始處理 ${agentId} (requestId: ${requestId}), 活躍: ${activeRequests}/${MAX_CONCURRENT}, 等待: ${requestQueue.length}`);
    
    // 異步處理，不阻塞循環
    (async () => {
      try {
        const result = await callClaudeInternal(systemPrompt, userMessage, agentId, options || {});
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeRequests--;
        console.log(`[Queue] 完成 ${agentId}, 活躍: ${activeRequests}/${MAX_CONCURRENT}, 等待: ${requestQueue.length}`);
        processQueue(); // 處理下一個
      }
    })();
  }
}

// 包裝函數，將請求加入隊列
async function callClaude(systemPrompt, userMessage, agentId = '', options = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestIdCounter;
    const queuePosition = requestQueue.length + 1;
    requestQueue.push({ resolve, reject, systemPrompt, userMessage, agentId, options, requestId });
    
    if (activeRequests >= MAX_CONCURRENT) {
      console.log(`[Queue] 🔄 ${agentId} 加入等待隊列，位置: ${queuePosition}`);
    } else {
      console.log(`[Queue] ⚡ ${agentId} 直接處理`);
    }
    
    processQueue();
  });
}

// 初始化Anthropic SDK
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ========== 🛡️ 重试机制 + Provider备份 (Bug#5永久解决方案) ==========
const RETRY_CONFIG = {
  maxRetries: 5,           // 最多重试5次
  baseDelay: 1000,         // 基础延迟1秒
  maxDelay: 30000,         // 最大延迟30秒
  backoffMultiplier: 2     // 指数退避倍数
};

// 备用Provider顺序
const FALLBACK_PROVIDERS = ['deepseek', 'openrouter'];

// 带重试的API调用包装器
async function callWithRetry(callFn, agentId = '') {
  let lastError = null;
  
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await callFn();
      if (attempt > 1) {
        console.log(`✅ 第${attempt}次重试成功 (${agentId})`);
      }
      return result;
    } catch (err) {
      lastError = err;
      const isTimeout = err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT');
      const isNetworkError = err.message?.includes('ECONNRESET') || err.message?.includes('ENOTFOUND') || err.message?.includes('fetch failed');
      
      if (attempt < RETRY_CONFIG.maxRetries && (isTimeout || isNetworkError || err.message?.includes('API error'))) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1),
          RETRY_CONFIG.maxDelay
        );
        console.log(`⚠️ 第${attempt}次失败 (${agentId}): ${err.message}, ${delay/1000}秒后重试...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

// 带Provider备份的调用
async function callWithFallback(systemPrompt, userMessage, agentId = '', options = {}) {
  const originalProvider = currentProvider;
  let lastError = null;
  
  for (const provider of FALLBACK_PROVIDERS) {
    if (!process.env[`${provider.toUpperCase()}_API_KEY`] && provider !== 'deepseek') {
      continue; // 跳过没有配置key的provider
    }
    
    try {
      currentProvider = provider;
      const result = await callWithRetry(
        () => callOpenAICompatibleCore(systemPrompt, userMessage, agentId, options),
        agentId
      );
      currentProvider = originalProvider;
      return result;
    } catch (err) {
      console.log(`❌ ${provider} 失败 (${agentId}): ${err.message}`);
      lastError = err;
    }
  }
  
  currentProvider = originalProvider;
  throw new Error(`所有Provider都失败了 (${agentId}): ${lastError?.message || '未知错误'}`);
}

// ========== DeepSeek/OpenRouter API调用 (OpenAI兼容) ==========
async function callOpenAICompatibleCore(systemPrompt, userMessage, agentId = '', options = {}) {
  const provider = PROVIDERS[currentProvider];
  const baseUrl = provider.baseUrl;
  const apiKey = currentProvider === 'deepseek' 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error(`Missing API key for ${currentProvider}. Set ${currentProvider.toUpperCase()}_API_KEY in .env`);
  }
  
  const needsLongOutput = ['storyboard', 'narrative', 'chapters', 'concept', 'screenwriter', 'character', 'novelist', 'story_architect', 'episode_planner'].includes(agentId);
  // 🔧 分镜不再强制使用reasoner（太慢），改用普通模型+更大max_tokens
  // 前端可以指定useReasoner强制使用
  const useReasoner = options.useReasoner === true && currentProvider === 'deepseek';
  const model = useReasoner ? 'deepseek-reasoner' : (needsLongOutput ? provider.models.standard : provider.models.fast);
  
  // 分镜/小说需要更多tokens
  // ⚠️ DeepSeek所有模型max_tokens上限都是8192！（包括reasoner）
  // 虽然API可能接受更高值，但响应质量会下降
  const longOutputAgents = ['storyboard', 'novelist', 'screenwriter', 'narrative', 'story_architect', 'episode_planner', 'format_adapter'];
  const maxTokens = longOutputAgents.includes(agentId) ? 8192 : (needsLongOutput ? 8192 : 4096);
  
  console.log(`Calling ${provider.name} (${agentId || 'unknown'}) model: ${model}, max_tokens: ${maxTokens}`);
  
  // 清理内容以确保JSON兼容性
  const cleanSystem = sanitizeForJson(systemPrompt);
  const cleanUser = sanitizeForJson(userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字，不要输出思考过程。只输出{开头}结尾的JSON。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**'));
  
  // 🔧 添加超时控制（Render免费版30秒限制，设25秒以便返回错误）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), useReasoner ? 120000 : 25000);
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      signal: controller.signal,
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
          { role: 'system', content: cleanSystem },
          { role: 'user', content: cleanUser }
        ]
      })
    });
    
    clearTimeout(timeoutId);  // 请求成功，清除超时
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider.name} API error: ${response.status} ${errText}`);
    }
    
    const data = await response.json();
    // DeepSeek-reasoner可能在reasoning_content中返回内容，content为空
    const message = data.choices?.[0]?.message;
    const text = message?.content || message?.reasoning_content || '';
    const reasoning = message?.reasoning_content || null;  // 思考过程（reasoner模式）
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    
    totalTokens.input += inputTokens;
    totalTokens.output += outputTokens;
    totalTokens.cost += inputTokens * provider.pricing.input + outputTokens * provider.pricing.output;
    
    console.log(`Tokens: in=${inputTokens}, out=${outputTokens}, cost=$${(inputTokens * provider.pricing.input + outputTokens * provider.pricing.output).toFixed(6)}`);
    
    return {
      text: text.trim(),
      tokens: { input: inputTokens, output: outputTokens },
      reasoning: reasoning  // 返回思考过程供前端显示
    };
  } catch (err) {
    clearTimeout(timeoutId);  // 确保清除超时
    if (err.name === 'AbortError') {
      console.error(`${provider.name} API timeout (${useReasoner ? '120s' : '25s'})`);
      throw new Error(`請求超時（${useReasoner ? '120' : '25'}秒），請重試或縮短內容`);
    }
    console.error(`${provider.name} API error:`, err.message);
    throw err;
  }
}

// ========== Anthropic Claude API调用 ==========
async function callAnthropicAPI(systemPrompt, userMessage, agentId = '') {
  const needsLongOutput = ['storyboard', 'narrative', 'chapters', 'concept', 'screenwriter', 'character'].includes(agentId);
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
        { role: 'user', content: userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字，不要输出思考过程。只输出{开头}结尾的JSON。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**') }
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
  const needsLongOutput = ['storyboard', 'narrative', 'chapters', 'concept', 'screenwriter', 'character'].includes(agentId);
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
            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage + (needsJsonOutput(agentId) ? '\n\n**重要：直接输出纯JSON，不要用```包裹，不要任何解释文字，不要输出思考过程。只输出{开头}结尾的JSON。**' : '\n\n**用自然流暢的中文輸出，不要輸出JSON或代碼格式。**') }] }
          ],
          generationConfig: {
            maxOutputTokens: agentId === 'storyboard' ? 16000 : (needsLongOutput ? 8000 : 4096),
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
async function callClaudeInternal(systemPrompt, userMessage, agentId = '', options = {}) {
  if (currentProvider === 'anthropic') {
    return callAnthropicAPI(systemPrompt, userMessage, agentId);
  } else if (currentProvider === 'gemini') {
    return callGeminiAPI(systemPrompt, userMessage, agentId);
  } else {
    // 🛡️ Bug#5修复: 使用带重试+备份的调用
    return callWithFallback(systemPrompt, userMessage, agentId, options);
  }
}

// 兼容旧代码的别名
const callOpenAICompatible = callWithFallback;

// ========== 流式API（解决Cloudflare 100秒超时）==========
app.post('/api/agent-stream/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { content, context, novel, useReasoner } = req.body;
  
  const agent = AGENTS[agentId];
  if (!agent) {
    return res.status(400).json({ error: `Unknown agent: ${agentId}` });
  }
  
  // 设置SSE头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const provider = PROVIDERS[currentProvider];
    const apiKey = process.env[`${currentProvider.toUpperCase()}_API_KEY`];
    const baseUrl = provider.baseUrl;
    
    // 构建prompt
    const skillsContent = loadAgentSkills(agent.skills);
    const systemPrompt = `${agent.systemPrompt}\n\n${skillsContent}`;
    const userMessage = content || novel || '';
    
    // 使用流式请求
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: provider.models.standard,
        max_tokens: 8192,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });
    
    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ error: 'API error: ' + response.status })}\n\n`);
      res.end();
      return;
    }
    
    // 转发流式响应
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    // 发送完成信号
    res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`);
    res.end();
    
    console.log(`[Stream] ${agentId} completed, ${fullText.length} chars`);
    
  } catch (err) {
    console.error('Stream error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// 单个Agent API路由
app.post('/api/agent/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const { content, context, novel, title, userInput, useReasoner, provider: requestedProvider } = req.body;
  const actualContent = content || novel || userInput || "";
  const options = { useReasoner: useReasoner === true };
  
  // 🆕 支持前端指定provider（临时切换）
  const originalProvider = currentProvider;
  if (requestedProvider && PROVIDERS[requestedProvider]) {
    currentProvider = requestedProvider;
    console.log(`[Provider] 临时切换到 ${requestedProvider}`);
  }
  
  const agent = AGENTS[agentId];
  if (!agent) {
    return res.status(400).json({ 
      error: `Unknown agent: ${agentId}`,
      availableAgents: Object.keys(AGENTS)
    });
  }
  
  if (!actualContent) {
    return res.status(400).json({ error: '缺少内容' });
  }
  
  try {
    console.log(`[${agent.name}] Processing with ${agent.skills.length} skills...`);
    
    // 加载技能方法论内容
    const skillsContent = loadAgentSkills(agent.skills);
    console.log(`[${agent.name}] Loaded ${Math.min(agent.skills.length, runtimeConfig.maxSkills || 2)} skill files (maxSkills=${runtimeConfig.maxSkills})`);
    
    // 构建包含完整方法论的prompt
    const systemPrompt = `${agent.prompt}

---
## 专业方法论参考（必须运用以下方法分析用户内容）：
${skillsContent}
---

**重要：请基于以上方法论，深度分析用户提供的内容。你的回答必须体现出对内容的具体理解，不能给出通用的模板回答。**`;

    // 根据版本配置限制内容长度
    // 🔧 格式重组/剧本解析需要完整内容，使用更高限制
    const longContentAgents = ['format_adapter', 'script_parser', 'novelist', 'screenwriter'];
    const limit = longContentAgents.includes(agentId) 
      ? 50000  // 长内容agent: 5万字上限
      : (runtimeConfig.contentLimit || 2000);
    const truncatedContent = actualContent.length > limit ? actualContent.substring(0, limit) + '\n...(已截断，原文共' + actualContent.length + '字)' : actualContent;
    
    // 🔧 某些agent需要“把关键参数放最前面”，否则模型会忽略JSON背景
    // 参数可能在 context 里或 req.body 顶层
    const targetEpisodes = context?.target_episodes || req.body.target_episodes || context?.targetEpisodes || req.body.targetEpisodes || context?.production?.episodes || req.body.production?.episodes;
    const episodeDuration = context?.episode_duration || req.body.episode_duration || context?.durationMin || req.body.durationMin || context?.production?.durationMin || req.body.production?.durationMin || 3;
    const shotsPerMin = context?.shotsPerMin || req.body.shotsPerMin || context?.production?.shotsPerMin || req.body.production?.shotsPerMin;
    const instruction = context?.instruction || req.body.instruction;

    let userMessage;

    // ============ format_adapter ============
    if (agentId === 'format_adapter' && targetEpisodes) {
      console.log(`[format_adapter] 參數: ${targetEpisodes}集 × ${episodeDuration}分鐘`);
      userMessage = `【重要製作規格 - 必須嚴格遵守！】
• 目標集數：${targetEpisodes} 集
• 每集時長：${episodeDuration} 分鐘
• 每集字數：約 ${episodeDuration * 300} 字

⚠️ 你必須輸出恰好 ${targetEpisodes} 集的JSON！不多不少！

${instruction || '請將劇本重組為短劇格式。'}

劇本內容：
${truncatedContent}`;

    // ============ narrative（章節規劃）===========
    } else if (agentId === 'narrative' && targetEpisodes) {
      console.log(`[narrative] 參數: ${targetEpisodes}集 × ${episodeDuration}分鐘`);
      const shotInfo = shotsPerMin ? `\n• 鏡頭密度：${shotsPerMin} 鏡/分鐘（每集約 ${shotsPerMin * episodeDuration} 鏡）` : '';
      userMessage = `【重要製作規格 - 必須嚴格遵守！】
• 目標集數：${targetEpisodes} 集
• 每集時長：${episodeDuration} 分鐘${shotInfo}

⚠️ 你必須輸出恰好 ${targetEpisodes} 集的章節（JSON.chapters陣列），不多不少！

${instruction || ''}

内容：
${truncatedContent}`;

    // ============ default ============
    } else {
      userMessage = context 
        ? `背景：${JSON.stringify(context)}\n\n内容：\n${truncatedContent}`
        : `内容：\n${truncatedContent}`;
    }
    
    const result = await callClaude(systemPrompt, userMessage, agentId, options);
    
    console.log(`[${agent.name}] Done!`);
    
    // 🧠 解析<thinking>标签中的思考过程
    let finalResult = result.text;
    let thinkingContent = result.reasoning || null;
    
    const thinkingMatch = result.text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      thinkingContent = thinkingMatch[1].trim();
      // 移除thinking标签，只保留正式结果
      finalResult = result.text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
      console.log(`[${agent.name}] Extracted thinking: ${thinkingContent.substring(0, 100)}...`);
    }
    
    // 🔧 处理DeepSeek混在content里的思考过程（没有标签的情况）
    // 检测是否需要JSON输出，如果是，提取JSON部分；若最终仍非JSON，则返回“错误JSON”避免前端对话框混入分析文本
    if (needsJsonOutput(agentId)) {
      const tryParse = (s) => {
        try { JSON.parse(s); return true; } catch { return false; }
      };

      // 1) 粗提取：第一個{到最後一個}
      if (finalResult && finalResult.includes('{')) {
        const firstBrace = finalResult.indexOf('{');
        const lastBrace = finalResult.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const potentialJson = finalResult.substring(firstBrace, lastBrace + 1);
          if (tryParse(potentialJson)) {
            if (firstBrace > 50) {
              thinkingContent = finalResult.substring(0, firstBrace).trim();
              console.log(`[${agent.name}] Stripped ${firstBrace} chars of thinking from content`);
            }
            finalResult = potentialJson;
          }
        }
      }

      // 2) 兜底：若仍不是有效JSON，直接包成JSON错误（避免把分析文字返回给前端）
      if (!tryParse(finalResult)) {
        console.log(`[${agent.name}] Non-JSON output detected; wrapping as error JSON`);
        finalResult = JSON.stringify({
          error: 'non_json_output',
          agent: agentId,
          message: '模型未按要求输出纯JSON（已拦截非JSON文本）。请重试。',
          raw: String(finalResult || '').slice(0, 8000)
        });
      }
    }
    
    // 🆕 恢复原provider
    if (requestedProvider) currentProvider = originalProvider;
    
    res.json({ 
      result: finalResult, 
      agent: agentId,
      agentName: agent.name,
      skillsUsed: agent.skills,
      tokens: result.tokens,
      totalTokens: totalTokens,
      reasoning: thinkingContent,  // 思考过程（<thinking>标签或DeepSeek reasoner）
      provider: requestedProvider || currentProvider  // 🆕 返回使用的provider
    });
  } catch (err) {
    // 🆕 恢复原provider
    if (requestedProvider) currentProvider = originalProvider;
    
    console.error(`[${agent.name}] Error:`, err.message);
    // 🔧 确保错误响应也有CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.status(500).json({ error: err.message, agent: agentId });
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
  
  const { content, context, novel, title, analysis, interview, chapters, characters, concept, artStyle, artStyleName } = req.body;
  
  // 根據不同Agent類型構建內容
  let actualContent = content || novel || '';
  let contextData = context || {};
  
  // 🎨 畫風信息（用於服化道等需要統一風格的Agent）
  const styleInfo = artStyle ? `\n\n【🎨 畫風設置】\n用戶選擇的畫風：${artStyleName || '電影級'}\n畫風關鍵詞：${artStyle}\n**所有ai_prompt結尾必須加上這個畫風關鍵詞！**` : '';
  
  // 🎤 訪談Agent：特殊處理，確保小說內容被正確傳入
  // 🐛 修復：前端通過 content 傳入小說，不是 novel 字段
  if (agentId === 'interview' && (novel || content)) {
    // 傳入小說內容，讓AI閱讀後生成針對性問題
    actualContent = (novel || content).substring(0, 6000);  // 限制長度防超時
    contextData = { 
      type: 'interview_generation',
      title: title || '未命名故事',
      task: `請仔細閱讀以下故事內容，然後生成6-10個針對性採訪問題。

🚨 重要規則：
1. 問題必須包含故事中的【具體人物名字】和【具體情節】
2. 不要問籠統問題如"主角為什麼..."
3. 要問具體問題如"[角色名]在[具體場景]為什麼..."
4. 必須返回JSON格式，必須包含 interview_questions 數組`
    };
  }
  // 高概念Agent：使用analysis和interview
  else if (agentId === 'concept' && (analysis || interview)) {
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
  // 🔗 劇本Agent：支持前後章節關聯 + 原文改編
  else if (agentId === 'screenwriter') {
    const { chapter, chapterIndex, novelContent, previousChapterEnding, nextChapterHint, totalChapters } = req.body;
    
    // 包含原文內容
    actualContent = JSON.stringify({ 
      chapter,
      novelContent: novelContent?.substring(0, 4000),
      characters,
      concept,
      interview
    }, null, 2);
    
    // 構建章節關聯的上下文
    let linkageContext = '';
    if (previousChapterEnding) {
      linkageContext += `\n\n【🔗 前一章劇本結尾】\n${previousChapterEnding}\n**請確保劇本開頭與此自然銜接！**`;
    }
    if (nextChapterHint) {
      linkageContext += `\n\n【🔮 下一章預告】\n${nextChapterHint}\n**請在結尾為此鋪墊伏筆！**`;
    }
    
    contextData = { 
      type: 'script_generation',
      chapterIndex: chapterIndex,
      totalChapters: totalChapters,
      task: `請將第 ${(chapterIndex||0)+1} 章改編為專業劇本。

${novelContent ? '【📖 本章原文】\n' + novelContent.substring(0, 3000) + '\n' : ''}
${linkageContext}

## ⚠️ 輸出要求
1. **直接輸出劇本正文**，不要任何開場白、分析、解釋
2. **不要輸出JSON格式**，只輸出劇本文本
3. **不要使用 Markdown 標記**（如 **粗體**），用純文本

## 劇本格式
【場景1】地點，時間
（環境描寫：氛圍、光線、細節）

角色A走進房間，目光掃過桌上的信封。

角色A：（輕聲）你來了。
角色B：（轉身，眼神閃躲）我...不知道該說什麼。

---
【場景2】...

## 要點
- 動作描寫要具體（不要"他很傷心"，要"他垂下眼睛，手指無意識地摳著桌角"）
- 對白要有潛台詞和衝突
- 忠實於原文內容
${previousChapterEnding ? '\n- 開頭與前一章自然銜接' : ''}
${nextChapterHint ? '\n- 結尾為下一章埋伏筆' : ''}

**現在直接開始輸出劇本（從【場景1】開始）：**`
    };
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
      ? `背景：${JSON.stringify(contextData)}${styleInfo}\n\n${title ? '標題：'+title+'\n\n' : ''}请深度分析以下内容：\n${truncatedContent}`
      : `${title ? '標題：'+title+'\n\n' : ''}${styleInfo}\n\n请深度分析以下内容：\n${truncatedContent}`;
    
    const result = await callClaude(systemPrompt, userMessage, agentId);
    
    // 🔧 角色Agent后处理 - 确保ai_prompt等必要字段存在
    let finalText = result.text;
    if (agentId === 'character' && needsJsonOutput(agentId)) {
      try {
        // 提取JSON
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let parsed = safeJSONParse(jsonMatch[0], agentId);
          parsed = validateAndFixCharacters(parsed);
          finalText = JSON.stringify(parsed, null, 2);
          console.log(`[${agent.name}] ✅ 角色数据已验证并补全`);
        }
      } catch (e) {
        console.warn(`[${agent.name}] 角色后处理失败，返回原始结果:`, e.message);
      }
    }
    
    console.log(`[${agent.name}] Done!`);
    res.json({ 
      result: finalText, 
      agent: agentId, 
      skillsUsed: agent.skills, 
      tokens: result.tokens, 
      totalTokens,
      reasoning: result.reasoning  // 思考过程（如果有）
    });
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
    build: {
      renderGitCommit: process.env.RENDER_GIT_COMMIT || null,
      renderServiceId: process.env.RENDER_SERVICE_ID || null,
      nodeEnv: process.env.NODE_ENV || null
    },
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

// 獲取隊列狀態 - 前端輪詢用
app.get('/api/queue', (req, res) => {
  res.json(getQueueStatus());
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
  const model = provider?.models?.best || 'deepseek-chat';
  
  console.log(`[Stream] Starting stream with ${provider?.name}, model: ${model}`);
  
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 64000,
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
    
    // 優先使用 Google Gemini (免費)，其次 Anthropic
    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    if (!geminiKey && !anthropicKey) {
      return res.status(400).json({ error: '圖片分析需要 GOOGLE_API_KEY 或 ANTHROPIC_API_KEY' });
    }
    
    const analysisPrompt = `分析這張圖片的視覺風格，輸出JSON：
{
  "style_name": "風格名稱",
  "mood": "氛圍",
  "color_palette": ["主色1", "主色2", "主色3"],
  "lighting": "光線特點",
  "art_reference": "最接近的藝術風格/作品",
  "prompt_keywords": ["關鍵詞1", "關鍵詞2"],
  "full_prompt": "完整AI繪圖Prompt（英文）"
}
只輸出JSON。`;

    let response;
    
    if (geminiKey) {
      // 使用 Google Gemini (免費額度)
      console.log('[Moodboard] 使用 Gemini Vision 分析圖片...');
      
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      const mimeType = image.includes('data:') ? image.split(';')[0].split(':')[1] : 'image/jpeg';
      
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: analysisPrompt }
            ]
          }]
        })
      });
      
      if (!response.ok) throw new Error(await response.text());
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        return res.json(JSON.parse(jsonStr));
      } catch {
        return res.json({ full_prompt: text, style_name: '分析結果' });
      }
    }
    
    // 備選: 使用 Claude Vision
    console.log('[Moodboard] 使用 Claude Vision 分析圖片...');
    
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
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
            { type: 'text', text: analysisPrompt }
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

// ========== 项目API（V3架构） ==========
import { 
    createPipeline, 
    getPipeline, 
    generateScripts, 
    updateScript,
    generateEpisodeStoryboard,
    generateAllStoryboards,
    getEpisodeStoryboard,
    getAllStoryboards,
    exportPipeline, 
    listPipelines 
} from './pipeline.js';

// Agent调用辅助函数
async function callAgentHelper(agentId, data) {
    const agent = AGENTS[agentId];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    
    const skillsContent = loadAgentSkills(agent.skills);
    const systemPrompt = `${agent.prompt}\n\n---\n## 专业方法论参考：\n${skillsContent}\n---`;
    
    // 支持多种数据格式 (V3 content / V4 sourceText)
    const content = data.content || data.sourceText || '';
    const title = data.title || '';
    const episode = data.episode || null;
    const script = data.script || null;
    
    // 构建用户消息
    let userMessage = '';
    
    if (title) {
        userMessage += `# 项目：${title}\n\n`;
    }
    
    if (episode) {
        userMessage += `## 当前任务：第${episode}集\n`;
        if (data.minutesPerEpisode) {
            userMessage += `时长：${data.minutesPerEpisode}分钟\n`;
        }
        if (data.shotsPerMinute) {
            userMessage += `每分钟镜头数：${data.shotsPerMinute}\n`;
        }
        userMessage += '\n';
    }
    
    if (script) {
        userMessage += `## 本集剧本：\n${typeof script === 'string' ? script : JSON.stringify(script, null, 2)}\n\n`;
    }
    
    if (data.context && Object.keys(data.context).length > 0) {
        userMessage += `## 已有设定：\n${JSON.stringify(data.context, null, 2)}\n\n`;
    }
    
    if (content) {
        userMessage += `## 原始内容：\n${content}\n`;
    }
    
    if (data.totalEpisodes) {
        userMessage += `\n## 要求：生成${data.totalEpisodes}集的完整剧本大纲\n`;
    }
    
    if (data.outputFields) {
        userMessage += `\n## 输出字段要求：\n${data.outputFields.join(', ')}\n`;
    }
    
    console.log(`[${agentId}] 调用Agent，内容长度: ${userMessage.length}字符`);
    
    return await callClaude(systemPrompt, userMessage, agentId);
}

// Step 1: 创建项目
app.post('/api/project/create', (req, res) => {
    const { title, episodes, durationPerEpisode, content, artStyle } = req.body;
    
    if (!title) return res.status(400).json({ error: '缺少项目标题' });
    
    const project = createPipeline({
        title,
        episodes: episodes || 10,
        durationPerEpisode: durationPerEpisode || 10,
        shotsPerMinute: 10,
        content,
        artStyle: artStyle || 'anime style'
    });
    
    console.log(`[Project] 创建: ${project.id} - ${title} (${episodes}集)`);
    res.json({ 
        projectId: project.id,
        title: project.config.title,
        episodes: project.config.episodes,
        durationPerEpisode: project.config.durationPerEpisode
    });
});

// Step 2: 生成所有剧本
app.post('/api/project/:projectId/scripts/generate', async (req, res) => {
    const { projectId } = req.params;
    const project = getPipeline(projectId);
    
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    // 异步生成
    res.json({ status: 'generating', projectId });
    
    generateScripts(projectId, callAgentHelper).catch(err => {
        console.error(`[Project ${projectId}] 剧本生成失败:`, err);
    });
});

// 获取剧本
app.get('/api/project/:projectId/scripts', (req, res) => {
    const project = getPipeline(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    res.json({
        status: project.status,
        scriptsReady: project.progress.scriptsGenerated,
        scripts: project.scripts
    });
});

// 修改单集剧本
app.put('/api/project/:projectId/scripts/:episode', (req, res) => {
    const { projectId, episode } = req.params;
    const updated = updateScript(projectId, parseInt(episode), req.body);
    
    if (!updated) return res.status(404).json({ error: 'Script not found' });
    res.json({ status: 'updated', script: updated });
});

// Step 3: 生成指定集的分镜
app.post('/api/project/:projectId/storyboard/:episode/generate', async (req, res) => {
    const { projectId, episode } = req.params;
    const project = getPipeline(projectId);
    
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.progress.scriptsGenerated) {
        return res.status(400).json({ error: '请先生成剧本' });
    }
    
    const ep = parseInt(episode);
    const shotsExpected = project.config.durationPerEpisode * project.config.shotsPerMinute;
    
    // 异步生成
    res.json({ 
        status: 'generating', 
        episode: ep,
        shotsExpected
    });
    
    generateEpisodeStoryboard(projectId, ep, callAgentHelper).catch(err => {
        console.error(`[Project ${projectId}] 第${ep}集分镜生成失败:`, err);
    });
});

// 自动生成所有分镜（批量模式）
app.post('/api/project/:projectId/storyboard/generate-all', async (req, res) => {
    const { projectId } = req.params;
    const project = getPipeline(projectId);
    
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.progress.scriptsGenerated) {
        return res.status(400).json({ error: '请先生成剧本' });
    }
    
    // 立即返回，后台执行
    const totalEpisodes = project.scripts.length;
    const shotsPerEp = project.config.durationPerEpisode * project.config.shotsPerMinute;
    
    res.json({ 
        status: 'started',
        totalEpisodes,
        shotsPerEpisode: shotsPerEp,
        estimatedTotalShots: totalEpisodes * shotsPerEp,
        message: `开始自动生成${totalEpisodes}集分镜，预计${totalEpisodes * shotsPerEp}镜头`
    });
    
    generateAllStoryboards(projectId, callAgentHelper, (progress) => {
        console.log(`[Project ${projectId}] 进度: ${progress.completed}/${progress.total}集, ${progress.totalShots}镜头`);
    }).catch(err => {
        console.error(`[Project ${projectId}] 批量生成失败:`, err);
    });
});

// 获取指定集的分镜
app.get('/api/project/:projectId/storyboard/:episode', (req, res) => {
    const { projectId, episode } = req.params;
    const project = getPipeline(projectId);
    
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    const ep = parseInt(episode);
    const shots = getEpisodeStoryboard(projectId, ep);
    const isGenerating = project.progress.generatingEpisode === ep;
    const isCompleted = project.progress.completedEpisodes.includes(ep);
    
    res.json({
        episode: ep,
        status: isGenerating ? 'generating' : (isCompleted ? 'completed' : 'pending'),
        shotsCount: shots.length,
        shots
    });
});

// 获取项目状态
app.get('/api/project/:projectId', (req, res) => {
    const project = getPipeline(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    res.json({
        id: project.id,
        status: project.status,
        title: project.config.title,
        config: project.config,
        progress: {
            scriptsReady: project.progress.scriptsGenerated,
            generatingEpisode: project.progress.generatingEpisode,
            completedEpisodes: project.progress.completedEpisodes,
            totalShots: project.progress.totalShots
        },
        timing: project.timing,
        errors: project.errors.slice(-5)
    });
});

// 获取所有分镜（导出用）
app.get('/api/project/:projectId/storyboard', (req, res) => {
    const project = getPipeline(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    const format = req.query.format || 'json';
    const result = exportPipeline(req.params.projectId, format);
    
    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${project.config.title}_storyboard.csv"`);
    }
    
    res.send(result);
});

// 列出所有项目
app.get('/api/projects', (req, res) => {
    res.json(listPipelines());
});

console.log('✅ 项目API (V3架构) 已启用');

// ========== 完整Pipeline API (V4) ==========
import { FullPipeline, PIPELINE_MODES, ENHANCED_STORYBOARD_PROMPT } from './pipeline-full.js';

const fullPipelines = new Map();

// 获取所有模式配置
app.get('/api/pipeline/modes', (req, res) => {
    const modes = Object.entries(PIPELINE_MODES).map(([id, config]) => ({
        id,
        name: config.name,
        description: config.description,
        phases: config.phases.length,
        fields: config.fieldsPerShot.length,
        shotsPerMinute: config.shotsPerMinute
    }));
    res.json(modes);
});

// 创建完整Pipeline项目
app.post('/api/pipeline/create', (req, res) => {
    const { title, sourceText, totalEpisodes, minutesPerEpisode, mode } = req.body;
    
    if (!title || !sourceText) {
        return res.status(400).json({ error: '需要 title 和 sourceText' });
    }
    
    const pipeline = new FullPipeline({
        title,
        sourceText,
        totalEpisodes: totalEpisodes || 24,
        minutesPerEpisode: minutesPerEpisode || 4,
        mode: mode || 'standard'
    });
    
    fullPipelines.set(pipeline.id, pipeline);
    
    res.json({
        id: pipeline.id,
        title: pipeline.title,
        mode: pipeline.mode,
        modeName: pipeline.modeConfig.name,
        totalEpisodes: pipeline.totalEpisodes,
        phases: pipeline.modeConfig.phases.length,
        fields: pipeline.modeConfig.fieldsPerShot
    });
});

// 运行Pipeline（全部集数）
app.post('/api/pipeline/:id/run', async (req, res) => {
    const pipeline = fullPipelines.get(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    
    res.json({ status: 'started', id: pipeline.id, mode: pipeline.mode });
    
    pipeline.run(callAgentHelper, (progress) => {
        console.log(`[Pipeline ${pipeline.id}] ${progress.type}: ${JSON.stringify(progress)}`);
    }).catch(err => {
        console.error(`[Pipeline ${pipeline.id}] Error:`, err);
    });
});

// 运行指定集数（测试用）
app.post('/api/pipeline/:id/run-episodes', async (req, res) => {
    const pipeline = fullPipelines.get(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    
    const episodes = req.body.episodes || [1, 2];
    
    res.json({ 
        status: 'started', 
        id: pipeline.id, 
        mode: pipeline.mode,
        episodes 
    });
    
    pipeline.runEpisodes(episodes, callAgentHelper, (progress) => {
        console.log(`[Pipeline ${pipeline.id}] ${progress.type}: ${JSON.stringify(progress)}`);
    }).catch(err => {
        console.error(`[Pipeline ${pipeline.id}] Error:`, err);
    });
});

// 获取Pipeline状态
app.get('/api/pipeline/:id', (req, res) => {
    const pipeline = fullPipelines.get(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    
    res.json(pipeline.getResults());
});

// 获取Pipeline分镜
app.get('/api/pipeline/:id/storyboard', (req, res) => {
    const pipeline = fullPipelines.get(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
    
    res.json({
        mode: pipeline.mode,
        storyboards: pipeline.storyboards,
        totalShots: Object.values(pipeline.storyboards).flat().length
    });
});

// 列出所有完整Pipeline
app.get('/api/pipelines', (req, res) => {
    const list = Array.from(fullPipelines.values()).map(p => ({
        id: p.id,
        title: p.title,
        mode: p.mode,
        status: p.status,
        progress: p.progress
    }));
    res.json(list);
});

console.log('✅ 完整Pipeline API (V4) 已启用');

// ==================== 🖼️ 图像生成 API (Replicate) ====================
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
const REPLICATE_MODELS = {
  sdxl: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  flux_schnell: 'black-forest-labs/flux-schnell',
  flux_dev: 'black-forest-labs/flux-dev',
  sdxl_lightning: 'bytedance/sdxl-lightning-4step:5f24084160c9089501c1b3545d9be3c27883ae2239b6f412990e82d4a6210f8f'
};

// 生成图片
app.post('/api/generate-image', async (req, res) => {
  if (!REPLICATE_API_KEY) {
    return res.status(500).json({ error: '未配置 REPLICATE_API_KEY' });
  }
  
  const { prompt, model = 'flux_schnell', aspectRatio = '16:9' } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: '缺少 prompt 参数' });
  }
  
  console.log(`🖼️ 生成图片: ${prompt.substring(0, 50)}...`);
  
  try {
    // 创建预测
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: REPLICATE_MODELS[model] || REPLICATE_MODELS.flux_schnell,
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          output_format: 'webp',
          output_quality: 90
        }
      })
    });
    
    const prediction = await createResponse.json();
    
    if (prediction.error) {
      throw new Error(prediction.error);
    }
    
    // 轮询等待结果 (最多60秒)
    let result = prediction;
    const startTime = Date.now();
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      if (Date.now() - startTime > 60000) {
        throw new Error('生成超时');
      }
      await new Promise(r => setTimeout(r, 1000));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` }
      });
      result = await pollResponse.json();
    }
    
    if (result.status === 'failed') {
      throw new Error(result.error || '生成失败');
    }
    
    console.log(`✅ 图片生成成功: ${result.output}`);
    
    res.json({
      success: true,
      url: Array.isArray(result.output) ? result.output[0] : result.output,
      model,
      prompt: prompt.substring(0, 100)
    });
    
  } catch (err) {
    console.error('❌ 图片生成失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 检查生图服务状态
app.get('/api/generate-image/status', (req, res) => {
  res.json({
    enabled: !!REPLICATE_API_KEY,
    models: Object.keys(REPLICATE_MODELS),
    defaultModel: 'flux_schnell'
  });
});

console.log(`🖼️ 图像生成 API ${REPLICATE_API_KEY ? '已启用' : '未启用 (需要REPLICATE_API_KEY)'}`);

// ========== 阿里云通义万相 - 圖片生成 ==========
import { generateImage, generateCharacterImages } from './aliyun-image.js';

const ALIYUN_API_KEY = process.env.ALIYUN_API_KEY;

// 單張圖片生成
app.post('/api/aliyun/generate', async (req, res) => {
    if (!ALIYUN_API_KEY) {
        return res.status(400).json({ error: 'ALIYUN_API_KEY 未配置' });
    }
    
    const { prompt, size, negativePrompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: '缺少 prompt' });
    }
    
    try {
        const result = await generateImage(prompt, { size, negativePrompt });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Aliyun] 生成失敗:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 批量生成角色圖片
app.post('/api/aliyun/characters', async (req, res) => {
    if (!ALIYUN_API_KEY) {
        return res.status(400).json({ error: 'ALIYUN_API_KEY 未配置' });
    }
    
    const { characters } = req.body;
    if (!characters || !Array.isArray(characters)) {
        return res.status(400).json({ error: '缺少 characters 數組' });
    }
    
    try {
        const results = await generateCharacterImages(characters);
        res.json({ success: true, characters: results });
    } catch (err) {
        console.error('[Aliyun] 批量生成失敗:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 檢查阿里云API狀態
app.get('/api/aliyun/status', (req, res) => {
    res.json({
        enabled: !!ALIYUN_API_KEY,
        model: 'wan2.6-t2i',
        provider: '通義萬相'
    });
});

console.log(`🖼️ 阿里云萬相 API ${ALIYUN_API_KEY ? '✅ 已啟用' : '❌ 未配置 (需要ALIYUN_API_KEY)'}`);

// ========== 用户项目持久化存储 (Supabase + 本地备份) ==========
import { initSupabase, isSupabaseEnabled, getUserProjects, saveUserProject, saveAllUserProjects } from './db.js';

// 初始化 Supabase
const useSupabase = initSupabase();

// 本地备份目录
const USER_PROJECTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'user_projects');

// 确保目录存在
try {
  if (!existsSync(USER_PROJECTS_DIR)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(USER_PROJECTS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('无法创建用户项目目录:', e.message);
}

// 获取用户项目 (需要登录；后端从JWT取userId，忽略URL参数)
app.get('/api/user-projects/:userId', requireAuth, async (req, res) => {
  const userId = req.user.id;
  
  // 優先從 Supabase 讀取
  if (isSupabaseEnabled()) {
    const dbProjects = await getUserProjects(userId);
    if (dbProjects !== null) {
      return res.json(dbProjects);
    }
  }
  
  // 本地備份
  const filePath = join(USER_PROJECTS_DIR, `${userId}.json`);
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (e) {
    console.error(`[Projects] 读取失败 ${userId}:`, e.message);
    res.json({});
  }
});

// 保存用户项目 (需要登录；后端从JWT取userId，忽略URL参数)
app.post('/api/user-projects/:userId', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const projects = req.body;
  const filePath = join(USER_PROJECTS_DIR, `${userId}.json`);
  
  try {
    // 寫本地備份
    writeFileSync(filePath, JSON.stringify(projects, null, 2));
    
    // 寫 Supabase
    if (isSupabaseEnabled()) {
      await saveAllUserProjects(userId, projects);
    }
    
    console.log(`[Projects] 保存成功 ${userId}: ${Object.keys(projects).length} 个项目`);
    res.json({ status: 'ok', count: Object.keys(projects).length, db: isSupabaseEnabled() });
  } catch (e) {
    console.error(`[Projects] 保存失败 ${userId}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// 同步单个项目（增量更新，需要登录；后端从JWT取userId，忽略URL参数）
app.put('/api/user-projects/:userId/:projectId', requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const projectData = req.body;
  const filePath = join(USER_PROJECTS_DIR, `${userId}.json`);
  
  try {
    // 寫 Supabase
    if (isSupabaseEnabled()) {
      await saveUserProject(userId, projectId, projectData);
    }
    
    // 寫本地備份
    let projects = {};
    if (existsSync(filePath)) {
      projects = JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    projects[projectId] = projectData;
    writeFileSync(filePath, JSON.stringify(projects, null, 2));
    
    console.log(`[Projects] 更新 ${userId}/${projectId}`);
    res.json({ status: 'ok', db: isSupabaseEnabled() });
  } catch (e) {
    console.error(`[Projects] 更新失败:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

console.log(`💾 用户项目存储: ${useSupabase ? '☁️ Supabase + 本地' : '📁 本地存储'}`);

app.listen(PORT, () => {
  const provider = PROVIDERS[currentProvider];
  console.log(`🎬 AI番劇 Agent Server v3 (Multi-Provider)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   🤖 Provider: ${provider?.name || currentProvider}`);
  console.log(`   📊 ${STATS.totalAgents} Agents | ${STATS.totalSkills} Skills`);
});
