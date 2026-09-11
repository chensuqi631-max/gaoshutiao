/* ===== 亚马逊跟卖ERP Demo — 前端逻辑 ===== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const API = async (path, opts = {}) => {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const j = await r.json();
  // 非 2xx → 抛错, 前端 catch 显示真实错误 (避免出现 ✅ + undefined)
  if (!r.ok) throw new Error(j.error || ('请求失败 (' + r.status + ')'));
  return j;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = (n, cur) => {
  if (n == null) return '-';
  const sym = { GBP: '£', USD: '$', EUR: '€', JPY: '¥', CAD: 'C$', INR: '₹', MXN: 'MX$', AUD: 'A$', PLN: 'zł', SEK: 'kr', SAR: 'SAR', SGD: 'S$', BRL: 'R$', TRY: '₺' }[cur] || (cur ? cur + ' ' : '£');
  return sym + Number(n).toFixed(2);
};
const fmtNum = (n) => (n == null ? '-' : Number(n).toLocaleString());

/* ===== 系统内部弹窗 (替代 alert/prompt/confirm) ===== */
let modalSeq = 0;
function showModal({ title = '提示', body = '', buttons = [{ label: '确定', primary: true, value: 'ok' }], onResult = () => {} }) {
  const id = 'zyModal' + (++modalSeq);
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = id;
  mask.innerHTML = `
    <div class="modal" style="max-width:${buttons.some((b) => b.form) ? '520px' : '420px'}">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="modal-close" data-act="close">✕</button>
      </div>
      <div class="modal-body">
        <div class="zy-modal-content">${body}</div>
        <div class="toolbar" style="justify-content:flex-end;margin:16px 0 0">
          ${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${esc(b.value)}" data-form="${b.form ? '1' : ''}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(mask);
  const close = (result) => {
    const inputs = {};
    mask.querySelectorAll('[data-field]').forEach((el) => { inputs[el.dataset.field] = el.value; });
    mask.remove();
    onResult(result === 'close' ? null : result, inputs);
  };
  mask.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) { close(btn.dataset.act); return; }
    if (e.target === mask) close('close');
  });
  // 表单输入框回车确认
  mask.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-field]')) {
      const ok = mask.querySelector('[data-act][data-form]');
      if (ok) ok.click();
    }
  });
  return id;
}
// 大图灯箱: 点击主图放大查看
function openImageLightbox(src, title = '') {
  const mask = document.createElement('div');
  mask.className = 'modal-mask img-lightbox';
  mask.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:99999;background:rgba(0,0,0,.82);cursor:zoom-out" data-act="close">
      <div style="max-width:92vw;max-height:88vh;text-align:center">
        <img src="${esc(src)}" alt="${esc(title)}" style="max-width:92vw;max-height:82vh;border-radius:8px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.5)">
        <div style="color:#ccc;font-size:12px;margin-top:8px">${esc(title || '')} · 点击任意处关闭</div>
      </div>
    </div>`;
  document.body.appendChild(mask);
  mask.addEventListener('click', () => mask.remove());
  document.addEventListener('keydown', function escKey(e) { if (e.key === 'Escape') { mask.remove(); document.removeEventListener('keydown', escKey); } });
}

