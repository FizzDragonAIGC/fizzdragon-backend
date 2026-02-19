/**
 * 完整多Agent Pipeline
 * 支持3种模式：简单/标准/专业
 * 使用全部41个Agent中的相关Agent
 */

// 三种模式的Agent配置
export const PIPELINE_MODES = {
  simple: {
    name: '简单模式',
    description: '快速生成，基础质量',
    phases: [
      { agent: 'narrative', output: 'scripts' },
      { agent: 'storyboard', output: 'storyboard', perEpisode: true, description: '分镜设计' }
    ],
    shotsPerMinute: 8,
    fieldsPerShot: ['shot_id', '画面描述', '视频描述', 'Image_Prompt', 'Video_Prompt']
  },
  
  standard: {
    name: '标准模式',
    description: '平衡质量与速度',
    phases: [
      // Phase 1: 故事
      { agent: 'concept', output: 'concept' },
      { agent: 'narrative', output: 'scripts' },
      { agent: 'character', output: 'characters' },
      // Phase 2: 视觉
      { agent: 'artstyle', output: 'artstyle' },
      { agent: 'scene', output: 'scenes' },
      // Phase 3: 分镜
      { agent: 'storyboard', output: 'storyboard', enrichWith: ['artstyle', 'characters'] },
      // Phase 4: 增强
      { agent: 'music', output: 'music', perEpisode: true },
      { agent: 'prompt', output: 'prompts', perShot: true }
    ],
    shotsPerMinute: 10,
    fieldsPerShot: [
      'shot_id', '画面描述', '视频描述', '画风', '旁白',
      '音乐', '音效', 'Image_Prompt', 'Video_Prompt'
    ]
  },
  
  professional: {
    name: '专业模式',
    description: '电影级质量，完整流程',
    phases: [
      // Phase 1: 前期策划 (Pre-production)
      { agent: 'interview', output: 'interview', description: '创作访谈' },
      { agent: 'concept', output: 'concept', description: '概念设计' },
      { agent: 'narrative', output: 'scripts', description: '剧本大纲' },
      
      // Phase 2: 角色与世界观 (Character & World)
      { agent: 'character', output: 'characters', description: '角色设计' },
      { agent: 'psychology', output: 'psychology', description: '角色心理' },
      { agent: 'costume', output: 'costumes', description: '服装设计' },
      { agent: 'scene', output: 'scenes', description: '场景设计' },
      { agent: 'culture', output: 'culture', description: '文化考据' },
      
      // Phase 3: 视觉风格 (Visual Style)
      { agent: 'artstyle', output: 'artstyle', description: '画风定义' },
      { agent: 'artdirector', output: 'artdirection', description: '美术指导' },
      { agent: 'color', output: 'colorscript', description: '色彩脚本' },
      { agent: 'lighting', output: 'lighting', description: '灯光设计' },
      
      // Phase 4: 分镜制作 (Storyboarding) - 每集
      { agent: 'storyboard', output: 'storyboard', perEpisode: true, description: '分镜设计',
        enrichWith: ['artstyle', 'characters', 'scenes', 'lighting'] },
      { agent: 'cinematography', output: 'cinematography', perEpisode: true, description: '摄影设计' },
      { agent: 'blocking', output: 'blocking', perEpisode: true, description: '调度设计' },
      
      // Phase 5: 表演层 (Performance) - 每镜头
      { agent: 'acting', output: 'acting', perShot: true, description: '演技指导' },
      { agent: 'expression', output: 'expression', perShot: true, description: '表情设计' },
      { agent: 'pose', output: 'pose', perShot: true, description: '动作设计' },
      
      // Phase 6: 音频层 (Audio) - 每集
      { agent: 'music', output: 'music', perEpisode: true, description: '音乐设计' },
      
      // Phase 7: AI输出 (AI Output) - 每镜头
      { agent: 'prompt', output: 'prompts', perShot: true, description: 'Prompt优化' },
      { agent: 'platform', output: 'platform', perShot: true, description: '平台适配' },
      
      // Phase 8: 特效 (VFX) - 需要时
      { agent: 'vfx', output: 'vfx', optional: true, description: '特效设计' },
      { agent: 'weather', output: 'weather', optional: true, description: '氛围设计' }
    ],
    shotsPerMinute: 12,
    fieldsPerShot: [
      'shot_id', 'episode', 'scene',
      '画面描述', '视频描述', '画风',
      '旁白', '台词', '演技指导', '表情', '动作',
      '音乐', '音效', '灯光',
      '运镜', '景别', '时长',
      'Image_Prompt', 'Video_Prompt',
      '平台参数', '特效备注'
    ]
  }
};

