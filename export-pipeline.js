#!/usr/bin/env node
/**
 * 导出Pipeline结果到Excel - 所有信息放在同一行的不同列
 * 用法: node export-pipeline.js <pipelineId> [outputPath]
 */

import * as XLSX from 'xlsx';

const API_BASE = 'http://localhost:3001';

async function fetchPipeline(pipelineId) {
  const res = await fetch(`${API_BASE}/api/pipeline/${pipelineId}`);
  if (!res.ok) throw new Error(`Failed to fetch pipeline: ${res.status}`);
  return res.json();
}

/**
 * 解析storyboard输出，提取镜头数据
 */
function parseStoryboard(text) {
  if (!text) return [];
  
  // 尝试解析JSON数组
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {}
  
  // 尝试解析JSON对象中的shots字段
  try {
    const obj = JSON.parse(text);
    if (obj.shots) return obj.shots;
    if (obj.storyboard) return obj.storyboard;
    if (Array.isArray(obj)) return obj;
  } catch (e) {}
  
  // 文本格式解析
  const shots = [];
  const lines = text.split('\n');
  let currentShot = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 检测镜头开始
    if (/^(镜头|Shot|S\d+|#\d+)/i.test(trimmed)) {
      if (Object.keys(currentShot).length > 0) {
        shots.push(currentShot);
      }
      currentShot = { raw: trimmed };
    }
    
    // 提取字段
    const fieldMatch = trimmed.match(/^(画面描述|视频描述|Image_Prompt|Video_Prompt|时长|景别|运镜)[：:]\s*(.+)/);
    if (fieldMatch) {
      currentShot[fieldMatch[1]] = fieldMatch[2];
    }
  }
  
  if (Object.keys(currentShot).length > 0) {
    shots.push(currentShot);
  }
  
  return shots;
}

/**
 * 合并所有Agent输出到镜头行
 */
function mergeOutputsToShots(outputs, episodes, config) {
  const allShots = [];
  const storyboards = outputs.storyboard || [];
  
  // 获取全局上下文
  const globalContext = {
    concept: outputs.concept?.text || '',
    artstyle: outputs.artstyle?.text || '',
    characters: outputs.characters?.text || '',
    scenes: outputs.scenes?.text || '',
    culture: outputs.culture?.text || '',
    lighting: outputs.lighting?.text || '',
    color: outputs.color?.text || ''
  };
  
  // 处理每集的storyboard
  for (let epIdx = 0; epIdx < episodes.length; epIdx++) {
    const epNum = episodes[epIdx];
    const epStoryboard = storyboards[epIdx] || '';
    const shots = parseStoryboard(epStoryboard);
    
    // 获取该集的其他Agent输出
    const epMusic = outputs.music?.[epIdx] || '';
    const epCinematography = outputs.cinematography?.[epIdx] || '';
    const epBlocking = outputs.blocking?.[epIdx] || '';
    const epActing = outputs.acting?.[epIdx] || '';
    const epExpression = outputs.expression?.[epIdx] || '';
    const epPose = outputs.pose?.[epIdx] || '';
    const epPrompts = outputs.prompts?.[epIdx] || '';
    const epPlatform = outputs.platform?.[epIdx] || '';
    const epVfx = outputs.vfx?.[epIdx] || '';
    const epWeather = outputs.weather?.[epIdx] || '';
    
    // 如果没有解析到shots，创建默认镜头
    if (shots.length === 0) {
      const shotsPerEp = (config.minutesPerEpisode || 3) * (config.shotsPerMinute || 10);
      for (let i = 0; i < shotsPerEp; i++) {
        shots.push({ shot_id: `EP${epNum}_S${String(i+1).padStart(3,'0')}` });
      }
    }
    
    // 为每个镜头添加所有信息
    shots.forEach((shot, shotIdx) => {
      allShots.push({
        '序号': allShots.length + 1,
        '镜头ID': shot.shot_id || `EP${epNum}_S${String(shotIdx+1).padStart(3,'0')}`,
        '集数': epNum,
        '场景': shot.scene || shot.场景 || '',
        '画面描述': shot.画面描述 || shot.scene_description || shot.description || '',
        '视频描述': shot.视频描述 || shot.video_description || shot.action || '',
        '画风': shot.画风 || extractFromText(globalContext.artstyle, '画风'),
        '旁白': shot.旁白 || shot.narration || '',
        '台词': shot.台词 || shot.dialogue || '',
        '演技指导': shot.演技指导 || extractFromText(epActing, '演技'),
        '表情': shot.表情 || extractFromText(epExpression, '表情'),
        '动作': shot.动作 || shot.pose || extractFromText(epPose, '动作'),
        '音乐': shot.音乐 || extractFromText(epMusic, '音乐'),
        '音效': shot.音效 || shot.sound_effect || '',
        '灯光': shot.灯光 || extractFromText(globalContext.lighting, '灯光'),
        '运镜': shot.运镜 || shot.camera_movement || extractFromText(epCinematography, '运镜'),
        '景别': shot.景别 || shot.shot_type || '',
        '时长': shot.时长 || shot.duration || 5,
        'Image_Prompt': shot.Image_Prompt || shot.image_prompt || '',
        'Video_Prompt': shot.Video_Prompt || shot.video_prompt || '',
        '平台参数': shot.平台参数 || extractFromText(epPlatform, '参数'),
        '特效备注': shot.特效备注 || extractFromText(epVfx, '特效')
      });
    });
  }
  
  return allShots;
}

