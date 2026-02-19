import * as XLSX from 'xlsx';

const API_BASE = 'http://localhost:3001';
const projectId = 'project_1771322090982';

async function main() {
  const projectRes = await fetch(`${API_BASE}/api/project/${projectId}`);
  const project = await projectRes.json();
  
  const storyboardRes = await fetch(`${API_BASE}/api/project/${projectId}/storyboard`);
  const storyboard = await storyboardRes.json();
  
  const scripts = project.scripts || [];
  
  console.log(`📝 项目: ${project.title}`);
  console.log(`🎬 分镜数: ${storyboard.length}`);
  console.log(`📜 剧本数: ${scripts.length}`);
  
  const wb = XLSX.utils.book_new();
  
  const storyboardRows = storyboard.map((shot, idx) => ({
    '序号': idx + 1,
    '镜头ID': shot.shot_id,
    '集数': shot.episode,
    '画面描述': shot.画面描述,
    '视频描述': shot.视频描述,
    'Image_Prompt': shot.Image_Prompt,
    'Video_Prompt': shot.Video_Prompt
  }));
  
  const ws1 = XLSX.utils.json_to_sheet(storyboardRows);
  ws1['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 6 },
    { wch: 80 }, { wch: 50 }, { wch: 100 }, { wch: 50 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, '分镜表');
  
  if (scripts.length > 0) {
    const scriptRows = scripts.map((s, idx) => ({
      '集数': s.episode || idx + 1,
      '标题': s.title,
      '概要': s.summary,
      '场景': Array.isArray(s.scenes) ? s.scenes.join('\n') : ''
    }));
    const ws2 = XLSX.utils.json_to_sheet(scriptRows);
    ws2['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 80 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, '剧本大纲');
  }
  
  const outPath = '/tmp/千与千寻_分镜表.xlsx';
  XLSX.writeFile(wb, outPath);
  console.log(`✅ 导出: ${outPath}`);
}

main().catch(e => console.error('Error:', e));
