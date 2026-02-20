/**
 * AI番剧制作 - 流水线架构 V3
 * 
 * 流程：
 * Step 1: 创建项目 + 生成所有剧本大纲
 * Step 2: 用户查看/修改剧本
 * Step 3: 用户选择生成某一集的分镜
 * Step 4: 确认后可生成下一集
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 持久化文件路径
const PROJECTS_FILE = path.join(__dirname, 'projects.json');

// 流水线状态存储
const PIPELINES = new Map();

// ========== 持久化函数 ==========
function savePipelinesToDisk() {
    try {
        const data = {};
        for (const [id, pipeline] of PIPELINES) {
            data[id] = pipeline;
        }
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
        console.log(`[Pipeline] 已保存 ${PIPELINES.size} 個項目到磁盤`);
    } catch (e) {
        console.error('[Pipeline] 保存失敗:', e.message);
    }
}

function loadPipelinesFromDisk() {
    try {
        if (fs.existsSync(PROJECTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
            for (const [id, pipeline] of Object.entries(data)) {
                PIPELINES.set(id, pipeline);
            }
            console.log(`[Pipeline] 從磁盤載入 ${PIPELINES.size} 個項目`);
        }
    } catch (e) {
        console.error('[Pipeline] 載入失敗:', e.message);
    }
}

// 啟動時載入
loadPipelinesFromDisk();

/**
 * 智能解析分镜JSON
 * 处理各种格式问题
 */
function parseStoryboardJSON(text, pipelineId) {
    if (!text || typeof text !== 'string') {
        console.warn(`[Project ${pipelineId}] 空响应`);
        return [];
    }
    
    // Step 1: 清理markdown代码块
    let cleanText = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
    
    // Step 2: 尝试提取JSON数组 (处理前后有说明文字的情况)
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        cleanText = jsonMatch[0];
    }
    
    // Step 3: 修复常见JSON错误
    cleanText = cleanText
        // 修复中文引号
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        // 修复错误的转义
        .replace(/\\"/g, '"')
        .replace(/"{2,}/g, '"')
        // 移除控制字符
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        // 修复尾随逗号
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}');
    
    // Step 4: 尝试解析
    try {
        const parsed = JSON.parse(cleanText);
        const shots = Array.isArray(parsed) ? parsed : (parsed.shots || []);
        
        // Step 5: 验证每个镜头的基本字段
        const validShots = shots.filter(shot => {
            return shot && typeof shot === 'object' && 
                   (shot.画面描述 || shot.Image_Prompt || shot['画面描述']);
        });
        
        if (validShots.length < shots.length) {
            console.warn(`[Project ${pipelineId}] 过滤了${shots.length - validShots.length}个无效镜头`);
        }
        
        return validShots;
        
    } catch (e) {
        console.warn(`[Project ${pipelineId}] JSON解析失败:`, e.message);
        console.warn(`[Project ${pipelineId}] 原始内容(前300字):`, text.substring(0, 300));
        
        // Step 6: 最后尝试 - 逐个对象提取
        try {
            const objectMatches = cleanText.matchAll(/\{[^{}]*"shot_id"[^{}]*\}/g);
            const extractedShots = [];
            for (const match of objectMatches) {
                try {
                    const shot = JSON.parse(match[0]);
                    if (shot.shot_id) extractedShots.push(shot);
                } catch {}
            }
            if (extractedShots.length > 0) {
                console.log(`[Project ${pipelineId}] 抢救提取了${extractedShots.length}个镜头`);
                return extractedShots;
            }
        } catch {}
        
        return [];
    }
}

/**
 * 创建新项目（只生成剧本大纲）
 */
function createPipeline(config) {
    const pipelineId = `project_${Date.now()}`;
    
    const pipeline = {
        id: pipelineId,
        status: 'created',  // created → scripts_ready → generating → completed
        config: {
            title: config.title || '未命名项目',
            episodes: config.episodes || 10,
            durationPerEpisode: config.durationPerEpisode || 10,
            shotsPerMinute: config.shotsPerMinute || 10,
            content: config.content,
            artStyle: config.artStyle || 'anime style'
        },
        // 剧本数据（用户可修改）
        scripts: [],
        // 分镜数据（按集存储）
        storyboards: {},  // { 1: [...shots], 2: [...shots], ... }
        // 进度
        progress: {
            scriptsGenerated: false,
            generatingEpisode: null,  // 当前正在生成的集数
            completedEpisodes: [],    // 已完成的集数
            totalShots: 0
        },
        timing: {
            createdAt: new Date().toISOString(),
            scriptsReadyAt: null,
            completedAt: null
        },
        errors: []
    };
    
    PIPELINES.set(pipelineId, pipeline);
    savePipelinesToDisk();  // 保存到磁盤
    return pipeline;
}

