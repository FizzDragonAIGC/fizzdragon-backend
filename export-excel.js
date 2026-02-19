#!/usr/bin/env node
/**
 * 导出分镜表到Excel
 * 用法: node export-excel.js <projectId> [outputPath]
 */

import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';

const API_BASE = 'http://localhost:3001';

async function fetchProject(projectId) {
  const res = await fetch(`${API_BASE}/api/project/${projectId}`);
  if (!res.ok) throw new Error(`Failed to fetch project: ${res.status}`);
  return res.json();
}

async function fetchStoryboard(projectId) {
  const res = await fetch(`${API_BASE}/api/project/${projectId}/storyboard`);
  if (!res.ok) throw new Error(`Failed to fetch storyboard: ${res.status}`);
  return res.json();
}

async function fetchScripts(projectId) {
  const res = await fetch(`${API_BASE}/api/project/${projectId}/scripts`);
  if (!res.ok) throw new Error(`Failed to fetch scripts: ${res.status}`);
  return res.json();
}

async function exportToExcel(projectId, outputPath) {
  console.log(`📊 导出项目: ${projectId}`);
  
  // 获取数据
  const [project, storyboard, scripts] = await Promise.all([
    fetchProject(projectId),
    fetchStoryboard(projectId),
    fetchScripts(projectId)
  ]);
  
  console.log(`📝 项目: ${project.title}`);
  console.log(`🎬 分镜数: ${Array.isArray(storyboard) ? storyboard.length : Object.values(storyboard).flat().length}`);
  console.log(`📜 剧本数: ${scripts.length}`);
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: 分镜表
  const storyboardData = Array.isArray(storyboard) ? storyboard : Object.values(storyboard).flat();
  
  const storyboardRows = storyboardData.map((shot, idx) => ({
    '序号': idx + 1,
    '镜头ID': shot.shot_id || `S${String(idx+1).padStart(4,'0')}`,
    '集数': shot.episode || Math.floor(idx / 10) + 1,
    '画面描述': shot.画面描述 || shot.scene_description || '',
    '视频描述': shot.视频描述 || shot.video_description || '',
    'Image_Prompt': shot.Image_Prompt || shot.image_prompt || '',
    'Video_Prompt': shot.Video_Prompt || shot.video_prompt || '',
    '时长(秒)': shot.duration || 5,
    '景别': shot.shot_type || '',
    '运镜': shot.camera_movement || ''
  }));
  
  const ws1 = XLSX.utils.json_to_sheet(storyboardRows);
  
  // 设置列宽
  ws1['!cols'] = [
    { wch: 6 },   // 序号
    { wch: 12 },  // 镜头ID
    { wch: 6 },   // 集数
    { wch: 60 },  // 画面描述
    { wch: 40 },  // 视频描述
    { wch: 80 },  // Image_Prompt
    { wch: 40 },  // Video_Prompt
    { wch: 8 },   // 时长
    { wch: 10 },  // 景别
    { wch: 15 }   // 运镜
  ];
  
  XLSX.utils.book_append_sheet(wb, ws1, '分镜表');
  
  // Sheet 2: 剧本大纲
  if (scripts && scripts.length > 0) {
    const scriptRows = scripts.map((script, idx) => ({
      '集数': idx + 1,
      '标题': script.title || `第${idx+1}集`,
      '概要': script.summary || '',
      '场景': Array.isArray(script.scenes) ? script.scenes.join('\n') : (script.scenes || ''),
      '时长(分钟)': script.duration || project.minutesPerEpisode || 3
    }));
    
    const ws2 = XLSX.utils.json_to_sheet(scriptRows);
    ws2['!cols'] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 80 },
      { wch: 60 },
      { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '剧本大纲');
  }
  
  // Sheet 3: 项目信息
  const infoRows = [
    { '字段': '项目ID', '值': project.id },
    { '字段': '项目名称', '值': project.title },
    { '字段': '总集数', '值': project.totalEpisodes },
    { '字段': '每集时长(分钟)', '值': project.minutesPerEpisode },
    { '字段': '总镜头数', '值': storyboardData.length },
    { '字段': '导出时间', '值': new Date().toISOString() }
  ];
  const ws3 = XLSX.utils.json_to_sheet(infoRows);
  XLSX.utils.book_append_sheet(wb, ws3, '项目信息');
  
  // 保存文件
  const finalPath = outputPath || `/tmp/${project.title || projectId}_分镜表.xlsx`;
  XLSX.writeFile(wb, finalPath);
  
  console.log(`✅ 导出成功: ${finalPath}`);
  console.log(`   - 分镜表: ${storyboardRows.length} 行`);
  console.log(`   - 剧本大纲: ${scripts.length} 行`);
  
  return finalPath;
}

// Main
const projectId = process.argv[2];
const outputPath = process.argv[3];

if (!projectId) {
  console.log('用法: node export-excel.js <projectId> [outputPath]');
  console.log('示例: node export-excel.js project_1771322090982 /tmp/output.xlsx');
  process.exit(1);
}

exportToExcel(projectId, outputPath).catch(err => {
  console.error('❌ 导出失败:', err.message);
  process.exit(1);
});
