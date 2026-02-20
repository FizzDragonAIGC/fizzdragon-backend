/**
 * 阿里云通义万相 - 文生图API
 * 
 * 使用 wanx-v1 模型生成图片（稳定版本）
 */

const ALIYUN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

/**
 * 生成图片
 * @param {string} prompt - 英文或中文提示词
 * @param {object} options - 可选参数
 * @returns {Promise<{url: string, seed: number}>}
 */
export async function generateImage(prompt, options = {}) {
    const apiKey = process.env.ALIYUN_API_KEY;
    
    if (!apiKey) {
        throw new Error('ALIYUN_API_KEY 未配置');
    }
    
    const {
        size = '1024*1024',  // 默认正方形
        n = 1,               // 生成数量
        negativePrompt = '低分辨率，低画质，肢体畸形，手指畸形',
    } = options;
    
    console.log(`[AliyunImage] 生成圖片: ${prompt.substring(0, 50)}...`);
    
    // 使用正确的 text2image API 格式
    const response = await fetch(ALIYUN_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'X-DashScope-Async': 'enable'  // 异步模式
        },
        body: JSON.stringify({
            model: 'wanx-v1',
            input: {
                prompt: prompt,
                negative_prompt: negativePrompt
            },
            parameters: {
                size: size,
                n: n,
                style: '<auto>'
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        console.error('[AliyunImage] API錯誤:', error);
        throw new Error(`阿里云API錯誤: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    console.log('[AliyunImage] 返回:', JSON.stringify(data).substring(0, 200));
    
    // 异步模式：需要轮询获取结果
    if (data.output?.task_id) {
        const taskId = data.output.task_id;
        console.log(`[AliyunImage] 任务ID: ${taskId}, 开始轮询...`);
        
        // 轮询获取结果（最多60秒）
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            
            const statusRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            
            if (!statusRes.ok) continue;
            
            const statusData = await statusRes.json();
            console.log(`[AliyunImage] 任务状态: ${statusData.output?.task_status}`);
            
            if (statusData.output?.task_status === 'SUCCEEDED') {
                const results = statusData.output?.results;
                if (results?.[0]?.url) {
                    console.log(`[AliyunImage] ✅ 生成成功`);
                    return { url: results[0].url };
                }
            } else if (statusData.output?.task_status === 'FAILED') {
                throw new Error('圖片生成失敗: ' + (statusData.output?.message || '未知錯誤'));
            }
        }
        
        throw new Error('圖片生成超時');
    }
    
    // 同步模式直接返回结果
    if (data.output?.results?.[0]?.url) {
        return { url: data.output.results[0].url };
    }
    
    throw new Error('圖片生成失敗：未返回圖片URL');
}

/**
 * 批量生成角色圖片
 * @param {Array} characters - 角色數組，每個需要有 ai_prompt 字段
 * @returns {Promise<Array>} - 帶有 image_url 的角色數組
 */
export async function generateCharacterImages(characters) {
    const results = [];
    
    for (const char of characters) {
        const prompt = char.ai_prompt || char.prompt;
        if (!prompt) {
            results.push({ ...char, image_url: null, error: '缺少prompt' });
            continue;
        }
        
        try {
            const image = await generateImage(prompt, {
                size: '1024*1280',  // 人像比例
                n: 1
            });
            results.push({
                ...char,
                image_url: image.url
            });
            
            // 避免API限流
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (err) {
            console.error(`[AliyunImage] ${char.name} 生成失敗:`, err.message);
            results.push({ ...char, image_url: null, error: err.message });
        }
    }
    
    return results;
}