// 完整分镜输出格式
export const STORYBOARD_SCHEMA = {
  shot_id: 'string',      // E001_S001
  episode: 'number',      // 1
  scene: 'string',        // 场景名
  画面描述: 'string',      // 200-300字
  视频描述: 'string',      // 100-150字
  画风: 'string',         // 吉卜力水彩风
  旁白: 'string',         // 旁白文本
  台词: 'string',         // 角色对话
  演技指导: 'string',      // 内心挣扎，眼神闪烁
  表情: 'string',         // 微皱眉，嘴角下撇
  动作: 'string',         // 双手握拳，身体前倾
  音乐: 'string',         // 钢琴独奏，忧伤主题
  音效: 'string',         // 风声，远处雷鸣
  灯光: 'string',         // 侧逆光，暖色调
  运镜: 'string',         // 缓推+环绕
  景别: 'string',         // 中近景
  时长: 'number',         // 5 (秒)
  Image_Prompt: 'string', // 完整英文提示词
  Video_Prompt: 'string', // 视频生成提示词
  平台参数: 'object',      // {midjourney: {...}, runway: {...}}
  特效备注: 'string'       // 需要粒子特效
};

// 增强版storyboard prompt（输出完整字段）
export const ENHANCED_STORYBOARD_PROMPT = `你是电影级分镜总监，需要为每个镜头输出完整的制作规格。

## 输出格式（必须严格遵守JSON）
每个镜头必须包含以下全部字段：

\`\`\`json
{
  "shot_id": "E001_S001",
  "episode": 1,
  "scene": "神隐隧道入口",
  
  "画面描述": "【200-300字】完整的画面描写，包括：时代背景、场景环境（建筑/自然/道具）、人物位置与状态、光影效果（光源方向/强度/色温）、色彩基调、情绪氛围。例：黄昏时分，废弃主题公园入口，斑驳的红色鸟居被藤蔓缠绕...",
  
  "视频描述": "【100-150字】镜头运动设计：起始机位→运动轨迹→结束机位，具体参数（推拉速度、环绕角度、升降高度），节奏感，与情绪的配合。例：固定机位中景开场，3秒后缓慢推进(Dolly In)至特写...",
  
  "画风": "【风格标签】如：吉卜力水彩风、新海诚光影、赛博朋克霓虹、中国水墨、写实电影",
  
  "旁白": "【旁白文本】画外音内容，无则留空",
  
  "台词": "【角色对话】格式：角色名：台词内容。多人对话换行分隔",
  
  "演技指导": "【表演指示】角色的内心状态、情绪层次、潜台词，参考斯坦尼斯拉夫斯基体系",
  
  "表情": "【面部细节】眉眼嘴的具体状态，微表情变化",
  
  "动作": "【肢体语言】手势、姿态、步态、小动作",
  
  "音乐": "【配乐设计】乐器、调性、情绪、参考曲目",
  
  "音效": "【环境音/动效】具体声音元素，层次感",
  
  "灯光": "【灯光设计】主光/辅光/轮廓光，色温，阴影方向",
  
  "运镜": "【摄影机运动】具体技法名称+参数",
  
  "景别": "【镜头景别】远景/全景/中景/近景/特写/大特写",
  
  "时长": 5,
  
  "Image_Prompt": "【英文完整提示词】包含：场景+人物+动作+情绪+光影+风格+技术参数。必须包含: cinematic, 8K, film grain, --ar 16:9 --sref [风格参考]",
  
  "Video_Prompt": "【英文视频提示词】镜头运动+时长+氛围。适配Runway/Pika/Kling"
}
\`\`\`

## 质量要求
1. 每个字段都必须填写具体内容，不能用占位符
2. 画面描述必须具象化，能让美术直接画出来
3. 音乐音效要具体到乐器和声音元素
4. Image_Prompt必须是可直接使用的完整提示词
5. 每分钟至少10个镜头，保证叙事节奏`;

// Pipeline执行器
export class FullPipeline {
  constructor(config) {
    this.id = config.id || `pipeline_${Date.now()}`;
    this.title = config.title;
    this.sourceText = config.sourceText;
    this.totalEpisodes = config.totalEpisodes || 24;
    this.minutesPerEpisode = config.minutesPerEpisode || 4;
    this.mode = config.mode || 'standard';
    this.modeConfig = PIPELINE_MODES[this.mode];
    
    // 存储各阶段输出
    this.outputs = {};
    this.storyboards = {};
    this.status = 'created';
    this.currentPhase = null;
    this.progress = { phase: 0, total: this.modeConfig.phases.length };
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }
  