// 消息框 (替代 alert)
function zyAlert(title, message = '') {
  return new Promise((resolve) => {
    showModal({
      title: title || '提示',
      body: message ? `<div style="line-height:1.7">${message}</div>` : '',
      buttons: [{ label: '确定', primary: true, value: 'ok' }],
      onResult: (r) => resolve(r === 'ok'),
    });
  });
}
// 确认框 (替代 confirm)
function zyConfirm(title, message = '') {
  return new Promise((resolve) => {
    showModal({
      title: title || '确认',
      body: message ? `<div style="line-height:1.7">${message}</div>` : '',
      buttons: [
        { label: '取消', value: 'no' },
        { label: '确定', primary: true, value: 'yes' },
      ],
      onResult: (r) => resolve(r === 'yes'),
    });
  });
}
// 表单输入框 (替代 prompt): fields = [{field,label,placeholder,default,type,options}]
function zyPromptForm(title, fields, opts = {}) {
  return new Promise((resolve) => {
    const rows = fields.map((f) => {
      if (f.divider) return `<div style="margin:14px 0 10px;padding-top:10px;border-top:1px solid #e5e5e5;font-weight:600;color:var(--muted)">${esc(f.divider)}</div>`;
      const label = f.label ? `<div class="muted" style="margin-bottom:4px">${esc(f.label)}</div>` : '';
      let input;
      if (f.type === 'select' && f.options) {
        input = `<select class="select" data-field="${esc(f.field)}" style="width:100%">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value == f.default ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      } else if (f.type === 'number') {
        input = `<input class="input" type="number" data-field="${esc(f.field)}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.default != null ? f.default : '')}" style="width:100%">`;
      } else {
        input = `<input class="input" type="text" data-field="${esc(f.field)}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.default != null ? f.default : '')}" style="width:100%">`;
      }
      return `<div style="margin-bottom:12px">${label}${input}</div>`;
    }).join('');
    showModal({
      title: title || '输入',
      body: `<div class="zy-modal-form">${rows}${opts.hint ? `<div class="muted" style="margin-top:4px">${esc(opts.hint)}</div>` : ''}</div>`,
      buttons: [
        { label: '取消', value: 'no' },
        { label: '确定', primary: true, value: 'ok', form: true },
      ],
      onResult: (r, inputs) => {
        if (r === 'ok') {
          const vals = {};
          fields.forEach((f) => { if (f.divider) return; vals[f.field] = inputs[f.field] ?? f.default; });
          resolve(vals);
        } else {
          resolve(null);
        }
      },
    });
  });
}

/* ===== 主题切换 ===== */
function initTheme() {
  const btn = $('#themeToggle');
  const apply = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#themeIcon').textContent = dark ? '🌙' : '☀️';
    $('#themeLabel').textContent = dark ? '暗色' : '亮色';
  };
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('zying-theme', document.documentElement.dataset.theme);
    apply();
  });
  const saved = localStorage.getItem('zying-theme');
  if (saved) { document.documentElement.dataset.theme = saved; }
  apply();
}

/* ===== 悬浮气泡 ===== */
const tooltip = $('#tooltip');
function showTooltip(e, title, desc) {
  tooltip.innerHTML = `<div class="tt-title">${esc(title)}</div>${desc ? `<div>${esc(desc)}</div>` : ''}`;
  tooltip.classList.remove('hidden');
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}
function hideTooltip() { tooltip.classList.add('hidden'); }

/* ===== 导航 ===== */
/* ===== 线性 SVG 图标系统 (Apple SF Symbols 风格: 细描边/圆角端点/当前色) ===== */
const ICONS = {
  workbench: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  collect: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  product: '<path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5z"/><path d="M3 8.5 12 14l9-5.5"/><path d="M12 14v7"/>',
  compliance: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  claims: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  reprice: '<path d="M12 2v20"/><path d="M5 6h10a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h10"/>',
  flywheel: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  agent: '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/><path d="M5 16l.7 1.6L7.3 18l-1.6.7L5 20.3l-.7-1.6L2.7 18l1.6-.4z"/>',
  knowledge: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  notify: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  send: '<path d="m22 2-11 11"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  setting: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bolt: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/>',
  layers: '<path d="m12 3 9 5.5L12 14 3 8.5z"/><path d="m3 13 9 5.5 9-5.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  logistics: '<path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
};
const ic = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">${ICONS[name] || ''}</svg>`;

const PAGES = {
  workbench: { title: '工作台', desc: '对话式操作系统: 通过对话调取数据、找商品、执行任务', icon: 'workbench' },
  collect: { title: '商品采集', desc: '6 种采集方式小模块 + 采集过滤(与自定义筛选同条件, 可保存规则), 全程CDP', icon: 'collect' },
  product: { title: '商品管理', desc: '采集到的商品数据: 列表/筛选/详情/批量操作', icon: 'product' },
  compliance: { title: '合规检测', desc: 'RAG 合规检测: 品牌库/专利库/规则库检索, 品牌监控与风险预警', icon: 'compliance' },
  claims: { title: '批量刊登', desc: '批量认领与刊登: 草稿箱编辑, 多店铺批量发布, 失败重发', icon: 'claims' },
  reprice: { title: '智能调价', desc: '15分钟自动跟价抢购物车, 保底价+差额, 策略自优化', icon: 'reprice' },
  flywheel: { title: '数据飞轮', desc: '合规/定价/选品/话术四轮驱动, 系统越用越聪明', icon: 'flywheel' },
  agent: { title: 'AI Agent', desc: '选品评估/合规审查/调价策略, 人工采纳或拒绝', icon: 'agent' },
  knowledge: { title: '知识库', desc: '品牌库/合规规则/定价策略/话术库统一管理', icon: 'knowledge' },
  logistics: { title: '物流工具', desc: '运费试算比价 (云途官网 CDP 免费试算), 物流配置, 集货发货', icon: 'logistics' },
  notify: { title: '消息通知', desc: '飞书/企微集成: 异常通知, 日报推送, 远程指令', icon: 'notify' },
};

function navigate(page) {
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  const meta = PAGES[page];
  $('#pageTitle').innerHTML = (meta.icon ? ic(meta.icon, 17) + ' ' : '') + meta.title;
  $('#pageDesc').textContent = meta.desc;
  const render = { workbench: renderWorkbench, collect: renderCollect, product: renderProduct, compliance: renderCompliance, claims: renderClaims, reprice: renderReprice, flywheel: renderFlywheel, agent: renderAgent, knowledge: renderKnowledge, logistics: renderLogistics, notify: renderNotify }[page];
  render();
}

/* ===== 工作台 ===== */
const WORKBENCH_DEFAULT = [
  { id: 'collect', emoji: '📡', name: '商品采集', desc: '双通道多维度采集: 类目/店铺/ASIN反查/关键词/僵尸采集, 后台自动执行', meta: 'P0 · 采集效率10x', page: 'collect' },
  { id: 'compliance', emoji: '🛡️', name: '品牌监控与风险预警', desc: 'RAG 合规检测: 品牌备案/BG标/TM标/专利风险, 带引用依据, 规则自动沉淀', meta: 'P0 · 准确率≥95%', page: 'compliance' },
  { id: 'claims', emoji: '📦', name: '批量刊登/认领', desc: '批量认领、ASIN裂变、草稿箱批量编辑、多店铺批量发布、状态监控', meta: 'P0 · ≥100店铺并发', page: 'claims' },
  { id: 'reprice', emoji: '🏷️', name: '智能调价', desc: '目标价=最低价-差额, 15分钟自动调价抢占购物车, 策略自优化', meta: 'P0 · 成功率≥98%', page: 'reprice' },
  { id: 'agent', emoji: '🤖', name: 'AI Agent 助手', desc: '选品评估师/合规审查员/调价策略师/运营分析师/智能客服', meta: 'P0 · 响应<10s', page: 'agent' },
  { id: 'flywheel', emoji: '🔄', name: '数据飞轮自学习', desc: '反馈回流+规则自动进化: 合规/定价/选品/话术四轮驱动', meta: 'P1 · 规则沉淀<24h', page: 'flywheel' },
  { id: 'edit', emoji: '✏️', name: '批量编辑与商品处理', desc: '批量翻译/抠白底图/一键拉伸/敏感词检测/SKU生成/模板套用', meta: 'P1', page: 'workbench' },
  { id: 'order', emoji: '🚚', name: '订单管理与物流跟踪', desc: '订单同步/三仓发货/物流追踪/订单拦截/错漏发补偿', meta: 'P1 · 72h时效', page: 'workbench' },
  { id: 'pricing', emoji: '🧮', name: '定价模板与利润预估', desc: '净收益自动计算/利润计算器/多站点多币种/防亏本定价', meta: 'P1', page: 'workbench' },
  { id: 'product', emoji: '🗃️', name: '产品库管理', desc: 'SKU生成/SPU管理/UPC豁免/变体管理/属性模板', meta: 'P1', page: 'workbench' },
  { id: 'knowledge', emoji: '📚', name: '知识库与规则库', desc: '品牌库/合规规则/运营SOP/话术库/定价策略库统一管理', meta: 'P1 · 版本回滚', page: 'knowledge' },
  { id: 'feishu', emoji: '💬', name: '飞书/企微集成', desc: '异常通知/日报推送/远程指令/远程审批, 人在外面店铺照管', meta: 'P2 · 延迟<1min', page: 'notify' },
  { id: 'schedule', emoji: '⏰', name: '定时上下架', desc: '单上单下/多上多下/定时策略/后台监控/多时区', meta: 'P2', page: 'workbench' },
  { id: 'multi', emoji: '🌐', name: '多平台多店铺管理', desc: '亚马逊/美客多/TK/Ozon/沃尔玛, 店铺绑定不限数量', meta: 'P2', page: 'workbench' },
  { id: 'finance', emoji: '💰', name: '财务自动核算', desc: '订单成本汇总/利润自动计算/多币种/报表导出', meta: 'P2', page: 'workbench' },
  { id: 'wms', emoji: '🏭', name: '仓库管理 WMS', desc: '出入库/库存/备货/退货/拦截/多仓库/库存同步', meta: 'P3', page: 'workbench' },
];
let cardOrder = JSON.parse(localStorage.getItem('zying-cards') || 'null') || WORKBENCH_DEFAULT.map((c) => c.id);

/* ===== Agent 工作台: 对话式操作系统 (类似 DSH 界面) ===== */
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');   // 本地时间戳 (会话/消息)
// 数据 (localStorage): zying-models 模型配置 | zying-curModel 当前模型 | zying-convs 会话
const DEFAULT_MODELS = [
  { id: 'm1', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' },
  { id: 'm2', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' },
];
function loadModels() {
  const raw = localStorage.getItem('zying-models');
  if (raw) { try { return JSON.parse(raw); } catch {} }
  // 首次访问: 持久化默认模型 (DeepSeek/OpenAI), 便于在「配置模型」中填写 API Key
  const defs = DEFAULT_MODELS.map((m) => ({ ...m }));
  localStorage.setItem('zying-models', JSON.stringify(defs));
  return defs;
}
function saveModels(models) { localStorage.setItem('zying-models', JSON.stringify(models)); }
function loadConvs() { return JSON.parse(localStorage.getItem('zying-convs') || 'null') || []; }
function saveConvs(convs) { localStorage.setItem('zying-convs', JSON.stringify(convs)); }
const escAgent = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 工作台 AI 系统提示词: 描述系统能力 + 工具指令格式 (LLM 决定何时调用系统动作)
const AGENT_SYSTEM_PROMPT = `你是「智赢 ERP 跨境电商采集管理助手」。你拥有系统全部数据与操作能力, 可分析、筛选、执行采集。可用动作 (回复第一行输出 [[TOOL:动作参数]] 即会真实执行):
- 查看统计 / 系统状态 / 商品库数量 → [[TOOL:查看统计]]
- 找 / 搜索商品, 如"找 手机支架" → [[TOOL:找 手机支架]]
- 筛选商品 (支持组合条件: 配送FBA/FBM/AMZ、A+、价格区间、评分、月销、跟卖数、站点、关键词、无排名), 如"筛选 FBA 价格10-50 评分4以上 月销>500 的汽车配件" "筛选无排名的商品" "找出所有A+的商品" → [[TOOL:筛选 <条件>]]
- 商品详情, 如"详情 B0XXXXXXX" → [[TOOL:详情 B0XXXXXXX]]
- 数据分析/排行, 如"分析商品库" "销量前十" "跟卖最多的商品" "商标最多的品牌" → [[TOOL:分析 <问题>]]
- 风险检查, 如"哪些商品有商标风险" "已备案的品牌" → [[TOOL:风险]]
- 采集 Amazon 列表页, 如"采集 https://www.amazon.co.uk/s?k=Car+Accessories" → [[TOOL:采集 <完整URL>]]
- 筛选采集列表页, 如"筛选采集 <URL>" → [[TOOL:筛选采集 <URL>]]
- 合规检测, 如"合规检测 B0XXXXXXX" → [[TOOL:合规检测 B0XXXXXXX]]
- 调价, 如"调价" → [[TOOL:调价]]
- 认领商品, 如"认领 B0XXXXXXX" → [[TOOL:认领 B0XXXXXXX]]
- 删除商品 (单个或逗号分隔多个), 如"删除 B0XXXXXXX" "把月销为0的删掉" (可先筛选拿到列表再删) → [[TOOL:删除 <ASIN列表>]]
- 保存商品到产品库, 如"保存 B0XXXXXXX" → [[TOOL:保存 B0XXXXXXX]]
- 同步刷新商品数据 (价格/月销/跟卖数), 如"同步 B0XXXXXXX" → [[TOOL:同步 B0XXXXXXX]]
- 清空商品库 (⚠ 不可逆, 仅在用户明确要求"清空商品库/清空全部"时使用) → [[TOOL:清空商品库]]
规则:
1. 用户指令可由上述动作完成时, **回复第一行必须是 [[TOOL:动作参数]]** (不加 markdown 代码块, 不加其他格式), 后续可加简短说明。若第一行不是工具标记, 系统不会执行任何操作, 任务将失败。
2. 批量删除类任务分两步: 先 [[TOOL:筛选 <条件>]] 拿到返回中的「全部 N 个 ASIN」列表, 再用 [[TOOL:删除 ASIN1,ASIN2,...]] 删除 (ASIN 直接取自筛选结果, 逗号分隔, 不要编造)。工具结果会回传给你, 可多步调用 (最多 5 步) 直到完成目标再给最终回复。
3. 分析/筛选类动作执行后, 你可以基于返回的数据再给用户解读、建议 (如选品方向、定价、风险提醒)。
4. 无法用动作完成时, 用自然语言正常回答 (可提供亚马逊选品/跟卖/合规/运营建议等), 中文简洁。
5. 采集类动作必须带上完整的 https:// 链接, 不得编造。

完整示例 (批量删除):
用户: 把所有A+的商品删掉
助手: [[TOOL:筛选 A+的商品]] 我先筛出所有 A+ 商品
(工具返回含「全部 N 个 ASIN」列表)
助手: [[TOOL:删除 B0AAA12345,B0BBB23456,...]] 已拿到列表, 现在批量删除
助手: 已删除 N 个 A+ 商品, 商品库剩余 M 条。`;

// AI 对话: 调用后端代理 → DeepSeek/OpenAI 兼容接口; 回复含 [[TOOL:...]] 时执行系统动作
// (aiChat 定义在 renderWorkbench 内, 依赖其 agentExec 闭包; 此处仅保留系统提示词常量)
const AGENT_SYSTEM_PROMPT_FULL = AGENT_SYSTEM_PROMPT;

async function renderWorkbench() {
  const content = $('#content');
  let convs = loadConvs();
  if (!convs.length) convs = [{ id: 'c' + Date.now(), title: '新会话', createdAt: now(), messages: [], active: true }];
  let curModelId = localStorage.getItem('zying-curModel') || loadModels()[0].id;

  content.innerHTML = `
    <div class="agent-shell">
      <aside class="agent-sidebar" id="asSidebar">
        <div class="as-model">
          <div id="asAiStatus" class="as-ai-status" title="AI 对话模式状态">加载中…</div>
          <div class="as-mode" title="切换助手工作模式">
            <button class="mode-btn" data-mode="ai">AI 智能</button>
            <button class="mode-btn" data-mode="local">本地规则</button>
          </div>
          <div class="as-btn-row">
            <button id="asModelManage">AI 设置</button>
            <button id="asModelRefresh">检测系统</button>
          </div>
        </div>
        <button class="as-new" id="asNewConv" title="新会话">新会话</button>
        <div class="as-conv-list" id="asConvList"></div>
        <button class="as-collapse" id="asCollapse">« 折叠侧栏</button>
      </aside>
      <main class="agent-main">
        <div class="am-tabs">
          <button class="active" data-tab="chat">对话</button>
          <button data-tab="trace">轨迹</button>
        </div>
        <div class="am-chat" id="amChat"></div>
        <div class="am-trace" id="amTrace"></div>
        <div class="am-input">
          <textarea id="amInput" placeholder="输入指令: 查看统计 / 找商品 xxx / 采集 https://... / 合规检测 ASIN / 调价 / 帮助… (Enter 发送, Shift+Enter 换行)"></textarea>
          <button id="amSend">发送</button>
        </div>
      </main>
    </div>
  `;

  // ===== 会话工具 =====
  const curConv = () => convs.find((c) => c.active) || convs[0];
  const saveAll = () => saveConvs(convs);
  const renderConvList = () => {
    const box = $('#asConvList');
    box.innerHTML = convs.slice().reverse().map((c) => `
      <div class="as-conv ${c.active ? 'active' : ''}" data-cid="${c.id}">
        <span class="cv-title">${escAgent(c.title)}</span>
        <span class="cv-time">${(c.createdAt || '').slice(5, 16)}</span>
        <button class="cv-del" data-cid="${c.id}" title="删除会话">✕</button>
      </div>`).join('') || '<div style="padding:12px;color:var(--muted);font-size:12px">暂无会话</div>';
    box.querySelectorAll('.as-conv[data-cid]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('.cv-del')) return;
      convs.forEach((c) => (c.active = c.id === el.dataset.cid));
      saveAll(); renderChat(); renderConvList();
    }));
    box.querySelectorAll('.cv-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      convs = convs.filter((c) => c.id !== b.dataset.cid);
      if (!convs.length) convs = [{ id: 'c' + Date.now(), title: '新会话', createdAt: now(), messages: [], active: true }];
      saveAll(); renderChat(); renderConvList();
    }));
  };
  // 显示后端 AI 配置状态 (任何浏览器生效) + 当前工作模式
  const renderAiStatus = async () => {
    const el = $('#asAiStatus');
    if (!el) return;
    const mode = localStorage.getItem('zying-ai-mode') || 'ai';
    $$('.as-mode .mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    try {
      const cfg = await API('/api/ai/config');
      el.innerHTML = mode === 'ai'
        ? (cfg && cfg.configured
          ? `<span class="ai-dot on"></span> AI 智能 · ${escAgent(cfg.name || 'AI')} ${escAgent(cfg.model || '')}`
          : `<span class="ai-dot"></span> AI 模式未配置 Key`)
        : `<span class="ai-dot"></span> 本地规则模式`;
      el.classList.toggle('off', mode !== 'ai' || !(cfg && cfg.configured));
    } catch (e) {
      el.textContent = '状态读取失败';
    }
  };
  // 模式切换
  $$('.as-mode .mode-btn').forEach((b) => b.addEventListener('click', () => {
    localStorage.setItem('zying-ai-mode', b.dataset.mode);
    renderAiStatus();
  }));

  // ===== 消息渲染 (轻量 markdown: 表格/粗体) =====
  const renderBubble = (content) => {
    // 表格
    let h = escAgent(content);
    h = h.replace(/```([\s\S]*?)```/g, (m, code) => `<pre style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;overflow-x:auto">${code}</pre>`);
    // | a | b | 表格
    h = h.replace(/((?:\|.*\|(?:\r?\n|$))+)/g, (m) => {
      const rows = m.trim().split(/\r?\n/).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const head = rows[0] || [];
      const body = rows.slice(1).filter((r) => r.some((c) => c && !/^[-:]+$/.test(c)));
      return '<table><thead><tr>' + head.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    });
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return h;
  };
  const renderChat = () => {
    const box = $('#amChat');
    if (!box) return;
    const c = curConv();
    const inputBar = document.querySelector('#amInput') ? document.querySelector('#amInput').closest('.am-input') : null;
    if (!c.messages.length) {
      if (inputBar) inputBar.style.display = 'none';
      box.innerHTML = `<div class="am-new">
        <div class="am-new-title">今天想让我帮你做什么？</div>
        <div class="am-new-input"><textarea id="amNewInput" placeholder="查看统计 · 找商品 · 采集列表页 · 合规检测 · 调价 · 认领…"></textarea></div>
        <div class="am-new-hint">Enter 发送 · Shift+Enter 换行</div>
      </div>`;
      const ni = document.querySelector('#amNewInput');
      if (ni) {
        ni.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        setTimeout(() => ni.focus(), 60);
      }
      return;
    }
    if (inputBar) inputBar.style.display = 'flex';
    box.innerHTML = c.messages.map((m) => `
      <div class="msg ${m.role}">
        <div class="msg-avatar">${m.role === 'user' ? '我' : 'AI'}</div>
        <div class="msg-body">
          <div class="msg-bubble">${m.role === 'user' ? escAgent(m.content) : renderBubble(m.content)}</div>
          ${m.tools && m.tools.length ? `<div class="msg-tools">${m.tools.map((t) => `<span class="tool-chip">${t.ok ? '<span class="tc-ok">✓</span>' : '<span class="tc-err">✗</span>'} ${escAgent(t.name)} ${t.ms ? `(${t.ms}ms)` : ''}</span>`).join('')}</div>` : ''}
          <div class="msg-time">${(m.ts || '').slice(5, 19)}</div>
        </div>
      </div>`).join('');
    box.scrollTop = box.scrollHeight;
  };
  const renderTrace = () => {
    const box = $('#amTrace');
    if (!box) return;
    const c = curConv();
    const traces = [];
    c.messages.forEach((m) => (m.tools || []).forEach((t) => traces.push({ ...t, ts: m.ts })));
    if (!traces.length) { box.innerHTML = '<div class="trace-empty">暂无工具调用记录。发送对话后, 每次调取数据/执行任务都会记录在这里 (接口/参数/结果/耗时)。</div>'; return; }
    box.innerHTML = traces.slice().reverse().map((t) => `
      <div class="trace-item">
        <div class="tr-head"><span class="tr-name">${escAgent(t.name)}</span><span class="tr-status ${t.ok ? 'ok' : 'err'}">${t.ok ? '成功' : '失败'}</span><span style="flex:1"></span><span class="tr-time">${(t.ts || '').slice(5, 19)} · ${t.ms}ms</span></div>
        <div class="tr-args">参数: ${escAgent(t.args)}</div>
        <div class="tr-summary">${escAgent(t.summary).slice(0, 500)}</div>
      </div>`).join('');
  };
  const switchTab = (tab) => {
    $$('.am-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#amChat').style.display = tab === 'chat' ? 'flex' : 'none';
    $('#amTrace').style.display = tab === 'trace' ? 'block' : 'none';
    if (tab === 'trace') renderTrace();
  };

  // ===== 本地 Agent: 意图解析 → 调系统接口 → 记录轨迹 =====
  const agentExec = async (text) => {
    const t = text.trim();
    const tools = [];
    const call = async (name, args, fn) => {
      const st = Date.now();
      try {
        const data = await fn();
        tools.push({ name, args: JSON.stringify(args), summary: JSON.stringify(data).slice(0, 600), ms: Date.now() - st, ok: true });
        return data;
      } catch (e) {
        tools.push({ name, args: JSON.stringify(args), summary: '失败: ' + (e && e.message || e), ms: Date.now() - st, ok: false });
        throw e;
      }
    };

    try {
      // ① 系统状态 / 统计概览
      if (/状态|健康|统计|概览|库存数|多少.*商品/.test(t)) {
        const [h, p] = await Promise.all([
          call('health', {}, () => API('/api/health')),
          call('products', {}, () => API('/api/products')),
        ]);
        return { content: `**系统状态**: ${h.ok ? '🟢 在线' : '🔴 离线'}\n**商品库**: ${p.total} 条\n\n可继续操作: 找商品 / 采集列表页 / 合规检测 / 调价 (输入"帮助"看全部能力)`, tools };
      }
      // ② 找 / 搜索商品 (排除 "查看" 等词, 避免误判; "所有/全部"归筛选)
      if ((/找|搜索|查找|查询|列出|查一查|有没有.*商品|商品.*有哪些/.test(t)) && !/所有|全部/.test(t)) {
        const qm = t.match(/(?:找|搜索|查|查一查|列出|查询)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9\- ]{1,40})/);
        const q = qm ? qm[1].trim() : '';
        const data = await call('products', { q }, () => API('/api/products' + (q ? '?q=' + encodeURIComponent(q) : '')));
        const items = (data.items || []).slice(0, 8);
        if (!items.length) return { content: q ? '未找到标题含「' + q + '」的商品。' : '商品库为空, 先采集一些商品吧 (告诉我列表页 URL 即可采集)。', tools };
        const rows = items.map((x) => `| ${x.asin} | ${(x.title || '').slice(0, 34)} | ${x.fulfill || '-'} | ${x.price != null ? x.price + ' ' + (x.currency || '') : '-'} |`).join('\n');
        return { content: `找到 **${data.total}** 条${q ? ` (含「${q}」)` : ''}, 前 ${items.length} 条:\n\n| ASIN | 标题 | 配送 | 价格 |\n|---|---|---|---|\n${rows}\n\n输入 ASIN 可查看详情 / 合规检测 / 认领。`, tools };
      }
      // ②.5 筛选商品 (组合条件: FBA/FBM/AMZ 配送、A+、价格、评分、月销、跟卖数、站点、关键词、无排名)
      if ((/筛选|过滤|所有.*商品|全部.*商品/.test(t) || /找.*(FBA|FBM)|配送.*(FBA|FBM)|A\+/.test(t)) && !/采集/.test(t)) {
        const qs = [];
        // 无排名
        if (/无排名|没排名|没有排名|无榜单/.test(t)) qs.push('noRank=1');
        // A+ 商品
        if (/A\+/.test(t)) {
          if (/排除.*A\+|无A\+|没有A\+/.test(t)) qs.push('aplus=0');
          else qs.push('aplus=1');
        }
        // 配送
        if (/FBA/.test(t) && !/FBM/.test(t)) qs.push('fba=FBA');
        else if (/FBM/.test(t)) qs.push('fba=FBM');
        // 价格区间 如 "10-50"
        const pm = t.match(/(\d+(?:\.\d+)?)\s*[-到至]\s*(\d+(?:\.\d+)?)/);
        if (pm) qs.push('priceRange=' + encodeURIComponent(pm[1] + '-' + pm[2]));
        // 评分 "4以上/4+" / "评分4"
        const rm = t.match(/评分\s*[≥>]?\s*(\d(?:\.\d)?)/);
        if (rm) qs.push('ratingMin=' + rm[1]);
        // 月销 "月销>500" / "销量500以上"
        const sm = t.match(/(?:月销|销量)\s*[>≥]\s*(\d+)/);
        if (sm) qs.push('salesMin=' + sm[1]);
        // 跟卖数 "跟卖5个以上"
        const fm = t.match(/跟卖\s*(\d+)\s*(?:个)?\s*以上/);
        if (fm) qs.push('followMin=' + fm[1]);
        // 站点
        const st = t.match(/站点[:：]?\s*([a-z]{2})/i);
        if (st) qs.push('site=' + st[1]);
        // 关键词 (剔除条件词后的剩余中文/英文词)
        const qm = t.match(/(?:筛选|过滤|找)\s*(.+)/);
        let kw = '';
        if (qm) {
          const raw = qm[1]
            .replace(/FBA|FBM|AMZ|自营/g, '')
            .replace(/A\+|a\+|A\+页面|A\+商品/g, '')
            .replace(/无排名|没排名|没有排名|无榜单|没有榜单/g, '')
            .replace(/\d+(?:\.\d+)?\s*[-到至]\s*\d+(?:\.\d+)?/g, '')
            .replace(/评分\s*[≥>]?\s*\d(?:\.\d)?/g, '')
            .replace(/(?:月销|销量)\s*[>≥]\s*\d+/g, '')
            .replace(/跟卖\s*\d+\s*(?:个)?\s*以上/g, '')
            .replace(/站点[:：]?\s*[a-z]{2}/gi, '')
            .replace(/以上|以内|的|商品|条件/g, '').trim();
          if (raw) kw = raw;
        }
        if (kw) qs.push('q=' + encodeURIComponent(kw));
        const data = await call('products', qs.join('&'), () => API('/api/products?' + qs.join('&')));
        const items = (data.items || []).slice(0, 10);
        if (!items.length) return { content: '没有符合条件的商品 (试试放宽条件)。', tools };
        const rows = items.map((x) => `| ${x.asin} | ${(x.title || '').slice(0, 32)} | ${x.fulfill || '-'} | ${x.price != null ? x.price + ' ' + (x.currency || '') : '-'} | 月销${x.monthlySales || 0} | 跟卖${x.followCount || 0} |`).join('\n');
        const allAsins = (data.items || []).map((x) => x.asin);
        const asinList = allAsins.length ? `\n\n**全部 ${allAsins.length} 个 ASIN**: ${allAsins.join(',')}` : '';
        return { content: `筛选出 **${data.total}** 个商品 (条件: ${qs.join(' ') || '全部'}), 前 ${items.length} 个:\n\n| ASIN | 标题 | 配送 | 价格 | 月销 | 跟卖 |\n|---|---|---|---|---|---|\n${rows}${asinList}`, tools };
      }
      // ②.6 商品详情
      if (/详情|查看.*(商品|详情)|这个商品|它.*(情况|数据)/.test(t)) {
        const am = t.match(/B0[A-Z0-9]{8}/);
        if (!am) return { content: '请提供 ASIN, 例如: 详情 B0XXXXXXX', tools };
        const d = await call('detail', { asin: am[0] }, () => API('/api/products/detail?asin=' + am[0]));
        if (d.error) return { content: '⚠ ' + d.error, tools };
        return { content: `**${d.title}**\nASIN: ${d.asin} | 站点: ${d.site} | 品牌: ${d.brand}${d.brandStatus ? ' (' + d.brandStatus + ')' : ''}\n价格: ${fmtMoney(d.minPrice != null ? d.minPrice : d.price, d.currency)} | 月销: ${d.monthlySales} | 评分: ${d.rating || '-'} (${d.reviews} 评论)\n跟卖: ${d.followCount} 个${d.offerPrices && d.offerPrices.length ? ` | 跟卖报价: ${d.offerPrices.length} 条` : ''} | 商标: ${d.trademarkCount} 条${d.tmCountries && d.tmCountries.length ? ` (${d.tmCountries.join(',')})` : ''}\n上架: ${d.listedAt || '-'} | 净收益(估): ${fmtMoney(d.netProfit, d.currency)}`, tools };
      }
      // ②.7 数据分析 / 排行
      if (/分析|排行|top|最多|最热|分布|占比|前十|情况如何/.test(t)) {
        const a = await call('analyze', {}, () => API('/api/products/analyze'));
        if (!a || !a.total) return { content: '商品库为空, 先采集一些商品 (告诉我列表页 URL)。', tools };
        const siteS = (a.bySite || []).map(([k, v]) => `${k}${v}`).join(' ');
        const catS = (a.byCategory || []).slice(0, 5).map(([k, v]) => `${k}${v}`).join(' ');
        const fulfillS = (a.byFulfill || []).map(([k, v]) => `${k}${v}`).join(' ');
        const priceS = Object.entries(a.priceBuckets || {}).map(([k, v]) => `${k}€:${v}`).join(' ');
        let extra = '';
        if (/销量/.test(t)) extra = '\n\n**月销 Top5**:\n' + (a.salesTop || []).slice(0, 5).map((x) => `· ${x.asin} ${(x.title || '').slice(0, 26)} — 月销${x.monthlySales} ${x.price != null ? x.price + x.currency : ''}`).join('\n');
        if (/跟卖/.test(t)) extra = '\n\n**跟卖最多 Top5**:\n' + (a.followTop || []).slice(0, 5).map((x) => `· ${x.asin} ${(x.title || '').slice(0, 26)} — 跟卖${x.followCount}个`).join('\n');
        if (/商标|风险/.test(t)) extra = '\n\n**商标风险 Top5**:\n' + (a.tmTop || []).slice(0, 5).map((x) => `· ${x.asin} ${(x.title || '').slice(0, 26)} — 商标${x.trademarkCount}条`).join('\n');
        return { content: `**商品库分析** (共 ${a.total} 个):\n· 站点: ${siteS}\n· 类目: ${catS}\n· 配送: ${fulfillS}\n· 价格带: ${priceS}\n· 平均评分 ${a.ratingAvg} | 总月销 ${a.salesTotal} | FBA ${a.fbaCount}个 | 有跟卖 ${a.withFollow}个 | 商标/已备案 ${a.registered}个${extra}`, tools };
      }
      // ②.8 风险检查
      if (/风险|危险|商标多|已备案|不安全/.test(t)) {
        const a = await call('analyze', {}, () => API('/api/products/analyze'));
        if (!a || !a.riskList || !a.riskList.length) return { content: '商品库无已备案/TM 商标风险商品。', tools };
        const rows = (a.riskList || []).map((x) => `· ${x.asin} ${(x.title || '').slice(0, 30)} — ${x.brand} ${x.brandStatus === 'registered' ? '已备案' : 'TM'} (商标${x.trademarkCount}条)`).join('\n');
        return { content: `**商标/备案风险商品** (${a.riskList.length} 个, 建议谨慎跟卖):\n${rows}`, tools };
      }
      // ②.9 跟卖分析
      if (/跟卖/.test(t) && !/采集/.test(t)) {
        const a = await call('analyze', {}, () => API('/api/products/analyze'));
        if (!a || !a.followTop || !a.followTop.length) return { content: '商品库暂无跟卖数据 (采集 aod 跟卖后可见)。', tools };
        const rows = (a.followTop || []).slice(0, 8).map((x) => `· ${x.asin} ${(x.title || '').slice(0, 30)} — 跟卖 ${x.followCount} 个, ${x.price != null ? x.price + (x.currency || '') : '-'}`).join('\n');
        return { content: `**跟卖最多的商品** (共 ${a.total} 个商品, ${a.withFollow} 个有跟卖):\n${rows}`, tools };
      }
      // ③ 采集列表页
      if (/采集|抓取|抓|直采|爬|筛选取/.test(t)) {
        const um = t.match(/https?:\/\/[^\s]+/);
        if (!um) return { content: '请提供要采集的 Amazon 列表页 URL, 例如: 采集 https://www.amazon.co.uk/s?k=Car+Accessories', tools };
        const url = um[0];
        const isFilter = /筛选/.test(t);
        const data = isFilter
          ? await call('list-filtered', { url }, () => API('/api/collect/list-filtered', { method: 'POST', body: JSON.stringify({ url, maxPages: 1 }) }))
          : await call('list-direct', { url }, () => API('/api/collect/list-direct', { method: 'POST', body: JSON.stringify({ url, maxPages: 1 }) }));
        return { content: `**采集完成** (${isFilter ? '筛选采集' : '列表直采'})\n- 列表页: ${data.total || data.productCount || 0} 个商品\n- 前置筛掉: ${data.skippedByList || 0} / 跳详情: ${data.enriched || '-'}\n- 新增入库: **${data.added || 0}** 个\n\n去「商品管理」查看, 或继续: 找商品 / 合规检测。`, tools };
      }
      // ④ 合规检测
      if (/合规|检测|风险/.test(t)) {
        const am = t.match(/B0[A-Z0-9]{8}/);
        if (!am) return { content: '请提供要检测的 ASIN, 例如: 合规检测 B0XXXXXXX', tools };
        const data = await call('compliance', { asin: am[0] }, () => API('/api/compliance/check', { method: 'POST', body: JSON.stringify({ asin: am[0] }) }));
        const lv = data.level === 'high' ? '🔴 高风险' : data.level === 'medium' ? '🟡 中风险' : '🟢 低风险';
        return { content: `**合规检测 ${data.asin}**: ${lv} (评分 ${data.score})\n\n${(data.reasons || []).map((r) => '· ' + r).join('\n')}`, tools };
      }
      // ⑤ 调价
      if (/调价|价格.*更新|抢购物车/.test(t)) {
        const data = await call('reprice', {}, () => API('/api/reprice/run', { method: 'POST' }));
        const wins = (data.runs || []).filter((x) => x.win).length;
        return { content: `**调价完成**: ${data.runs.length} 条, 预计抢到购物车 ${wins} 条 (胜率 ${Math.round(data.stats.winRate * 100)}%)\n建议: ${data.stats.suggestion.suggestion}`, tools };
      }
      // ⑥ 认领
      if (/认领|草稿/.test(t)) {
        const am = t.match(/B0[A-Z0-9]{8}/);
        if (!am) return { content: '请提供要认领的 ASIN, 例如: 认领 B0XXXXXXX', tools };
        const data = await call('claim', { asin: am[0] }, () => API('/api/claims', { method: 'POST', body: JSON.stringify({ asin: am[0] }) }));
        return { content: data.error ? `⚠ ${data.error}` : `**已认领** ${am[0]} 到草稿箱 (SKU: ${data.sku}, 建议价 ${data.price})`, tools };
      }
      // ⑥.5 删除商品 (单个/多个逗号分隔) 与 清空商品库
      if (/删除|删掉|移除|清空/.test(t)) {
        if (/清空全部|清空商品库/.test(t)) {
          const r = await call('clear', {}, () => API('/api/products/clear', { method: 'POST' }));
          return { content: `🧹 已清空 ${r.cleared || 0} 个商品 (如误操作, 可在「商品管理 → 重置」恢复种子数据)`, tools };
        }
        const asins = t.match(/B0[A-Z0-9]{8}/g);
        if (!asins || !asins.length) return { content: '请提供要删除的 ASIN, 例如: 删除 B0XXXXXXX 或 删除 B0AAA1,B0BBB2', tools };
        const uniq = [...new Set(asins)];
        const r = await call('delete', { asins: uniq }, () => API('/api/products/delete', { method: 'POST', body: JSON.stringify({ asins: uniq }) }));
        return { content: `🗑 已删除 **${r.deleted}** 个商品 (${uniq.join(', ')}), 剩余 ${r.remain} 条`, tools };
      }
      // ⑥.6 保存商品到产品库
      if (/保存/.test(t)) {
        const am = t.match(/B0[A-Z0-9]{8}/);
        if (!am) return { content: '请提供 ASIN, 例如: 保存 B0XXXXXXX', tools };
        const r = await call('save', { asin: am[0] }, () => API('/api/products/save', { method: 'POST', body: JSON.stringify({ asins: [am[0]], saved: true }) }));
        return { content: `★ 已保存 **${am[0]}** 到产品库 (可在商品管理筛选「已保存」查看)`, tools };
      }
      // ⑥.7 同步刷新商品数据 (价格/月销/跟卖数)
      if (/同步|刷新.*商品|更新.*数据/.test(t)) {
        const am = t.match(/B0[A-Z0-9]{8}/);
        if (!am) return { content: '请提供 ASIN, 例如: 同步 B0XXXXXXX', tools };
        const r = await call('sync', { asin: am[0] }, () => API('/api/products/sync', { method: 'POST', body: JSON.stringify({ asins: [am[0]] }) }));
        return { content: `🔄 已同步刷新 **${r.synced}** 个商品 (价格/月销/跟卖数已更新)`, tools };
      }
      // ⑦ 帮助
      if (/帮助|help|能做什么|指令|操作/.test(t)) {
        return { content: `**我能帮你做什么**\n\n· **查看统计** — 系统状态 / 商品库数量\n· **找商品** — 如: 找 手机支架\n· **筛选商品** — 如: 筛选 FBA 价格10-50 评分4以上 月销>500 的汽车配件 (支持配送/价格/评分/月销/跟卖数/站点/关键词)\n· **商品详情** — 如: 详情 B0XXXXXXX\n· **数据分析** — 如: 分析商品库 / 销量前十 / 跟卖最多的商品 / 商标最多的品牌\n· **风险检查** — 如: 哪些商品有商标风险\n· **采集列表页** — 如: 采集 https://www.amazon.co.uk/s?k=...\n· **筛选采集** — 如: 筛选采集 https://...\n· **合规检测** — 如: 合规检测 B0XXXXXXX\n· **调价** — 执行一轮智能调价\n· **认领** — 如: 认领 B0XXXXXXX\n· **删除商品** — 如: 删除 B0XXXXXXX 或 删除 B0AAA,B0BBB (可先筛选再批量删)\n· **保存商品** — 如: 保存 B0XXXXXXX\n· **同步刷新** — 如: 同步 B0XXXXXXX (更新价格/月销/跟卖数)\n· **清空商品库** — 如: 清空商品库 (⚠ 慎用)\n\nAI 智能模式下可自然语言提问, 自动调用以上能力并解读结果。`, tools };
      }
      return { content: `这个指令我暂时不会执行。你可以:\n\n· **查看统计** · **找商品 xxx** · **筛选/分析** · **采集 [列表页URL]** · **合规检测 [ASIN]** · **调价** · **认领/删除/保存/同步 [ASIN]**\n\n输入"帮助"查看全部能力。`, tools };
    } catch (e) {
      return { content: '⚠ 执行失败: ' + (e && e.message || e) + '\n\n轨迹面板可查看详细调用记录。', tools };
    }
  };

  // ===== AI 对话 (后端已配置模型时走真实 LLM; 回复含 [[TOOL:...]] 则执行系统动作) =====
  // AI 多轮工具调用: LLM 可连续输出 [[TOOL:...]] (先筛选拿列表 → 再删除等), 每轮把工具结果回传, 直到 LLM 给出最终回复
  const aiChat = async (text, history) => {
    const sys = { role: 'system', content: AGENT_SYSTEM_PROMPT };
    const hist = (history || []).filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8).map((m) => ({ role: m.role, content: m.content }));
    let messages = [sys, ...hist, { role: 'user', content: text }];
    let toolsAll = [];
    let lastNote = '';
    for (let round = 0; round < 5; round++) {
      const res = await API('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages }) });
      const reply = (res && res.content) || '';
      const tm = reply.match(/\[\[TOOL:([^\]]+)\]\]/);
      if (!tm) {
        // 最终回复: 把前面工具执行的说明 + LLM 回复合并
        const final = lastNote ? lastNote + '\n\n' + reply : reply;
        return { content: final, tools: toolsAll };
      }
      const cmd = tm[1].trim();
      let r;
      try {
        r = await agentExec(cmd);
      } catch (e) {
        r = { content: '⚠ 工具执行失败: ' + (e && e.message || e), tools: [] };
      }
      toolsAll = toolsAll.concat(r.tools || []);
      lastNote = reply.replace(/\[\[TOOL:[^\]]+\]\]\s*/, '').trim();
      // 回传工具结果, 让 LLM 决定继续操作或给出最终回复
      messages.push({ role: 'assistant', content: reply });
      messages.push({ role: 'user', content: '【工具执行结果】\n' + r.content + '\n\n请根据结果继续: 如果需要进一步操作 (如删除列表中的商品), 用 [[TOOL:...]]; 否则直接给用户最终回复 (中文, 简洁)。' });
    }
    return { content: '已达到最大工具调用轮数, 请刷新会话重试。', tools: toolsAll };
  };

  // ===== 发送消息 =====
  const send = async () => {
    const input = $('#amInput');
    const newInput = $('#amNewInput');
    // 空态用居中大输入框, 正常用底部输入框
    const text = ((newInput && newInput.value) || (input && input.value) || '').trim();
    if (!text) return;
    if (input) input.value = '';
    if (newInput) newInput.value = '';
    const c = curConv();
    if (!c.messages.length) c.title = text.slice(0, 18) + (text.length > 18 ? '…' : '');
    c.messages.push({ role: 'user', content: text, ts: now(), tools: [] });
    saveAll(); renderChat(); renderConvList();
    // 助手思考占位
    const thinkIdx = c.messages.push({ role: 'assistant', content: '思考中…', ts: now(), tools: [] }) - 1;
    renderChat();
    const mode = localStorage.getItem('zying-ai-mode') || 'ai';
    let r;
    try {
      if (mode === 'ai') {
        const cfg = await API('/api/ai/config');
        if (cfg && cfg.configured) {
          r = await aiChat(text, c.messages.slice(0, -1));
        } else {
          const local = await agentExec(text);
          r = { content: '**AI 智能模式未配置 API Key** (在「AI 设置」填写后启用)。已用本地规则执行:\n\n' + local.content, tools: local.tools || [] };
        }
      } else {
        const local = await agentExec(text);
        r = { content: '**【本地规则模式】**\n\n' + local.content, tools: local.tools || [] };
      }
    } catch (e) {
      const local = await agentExec(text);
      r = { content: '⚠ AI 调用失败: ' + (e && e.message || e) + '\n\n已回退本地规则助手执行。\n\n--- 本地结果 ---\n' + local.content, tools: local.tools || [] };
    }
    c.messages[thinkIdx] = { role: 'assistant', content: r.content, ts: now(), tools: r.tools || [] };
    saveAll(); renderChat(); renderTrace();
    const ib = $('#amInput');
    if (ib) setTimeout(() => ib.focus(), 60);
  };

  // ===== AI 设置弹窗 (后端存储, 全局生效) =====
  const openAiModal = async () => {
    const cfg = await API('/api/ai/config').catch(() => ({}));
    const mask = document.createElement('div');
    mask.className = 'agent-modal-mask';
    mask.innerHTML = `
      <div class="agent-modal">
        <h3>AI 设置</h3>
        <div class="muted" style="font-size:12px;margin-bottom:10px;line-height:1.6">配置保存在系统后端 (data/ai-config.json), <b>任何浏览器访问都生效</b>。API Key 仅显示后 4 位, 不回传前端, 不会泄露。</div>
        <div class="am-row"><label>名称</label><input id="aiName" placeholder="如: DeepSeek" value="${escAgent(cfg.name || 'DeepSeek')}"></div>
        <div class="am-row"><label>请求 URL (Base URL)</label><input id="aiBase" placeholder="如: https://api.deepseek.com" value="${escAgent(cfg.baseURL || 'https://api.deepseek.com')}"></div>
        <div class="am-row"><label>模型名</label><input id="aiModel" placeholder="如: deepseek-chat" value="${escAgent(cfg.model || '')}"></div>
        <div class="am-row"><label>API Key <span class="muted" id="aiKeyHint">${cfg.configured ? `已配置 (${escAgent(cfg.apiKeyMasked || '')})` : '未配置'}</span></label><input id="aiKey" type="password" placeholder="sk-... (留空保持当前 Key)"></div>
        <div class="am-actions">
          <button class="btn-primary" id="aiSave">保存</button>
          <button class="btn-plain" id="aiTest">测试连接</button>
          <button class="btn-plain" id="aiClear">清除 Key</button>
          <button class="btn-plain" id="aiClose">关闭</button>
        </div>
        <div class="muted" id="aiMsg" style="font-size:12px;margin-top:8px"></div>
      </div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    mask.querySelector('#aiClose').onclick = () => mask.remove();
    mask.querySelector('#aiSave').onclick = async () => {
      const body = {
        name: mask.querySelector('#aiName').value.trim(),
        baseURL: mask.querySelector('#aiBase').value.trim(),
        model: mask.querySelector('#aiModel').value.trim(),
      };
      const k = mask.querySelector('#aiKey').value.trim();
      if (k) body.apiKey = k;
      if (!body.name || !body.baseURL || !body.model) { mask.querySelector('#aiMsg').textContent = '⚠ 请填写名称 / 请求 URL / 模型名'; return; }
      try {
        const r = await API('/api/ai/config', { method: 'POST', body: JSON.stringify(body) });
        mask.querySelector('#aiMsg').textContent = r.ok ? '✔ 已保存, 全局生效' : ('✗ ' + (r.error || '保存失败'));
        mask.querySelector('#aiKeyHint').textContent = r.configured ? `已配置 (${r.apiKeyMasked})` : '未配置';
        mask.querySelector('#aiKey').value = '';
        renderAiStatus();
      } catch (e) { mask.querySelector('#aiMsg').textContent = '✗ ' + (e && e.message || e); }
    };
    mask.querySelector('#aiTest').onclick = async () => {
      const msg = mask.querySelector('#aiMsg');
      msg.textContent = '测试中…';
      try {
        const r = await API('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }) });
        msg.textContent = r && r.content ? '✔ 连接成功: ' + String(r.content).slice(0, 60) : ('✗ ' + ((r && r.error) || '无响应'));
      } catch (e) { msg.textContent = '✗ ' + (e && e.message || e); }
    };
    mask.querySelector('#aiClear').onclick = async () => {
      try {
        const r = await API('/api/ai/config', { method: 'POST', body: JSON.stringify({ clearKey: true }) });
        mask.querySelector('#aiMsg').textContent = '✔ 已清除 API Key';
        mask.querySelector('#aiKeyHint').textContent = '未配置';
        renderAiStatus();
      } catch (e) { mask.querySelector('#aiMsg').textContent = '✗ ' + (e && e.message || e); }
    };
  };

  // ===== 事件绑定 =====
  $('#asModelManage').addEventListener('click', () => openAiModal());
  $('#asModelRefresh').addEventListener('click', async () => {
    try { const h = await API('/api/health'); alert('系统在线'); } catch (e) { alert('系统离线: ' + (e && e.message || e)); }
  });
  $('#asNewConv').addEventListener('click', () => {
    convs.forEach((c) => (c.active = false));
    convs.push({ id: 'c' + Date.now(), title: '新会话', createdAt: now(), messages: [], active: true });
    saveAll(); renderChat(); renderConvList(); switchTab('chat');
  });
  $('#asCollapse').addEventListener('click', () => $('#asSidebar').classList.toggle('collapsed'));
  $('#amSend').addEventListener('click', send);
  $('#amInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $$('.am-tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // ===== 初始渲染 =====
  renderAiStatus();
  renderConvList();
  renderChat();
  switchTab('chat');
  $('#amInput').focus();
}

/* ===== 全局: 站点选项 + 采集过滤辅助 (采集页/商品管理页共享) ===== */
const SITE_OPTIONS = [
  { value: 'de', label: '🇩🇪 德国' }, { value: 'uk', label: '🇬🇧 英国' }, { value: 'us', label: '🇺🇸 美国' },
  { value: 'fr', label: '🇫🇷 法国' }, { value: 'it', label: '🇮🇹 意大利' }, { value: 'es', label: '🇪🇸 西班牙' },
  { value: 'jp', label: '🇯🇵 日本' }, { value: 'ca', label: '🇨🇦 加拿大' }, { value: 'in', label: '🇮🇳 印度' },
];
// 级联站点选择: 按区域分组的全量 Amazon 站点 (采集页站点级联选择器用)
const SITE_GROUPS = [
  { region: '欧洲', sites: [
    { value: 'de', label: '🇩🇪 德国' }, { value: 'uk', label: '🇬🇧 英国' }, { value: 'fr', label: '🇫🇷 法国' },
    { value: 'it', label: '🇮🇹 意大利' }, { value: 'es', label: '🇪🇸 西班牙' }, { value: 'nl', label: '🇳🇱 荷兰' },
    { value: 'se', label: '🇸🇪 瑞典' }, { value: 'pl', label: '🇵🇱 波兰' },
  ]},
  { region: '美洲', sites: [
    { value: 'us', label: '🇺🇸 美国' }, { value: 'ca', label: '🇨🇦 加拿大' }, { value: 'mx', label: '🇲🇽 墨西哥' }, { value: 'br', label: '🇧🇷 巴西' },
  ]},
  { region: '亚太', sites: [
    { value: 'jp', label: '🇯🇵 日本' }, { value: 'au', label: '🇦🇺 澳大利亚' }, { value: 'in', label: '🇮🇳 印度' }, { value: 'sg', label: '🇸🇬 新加坡' },
  ]},
  { region: '中东', sites: [
    { value: 'ae', label: '🇦🇪 阿联酋' }, { value: 'sa', label: '🇸🇦 沙特' },
  ]},
];
// 中文二级类目树: value 为英文匹配词 (匹配商品详情页面包屑), label 为中文显示
const CATEGORY_TREE = [
  { value: 'Electronics', label: '电子', children: [
    { value: 'Cell Phones & Accessories', label: '手机及配件' }, { value: 'Computers & Accessories', label: '电脑及配件' },
    { value: 'TV', label: '电视影音' }, { value: 'Camera & Photo', label: '相机摄影' },
    { value: 'Headphones', label: '耳机音响' }, { value: 'Wearable Technology', label: '智能穿戴' },
    { value: 'Video Games', label: '游戏主机' },
  ] },
  { value: 'Automotive', label: '汽车', children: [
    { value: 'Automotive Parts', label: '汽车配件' }, { value: 'Car Electronics', label: '车载电子' },
    { value: 'Car Care', label: '汽车护理' }, { value: 'Tires & Wheels', label: '轮胎轮毂' },
    { value: 'Motorcycle', label: '摩托车配件' },
  ] },
  { value: 'Home & Kitchen', label: '家居厨房', children: [
    { value: 'Kitchen', label: '厨房用品' }, { value: 'Storage & Organization', label: '收纳整理' },
    { value: 'Furniture', label: '家具' }, { value: 'Cleaning', label: '清洁用品' },
    { value: 'Bedding', label: '床上用品' }, { value: 'Home Décor', label: '家居装饰' },
  ] },
  { value: 'Toys & Games', label: '玩具游戏', children: [
    { value: 'Toys', label: '儿童玩具' }, { value: 'Board Games', label: '桌游卡牌' },
    { value: 'Action Figures', label: '模型手办' }, { value: 'Outdoor Toys', label: '户外玩具' },
    { value: 'Puzzles', label: '拼图积木' },
  ] },
  { value: 'Sports & Outdoors', label: '运动户外', children: [
    { value: 'Fitness', label: '健身器材' }, { value: 'Camping & Hiking', label: '露营野餐' },
    { value: 'Cycling', label: '骑行装备' }, { value: 'Water Sports', label: '水上运动' },
    { value: 'Sports & Outdoors', label: '户外运动' },
  ] },
  { value: 'Garden', label: '花园', children: [
    { value: 'Garden Tools', label: '园艺工具' }, { value: 'Lawn Care', label: '草坪护理' },
    { value: 'Patio', label: '户外装饰' }, { value: 'Plants', label: '植物盆栽' },
  ] },
  { value: 'Beauty', label: '美妆个护', children: [
    { value: 'Skin Care', label: '护肤' }, { value: 'Makeup', label: '彩妆' },
    { value: 'Hair Care', label: '美发' }, { value: 'Fragrance', label: '香水' },
    { value: 'Personal Care', label: '个人护理' },
  ] },
  { value: 'Clothing', label: '服装鞋靴', children: [
    { value: 'Men', label: '男装' }, { value: 'Women', label: '女装' },
    { value: 'Kids', label: '童装' }, { value: 'Shoes', label: '鞋靴' },
    { value: 'Accessories', label: '服饰配件' },
  ] },
  { value: 'Tools', label: '工具五金', children: [
    { value: 'Hand Tools', label: '手动工具' }, { value: 'Power Tools', label: '电动工具' },
    { value: 'Hardware', label: '五金配件' }, { value: 'Safety', label: '安全防护' },
  ] },
  { value: 'Office Products', label: '办公用品', children: [
    { value: 'Office Supplies', label: '办公文具' }, { value: 'Ink & Toner', label: '打印耗材' },
    { value: 'Office Furniture', label: '办公家具' },
  ] },
  { value: 'Pet Supplies', label: '宠物用品', children: [
    { value: 'Dog Supplies', label: '狗狗用品' }, { value: 'Cat Supplies', label: '猫咪用品' },
    { value: 'Pet Food', label: '宠物食品' },
  ] },
];
// 类目联动: 一级 → 二级 select 重填 (cfCat1/cfCat2 用于采集页; fCat1/fCat2 用于商品管理页)
function bindCategoryTree(cat1Id, cat2Id, onUpdate) {
  const c1 = $('#' + cat1Id), c2 = $('#' + cat2Id);
  if (!c1 || !c2) return;
  const fillCat2 = () => {
    const node = CATEGORY_TREE.find((c) => c.value === c1.value);
    c2.innerHTML = '<option value="">全部二级</option>' + (node ? node.children.map((s) => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('') : '');
    if (onUpdate) onUpdate();
  };
  c1.innerHTML = '<option value="">全部一级</option>' + CATEGORY_TREE.map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
  c1.addEventListener('change', fillCat2);
  fillCat2();
}
// 按英文匹配词反查中文二级类目 (规则加载回填用)
function categoryLabelOf(v) {
  if (!v) return '';
  for (const c of CATEGORY_TREE) {
    if (c.value === v) return c.label;
    for (const s of c.children) if (s.value === v) return `${c.label} / ${s.label}`;
  }
  return v;
}

// 表单值 → 接口过滤参数
// 解析区间输入 "min-max" / "min-" / "-max" / 空 → {min,max} (供 coDesc/cfValues 使用)
const parseRange = (v) => {
  const s = String(v || '').trim().replace(/[，。\s]/g, '');
  if (!s) return { min: null, max: null };
  const m = s.match(/^(-?\d*\.?\d*)-(-?\d*\.?\d*)$/);
  if (m) {
    const min = m[1] === '' || m[1] === '-' ? null : parseFloat(m[1]);
    const max = m[2] === '' ? null : parseFloat(m[2]);
    return { min, max };
  }
  const n = parseFloat(s);
  return isNaN(n) ? { min: null, max: null } : { min: n, max: null };
};
const coPayload = (f) => ({
  filterSites: Array.isArray(f.filterSites) ? f.filterSites : [],
  filterFulfill: f.filterFulfill || '',
  filterShopAplus: f.filterShopAplus || '',
  filterBrandShop: f.filterBrandShop || '',
  filterBrandStore: f.filterBrandStore || '',
  filterRankRange: f.filterRankRange || '',
  filterPriceRange: f.filterPriceRange || '',
  filterRatingRange: f.filterRatingRange || '',
  filterReviewsRange: f.filterReviewsRange || '',
  filterQ: f.filterQ,
  filterBadges: Array.isArray(f.filterBadges) ? f.filterBadges : [],
  filterTmRange: f.filterTmRange || '',
  filterTmCountries: f.filterTmCountries,
  filterCategory: f.filterCategory,
  filterSalesRange: f.filterSalesRange || '',
  filterIs1688: f.filterIs1688,
  filterBrandStatus: f.filterBrandStatus,
  filterNewDaysRange: f.filterNewDaysRange || '',
});
// 过滤条件中文描述 (区间显示为 min-max, 单边显示 ≥/≤)
const fmtRange = (min, max, unit = '') => (min != null && max != null ? `${min}-${max}${unit}` : min != null ? `≥${min}${unit}` : max != null ? `≤${max}${unit}` : '');
const BADGE_LABELS = { aplus: 'A+', choice: 'AC', bestseller: 'BestSeller', bestseller1: '#1BestSeller', newrelease: 'NewRelease', deal: '限时优惠', dealday: '今日特惠', overallpick: 'OverallPick', editorspick: '编辑精选', toprated: 'TopRated', climate: '气候友好', smallbusiness: '小企业' };
const coDesc = (f) => {
  const r1 = parseRange(f.filterRankRange), r2 = parseRange(f.filterPriceRange), r3 = parseRange(f.filterRatingRange), r4 = parseRange(f.filterReviewsRange), r5 = parseRange(f.filterSalesRange), r6 = parseRange(f.filterTmRange), r7 = parseRange(f.filterNewDaysRange);
  return [
    (Array.isArray(f.filterSites) && f.filterSites.length) ? `站点:${f.filterSites.join(',')}` : '',
    f.filterFulfill ? `配送=${f.filterFulfill}` : '',
    f.filterShopAplus === '1' ? '仅A+店铺' : (f.filterShopAplus === '0' ? '排除A+店铺' : ''),
    f.filterBrandShop === '0' ? '排除品牌店铺' : (f.filterBrandShop === '1' ? '仅品牌店铺' : ''),
    (f.filterBrandStore || '').startsWith('!') ? '排除品牌店链接' : (f.filterBrandStore ? `品牌店=${f.filterBrandStore}` : ''),
    fmtRange(r1.min, r1.max) ? `BSR:${fmtRange(r1.min, r1.max)}` : '',
    fmtRange(r2.min, r2.max) ? `价:${fmtRange(r2.min, r2.max)}` : '',
    fmtRange(r3.min, r3.max) ? `评分:${fmtRange(r3.min, r3.max)}` : '',
    fmtRange(r4.min, r4.max) ? `评论:${fmtRange(r4.min, r4.max)}` : '',
    (Array.isArray(f.filterBadges) && f.filterBadges.length) ? `标识:${f.filterBadges.map((b) => BADGE_LABELS[b] || b).join(',')}` : '',
    f.filterQ ? `标题含「${f.filterQ}」` : '',
    fmtRange(r6.min, r6.max) ? `排除商标:${fmtRange(r6.min, r6.max)}` : '',
    f.filterTmCountries ? `排除商标国家:${f.filterTmCountries}` : '',
    fmtRange(r5.min, r5.max) ? `月销:${fmtRange(r5.min, r5.max)}` : '',
    f.filterIs1688 === '1' ? '有1688同款' : (f.filterIs1688 === '0' ? '排除1688同款' : ''),
    f.filterBrandStatus === 'registered' ? '排除已备案品牌' : (f.filterBrandStatus === 'tm' ? '排除TM申请中' : (f.filterBrandStatus === 'notfound' ? '仅未查到品牌' : '')),
    fmtRange(r7.min, r7.max) ? `上架:${fmtRange(r7.min, r7.max)}天` : '',
    f.filterCategory ? `类目: ${categoryLabelOf(f.filterCategory)}` : '',
  ].filter(Boolean).join(' + ') || '无过滤';
};
const coSkippedHtml = (r, f) => (r.skipped ? `<br>采集过滤 <b>${esc(coDesc(f))}</b> — 被筛除直接跳过 <b>${r.skipped}</b> 个 (不入库)` : '');
// 采集过滤面板读取 (采集页面板存在; 商品管理页返回默认值) — 站点=选中chips+自定义输入, 主站点取第一个
const cfSite = () => {
  const chips = [...document.querySelectorAll('#cfSitePanel .cfSiteCb:checked')].map((c) => c.value);
  const custom = String($('#cfCustomSites') ? $('#cfCustomSites').value : '').split(/[,，\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const all = [...chips, ...custom];
  return all.length ? all : ['de'];
};
const cfValues = () => ({
  filterSites: cfSite(),
  filterFulfill: $('#cfFulfill') ? $('#cfFulfill').value : '',
  filterShopAplus: $('#cfShopAplus') ? $('#cfShopAplus').value : '',
  filterBrandShop: $('#cfBrandShop') ? $('#cfBrandShop').value : '',
  filterBrandStore: $('#cfBrandStore') ? $('#cfBrandStore').value : '',
  filterRankRange: $('#cfRankRange') ? $('#cfRankRange').value : '',
  filterPriceRange: $('#cfPriceRange') ? $('#cfPriceRange').value : '',
  filterRatingRange: $('#cfRatingRange') ? $('#cfRatingRange').value : '',
  filterReviewsRange: $('#cfReviewsRange') ? $('#cfReviewsRange').value : '',
  filterQ: $('#cfQ') ? $('#cfQ').value : '',
  filterBadges: String($('#cfBadges') ? $('#cfBadges').value : '').split(/[,，]/).map((s) => s.trim()).filter(Boolean),
  filterTmRange: $('#cfTmRange') ? $('#cfTmRange').value : '',
  filterTmCountries: $('#cfTmCountries') ? $('#cfTmCountries').value : '',
  filterSalesRange: $('#cfSalesRange') ? $('#cfSalesRange').value : '',
  filterIs1688: $('#cfIs1688') ? $('#cfIs1688').value : '',
  filterBrandStatus: $('#cfBrandStatus') ? $('#cfBrandStatus').value : '',
  filterNewDaysRange: $('#cfNewDaysRange') ? $('#cfNewDaysRange').value : '',
  filterCategory: ($('#cfCat2') && $('#cfCat2').value) ? $('#cfCat2').value : (($('#cfCat1') && $('#cfCat1').value) || ''),
});
const refreshStats = () => { if (window.__collectRefresh) try { window.__collectRefresh(); } catch {} };

/* ===== 采集进度轮询 (运行中的采集方式卡片显示实时进度 + 停止按钮) ===== */
let cfPollTimer = null;
const cfPoll = async (mode) => {
  try {
    const pg = await API('/api/collect/progress');
    const card = document.querySelector(`.collect-mode[data-mode="${mode}"]`);
    if (card && pg && pg.running) {
      const txt = card.querySelector('.cm-prog-text');
      const secs = Math.round((Date.now() - pg.startedAt) / 1000);
      let s = `⏳ ${pg.step || '采集中'} · ${secs}s`;
      if (pg.items != null) s += ` · 采集 ${pg.items} 个`;
      if (pg.added != null) s += ` · 新增 ${pg.added}`;
      if (pg.page) s += ` · 第 ${pg.page}${pg.pages ? '/' + pg.pages : ''} 页`;
      if (pg.detailDone != null) s += ` · 详情 ${pg.detailDone}${pg.detailTotal ? '/' + pg.detailTotal : ''}`;
      if (pg.round) s += ` · 第 ${pg.round}/${pg.rounds || '?'} 轮`;
      if (pg.shopsDone != null) s += ` · 店铺 ${pg.shopsDone}/${pg.shopsTotal}`;
      txt.textContent = s;
    }
  } catch (e) {}
};
const startCfPoll = (mode) => { if (!cfPollTimer) cfPollTimer = setInterval(() => cfPoll(mode), 2000); };
const stopCfPoll = () => { if (cfPollTimer) { clearInterval(cfPollTimer); cfPollTimer = null; } };

/* ===== 商品管理 (采集到的商品数据: 列表/筛选/详情/批量操作) ===== */

// 采集流程: mode 由采集页模式卡片传入; btn 为触发按钮 (无则忽略); 过滤条件从采集页面板读取
async function openCollectFlow(mode, btn) {
  const setBusy = (txt) => {
    const isCard = !!(btn && btn.classList && btn.classList.contains('collect-mode'));
    if (btn && !isCard) { btn.disabled = !!txt; if (txt) { if (!btn.dataset.orig) btn.dataset.orig = btn.textContent; btn.textContent = txt; } else { btn.textContent = btn.dataset.orig || '🚀 采集'; } }
    const sb = $('#cfStopBtn'); if (sb) sb.classList.toggle('acting', !!txt);
    // 采集方式卡片: 运行态 + 进度轮询 (卡片是 div 结构, 不能覆盖 textContent)
    const bmode = (btn && btn.dataset && btn.dataset.mode) || mode;
    const card = bmode ? document.querySelector(`.collect-mode[data-mode="${bmode}"]`) : null;
    if (txt) { if (card) { card.classList.add('running'); const pt = card.querySelector('.cm-prog-text'); if (pt) pt.textContent = '⏳ 启动…'; } startCfPoll(bmode); }
    else { stopCfPoll(); $$('.collect-mode.running').forEach((c) => c.classList.remove('running')); }
  };


  if (mode === 'category') {
    // ① 类目搜索采集
    const f = await zyPromptForm('📚 类目搜索采集', [
      { field: 'keyword', label: '搜索关键词', placeholder: '如: car phone holder', default: '' },
      { field: 'category', label: '类目 (可选)', placeholder: '如: Automotive', default: '' },
      { field: 'maxPages', label: '翻页数 (每页约16个商品)', type: 'number', default: '2' },
    ], { hint: '关键词或类目必填其一 · 全程CDP无API · 过滤条件不满足的商品直接跳过, 不入库' });
    if (!f) return;
    setBusy(`⏳ 类目采集中(${f.maxPages}页)...`);
    try {
      const r = await API('/api/collect/category', { method: 'POST', body: JSON.stringify({ site: cfSite()[0] || 'de', keyword: f.keyword, category: f.category, maxPages: parseInt(f.maxPages, 10), ...coPayload(cfValues()) }) });
      await zyAlert('✅ 类目搜索采集完成', `搜索「${f.keyword || f.category}」抓取 <b>${r.productCount}</b> 个商品<br>新增入库 <b>${r.added}</b> 个 | 站点: ${cfSite()}<br>当前共 <b>${r.total}</b> 条${coSkippedHtml(r, cfValues())}`);
    } catch (e) {
      await zyAlert('❌ 类目采集失败', e.message || '请确认 Edge 9222 已开启');
    }
    setBusy(null);
    refreshStats();
  } else if (mode === 'batch') {
    // ③ 批量跟卖店铺采集: 对输入商品遍历全部跟卖卖家店铺 + 循环跳转 (不在库自动转 aod 实时提取, 真正去采集)
    const f = await zyPromptForm('🔁 批量跟卖店铺采集', [
      { field: 'asins', label: '商品 (ASIN 或 amazon 链接, 逗号分隔; 在商品库优先用已采跟卖链接, 不在库自动转 aod 实时提取)', placeholder: '如: B0CCD88N2Y,B0H11NJ91L', default: '' },
      { field: 'excludeSellers', label: '排除卖家 (名称/ID, 逗号分隔, 留空=全部采集)', placeholder: '如: jianjun', default: '' },
      { field: 'amazonWords', label: '排除亚马逊词汇 (卖家名/ID 含这些词自动排除, 逗号分隔, 可自定义)', placeholder: '如: amazon,亚马逊', default: 'amazon,亚马逊' },
      { field: 'rounds', label: '循环轮次 (0=无限循环, 一直采到商品队列耗尽或手动停止; 1-30=固定轮数)', type: 'number', default: '1' },
      { field: 'concurrency', label: '并行网页数 (1-6, 并行采集卖家店铺提升速度)', type: 'number', default: '4' },
      { field: 'maxItems', label: '每店铺商品数上限 (0=无限制)', type: 'number', default: '10' },
      { field: 'maxPages', label: '每店铺翻页数上限 (0=无限制, 一直翻到店铺无更多商品)', type: 'number', default: '2' },
    ], { hint: '自动流程: 商品(ASIN/链接自动转aod) → 提取全部跟卖卖家(自动排除亚马逊官方+自定义词汇) → 排除指定卖家 → 并行采集各卖家店铺 → 每轮采完自动从新采集商品跳转循环(无卖家自动兜底跳转) → 汇总入库 · 填 0 表示无限制 · 全程CDP无API' });
    if (!f) return;
    const asins = (f.asins || '').split(/[,，\s]+/).filter(Boolean);
    if (!asins.length) { await zyAlert('⚠️ 请输入商品 ASIN 或链接'); return; }
    const roundsN = f.rounds === '0' || f.rounds === '' ? 0 : (parseInt(f.rounds, 10) || 1);
    setBusy(`${roundsN === 0 ? '♾ 无限循环' : `⏳ ${roundsN}轮循环`}批量店铺采集中...`);
    try {
      const r = await API('/api/collect/follow-shop-batch', { method: 'POST', body: JSON.stringify({ asins, rounds: roundsN, concurrency: parseInt(f.concurrency, 10) || 4, maxItems: parseInt(f.maxItems, 10) || 0, maxPages: parseInt(f.maxPages, 10) || 0, excludeSellers: f.excludeSellers, amazonWords: f.amazonWords, ...coPayload(cfValues()) }) });
      const rows = (r.results || []).map((res) => {
        if (res.note) return `<div style="margin:4px 0">🔁 <b>第${res.round}轮</b> — ${esc(res.note)}</div>`;
        const srcBadge = res.sellerFrom === 'aod' ? ' <span class="badge gray">aod实时提取</span>' : ' <span class="badge blue">商品库</span>';
        const sellersHtml = (res.sellers || []).map((s) => s.error
          ? `<div style="padding:1px 0 1px 12px">✗ ${esc(s.seller || s.sellerId || '?')}: ${esc(s.error)}</div>`
          : `<div style="padding:1px 0 1px 12px">✓ ${esc(s.seller || s.sellerId)} — 店铺商品 <b>${s.productCount}</b> 个${s.skipped ? ` (跳过 ${s.skipped})` : ''}</div>`).join('');
        return `<div style="margin:4px 0"><b>第${res.round}轮 · ${esc(res.asin)}</b>${srcBadge} (${esc(res.title || '')}) — ${res.sellers ? res.sellers.length : 0} 个跟卖卖家${res.autoJump ? ` <span class="badge gold">→ 自动跳转 ${esc(res.nextAsin || '')}</span>` : ''}<br>${sellersHtml}</div>`;
      }).join('');
      const nothingCollected = !(r.shopOk || 0) && !(r.productCount || 0) && !(r.added || 0);
      const stopBadge = r.stopped ? '<div style="margin-top:4px;color:#b00020;font-weight:700">⏹ 本次采集已被您手动停止 — 已采集的数据已保存入库</div>' : '';
      await zyAlert(nothingCollected ? '⚠️ 批量跟卖店铺采集未获取到数据' : '✅ 批量跟卖店铺采集完成', `
        ${r.rounds === 0 ? '♾ 无限循环' : r.rounds + ' 轮循环'}, 成功 <b>${r.okRounds}</b> 轮, 自动跳转 <b>${r.autoJumps}</b> 次 → 跟卖卖家店铺成功 <b>${r.shopOk}</b> / 失败 <b>${r.shopFail}</b><br>
        共采集店铺商品 <b>${r.productCount}</b> 个, 新增入库 <b>${r.added || 0}</b> 个${coSkippedHtml(r, cfValues())}<br>
        ${stopBadge}
        ${nothingCollected ? '<div style="margin-top:4px;color:#c77d1a">⚠️ 本次未获取到任何数据: 所有商品均未提取到跟卖卖家或卖家店铺全部失败。<b>采集过滤条件</b>会筛除不合格商品直接跳过(不入库), 请检查下方每轮明细后再试。</div>' : ''}
        <div style="margin-top:6px;background:#f6f6f6;border-radius:6px;padding:8px;font-size:12px;max-height:240px;overflow-y:auto">${rows}</div>`);
    } catch (e) {
      await zyAlert('❌ 批量店铺采集失败', e.message || '请确认 Edge 9222 已开启、商品库有带跟卖链接的商品');
    }
    setBusy(null);
    refreshStats();
  } else if (mode === 'parallel') {
    // ④ 多商品并行跟卖店铺采集 (完整工作流): 输入商品 → 验证商品 → 提取卖家 → 排除指定 → 并行采集各店铺 → 循环跳转 → 汇总入库
    const f = await zyPromptForm('⚡ 多商品并行跟卖店铺采集', [
      { field: 'urls', label: '商品 (ASIN / 商品链接 / aod 链接, 每行一个)', placeholder: 'B0XXXXXXX\nhttps://www.amazon.de/dp/B0YYYYYYY\nhttps://www.amazon.de/dp/B0ZZZZZ/ref=olp-opf-redir?aod=1', default: '' },
      { field: 'excludeSellers', label: '排除卖家 (名称/ID, 逗号分隔, 留空=全部采集)', placeholder: '如: jianjun', default: '' },
      { field: 'amazonWords', label: '亚马逊词汇筛选 (卖家名/ID 含这些词自动排除, 逗号分隔)', placeholder: '如: amazon, 亚马逊, amazon.de', default: 'amazon,亚马逊' },
      { field: 'rounds', label: '循环轮次 (0=无限循环; 1-30=固定轮数, 采完一个商品自动从新采集商品跳转继续)', type: 'number', default: '1' },
      { field: 'concurrency', label: '并行网页数 (1-6, 建议=卖家数)', type: 'number', default: '4' },
      { field: 'maxItems', label: '每店铺商品数上限 (0=无限制)', type: 'number', default: '10' },
      { field: 'maxPages', label: '每店铺翻页数上限 (0=无限制)', type: 'number', default: '2' },
    ], { hint: '完整工作流: 商品(ASIN/链接自动转aod) → 验证商品信息 → 提取全部跟卖卖家(自动排除亚马逊官方+词汇) → 排除指定卖家 → 并行采集各卖家店铺 → 采完自动从新采集商品跳转循环(无卖家自动兜底跳转) → 汇总入库 · 填 0 表示无限制 · 全程CDP无API' });
    if (!f) return;
    const urls = (f.urls || '').split(/[\n,，]+/).map((u) => u.trim()).filter(Boolean);
    if (!urls.length) { await zyAlert('⚠️ 请输入商品 aod 链接'); return; }
    for (const u of urls) { if (!/^https:\/\/(www\.)?amazon\./.test(u)) { await zyAlert('⚠️ 无效链接', u.slice(0, 50) + ' 不是 amazon 链接'); return; } }
    const rounds = f.rounds === '0' || f.rounds === '' ? 0 : (parseInt(f.rounds, 10) || 1);
    setBusy(`${rounds === 0 ? '♾ 无限循环' : `⏳ ${rounds}轮`}多商品并行采集中...`);
    try {
      const r = await API('/api/collect/follow-shop-rounds', { method: 'POST', body: JSON.stringify({ urls, rounds, concurrency: parseInt(f.concurrency, 10) || 4, maxItems: parseInt(f.maxItems, 10) || 0, maxPages: parseInt(f.maxPages, 10) || 0, excludeSellers: f.excludeSellers, amazonWords: f.amazonWords, ...coPayload(cfValues()) }) });
      const rows = (r.roundResults || []).map((res) => {
        if (res.note) return `<div style="margin:4px 0"><b>第${res.round}轮</b> — ${esc(res.note)}</div>`;
        const fromBadge = res.sellerFrom === 'history' ? ' <span class="badge gold" title="aod 实时提取失败(如商品当前无报价), 自动复用商品库历史跟卖卖家继续采集">历史卖家兜底</span>' : '';
        const head = res.error
          ? `<b>第${res.round}轮</b> — ${esc(res.asin)} — ✗ ${esc(res.error)}${fromBadge}`
          : `<b>第${res.round}轮</b> — ${esc(res.asin)} — 提取 ${res.sellerCount || 0} 个跟卖卖家${fromBadge}`;
        const sellersHtml = (res.sellers || []).map((s) => s.error
          ? `<div style="padding:1px 0 1px 12px">✗ ${esc(s.seller || s.sellerId || '?')}: ${esc(s.error)}</div>`
          : `<div style="padding:1px 0 1px 12px">✓ ${esc(s.seller || s.sellerId)} — 店铺商品 <b>${s.productCount}</b> 个${s.skipped ? ` (跳过 ${s.skipped})` : ''}</div>`).join('');
        return `<div style="margin:4px 0">${head}<br>${sellersHtml}</div>`;
      }).join('');
      const nothingCollected = !(r.shopOk || 0) && !(r.productCount || 0) && !(r.added || 0);
      const stopBadge = r.stopped ? '<div style="margin-top:4px;color:#b00020;font-weight:700">⏹ 本次采集已被您手动停止 — 已采集的数据已保存入库</div>' : '';
      await zyAlert(nothingCollected ? '⚠️ 多商品并行跟卖采集未获取到数据' : '✅ 多商品并行跟卖采集完成', `
        <b>工作流:</b> 商品aod → 验证商品 → 提取卖家${r.excludeSellers ? ` → 排除 <b>${esc(r.excludeSellers)}</b>` : ''} → 并行采集各店铺<br><br>
        ${r.rounds === 0 ? '♾ 无限循环' : r.rounds + ' 轮'} (成功 ${r.okRounds} 轮) | ${r.concurrency} 网页并行 → 卖家店铺成功 <b>${r.shopOk}</b> / 失败 <b>${r.shopFail}</b><br>
        共采集店铺商品 <b>${r.productCount}</b> 个, 新增入库 <b>${r.added}</b> 个${coSkippedHtml(r, cfValues())}<br>
        ${stopBadge}
        ${nothingCollected ? '<div style="margin-top:4px;color:#c77d1a">⚠️ 本次未获取到任何数据: 所有商品均未提取到跟卖卖家或卖家店铺全部失败。<b>采集过滤条件</b>会筛除不合格商品直接跳过(不入库), 请检查下方每轮明细后再试。</div>' : ''}
        <div style="margin-top:6px;background:#f6f6f6;border-radius:6px;padding:8px;font-size:12px;max-height:260px;overflow-y:auto">${rows}</div>`);
    } catch (e) {
      await zyAlert('❌ 多商品并行采集失败', e.message || '请确认 Edge 9222 已开启');
    }
    setBusy(null);
    refreshStats();
  } else if (mode === 'bulk') {
    // ⑤ 并行整站采集: 关键词/类目 → 并行打开N个搜索页 → 批量聚合
    const f = await zyPromptForm('🗂️ 并行整站采集', [
      { field: 'keyword', label: '搜索关键词', placeholder: '如: car phone holder', default: '' },
      { field: 'category', label: '类目 (可选)', placeholder: '如: Automotive', default: '' },
      { field: 'pages', label: '并行打开页数 (1-10, 每页约16-48个)', type: 'number', default: '5' },
      { field: 'maxItems', label: '入库数量上限 (1-100)', type: 'number', default: '50' },
    ], { hint: '一次并行打开N个搜索页同时抓取, 不翻页, 耗时≈单页加载(约15秒) · 可选读详情价格/品牌 · 全程CDP · 过滤条件不满足的商品直接跳过' });
    if (!f) return;
    if (!f.keyword && !f.category) { await zyAlert('⚠️ 请输入关键词或类目'); return; }
    setBusy(`⏳ 整站采集中(${f.pages}页并行)...`);
    try {
      const r = await API('/api/collect/site-bulk', { method: 'POST', body: JSON.stringify({ site: cfSite()[0] || 'de', keyword: f.keyword, category: f.category, pages: parseInt(f.pages, 10), maxItems: parseInt(f.maxItems, 10), ...coPayload(cfValues()) }) });
      await zyAlert('✅ 并行整站采集完成', `
        「${esc(f.keyword || f.category)}」${r.pages} 页并行 → 抓取 <b>${r.productCount}</b> 个商品<br>
        新增入库 <b>${r.added}</b> 个 | 当前共 <b>${r.total}</b> 条${coSkippedHtml(r, cfValues())}<br>
        <div class="muted" style="font-size:12px">全程CDP · 耗时约15秒 · 无需翻页</div>`);
    } catch (e) {
      await zyAlert('❌ 整站采集失败', e.message || '请确认 Edge 9222 已开启');
    }
    setBusy(null);
    refreshStats();
  } else if (mode === 'catmenu') {
    // ⑥ 类目菜单采集: 首页 → 大类目 → 二级类目 → 查看所有结果 → 商品 (可过滤)
    const f = await zyPromptForm('🗺️ 类目菜单采集', [
      { field: 'category', label: '大类目名 (模糊匹配, 如 Electronics / Automotive / Home)', placeholder: '如: Electronics', default: '' },
      { field: 'pages', label: '并行打开页数 (1-10)', type: 'number', default: '3' },
      { field: 'maxItems', label: '入库数量上限 (1-100)', type: 'number', default: '50' },
    ], { hint: '自动导航: 首页 → 大类目 → 二级类目 → 查看所有结果 → 采集商品 · 不符合过滤条件(配送/A+/排名/价格/评分等)的商品直接跳过不采集' });
    if (!f) return;
    if (!f.category) { await zyAlert('⚠️ 请输入大类目名'); return; }
    setBusy(`⏳ 类目菜单采集中(${f.category} × ${f.pages}页)...`);
    try {
      const r = await API('/api/collect/category-menu', { method: 'POST', body: JSON.stringify({ site: cfSite()[0] || 'de', category: f.category, pages: parseInt(f.pages, 10), maxItems: parseInt(f.maxItems, 10), ...coPayload(cfValues()) }) });
      const stepsHtml = (r.steps || []).map((s) => `<div style="padding:2px 0">· ${esc(s)}</div>`).join('');
      await zyAlert('✅ 类目菜单采集完成', `
        「${esc(f.category)}」导航链路:<br>
        <div style="margin:6px 0;background:#f6f6f6;border-radius:6px;padding:8px;font-size:12px">${stepsHtml}</div>
        过滤条件: <b>${esc(coDesc(cfValues()))}</b><br>
        抓取 <b>${r.productCount}</b> 个 (过滤跳过 <b>${r.skipped || 0}</b> 个), 新增入库 <b>${r.added}</b> 个 | 当前共 <b>${r.total}</b> 条`);
    } catch (e) {
      await zyAlert('❌ 类目菜单采集失败', e.message || '请确认 Edge 9222 已开启');
    }
    setBusy(null);
    refreshStats();
  } else {
    // ② 跟卖店铺采集 (完整链路: 商品 → 出售单位 → 参观店铺 → 店铺全部商品)
    const f = await zyPromptForm('🏪 跟卖店铺采集', [
      { field: 'url', label: '商品详情 URL 或出售单位链接', placeholder: 'https://www.amazon.de/dp/B0XXXXXXX 或 aag/main、/sp 链接', default: '' },
      { field: 'maxItems', label: '商品数上限 (1-100)', type: 'number', default: '20' },
      { field: 'maxPages', label: '翻页数上限 (1-20, 每页约16个)', type: 'number', default: '2' },
    ], { hint: '自动链路: 商品aod → 出售单位跳转链接 → 出售单位详情页 → 参观出售单位 (支持 Visit the Anker Store 品牌店链接) → 店铺全部商品 · 每个商品: 先详情页(价格/品牌/评分/变体) → 再aod跟卖(卖家/价格/链接) · 全程CDP · 不符合过滤条件(A+/配送/排名等)的商品直接跳过 · 采集页可配 A+ 店铺过滤(仅采/排除品牌店)' });
    if (!f) return;
    if (!/^https:\/\/(www\.)?amazon\./.test(f.url || '')) { await zyAlert('⚠️ 无效链接', '请输入 amazon 商品详情 URL 或出售单位链接'); return; }
    setBusy(`⏳ 跟卖店铺采集中(${f.maxItems}个)...`);
    try {
      const r = await API('/api/collect/follow-shop', { method: 'POST', body: JSON.stringify({ url: f.url, maxItems: parseInt(f.maxItems, 10), maxPages: parseInt(f.maxPages, 10), ...coPayload(cfValues()) }) });
      const stepsHtml = (r.steps || []).map((s) => `<div style="padding:2px 0">· ${esc(s)}</div>`).join('');
      await zyAlert('✅ 跟卖店铺采集完成', `
        出售单位: <b>${esc(r.seller || r.sellerId || '?')}</b><br>
        店铺抓取 <b>${r.productCount}</b> 个商品, 新增入库 <b>${r.added}</b> 个${coSkippedHtml(r, cfValues())}<br>
        每个商品: 先采详情页(价格/品牌/评分/变体) → 再采 aod 跟卖(卖家/价格/链接/运费)<br>
        当前共 <b>${r.total}</b> 条<br>
        <div style="margin-top:6px;background:#f6f6f6;border-radius:6px;padding:8px;font-size:12px">${stepsHtml}</div>
        <a href="${esc(r.storeUrl)}" target="_blank" style="font-size:12px">打开该出售单位店铺 ↗</a>`);
    } catch (e) {
      await zyAlert('❌ 跟卖店铺采集失败', e.message || '请确认 Edge 9222 已开启、智赢插件已加载');
    }
    setBusy(null);
    refreshStats();
  }
}
window.__openCollectFlow = openCollectFlow;

async function renderProduct() {
  const content = $('#content');
  content.innerHTML = `
    <div class="toolbar filter-toolbar">
      <button id="goCollect" class="btn primary" style="flex-shrink:0">去采集</button>
      <input id="cSearch" class="input" placeholder="🔍 搜索 ASIN / 标题" style="width:200px;flex-shrink:0">
      <select id="cFba" class="select" style="flex-shrink:0"><option value="">全部配送</option><option value="FBA">FBA</option><option value="FBM">FBM</option></select>
      <select id="cSell" class="select" style="flex-shrink:0"><option value="">全部卖家</option><option value="amz">AMZ 自营</option><option value="third">第三方卖家</option></select>
      <select id="cAplus" class="select" style="flex-shrink:0"><option value="">全部 A+</option><option value="1">仅有 A+</option><option value="0">排除 A+</option></select>
      <select id="cBadge" class="select" style="flex-shrink:0"><option value="">全部标签</option><option value="bestseller">Best Seller</option><option value="choice">⭐ A (Amazon's Choice)</option><option value="deal">限时优惠</option><option value="newrelease">新品</option></select>
      <button id="cFilter" class="btn" style="flex-shrink:0">自定义筛选</button>
      <button id="cRefreshRank" class="btn" style="flex-shrink:0" title="对无排名商品批量补采 BSR (读详情页, 可中途停止)">补采排名</button>
      <button id="c1688Search" class="btn" style="flex-shrink:0" title="对选中商品批量上传主图到 1688 以图搜图, 找同款货源并存入">1688 图搜找货</button>
      <span class="muted" id="cCount" style="flex-shrink:0"></span>
    </div>
    <!-- 自定义筛选面板 (默认展开, 全部设置直接列出) -->
    <div id="cFilterPanel" class="card" style="display:block;margin-bottom:12px">
      <div class="card-title"> 自定义筛选</div>
      <div class="filter-grid">
        <div class="filter-item"><label>价格 (€, 格式 最小-最大)</label><input id="fPriceRange" class="input" placeholder="如 100-200"></div>
        <div class="filter-item"><label>月销量 (格式 最小-最大)</label><input id="fSalesRange" class="input" placeholder="如 1000-5000"></div>
        <div class="filter-item"><label>排名 ≤ (BSR, 空=不限)</label><input id="fRankMax" class="input" type="number" min="0" placeholder="如 500000"></div>
        <div class="filter-item"><label>评分 ≥ (空=不限)</label><input id="fRating" class="input" type="number" min="0" max="5" step="0.1" placeholder="如 4.0"></div>
        <div class="filter-item"><label>A+ 页面</label><select id="fAplus" class="select"><option value="">不限</option><option value="1">仅有 A+</option><option value="0">排除 A+</option></select></div>
        <div class="filter-item"><label>商标数 ≤ (空=不限)</label><input id="fTmMax" class="input" type="number" min="0" placeholder="如 50"></div>
        <div class="filter-item"><label>卖家地区</label><select id="fChina" class="select"><option value="">全部</option><option value="1">中国卖家</option><option value="0">非中国卖家</option></select></div>
        <div class="filter-item">
          <label>站点 (可多选)</label>
          <div class="multi-select" id="fSiteWrap">
            <button type="button" class="select multi-select-trigger" id="fSiteTrigger">全部站点 ▾</button>
            <div class="multi-select-panel" id="fSitePanel">
              <label class="multi-opt"><input type="checkbox" value="de"> 🇩🇪 德国</label>
              <label class="multi-opt"><input type="checkbox" value="uk"> 🇬🇧 英国</label>
              <label class="multi-opt"><input type="checkbox" value="us"> 🇺🇸 美国</label>
              <label class="multi-opt"><input type="checkbox" value="fr"> 🇫🇷 法国</label>
              <label class="multi-opt"><input type="checkbox" value="it"> 🇮🇹 意大利</label>
              <label class="multi-opt"><input type="checkbox" value="es"> 🇪🇸 西班牙</label>
              <label class="multi-opt"><input type="checkbox" value="jp"> 🇯🇵 日本</label>
              <label class="multi-opt"><input type="checkbox" value="ca"> 🇨🇦 加拿大</label>
              <label class="multi-opt"><input type="checkbox" value="in"> 🇮🇳 印度</label>
              <div class="multi-actions"><button type="button" class="btn small" id="fSiteClear">✕ 清除</button><button type="button" class="btn small primary" id="fSiteApply">✓ 确定</button></div>
            </div>
          </div>
        </div>
        <div class="filter-item"><label>类目 (一级)</label><select id="fCat1" class="select"></select></div>
        <div class="filter-item"><label>类目 (二级)</label><select id="fCat2" class="select"></select></div>
      </div>
      <div class="toolbar" style="margin:10px 0 0">
        <button id="fApply" class="btn primary">✓ 应用筛选</button>
        <button id="fReset" class="btn">✕ 清除</button>
        <span class="muted">价格/月销用「最小值-最大值」格式; 站点按住 Ctrl/Shift 多选</span>
      </div>
    </div>
    <div class="toolbar filter-toolbar" style="margin-bottom:12px">
      <span class="muted" id="cSelInfo" style="flex-shrink:0">已选 0 项</span>
      <button id="cSave" class="btn small" style="flex-shrink:0">💾 保存选中</button>
      <button id="cClaim" class="btn small" style="flex-shrink:0">批量认领</button>
      <button id="cSync" class="btn small" style="flex-shrink:0">批量同步</button>
      <button id="cDelete" class="btn small danger-btn" style="flex-shrink:0">批量删除</button>
      <button id="cClear" class="btn small danger-btn" style="flex-shrink:0">一键清空</button>
      <span style="flex:1"></span>
      <button id="cExportTxt" class="btn small" style="flex-shrink:0">导出文本</button>
      <button id="cExportCsv" class="btn small" style="flex-shrink:0">导出表格</button>
      <button id="cReset" class="btn small" style="flex-shrink:0" title="恢复初始 50 条种子数据">↩ 重置</button>
    </div>
    <div class="card table-card" style="padding:0"><div id="cTableWrap" style="overflow-x:auto">
      <table id="cTable" style="min-width:1400px">
      <thead><tr>
        <th style="width:34px"><input type="checkbox" id="cAll"></th>
        <th>排名</th><th>ASIN</th><th>商品</th><th>品牌</th><th>备案/商标</th><th>配送</th><th>价格</th><th>30天销量</th><th>榜单排名</th><th>标签</th><th>卖家</th><th>跟卖数</th><th>站点</th><th>上架时间</th><th>操作</th>
      </tr></thead><tbody></tbody></table>
      </div>
      <!-- 粘性横向滚动条 (跟随视口) -->
      <div class="h-scroll-track" id="cHScroll"><div class="h-scroll-spacer"></div></div>
      <!-- 分页 -->
      <div class="pagination" style="padding:10px 14px;display:flex;align-items:center;gap:10px;justify-content:flex-end">
        <span class="muted" id="cPageInfo"></span>
        <button id="cPagePrev" class="btn small" disabled>◀ 上一页</button>
        <button id="cPageNext" class="btn small">下一页 ▶</button>
        <select id="cPageSize" class="select" style="width:90px"><option value="20">20/页</option><option value="50" selected>50/页</option><option value="100">100/页</option><option value="200">200/页</option></select>
      </div>
    </div>
  `;
  const tbody = $('#cTable tbody');

  const selected = new Set();
  let page = 1;
  let pageSize = 50;

  // ===== 粘性横向滚动条: 与表格容器双向同步 =====
  const tableWrap = $('#cTableWrap');
  const hScroll = $('#cHScroll');
  let syncing = false;
  const syncScroll = () => {
    if (!tableWrap || !hScroll) return;
    const spacer = hScroll.querySelector('.h-scroll-spacer');
    spacer.style.width = tableWrap.scrollWidth + 'px';  // 撑开轨道滚动范围
    // 表格滚动 → 轨道跟随
    tableWrap.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      hScroll.scrollLeft = tableWrap.scrollLeft;
      syncing = false;
    });
    // 轨道滚动 → 表格跟随
    hScroll.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      tableWrap.scrollLeft = hScroll.scrollLeft;
      syncing = false;
    });
  };
  syncScroll();

  const renderList = (items, withCompliance) => {
    // 分页切片
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    // 更新分页信息
    $('#cPageInfo').textContent = `第 ${page}/${pages} 页 · 共 ${total} 条`;
    $('#cPagePrev').disabled = page <= 1;
    $('#cPageNext').disabled = page >= pages;
    tbody.innerHTML = pageItems.map((p) => {
      const fulfill = p.amazonSell
        ? '<span class="badge amz">AMZ 自营</span>'
        : `<span class="badge ${p.fulfill === 'FBA' ? 'fba' : 'fbm'}">${p.fulfill}</span>`;
      const saved = p.saved ? ' <span class="badge low" title="已保存到产品库">已保存</span>' : '';
      // 备案/商标 (悬停显示注册国家, 点击弹窗查看详情)
      const tmCountries = Array.isArray(p.tmCountries) ? p.tmCountries : [];
      const tmTitle = tmCountries.length ? '商标注册国家: ' + tmCountries.join('、') : (p.trademarkCount ? `商标记录 ${p.trademarkCount} 条${p.tmText ? ' · ' + p.tmText : ''}` : '');
      const tmHint = (tmTitle ? ` title="${esc(tmTitle)}"` : '') + ' style="cursor:help" data-tmasin="' + esc(p.asin) + '"';
      const tmCountBadge = tmCountries.length ? `<span class="tm-count">${tmCountries.length}国</span>` : '';
      const bs = p.brandStatus === 'registered' ? `<span class="badge danger"${tmHint}>已备案${tmCountBadge}</span>`
        : p.brandStatus === 'unchecked' ? `<span class="badge medium"${tmHint}>有商标${tmCountBadge}</span>`
        : p.trademarkCount > 0 ? `<span class="badge medium"${tmHint}>${p.trademarkCount}商标${tmCountBadge}</span>`
        : p.brandStatus === 'notfound' || (p.brandStatus == null && p.source === 'cdp-panel') ? '<span class="badge low">未查到</span>'
        : '<span class="badge low">未查到</span>';
      // 榜单排名 (cdp-panel 商品有 bsr 数组)
      const bsrTxt = Array.isArray(p.bsr) && p.bsr.length ? p.bsr.map((b) => `<span class="pill">#${esc(b.rank)} ${esc(b.category.slice(0, 18))}</span>`).join('') : (p.rank || '-');
      const bsrArr = Array.isArray(p.bsr) && p.bsr.length ? p.bsr : [];
      const bigRank = p.rank || (bsrArr.length ? '#' + Math.max(...bsrArr.map((b) => b.rank)) : '');
      const smallRank = bsrArr.length ? Math.min(...bsrArr.map((b) => b.rank)) : null;
      // 商品亚马逊链接 (按站点生成跳转链接)
      const amzHost = 'www.amazon.' + ({ uk: 'co.uk', us: 'com', jp: 'co.jp', au: 'com.au', mx: 'com.mx', br: 'com.br', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' }[p.site] || p.site || 'de');
      return `<tr>
        <td><input type="checkbox" class="row-cb" value="${esc(p.asin)}" ${selected.has(p.asin) ? 'checked' : ''}></td>
        <td class="muted">${esc(p.rank || '-')}</td>
        <td class="mono">${esc(p.asin)}</td>
        <td style="max-width:400px"><div style="display:flex;align-items:center;gap:8px">${bigRank ? `<span class="big-rank" title="大排名">${esc(bigRank)}</span>` : ''}${p.mainImage ? `<img src="${esc(p.mainImage)}" alt="" title="点击查看详情" class="p-main-img" data-asin="${esc(p.asin)}" loading="lazy">` : `<span class="p-main-img ph" data-asin="${esc(p.asin)}" title="点击查看详情"></span>`}<a class="title-link" data-asin="${esc(p.asin)}" title="点击查看详情">${esc(p.title.slice(0, 55))}${p.title.length > 55 ? '…' : ''}</a></div></td>
        <td><b>${esc(p.brand)}</b></td>
        <td>${bs}</td>
        <td>${fulfill}</td>
        <td>${p.minPrice != null ? '<b>' + fmtMoney(p.minPrice, p.currency) + '</b>' + (p.buyBoxPrice != null && p.buyBoxPrice !== p.minPrice ? `<br><span class="muted" title="BuyBox价">${fmtMoney(p.buyBoxPrice, p.currency)}</span>` : '') : fmtMoney(p.price, p.currency)}</td>
        <td>${fmtNum(p.monthlySales)}</td>
        <td style="max-width:190px">${bsrTxt}${smallRank != null && (!bsrArr.length || smallRank !== Math.max(...bsrArr.map((b) => b.rank))) ? `<div class="small-rank" title="小排名 (细分类目)">小 ${fmtNum(smallRank)}</div>` : ''}</td>
        <td style="white-space:nowrap">${(p.badge === 'bestseller' ? '<span class="badge gold">Best</span>' : p.badge === 'choice' ? '<span class="badge blue">⭐ A</span>' : p.badge === 'deal' ? '<span class="badge danger">Deal</span>' : p.badge === 'newrelease' ? '<span class="badge newrelease">新品</span>' : '')}${p.aplus ? '<span class="badge aplus">A+</span>' : ''}${p.is1688 ? (p.is1688Url ? `<a class="badge b1688" href="${esc(p.is1688Url)}" target="_blank" rel="noopener" title="打开 1688 同款商品">1688</a>` : '<span class="badge b1688" title="有 1688 同款 (可找货源)">1688</span>') : ''}${p.bgMark ? '<span class="badge danger" title="BG标 (蓝色品牌标, 已备案品牌)">BG</span>' : ''}${p.tmMark ? '<span class="badge medium" title="TM标 (商标申请中)">TM</span>' : ''}${p.patentRisk ? '<span class="badge danger" title="专利库风险匹配">专利</span>' : ''}</td>
        <td>${esc(p.sellerId || '')}${p.chinaSeller ? '<br><span class="badge danger">中国卖家</span>' : ''}</td>
        <td>${p.followCount ?? '-'}</td>
        <td class="muted">${esc(p.site || '-')}</td>
        <td class="muted" style="white-space:nowrap">${esc(p.listedAt || '-')}</td>
        <td style="white-space:nowrap">
          <a class="btn small" href="${esc('https://' + amzHost + '/dp/' + p.asin)}" target="_blank" rel="noopener" title="在亚马逊打开商品">⧉ 链接</a>
          <button class="btn small row-save" data-asin="${esc(p.asin)}" title="${p.saved ? '取消保存' : '保存到产品库'}">${p.saved ? '★' : '☆'}</button>
          <button class="btn small row-claim" data-asin="${esc(p.asin)}" title="认领到草稿箱"></button>
          <button class="btn small row-del" data-asin="${esc(p.asin)}" title="删除"></button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="15" class="empty">无匹配商品 (可点击「📡 去采集」添加)</td></tr>';

    // 事件绑定
    $$('.title-link', tbody).forEach((a) => a.addEventListener('click', () => openProductDetail(a.dataset.asin)));
    // 备案/商标 badge 点击 → 弹窗查看商标注册国家
    $$('.badge[data-tmasin]', tbody).forEach((el) => el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = await API('/api/products/detail?asin=' + encodeURIComponent(el.dataset.tmasin));
      if (d.error) { await zyAlert(d.error); return; }
      const cs = Array.isArray(d.tmCountries) ? d.tmCountries : [];
      showModal({
        title: '商标注册国家',
        body: `<div style="font-size:13px">
          <div class="muted" style="margin-bottom:8px">${esc(d.asin)} · ${esc(d.brand)} ${d.brandStatus === 'registered' ? '<span class="badge danger">已备案</span>' : `<span class="badge medium">${d.trademarkCount}条商标</span>`}</div>
          ${cs.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${cs.map((c) => `<span class="tm-country-chip">${esc(c)}</span>`).join('')}</div>` : '<div class="muted">未采集到商标注册国家数据 (详情页插件面板可采集)</div>'}
          ${d.tmText ? `<div class="muted" style="font-size:12px">商标原文: ${esc(d.tmText)}</div>` : ''}
        </div>`,
        buttons: [{ label: '关闭', value: 'ok' }],
      });
    }));
    $$('.p-main-img', tbody).forEach((im) => im.addEventListener('click', () => {
      // 有主图 → 大图灯箱; 占位 → 打开详情
      if (im.tagName === 'IMG') openImageLightbox(im.src, im.closest('tr') ? im.closest('tr').querySelector('.title-link')?.textContent || '' : '');
      else openProductDetail(im.dataset.asin);
    }));
    $$('.row-cb', tbody).forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
      updateSel();
    }));
    $$('.row-save', tbody).forEach((b) => b.addEventListener('click', async () => {
      await API('/api/products/save', { method: 'POST', body: JSON.stringify({ asins: [b.dataset.asin], saved: b.textContent === '☆' }) });
      reload();
    }));
    $$('.row-claim', tbody).forEach((b) => b.addEventListener('click', async () => {
      const r = await API('/api/claims', { method: 'POST', body: JSON.stringify({ asin: b.dataset.asin }) });
      await zyAlert(r.error || `✔ 已认领: ${b.dataset.asin}`);
    }));
    $$('.row-del', tbody).forEach((b) => b.addEventListener('click', async () => {
      if (!await zyConfirm(`确定删除 ${b.dataset.asin} 吗?`)) return;
      await API('/api/products/delete', { method: 'POST', body: JSON.stringify({ asins: [b.dataset.asin] }) });
      selected.delete(b.dataset.asin);
      reload();
    }));

    // 渲染后更新粘性滚动条轨道宽度
    if (hScroll && tableWrap) {
      const spacer = hScroll.querySelector('.h-scroll-spacer');
      if (spacer) spacer.style.width = Math.max(tableWrap.scrollWidth, tableWrap.clientWidth + 1) + 'px';
    }
  };

  const updateSel = () => { $('#cSelInfo').textContent = `已选 ${selected.size} 项`; };

  let items = (await API('/api/products')).items;
  $('#cCount').textContent = `共 ${items.length} 条`;
  renderList(items, false);

  const reload = async () => {
    const q = new URLSearchParams();
    if ($('#cFba').value) q.set('fba', $('#cFba').value);
    if ($('#cSell').value) q.set('sell', $('#cSell').value);
    if ($('#cAplus').value !== '') q.set('aplus', $('#cAplus').value);   // 独立 A+ 筛选: 1=仅有 / 0=排除
    if ($('#cBadge').value) q.set('badge', $('#cBadge').value);
    if ($('#cSearch').value) q.set('q', $('#cSearch').value);
    // 自定义筛选
    if ($('#fPriceRange').value) q.set('priceRange', $('#fPriceRange').value);
    if ($('#fSalesRange').value) q.set('salesRange', $('#fSalesRange').value);
    if ($('#fRankMax').value) q.set('rankMax', $('#fRankMax').value);
    if ($('#fRating').value) q.set('ratingMin', $('#fRating').value);
    if ($('#fAplus').value !== '') q.set('aplus', $('#fAplus').value);
    if ($('#fTmMax').value) q.set('tmMax', $('#fTmMax').value);
    if ($('#fChina').value !== '') q.set('china', $('#fChina').value);
    // 站点多选 (checkbox 面板)
    const sites = [...document.querySelectorAll('#fSitePanel input[type="checkbox"]:checked')].map((c) => c.value);
    if (sites.length) q.set('site', sites.join(','));
    const catV = $('#fCat2') && $('#fCat2').value ? $('#fCat2').value : (($('#fCat1') && $('#fCat1').value) || '');
    if (catV) q.set('category', catV);
    const data = await API('/api/products?' + q.toString());
    items = data.items;
    $('#cCount').textContent = `共 ${items.length} 条`;
    renderList(items, false);
  };
  const getSelAsins = () => [...selected];
  // 搜索/筛选变更 → 回到第一页
  const reloadFromTop = () => { page = 1; reload(); };

  $('#cSearch').addEventListener('input', reloadFromTop);
  $('#cFba').addEventListener('change', reloadFromTop);
  $('#cSell').addEventListener('change', reloadFromTop);
  $('#cAplus').addEventListener('change', reloadFromTop);
  $('#cBadge').addEventListener('change', reloadFromTop);
  // 自定义筛选面板开关
  $('#cFilter').addEventListener('click', () => {
    const panel = $('#cFilterPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    $('#cFilter').textContent = panel.style.display === 'none' ? '🎛 自定义筛选' : '🎛 收起筛选';
  });
  // 补采排名: 对无排名商品批量读详情 BSR (耗时较长, 可停止)
  $('#cRefreshRank').addEventListener('click', async () => {
    if (!await zyConfirm('将对所有无排名商品逐个打开详情页补采 BSR 排名 (每个约 8 秒, 可在「商品采集」页点停止中断)。确定开始?')) return;
    const btn = $('#cRefreshRank');
    btn.textContent = '补采中…'; btn.disabled = true;
    const poll = setInterval(async () => {
      try { const pg = await API('/api/collect/progress'); if (pg && pg.running) $('#cCount').textContent = `补采排名中: ${pg.items} 个, 已补 ${pg.added}`; } catch {}
    }, 3000);
    try {
      const r = await API('/api/products/refresh-ranks', { method: 'POST', body: JSON.stringify({}) });
      clearInterval(poll);
      await zyAlert('✅ 补采排名完成', `共处理 <b>${r.done}</b> 个商品, 补到排名 <b>${r.addedRank}</b> 个, 失败 ${r.fail} 个${r.stopped ? '<br><span style="color:#b00020">⏹ 已手动停止</span>' : ''}`);
    } catch (e) {
      clearInterval(poll);
      await zyAlert('❌ 补采失败', e && e.message || e);
    }
    btn.textContent = '补采排名'; btn.disabled = false;
    reload();
  });
  // 批量 1688 图搜找货: 选中商品 → 逐个上传主图到 1688 以图搜图 → 自动存第一个同款货源
  $('#c1688Search').addEventListener('click', async () => {
    const sel = getSelAsins();
    const targets = sel.length ? sel : (items.filter((x) => x.mainImage).slice(0, 10).map((x) => x.asin));
    if (!targets.length) return await zyAlert('请先勾选商品 (或库中无主图商品)');
    if (!await zyConfirm(`将对 ${targets.length} 个商品逐个上传主图到 1688 以图搜图 (每个约 30 秒, 可停止)。确定开始?`)) return;
    const btn = $('#c1688Search');
    btn.textContent = '图搜中…'; btn.disabled = true;
    const results = [];
    for (let i = 0; i < targets.length; i++) {
      const asin = targets[i];
      $('#cCount').textContent = `1688 图搜 ${i + 1}/${targets.length}: ${asin}`;
      try {
        const r = await API('/api/products/1688-search-upload', { method: 'POST', body: JSON.stringify({ asin }) });
        let stored = 0;
        if (r.ok && r.items && r.items.length) {
          const g0 = r.items[0];
          const prod = items.find((x) => x.asin === asin);
          const list = (prod && prod.sourceGoods) ? prod.sourceGoods.slice() : [];
          list.push({ platform: '1688', url: g0.url, title: g0.title, price: g0.priceRaw || g0.price, addedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
          await API('/api/products/goods', { method: 'POST', body: JSON.stringify({ asin, goods: list }) });
          stored = 1;
        }
        results.push({ asin, count: r.count || 0, stored, error: r.error });
      } catch (e) {
        results.push({ asin, count: 0, stored: 0, error: e && e.message || e });
      }
    }
    btn.textContent = '1688 图搜找货'; btn.disabled = false;
    reload();
    const ok = results.filter((x) => x.count > 0).length;
    const rows = results.map((x) => `<div style="padding:2px 0">${x.asin}: ${x.error ? '✗ ' + x.error : '找到 ' + x.count + ' 个同款, 已存 ' + x.stored + ' 个'}</div>`).join('');
    await zyAlert('✅ 1688 批量图搜完成', `共处理 <b>${results.length}</b> 个商品, <b>${ok}</b> 个找到同款货源 (已自动存入第一个货源到商品)<div style="margin-top:6px;background:#f6f6f6;border-radius:6px;padding:8px;font-size:12px;max-height:240px;overflow-y:auto">${rows}</div>`);
  });
  $('#fApply').addEventListener('click', () => { page = 1; reload(); });
  // 商品管理页类目联动 (一级 → 二级), 切换后自动刷新列表
  bindCategoryTree('fCat1', 'fCat2', () => { page = 1; reload(); });
  $('#fReset').addEventListener('click', () => {
    ['fPriceRange', 'fSalesRange', 'fRankMax', 'fRating', 'fTmMax'].forEach((id) => { $('#' + id).value = ''; });
    $('#fAplus').value = '';
    $('#fChina').value = '';
    $('#fCat1').value = ''; $('#fCat1').dispatchEvent(new Event('change'));
    $('#fCat2').value = '';
    document.querySelectorAll('#fSitePanel input[type="checkbox"]').forEach((c) => { c.checked = false; });
    updateSiteTrigger();
    page = 1;
    reload();
  });
  // 站点多选下拉: 展开/收起 + 状态更新
  const SITE_LABELS = { de: '🇩🇪 德国', uk: '🇬🇧 英国', us: '🇺🇸 美国', fr: '🇫🇷 法国', it: '🇮🇹 意大利', es: '🇪🇸 西班牙', jp: '🇯🇵 日本', ca: '🇨🇦 加拿大', in: '🇮🇳 印度' };
  const updateSiteTrigger = () => {
    const checked = [...document.querySelectorAll('#fSitePanel input[type="checkbox"]:checked')].map((c) => c.value);
    $('#fSiteTrigger').textContent = checked.length ? `🌍 ${checked.map((v) => SITE_LABELS[v]).join(' ')} ▾` : '🌍 全部站点 ▾';
  };
  $('#fSiteTrigger').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#fSitePanel').classList.toggle('open');
  });
  $('#fSitePanel').addEventListener('click', (e) => e.stopPropagation());
  $$('#fSitePanel input[type="checkbox"]').forEach((c) => c.addEventListener('change', updateSiteTrigger));
  $('#fSiteClear').addEventListener('click', () => {
    document.querySelectorAll('#fSitePanel input[type="checkbox"]').forEach((c) => { c.checked = false; });
    updateSiteTrigger();
  });
  $('#fSiteApply').addEventListener('click', () => {
    $('#fSitePanel').classList.remove('open');
    page = 1;
    reload();
  });
  document.addEventListener('click', () => $('#fSitePanel').classList.remove('open'));
  // 翻页
  $('#cPagePrev').addEventListener('click', () => { if (page > 1) { page--; renderList(items, false); } });
  $('#cPageNext').addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    if (page < pages) { page++; renderList(items, false); }
  });
  $('#cPageSize').addEventListener('change', (e) => { pageSize = parseInt(e.target.value, 10); page = 1; renderList(items, false); });
  $('#cAll').addEventListener('change', (e) => {
    const checked = e.target.checked;
    $$('.row-cb', tbody).forEach((cb) => { cb.checked = checked; if (checked) selected.add(cb.value); else selected.delete(cb.value); });
    updateSel();
  });



  $('#goCollect').addEventListener('click', () => navigate('collect'));

  // 批量保存
  $('#cSave').addEventListener('click', async () => {
    if (!getSelAsins().length) return await zyAlert('请先勾选商品');
    await API('/api/products/save', { method: 'POST', body: JSON.stringify({ asins: getSelAsins(), saved: true }) });
    await zyAlert(`✔ 已保存 ${getSelAsins().length} 个商品到产品库`);
    reload();
  });

  // 批量认领
  $('#cClaim').addEventListener('click', async () => {
    if (!getSelAsins().length) return await zyAlert('请先勾选商品');
    let ok = 0;
    for (const asin of getSelAsins()) {
      const r = await API('/api/claims', { method: 'POST', body: JSON.stringify({ asin }) });
      if (!r.error) ok++;
    }
    await zyAlert(`✔ 已认领 ${ok}/${getSelAsins().length} 个到草稿箱`);
  });

  // 批量同步
  $('#cSync').addEventListener('click', async () => {
    if (!getSelAsins().length) return await zyAlert('请先勾选商品');
    const r = await API('/api/products/sync', { method: 'POST', body: JSON.stringify({ asins: getSelAsins() }) });
    await zyAlert(`🔄 已同步刷新 ${r.synced} 个商品 (价格/月销/跟卖数已更新)`);
    reload();
  });

  // 批量删除
  $('#cDelete').addEventListener('click', async () => {
    if (!getSelAsins().length) return await zyAlert('请先勾选商品');
    if (!await zyConfirm(`确定删除选中的 ${getSelAsins().length} 个商品吗?`)) return;
    const r = await API('/api/products/delete', { method: 'POST', body: JSON.stringify({ asins: getSelAsins() }) });
    await zyAlert(`🗑 已删除 ${r.deleted} 个商品, 剩余 ${r.remain} 条`);
    selected.clear();
    updateSel();
    reload();
  });

  // 一键清空
  $('#cClear').addEventListener('click', async () => {
    if (!await zyConfirm('⚠️ 确定清空全部商品吗? 清空后可点「↩ 重置」恢复种子数据。')) return;
    if (!await zyConfirm('再次确认: 真的要一键清空商品库?')) return;
    const r = await API('/api/products/clear', { method: 'POST' });
    await zyAlert(`🧹 已清空 ${r.cleared} 个商品`);
    selected.clear();
    updateSel();
    reload();
  });

  // 重置
  $('#cReset').addEventListener('click', async () => {
    if (!await zyConfirm('恢复初始 50 条种子数据?')) return;
    const r = await API('/api/products/reset', { method: 'POST' });
    await zyAlert(`↩ 已重置, 当前 ${r.total} 条`);
    reload();
  });

  // 导出文本 / 表格 (下载选中或全部)
  const doExport = (fmt) => {
    const asins = getSelAsins();
    const q = new URLSearchParams({ format: fmt });
    if (asins.length) q.set('asins', asins.join(','));
    window.open('/api/products/export?' + q.toString(), '_blank');
  };
  $('#cExportTxt').addEventListener('click', () => doExport('txt'));
  $('#cExportCsv').addEventListener('click', () => doExport('csv'));
}

