const fetch = require('node-fetch');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const DEEPSEEK_API_KEY = envContent.match(/DEEPSEEK_API_KEY=([^\n]+)/)?.[1];

async function expandBatch(shots, batchNum) {
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
1. 每个镜头输出中文画面描述（50-100字，有画面感，像在看电影）
2. 每个镜头输出英文Image_Prompt（适合Midjourney，含--ar 16:9）
3. 返回纯JSON数组，不要markdown代码块

镜头数据：
${JSON.stringify(shotsData, null, 2)}

输出JSON数组：
[
  { "shot_id": "E001_S001", "画面描述": "完整中文描述...", "Image_Prompt": "English prompt, cinematic, 8K, --ar 16:9" }
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
  const testData = JSON.parse(fs.readFileSync('/tmp/bwbj_test_10ep.json', 'utf8'));
  const allShots = testData.episodes.flatMap(ep => ep.shots);
  console.log('📊 总镜头数:', allShots.length);
  
  const BATCH_SIZE = 20;
  const results = [];
  let totalCost = 0;
  
  for (let i = 0; i < allShots.length; i += BATCH_SIZE) {
    const batch = allShots.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allShots.length / BATCH_SIZE);
    
    process.stdout.write(`\r[Batch ${batchNum}/${totalBatches}] 处理镜头 ${i+1}-${Math.min(i+BATCH_SIZE, allShots.length)}...`);
    
    const result = await expandBatch(batch, batchNum);
    
    if (result.error) {
      console.log('\n  ❌ API Error:', result.error.message);
      continue;
    }
    
    const expanded = parseJSON(result.choices?.[0]?.message?.content || '[]');
    results.push(...expanded);
    
    const cost = (result.usage?.prompt_tokens * 0.14 + result.usage?.completion_tokens * 0.28) / 1000000;
    totalCost += cost;
    
    process.stdout.write(` ✅ ${expanded.length}条 | 累计${results.length}条 | $${totalCost.toFixed(4)}`);
    
    // 每5批保存一次进度
    if (batchNum % 5 === 0) {
      fs.writeFileSync('/tmp/bwbj_expanded_progress.json', JSON.stringify(results, null, 2));
    }
  }
  
  console.log('\n\n✅ 完成！共', results.length, '条扩写结果');
  console.log('💰 总成本: $' + totalCost.toFixed(4));
  
  // 保存最终结果
  fs.writeFileSync('/tmp/bwbj_expanded_final.json', JSON.stringify(results, null, 2));
  
  // 生成CSV
  let csv = '"shot_id","画面描述","Image_Prompt","Video_Prompt"\n';
  results.forEach(r => {
    const videoPrompt = (r.Image_Prompt || '').replace(/--ar.*/, '').trim() + ', camera movement, cinematic motion, 4 seconds';
    const desc = (r.画面描述 || '').replace(/"/g, '""');
    const imgPrompt = (r.Image_Prompt || '').replace(/"/g, '""');
    const vidPrompt = videoPrompt.replace(/"/g, '""');
    csv += `"${r.shot_id}","${desc}","${imgPrompt}","${vidPrompt}"\n`;
  });
  fs.writeFileSync('/tmp/bwbj_expanded.csv', csv);
  console.log('📁 已保存: /tmp/bwbj_expanded.csv');
}

main().catch(console.error);