  async run(callAgentFn, onProgress) {
    this.startTime = Date.now();
    this.status = 'running';
    
    const phases = this.modeConfig.phases;
    
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      this.currentPhase = phase.agent;
      this.progress = { phase: i + 1, total: phases.length, name: phase.description || phase.agent };
      
      if (onProgress) {
        onProgress({ type: 'phase_start', phase: phase.agent, progress: this.progress });
      }
      
      try {
        if (phase.perEpisode) {
          // 每集执行一次
          await this.runPerEpisode(phase, callAgentFn, onProgress);
        } else if (phase.perShot) {
          // 每镜头执行一次（批量处理）
          await this.runPerShot(phase, callAgentFn, onProgress);
        } else {
          // 全局执行一次
          await this.runGlobal(phase, callAgentFn, onProgress);
        }
        
        if (onProgress) {
          onProgress({ type: 'phase_complete', phase: phase.agent, output: this.outputs[phase.output] });
        }
      } catch (error) {
        this.errors.push({ phase: phase.agent, error: error.message });
        console.error(`Phase ${phase.agent} failed:`, error);
        // 继续执行下一阶段
      }
    }
    
    this.status = 'completed';
    this.endTime = Date.now();
    
    return this.getResults();
  }
  
  async runGlobal(phase, callAgentFn, onProgress) {
    const context = this.buildContext(phase);
    const result = await callAgentFn(phase.agent, {
      title: this.title,
      sourceText: this.sourceText,
      totalEpisodes: this.totalEpisodes,
      minutesPerEpisode: this.minutesPerEpisode,
      context,
      mode: this.mode
    });
    
    // 解析结果
    const parsed = this.parseResult(result, phase.agent);
    this.outputs[phase.output] = parsed;
    return parsed;
  }
  
  // 解析Agent返回结果
  parseResult(result, agentId) {
    // 如果已经是对象，直接返回
    if (typeof result === 'object' && result !== null && !result.text) {
      return result;
    }
    
    // 如果是包含text字段的对象（来自callClaude）
    const text = result?.text || result;
    if (typeof text !== 'string') return result;
    
    // 尝试解析JSON
    try {
      // 清理markdown代码块
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
      // 尝试提取JSON数组或对象
      const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return JSON.parse(cleaned);
    } catch (e) {
      console.log(`[${agentId}] JSON解析失败，返回原始结果`);
      return result;
    }
  }
  
  async runPerEpisode(phase, callAgentFn, onProgress) {
    const results = [];
    
    for (let ep = 1; ep <= this.totalEpisodes; ep++) {
      if (onProgress) {
        onProgress({ 
          type: 'episode_progress', 
          phase: phase.agent, 
          episode: ep, 
          total: this.totalEpisodes 
        });
      }
      
      const context = this.buildContext(phase, ep);
      // 获取剧本 - 支持数组或对象格式
      let script = null;
      if (this.outputs.scripts) {
        if (Array.isArray(this.outputs.scripts)) {
          script = this.outputs.scripts[ep - 1];
        } else if (this.outputs.scripts.chapters) {
          script = this.outputs.scripts.chapters[ep - 1];
        }
      }
      
      const result = await callAgentFn(phase.agent, {
        title: this.title,
        episode: ep,
        script,
        sourceText: this.sourceText, // 也传递原始内容
        minutesPerEpisode: this.minutesPerEpisode,
        shotsPerMinute: this.modeConfig.shotsPerMinute,
        context,
        mode: this.mode,
        outputFields: this.modeConfig.fieldsPerShot
      });
      
      // 解析结果
      const parsed = this.parseResult(result, phase.agent);
      results.push(parsed);
      
      // 分镜特殊处理 - 解析后存储
      if (phase.output === 'storyboard') {
        // 确保是数组
        const shots = Array.isArray(parsed) ? parsed : (parsed?.shots || [parsed]);
        // 添加集数标记
        shots.forEach(shot => { shot.episode = ep; });
        this.storyboards[ep] = shots;
      }
    }
    
    this.outputs[phase.output] = results;
    return results;
  }
  
  async runPerShot(phase, callAgentFn, onProgress) {
    // 批量处理所有镜头
    const allShots = Object.values(this.storyboards).flat();
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < allShots.length; i += batchSize) {
      const batch = allShots.slice(i, i + batchSize);
      
      if (onProgress) {
        onProgress({
          type: 'shot_progress',
          phase: phase.agent,
          current: i,
          total: allShots.length
        });
      }
      
      const result = await callAgentFn(phase.agent, {
        shots: batch,
        context: this.buildContext(phase),
        mode: this.mode
      });
      
      results.push(...(Array.isArray(result) ? result : [result]));
    }
    
    this.outputs[phase.output] = results;
    return results;
  }
  
  buildContext(phase, episode = null) {
    const context = {};
    
    // 根据enrichWith添加相关上下文
    if (phase.enrichWith) {
      for (const key of phase.enrichWith) {
        if (this.outputs[key]) {
          context[key] = this.outputs[key];
        }
      }
    }
    
    // 添加已完成的全局输出
    ['concept', 'characters', 'artstyle', 'scenes'].forEach(key => {
      if (this.outputs[key]) {
        context[key] = this.outputs[key];
      }
    });
    
    return context;
  }
  
  getResults() {
    return {
      id: this.id,
      title: this.title,
      mode: this.mode,
      modeName: this.modeConfig.name,
      status: this.status,
      totalEpisodes: this.totalEpisodes,
      minutesPerEpisode: this.minutesPerEpisode,
      outputs: this.outputs,
      storyboards: this.storyboards,
      errors: this.errors,
      duration: this.endTime ? this.endTime - this.startTime : null,
      stats: {
        totalShots: Object.values(this.storyboards).flat().length,
        phasesCompleted: Object.keys(this.outputs).length,
        phasesTotal: this.modeConfig.phases.length
      }
    };
  }
  
  // 只生成指定集数（用于测试）
  async runEpisodes(episodes, callAgentFn, onProgress) {
    this.startTime = Date.now();
    this.status = 'running';
    
    const phases = this.modeConfig.phases;
    
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      this.currentPhase = phase.agent;
      this.progress = { phase: i + 1, total: phases.length, name: phase.description || phase.agent };
      
      if (onProgress) {
        onProgress({ type: 'phase_start', phase: phase.agent, progress: this.progress });
      }
      
      try {
        if (phase.perEpisode) {
          // 只处理指定集数
          const results = [];
          for (const ep of episodes) {
            if (onProgress) {
              onProgress({ 
                type: 'episode_progress', 
                phase: phase.agent, 
                episode: ep, 
                total: episodes.length 
              });
            }
            
            const context = this.buildContext(phase, ep);
            // 获取剧本 - 支持多种格式
            let script = null;
            if (this.outputs.scripts) {
              if (Array.isArray(this.outputs.scripts)) {
                script = this.outputs.scripts[ep - 1];
              } else if (this.outputs.scripts.chapters) {
                script = this.outputs.scripts.chapters[ep - 1];
              } else if (this.outputs.scripts.outline) {
                script = this.outputs.scripts.outline[ep - 1];
              } else if (this.outputs.scripts.versions) {
                // 如果是多版本格式，取第一个版本的对应集
                script = this.outputs.scripts.versions[0]?.outline?.[ep - 1];
              }
            }
            
            const result = await callAgentFn(phase.agent, {
              title: this.title,
              episode: ep,
              script,
              sourceText: this.sourceText,
              minutesPerEpisode: this.minutesPerEpisode,
              shotsPerMinute: this.modeConfig.shotsPerMinute,
              context,
              mode: this.mode,
              outputFields: this.modeConfig.fieldsPerShot
            });
            
            // 解析结果
            const parsed = this.parseResult(result, phase.agent);
            results.push(parsed);
            
            // 分镜特殊处理
            if (phase.output === 'storyboard') {
              const shots = Array.isArray(parsed) ? parsed : (parsed?.shots || [parsed]);
              shots.forEach(shot => { shot.episode = ep; });
              this.storyboards[ep] = shots;
            }
          }
          this.outputs[phase.output] = results;
        } else if (phase.perShot) {
          await this.runPerShot(phase, callAgentFn, onProgress);
        } else {
          await this.runGlobal(phase, callAgentFn, onProgress);
        }
      } catch (error) {
        this.errors.push({ phase: phase.agent, error: error.message });
        console.error(`Phase ${phase.agent} failed:`, error);
      }
    }
    
    this.status = 'completed';
    this.endTime = Date.now();
    
    return this.getResults();
  }
}

export default { PIPELINE_MODES, STORYBOARD_SCHEMA, ENHANCED_STORYBOARD_PROMPT, FullPipeline };