/* ===== 商品采集 (6 种采集方式小模块 + 采集过滤面板 + 规则保存/加载) ===== */
async function renderCollect() {
  const content = $('#content');
  const [prod, rulesRes] = await Promise.all([API('/api/products'), API('/api/collect-rules')]);
  const ruleList = rulesRes.rules || [];
  const MODES = [
    { mode: 'category', icon: 'search', name: '类目搜索采集', desc: '关键词/类目搜索 amazon, 抓取搜索结果商品' },
    { mode: 'shop', icon: 'store', name: '跟卖店铺采集', desc: '商品aod → 出售单位 → 参观店铺 → 店铺全部商品' },
    { mode: 'batch', icon: 'refresh', name: '批量跟卖店铺采集', desc: '遍历已入库商品的跟卖卖家, 逐个跳转店铺采集' },
    { mode: 'parallel', icon: 'bolt', name: '多商品并行采集', desc: '商品aod → 验证 → 提取卖家 → 排除指定 → 并行采店铺' },
    { mode: 'bulk', icon: 'layers', name: '并行整站采集', desc: '一次并行打开N个搜索页, 批量聚合大量商品' },
    { mode: 'catmenu', icon: 'list', name: '类目菜单采集', desc: '首页 → 大类目 → 二级类目 → 查看所有结果 → 商品' },
  ];
  // Amazon 页面标识标签 (商品卡/详情页徽章, 多选=含任一即可)
  const BADGE_OPTIONS = [
    { value: 'aplus', label: 'A+ 内容' },
    { value: 'choice', label: "Amazon's Choice (AC)" },
    { value: 'bestseller', label: 'Best Seller' },
    { value: 'bestseller1', label: '#1 Best Seller' },
    { value: 'newrelease', label: 'New Release 新品' },
    { value: 'deal', label: '限时优惠 (Limited time deal)' },
    { value: 'dealday', label: '今日特惠 (Deal of the Day)' },
    { value: 'overallpick', label: 'Overall Pick 综合首选' },
    { value: 'editorspick', label: "Editor's Pick 编辑精选" },
    { value: 'toprated', label: 'Top Rated 最高评分' },
    { value: 'climate', label: '气候友好承诺 (Climate Pledge Friendly)' },
    { value: 'smallbusiness', label: '小企业 (Small Business)' },
  ];
  // 解析区间输入 "min-max" / "min-" / "-max" / 空 → {min,max}
  content.innerHTML = `
    <!-- ① 采集过滤 (含规则) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">${ic('list', 16)} 采集过滤 <span class="muted" style="font-weight:400">(与商品管理自定义筛选同条件 · 被筛除的商品直接跳过不采集 · 区间格式: 最小值-最大值, 只填一边表示 ≥ 或 ≤)</span></div>
      <div class="filter-grid">
        <div class="filter-item site-multi"><label>采集站点 (多选, 按区域分组; 跟卖店铺当前站点无商品时自动尝试其他选中站点)</label>
          <div class="multi-select" id="cfSiteWrap">
            <button type="button" class="select multi-select-trigger" id="cfSiteTrigger">全部站点 ▾</button>
            <div class="multi-select-panel casc-panel" id="cfSitePanel">
              ${SITE_GROUPS.map((g) => `<div class="casc-group"><div class="casc-title">${g.region}</div>${g.sites.map((s) => `<label class="multi-opt"><input type="checkbox" class="cfSiteCb" value="${s.value}" ${s.value === 'de' ? 'checked' : ''}> ${s.label}</label>`).join('')}</div>`).join('')}
              <div class="multi-actions"><button type="button" class="btn small" id="cfSiteClear">✕ 清除</button><button type="button" class="btn small primary" id="cfSiteApply">✓ 确定</button></div>
            </div>
          </div>
          <input id="cfCustomSites" class="input" placeholder="自定义站点 (逗号分隔, 如: au,mx,br)" style="margin-top:4px">
        </div>
        <div class="filter-item"><label>配送方式</label><select id="cfFulfill" class="select"><option value="">全部</option><option value="FBA">仅 FBA</option><option value="FBM">仅 FBM</option><option value="AMZ">仅 AMZ 自营</option></select></div>
        <div class="filter-item"><label>A+ 店铺 (仅跟卖店铺采集)</label><select id="cfShopAplus" class="select"><option value="">不限</option><option value="1">仅有 A+ 店铺</option><option value="0">排除 A+ 店铺</option></select></div>
        <div class="filter-item"><label>品牌店铺 (仅跟卖店铺采集)</label><select id="cfBrandShop" class="select"><option value="">不限</option><option value="0">排除品牌店铺</option><option value="1">仅品牌店铺</option></select></div>
        <div class="filter-item"><label>品牌店筛选 (仅跟卖店铺采集, 空=不限)</label><input id="cfBrandStore" class="input" list="cfBrandList" placeholder="品牌名如 Anker 只采该品牌; 填 ! 排除所有带 Visit the X Store 链接的店铺"><datalist id="cfBrandList"><option value="Anker"></option><option value="Samsung"></option><option value="Apple"></option><option value="Xiaomi"></option><option value="Sony"></option><option value="Philips"></option><option value="Bosch"></option><option value="Logitech"></option><option value="! 排除所有品牌店链接"></option></datalist></div>
        <div class="filter-item"><label>排名 BSR 区间 (空=不限)</label><input id="cfRankRange" class="input" placeholder="如 10000-500000"></div>
        <div class="filter-item"><label>价格区间 (€/£/$, 空=不限)</label><input id="cfPriceRange" class="input" placeholder="如 10-100"></div>
        <div class="filter-item"><label>评分区间 (空=不限)</label><input id="cfRatingRange" class="input" placeholder="如 3.5-4.8"></div>
        <div class="filter-item"><label>评论数区间 (空=不限)</label><input id="cfReviewsRange" class="input" placeholder="如 50-5000"></div>
        <div class="filter-item"><label>月销量区间 (空=不限)</label><input id="cfSalesRange" class="input" placeholder="如 100-5000"></div>
        <div class="filter-item"><label>商标数区间排除 (空=不限)</label><input id="cfTmRange" class="input" placeholder="如 10-100 (排除商标数在此区间的商品)"></div>
        <div class="filter-item"><label>上架天数区间 (新品, 空=不限)</label><input id="cfNewDaysRange" class="input" placeholder="如 30-180 (上架天数在此区间)"></div>
        <div class="filter-item"><label>1688 同款</label><select id="cfIs1688" class="select"><option value="">不限</option><option value="1">仅有 1688 同款</option><option value="0">排除 1688 同款</option></select></div>
        <div class="filter-item"><label>品牌状态</label><select id="cfBrandStatus" class="select"><option value="">不限</option><option value="registered">排除已备案品牌</option><option value="tm">排除 TM 申请中</option><option value="notfound">仅未查到品牌</option></select></div>
        <div class="filter-item"><label>商标国家排除 (逗号分隔, 空=不限)</label><input id="cfTmCountries" class="input" list="cfTmCountryList" placeholder="如: 欧盟,英国,美国"><datalist id="cfTmCountryList"><option value="欧盟"></option><option value="英国"></option><option value="美国"></option><option value="德国"></option><option value="日本"></option><option value="中国"></option><option value="法国"></option><option value="意大利"></option><option value="西班牙"></option><option value="马德里"></option></datalist></div>
        <div class="filter-item badge-multi"><label>页面标识 (逗号分隔, 含任一即可; 可手写如: A+,AC,BestSeller,新品,限时)</label>
          <input id="cfBadges" class="input" list="cfBadgeList" placeholder="如: A+,AC,BestSeller,NewRelease 或 新品,畅销 (空=不限)">
          <datalist id="cfBadgeList">${BADGE_OPTIONS.map((b) => `<option value="${b.label}">`).join('')}</datalist>
        </div>
        <div class="filter-item"><label>标题含关键词 (可输可选)</label><input id="cfQ" class="input" list="cfQList" placeholder="如: anker"><datalist id="cfQList"><option value="anker"></option><option value="usb"></option><option value="phone"></option><option value="case"></option><option value="holder"></option><option value="adapter"></option><option value="charger"></option><option value="cable"></option><option value="watch"></option><option value="gaming"></option></datalist></div>
        <div class="filter-item"><label>类目 (一级)</label><select id="cfCat1" class="select"></select></div>
        <div class="filter-item"><label>类目 (二级)</label><select id="cfCat2" class="select"></select></div>
      </div>
      <div class="toolbar" style="margin:10px 0 0">
        <button id="cfClear" class="btn">✕ 清空过滤</button>
        <span style="flex:1"></span>
        <span class="muted" id="cfActive" style="flex-shrink:0"></span>
      </div>
      <!-- 过滤规则 (整合进采集过滤) -->
      <div class="cf-rule-box">
        <div class="cf-rule-title">${ic('save', 14)} 过滤规则 <span class="muted" style="font-weight:400;font-size:12px">(保存/加载/删除过滤条件, 一键复用)</span></div>
        <div class="toolbar" style="margin-top:2px">
          <select id="cfRuleSelect" class="select" style="min-width:180px;flex-shrink:0"><option value="">— 选择规则 —</option></select>
          <button id="cfRuleSave" class="btn primary" style="flex-shrink:0">保存当前为规则</button>
          <button id="cfRuleLoad" class="btn" style="flex-shrink:0">加载选中</button>
          <button id="cfRuleDelete" class="btn danger-btn" style="flex-shrink:0">删除选中</button>
          <span class="muted" id="cfRuleInfo" style="flex-shrink:0"></span>
        </div>
        <div id="cfRuleList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>
    </div>

    <!-- ② 采集方式 (停止按钮低调置于标题右侧) -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-title" style="align-items:center">
        ${ic('grid', 16)} 采集方式 <span class="muted" style="font-weight:400">(点击卡片开始采集, 全程CDP无API)</span>
        <span style="flex:1"></span>
        <span class="muted" id="cfStopInfo" style="font-size:12px"></span>
        <button id="cfStopBtn" class="btn-stop" title="停止当前正在运行的采集 (已采集数据会保存入库)">${ic('stop', 14)} 停止</button>
      </div>
      <div class="collect-modes">
        ${MODES.map((m) => `<div class="collect-mode" data-mode="${m.mode}" role="button" tabindex="0"><span class="cm-emoji">${ic(m.icon, 22)}</span><span class="cm-name">${m.name}</span><span class="cm-desc">${m.desc}</span><span class="cm-progress"><span class="cm-prog-text">⏳ 启动…</span><button class="cm-stop" data-mode="${m.mode}" title="停止当前采集 (已采集数据会保存入库)">${ic('stop', 12)} 停止</button></span></div>`).join('')}
      </div>
    </div>
    <div class="card" id="cfLogCard" style="display:none">
      <div class="card-title">${ic('file', 16)} 采集结果</div>
      <div id="cfLog" style="max-height:240px;overflow-y:auto;font-size:13px"></div>
    </div>
  `;

  // 过滤面板状态显示
  const updateCfActive = () => {
    const v = cfValues();
    const parts = [];
    if (v.filterSites && v.filterSites.length) parts.push('站点:' + v.filterSites.join(','));
    if (v.filterFulfill) parts.push('配送=' + v.filterFulfill);
    if (v.filterShopAplus === '1') parts.push('仅A+店铺');
    else if (v.filterShopAplus === '0') parts.push('排除A+店铺');
    if (v.filterBrandShop === '0') parts.push('排除品牌店铺');
    else if (v.filterBrandShop === '1') parts.push('仅品牌店铺');
    if ((v.filterBrandStore || '').startsWith('!')) parts.push('排除品牌店链接');
    else if (v.filterBrandStore) parts.push('品牌店=' + v.filterBrandStore);
    const r1 = parseRange(v.filterRankRange), r2 = parseRange(v.filterPriceRange), r3 = parseRange(v.filterRatingRange), r4 = parseRange(v.filterReviewsRange), r5 = parseRange(v.filterSalesRange), r6 = parseRange(v.filterTmRange), r7 = parseRange(v.filterNewDaysRange);
    if (fmtRange(r1.min, r1.max)) parts.push('BSR:' + fmtRange(r1.min, r1.max));
    if (fmtRange(r2.min, r2.max)) parts.push('价:' + fmtRange(r2.min, r2.max));
    if (fmtRange(r3.min, r3.max)) parts.push('评分:' + fmtRange(r3.min, r3.max));
    if (fmtRange(r4.min, r4.max)) parts.push('评论:' + fmtRange(r4.min, r4.max));
    if (v.filterBadges && v.filterBadges.length) parts.push('标识:' + v.filterBadges.map((b) => BADGE_LABELS[b] || b).join(','));
    if (v.filterQ) parts.push('标题含「' + v.filterQ + '」');
    if (fmtRange(r6.min, r6.max)) parts.push('排除商标:' + fmtRange(r6.min, r6.max));
    if (v.filterTmCountries) parts.push('排除商标国家:' + v.filterTmCountries);
    if (fmtRange(r5.min, r5.max)) parts.push('月销:' + fmtRange(r5.min, r5.max));
    if (v.filterIs1688 === '1') parts.push('有1688同款');
    else if (v.filterIs1688 === '0') parts.push('排除1688同款');
    if (v.filterBrandStatus === 'registered') parts.push('排除已备案品牌');
    else if (v.filterBrandStatus === 'tm') parts.push('排除TM申请中');
    else if (v.filterBrandStatus === 'notfound') parts.push('仅未查到品牌');
    if (fmtRange(r7.min, r7.max)) parts.push('上架:' + fmtRange(r7.min, r7.max) + '天');
    if (v.filterCategory) parts.push('类目: ' + categoryLabelOf(v.filterCategory));
    $('#cfActive').textContent = parts.length ? `当前过滤: ${parts.join(' + ')}` : '';
  };
  // 类目联动 (一级 → 二级)
  bindCategoryTree('cfCat1', 'cfCat2', updateCfActive);
  $$('#cfSitePanel .cfSiteCb').forEach((el) => el.addEventListener('change', updateCfActive));
  // 站点级联下拉: 开关 + 状态 + 清除/确定 + 外部点击关闭
  const CF_SITE_LABELS = {}; SITE_GROUPS.forEach((g) => g.sites.forEach((s) => { CF_SITE_LABELS[s.value] = s.label; }));
  const updateCfSiteTrigger = () => {
    const checked = [...document.querySelectorAll('#cfSitePanel .cfSiteCb:checked')].map((c) => c.value);
    const custom = String($('#cfCustomSites') ? $('#cfCustomSites').value : '').split(/[,，\s]+/).filter(Boolean);
    const all = [...checked, ...custom];
    $('#cfSiteTrigger').textContent = all.length ? `${all.map((v) => CF_SITE_LABELS[v] || v.toUpperCase()).join(' ')} ▾` : '全部站点 ▾';
  };
  $('#cfSiteTrigger').addEventListener('click', (e) => { e.stopPropagation(); $('#cfSitePanel').classList.toggle('open'); });
  $('#cfSitePanel').addEventListener('click', (e) => e.stopPropagation());
  $$('#cfSitePanel .cfSiteCb').forEach((c) => c.addEventListener('change', updateCfSiteTrigger));
  $('#cfCustomSites').addEventListener('input', () => { updateCfActive(); updateCfSiteTrigger(); });
  $('#cfSiteClear').addEventListener('click', () => { document.querySelectorAll('#cfSitePanel .cfSiteCb').forEach((c) => { c.checked = false; }); updateCfSiteTrigger(); updateCfActive(); });
  $('#cfSiteApply').addEventListener('click', () => { $('#cfSitePanel').classList.remove('open'); updateCfActive(); });
  document.addEventListener('click', () => $('#cfSitePanel').classList.remove('open'));
  $('#cfBadges').addEventListener('input', updateCfActive);
  ['cfFulfill', 'cfShopAplus', 'cfBrandShop', 'cfBrandStore', 'cfRankRange', 'cfPriceRange', 'cfRatingRange', 'cfReviewsRange', 'cfSalesRange', 'cfTmRange', 'cfNewDaysRange', 'cfIs1688', 'cfBrandStatus', 'cfTmCountries', 'cfQ', 'cfCat1', 'cfCat2'].forEach((id) => {
    const el = $('#' + id);
    if (el) el.addEventListener('input', updateCfActive);
    if (el && el.tagName === 'SELECT') el.addEventListener('change', updateCfActive);
  });
  $('#cfClear').addEventListener('click', () => {
    ['cfFulfill', 'cfShopAplus', 'cfBrandShop', 'cfBrandStore', 'cfRankRange', 'cfPriceRange', 'cfRatingRange', 'cfReviewsRange', 'cfSalesRange', 'cfTmRange', 'cfNewDaysRange', 'cfIs1688', 'cfBrandStatus', 'cfTmCountries', 'cfQ', 'cfCat1', 'cfCat2'].forEach((id) => { const el = $('#' + id); if (el) el.value = ''; });
    $$('.site-chip').forEach((el) => { el.classList.toggle('active', el.dataset.site === 'de'); });
    document.querySelectorAll('#cfSitePanel .cfSiteCb').forEach((el) => { el.checked = el.value === 'de'; });
    $('#cfCustomSites').value = '';
    $('#cfBadges').value = '';
    updateCfSiteTrigger();
    // 重置一级类目后二级联动刷新
    const c1 = $('#cfCat1');
    if (c1) { c1.value = ''; c1.dispatchEvent(new Event('change')); }
    updateCfActive();
  });

  // 采集方式卡片 (仅 .collect-mode, 排除卡片内停止按钮)
  $$('.collect-mode').forEach((b) => b.addEventListener('click', () => window.__openCollectFlow(b.dataset.mode, b)));
  // 卡片内停止按钮: 点击停止当前采集 (不触发采集卡片)
  $$('.cm-stop').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const card = b.closest('.collect-mode');
    const txt = card.querySelector('.cm-prog-text');
    txt.textContent = '⏹ 停止中…';
    try {
      await API('/api/collect/stop', { method: 'POST' });
      txt.textContent = '⏹ 已请求停止, 当前步骤完成后退出 (已采数据已保存)';
    } catch (err) { txt.textContent = '✗ 停止失败: ' + (err && err.message || err); }
  }));

  // ⏹ 停止采集: 请求后端停止标志, 各采集循环检查后提前退出 (已采集数据保留入库)
  $('#cfStopBtn').addEventListener('click', async () => {
    const info = $('#cfStopInfo');
    try {
      const r = await API('/api/collect/stop', { method: 'POST' });
      info.textContent = '⏹ 已请求停止, 当前步骤完成后将停止 (已采集数据已保存)';
      info.style.color = '#b00020';
      setTimeout(() => { info.textContent = ''; }, 8000);
    } catch (e) {
      info.textContent = '✗ ' + (e.message || '停止请求失败');
      info.style.color = '#b00020';
    }
  });

  // ===== 过滤规则: 保存/加载/删除 =====
  const fillRuleSelect = (rules) => {
    $('#cfRuleSelect').innerHTML = '<option value="">— 选择规则 —</option>' + rules.map((r) => `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
    $('#cfRuleList').innerHTML = rules.map((r) => `<span class="pill" data-rule="${esc(r.name)}" title="点击加载: ${esc(coDescFromRule(r))}">${esc(r.name)} <span class="muted">${esc(coDescFromRule(r))}</span></span>`).join('');
    $$('#cfRuleList .pill').forEach((p) => p.addEventListener('click', () => { loadRuleByName(rules, p.dataset.rule); }));
  };
  const coDescFromRule = (r) => {
    const f = { ...r.filter };
    const sites = (Array.isArray(f.filterSites) && f.filterSites.length) ? f.filterSites : (r.site ? [r.site] : []);
    return coDesc({ ...f, filterSites: sites }) + (sites.length ? ` | 站点:${sites.join(',')}` : '');
  };
  const loadRuleByName = (rules, name) => {
    const r = rules.find((x) => x.name === name);
    if (!r) return;
    const m = { ...r.filter };
    // select 赋值: 值不在预设选项中时动态补一个选项, 保证旧规则/自定义值可回填
    const setSel = (id, v) => {
      const el = $('#' + id);
      if (!el) return;
      if (v && ![...el.options].some((o) => o.value === String(v))) {
        el.add(new Option(String(v), String(v)));
      }
      el.value = v || '';
    };
    setSel('cfFulfill', m.filterFulfill);
    setSel('cfShopAplus', m.filterShopAplus);
    setSel('cfBrandShop', m.filterBrandShop);
    $('#cfBrandStore').value = m.filterBrandStore || '';
    setSel('cfRankRange', m.filterRankRange);
    setSel('cfPriceRange', m.filterPriceRange);
    setSel('cfRatingRange', m.filterRatingRange);
    setSel('cfReviewsRange', m.filterReviewsRange);
    $('#cfQ').value = m.filterQ || '';
    $('#cfTmRange').value = m.filterTmRange || '';
    $('#cfTmCountries').value = m.filterTmCountries || '';
    $('#cfSalesRange').value = m.filterSalesRange || '';
    setSel('cfIs1688', m.filterIs1688);
    setSel('cfBrandStatus', m.filterBrandStatus);
    $('#cfNewDaysRange').value = m.filterNewDaysRange || '';
    // 站点多选回填 (旧规则 r.site 单站点兼容; 预设之外的进自定义输入框)
    const siteList = (Array.isArray(m.filterSites) && m.filterSites.length) ? m.filterSites : (r.site ? [r.site] : ['de']);
    const presetSites = SITE_GROUPS.flatMap((g) => g.sites.map((s) => s.value));
    document.querySelectorAll('#cfSitePanel .cfSiteCb').forEach((el) => { el.checked = siteList.includes(el.value); });
    $('#cfCustomSites').value = siteList.filter((s) => !presetSites.includes(s)).join(',');
    // 标签文本回填 (旧规则 filterBadge 单值/filterAplus 兼容)
    let badgeList = (Array.isArray(m.filterBadges) && m.filterBadges.length) ? m.filterBadges : (m.filterBadge ? [m.filterBadge] : []);
    if (!badgeList.length && (m.filterAplus === '1' || m.filterAplus === true)) badgeList = ['A+'];
    $('#cfBadges').value = badgeList.join(',');
    // 类目回填: 英文匹配词 → 反查一级/二级下拉 (不匹配则动态补二级选项)
    const catV = m.filterCategory || '';
    const catNode = CATEGORY_TREE.find((c) => c.value === catV);
    const catSub = CATEGORY_TREE.flatMap((c) => c.children.map((s) => ({ c, s }))).find((x) => x.s.value === catV);
    if (catSub) {
      $('#cfCat1').value = catSub.c.value;
      $('#cfCat1').dispatchEvent(new Event('change'));
      $('#cfCat2').value = catSub.s.value;
    } else if (catNode) {
      $('#cfCat1').value = catNode.value;
      $('#cfCat1').dispatchEvent(new Event('change'));
    } else if (catV) {
      const c2 = $('#cfCat2');
      if (c2 && ![...c2.options].some((o) => o.value === catV)) c2.add(new Option(catV, catV));
      c2.value = catV;
    }
    $('#cfRuleSelect').value = name;
    $('#cfRuleInfo').textContent = `已加载规则「${name}」`;
    updateCfActive();
  };
  fillRuleSelect(ruleList);
  updateCfActive();
  updateCfSiteTrigger();

  $('#cfRuleSave').addEventListener('click', async () => {
    const name = await new Promise((resolve) => {
      showModal({
        title: '💾 保存采集过滤规则',
        body: `<div class="zy-modal-form"><div style="margin-bottom:12px"><div class="muted" style="margin-bottom:4px">规则名称</div><input class="input" id="crName" data-field="crName" placeholder="如: FBA高评分精选" value="FBA筛选${new Date().toLocaleDateString()}"></div><div class="muted">将保存: 站点 ${esc(cfSite().join(','))} + ${esc(coDesc(cfValues()))}</div></div>`,
        buttons: [{ label: '取消', value: 'no' }, { label: '保存', primary: true, value: 'ok', form: true }],
        onResult: (r, inputs) => resolve(r === 'ok' ? (inputs.crName || '').trim() : null),
      });
    });
    if (!name) return;
    const r = await API('/api/collect-rules', { method: 'POST', body: JSON.stringify({ name, site: cfSite()[0] || 'de', filter: cfValues() }) });
    $('#cfRuleInfo').textContent = r.ok ? `✔ 已保存规则「${name}」(${r.total} 条)` : r.error || '保存失败';
    await reloadRules();
  });
  $('#cfRuleLoad').addEventListener('click', async () => {
    const name = $('#cfRuleSelect').value;
    if (!name) { await zyAlert('请先在规则列表选择要加载的规则'); return; }
    const rules = await API('/api/collect-rules');
    loadRuleByName(rules.rules || [], name);
  });
  $('#cfRuleDelete').addEventListener('click', async () => {
    const name = $('#cfRuleSelect').value;
    if (!name) { await zyAlert('请先选择要删除的规则'); return; }
    if (!await zyConfirm(`确定删除规则「${name}」吗?`)) return;
    const r = await API('/api/collect-rules/delete', { method: 'POST', body: JSON.stringify({ name }) });
    $('#cfRuleInfo').textContent = r.ok ? `🗑 已删除「${name}」` : r.error || '删除失败';
    await reloadRules();
  });

  async function reloadRules() {
    const rr = await API('/api/collect-rules');
    fillRuleSelect(rr.rules || []);
  }

  // 采集页统计刷新 (openCollectFlow 完成后调用)
  window.__collectRefresh = async () => {
    try {
      const pp = await API('/api/products');
      const st = content.querySelectorAll('.stat-value')[0];
      if (st) st.textContent = pp.total;
    } catch {}
  };

  // 采集结果日志
  const logCollect = (html) => {
    const card = $('#cfLogCard');
    const log = $('#cfLog');
    if (!card || !log) return;
    card.style.display = 'block';
    log.innerHTML = html;
  };
  window.__collectLog = logCollect;
}

/* ===== 商品详情弹窗 ===== */
// 找货图搜链接: 用商品主图在 1688/淘宝/拼多多/Amazon/Alibaba 以图搜图 (无图时用标题搜索兜底)
function sourceSearchUrls(p) {
  const img = p.mainImage || '';
  const enc = encodeURIComponent(img);
  const kw = encodeURIComponent((p.title || '').slice(0, 40));
  const hostSuf = ({ uk: 'co.uk', us: 'com', jp: 'co.jp', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' }[p.site] || p.site || 'de');
  let alibaba = 'https://www.alibaba.com/trade/search?SearchText=' + kw;
  try { if (img) { const u = new URL(img); alibaba = 'https://www.alibaba.com/picture/search.htm?imageType=' + encodeURIComponent(u.origin + '/') + '&imageAddress=' + encodeURIComponent(u.pathname.replace(/^\//, '')); } } catch {}
  return [
    { name: '淘宝', url: img ? 'https://s.taobao.com/image?imageUrl=' + enc : 'https://s.taobao.com/search?q=' + kw },
    { name: '拼多多', url: 'https://mobile.yangkeduo.com/search_result.html?search_key=' + kw },
    { name: 'Amazon', url: img ? 'https://www.amazon.' + hostSuf + '/stylesnap/search?imageUrl=' + enc : 'https://www.amazon.' + hostSuf + '/s?k=' + kw },
    { name: 'Alibaba', url: alibaba },
  ];
}
// 各站点官方商标局查询 (品牌名自动拼入可直查的官方检索 URL, 欧盟站点额外提供 EUIPO)
function tmOffices(p) {
  const brand = (p.brand || '').trim();
  const kw = encodeURIComponent(brand);
  const kwP = encodeURIComponent(brand).replace(/%20/g, '+');
  const EU_SITES = ['de', 'fr', 'it', 'es', 'nl', 'se', 'pl'];
  const base = {
    de: { name: '德国专利商标局 DPMA', url: `https://register.dpma.de/DPMAregister/marke/partiell?query=${kw}&lang=en`, tip: '德国官方商标数据库' },
    uk: { name: '英国知识产权局 UKIPO', url: 'https://trademarks.ipo.gov.uk/ipo-tmtext', tip: '英国官方商标检索' },
    fr: { name: '法国工业产权局 INPI', url: `https://data.inpi.fr/marques?q=${kw}`, tip: '法国官方商标检索' },
    it: { name: '意大利专利商标局 UIBM', url: 'https://www.uibm.gov.it/bancadati/', tip: '意大利官方商标检索' },
    es: { name: '西班牙专利商标局 OEPM', url: 'https://consultas2.oepm.es/gestor/faces/rest/verPublicaciones.jsp?tipo=Marcas', tip: '西班牙官方商标检索' },
    nl: { name: '比荷卢知识产权局 BOIP', url: 'https://www.boip.int/nl/merken/merkenregister', tip: '荷兰/比利时/卢森堡官方商标检索' },
    se: { name: '瑞典知识产权局 PRV', url: 'https://tc.prv.se/', tip: '瑞典官方商标检索' },
    pl: { name: '波兰专利局 PUP', url: 'https://ewyszukiwarka.pue.uprp.gov.pl/search/simple', tip: '波兰官方商标检索' },
    us: { name: '美国专利商标局 USPTO', url: 'https://tmsearch.uspto.gov/search/search-information', tip: '美国官方商标检索 (TESS)' },
    ca: { name: '加拿大知识产权局 CIPO', url: `https://ised-isde.canada.ca/cipo/trademarks/search/quick?q=${kw}`, tip: '加拿大官方商标检索' },
    mx: { name: '墨西哥工业产权局 IMPI', url: 'https://siga.impi.gob.mx/', tip: '墨西哥官方商标检索' },
    br: { name: '巴西工业产权局 INPI', url: 'https://busca.inpi.gov.br/pePI/jsp/marcas/MarcaSearchBasico.jsp', tip: '巴西官方商标检索' },
    jp: { name: '日本特许厅 JPO', url: 'https://www.j-platpat.inpit.go.jp/', tip: '日本官方商标检索 (J-PlatPat)' },
    au: { name: '澳大利亚知识产权局 IP Australia', url: `https://search.ipaustralia.gov.au/trademarks/search/quick?q=${kw}`, tip: '澳大利亚官方商标检索' },
    in: { name: '印度知识产权局 IP India', url: 'https://iprsearch.ipindia.gov.in/trademarksearch/', tip: '印度官方商标检索' },
    sg: { name: '新加坡知识产权局 IPOS', url: 'https://gobusiness.ipos.gov.sg/trademarksearch/', tip: '新加坡官方商标检索' },
    ae: { name: '阿联酋经济部 MOEC', url: 'https://www.moec.gov.ae/', tip: '阿联酋商标注册与检索' },
    sa: { name: '沙特知识产权局 SAIP', url: 'https://saip.gov.sa/', tip: '沙特官方商标检索' },
  };
  const list = [];
  const o = base[p.site];
  if (o) list.push(o);
  if (EU_SITES.includes(p.site)) list.push({ name: '欧盟知识产权局 EUIPO', url: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/30+30+30+30/${kwP}`, tip: '欧盟官方商标检索 (一次覆盖全部欧盟国家)' });
  return list;
}
async function openProductDetail(asin) {
  const data = await API('/api/products/detail?asin=' + encodeURIComponent(asin));
  if (data.error) { await zyAlert(data.error); return; }
  const p = data;
  const fulfill = p.amazonSell ? '<span class="badge amz">AMZ 自营</span>' : `<span class="badge ${p.fulfill === 'FBA' ? 'fba' : 'fbm'}">${p.fulfill}</span>`;
  // 商品亚马逊链接 (按站点)
  const amzHost = 'www.amazon.' + ({ uk: 'co.uk', us: 'com', jp: 'co.jp', au: 'com.au', mx: 'com.mx', br: 'com.br', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' }[p.site] || p.site || 'de');

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${esc(p.title)}</h2>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        ${p.mainImage ? `<div style="text-align:center;margin-bottom:10px"><img src="${esc(p.mainImage)}" alt="商品主图" title="点击放大" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid #e5e5e5;object-fit:contain;cursor:zoom-in" class="det-main-img"></div>` : ''}
        <div class="toolbar" style="margin-bottom:6px">
          <span class="mono">${esc(p.asin)}</span>
          <a class="btn small" href="${esc('https://' + amzHost + '/dp/' + p.asin)}" target="_blank" rel="noopener" title="在亚马逊打开商品">⧉ 亚马逊链接</a>
          ${p.brandStatus === 'registered' ? '<span class="badge danger">已备案</span>' : p.brandStatus === 'unchecked' ? '<span class="badge medium">未核查</span>' : '<span class="badge low">未查到</span>'}
          ${p.bgMark ? '<span class="badge danger">BG标</span>' : ''}
          ${p.tmMark ? '<span class="badge medium">TM标</span>' : ''}
          ${p.patentRisk ? '<span class="badge danger">专利风险</span>' : ''}
          ${fulfill}
        </div>
        <div class="detail-grid">
          <div class="detail-item"><span class="k">品牌</span><span class="v"><b>${esc(p.brand)}</b></span></div>
          <div class="detail-item"><span class="k">商标记录</span><span class="v">${p.trademarkCount} 条${p.tmText ? ` <span class="muted" title="插件商标状态原文">(${esc(p.tmText)})</span>` : ''}</span></div>
          ${p.tmCountries && p.tmCountries.length ? `<div class="detail-item" style="flex-direction:column;align-items:flex-start;border-bottom:none">
            <span class="k">商标注册国家 (${p.tmCountries.length})</span>
            <span class="v" style="text-align:left;width:100%">
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${p.tmCountries.map((c) => `<span class="tm-country-chip">${esc(c)}</span>`).join('')}</div>
              <div class="muted" style="font-size:11px;margin-top:5px">商标已在如下国家注册</div>
            </span>
          </div>` : ''}
          <div class="detail-item"><span class="k">榜单排名</span><span class="v">${esc(p.rank || '-')}</span></div>
          <div class="detail-item"><span class="k">类目</span><span class="v">${esc(p.category || '-')}</span></div>
          <div class="detail-item"><span class="k">站点</span><span class="v">${esc(p.site || '-')}</span></div>
          <div class="detail-item"><span class="k">当前价格(最低跟卖)</span><span class="v"><b>${fmtMoney(p.minPrice != null ? p.minPrice : p.price, p.currency)}</b></span></div>
          ${p.buyBoxPrice != null && p.buyBoxPrice !== (p.minPrice != null ? p.minPrice : p.price) ? `<div class="detail-item"><span class="k">BuyBox 价</span><span class="v">${fmtMoney(p.buyBoxPrice, p.currency)}</span></div>` : ''}
          ${p.offerPrices && p.offerPrices.length ? `<div class="detail-item" style="flex-direction:column;align-items:flex-start;border-bottom:none">
            <span class="k">全部跟卖 (${p.offerPrices.length}个):</span>
            <span class="v" style="text-align:left;width:100%">
              ${p.offerPrices.map((o) => `<div style="padding:3px 0;border-bottom:1px dashed var(--line);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <span><b>${fmtMoney(o.price, p.currency)}</b>${o.seller ? ` · ${o.sellerUrl ? `<a class="seller-link" href="${esc(o.sellerUrl)}" target="_blank" rel="noopener" title="点击跳转卖家店铺">${esc(o.seller)}</a>` : esc(o.seller)}` : ''}</span>
                <span class="muted" style="white-space:nowrap">${o.shipFee != null ? `运费${fmtMoney(o.shipFee, p.currency)}` : '免运费'}${o.shipDates ? ` · ${esc(o.shipDates)}` : ''}</span>
              </div>`).join('')}
            </span>
          </div>` : ''}
          <div class="detail-item"><span class="k">月销量</span><span class="v">${fmtNum(p.monthlySales)}</span></div>
          <div class="detail-item"><span class="k">评分 / 评论</span><span class="v">${p.rating ? p.rating + '★' : '-'} / ${fmtNum(p.reviews)}</span></div>
          <div class="detail-item"><span class="k">库存</span><span class="v">${fmtNum(p.stock)}</span></div>
          <div class="detail-item"><span class="k">跟卖数量</span><span class="v">${p.followCount} 个</span></div>
          <div class="detail-item"><span class="k">中国卖家</span><span class="v">${p.chinaSeller ? '是' : '否'}</span></div>
          <div class="detail-item"><span class="k">上架时间</span><span class="v">${esc(p.listedAt || '-')}</span></div>
          ${p.variants && p.variants.length ? `<div class="detail-item" style="flex-direction:column;align-items:flex-start;border-bottom:none">
            <span class="k">型号/颜色变体 (${p.variations} 个, 按变体分类价格):</span>
            <span class="v" style="text-align:left;width:100%">
              ${p.variants.map((g) => `
                <div style="margin:4px 0 2px"><b>${esc(g.dim)}</b></div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">
                  ${g.options.map((o) => `<button class="btn small variant-chip ${o.selected ? 'primary' : ''}" data-vasin="${esc(o.asin)}" title="查看该变体: ${esc(o.asin)}">${esc(o.text)}${o.price != null ? ' <span class="chip-price">' + fmtMoney(o.price, p.currency) + '</span>' : ''}</button>`).join('')}
                </div>`).join('')}
              <div class="muted" style="font-size:11px">点击变体查看对应商品 · 价格为该变体 BuyBox 价</div>
            </span>
          </div>` : ''}
          <div class="detail-item"><span class="k">变体数</span><span class="v">${p.variations ?? '-'}</span></div>
          <div class="detail-item"><span class="k">重量</span><span class="v">${esc(p.weight || '-')}</span></div>
          <div class="detail-item"><span class="k">尺寸</span><span class="v">${esc(p.size || '-')}</span></div>
          <div class="detail-item"><span class="k">佣金</span><span class="v">${fmtMoney(p.referralFee, p.currency)}</span></div>
          <div class="detail-item"><span class="k">净收益(估)</span><span class="v">${fmtMoney(p.netProfit, p.currency)}</span></div>
          ${p.fbaFee != null ? `<div class="detail-item"><span class="k">FBA 配送费</span><span class="v">${fmtMoney(p.fbaFee, p.currency)}</span></div>` : ''}
          ${p.sellingPoint && p.sellingPoint.length ? `<div class="detail-item" style="flex-direction:column;align-items:flex-start;border-bottom:none">
            <span class="k">产品卖点 (${p.sellingPoint.length})</span>
            <span class="v" style="text-align:left;width:100%"><ul class="source-list" style="margin-top:2px">${p.sellingPoint.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></span>
          </div>` : ''}
          ${p.productOverview && p.productOverview.length ? `<div class="detail-item" style="flex-direction:column;align-items:flex-start;border-bottom:none">
            <span class="k">产品概要 (${p.productOverview.length} 项)</span>
            <span class="v" style="text-align:left;width:100%"><table class="ov-table"><tbody>${p.productOverview.map((o) => `<tr><td class="ov-k">${esc(o.k)}</td><td>${esc(o.v)}</td></tr>`).join('')}</tbody></table></span>
          </div>` : ''}
          ${p.packSize ? `<div class="detail-item"><span class="k">包装尺寸</span><span class="v">${esc(p.packSize)}</span></div>` : ''}
          ${p.packWeight ? `<div class="detail-item"><span class="k">包装重量</span><span class="v">${esc(p.packWeight)}</span></div>` : ''}
          ${p.mainSeller ? `<div class="detail-item"><span class="k">当前主卖家</span><span class="v">${esc(p.mainSeller)}</span></div>` : ''}
          ${p.productType ? `<div class="detail-item"><span class="k">产品类型</span><span class="v">${esc(p.productType)}</span></div>` : ''}
          ${p.shopSeller ? `<div class="detail-item"><span class="k">来源店铺</span><span class="v">${p.shopUrl ? `<a class="seller-link" href="${esc(p.shopUrl)}" target="_blank" rel="noopener" title="打开来源店铺">${esc(p.shopSeller)}</a>` : esc(p.shopSeller)}</span></div>` : ''}
          ${p.sellerPageUrl ? `<div class="detail-item"><span class="k">卖家资料页</span><span class="v"><a class="seller-link" href="${esc(p.sellerPageUrl)}" target="_blank" rel="noopener" title="打开卖家资料页">查看卖家页</a></span></div>` : ''}
          ${p.is1688Url ? `<div class="detail-item"><span class="k">1688 同款</span><span class="v"><a class="seller-link" href="${esc(p.is1688Url)}" target="_blank" rel="noopener" title="打开 1688 同款商品">打开 1688 同款</a></span></div>` : ''}
          <div class="detail-item"><span class="k">采集时间</span><span class="v">${esc(p.collectedAt || '-')}</span></div>
        </div>
        <!-- 利润测算: 站点/汇率/重量尺寸/货源成本/物流成本 → 利润与利润率 -->
        <div class="card" style="margin-top:10px;background:var(--card-bg)">
          <div class="card-title">${ic('reprice', 14)} 利润测算 <span class="muted" style="font-weight:400;font-size:12px">(售价×汇率 − 货源成本 − 物流成本 − 佣金)</span>
            <button id="dlProfitOneClick" class="btn small primary" style="margin-left:auto" title="自动获取汇率+重量尺寸+货源成本, 并自动试算物流成本后计算利润">一键计算</button>
            <button id="dlProfitCalc" class="btn small" title="按当前填写值重新计算">手动计算</button>
          </div>
          <div class="filter-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
            <div class="filter-item"><label>站点</label><div class="v" id="dlProfitSite" style="font-weight:600"></div></div>
            <div class="filter-item"><label>汇率 (1${esc(p.currency || '')}=? CNY)</label><div class="v" id="dlProfitRate" style="font-weight:600"></div></div>
            <div class="filter-item"><label>重量 (kg, 可改)</label><input id="dlProfitWeight" class="input" type="number" step="0.01" value=""></div>
            <div class="filter-item"><label>尺寸 (cm, 长×宽×高)</label><input id="dlProfitDims" class="input" placeholder="如 20x15x10"></div>
            <div class="filter-item"><label>货源成本 (¥, 采购价)</label><input id="dlProfitSupply" class="input" type="number" step="0.01" placeholder="1688 采购价 ¥"></div>
            <div class="filter-item"><label>物流成本 (¥, 可手动填或自动试算)</label><input id="dlProfitLogi" class="input" type="number" step="0.01" placeholder="云途运费 ¥"></div>
          </div>
          <div id="dlProfitStatus" class="muted" style="font-size:11px;margin-top:6px"></div>
          <div id="dlProfitResult" style="margin-top:8px;font-size:13px"></div>
          <div class="muted" style="font-size:11px;margin-top:4px">「一键计算」自动获取汇率 + 重量尺寸 + 货源成本, 并自动试算云途物流最低价 (约 30 秒); 也可手动填写后点「手动计算」。售价取最低跟卖价 ${esc(p.currency || '')}</div>
        </div>
        <div class="toolbar">
          <button id="dlClaim" class="btn primary">认领到草稿箱</button>
          <a id="dlAmazon" class="btn" href="${esc('https://' + amzHost + '/dp/' + p.asin)}" target="_blank" rel="noopener" title="在亚马逊打开该商品">打开亚马逊商品</a>
          <div class="tm-wrap" style="position:relative;display:inline-block">
            <button class="btn small tm-btn" id="dlTmBtn" title="在官方商标局查询该品牌是否已注册商标, 避免侵权">查商标 ▾</button>
            <div class="tm-panel" id="dlTmPanel" style="display:none">
              <div class="tm-panel-head">品牌 <b>${esc(p.brand || '-')}</b> 官方商标查询${p.tmMark ? ' <span class="badge medium">TM标</span>' : ''}${p.bgMark ? ' <span class="badge danger">BG标</span>' : ''}${p.trademarkCount ? ` <span class="badge low">已记录 ${p.trademarkCount} 条</span>` : ''}</div>
              <div class="muted" style="font-size:11px;padding:2px 12px 6px">打开对应国家/地区官方商标局, 查询品牌是否已被注册 (点击新窗口打开):</div>
              ${tmOffices(p).map((o) => `<a class="tm-link" href="${esc(o.url)}" target="_blank" rel="noopener" title="${esc(o.tip)}">${esc(o.name)}</a>`).join('')}
              <div class="tm-panel-foot muted">查询到已注册商标 = 侵权风险, 请谨慎使用该品牌</div>
            </div>
          </div>
          <span style="flex:1"></span>
          <span class="muted" style="font-size:12px;align-self:center">找货:</span>
          <button class="btn small primary src-btn" id="dl1688Find" title="点击后自动上传商品主图到 1688 以图搜图, 抓取同款货源并显示下方 (需已登录 1688)">1688 找货</button>
          ${sourceSearchUrls(p).map((s) => `<a class="btn small src-btn" href="${esc(s.url)}" target="_blank" rel="noopener" title="在${s.name}以图搜图找货源">${esc(s.name)}</a>`).join('')}
          <button class="btn small" id="dlLogistics" title="按商品重量/尺寸 + 站点自动试算云途等物流渠道运费 (免费, 打开云途官网试算)">运费试算</button>
          <button id="dlClose" class="btn">关闭</button>
          <span class="muted" id="dlMsg"></span>
        </div>
        <!-- 货源区: 记录 1688/淘宝/拼多多 货源链接 → 抓取信息 → 价格对比 -->
        <div class="goods-box">
          <div class="goods-head">${ic('search', 13)} 货源记录 <span class="muted" style="font-weight:400;font-size:12px">(1688 找货 / 粘贴链接 → 抓取 → 与主商品价格对比)</span></div>
          <div id="dl1688Results" class="goods-1688" style="display:none"></div>
          <div class="goods-add">
            <select id="dlGoodsPlatform" class="select" style="width:90px"><option>1688</option><option>淘宝</option><option>拼多多</option><option>Amazon</option><option>Alibaba</option><option>其他</option></select>
            <input id="dlGoodsUrl" class="input" placeholder="粘贴 1688/淘宝/拼多多 商品链接…" style="flex:1;min-width:180px">
            <button id="dlGoodsFetch" class="btn small" title="打开链接抓取标题/价格">抓取</button>
            <button id="dlGoodsAdd" class="btn small primary">添加</button>
          </div>
          <div id="dlGoodsList" class="goods-list"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(mask);
  mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
  // 变体芯片点击 → 打开对应变体 ASIN (库内有则弹详情, 无则跳亚马逊)
  mask.addEventListener('click', (e) => {
    const chip = e.target.closest('.variant-chip');
    if (chip && chip.dataset.vasin) {
      const vasin = chip.dataset.vasin;
      mask.remove();
      API('/api/products/detail?asin=' + encodeURIComponent(vasin)).then((d) => {
        if (d && !d.error) openProductDetail(vasin);
        else window.open('https://www.amazon.de/dp/' + vasin, '_blank', 'noopener');
      });
    }
  });
  $('#dlClose', mask).addEventListener('click', () => mask.remove());
  $('.modal-close', mask).addEventListener('click', () => mask.remove());
  // 查商标下拉: 点击切换, 点击外部关闭
  const tmBtn = $('#dlTmBtn', mask), tmPanel = $('#dlTmPanel', mask);
  tmBtn.addEventListener('click', (e) => { e.stopPropagation(); tmPanel.style.display = tmPanel.style.display === 'block' ? 'none' : 'block'; });
  mask.addEventListener('click', (e) => { if (!e.target.closest('.tm-wrap')) tmPanel.style.display = 'none'; });
  // 详情主图点击 → 大图灯箱
  const detImg = $('.det-main-img', mask);
  if (detImg) detImg.addEventListener('click', () => openImageLightbox(detImg.src, p.title));
  $('#dlClaim', mask).addEventListener('click', async () => {
    const r = await API('/api/claims', { method: 'POST', body: JSON.stringify({ asin }) });
    $('#dlMsg', mask).textContent = r.error ? `⚠ ${r.error}` : `✔ 已认领 (${r.sku})`;
  });
  // ===== 货源管理: 渲染列表 + 抓取 + 添加 =====
  const renderGoods = (goods) => {
    const box = $('#dlGoodsList', mask);
    const mainPrice = p.minPrice != null ? p.minPrice : p.price;
    if (!goods || !goods.length) { box.innerHTML = '<div class="muted" style="font-size:12px;padding:4px 0">暂无货源记录 — 用上方「找货」跳转平台图搜, 选中货源后把链接粘贴回来即可对比。</div>'; return; }
    box.innerHTML = goods.map((g, i) => {
      const gp = parseFloat(String(g.price || '').replace(/[^0-9.]/g, ''));
      let diff = '';
      if (gp != null && mainPrice != null) {
        const d = ((mainPrice - gp) / mainPrice * 100).toFixed(1);
        diff = `<span class="badge ${d > 15 ? 'newrelease' : d > 0 ? 'medium' : 'danger'}" title="与主商品价差">主商品${d > 0 ? '贵' : '便宜'} ${Math.abs(d)}%</span>`;
      }
      return `<div class="goods-item">
        <span class="pill">${esc(g.platform || '其他')}</span>
        <span class="g-title" title="${esc(g.title || '')}">${esc((g.title || g.url || '').slice(0, 46))}</span>
        <b class="g-price">${esc(g.price || '')}</b>
        ${diff}
        ${g.url ? `<a class="btn small" href="${esc(g.url)}" target="_blank" rel="noopener" title="打开货源">打开</a>` : ''}
        <button class="btn small goods-del" data-i="${i}" title="删除货源">✕</button>
      </div>`;
    }).join('');
    box.querySelectorAll('.goods-del').forEach((b) => b.addEventListener('click', async () => {
      const list = (p.sourceGoods || []).slice();
      list.splice(parseInt(b.dataset.i, 10), 1);
      await API('/api/products/goods', { method: 'POST', body: JSON.stringify({ asin, goods: list }) });
      p.sourceGoods = list; renderGoods(list);
    }));
  };
  renderGoods(p.sourceGoods);
  // ===== 1688 找货: 主图图搜 → 抓取同款货源列表 → 一键添加 =====
  $('#dl1688Find', mask).addEventListener('click', async () => {
    const btn = $('#dl1688Find', mask);
    const box = $('#dl1688Results', mask);
    btn.textContent = '1688 找货中…'; btn.disabled = true;
    box.style.display = 'block';
    box.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0">正在 1688 以图搜图 (约 20 秒)…</div>';
    try {
      const r = await API('/api/products/1688-search-upload', { method: 'POST', body: JSON.stringify({ asin }) });
      if (!r.ok || !r.items || !r.items.length) {
        box.innerHTML = `<div class="muted" style="font-size:12px;padding:6px 0">${esc((r && r.error) || '未找到同款货源 (可检查 1688 登录状态)')}</div>`;
        btn.textContent = '1688 找货'; btn.disabled = false;
        return;
      }
      box.innerHTML = `<div class="g1688-head">1688 同款货源 (${r.count} 个):</div>` + r.items.map((g, i) => {
        const gp = parseFloat(String(g.price || '').replace(/[^0-9.]/g, ''));
        const mainPrice = p.minPrice != null ? p.minPrice : p.price;
        let diff = '';
        if (gp != null && mainPrice != null) {
          const d = ((mainPrice - gp) / mainPrice * 100).toFixed(1);
          diff = `<span class="badge ${d > 15 ? 'newrelease' : d > 0 ? 'medium' : 'danger'}" title="与主商品价差">主商品${d > 0 ? '贵' : '便宜'} ${Math.abs(d)}%</span>`;
        }
        return `<div class="goods-item">
          ${g.img ? `<img src="${esc(g.img)}" class="g-img" alt="">` : ''}
          <span class="g-title" title="${esc(g.title)}">${esc((g.title || '').slice(0, 40))}</span>
          <b class="g-price">${esc(g.priceRaw || g.price || '')}</b>
          ${diff}
          <button class="btn small goods-add1688" data-i="${i}" title="添加此货源到记录">添加</button>
        </div>`;
      }).join('');
      box.querySelectorAll('.goods-add1688').forEach((b) => b.addEventListener('click', async () => {
        const g = r.items[parseInt(b.dataset.i, 10)];
        const list = (p.sourceGoods || []).slice();
        list.push({ platform: '1688', url: g.url, title: g.title, price: g.priceRaw || g.price, addedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
        const rr = await API('/api/products/goods', { method: 'POST', body: JSON.stringify({ asin, goods: list }) });
        if (rr.ok) { p.sourceGoods = list; renderGoods(list); b.textContent = '✓ 已添加'; b.disabled = true; $('#dlMsg', mask).textContent = `✔ 已添加 1688 货源 (共 ${list.length} 条)`; }
      }));
    } catch (e) {
      box.innerHTML = `<div class="muted" style="font-size:12px;padding:6px 0">✗ ${esc(e && e.message || e)}</div>`;
    }
    btn.textContent = '1688 找货'; btn.disabled = false;
  });
  // ===== 运费试算: 按商品重量/尺寸 + 站点 自动试算云途各渠道运费 =====
  $('#dlLogistics', mask).addEventListener('click', async () => {
    const btn = $('#dlLogistics', mask);
    // 从商品数据解析重量 (g → kg) 和尺寸
    const parseNum = (s) => { const m = String(s || '').match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
    const weightG = parseNum(p.weight) || parseNum(p.packWeight) || 0;   // 克
    const dims = (p.size || p.packSize || '').match(/[\d.]+/g) || [];
    const country = ({ uk: 'GB', de: 'DE', us: 'US', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', jp: 'JP', ca: 'CA', in: 'IN', au: 'AU' }[p.site] || 'GB');
    const weightKg = weightG > 0 ? weightG / 1000 : 1;
    const len = dims[0] ? parseFloat(dims[0]) : 0;
    const wid = dims[1] ? parseFloat(dims[1]) : 0;
    const hgt = dims[2] ? parseFloat(dims[2]) : 0;
    // 弹出参数确认 + 结果面板 (用 zyPromptForm 拿可调参数)
    const f = await zyPromptForm('📦 物流运费试算 (云途官网, 免费)', [
      { field: 'weight', label: `重量 (kg)${weightG ? `, 商品 ${weightG}g=${(weightG/1000).toFixed(2)}kg` : ', 商品无重量数据, 请填写'}`, type: 'number', default: String(weightKg) },
      { field: 'len', label: '长 (cm, 可留空)', type: 'number', default: len ? String(len) : '' },
      { field: 'wid', label: '宽 (cm, 可留空)', type: 'number', default: wid ? String(wid) : '' },
      { field: 'hgt', label: '高 (cm, 可留空)', type: 'number', default: hgt ? String(hgt) : '' },
      { field: 'country', label: '目的国 (ISO2 代码)', default: country },
      { field: 'battery', label: '带电商品', type: 'select', options: [{ value: '0', label: '否 (普货)' }, { value: '1', label: '是 (带电)' }], default: '0' },
    ], { hint: `自动打开云途官网价格试算 (需能访问 yunexpress.cn), 约 25 秒。商品站点 ${p.site} → ${country}, 重量 ${weightKg}kg${len ? `, 尺寸 ${len}x${wid}x${hgt}cm` : ''}` });
    if (!f) return;
    btn.textContent = '运费试算中…'; btn.disabled = true;
    try {
      const r = await API('/api/logistics/quote', { method: 'POST', body: JSON.stringify({ originCity: '深圳市', country: f.country, weightKg: parseFloat(f.weight) || 1, lengthCm: parseFloat(f.len) || 0, widthCm: parseFloat(f.wid) || 0, heightCm: parseFloat(f.hgt) || 0, battery: f.battery === '1' }) });
      if (!r.ok || !r.quotes || !r.quotes.length) {
        await zyAlert('⚠️ 未获取到报价', (r && r.error) || '云途试算无结果 (可稍后重试)');
        return;
      }
      const rows = r.quotes.map((q) => `<tr>
        <td>${esc(q.channel)}</td><td>${esc(q.type)}</td><td>${esc(q.parcel)}</td>
        <td>${esc(q.eta)}</td><td><b>¥${q.total}</b></td>
        <td class="muted" style="font-size:11px">运费¥${q.freight}${q.registrationFee ? '+挂号¥' + q.registrationFee : ''}</td>
      </tr>`).join('');
      await zyAlert('✅ 运费试算结果', `
        <div class="muted" style="margin-bottom:6px">${esc(r.originCity)} → ${esc(r.country)} · ${r.weightKg}kg${r.lengthCm ? ` · ${r.lengthCm}x${r.widthCm}x${r.heightCm}cm` : ''} · ${r.battery ? '带电' : '普货'} · 共 ${r.quotes.length} 个渠道</div>
        <table class="ov-table" style="width:100%"><thead><tr><th>渠道</th><th>类型</th><th>包裹</th><th>时效</th><th>总费用</th><th>明细</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="muted" style="font-size:11px;margin-top:6px">${esc(r.note)} · 数据来自云途官网实时试算</div>`);
      // 联动: 自动把最低物流成本填入利润测算并重算
      const best = r.quotes.filter((q) => q.total != null).sort((a, b) => a.total - b.total)[0];
      if (best) {
        window.__lastQuote = { min: best.total, channel: best.channel };
        const lgLogi = $('#dlProfitLogi', mask);
        if (lgLogi) { lgLogi.value = best.total; lgLogi.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    } catch (e) {
      await zyAlert('❌ 运费试算失败', (e && e.message) || '请确认云途官网可访问');
    }
    btn.textContent = '运费试算'; btn.disabled = false;
  });
  // ===== 利润测算: 站点/汇率/重量尺寸/货源成本/物流成本 → 利润与利润率 =====
  (async () => {
    const siteTxt = ({ uk: '英国', de: '德国', us: '美国', fr: '法国', it: '意大利', es: '西班牙', nl: '荷兰', jp: '日本', ca: '加拿大', in: '印度', au: '澳大利亚', mx: '墨西哥', br: '巴西', sg: '新加坡', ae: '阿联酋', sa: '沙特' }[p.site] || p.site || '-');
    $('#dlProfitSite', mask).textContent = `${siteTxt} (${esc(p.site)}) · ${esc(p.currency || '')}`;
    // 汇率
    const rates = await API('/api/rates').catch(() => ({}));
    const cur = p.currency || 'EUR';
    const rate = (rates.rates && rates.rates[cur]) || 0;
    $('#dlProfitRate', mask).textContent = rate ? `${rate} (${esc(rates.date || '')})` : '未获取到';
    if (rate) $('#dlProfitRate', mask).dataset.rate = rate;
    // 重量/尺寸预填 (从商品数据解析)
    const parseKg = (s) => { const m = String(s || '').match(/[\d.]+/); if (!m) return 0; const g = parseFloat(m[0]); return String(s).toLowerCase().includes('pound') ? +(g * 0.4536).toFixed(3) : (String(s).toLowerCase().includes('g') && !/kg/.test(s.toLowerCase()) ? +(g / 1000).toFixed(3) : g); };
    const wKg = parseKg(p.weight) || parseKg(p.packWeight) || 0;
    $('#dlProfitWeight', mask).value = wKg || '';
    const dims = (p.size || p.packSize || '').match(/[\d.]+/g) || [];
    if (dims.length >= 3) $('#dlProfitDims', mask).value = `${dims[0]}x${dims[1]}x${dims[2]}`;
    // 货源成本 (取 sourceGoods 第一个有价格的)
    const g0 = (p.sourceGoods || []).find((g) => g && g.price);
    if (g0) { const gp = parseFloat(String(g0.price).replace(/[^0-9.]/g, '')); if (gp > 0) $('#dlProfitSupply', mask).value = gp; }
    // 计算逻辑
    const doCalc = (extra) => {
      const rate2 = parseFloat($('#dlProfitRate', mask).dataset.rate) || 0;
      const sellPrice = p.minPrice != null ? p.minPrice : p.price;
      const sellCny = sellPrice * rate2;
      const supply = parseFloat($('#dlProfitSupply', mask).value) || 0;
      const logi = parseFloat($('#dlProfitLogi', mask).value) || 0;
      const totalCost = supply + logi;
      const commission = sellPrice * (p.referralFee != null && p.price > 0 ? (p.referralFee / p.price) : 0.15) * rate2; // 佣金按售价比例换算
      const profit = sellCny - totalCost - commission;
      const margin = sellCny > 0 ? (profit / sellCny * 100) : 0;
      const color = profit >= 0 ? 'var(--green)' : 'var(--red)';
      const logiChannel = extra && extra.channel ? `<span class="muted" style="font-size:11px">(${esc(extra.channel.slice(0, 20))})</span>` : '';
      $('#dlProfitResult', mask).innerHTML = `
        <table class="ov-table" style="width:100%">
          <tbody>
            <tr><td class="ov-k">售价 (${esc(p.currency)})</td><td>${fmtMoney(sellPrice, p.currency)}</td><td class="ov-k">售价 (¥)</td><td>¥${sellCny.toFixed(2)}</td></tr>
            <tr><td class="ov-k">货源成本 (¥)</td><td>¥${supply.toFixed(2)}</td><td class="ov-k">物流成本 (¥) ${logiChannel}</td><td>¥${logi.toFixed(2)}</td></tr>
            <tr><td class="ov-k">总成本 (¥)</td><td colspan="3"><b>¥${totalCost.toFixed(2)}</b> (货源+物流)</td></tr>
            <tr><td class="ov-k">佣金 (¥)</td><td>¥${commission.toFixed(2)}</td><td class="ov-k">净利 (¥)</td><td style="color:${color};font-weight:700">¥${profit.toFixed(2)}</td></tr>
            <tr><td class="ov-k">利润率</td><td colspan="3" style="color:${color};font-weight:700">${margin.toFixed(1)}%</td></tr>
          </tbody>
        </table>`;
    };
    $('#dlProfitCalc', mask).addEventListener('click', () => doCalc());
    // 一键计算: 自动获取汇率(已有) + 重量尺寸(已有) + 货源成本(已有) + 自动试算物流 → 计算
    $('#dlProfitOneClick', mask).addEventListener('click', async () => {
      const btn = $('#dlProfitOneClick', mask);
      const status = $('#dlProfitStatus', mask);
      btn.disabled = true;
      try {
        // 1. 确保汇率 (未获取到时重新拉)
        if (!parseFloat($('#dlProfitRate', mask).dataset.rate)) {
          status.textContent = '正在获取汇率…';
          const rates2 = await API('/api/rates').catch(() => ({}));
          const rate2 = (rates2.rates && rates2.rates[cur]) || 0;
          if (rate2) { $('#dlProfitRate', mask).dataset.rate = rate2; $('#dlProfitRate', mask).textContent = `${rate2} (${esc(rates2.date || '')})`; }
        }
        // 2. 重量/尺寸 (优先输入框, 空则商品数据)
        let wKg2 = parseFloat($('#dlProfitWeight', mask).value) || wKg || 1;
        if (!wKg2) wKg2 = 1;
        const dimsStr = $('#dlProfitDims', mask).value || '';
        const d2 = dimsStr.match(/[\d.]+/g) || [];
        const len = d2[0] ? parseFloat(d2[0]) : 0;
        const wid = d2[1] ? parseFloat(d2[1]) : 0;
        const hgt = d2[2] ? parseFloat(d2[2]) : 0;
        // 3. 货源成本 (空则提示)
        if (!parseFloat($('#dlProfitSupply', mask).value)) {
          status.textContent = '⚠ 未填写货源成本, 请在"货源成本"输入 1688 采购价 (¥)';
        }
        // 4. 自动算物流: 优先本地报价表 (稳定实时), 报价表无该国则尝试云途 CDP
        const country = ({ uk: 'GB', de: 'DE', us: 'US', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', jp: 'JP', ca: 'CA', in: 'IN', au: 'AU' }[p.site] || 'GB');
        let best = null, source = '';
        status.textContent = '正在用报价表计算物流成本…';
        const rt = await API('/api/logistics/rates?country=' + country + '&weight=' + wKg2).catch(() => ({}));
        if (rt && rt.quotes && rt.quotes.length) {
          best = rt.quotes.filter((x) => x.total != null).sort((a, b) => a.total - b.total)[0];
          source = '报价表';
          if (best) {
            $('#dlProfitLogi', mask).value = best.total;
            status.textContent = `✔ 物流成本 (${esc(source)}, 更新于 ${esc(rt.updatedAt || '-')}): ${esc(best.channel.slice(0, 22))} ¥${best.total} (${esc(best.eta)})`;
            doCalc({ channel: best.channel });
          }
        }
        if (!best) {
          // 报价表无数据 → 尝试云途 CDP (约 30 秒)
          status.textContent = '报价表无该国数据, 正在尝试云途官网试算 (约 30 秒)…';
          const q = await API('/api/logistics/quote', { method: 'POST', body: JSON.stringify({ originCity: '深圳市', country, weightKg: wKg2, lengthCm: len, widthCm: wid, heightCm: hgt, battery: false }) }).catch(() => ({}));
          best = q && q.quotes && q.quotes.length ? q.quotes.filter((x) => x.total != null).sort((a, b) => a.total - b.total)[0] : null;
          if (best) {
            $('#dlProfitLogi', mask).value = best.total;
            status.textContent = `✔ 物流自动试算: ${esc(best.channel.slice(0, 24))} ¥${best.total} (${esc(best.eta)})`;
            doCalc({ channel: best.channel });
          } else {
            status.textContent = (q && q.error) ? `⚠ 物流试算失败: ${esc(q.error)} — 可手动填物流成本后点"手动计算"` : '⚠ 物流成本无来源 (报价表无该国 + 云途试算无结果) — 可手动填后点"手动计算"';
            doCalc();
          }
        }
      } catch (e) {
        status.textContent = '⚠ 一键计算失败: ' + esc((e && e.message) || e) + ' — 可手动填写后点"手动计算"';
        doCalc();
      } finally {
        btn.disabled = false;
      }
    });
    $('#dlProfitSupply', mask).addEventListener('input', () => doCalc());
    $('#dlProfitLogi', mask).addEventListener('input', () => doCalc());
    // 初始计算一次 (若重量/货源有值)
    if (rate && (wKg || g0)) doCalc();
    // 暴露给运费试算 handler: 试算成功后自动填入最低物流成本
    window.__lastQuote = null;
  })();
  $('#dlGoodsFetch', mask).addEventListener('click', async () => {
    const url = $('#dlGoodsUrl', mask).value.trim();
    const btn = $('#dlGoodsFetch', mask);
    if (!url) { $('#dlGoodsUrl', mask).focus(); return; }
    btn.textContent = '抓取中…'; btn.disabled = true;
    try {
      const r = await API('/api/products/goods/fetch', { method: 'POST', body: JSON.stringify({ url }) });
      $('#dlMsg', mask).textContent = r.title ? `✔ 抓到: ${r.title.slice(0, 40)}${r.price ? ' · ' + r.price : ''}` : '⚠ 未抓到信息, 可手动填写';
      $('#dlGoodsUrl', mask).dataset.title = r.title || '';
      $('#dlGoodsUrl', mask).dataset.price = r.price || '';
    } catch (e) { $('#dlMsg', mask).textContent = '✗ ' + (e && e.message || e); }
    btn.textContent = '抓取'; btn.disabled = false;
  });
  $('#dlGoodsAdd', mask).addEventListener('click', async () => {
    const url = $('#dlGoodsUrl', mask).value.trim();
    if (!url) { $('#dlGoodsUrl', mask).focus(); return; }
    const platform = $('#dlGoodsPlatform', mask).value;
    const title = $('#dlGoodsUrl', mask).dataset.title || '';
    const price = $('#dlGoodsUrl', mask).dataset.price || '';
    const list = (p.sourceGoods || []).slice();
    list.push({ platform, url, title, price, addedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    const r = await API('/api/products/goods', { method: 'POST', body: JSON.stringify({ asin, goods: list }) });
    if (r.ok) { p.sourceGoods = list; renderGoods(list); $('#dlGoodsUrl', mask).value = ''; delete $('#dlGoodsUrl', mask).dataset.title; delete $('#dlGoodsUrl', mask).dataset.price; $('#dlMsg', mask).textContent = `✔ 已添加货源 (共 ${list.length} 条)`; }
    else $('#dlMsg', mask).textContent = '✗ ' + (r.error || '添加失败');
  });
}

/* ===== 合规检测 ===== */
let complianceProduct = null;
async function renderCompliance() {
  const content = $('#content');
  const prod = await API('/api/products');
  const branddb = await API('/api/branddb');
  content.innerHTML = `
    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-title"> RAG 合规检测</div>
          <div class="card-sub">品牌数据库 ${branddb.total} 条 · 专利库 · 平台规则库 → 混合检索 → 风险结论(带引用)</div>
          <div class="toolbar">
            <select id="compAsin" class="select" style="flex:1"></select>
            <button id="compCheck" class="btn primary">🔍 开始检测</button>
          </div>
          <div id="compResult" class="section-gap"></div>
        </div>
        <div class="card section-gap">
          <div class="card-title"> 人工纠错 → 飞轮沉淀</div>
          <div class="card-sub">同一商品同一结论累计纠错 ≥3 次, 自动沉淀规则到「合规规则库」, 下次检测自动带出</div>
          <div class="toolbar">
            <button id="corrRegistered" class="btn">此商品实为「已备案」</button>
            <button id="corrNot" class="btn">此商品实为「未备案」</button>
            <span class="muted" id="corrMsg"></span>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title"> 品牌数据库</div>
          <div class="card-sub">每日自动更新 + 人工纠正回流</div>
          <div style="max-height:520px;overflow-y:auto"><table style="min-width:640px">
            <thead><tr><th>品牌</th><th>状态</th><th>BG标</th><th>TM标</th><th>专利</th><th>商标数</th><th>备注</th></tr></thead>
            <tbody>${branddb.items.map((b) => `<tr>
              <td><b>${esc(b.name)}</b></td>
              <td>${b.status === 'registered' ? '<span class="badge danger">已备案</span>' : b.status === 'unchecked' ? '<span class="badge medium">未核查</span>' : '<span class="badge low">未查到</span>'}</td>
              <td>${b.bg ? '✓' : '—'}</td><td>${b.tm ? '✓' : '—'}</td><td>${b.patent ? '<span class="badge danger">有</span>' : '—'}</td>
              <td>${b.trademarkCount || 0}</td><td class="muted" style="max-width:200px">${esc(b.note || '')}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  `;
  const sel = $('#compAsin');
  prod.items.forEach((p) => { const o = document.createElement('option'); o.value = p.asin; o.textContent = `${p.asin} · ${p.brand} · ${p.title.slice(0, 40)}`; sel.appendChild(o); });
  complianceProduct = prod.items[0];

  const showResult = (r) => {
    const lv = r.level;
    $('#compResult').innerHTML = `
      <div class="card" style="border-color:${lv === 'high' ? 'var(--red)' : lv === 'medium' ? 'var(--yellow)' : 'var(--green)'}">
        <div class="card-title"> 检测结果: <span class="badge ${lv}">${lv === 'high' ? '高风险' : lv === 'medium' ? '中风险' : '低风险'}</span> 合规评分 ${r.score}/100</div>
        <div class="card-sub">检测时间 ${r.checkedAt} · 品牌库命中: ${r.brandHit ? '是' : '否'}</div>
        <ul class="source-list">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`;
  };

  $('#compCheck').addEventListener('click', async () => {
    complianceProduct = prod.items.find((p) => p.asin === sel.value);
    const r = await API('/api/compliance/check', { method: 'POST', body: JSON.stringify({ asin: sel.value }) });
    showResult(r);
    $('#corrMsg').textContent = '';
  });

  const correct = async (verdict) => {
    if (!complianceProduct) return;
    const r = await API('/api/compliance/correct', { method: 'POST', body: JSON.stringify({ asin: complianceProduct.asin, brand: complianceProduct.brand, verdict }) });
    $('#corrMsg').textContent = `✔ 已记录 (累计${r.counts}次) | 检测准确率 ${Math.round(r.accuracy * 100)}%` + (r.newRule ? ` | 新规则已沉淀: ${r.newRule.id}` : '');
    if (r.newRule) await zyAlert(`🔄 数据飞轮: 已自动沉淀新规则 ${r.newRule.id}「${r.newRule.title}」`);
  };
  $('#corrRegistered').addEventListener('click', () => correct('已备案'));
  $('#corrNot').addEventListener('click', () => correct('未备案'));
}

/* ===== 批量刊登 ===== */
async function renderClaims() {
  const content = $('#content');
  const prod = await API('/api/products');
  const lowRisk = prod.items.filter((p) => p.aiRiskLevel === 'low' && p.fulfill === 'FBM');
  content.innerHTML = `
    <div class="notice">流程: 采集列表 → 一键筛选(FBM+未查到备案+BG标=无) → 批量认领 → 草稿箱编辑 → 批量发布</div>
    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-title"> 可认领商品 <span class="badge low">低风险 · FBM</span></div>
          <div class="card-sub">已按「未查到备案 + FBM + 无BG标」自动筛选, 共 ${lowRisk.length} 条</div>
          <div style="max-height:380px;overflow-y:auto"><table style="min-width:700px">
            <thead><tr><th></th><th>ASIN</th><th>品牌</th><th>商品</th><th>价格</th><th>建议价</th><th>月销</th></tr></thead>
            <tbody>${lowRisk.map((p) => `<tr>
              <td><input type="checkbox" class="claim-cb" value="${esc(p.asin)}"></td>
              <td class="mono">${esc(p.asin)}</td><td>${esc(p.brand)}</td>
              <td style="max-width:200px">${esc(p.title.slice(0, 50))}</td>
              <td>${fmtMoney(p.price, p.currency)}</td><td class="muted">${fmtMoney(p.aiSuggestPrice, p.currency)}</td><td>${fmtNum(p.monthlySales)}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="empty">无可认领商品</td></tr>'}</tbody>
          </table></div>
          <div class="toolbar section-gap">
            <button id="claimSel" class="btn primary">认领选中</button>
            <button id="claimAll" class="btn">认领全部</button>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title"> 草稿箱 <span id="claimCount" class="muted"></span></div>
          <div class="card-sub">批量编辑价格/SKU → 发布预览 → 批量发布 → 状态监控</div>
          <div id="claimList"></div>
          <div class="toolbar section-gap">
            <button id="pubSel" class="btn primary">发布选中</button>
            <button id="pubAll" class="btn">发布全部草稿</button>
            <span class="muted" id="pubMsg"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  const loadClaims = async () => {
    const data = await API('/api/claims');
    $('#claimCount').textContent = `共 ${data.total} 条`;
    $('#claimList').innerHTML = data.items.length ? `<div style="max-height:380px;overflow-y:auto"><table style="min-width:640px">
      <thead><tr><th></th><th>单号</th><th>ASIN</th><th>品牌</th><th>SKU</th><th>价格</th><th>状态</th></tr></thead>
      <tbody>${data.items.map((c) => `<tr>
        <td>${c.status === 'draft' ? `<input type="checkbox" class="pub-cb" value="${esc(c.id)}">` : ''}</td>
        <td class="mono">${esc(c.id)}</td><td class="mono">${esc(c.asin)}</td><td>${esc(c.brand)}</td>
        <td class="mono">${esc(c.sku)}</td><td>${fmtMoney(c.price, 'GBP')}</td>
        <td>${c.status === 'draft' ? '<span class="badge draft">草稿</span>' : `<span class="badge published">已发布 ${esc(c.publishedAt || '')}</span>`}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">草稿箱为空, 从左侧认领商品</div>';
    return data;
  };
  await loadClaims();

  const claimAsins = async (asins) => {
    let n = 0;
    for (const asin of asins) {
      const r = await API('/api/claims', { method: 'POST', body: JSON.stringify({ asin }) });
      if (!r.error) n++;
    }
    await loadClaims();
    await zyAlert(`✔ 已认领 ${n} 个商品到草稿箱`);
  };
  $('#claimSel').addEventListener('click', () => claimAsins($$('.claim-cb:checked').map((x) => x.value)));
  $('#claimAll').addEventListener('click', () => claimAsins(lowRisk.map((p) => p.asin)));
  $('#pubSel').addEventListener('click', async () => {
    const r = await API('/api/publish', { method: 'POST', body: JSON.stringify({ ids: $$('.pub-cb:checked').map((x) => x.value) }) });
    $('#pubMsg').textContent = `✔ 已发布 ${r.published} 条`; await loadClaims();
  });
  $('#pubAll').addEventListener('click', async () => {
    const data = await API('/api/claims');
    const ids = data.items.filter((c) => c.status === 'draft').map((c) => c.id);
    const r = await API('/api/publish', { method: 'POST', body: JSON.stringify({ ids }) });
    $('#pubMsg').textContent = `✔ 已发布 ${r.published} 条`; await loadClaims();
  });
}

/* ===== 智能调价 ===== */
async function renderReprice() {
  const content = $('#content');
  content.innerHTML = `
    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-title"> 智能调价 (模拟)</div>
          <div class="card-sub">目标价 = 平台最低价 − 差额(0.5), 且 ≥ 保底价(成本×1.15); 生产环境每15分钟自动执行</div>
          <div class="toolbar">
            <button id="rpRun" class="btn primary">▶ 执行一轮调价</button>
            <span class="muted" id="rpStats"></span>
          </div>
          <div id="rpResult" class="section-gap"></div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title"> 调价历史</div>
          <div class="card-sub">调价效果 → 每7天聚合 → 自动优化策略 → 沉淀到「定价策略库」</div>
          <div id="rpHistory" style="max-height:480px;overflow-y:auto"></div>
        </div>
      </div>
    </div>
  `;
  const loadHistory = async () => {
    const data = await API('/api/reprice');
    $('#rpHistory').innerHTML = data.items.length ? `<table style="min-width:560px">
      <thead><tr><th>时间</th><th>ASIN</th><th>最低价</th><th>差额</th><th>保底</th><th>目标价</th><th>结果</th></tr></thead>
      <tbody>${data.items.map((r) => `<tr>
        <td class="muted mono">${esc(r.at)}</td><td class="mono">${esc(r.asin)}</td>
        <td>${fmtMoney(r.lowest, 'GBP')}</td><td>${r.diff}</td><td>${fmtMoney(r.floor, 'GBP')}</td>
        <td><b>${fmtMoney(r.target, 'GBP')}</b></td>
        <td>${r.win ? '<span class="badge low">抢到车</span>' : '<span class="badge gray">未抢到</span>'}</td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty">暂无调价记录</div>';
  };
  await loadHistory();

  $('#rpRun').addEventListener('click', async () => {
    $('#rpRun').disabled = true;
    const r = await API('/api/reprice/run', { method: 'POST' });
    const wins = r.runs.filter((x) => x.win).length;
    $('#rpStats').textContent = `本轮 ${r.runs.length} 条, 预测抢到 ${wins} 条 | 累计获取率 ${r.stats.winRate * 100}%`;
    $('#rpResult').innerHTML = `
      <div class="notice">💡 <b>飞轮建议:</b> ${r.stats.suggestion.suggestion}</div>
      <table><thead><tr><th>ASIN</th><th>最低价</th><th>目标价</th><th>结果</th></tr></thead>
      <tbody>${r.runs.map((x) => `<tr><td class="mono">${esc(x.asin)}</td><td>${fmtMoney(x.lowest, 'GBP')}</td><td><b>${fmtMoney(x.target, 'GBP')}</b></td><td>${x.win ? '🏆 抢到购物车' : '✖ 未抢到'}</td></tr>`).join('')}</tbody></table>`;
    $('#rpRun').disabled = false;
    await loadHistory();
  });
}

/* ===== 数据飞轮 ===== */
async function renderFlywheel() {
  const content = $('#content');
  const f = await API('/api/flywheel');
  const rules = await API('/api/rules');
  const wheels = [
    { key: 'compliance', name: '🛡️ 合规飞轮', desc: '人工纠正品牌/专利检测结果 → 合规规则库(同错≥3次自动入库)', value: f.compliance.accuracy || 0, display: `${Math.round((f.compliance.accuracy || 0) * 100)}%`, color: 'var(--red)', stats: `纠正 ${f.compliance.corrected} 次 · 沉淀规则 ${f.compliance.rulesSunk} 条` },
    { key: 'pricing', name: '🏷️ 定价飞轮', desc: '调价→购物车获取率→出单→实际利润 → 定价策略库(差额/保底建议)', value: f.pricing.winRate || 0, display: `${Math.round((f.pricing.winRate || 0) * 100)}%`, color: 'var(--green)', stats: `调价 ${f.pricing.total} 次 · 抢到车 ${f.pricing.buyBoxWin} 次` },
    { key: 'selection', name: '📦 选品飞轮', desc: '认领→上架→出单→退货→利润 → 选品规则库(类目/价格带偏好)', value: Math.min(1, (f.selection.hitRate || 0.5) + 0.1), display: `${Math.round(((f.selection.hitRate || 0.5) + 0.1) * 100)}%`, color: 'var(--blue)', stats: `认领 ${f.selection.claimed} 条 · 命中率 ${Math.round((f.selection.hitRate || 0.5) * 100)}%` },
    { key: 'speech', name: '💬 话术飞轮', desc: '客服回复→客户反馈→成交 → 客服话术库(优质回复自动沉淀)', value: f.speech.adoptRate || 0.7, display: `${Math.round((f.speech.adoptRate || 0.7) * 100)}%`, color: 'var(--yellow)', stats: `采纳 ${f.speech.adopted} 次 · 采纳率 ${Math.round((f.speech.adoptRate || 0.7) * 100)}%` },
  ];
  content.innerHTML = `
    <div class="notice">🔄 <b>数据飞轮:</b> 反馈采集 → 同模式错误/成功累计≥阈值(默认3次) → 生成规则 → 写入规则库(带版本历史) → 下次任务自动加载。所有沉淀可追溯、可回滚、人工可删除。</div>
    <div class="grid cols-2" style="margin-bottom:20px">
      ${wheels.map((w) => `<div class="wheel">
        <div class="wheel-name">${w.name}</div>
        <div class="muted" style="line-height:1.5">${w.desc}</div>
        <div class="wheel-bar"><div class="wheel-fill" style="width:${Math.round(w.value * 100)}%;background:${w.color}"></div></div>
        <div style="display:flex;justify-content:space-between"><b style="font-size:18px">${w.display}</b><span class="muted">${w.stats}</span></div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title"> 规则库 (飞轮沉淀产物)</div>
      <div class="card-sub">文件化存储 + 版本管理, 规则生效无需发版, 支持回滚</div>
      <table style="min-width:720px">
        <thead><tr><th>编号</th><th>类型</th><th>规则</th><th>来源</th><th>命中</th><th>创建时间</th><th>状态</th></tr></thead>
        <tbody>${rules.items.map((r) => `<tr>
          <td class="mono">${esc(r.id)}</td>
          <td>${r.type === 'compliance' ? '🛡️ 合规' : r.type === 'pricing' ? '🏷️ 定价' : '📦 选品'}</td>
          <td><b>${esc(r.title)}</b><br><span class="muted">${esc(r.desc)}</span></td>
          <td>${r.source === 'flywheel' ? '<span class="badge danger">飞轮沉淀</span>' : '<span class="badge gray">人工</span>'}</td>
          <td>${r.hits}</td><td class="muted">${esc(r.createdAt)}</td>
          <td>${r.enabled ? '<span class="badge low">启用</span>' : '<span class="badge gray">停用</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

/* ===== AI Agent ===== */
async function renderAgent() {
  const content = $('#content');
  const prod = await API('/api/products');
  const AGENTS = [
    { role: '选品评估师', emoji: '🎯', duty: '评估跟卖可行性, 输出评分/风险/建议定价区间' },
    { role: '合规审查员', emoji: '🛡️', duty: '深度审查品牌/专利风险, 输出风险等级+检测依据(带引用)' },
    { role: '调价策略师', emoji: '📊', duty: '根据跟卖价历史+购物车数据, 输出差额/保底价建议' },
    { role: '运营分析师', emoji: '📈', duty: '店铺绩效解读, 输出周报/异常预警/优化建议' },
    { role: '智能客服', emoji: '💬', duty: '买家消息回复建议(话术库RAG), 人工确认后发送' },
  ];
  content.innerHTML = `
    <div class="notice">🤖 <b>AI Agent 团队:</b> 人类作为「团队Leader」审核介入 — Agent 输出带引用来源, 可一键采纳/拒绝, 采纳/拒绝即反馈喂给数据飞轮。</div>
    <div class="grid cols-3" style="margin-bottom:20px">
      ${AGENTS.map((a) => `<div class="card"><div class="card-title">${a.emoji} ${a.role}</div><div class="card-sub">${a.duty}</div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title"> 选品评估 (Agent 演示)</div>
      <div class="card-sub">输入 ASIN → 选品评估师结合合规检测结果输出可行性评估</div>
      <div class="toolbar">
        <select id="agAsin" class="select" style="flex:1"></select>
        <button id="agAssess" class="btn primary">评估</button>
      </div>
      <div id="agResult" class="section-gap"></div>
    </div>
  `;
  const sel = $('#agAsin');
  prod.items.forEach((p) => { const o = document.createElement('option'); o.value = p.asin; o.textContent = `${p.asin} · ${p.brand} · ${p.title.slice(0, 40)}`; sel.appendChild(o); });
  $('#agAssess').addEventListener('click', async () => {
    const r = await API('/api/agent/assess', { method: 'POST', body: JSON.stringify({ asin: sel.value }) });
    const color = r.risk === 'high' ? 'var(--red)' : r.risk === 'medium' ? 'var(--yellow)' : 'var(--green)';
    $('#agResult').innerHTML = `
      <div class="agent-bubble" style="border-color:${color}">
        <div class="agent-verdict">${r.verdict} <span class="badge ${r.risk}">风险: ${r.risk}</span> <span class="muted">可行性 ${r.feasibility}/100</span></div>
        <div class="muted" style="line-height:1.6">${esc(r.reason)}</div>
        <div style="margin-top:8px"><b>建议:</b></div>
        <ul class="source-list">${r.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div style="margin-top:8px"><b>依据来源:</b></div>
        <ul class="source-list">${r.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="toolbar" style="margin-top:12px">
          <button class="btn primary small" onclick="zyAlert('✔ 已采纳建议', '反馈已进入数据飞轮')">✓ 采纳</button>
          <button class="btn small" onclick="zyAlert('✖ 已拒绝建议', '反馈已进入数据飞轮')">✕ 拒绝</button>
        </div>
      </div>`;
  });
}

/* ===== 知识库 ===== */
async function renderKnowledge() {
  const content = $('#content');
  const branddb = await API('/api/branddb');
  const rules = await API('/api/rules');
  const complianceRules = rules.items.filter((r) => r.type === 'compliance');
  const pricingRules = rules.items.filter((r) => r.type === 'pricing');
  const selectionRules = rules.items.filter((r) => r.type === 'selection');
  content.innerHTML = `
    <div class="grid cols-3" style="margin-bottom:20px">
      <div class="stat"><div class="stat-value">${branddb.total}</div><div class="stat-label"> 品牌数据库</div></div>
      <div class="stat"><div class="stat-value">${rules.total}</div><div class="stat-label"> 规则库条目</div></div>
      <div class="stat"><div class="stat-value">5</div><div class="stat-label"> 知识库分类</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title"> 品牌数据库</div>
        <div class="card-sub">每日自动更新 + 人工纠正回流 · 检索响应 <1s</div>
        <div style="max-height:400px;overflow-y:auto"><table style="min-width:520px">
          <thead><tr><th>品牌</th><th>备案</th><th>BG</th><th>TM</th><th>专利</th><th>商标</th></tr></thead>
          <tbody>${branddb.items.slice(0, 30).map((b) => `<tr>
            <td><b>${esc(b.name)}</b></td>
            <td>${b.status === 'registered' ? '<span class="badge danger">已备案</span>' : b.status === 'unchecked' ? '<span class="badge medium">未核查</span>' : '<span class="badge low">未查到</span>'}</td>
            <td>${b.bg ? '✓' : '—'}</td><td>${b.tm ? '✓' : '—'}</td><td>${b.patent ? '<span class="badge danger">有</span>' : '—'}</td><td>${b.trademarkCount || 0}</td>
          </tr>`).join('')}</tbody></table></div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-title"> 合规规则库 <span class="muted">(${complianceRules.length})</span></div>
          <div class="card-sub">飞轮自动沉淀 + 人工编辑 · 规则生效无需发版</div>
          <ul class="source-list">${complianceRules.map((r) => `<li><b>${esc(r.title)}</b> — ${esc(r.desc)} <span class="pill">${esc(r.source)}</span><span class="pill">命中${r.hits}</span></li>`).join('')}</ul>
        </div>
        <div class="card">
          <div class="card-title"> 定价 / 选品 规则库 <span class="muted">(${pricingRules.length + selectionRules.length})</span></div>
          <ul class="source-list">${[...pricingRules, ...selectionRules].map((r) => `<li><b>${esc(r.title)}</b> — ${esc(r.desc)} <span class="pill">${esc(r.source)}</span></li>`).join('')}</ul>
        </div>
      </div>
    </div>
  `;
}

/* ===== 通知 ===== */
async function renderNotify() {
  const content = $('#content');
  content.innerHTML = `
    <div class="notice">💬 <b>飞书/企微集成:</b> 异常通知(调价失败/采集失败/订单拦截/品牌投诉) · 日报推送 · 远程指令(如「查库存」「暂停调价任务」) · 远程审批。指令鉴权, 操作留痕。</div>
    <div class="card">
      <div class="card-title"> 通知中心 <button id="nRefresh" class="btn small" style="margin-left:auto">刷新</button></div>
      <div id="nList" class="section-gap"></div>
    </div>
  `;
  const load = async () => {
    const data = await API('/api/notify');
    $('#nList').innerHTML = data.items.length ? data.items.map((n) => `
      <div class="notify-item ${n.read ? '' : 'unread'}">
        <div class="notify-emoji">${n.type.includes('合规') ? '🛡️' : n.type.includes('调价') ? '🏷️' : n.type.includes('认领') ? '📦' : n.type.includes('刊登') ? '🚀' : '🔔'}</div>
        <div style="flex:1">
          <div class="notify-title">${esc(n.title)} <span class="channel-pill">${esc(n.channel === 'feishu' ? '飞书' : '企微')}</span> ${n.read ? '' : '<span class="badge danger">未读</span>'}</div>
          <div class="notify-body">${esc(n.body)}</div>
          <div class="notify-meta">${esc(n.at)} · ${esc(n.id)} <button class="btn small" data-id="${esc(n.id)}">标记已读</button></div>
        </div>
      </div>`).join('') : '<div class="empty">暂无通知</div>';
    $$('#nList [data-id]').forEach((b) => b.addEventListener('click', async () => { await API('/api/notify/read', { method: 'POST', body: JSON.stringify({ id: b.dataset.id }) }); load(); }));
  };
  await load();
  $('#nRefresh').addEventListener('click', load);
}

/* ===== 物流工具: 运费试算比价 (云途官网 CDP 免费) + 物流配置 + 报价表管理 ===== */
async function renderLogistics() {
  const content = $('#content');
  const cfg = await API('/api/logistics/config').catch(() => ({}));
  const rates = await API('/api/logistics/rates').catch(() => ({}));
  const stale = rates.updatedAt ? ((Date.now() - new Date(String(rates.updatedAt).replace(' ', 'T')).getTime()) > 86400000) : true;
  content.innerHTML = `
    <div class="notice">📦 <b>物流工具:</b> 运费试算 (云途官网实时, 可选) · 报价表 (本地维护, 每日/手动更新, 一键计算优先使用) · 物流配置。</div>
    <div class="card">
      <div class="card-title">${ic('logistics', 16)} 运费试算 <button id="lgQuote" class="btn primary" style="margin-left:auto">开始试算</button></div>
      <div class="filter-grid" style="margin-top:8px">
        <div class="filter-item"><label>发件城市 (集货中转仓)</label><select id="lgCity" class="select">
          <option>深圳市</option><option>广州市</option><option>义乌市</option><option>杭州市</option><option>上海市</option><option>厦门市</option><option>泉州市</option><option>福州市</option><option>郑州市</option><option>武汉市</option>
        </select></div>
        <div class="filter-item"><label>目的国 (ISO2 代码)</label><input id="lgCountry" class="input" value="GB" placeholder="如 GB / DE / US / FR"></div>
        <div class="filter-item"><label>重量 (kg)</label><input id="lgWeight" class="input" type="number" step="0.1" value="1" placeholder="如 0.5 / 1 / 2"></div>
        <div class="filter-item"><label>长 (cm, 可空)</label><input id="lgLen" class="input" type="number" placeholder="如 20"></div>
        <div class="filter-item"><label>宽 (cm, 可空)</label><input id="lgWid" class="input" type="number" placeholder="如 15"></div>
        <div class="filter-item"><label>高 (cm, 可空)</label><input id="lgHgt" class="input" type="number" placeholder="如 10"></div>
        <div class="filter-item"><label>包裹类型</label><select id="lgBattery" class="select"><option value="0">普货</option><option value="1">带电</option></select></div>
      </div>
      <div id="lgResult" style="margin-top:12px"></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">${ic('save', 14)} 报价表 (一键计算用) <span class="muted" style="font-weight:400;font-size:12px">${stale ? '<span class="badge danger">超过24小时未更新</span>' : '<span class="badge low">更新于 ' + esc(rates.updatedAt || '-') + '</span>'}</span>
        <button id="lgRateAdd" class="btn small" style="margin-left:auto">新增渠道</button>
        <button id="lgRateRefresh" class="btn small" title="标记已更新 (录入/核对完价格后点)">已更新</button>
      </div>
      <div class="muted" style="font-size:11px;margin:4px 0">共 ${rates.countryCount || 0} 个国家有报价 · 请根据物流商最新价目表每日核对更新 · 更新后点「已更新」</div>
      <div id="lgRateList" style="margin-top:6px"></div>
      <div id="lgRateForm" style="display:none;margin-top:8px;border:1px dashed var(--line);border-radius:8px;padding:10px">
        <div class="filter-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          <div class="filter-item"><label>国家 (ISO2)</label><input id="lrCountry" class="input" value="GB" placeholder="GB"></div>
          <div class="filter-item"><label>渠道名称</label><input id="lrChannel" class="input" placeholder="如 云途全球专线挂号"></div>
          <div class="filter-item"><label>类型</label><input id="lrType" class="input" placeholder="专线/快速"></div>
          <div class="filter-item"><label>首重 (kg)</label><input id="lrFirstW" class="input" type="number" step="0.1" value="0.5"></div>
          <div class="filter-item"><label>首重价 (¥)</label><input id="lrFirstP" class="input" type="number" step="0.1" value="50"></div>
          <div class="filter-item"><label>续重 (kg)</label><input id="lrContW" class="input" type="number" step="0.1" value="0.5"></div>
          <div class="filter-item"><label>续重价 (¥)</label><input id="lrContP" class="input" type="number" step="0.1" value="15"></div>
          <div class="filter-item"><label>时效</label><input id="lrEta" class="input" placeholder="5-8天"></div>
        </div>
        <div class="toolbar" style="margin-top:6px"><button id="lrSave" class="btn primary">保存渠道</button><button id="lrCancel" class="btn">取消</button><span class="muted" id="lrMsg"></span></div>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-title">${ic('setting', 14)} 物流配置</div>
      <div class="muted" style="font-size:12px;margin:6px 0">云途开放平台 sourcekey 与 API 密钥 (申请后填, 用于官方 API 对接; 当前试算用报价表+CDP 免费通道)</div>
      <div class="toolbar" style="gap:8px;flex-wrap:wrap">
        <input id="lgSourceKey" class="input" placeholder="云途 sourcekey" value="${esc((cfg.sourcekey || ''))}" style="width:180px">
        <input id="lgAppToken" class="input" placeholder="云途 AppToken (API密钥)" value="${esc((cfg.appToken || ''))}" style="width:220px">
        <button id="lgSaveCfg" class="btn">保存配置</button>
        <span class="muted" id="lgCfgMsg"></span>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px">sourcekey: <b>${esc(cfg.sourcekey || '未配置')}</b> · 从开放平台【控制台→用户信息】获取</div>
    </div>
  `;
  // 开始试算
  $('#lgQuote').addEventListener('click', async () => {
    const btn = $('#lgQuote');
    const box = $('#lgResult');
    btn.textContent = '试算中…'; btn.disabled = true;
    box.innerHTML = '<div class="muted" style="padding:8px 0">正在打开云途官网试算 (约 25 秒)…</div>';
    try {
      const r = await API('/api/logistics/quote', { method: 'POST', body: JSON.stringify({
        originCity: $('#lgCity').value, country: $('#lgCountry').value.trim().toUpperCase(),
        weightKg: parseFloat($('#lgWeight').value) || 1,
        lengthCm: parseFloat($('#lgLen').value) || 0, widthCm: parseFloat($('#lgWid').value) || 0, heightCm: parseFloat($('#lgHgt').value) || 0,
        battery: $('#lgBattery').value === '1',
      }) });
      if (!r.ok || !r.quotes || !r.quotes.length) { box.innerHTML = `<div class="notice warn">⚠️ 未获取到报价: ${esc((r && r.error) || '云途试算无结果')}</div>`; return; }
      const rows = r.quotes.map((q) => `<tr>
        <td>${esc(q.channel)}</td><td>${esc(q.type)}</td><td>${esc(q.parcel)}</td><td>${esc(q.code)}</td>
        <td>${esc(q.chargeable)}</td><td>${esc(q.eta)}</td><td><b>¥${q.total}</b></td>
        <td class="muted" style="font-size:11px">运费¥${q.freight}${q.registrationFee ? '+挂号¥' + q.registrationFee : ''}${q.otherFee ? '+其他¥' + q.otherFee : ''}</td>
      </tr>`).join('');
      box.innerHTML = `<div class="muted" style="margin-bottom:6px">${esc(r.originCity)} → ${esc(r.country)} · ${r.weightKg}kg${r.lengthCm ? ` · ${r.lengthCm}x${r.widthCm}x${r.heightCm}cm` : ''} · ${r.battery ? '带电' : '普货'} · 共 <b>${r.quotes.length}</b> 个渠道 (¥ 为人民币)</div>
        <table class="ov-table" style="width:100%"><thead><tr><th>渠道</th><th>类型</th><th>包裹</th><th>代码</th><th>计费重</th><th>时效</th><th>总费用</th><th>明细</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="muted" style="font-size:11px;margin-top:6px">${esc(r.note)}</div>`;
    } catch (e) {
      box.innerHTML = `<div class="notice warn">❌ 试算失败: ${esc((e && e.message) || e)}</div>`;
    }
    btn.textContent = '开始试算'; btn.disabled = false;
  });
  // 保存配置
  $('#lgSaveCfg').addEventListener('click', async () => {
    const r = await API('/api/logistics/config', { method: 'POST', body: JSON.stringify({ sourcekey: $('#lgSourceKey').value.trim(), appToken: $('#lgAppToken').value.trim() }) });
    $('#lgCfgMsg').textContent = r.ok ? '✔ 已保存' : ('✗ ' + (r.error || '保存失败'));
    if (r.ok) setTimeout(() => { $('#lgCfgMsg').textContent = ''; }, 2500);
  });
  // ===== 报价表管理 =====
  const renderRateList = () => {
    const box = $('#lgRateList');
    const countries = rates.countries || {};
    const entries = Object.entries(countries);
    if (!entries.length) { box.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0">暂无报价 — 点击「新增渠道」录入 (需国家+渠道+首重/续重价)</div>'; return; }
    box.innerHTML = entries.map(([cc, list]) => `
      <div style="margin-bottom:8px">
        <div class="muted" style="font-size:12px;font-weight:600;margin-bottom:2px">${esc(cc)} (${list.length} 渠道)</div>
        <table class="ov-table" style="width:100%"><tbody>
          ${list.map((c, i) => `<tr>
            <td>${esc(c.channel)}</td><td class="muted" style="font-size:11px">${esc(c.type || '')}</td>
            <td>首${c.firstWeight}kg/¥${c.firstPrice}</td><td>续${c.contWeight}kg/¥${c.contPrice}</td>
            <td class="muted">${esc(c.eta || '')}</td>
            <td style="text-align:right"><button class="btn small" data-del="${esc(cc)}" data-i="${i}" title="删除渠道">✕</button></td>
          </tr>`).join('')}
        </tbody></table>
      </div>`).join('');
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const cc = b.dataset.del, idx = parseInt(b.dataset.i, 10);
      const ch = rates.countries[cc][idx].channel;
      const r = await API('/api/logistics/rates', { method: 'POST', body: JSON.stringify({ country: cc, channel: ch, remove: true }) });
      if (r.ok) { (rates.countries[cc] || []).splice(idx, 1); renderRateList(); }
    }));
  };
  renderRateList();
  $('#lgRateAdd').addEventListener('click', () => { $('#lgRateForm').style.display = $('#lgRateForm').style.display === 'none' ? 'block' : 'none'; });
  $('#lrCancel').addEventListener('click', () => { $('#lgRateForm').style.display = 'none'; });
  $('#lrSave').addEventListener('click', async () => {
    const body = {
      country: $('#lrCountry').value.trim().toUpperCase(),
      channel: $('#lrChannel').value.trim(),
      type: $('#lrType').value.trim(),
      firstWeight: parseFloat($('#lrFirstW').value) || 0.5,
      firstPrice: parseFloat($('#lrFirstP').value) || 0,
      contWeight: parseFloat($('#lrContW').value) || 0.5,
      contPrice: parseFloat($('#lrContP').value) || 0,
      eta: $('#lrEta').value.trim(),
    };
    if (!body.country || !body.channel) { $('#lrMsg').textContent = '⚠ 国家+渠道必填'; return; }
    const r = await API('/api/logistics/rates', { method: 'POST', body: JSON.stringify(body) });
    $('#lrMsg').textContent = r.ok ? '✔ 已保存' : ('✗ ' + (r.error || '保存失败'));
    if (r.ok) { $('#lgRateForm').style.display = 'none'; $('#lrMsg').textContent = ''; location.reload(); }
  });
  $('#lgRateRefresh').addEventListener('click', async () => {
    // 标记已更新: 更新 updatedAt (发一个空保存刷新时间)
    const r = await API('/api/logistics/rates', { method: 'POST', body: JSON.stringify({ _touch: true }) }).catch(() => ({}));
    if (r && r.ok) { location.reload(); }
  });
}

/* ===== 初始化 ===== */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  // 注入线性 SVG 图标 (导航 + logo)
  $$('[data-icon]').forEach((n) => {
    const box = n.querySelector('.nav-emoji');
    if (box) box.innerHTML = ic(n.dataset.icon, 17);
  });
  const logoIcon = $('#logoIcon');
  if (logoIcon) logoIcon.innerHTML = ic('bolt', 24);
  $$('.nav-item').forEach((n) => n.addEventListener('click', () => navigate(n.dataset.page)));
  try {
    await API('/api/health');
    $('#healthBadge').textContent = '● 服务在线';
  } catch { $('#healthBadge').textContent = '● 服务离线'; }
  navigate('workbench');
});



