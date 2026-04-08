/**
 * 自测 aggregate-stream SSE 端点
 *
 * 用法：先启动后端 (npm start)，然后运行：
 *   node test-aggregate-stream.js
 *
 * 验证项：
 *   1. 收到 progress 事件
 *   2. 收到 batch_thinking 和/或 batch_content 事件
 *   3. 收到 done 事件，result 包含 CSV header
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

const TEST_CHUNKS = [
  `【段落1分析】
这是一个玄幻修仙世界，主角林风是云霄宗外门弟子。
主要角色：林风（主角，外门弟子），苏婉儿（师姐），赵长老（反派）
核心冲突：林风获得神秘传承，被赵长老觊觎
关键情节：1.林风偶得传承 2.修炼突破 3.被赵长老追杀`,

  `【段落2分析】
林风逃离云霄宗后进入秘境，结识了来自其他门派的修士。
主要角色：林风，陈浩（新伙伴），白灵儿（秘境中的神秘女子）
核心冲突：秘境中的远古遗迹争夺
关键情节：1.误入秘境 2.遗迹探索 3.获得宝物引发争斗`,

  `【段落3分析】
林风从秘境归来，实力大增，回到云霄宗报仇雪恨。
主要角色：林风，苏婉儿，赵长老，宗主
核心冲突：揭露赵长老阴谋，争夺宗门话语权
关键情节：1.回宗挑战 2.揭露真相 3.大决战`
];

const TEST_NOVEL_TEXT = `第一章 偶得传承
云霄宗外门，林风正在打扫院落。他是宗门中最不起眼的外门弟子，修炼三年仍停留在练气二层。
"林风，赵长老让你去药园除草。"一个同门弟子喊道。
林风叹了口气，放下扫帚往药园走去。就在药园深处，他无意间触碰到一块古朴玉简……

第二章 秘境奇遇
被赵长老追杀的林风跌入一处空间裂缝，来到了一片未知的秘境。
"这是……上古遗迹？"林风望着眼前宏伟的建筑群，震惊不已。
一道清冷的女声从身后传来："你也是被传送进来的？"

第三章 宗门之战
林风踏入云霄宗大门时，所有人都惊呆了。三个月前那个练气二层的废物，此刻浑身散发着金丹期的威压。
"赵长老，你欠我一个交代。"林风的声音在宗门上空回荡。`;

async function main() {
  console.log(`\n=== 测试 aggregate-stream (${BASE}) ===\n`);

  const body = {
    chunks: TEST_CHUNKS,
    targetEpisodes: 3,
    title: '云霄传',
    novelText: TEST_NOVEL_TEXT,
    chunkSize: 100000
  };

  let response;
  try {
    response = await fetch(`${BASE}/api/novel/aggregate-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('❌ 连接失败，请确认后端已启动:', err.message);
    process.exit(1);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`❌ HTTP ${response.status}:`, errText);
    process.exit(1);
  }

  console.log('✅ SSE 连接建立\n');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Counters for validation
  const eventCounts = {
    progress: 0,
    batch_thinking: 0,
    batch_content: 0,
    batch_done: 0,
    heartbeat: 0,
    done: 0,
    error: 0
  };
  let doneResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        const type = parsed.type || 'unknown';
        eventCounts[type] = (eventCounts[type] || 0) + 1;

        switch (type) {
          case 'progress':
            console.log(`📋 progress: ${parsed.message}`);
            break;
          case 'batch_thinking':
            // Only print first 100 chars of thinking to avoid spam
            if (eventCounts.batch_thinking <= 3) {
              console.log(`💭 batch_thinking [批${parsed.batch}]: ${parsed.content.slice(0, 100)}...`);
            } else if (eventCounts.batch_thinking === 4) {
              console.log(`💭 batch_thinking ... (后续省略，持续接收中)`);
            }
            break;
          case 'batch_content':
            if (eventCounts.batch_content <= 3) {
              console.log(`📝 batch_content [批${parsed.batch}]: ${parsed.content.slice(0, 100)}...`);
            } else if (eventCounts.batch_content === 4) {
              console.log(`📝 batch_content ... (后续省略，持续接收中)`);
            }
            break;
          case 'batch_done':
            console.log(`✅ batch_done [批${parsed.batch}/${parsed.totalBatches}]: ${parsed.episodes}集, status=${parsed.status}`);
            break;
          case 'heartbeat':
            console.log(`💓 heartbeat: ${parsed.completed}/${parsed.total}`);
            break;
          case 'done':
            doneResult = parsed;
            console.log(`\n🎉 done: ${parsed.episodes}/${parsed.targetEpisodes} 集`);
            console.log(`CSV 前200字:\n${(parsed.result || '').slice(0, 200)}`);
            break;
          case 'error':
            console.error(`❌ error: ${parsed.error}`);
            break;
          default:
            console.log(`❓ unknown event: ${type}`, parsed);
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // === Validation summary ===
  console.log('\n=== 验证总结 ===');
  console.log('事件统计:', eventCounts);

  let passed = true;

  if (eventCounts.progress < 1) {
    console.error('❌ 缺少 progress 事件');
    passed = false;
  } else {
    console.log('✅ progress 事件: OK');
  }

  if (eventCounts.batch_thinking === 0 && eventCounts.batch_content === 0) {
    console.warn('⚠️  未收到 batch_thinking 或 batch_content（模型可能没有产生思考内容）');
  } else {
    console.log(`✅ 流式内容: ${eventCounts.batch_thinking} thinking + ${eventCounts.batch_content} content 事件`);
  }

  if (eventCounts.done < 1) {
    console.error('❌ 缺少 done 事件');
    passed = false;
  } else {
    console.log('✅ done 事件: OK');
  }

  if (doneResult?.result) {
    const hasHeader = doneResult.result.includes('ep_id,');
    if (!hasHeader) {
      console.error('❌ done.result 缺少 CSV header');
      passed = false;
    } else {
      console.log('✅ CSV header: OK');
    }
    const dataLines = doneResult.result.split('\n').filter(l => l.match(/^E\d{3}/));
    console.log(`✅ CSV 数据行: ${dataLines.length} 集`);
  }

  console.log(`\n${passed ? '🎉 测试通过' : '❌ 测试失败'}\n`);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('未捕获异常:', err);
  process.exit(1);
});