/**
 * 获取项目
 */
function getPipeline(pipelineId) {
    return PIPELINES.get(pipelineId);
}

/**
 * Step 1: 生成所有剧本大纲（分批处理大量集数）
 */
async function generateScripts(pipelineId, callAgentFn) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) throw new Error('Project not found');
    
    pipeline.status = 'generating_scripts';
    pipeline.scripts = [];
    
    try {
        const totalEpisodes = pipeline.config.episodes;
        // 每批最多生成10集（避免token溢出）
        const episodesPerBatch = 10;
        const batchCount = Math.ceil(totalEpisodes / episodesPerBatch);
        
        console.log(`[Project ${pipelineId}] 生成${totalEpisodes}集剧本大纲（${batchCount}批次）...`);
        
        for (let batch = 0; batch < batchCount; batch++) {
            const startEp = batch * episodesPerBatch + 1;
            const endEp = Math.min((batch + 1) * episodesPerBatch, totalEpisodes);
            const batchSize = endEp - startEp + 1;
            
            console.log(`[Project ${pipelineId}] 批次${batch + 1}/${batchCount}：生成第${startEp}-${endEp}集...`);
            
            // 构建前情提要（如果有之前的剧本）
            let previousSummary = '';
            if (pipeline.scripts.length > 0) {
                const lastScripts = pipeline.scripts.slice(-3);
                previousSummary = `\n\n前情提要（确保剧情连贯）：\n${lastScripts.map(s => `第${s.episode}集「${s.title}」：${s.summary?.substring(0, 100)}`).join('\n')}`;
            }
            
            const result = await callAgentFn('narrative', {
                content: `为《${pipeline.config.title}》创作第${startEp}集到第${endEp}集的详细剧本大纲（共${batchSize}集）。
总共${totalEpisodes}集，每集${pipeline.config.durationPerEpisode}分钟。
${previousSummary}

请输出JSON数组格式：
[
  {
    "episode": ${startEp},
    "title": "第${startEp}集标题",
    "summary": "200-300字的详细剧情概要，包含主要场景、人物动作、情绪变化",
    "scenes": ["场景1描述", "场景2描述", ...]
  },
  ...直到第${endEp}集
]

原作/参考内容：
${pipeline.config.content?.substring(0, 3000) || '请根据标题创作'}`,
                context: {
                    episodes: batchSize,
                    totalEpisodes: totalEpisodes,
                    startEpisode: startEp,
                    endEpisode: endEp,
                    duration: pipeline.config.durationPerEpisode,
                    maxTokens: 16000  // 提示使用更大token
                }
            });
            
            // 解析结果
            const resultText = result.text || result.result || result;
            try {
                let batchScripts = JSON.parse(
                    resultText
                        .replace(/```json\s*/g, '')
                        .replace(/```\s*/g, '')
                        .trim()
                );
                if (!Array.isArray(batchScripts)) {
                    batchScripts = batchScripts.episodes || [];
                }
                
                // 确保episode编号正确
                batchScripts = batchScripts.map((s, idx) => ({
                    ...s,
                    episode: startEp + idx
                }));
                
                pipeline.scripts.push(...batchScripts);
                console.log(`[Project ${pipelineId}] 批次${batch + 1}完成，获得${batchScripts.length}集`);
                
            } catch(e) {
                console.warn(`[Project ${pipelineId}] 批次${batch + 1}剧本解析失败:`, e.message);
                // 尝试抢救提取
                const rescuedScripts = rescueExtractScripts(resultText, startEp, endEp);
                if (rescuedScripts.length > 0) {
                    pipeline.scripts.push(...rescuedScripts);
                    console.log(`[Project ${pipelineId}] 批次${batch + 1}抢救提取${rescuedScripts.length}集`);
                }
            }
        }
        
        pipeline.status = 'scripts_ready';
        pipeline.progress.scriptsGenerated = true;
        pipeline.timing.scriptsReadyAt = new Date().toISOString();
        savePipelinesToDisk();  // 保存進度
        
        console.log(`[Project ${pipelineId}] 剧本生成完成，共${pipeline.scripts.length}集`);
        
        return pipeline.scripts;
        
    } catch (err) {
        pipeline.status = 'error';
        pipeline.errors.push({
            stage: 'scripts',
            error: err.message,
            time: new Date().toISOString()
        });
        savePipelinesToDisk();  // 保存錯誤狀態
        throw err;
    }
}

/**
 * 尝试抢救提取剧本
 */
