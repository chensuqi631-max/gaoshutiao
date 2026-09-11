// 智赢ERP 采集 — DeepSeek Harness 插件 (Cordis Host 插件)
// 注册采集工具到 harness: 模型可在对话中直接调用 (列表直采/筛选采集/跟卖并行/停止/系统状态)
// 所有工具通过 fetch 调用本地智赢ERP后端 (http://127.0.0.1:3088; 插件启动时会自动把它拉起来)
import { ensureErp, isUp, license } from './lib/erp-launcher.js';

const API = 'http://127.0.0.1:3088';
/** 调 3088 系统接口 (GET/POST JSON) */
async function sys(path, body) {
  const r = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || ('系统请求失败 (HTTP ' + r.status + ')'));
  return j;
}

/** 构建工具对象 (等效 defineTool 返回结构: name/description/parameters(output schema)/output/render/execute) */
function tool(name, description, parameters, execute) {
  const required = Object.keys(parameters).filter((k) => parameters[k].required);
  const properties = {};
  Object.keys(parameters).forEach((k) => {
    const p = parameters[k];
    const prop = { type: p.type, description: p.description || '' };
    if (p.enum) prop.enum = p.enum;
    properties[k] = prop;
  });
  return {
    name,
    description,
    parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      return execute(args);
    },
  };
}

export const name = 'zying-collect';

export const inject = ['tools'];

export function apply(ctx) {
  // 自动拉起本地后端: 市场一键安装的用户装完插件、重启 DSH 就能直接用
  // (已在运行则什么都不做, 不会干扰手动启动的开发环境)
  ensureErp(ctx).catch((e) => console.log('[zying-erp] 自动启动失败: ' + (e && e.message)));

  ctx.effect(() => ctx.tools.register(tool('zying_health',
    '检查智赢ERP系统是否在线及商品库数量 (调用本地 127.0.0.1:3088)。采集相关操作前可先调用确认系统可用。授权状态也在这里返回。',
    {},
    async () => {
      const up = await isUp(1500);
      if (!up) return { online: false, note: '本地后端没在运行。插件启动时已尝试自动拉起; 若仍不在, 可在插件目录手动执行: node erp/server.js 3088' };
      const p = await sys('/api/products');
      const lic = await license();
      return {
        online: true, total: p.total, time: new Date().toISOString(),
        license: lic ? {
          valid: lic.valid, customer: lic.customer, expiresAt: lic.expiresAt,
          message: lic.message || null,
          // 未授权时把指纹给模型, 方便直接告诉用户"把这串发给授权方"
          fingerprint: lic.valid ? undefined : lic.fingerprint,
          needLicense: !lic.valid,
        } : null,
      };
    })),
    'zying health');

  ctx.effect(() => ctx.tools.register(tool('zying_list_direct',
    '列表页直采: 直接读取 Amazon 列表页所有商品 + 智赢插件信息 (FBA/排名/1688/人民币价), 不跳详情页, 支持自动翻页多页采集。返回商品数量/新增入库数。',
    {
      url: { type: 'string', required: true, description: 'Amazon 列表页 URL (搜索/类目页, 如 https://www.amazon.co.uk/s?k=Car+Accessories)' },
      maxPages: { type: 'number', description: '翻页数 (1-10, 默认1, 自动采多页免手动跳转)' },
      maxItems: { type: 'number', description: '入库上限 (默认100)' },
      waitPluginMs: { type: 'number', description: '等待智赢插件分析毫秒数 (默认15000, 插件信息覆盖更多可加大)' },
    },
    async (a) => {
      const r = await sys('/api/collect/list-direct', { url: a.url, maxPages: a.maxPages || 1, maxItems: a.maxItems || 100, waitPluginMs: a.waitPluginMs });
      return { site: r.site, pages: r.pagesDone, total: r.total, productCount: r.productCount, added: r.added, withPlugin: r.withPlugin };
    })),
    'zying list-direct');

  ctx.effect(() => ctx.tools.register(tool('zying_list_filtered',
    '列表页筛选采集: 列表页直采 → 用筛选条件前置过滤 (FBA/FBM/排名/评分/关键词) → 只跳通过的商品取详情页数据 (含商标/跟卖) → 入库。返回各阶段数量。',
    {
      url: { type: 'string', required: true, description: 'Amazon 列表页 URL' },
      maxPages: { type: 'number', description: '翻页数 (1-10, 默认1)' },
      filterFulfill: { type: 'string', enum: ['FBA', 'FBM'], description: '配送方式筛选 (仅采 FBA 或 FBM)' },
      filterRankMax: { type: 'number', description: 'BSR 排名 ≤ 上限' },
      filterRatingMin: { type: 'number', description: '评分 ≥ 下限 (0-5)' },
      filterReviewsMin: { type: 'number', description: '评论数 ≥ 下限' },
      filterQ: { type: 'string', description: '标题含关键词' },
      aod: { type: 'boolean', description: '是否采 aod 跟卖卖家 (默认 true)' },
    },
    async (a) => {
      const r = await sys('/api/collect/list-filtered', {
        url: a.url, maxPages: a.maxPages || 1, maxItems: 100,
        filterFulfill: a.filterFulfill || '', filterRankMax: a.filterRankMax, filterRatingMin: a.filterRatingMin,
        filterReviewsMin: a.filterReviewsMin, filterQ: a.filterQ || '', aod: a.aod !== false,
      });
      return { site: r.site, total: r.total, preFiltered: r.preFiltered, skippedByList: r.skippedByList, enriched: r.enriched, productCount: r.productCount, added: r.added };
    })),
    'zying list-filtered');

  ctx.effect(() => ctx.tools.register(tool('zying_follow_shop',
    '商品跟卖并行采集: 输入商品 URL/ASIN, 从 aod 实时提取全部跟卖卖家, 并行采集各卖家店铺商品入库 (全程 CDP, 耗时较长)。返回店铺成功/失败数/采集商品数。',
    {
      url: { type: 'string', required: true, description: 'Amazon 商品页 URL 或 ASIN' },
      maxItems: { type: 'number', description: '每店铺商品数上限 (默认10)' },
      maxPages: { type: 'number', description: '每店铺翻页数 (默认2)' },
      concurrency: { type: 'number', description: '并行网页数 (1-6, 默认4)' },
      excludeSellers: { type: 'string', description: '排除卖家 (名称/ID, 逗号分隔)' },
    },
    async (a) => {
      const r = await sys('/api/collect/follow-shop-aod', {
        urls: [a.url], maxItems: a.maxItems || 10, maxPages: a.maxPages || 2, concurrency: a.concurrency || 4,
        excludeSellers: a.excludeSellers || '', amazonWords: 'amazon,亚马逊',
      });
      return { shopOk: r.shopOk, shopFail: r.shopFail, productCount: r.productCount, added: r.added, stopped: r.stopped || false };
    })),
    'zying follow-shop');

  ctx.effect(() => ctx.tools.register(tool('zying_stop',
    '停止当前采集: 系统采集循环在当前步骤完成后提前退出, 已采数据保留入库。',
    {},
    async () => sys('/api/collect/stop', {}).then(() => ({ stopped: true, note: '已请求停止, 当前步骤完成后退出 (已采数据已保存)' })))),
    'zying stop');
}

