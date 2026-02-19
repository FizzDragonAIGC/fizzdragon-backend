const fetch = require('node-fetch');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const DEEPSEEK_API_KEY = envContent.match(/DEEPSEEK_API_KEY=([^\n]+)/)?.[1];

async function expandBatch(shots) {
  const shotsData = shots.map(s => ({
    shot_id: s.shot_id,
    shot_type: s.shot_type,
    camera_angle: s.camera_angle,
    camera_movement: s.camera_movement,
    character: s.character,
    emotion: s.emotion,
    action: s.action,
    location: s.location,
    time_of_day: s.time_of_day,
    lighting_style: s.lighting_style,
    color_palette: s.color_palette,
    dialogue: s.dialogue
  }));

  const prompt = `你是专业的电影分镜描述专家。把下面的镜头标签扩写成完整的画面描述。

要求：
1. 画面描述：中文完整句子（50-100字），要有电影感，像在看电影
2. Image_Prompt：英文完整提示词，适合Midjourney/SD，包含风格、构图、灯光、--ar 16:9
3. Video_Prompt：英文视频提示词，强调动作和镜头运动，适合Runway/Pika
4. 返回纯JSON数组

镜头数据：
${JSON.stringify(shotsData, null, 2)}

输出JSON数组：
[
  { 
    "shot_id": "E001_S001", 
    "画面描述": "完整中文描述50-100字...", 
    "Image_Prompt": "English prompt with style, composition, lighting, 8K, --ar 16:9",
    "Video_Prompt": "Motion description, camera movement, 4 seconds"
  }
]`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.7
    })
  });

  const data = await response.json();
  return data;
}

function parseJSON(content) {
  try {
    const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(content);
  } catch(e) {
    console.log('  ⚠️ JSON解析失败，尝试修复...');
    let fixed = content.replace(/```json\s*/g, '').replace(/```/g, '');
    fixed = fixed.replace(/,\s*]/g, ']');
    const m = fixed.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (m) return JSON.parse(m[0]);
    return [];
  }
}

async function main() {
  // 加载已有进度
  let results = [];
  if (fs.existsSync('/tmp/bwbj_expanded_progress.json')) {
    results = JSON.parse(fs.readFileSync('/tmp/bwbj_expanded_progress.json', 'utf8'));
    console.log('📂 加载已有进度:', results.length, '条');
  }
  
  const testData = JSON.parse(fs.readFileSync('/tmp/bwbj_test_10ep.json', 'utf8'));
  const allShots = testData.episodes.flatMap(ep => ep.shots);
  console.log('📊 总镜头数:', allShots.length);
  
  // 找到已处理的shot_id
  const processedIds = new Set(results.map(r => r.shot_id));
  const remainingShots = allShots.filter(s => !processedIds.has(s.shot_id));
  console.log('⏭️ 剩余镜头:', remainingShots.length);
  
  if (remainingShots.length === 0) {
    console.log('✅ 所有镜头已处理完成！');
    return;
  }
  
  const BATCH_SIZE = 10;  // 减小批次避免超时
  let totalCost = 0;
  
  for (let i = 0; i < remainingShots.length; i += BATCH_SIZE) {
    const batch = remainingShots.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remainingShots.length / BATCH_SIZE);
    
    process.stdout.write(`\r[Batch ${batchNum}/${totalBatches}] 处理镜头 ${results.length + 1}-${results.length + batch.length}...`);
    
    const result = await expandBatch(batch);
    
    if (result.error) {
      console.log('\n  ❌ API Error:', result.error.message);
      continue;
    }
    
    const expanded = parseJSON(result.choices?.[0]?.message?.content || '[]');
    results.push(...expanded);
    
    const cost = (result.usage?.prompt_tokens * 0.14 + result.usage?.completion_tokens * 0.28) / 1000000;
    totalCost += cost;
    
    process.stdout.write(` ✅ ${expanded.length}条 | 累计${results.length}条 | $${totalCost.toFixed(4)}`);
    
    // 每批保存进度
    fs.writeFileSync('/tmp/bwbj_expanded_progress.json', JSON.stringify(results, null, 2));
  }
  
  console.log('\n\n✅ 完成！共', results.length, '条扩写结果');
  console.log('💰 本次成本: $' + totalCost.toFixed(4));
  
  // 保存最终结果
  fs.writeFileSync('/tmp/bwbj_expanded_final.json', JSON.stringify(results, null, 2));
  
  // 生成CSV
  let csv = '"shot_id","画面描述","Image_Prompt","Video_Prompt"\n';
  results.forEach(r => {
    const desc = (r.画面描述 || '').replace(/"/g, '""');
    const imgPrompt = (r.Image_Prompt || '').replace(/"/g, '""');
    const vidPrompt = (r.Video_Prompt || '').replace(/"/g, '""');
    csv += `"${r.shot_id}","${desc}","${imgPrompt}","${vidPrompt}"\n`;
  });
  fs.writeFileSync('/tmp/bwbj_expanded.csv', csv);
  console.log('📁 已保存: /tmp/bwbj_expanded.csv');
  console.log('📁 已保存: /tmp/bwbj_expanded_final.json');
}

main().catch(console.error);
