/**
 * 阿里云通义万相 - 文生图API
 * 
 * 使用 wan2.6-t2i 模型生成图片
 */

const ALIYUN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

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
        size = '1280*1280',  // 默认正方形
        n = 1,               // 生成数量
        negativePrompt = '低分辨率，低画质，肢体畸形，手指畸形，画面过饱和',
        promptExtend = true, // 智能改写
        watermark = false    // 不要水印
    } = options;
    
    console.log(`[AliyunImage] 生成圖片: ${prompt.substring(0, 50)}...`);
    
    const response = await fetch(ALIYUN_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'wan2.6-t2i',
            input: {
                messages: [{
                    role: 'user',
                    content: [{ text: prompt }]
                }]
            },
            parameters: {
                size,
                n,
                negative_prompt: negativePrompt,
                prompt_extend: promptExtend,
                watermark
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        console.error('[AliyunImage] API錯誤:', error);
        throw new Error(`阿里云API錯誤: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 解析返回結果
    if (data.output?.choices?.[0]?.message?.content) {
        const content = data.output.choices[0].message.content;
        const imageItem = content.find(c => c.image);
        if (imageItem) {
            console.log(`[AliyunImage] ✅ 生成成功`);
            return {
                url: imageItem.image,
                seed: data.output?.seed
            };
        }
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
