#!/usr/bin/env node
/**
 * 完整Pipeline测试
 * 测试千与千寻 24集，每集3-5分钟
 * 3种模式：简单/标准/专业
 * 输出第1集和第2集的结果
 */

import { FullPipeline, PIPELINE_MODES } from './pipeline-full.js';
import { AGENTS } from './agents-config.js';
import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';

const API_BASE = 'http://localhost:3001';

// 千与千寻故事概要
const SPIRITED_AWAY_SOURCE = `
《千与千寻》改编版 - 24集AI番剧

## 原作基础
宫崎骏经典动画《千与千寻》的故事延展，讲述千寻在神隐世界的冒险。

## 改编方向
- 保留原作核心：成长、勇气、爱与救赎
- 扩展世界观：更多神灵角色、汤屋内部运作
- 深化人物：白龙前史、汤婆婆过去、无脸男心理
- 新增支线：汤屋其他员工的故事

## 24集结构（每集4分钟）
### 第一幕：神隐（1-6集）
1. 搬家途中迷路，发现神秘隧道
2. 父母被变成猪，千寻孤身一人
3. 遇见白龙，进入汤屋
4. 签下契约，成为小千
5. 适应汤屋生活，遇到锅炉爷爷
6. 第一次服务客人

### 第二幕：成长（7-12集）
7. 无脸男出现
8. 腐烂神来访（实为河神）
9. 白龙受伤
10. 千寻决定救白龙
11. 拜访�的婆婆
12. 获得帮助

### 第三幕：救赎（13-18集）
13. 无脸男失控
14. 前往沼之底
15. 海上列车之旅
16. 抵达钱婆婆住处
17. 获得护身符
18. 返回汤屋

### 第四幕：归途（19-24集）
19. 与汤婆婆对峙
20. 回忆起白龙真名
21. 白龙恢复记忆
22. 解除父母魔咒
23. 告别神隐世界
24. 回到人间，成长的千寻

## 角色
- 千寻/小千：10岁女孩，胆小但善良
- 白龙/赈早见琥珀主：神秘少年，河神化身
- 汤婆婆：汤屋主人，贪婪但有原则
- 钱婆婆：汤婆婆的孪生姐姐，和善
- 无脸男：孤独的神灵，渴望被接纳
- 锅炉爷爷：汤屋的锅炉房管理员
- 小玲：汤屋员工，照顾千寻

## 视觉风格
- 主风格：吉卜力水彩风格
- 神隐世界：色彩绚丽、充满想象力
- 现实世界：写实、略带灰暗
- 光影：黄昏、夜晚、晨曦的光线变化
`;