function rescueExtractScripts(text, startEp, endEp) {
    const scripts = [];
    // 尝试正则提取每集信息
    const episodePattern = /["']?episode["']?\s*:\s*(\d+)[^}]*["']?title["']?\s*:\s*["']([^"']+)["'][^}]*["']?summary["']?\s*:\s*["']([^"']+)["']/gi;
    let match;
    while ((match = episodePattern.exec(text)) !== null) {
        const ep = parseInt(match[1]);
        if (ep >= startEp && ep <= endEp) {
            scripts.push({
                episode: ep,
                title: match[2],
                summary: match[3],
                scenes: []
            });
        }
    }
    return scripts;
}

/**
 * 更新剧本（用户编辑）
 */
function updateScript(pipelineId, episode, scriptData) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) throw new Error('Project not found');
    
    const idx = pipeline.scripts.findIndex(s => s.episode === episode);
    if (idx >= 0) {
        pipeline.scripts[idx] = { ...pipeline.scripts[idx], ...scriptData };
    }
    
    return pipeline.scripts[idx];
}

/**
 * Step 2: 生成指定集的分镜
 */
async function generateEpisodeStoryboard(pipelineId, episode, callAgentFn) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) throw new Error('Project not found');
    if (!pipeline.progress.scriptsGenerated) throw new Error('请先生成剧本');
    
    const script = pipeline.scripts.find(s => s.episode === episode);
    if (!script) throw new Error(`找不到第${episode}集剧本`);
    
    pipeline.status = 'generating_storyboard';
    pipeline.progress.generatingEpisode = episode;
    
    const shotsPerEpisode = pipeline.config.durationPerEpisode * pipeline.config.shotsPerMinute;
    // DeepSeek reasoner 32K输出限制，每次约20-30个详细镜头比较稳定
    const shotsPerCall = 25;  // 保守值，确保完整输出
    const callsNeeded = Math.ceil(shotsPerEpisode / shotsPerCall);
    
    console.log(`[Project ${pipelineId}] 生成第${episode}集分镜 (${shotsPerEpisode}镜头, ${callsNeeded}次调用)...`);
    
    const epShots = [];
    
    for (let call = 0; call < callsNeeded; call++) {
        const startShot = call * shotsPerCall + 1;
        const endShot = Math.min((call + 1) * shotsPerCall, shotsPerEpisode);
        const startMinute = Math.floor((call * shotsPerCall) / pipeline.config.shotsPerMinute);
        const endMinute = Math.ceil(endShot / pipeline.config.shotsPerMinute);
        
        const prompt = `《${pipeline.config.title}》第${episode}集：${script.title || ''}

剧情概要：
${script.summary || ''}

场景列表：
${(script.scenes || []).join('\n')}

当前任务：生成第${startMinute+1}-${endMinute}分钟的镜头（镜头${startShot}-${endShot}，共${endShot - startShot + 1}个）
画风：${pipeline.config.artStyle}

请生成${shotsPerCall}个专业分镜，shot_id从E${String(episode).padStart(3,'0')}_S${String(startShot).padStart(3,'0')}开始。

【重要】只输出JSON数组，不要任何其他文字！格式：
[{"shot_id":"E001_S001","画面描述":"...","视频描述":"...","Image_Prompt":"...","Video_Prompt":"..."},...]`;
        
        // 带重试的调用
        let shots = [];
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount < maxRetries) {
            try {
                const result = await callAgentFn('storyboard', {
                    content: prompt,
                    context: {
                        episode,
                        startShot,
                        endShot,
                        artStyle: pipeline.config.artStyle
                    }
                });
                
                const resultText = result.text || result.result || result;
                
                // 解析JSON
                shots = parseStoryboardJSON(resultText, pipelineId);
                
                // 验证：至少有1个镜头才算成功
                if (shots.length > 0) {
                    break; // 成功，退出重试循环
                } else {
                    console.warn(`[Project ${pipelineId}] 调用${call+1}返回0镜头，重试中...`);
                    retryCount++;
                }
                
            } catch (err) {
                console.error(`[Project ${pipelineId}] 调用${call+1}异常:`, err.message);
                retryCount++;
                if (retryCount >= maxRetries) {
                    pipeline.errors.push({
                        episode,
                        call: call + 1,
                        error: err.message,
                        time: new Date().toISOString()
                    });
                }
            }
            
            // 重试前等待
            if (retryCount < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        // 确保shot_id正确，使用连续编号
        const currentTotal = epShots.length;
        shots = shots.map((shot, idx) => ({
            ...shot,
            shot_id: `E${String(episode).padStart(3,'0')}_S${String(currentTotal + idx + 1).padStart(3,'0')}`,
            episode
        }));
        
        epShots.push(...shots);
        
        // 实时更新进度
        pipeline.storyboards[episode] = epShots;
        pipeline.progress.totalShots = Object.values(pipeline.storyboards).flat().length;
        
        const retryNote = retryCount > 0 ? ` (重试${retryCount}次)` : '';
        console.log(`[Project ${pipelineId}] 第${episode}集 调用${call+1}/${callsNeeded}，获得${shots.length}镜头，本集累计${epShots.length}镜头${retryNote}`);
        
        // 调用间隔
        if (call < callsNeeded - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    
    // 保存分镜
    pipeline.storyboards[episode] = epShots;
    pipeline.progress.completedEpisodes.push(episode);
    pipeline.progress.totalShots += epShots.length;
    pipeline.progress.generatingEpisode = null;
    pipeline.status = 'scripts_ready';
    savePipelinesToDisk();  // 保存進度
    
    console.log(`[Project ${pipelineId}] 第${episode}集分镜完成，共${epShots.length}镜头`);
    
    return epShots;
}

/**
 * Step 3: 自动连续生成所有集的分镜
 */
async function generateAllStoryboards(pipelineId, callAgentFn, onProgress) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) throw new Error('Project not found');
    if (!pipeline.progress.scriptsGenerated) throw new Error('请先生成剧本');
    
    const totalEpisodes = pipeline.scripts.length;
    console.log(`[Project ${pipelineId}] 开始自动生成${totalEpisodes}集分镜...`);
    
    pipeline.status = 'generating_all_storyboards';
    
    for (let i = 0; i < totalEpisodes; i++) {
        const script = pipeline.scripts[i];
        const episode = script.episode;
        
        // 跳过已完成的集
        if (pipeline.storyboards[episode] && pipeline.storyboards[episode].length > 0) {
            console.log(`[Project ${pipelineId}] 第${episode}集已完成，跳过`);
            continue;
        }
        
        try {
            await generateEpisodeStoryboard(pipelineId, episode, callAgentFn);
            
            // 进度回调
            if (onProgress) {
                onProgress({
                    episode,
                    completed: i + 1,
                    total: totalEpisodes,
                    totalShots: pipeline.progress.totalShots
                });
            }
            
            // 集之间短暂休息，避免API过载
            if (i < totalEpisodes - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
            
        } catch (err) {
            console.error(`[Project ${pipelineId}] 第${episode}集生成失败:`, err.message);
            pipeline.errors.push({
                episode,
                error: err.message,
                time: new Date().toISOString()
            });
            // 继续下一集，不中断
        }
    }
    
    pipeline.status = 'completed';
    pipeline.timing.completedAt = new Date().toISOString();
    savePipelinesToDisk();  // 保存完成狀態
    
    console.log(`[Project ${pipelineId}] 全部分镜生成完成！共${pipeline.progress.totalShots}镜头`);
    
    return {
        totalEpisodes,
        completedEpisodes: pipeline.progress.completedEpisodes.length,
        totalShots: pipeline.progress.totalShots,
        errors: pipeline.errors
    };
}

/**
 * 获取指定集的分镜
 */
function getEpisodeStoryboard(pipelineId, episode) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) return null;
    return pipeline.storyboards[episode] || [];
}