/**
 * 从文本中提取特定字段
 */
function extractFromText(text, field) {
  if (!text) return '';
  const match = text.match(new RegExp(`${field}[：:：]\\s*([^\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

async function exportPipelineToExcel(pipelineId, outputPath) {
  console.log(`📊 导出Pipeline: ${pipelineId}`);
  
  const pipeline = await fetchPipeline(pipelineId);
  
  if (!pipeline || !pipeline.id) {
    throw new Error('Pipeline not found');
  }
  
  console.log(`📝 项目: ${pipeline.title}`);
  console.log(`🎬 模式: ${pipeline.modeName || pipeline.mode}`);
  console.log(`📋 阶段: ${pipeline.stats?.phasesCompleted}/${pipeline.stats?.phasesTotal}`);
  
  const outputs = pipeline.outputs || {};
  const episodes = pipeline.episodes || [1, 2];
  const config = pipeline.config || {};
  
  // 合并所有输出到镜头行
  const allShots = mergeOutputsToShots(outputs, episodes, config);
  
  console.log(`📊 总镜头数: ${allShots.length}`);
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: 完整分镜表（所有列）
  const ws1 = XLSX.utils.json_to_sheet(allShots);
  
  // 设置列宽
  ws1['!cols'] = [
    { wch: 6 },   // 序号
    { wch: 14 },  // 镜头ID
    { wch: 5 },   // 集数
    { wch: 15 },  // 场景
    { wch: 50 },  // 画面描述
    { wch: 30 },  // 视频描述
    { wch: 20 },  // 画风
    { wch: 30 },  // 旁白
    { wch: 30 },  // 台词
    { wch: 25 },  // 演技指导
    { wch: 15 },  // 表情
    { wch: 20 },  // 动作
    { wch: 20 },  // 音乐
    { wch: 15 },  // 音效
    { wch: 15 },  // 灯光
    { wch: 15 },  // 运镜
    { wch: 10 },  // 景别
    { wch: 6 },   // 时长
    { wch: 60 },  // Image_Prompt
    { wch: 40 },  // Video_Prompt
    { wch: 20 },  // 平台参数
    { wch: 20 }   // 特效备注
  ];
  
  XLSX.utils.book_append_sheet(wb, ws1, '完整分镜表');
  
  // Sheet 2: 全局设计（concept, character, artstyle等）
  const globalDesign = [];
  
  if (outputs.concept) {
    globalDesign.push({ '类型': '概念设计', '内容': outputs.concept.text?.substring(0, 30000) || JSON.stringify(outputs.concept).substring(0, 30000) });
  }
  if (outputs.scripts) {
    globalDesign.push({ '类型': '剧本大纲', '内容': outputs.scripts.text?.substring(0, 30000) || JSON.stringify(outputs.scripts).substring(0, 30000) });
  }
  if (outputs.characters) {
    globalDesign.push({ '类型': '角色设计', '内容': outputs.characters.text?.substring(0, 30000) || JSON.stringify(outputs.characters).substring(0, 30000) });
  }
  if (outputs.artstyle) {
    globalDesign.push({ '类型': '画风定义', '内容': outputs.artstyle.text?.substring(0, 30000) || JSON.stringify(outputs.artstyle).substring(0, 30000) });
  }
  if (outputs.scenes) {
    globalDesign.push({ '类型': '场景设计', '内容': outputs.scenes.text?.substring(0, 30000) || JSON.stringify(outputs.scenes).substring(0, 30000) });
  }
  
  if (globalDesign.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(globalDesign);
    ws2['!cols'] = [{ wch: 15 }, { wch: 150 }];
    XLSX.utils.book_append_sheet(wb, ws2, '全局设计');
  }
  
  // Sheet 3: 项目摘要
  const summary = [
    { '字段': 'Pipeline ID', '值': pipeline.id },
    { '字段': '项目名称', '值': pipeline.title },
    { '字段': '模式', '值': pipeline.modeName || pipeline.mode },
    { '字段': '状态', '值': pipeline.status },
    { '字段': '阶段完成', '值': `${pipeline.stats?.phasesCompleted}/${pipeline.stats?.phasesTotal}` },
    { '字段': '总集数', '值': pipeline.totalEpisodes },
    { '字段': '测试集数', '值': episodes.join(', ') },
    { '字段': '总镜头数', '值': allShots.length },
    { '字段': '耗时(秒)', '值': Math.round((pipeline.duration || 0) / 1000) },
    { '字段': '导出时间', '值': new Date().toISOString() }
  ];
  
  const ws3 = XLSX.utils.json_to_sheet(summary);
  ws3['!cols'] = [{ wch: 15 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws3, '项目摘要');
  
  // 保存文件
  const finalPath = outputPath || `/tmp/${pipeline.title || pipelineId}_完整分镜.xlsx`;
  XLSX.writeFile(wb, finalPath);
  
  console.log(`✅ 导出成功: ${finalPath}`);
  console.log(`   - 完整分镜表: ${allShots.length} 行 × 21 列`);
  
  return finalPath;
}

// Main
const pipelineId = process.argv[2];
const outputPath = process.argv[3];

if (!pipelineId) {
  console.log('用法: node export-pipeline.js <pipelineId> [outputPath]');
  console.log('示例: node export-pipeline.js pipeline_1771327064717 /tmp/output.xlsx');
  process.exit(1);
}

exportPipelineToExcel(pipelineId, outputPath).catch(err => {
  console.error('❌ 导出失败:', err.message);
  process.exit(1);
});