// 调用Agent的函数
async function callAgent(agentId, params) {
  const response = await fetch(`${API_BASE}/api/agent/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  if (!response.ok) {
    throw new Error(`Agent ${agentId} failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.result || data;
}

// 进度回调
function onProgress(event) {
  const time = new Date().toLocaleTimeString();
  switch (event.type) {
    case 'phase_start':
      console.log(`[${time}] 🚀 开始阶段: ${event.phase} (${event.progress.phase}/${event.progress.total})`);
      break;
    case 'phase_complete':
      console.log(`[${time}] ✅ 完成阶段: ${event.phase}`);
      break;
    case 'episode_progress':
      console.log(`[${time}]   📺 ${event.phase}: 第${event.episode}/${event.total}集`);
      break;
    case 'shot_progress':
      console.log(`[${time}]   🎬 ${event.phase}: ${event.current}/${event.total}镜头`);
      break;
  }
}

// 导出到Excel
async function exportToExcel(results, mode, outputPath) {
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: 分镜表
  const allShots = Object.entries(results.storyboards)
    .flatMap(([ep, shots]) => 
      (Array.isArray(shots) ? shots : []).map(shot => ({
        ...shot,
        episode: parseInt(ep)
      }))
    )
    .sort((a, b) => {
      if (a.episode !== b.episode) return a.episode - b.episode;
      return (a.shot_id || '').localeCompare(b.shot_id || '');
    });
  
  if (allShots.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(allShots);
    XLSX.utils.book_append_sheet(wb, ws1, '分镜表');
  }
  
  // Sheet 2: 剧本
  if (results.outputs.scripts) {
    const scripts = Array.isArray(results.outputs.scripts) 
      ? results.outputs.scripts 
      : [results.outputs.scripts];
    const ws2 = XLSX.utils.json_to_sheet(scripts.map((s, i) => ({
      集数: i + 1,
      标题: s?.title || '',
      概要: s?.summary || (typeof s === 'string' ? s : JSON.stringify(s)),
      场景: Array.isArray(s?.scenes) ? s.scenes.join('\n') : ''
    })));
    XLSX.utils.book_append_sheet(wb, ws2, '剧本');
  }
  
  // Sheet 3: 角色
  if (results.outputs.characters) {
    const chars = Array.isArray(results.outputs.characters)
      ? results.outputs.characters
      : [results.outputs.characters];
    const ws3 = XLSX.utils.json_to_sheet(chars);
    XLSX.utils.book_append_sheet(wb, ws3, '角色');
  }
  
  // Sheet 4: 统计
  const statsData = [
    { 项目: '模式', 值: results.modeName },
    { 项目: '总集数', 值: results.totalEpisodes },
    { 项目: '每集时长(分)', 值: results.minutesPerEpisode },
    { 项目: '总镜头数', 值: results.stats.totalShots },
    { 项目: '完成阶段', 值: `${results.stats.phasesCompleted}/${results.stats.phasesTotal}` },
    { 项目: '耗时(秒)', 值: Math.round((results.duration || 0) / 1000) },
    { 项目: '错误数', 值: results.errors.length }
  ];
  const ws4 = XLSX.utils.json_to_sheet(statsData);
  XLSX.utils.book_append_sheet(wb, ws4, '统计');
  
  XLSX.writeFile(wb, outputPath);
  console.log(`📊 已导出: ${outputPath}`);
}

// 主测试函数
async function runTest() {
  const episodes = [1, 2]; // 只测试第1、2集
  const results = {};
  
  console.log('='.repeat(60));
  console.log('🎬 千与千寻 完整Pipeline测试');
  console.log('='.repeat(60));
  console.log(`测试集数: ${episodes.join(', ')}`);
  console.log(`模式: 简单 / 标准 / 专业`);
  console.log('='.repeat(60));
  
  for (const mode of ['simple', 'standard', 'professional']) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 开始测试: ${PIPELINE_MODES[mode].name}`);
    console.log(`阶段数: ${PIPELINE_MODES[mode].phases.length}`);
    console.log(`输出字段: ${PIPELINE_MODES[mode].fieldsPerShot.length}个`);
    console.log('='.repeat(60));
    
    const pipeline = new FullPipeline({
      id: `test_${mode}_${Date.now()}`,
      title: '千与千寻',
      sourceText: SPIRITED_AWAY_SOURCE,
      totalEpisodes: 24,
      minutesPerEpisode: 4,
      mode
    });
    
    try {
      const result = await pipeline.runEpisodes(episodes, callAgent, onProgress);
      results[mode] = result;
      
      console.log(`\n✅ ${PIPELINE_MODES[mode].name} 完成!`);
      console.log(`   耗时: ${Math.round(result.duration / 1000)}秒`);
      console.log(`   镜头数: ${result.stats.totalShots}`);
      console.log(`   阶段: ${result.stats.phasesCompleted}/${result.stats.phasesTotal}`);
      
      // 导出Excel
      const outputPath = `/tmp/千与千寻_${mode}_E1E2.xlsx`;
      await exportToExcel(result, mode, outputPath);
      
    } catch (error) {
      console.error(`❌ ${mode} 模式失败:`, error);
      results[mode] = { error: error.message };
    }
  }
  
  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  
  for (const [mode, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`${PIPELINE_MODES[mode].name}: ❌ 失败 - ${result.error}`);
    } else {
      console.log(`${PIPELINE_MODES[mode].name}: ✅ ${result.stats.totalShots}镜头, ${Math.round(result.duration/1000)}秒`);
    }
  }
  
  // 保存完整结果
  await fs.writeFile('/tmp/千与千寻_测试结果.json', JSON.stringify(results, null, 2));
  console.log('\n📁 完整结果已保存到 /tmp/千与千寻_测试结果.json');
  
  return results;
}

// 运行测试
runTest().catch(console.error);