/**
 * 获取所有分镜
 */
function getAllStoryboards(pipelineId) {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) return [];
    
    const allShots = [];
    for (let ep = 1; ep <= pipeline.config.episodes; ep++) {
        if (pipeline.storyboards[ep]) {
            allShots.push(...pipeline.storyboards[ep]);
        }
    }
    return allShots;
}

/**
 * 导出结果
 */
function exportPipeline(pipelineId, format = 'json') {
    const pipeline = PIPELINES.get(pipelineId);
    if (!pipeline) return null;
    
    const allShots = getAllStoryboards(pipelineId);
    
    if (format === 'csv') {
        const headers = ['shot_id', 'episode', '画面描述', '视频描述', 'Image_Prompt', 'Video_Prompt'];
        const rows = allShots.map(shot => [
            shot.shot_id,
            shot.episode,
            `"${(shot.画面描述 || '').replace(/"/g, '""')}"`,
            `"${(shot.视频描述 || '').replace(/"/g, '""')}"`,
            `"${(shot.Image_Prompt || '').replace(/"/g, '""')}"`,
            `"${(shot.Video_Prompt || '').replace(/"/g, '""')}"`
        ].join(','));
        return [headers.join(','), ...rows].join('\n');
    }
    
    return JSON.stringify(allShots, null, 2);
}

/**
 * 列出所有项目
 */
function listPipelines() {
    return Array.from(PIPELINES.values()).map(p => ({
        id: p.id,
        title: p.config.title,
        status: p.status,
        episodes: p.config.episodes,
        scriptsReady: p.progress.scriptsGenerated,
        completedEpisodes: p.progress.completedEpisodes.length,
        totalShots: p.progress.totalShots
    }));
}

export {
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
};
