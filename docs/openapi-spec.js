function jsonResponse(schema, example, description = 'OK') {
  return {
    description,
    content: {
      'application/json': {
        schema,
        ...(example !== undefined ? { example } : {})
      }
    }
  };
}

function streamResponse(example, description = 'SSE stream') {
  return {
    description,
    content: {
      'text/event-stream': {
        schema: { type: 'string' },
        ...(example ? { example } : {})
      }
    }
  };
}

function jsonRequest(schema, example, required = true) {
  return {
    required,
    content: {
      'application/json': {
        schema,
        ...(example !== undefined ? { example } : {})
      }
    }
  };
}

export function buildOpenApiSpec(baseUrl = '') {
  const genericSyncResponse = {
    type: 'object',
    required: ['result', 'step'],
    properties: {
      result: {
        oneOf: [
          { type: 'string' },
          { type: 'object', additionalProperties: true },
          { type: 'array', items: {} }
        ]
      },
      reasoning: { type: 'string', nullable: true },
      tokens: { $ref: '#/components/schemas/Tokens' },
      step: { type: 'string' },
      agent: { type: 'string' }
    },
    additionalProperties: true
  };

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'FizzDragon Backend API',
      version: '2026-03-18',
      description: [
        '基于当前实现整理的可调用 OpenAPI 文档，覆盖 pipeline 主链路、project context / asset-library，以及 novel 长文本接口。',
        '',
        '核心说明：',
        '- 传入 `projectId` 时，pipeline 接口会自动从 `project.data.context` 注入 `storyBible`、`screenplays`、`breakdownRows` 等上游数据。',
        '- `screenplay` sync/stream 在生成后会自动把当前集回写到 `context.screenplays[episodeIndex]`，用于链式连续性。',
        '- stream 接口返回 `text/event-stream`；Swagger UI 可以直接发请求，但会显示原始 SSE 文本。',
        '',
        '从小说到分镜，你可以这样理解：',
        '1. `extract-bible` = 先读整本小说，产出全局设定 `storyBible`。',
        '2. `breakdown` = 再把整本小说拆成分集，产出 `breakdownHeaders + breakdownRows`。这里的每一行就是“一集讲什么、对应原文哪一段”。',
        '3. `screenplay` = 选中其中一行分集数据，传 `episodeMappingRow + sourceText`，产出这一集的可拍剧本。',
        '4. `extract-assets` = 从这一集剧本里抽人物、服装、场景、道具。',
        '5. `qc-assets` = 对上一步抽出来的资产做一致性质检。',
        '6. `storyboard` = 把“剧本 + 资产”变成分镜 CSV。',
        '7. `design-characters` = 当你已经有多集剧本时，再从全集视角提角色/服装总资产库。',
        '',
        '也就是说，真正的主链路是：',
        '`小说 -> Story Bible -> 分集拆分 -> 单集剧本 -> 单集资产 -> 资产质检 -> 单集分镜`',
        '',
        '每一步会得到什么、下一步该调什么：',
        '- `POST /api/pipeline/extract-bible`：输入整本小说，得到 `storyBible`；下一步通常调 `PUT /api/projects/{projectId}/context` 保存，或者直接去调 `breakdown`。',
        '- `POST /api/pipeline/breakdown`：输入整本小说，得到 `breakdownHeaders` 和 `breakdownRows`；下一步保存到 context，然后从 `breakdownRows` 里挑某一集去调 `screenplay`。',
        '- `POST /api/pipeline/screenplay`：输入某一集的 `episodeMappingRow + sourceText`，得到这“一集剧本”；下一步把这个剧本文本传给 `extract-assets`。',
        '- `POST /api/pipeline/extract-assets`：输入单集剧本，得到资产 JSON；下一步传给 `qc-assets`。',
        '- `POST /api/pipeline/qc-assets`：输入资产 JSON，得到质检结果；通过后下一步传给 `storyboard`。',
        '- `POST /api/pipeline/storyboard`：输入“单集剧本 + 资产”，得到这“一集的分镜 CSV”。',
        '- `POST /api/pipeline/design-characters`：输入“多集剧本集合”，得到角色服装总资产库；这不是单集分镜前的必经步骤，而是多集完成后的汇总步骤。',
        '',
        '推荐测试顺序（Swagger）：',
        '1. 先执行 `GET /api/projects/{projectId}/context`，把 `projectId` 填成 `avatar_full_test`，确认当前 context 里已有 `storyBible`、`breakdownHeaders`、`breakdownRows`、`screenplays`。',
        '2. 再执行 `POST /api/pipeline/screenplay`。这个接口最适合先在 Swagger 里测，因为它返回普通 JSON。',
        '3. 如果要验证链式连续性，再执行 `POST /api/pipeline/screenplay/stream`。注意 Swagger 会显示原始 SSE 文本，这是正常行为。',
        '4. 把上一步生成的剧本文本依次传给 `POST /api/pipeline/extract-assets`、`POST /api/pipeline/qc-assets`、`POST /api/pipeline/storyboard`。',
        '',
        '关键注意事项：',
        '- `screenplay` 实际代码里 `episodeMappingRow` 和 `sourceText` 都是必填；只传 `projectId + episodeIndex + episodeMappingRow` 会返回 400。',
        '- `projectId` 只负责自动注入 context 中已有的上游数据，不会自动替你构造 `sourceText`。',
        '- `sourceText` 建议直接按 breakdown 行拼成多行文本，例如：`ep_id: E001`、`source_range: 11-191`、`one_line_plot: ...`、`setup: ...`、`development: ...`。',
        '- 如果你现在只是想看“分镜怎么出”，不用先跑完整全量流程；只要 context 里已有某一集可用数据，就可以直接走：`GET context -> screenplay -> extract-assets -> qc-assets -> storyboard`。'
      ].join('\n')
    },
    ...(baseUrl ? { servers: [{ url: baseUrl }] } : {}),
    tags: [
      { name: 'Pipeline', description: '同步 pipeline 接口' },
      { name: 'Pipeline Stream', description: 'SSE 流式 pipeline 接口' },
      { name: 'Project Context', description: '项目上下文读写接口' },
      { name: 'Asset Library', description: '项目资产库接口' },
      { name: 'Novel', description: '长文本小说处理接口' }
    ],
    paths: {
      '/api/pipeline/extract-bible': {
        post: {
          tags: ['Pipeline'],
          summary: '提取 Story Bible',
          operationId: 'extractBible',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ExtractBibleRequest' },
            {
              novelText: '阿凡达（剧本）詹姆斯·卡梅隆作品……',
              totalEpisodes: 5,
              episodeDuration: 90,
              characterNotes: '杰克·舒利是主角，涅提妮是女主角，夸里奇上校是反派',
              globalDirective: '保持科幻冒险基调，突出人与自然主题'
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: {
                  meta: { title: '阿凡达', genre: '科幻冒险' },
                  characters: [{ name: '杰克·舒利', pronouns: '他/他的' }],
                  userDirectives: { globalInstructions: '保持科幻冒险基调，突出人与自然主题' }
                },
                reasoning: null,
                tokens: { input: 21525, output: 613 },
                step: 'extract-bible',
                agent: 'story_bible_extractor'
              }
            ),
            '400': jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, { error: 'Missing required field: novelText', step: 'extract-bible' }, 'Bad Request')
          }
        }
      },
      '/api/pipeline/extract-bible/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '提取 Story Bible（SSE）',
          operationId: 'extractBibleStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ExtractBibleRequest' },
            {
              novelText: '阿凡达（剧本）詹姆斯·卡梅隆作品……',
              totalEpisodes: 5
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"{\\"meta\\":{\\"title\\":\\"阿凡达\\"}"}\n\ndata: {"type":"done","fullText":"{\\"meta\\":{\\"title\\":\\"阿凡达\\"}}","tokens":{"input":517,"output":443}}\n')
          }
        }
      },
      '/api/pipeline/breakdown': {
        post: {
          tags: ['Pipeline'],
          summary: '生成分集拆解 CSV',
          operationId: 'breakdown',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/BreakdownRequest' },
            {
              novelText: '阿凡达（剧本）……',
              totalEpisodes: 5,
              storyBible: { meta: { title: '阿凡达' } }
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: 'ep_id,source_range,one_line_plot,setup,development,turn,hook,scene_list,characters,must_keep,no_add\nE001,11-191,杰克·舒利在弗吉尼亚州医院回忆过去的飞行梦...',
                reasoning: null,
                tokens: { input: 22330, output: 738 },
                step: 'breakdown',
                agent: 'story_breakdown_pack'
              }
            ),
            '400': jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, { error: 'Missing required field: novelText', step: 'breakdown' }, 'Bad Request')
          }
        }
      },
      '/api/pipeline/breakdown/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '生成分集拆解 CSV（SSE）',
          operationId: 'breakdownStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/BreakdownRequest' },
            {
              novelText: '阿凡达（剧本）……',
              totalEpisodes: 5
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"ep_id,source_range,one_line_plot"}\n\ndata: {"type":"done","fullText":"ep_id,source_range,one_line_plot\\nE001,...","tokens":{"input":2000,"output":700}}\n')
          }
        }
      },
      '/api/pipeline/screenplay': {
        post: {
          tags: ['Pipeline'],
          summary: '生成单集剧本',
          operationId: 'screenplay',
          description: '支持 `projectId` 自动注入 context。若 `episodeIndex > 0` 且未显式传 `previousScreenplay`，后端会自动从 `screenplays[episodeIndex - 1]` 读取上一集剧本。',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ScreenplayRequest' },
            {
              projectId: 'avatar_full_test',
              episodeIndex: 1,
              episodeMappingRow: 'E002,192-473,杰克得知哥哥汤米去世的消息，并被招募前往潘多拉星球。',
              sourceText: 'ep_id: E002\nsource_range: 192-473\none_line_plot: 杰克得知哥哥汤米去世的消息...',
              screenwriterMode: 'shootable_90s_pro'
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: '0:00-0:15\n[Visual] 市政火葬场灰白走廊尽头，一扇标着“低温间”的铁门微微渗出寒气。\n[Visual] 杰克·舒利坐在轮椅上，双手紧攥扶手……',
                reasoning: null,
                tokens: { input: 1814, output: 787 },
                step: 'screenplay',
                agent: 'screenwriter'
              }
            ),
            '400': jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, { error: 'Missing required field: episodeMappingRow', step: 'screenplay' }, 'Bad Request')
          }
        }
      },
      '/api/pipeline/screenplay/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '生成单集剧本（SSE）',
          operationId: 'screenplayStream',
          description: '支持 `projectId` 自动注入与回写 `context.screenplays`。',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ScreenplayRequest' },
            {
              projectId: 'avatar_full_test',
              episodeIndex: 2,
              episodeMappingRow: 'E003,474-751,杰克抵达潘多拉星球，开始适应新的环境。',
              sourceText: 'ep_id: E003\nsource_range: 474-751\none_line_plot: 杰克抵达潘多拉星球...'
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"0:00-0:15\\n[Visual] EXT. 潘多拉星球大气层边缘 — DAY"}\n\ndata: {"type":"done","fullText":"0:00-0:15\\n[Visual] EXT. 潘多拉星球大气层边缘 — DAY...","tokens":{"input":0,"output":0}}\n')
          }
        }
      },
      '/api/pipeline/extract-assets': {
        post: {
          tags: ['Pipeline'],
          summary: '从剧本提取资产',
          operationId: 'extractAssets',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ExtractAssetsRequest' },
            {
              projectId: 'avatar_full_test',
              screenplay: '0:00-0:15\n[Visual] 市政火葬场灰白走廊尽头……'
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: {
                  character_library: [{ character_name: '杰克·舒利' }],
                  costume_library: [{ costume_name: '火葬场便服' }]
                },
                reasoning: null,
                tokens: { input: 294, output: 255 },
                step: 'extract-assets',
                agent: 'asset_extractor'
              }
            )
          }
        }
      },
      '/api/pipeline/extract-assets/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '从剧本提取资产（SSE）',
          operationId: 'extractAssetsStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ExtractAssetsRequest' },
            { screenplay: '0:00-0:15\n[Visual] 市政火葬场灰白走廊尽头……' }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"{\\"character_library\\":["}\n\ndata: {"type":"done","fullText":"{\\"character_library\\":[{\\"character_name\\":\\"杰克·舒利\\"}]}","tokens":{"input":294,"output":255}}\n')
          }
        }
      },
      '/api/pipeline/qc-assets': {
        post: {
          tags: ['Pipeline'],
          summary: '资产质检',
          operationId: 'qcAssets',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/QcAssetsRequest' },
            {
              assets: {
                character_library: [{ character_name: '杰克·舒利' }],
                costume_library: [{ costume_name: '火葬场便服' }]
              }
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: { pass: true, errors: [], warnings: [] },
                reasoning: null,
                tokens: { input: 223, output: 11 },
                step: 'qc-assets',
                agent: 'asset_qc_gate'
              }
            )
          }
        }
      },
      '/api/pipeline/qc-assets/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '资产质检（SSE）',
          operationId: 'qcAssetsStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/QcAssetsRequest' },
            {
              assets: {
                character_library: [{ character_name: '杰克·舒利' }]
              }
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"{\\"pass\\":true"}\n\ndata: {"type":"done","fullText":"{\\"pass\\":true,\\"errors\\":[],\\"warnings\\":[]}","tokens":{"input":223,"output":11}}\n')
          }
        }
      },
      '/api/pipeline/storyboard': {
        post: {
          tags: ['Pipeline'],
          summary: '生成分镜 CSV',
          operationId: 'storyboard',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/StoryboardRequest' },
            {
              projectId: 'avatar_full_test',
              screenplay: '0:00-0:15\n[Visual] 市政火葬场灰白走廊尽头……',
              assets: {
                characters: [{ name: '杰克·舒利' }]
              }
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: '镜号,时间码,场景,角色,服装,道具,景别,角度,焦距,运动,构图,画面描述,动作,神态,台词,旁白,光线,音效,叙事功能,Image_Prompt,Video_Prompt\n1,0:00-0:03,火葬场走廊,杰克·舒利,...',
                reasoning: null,
                tokens: { input: 603, output: 328 },
                step: 'storyboard',
                agent: 'storyboard_csv'
              }
            )
          }
        }
      },
      '/api/pipeline/storyboard/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '生成分镜 CSV（SSE）',
          operationId: 'storyboardStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/StoryboardRequest' },
            {
              screenplay: '0:00-0:15\n[Visual] 市政火葬场灰白走廊尽头……'
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"镜号,时间码,场景"}\n\ndata: {"type":"done","fullText":"镜号,时间码,场景\\n1,0:00-0:03,火葬场走廊,...","tokens":{"input":603,"output":328}}\n')
          }
        }
      },
      '/api/pipeline/design-characters': {
        post: {
          tags: ['Pipeline'],
          summary: '从全部剧本提取角色服装资产库',
          operationId: 'designCharacters',
          description: '支持直接传 `screenplays`，也支持仅传 `projectId` 由后端从 context 自动注入。',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/DesignCharactersRequest' },
            {
              projectId: 'avatar_full_test',
              totalEpisodes: 5,
              episodeDuration: 90
            }
          ),
          responses: {
            '200': jsonResponse(
              genericSyncResponse,
              {
                result: {
                  characters: [{ name: '杰克·舒利', pronouns: '他/他的' }],
                  costumes: [{ character_name: '杰克·舒利', costume_name: '火葬场便服' }]
                },
                reasoning: null,
                tokens: { input: 1177, output: 1920 },
                step: 'design-characters',
                agent: 'character_costume'
              }
            ),
            '400': jsonResponse({ $ref: '#/components/schemas/ErrorResponse' }, { error: 'Missing required field: screenplay or screenplays', step: 'design-characters' }, 'Bad Request')
          }
        }
      },
      '/api/pipeline/design-characters/stream': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '从全部剧本提取角色服装资产库（SSE）',
          operationId: 'designCharactersStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/DesignCharactersRequest' },
            {
              projectId: 'avatar_full_test',
              totalEpisodes: 5,
              episodeDuration: 90
            }
          ),
          responses: {
            '200': streamResponse(':ok\n\ndata: {"type":"chunk","content":"{\\"characters\\":["}\n\ndata: {"type":"done","fullText":"{\\"characters\\":[{\\"name\\":\\"杰克·舒利\\"}]}","tokens":{"input":1177,"output":1920}}\n')
          }
        }
      },
      '/api/pipeline/run': {
        post: {
          tags: ['Pipeline Stream'],
          summary: '串行执行多个 pipeline step',
          operationId: 'pipelineRun',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/PipelineRunRequest' },
            {
              novelText: '阿凡达（剧本）……',
              totalEpisodes: 5,
              steps: ['extract-bible', 'breakdown']
            }
          ),
          responses: {
            '200': streamResponse('data: {"type":"step_start","step":"extract-bible","stepIndex":0,"totalSteps":2}\n\ndata: {"type":"step_complete","step":"extract-bible","result":"{\\"meta\\":{\\"title\\":\\"阿凡达\\"}}","tokens":{"input":517,"output":443}}\n\ndata: {"type":"pipeline_complete","results":{"extract-bible":{"meta":{"title":"阿凡达"}},"breakdown":"ep_id,source_range,..."}}\n')
          }
        }
      },
      '/api/projects/{projectId}/context': {
        put: {
          tags: ['Project Context'],
          summary: '保存 pipeline context',
          operationId: 'putProjectContext',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/ContextPatch' },
            {
              storyBible: { meta: { title: '阿凡达' } },
              projectConfig: { totalEpisodes: 5, episodeDuration: 90 }
            }
          ),
          responses: {
            '200': jsonResponse({ type: 'object', properties: { status: { type: 'string' } } }, { status: 'ok' })
          }
        },
        get: {
          tags: ['Project Context'],
          summary: '读取完整 pipeline context',
          operationId: 'getProjectContext',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            '200': jsonResponse(
              { $ref: '#/components/schemas/ProjectContext' },
              {
                storyBible: { meta: { title: '阿凡达' } },
                projectConfig: { totalEpisodes: 5, episodeDuration: 90 },
                screenplays: { '0': '0:00-0:15\n[Visual] 弗吉尼亚州医院的病房内……' }
              }
            )
          }
        }
      },
      '/api/projects/{projectId}/context/{key}': {
        get: {
          tags: ['Project Context'],
          summary: '读取 context 单字段',
          operationId: 'getProjectContextKey',
          parameters: [
            { $ref: '#/components/parameters/ProjectId' },
            { $ref: '#/components/parameters/ContextKey' }
          ],
          responses: {
            '200': jsonResponse(
              {
                oneOf: [
                  { type: 'object', additionalProperties: true },
                  { type: 'array', items: {} },
                  { type: 'string' },
                  { type: 'null' }
                ]
              },
              { '0': '0:00-0:15\n[Visual] 弗吉尼亚州医院的病房内……' }
            )
          }
        }
      },
      '/api/projects/{projectId}/asset-library': {
        put: {
          tags: ['Asset Library'],
          summary: '保存完整资产库',
          operationId: 'putAssetLibrary',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/AssetLibrary' },
            {
              character_library: [{ name: 'Jake Sully', personality: '勇敢坚韧' }],
              costume_library: [{ character: 'Jake Sully', name: '海军陆战队制服', description: '迷彩军装，轮椅' }],
              scene_library: [{ name: '潘多拉丛林', description: '生物荧光植物密布的外星丛林' }],
              prop_library: [{ name: '阿凡达连接舱', description: '高科技意识连接设备' }]
            }
          ),
          responses: {
            '200': jsonResponse({ type: 'object', properties: { status: { type: 'string' } } }, { status: 'ok' })
          }
        },
        get: {
          tags: ['Asset Library'],
          summary: '读取完整资产库',
          operationId: 'getAssetLibrary',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            '200': jsonResponse(
              { $ref: '#/components/schemas/AssetLibrary' },
              {
                character_library: [{ character_name: '杰克·舒利' }],
                costume_library: [{ costume_name: '火葬场便服' }],
                scene_library: [{ name: '火葬场走廊' }],
                prop_library: [{ name: '电子协议' }]
              }
            )
          }
        }
      },
      '/api/projects/{projectId}/characters': {
        get: {
          tags: ['Asset Library'],
          summary: '读取角色列表',
          operationId: 'getCharacters',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            '200': jsonResponse(
              { type: 'array', items: { type: 'object', additionalProperties: true } },
              [{ character_name: '杰克·舒利', personality: '坚韧、愤怒、渴望证明自己' }]
            )
          }
        }
      },
      '/api/projects/{projectId}/costumes': {
        get: {
          tags: ['Asset Library'],
          summary: '读取服装列表',
          operationId: 'getCostumes',
          parameters: [{ $ref: '#/components/parameters/ProjectId' }],
          responses: {
            '200': jsonResponse(
              { type: 'array', items: { type: 'object', additionalProperties: true } },
              [{ costume_name: '火葬场便服', description: '市政火葬场场景服装' }]
            )
          }
        }
      },
      '/api/novel/structure': {
        post: {
          tags: ['Novel'],
          summary: '小说结构分析',
          operationId: 'novelStructure',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/NovelStructureRequest' },
            { novel: '小说全文（可以很长）' }
          ),
          responses: {
            '200': jsonResponse(
              {
                type: 'object',
                properties: {
                  result: { type: 'string' },
                  totalChars: { type: 'number' }
                }
              },
              {
                result: '{"title":"阿凡达","totalChars":38203,"estimatedEpisodes":5}',
                totalChars: 38203
              }
            )
          }
        }
      },
      '/api/novel/chunk': {
        post: {
          tags: ['Novel'],
          summary: '单段分析',
          operationId: 'novelChunk',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/NovelChunkRequest' },
            {
              chunkText: '预切片的文本段',
              chunkIndex: 0,
              chunkSize: 100000,
              totalChunks: 9,
              agentId: 'story_breakdown_pack',
              context: { previousSummary: '前文摘要' }
            }
          ),
          responses: {
            '200': jsonResponse(
              {
                type: 'object',
                properties: {
                  result: { type: 'string' },
                  chunkIndex: { type: 'number' },
                  processed: { type: 'string' },
                  tokens: { $ref: '#/components/schemas/Tokens' }
                }
              },
              {
                result: 'agent 对该段的分析输出',
                chunkIndex: 0,
                processed: '0-100000',
                tokens: { input: 24920, output: 2984 }
              }
            )
          }
        }
      },
      '/api/novel/aggregate': {
        post: {
          tags: ['Novel'],
          summary: '聚合分段结果（同步）',
          operationId: 'novelAggregate',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/NovelAggregateRequest' },
            {
              chunks: ['段落1结果', '段落2结果'],
              targetEpisodes: 80,
              title: '小说标题',
              novelText: '小说全文',
              chunkSize: 100000
            }
          ),
          responses: {
            '200': jsonResponse(
              {
                type: 'object',
                properties: {
                  result: { type: 'string' }
                }
              },
              {
                result: 'ep_id,arc_block,source_range,source_text\nE001,A1,8-28,"原文..."\nE002,A1,29-58,"原文..."'
              }
            )
          }
        }
      },
      '/api/novel/aggregate-stream': {
        post: {
          tags: ['Novel'],
          summary: '聚合分段结果（SSE）',
          operationId: 'novelAggregateStream',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/NovelAggregateRequest' },
            {
              chunks: ['段落1结果', '段落2结果'],
              targetEpisodes: 80,
              title: '小说标题',
              novelText: '小说全文',
              chunkSize: 100000
            }
          ),
          responses: {
            '200': streamResponse('data: {"type":"progress","message":"开始处理","batch":1,"totalBatches":2}\n\ndata: {"type":"batch_done","batch":1,"totalBatches":2,"episodes":40,"status":"ok"}\n\ndata: {"type":"done","result":"ep_id,arc_block,source_range,...","episodes":80,"targetEpisodes":80}\n')
          }
        }
      },
      '/api/novel/preview': {
        post: {
          tags: ['Novel'],
          summary: '小说采样预览',
          operationId: 'novelPreview',
          requestBody: jsonRequest(
            { $ref: '#/components/schemas/NovelPreviewRequest' },
            {
              novel: '小说全文（必填）',
              sampleSize: 3000
            }
          ),
          responses: {
            '200': jsonResponse(
              {
                type: 'object',
                properties: {
                  result: { type: 'string' }
                }
              },
              {
                result: '{"title":"阿凡达","genre":"科幻冒险","mainCharacters":["杰克·舒利","涅提妮"],"estimatedEpisodes":5}'
              }
            )
          }
        }
      }
    },
    components: {
      parameters: {
        ProjectId: {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: '项目 ID，例如 `avatar_full_test`'
        },
        ContextKey: {
          name: 'key',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['storyBible', 'screenplays', 'breakdownRows', 'breakdownHeaders', 'projectConfig', 'assetLibrary']
          },
          description: 'context 字段名'
        }
      },
      schemas: {
        Tokens: {
          type: 'object',
          properties: {
            input: { type: 'number' },
            output: { type: 'number' }
          },
          additionalProperties: true
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            step: { type: 'string' }
          }
        },
        AnyObject: {
          type: 'object',
          additionalProperties: true
        },
        StoryBible: {
          type: 'object',
          properties: {
            meta: { type: 'object', additionalProperties: true },
            characters: { type: 'array', items: { type: 'object', additionalProperties: true } },
            userDirectives: { type: 'object', additionalProperties: true }
          },
          additionalProperties: true
        },
        ExtractBibleRequest: {
          type: 'object',
          required: ['novelText'],
          properties: {
            novelText: { type: 'string', description: '原著全文，超过 200000 字后端会截断' },
            totalEpisodes: { type: 'number', default: 80 },
            episodeDuration: { type: 'number' },
            shotsPerMin: { type: 'number' },
            characterNotes: { type: 'string' },
            globalDirective: { type: 'string' },
            stylePreferences: { type: 'string' },
            projectId: { type: 'string', description: '可选；传入后会尝试从 context 注入已有数据' }
          }
        },
        BreakdownRequest: {
          type: 'object',
          required: ['novelText'],
          properties: {
            novelText: { type: 'string' },
            totalEpisodes: { type: 'number', default: 80 },
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            projectId: { type: 'string' }
          }
        },
        ScreenplayRequest: {
          type: 'object',
          required: ['episodeMappingRow', 'sourceText'],
          properties: {
            projectId: { type: 'string', description: '传入后自动注入 storyBible / breakdownRows / screenplays 等 context' },
            episodeIndex: { type: 'number', description: '0-based；用于 continuity 自动读取/回写' },
            episodeMappingRow: { type: 'string' },
            sourceText: { type: 'string' },
            characterPronouns: { type: 'object', additionalProperties: { type: 'string' } },
            screenwriterMode: { type: 'string', default: 'shootable_90s_pro' },
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            allEpisodePlots: { type: 'string', description: '可选；不传时后端可由 breakdownRows 自动构建' },
            previousScreenplay: { type: 'string', description: '可选；不传时且 episodeIndex > 0，后端会尝试从 screenplays 自动读取' },
            screenplays: { type: 'object', additionalProperties: { type: 'string' } },
            breakdownRows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            breakdownHeaders: { type: 'array', items: { type: 'string' } }
          }
        },
        ExtractAssetsRequest: {
          type: 'object',
          required: ['screenplay'],
          properties: {
            projectId: { type: 'string' },
            screenplay: { type: 'string' },
            storyBible: { $ref: '#/components/schemas/StoryBible' }
          }
        },
        QcAssetsRequest: {
          type: 'object',
          required: ['assets'],
          properties: {
            projectId: { type: 'string' },
            assets: { type: 'object', additionalProperties: true },
            storyBible: { $ref: '#/components/schemas/StoryBible' }
          }
        },
        StoryboardRequest: {
          type: 'object',
          required: ['screenplay'],
          properties: {
            projectId: { type: 'string' },
            screenplay: { type: 'string' },
            assets: { type: 'object', additionalProperties: true },
            storyBible: { $ref: '#/components/schemas/StoryBible' }
          }
        },
        DesignCharactersRequest: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: '如果 context 已有 screenplays / storyBible，可只传 projectId + 集数配置' },
            screenplays: { type: 'object', additionalProperties: { type: 'string' } },
            screenplay: { type: 'string' },
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            totalEpisodes: { type: 'number', default: 80 },
            episodeDuration: { type: 'number', default: 60 },
            globalDirective: { type: 'string' },
            assets: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }] }
          },
          description: '`screenplays` 与 `screenplay` 二选一；如果传 `projectId` 且 context 已有 `screenplays`，可都不传。'
        },
        PipelineRunRequest: {
          type: 'object',
          required: ['novelText'],
          properties: {
            novelText: { type: 'string' },
            totalEpisodes: { type: 'number', default: 80 },
            steps: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['extract-bible', 'breakdown', 'screenplay', 'extract-assets', 'qc-assets', 'storyboard', 'design-characters']
              }
            },
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            characterNotes: { type: 'string' },
            globalDirective: { type: 'string' },
            stylePreferences: { type: 'string' },
            episodeDuration: { type: 'number' },
            shotsPerMin: { type: 'number' },
            episodeMappingRow: { type: 'string' },
            sourceText: { type: 'string' },
            characterPronouns: { type: 'object', additionalProperties: { type: 'string' } },
            screenwriterMode: { type: 'string' },
            screenplay: { type: 'string' },
            assets: { type: 'object', additionalProperties: true }
          }
        },
        ProjectContext: {
          type: 'object',
          properties: {
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            projectConfig: {
              type: 'object',
              properties: {
                totalEpisodes: { type: 'number' },
                episodeDuration: { type: 'number' }
              },
              additionalProperties: true
            },
            breakdownHeaders: { type: 'array', items: { type: 'string' } },
            breakdownRows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            screenplays: { type: 'object', additionalProperties: { type: 'string' } },
            assetLibrary: { $ref: '#/components/schemas/AssetLibrary' }
          },
          additionalProperties: true
        },
        ContextPatch: {
          type: 'object',
          properties: {
            storyBible: { $ref: '#/components/schemas/StoryBible' },
            screenplays: { type: 'object', additionalProperties: { type: 'string' } },
            breakdownRows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            breakdownHeaders: { type: 'array', items: { type: 'string' } },
            projectConfig: {
              type: 'object',
              properties: {
                totalEpisodes: { type: 'number' },
                episodeDuration: { type: 'number' }
              },
              additionalProperties: true
            },
            assetLibrary: { $ref: '#/components/schemas/AssetLibrary' }
          },
          additionalProperties: false
        },
        AssetLibrary: {
          type: 'object',
          properties: {
            character_library: { type: 'array', items: { type: 'object', additionalProperties: true } },
            costume_library: { type: 'array', items: { type: 'object', additionalProperties: true } },
            scene_library: { type: 'array', items: { type: 'object', additionalProperties: true } },
            prop_library: { type: 'array', items: { type: 'object', additionalProperties: true } }
          },
          additionalProperties: true
        },
        NovelStructureRequest: {
          type: 'object',
          required: ['novel'],
          properties: {
            novel: { type: 'string' }
          }
        },
        NovelChunkRequest: {
          type: 'object',
          required: ['chunkText'],
          properties: {
            chunkText: { type: 'string' },
            chunkIndex: { type: 'number' },
            chunkSize: { type: 'number' },
            totalChunks: { type: 'number' },
            agentId: { type: 'string' },
            context: { type: 'object', additionalProperties: true }
          }
        },
        NovelAggregateRequest: {
          type: 'object',
          required: ['chunks'],
          properties: {
            chunks: { type: 'array', items: { type: 'string' } },
            targetEpisodes: { type: 'number', default: 80 },
            title: { type: 'string' },
            novelText: { type: 'string' },
            chunkSize: { type: 'number' }
          }
        },
        NovelPreviewRequest: {
          type: 'object',
          required: ['novel'],
          properties: {
            novel: { type: 'string' },
            sampleSize: { type: 'number', default: 3000 }
          }
        }
      }
    }
  };

  return spec;
}

export function buildSwaggerUiHtml(specUrl = '/openapi.json') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FizzDragon Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #fafafa;
    }
    #swagger-ui {
      height: 100%;
    }
    .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: false,
      docExpansion: 'list',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      layout: 'StandaloneLayout'
    });
  </script>
</body>
</html>`;
}
