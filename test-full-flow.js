// 完整流程测试 - 2个剧本
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3001';
const TIMEOUT = 180000; // 增加到180秒

const TEST_SCRIPTS = [
  {
    name: '《阿Q正传》',
    file: '/home/beerbear/.openclaw/workspace/ai_drama_studio_v2/test_novels/aq_zhengzhuan.txt',
    style: '讽刺悲剧/中国现代文学'
  },
  {
    name: '《罗密欧与朱丽叶》',
    file: '/home/beerbear/.openclaw/workspace/ai_drama_studio_v2/test_novels/romeo_juliet.txt',
    style: '爱情悲剧/西方戏剧'
  }
];

const FLOW_STEPS = [
  { name: '故事分析', endpoint: '/api/interview', key: 'novel' },
  { name: '高概念提炼', endpoint: '/api/concept', key: 'analysis' },
  { name: '章节规划', endpoint: '/api/chapters', key: 'concept' },
  { name: '人物设计', endpoint: '/api/characters', key: 'chapters' }
];

async function fetchWithTimeout(url, options, timeout = TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function testSingleStep(script, step, context) {
  console.log(`  📌 ${step.name}...`);
  const start = Date.now();
  
  try {
    const body = { title: script.name };
    
    // 根据步骤设置正确的输入
    if (step.key === 'novel') {
      body.novel = context.novel;
      body.content = context.novel;
    } else if (step.key === 'analysis') {
      body.analysis = context.analysis;
      body.interview = context.interview;
    } else if (step.key === 'concept') {
      body.analysis = context.analysis;
      body.concept = context.concept;
      body.novel = context.novel?.substring(0, 5000);
    } else if (step.key === 'chapters') {
      body.chapters = context.chapters;
      body.analysis = context.analysis;
    }
    
    const response = await fetchWithTimeout(`${BASE}${step.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    
    if (data.error) {
      console.log(`    ❌ 失败 (${duration}s): ${data.error}`);
      return { success: false, error: data.error, duration };
    }
    
    // 检查结果质量
    const result = data.result || '';
    const hasSpecificContent = result.includes(script.name.replace(/[《》]/g, '')) ||
      result.toLowerCase().includes('阿q') || 
      result.toLowerCase().includes('romeo') ||
      result.toLowerCase().includes('juliet') ||
      result.includes('精神胜利') ||
      result.includes('未庄') ||
      result.includes('维罗纳') ||
      result.includes('蒙太古');
    
    const qualityScore = hasSpecificContent ? '✅ 内容相关' : '⚠️ 可能模板化';
    
    console.log(`    ✅ 完成 (${duration}s) ${qualityScore}`);
    console.log(`       Tokens: ${data.tokens?.input || '?'}入/${data.tokens?.output || '?'}出`);
    console.log(`       技能: ${data.skillsUsed?.slice(0, 3).join(', ') || 'N/A'}...`);
    
    return { 
      success: true, 
      result: result.substring(0, 500), 
      duration,
      hasSpecificContent,
      tokens: data.tokens,
      skillsUsed: data.skillsUsed
    };
    
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`    ❌ 异常 (${duration}s): ${err.message}`);
    return { success: false, error: err.message, duration };
  }
}

async function testScript(script) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📖 测试 ${script.name} (${script.style})`);
  console.log('='.repeat(60));
  
  const novel = readFileSync(script.file, 'utf-8');
  console.log(`   原文长度: ${novel.length} 字符\n`);
  
  const context = { novel };
  const results = [];
  
  for (const step of FLOW_STEPS) {
    const result = await testSingleStep(script, step, context);
    results.push({ step: step.name, ...result });
    
    // 更新context供下一步使用
    if (result.success && result.result) {
      if (step.name === '故事分析') {
        context.analysis = result.result;
        context.interview = result.result;
      } else if (step.name === '高概念提炼') {
        context.concept = result.result;
      } else if (step.name === '章节规划') {
        context.chapters = result.result;
      }
    }
    
    // 每步间隔2秒避免rate limit
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return results;
}

async function main() {
  console.log('🎬 AI番劇工作台 - 完整流程测试');
  console.log(`   测试 ${TEST_SCRIPTS.length} 个剧本 × ${FLOW_STEPS.length} 个步骤\n`);
  
  // 检查服务器
  try {
    const health = await fetch(`${BASE}/health`);
    const h = await health.json();
    console.log(`✅ 服务器在线: ${h.stats.totalAgents} Agents, ${h.stats.totalSkills} Skills\n`);
  } catch (e) {
    console.log('❌ 服务器未响应');
    process.exit(1);
  }
  
  const allResults = {};
  
  for (const script of TEST_SCRIPTS) {
    allResults[script.name] = await testScript(script);
  }
  
  // 汇总报告
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 测试汇总报告');
  console.log('='.repeat(60));
  
  let totalSuccess = 0;
  let totalTests = 0;
  let totalSpecific = 0;
  
  for (const [name, results] of Object.entries(allResults)) {
    console.log(`\n${name}:`);
    for (const r of results) {
      totalTests++;
      if (r.success) totalSuccess++;
      if (r.hasSpecificContent) totalSpecific++;
      
      const status = r.success 
        ? (r.hasSpecificContent ? '✅' : '⚠️')
        : '❌';
      console.log(`  ${status} ${r.step}: ${r.duration}s ${r.error || ''}`);
    }
  }
  
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`总计: ${totalSuccess}/${totalTests} 成功 (${(100*totalSuccess/totalTests).toFixed(0)}%)`);
  console.log(`质量: ${totalSpecific}/${totalSuccess} 内容相关 (${totalSuccess ? (100*totalSpecific/totalSuccess).toFixed(0) : 0}%)`);
  
  // 获取总token消耗
  try {
    const tokens = await fetch(`${BASE}/api/tokens`).then(r => r.json());
    console.log(`\nToken消耗: ${tokens.input}入 / ${tokens.output}出`);
    console.log(`预估成本: $${tokens.cost.toFixed(4)}`);
  } catch (e) {}
  
  console.log('\n测试完成！');
}

main().catch(console.error);
