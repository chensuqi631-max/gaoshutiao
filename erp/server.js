/**
 * 亚马逊跟卖ERP Demo — 后端服务 (零依赖 Node.js)
 * 提供: 静态文件 + REST API (商品/合规/认领/调价/飞轮/Agent/通知)
 * 用法: node zying-demo/server.js [port]   (默认 3088)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
// 数据目录可用环境变量覆盖: 插件市场安装时程序在 node_modules 里 (pnpm 升级会整体替换),
// 数据必须放到 node_modules 之外 —— 由插件启动器设置 ZYING_DATA 指向 ~/.zying-erp/data
const DATA = process.env.ZYING_DATA ? path.resolve(process.env.ZYING_DATA) : path.join(ROOT, 'data');
const PUBLIC = path.join(ROOT, 'public');
const PORT = parseInt(process.argv[2] || '3088', 10);

// ===== 数据读写 =====
function load(name, def) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch { return def; }
}
function save(name, data, force = false) {
  const f = path.join(DATA, name);
  // 防呆(硬): products.json 不允许被意外写空 — 只有显式 force=true (如「一键清空」接口) 才允许
  // 之前仅警告仍会写入, 导致商品库反复被清空为 [] (现场日志: [save] 警告 data.length= 0)
  if (name === 'products.json' && Array.isArray(data) && data.length === 0 && !force) {
    console.warn('[save] 阻止写空 products.json (data.length=0) — 已拒绝写入, 调用栈:\n' + new Error().stack);
    return;
  }
  // 防呆: 覆盖前保留上一份备份 (data/backups/name.<时间戳>), 避免误清空后无法恢复
  try {
    if (fs.existsSync(f)) {
      const bk = path.join(DATA, 'backups');
      fs.mkdirSync(bk, { recursive: true });
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      fs.copyFileSync(f, path.join(bk, name + '.' + ts + '.bak'));
    }
  } catch (e) { /* 备份失败不阻断主流程 */ }
  // 防呆: 商品库被写空时记录警告 (排查误清空)
  if (name === 'products.json' && (!Array.isArray(data) || data.length === 0)) {
    console.warn('[save] 警告: products.json 将被写空/清空, data.length=', Array.isArray(data) ? data.length : typeof data);
  }
  fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
}

let products = load('products.json', []);
let branddb = load('branddb.json', []);
let rules = load('rules.json', []);
let claims = load('claims.json', []);            // 草稿箱
let repriceHistory = load('reprice.json', []);   // 调价历史
// AI 对话配置 (后端存储, 任何浏览器生效; apiKey 不回传给前端)
let aiConfig = load('ai-config.json', { name: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: '' });

// ===== AI 调用封装 (断线自动重连): 网络错误/超时/5xx 自动重试 (指数退避) =====
// 重试条件: 连接失败/超时(AbortError)/429限流/5xx; 4xx 参数错误不重试 (重试无意义)
async function callAI(messages, opts = {}) {
  const base = String(aiConfig.baseURL || '').trim().replace(/\/+$/, '');
  const mdl = String(aiConfig.model || '').trim();
  const key = String(aiConfig.apiKey || '').trim();
  if (!base || !mdl || !key) throw new Error('请先在「工作台 → AI 设置」中填写 API Key');
  const maxRetries = Math.max(1, opts.maxRetries || 4);   // 最多重试次数 (默认4: 初始+4次重试)
  const perTimeout = opts.timeoutMs || 60000;             // 单次请求超时
  const temperature = opts.temperature != null ? opts.temperature : 0.7;
  const maxTokens = opts.maxTokens || 2000;
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避: 1s → 2s → 4s → 8s (最多)
      const delay = Math.min(8000, 1000 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
    let ctrl = null, timer = null;
    try {
      ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), perTimeout);
      const resp = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: mdl, messages, temperature, max_tokens: maxTokens }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const text = await resp.text();
      // 可重试的状态码: 429(限流) / 5xx(服务端错误) / 网络层已在 catch 处理
      if (!resp.ok) {
        let detail = '';
        try { const e = JSON.parse(text); detail = ((e.error && (e.error.message || e.error.code)) || text.slice(0, 200)); } catch { detail = text.slice(0, 200); }
        const retriable = resp.status === 429 || resp.status >= 500;
        if (retriable && attempt < maxRetries) { lastErr = new Error('AI 服务暂时不可用 (HTTP ' + resp.status + '), 自动重连 ' + (attempt + 1) + '/' + maxRetries + ': ' + detail); continue; }
        throw new Error('AI 服务错误 (HTTP ' + resp.status + '): ' + detail);
      }
      let data = null;
      try { data = JSON.parse(text); } catch {}
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (content == null) {
        if (attempt < maxRetries) { lastErr = new Error('AI 返回格式异常, 自动重连 ' + (attempt + 1) + '/' + maxRetries); continue; }
        throw new Error('AI 返回格式异常: ' + text.slice(0, 200));
      }
      return content;
    } catch (e) {
      if (timer) clearTimeout(timer);
      const isTimeout = e && e.name === 'AbortError';
      const isNetwork = e && (e.cause === 'ECONNRESET' || /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket|network/i.test(String(e.message)));
      // 超时或网络断开 → 自动重连; 其他错误(参数等)直接抛
      if ((isTimeout || isNetwork) && attempt < maxRetries) {
        lastErr = new Error((isTimeout ? 'AI 请求超时 (' + perTimeout + 's)' : 'AI 连接断开') + ', 自动重连 ' + (attempt + 1) + '/' + maxRetries);
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('AI 调用失败');
}
let flywheel = load('flywheel.json', {
  compliance: { total: 0, corrected: 0, rulesSunk: 0, accuracy: 0.82 },
  pricing: { total: 0, buyBoxWin: 0, winRate: 0.6, suggestions: [] },
  selection: { total: 0, claimed: 0, hitRate: 0.5 },
  speech: { total: 0, adopted: 0, adoptRate: 0.7 },
});
let notifications = load('notify.json', []);
let collectRules = load('collect-rules.json', []);   // 采集过滤规则 (保存/加载)

// ===== 采集停止机制 =====
// collectStop: 全局停止标志。任何采集接口收到 /api/collect/stop 后置 true,
// 所有采集循环(商品/轮次/卖家/翻页)在检查点读到 true 即提前退出, 保存已采集部分并返回。
let collectStop = false;
function collectStopRequested() { return collectStop === true; }
// 每次采集开始前调用, 清空上次停止标志
function resetCollectStop() { collectStop = false; }

// ===== 采集进度 (实时上报, 前端轮询显示在采集方式卡片上) =====
// collectProgress: { running, mode, label, startedAt, updatedAt, items, added, rounds, round, step, shopsDone, shopsTotal, error }
let collectProgress = null;
const setCollectProgress = (p) => { collectProgress = p; };
const bumpCollectProgress = (partial) => { if (collectProgress) Object.assign(collectProgress, partial, { updatedAt: Date.now() }); };
const clearCollectProgress = () => { collectProgress = null; };
// 采集接口入口统一注册进度 (mode 对应前端采集方式卡片 data-mode)
function beginCollectProgress(mode, label, extra = {}) {
  resetCollectStop();
  setCollectProgress({ running: true, mode, label, startedAt: Date.now(), updatedAt: Date.now(), items: 0, added: 0, rounds: 0, round: 0, step: '启动', ...extra });
}
function endCollectProgress() { clearCollectProgress(); }

function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// ===== 业务逻辑 =====

// RAG 合规检测 (模拟检索: 品牌库精确 + 关键词命中 + 规则库)
function complianceCheck(product) {
  const brand = branddb.find((b) => String(b.name || '').toLowerCase() === (product.brand || '').toLowerCase());
  const hits = rules.filter((r) => r.type === 'compliance' && r.enabled);
  const reasons = [];
  let level = 'low';
  let score = 100;

  if (brand && brand.status === 'registered') { level = 'high'; score -= 45; reasons.push(`品牌库命中: ${brand.name} 已备案 (依据: 品牌数据库 #${branddb.indexOf(brand) + 1})`); }
  if (product.bgMark) { level = 'high'; score -= 30; reasons.push('检测到 BG标 (蓝色品牌标), 规则 R-002 命中'); }
  if (product.patentRisk) { level = 'high'; score -= 30; reasons.push('专利库风险匹配 (依据: 专利库交叉验证)'); }
  if (product.tmMark) { if (level !== 'high') level = 'medium'; score -= 15; reasons.push('检测到 TM标 (商标申请中), 规则 R-003 命中'); }
  if (brand && brand.trademarkCount > 60) { if (level !== 'high') level = 'medium'; score -= 12; reasons.push(`商标记录 ${brand.trademarkCount} 条 (>60 阈值), 品牌保护强度高`); }
  if (!reasons.length) reasons.push('品牌库/专利库/规则库均未命中风险项');
  // 规则库动态沉淀的规则也参与
  hits.forEach((r) => {
    if (r.desc && (product.brand || '').toLowerCase().includes((r.title.match(/[A-Za-z0-9\-]+/g) || [''])[0].toLowerCase())) {
      reasons.push(`动态规则 ${r.id} 命中: ${r.title}`);
    }
  });

  flywheel.compliance.total++;
  return { asin: product.asin, level, score: Math.max(5, score), reasons, brandHit: !!brand, checkedAt: now() };
}

// 人工纠错 → 飞轮沉淀 (同错≥3次自动入库)
const corrCounts = {};
function correctCompliance(product, userVerdict) {
  const prev = flywheel.compliance;
  prev.corrected++;
  // 模拟: 纠错计数, 达到阈值3次沉淀新规则
  const key = `${product.asin}:${userVerdict}`;
  corrCounts[key] = (corrCounts[key] || 0) + 1;
  let newRule = null;
  if (corrCounts[key] >= 3 && !rules.some((r) => r.title.includes(product.brand))) {
    newRule = {
      id: 'R-' + String(100 + rules.length).padStart(3, '0'),
      type: 'compliance',
      title: `${product.brand} 判定修正 (人工纠错沉淀)`,
      desc: `用户将 ${product.brand} (${product.asin}) 的检测结果纠正为「${userVerdict}」, 累计${corrCounts[key]}次, 自动沉淀`,
      source: 'flywheel',
      createdAt: now(),
      hits: 0,
      enabled: true,
    };
    rules.push(newRule);
    prev.rulesSunk++;
    save('rules.json', rules);
  }
  // 更新品牌库 (人工纠错回流)
  const b = branddb.find((x) => x.name.toLowerCase() === (product.brand || '').toLowerCase());
  if (b) {
    b.status = userVerdict === '已备案' ? 'registered' : userVerdict === '未备案' ? 'notfound' : b.status;
    save('branddb.json', branddb);
  }
  prev.accuracy = Math.min(0.99, prev.accuracy + 0.005);
  save('flywheel.json', flywheel);
  return { corrected: true, newRule, counts: corrCounts[key], accuracy: prev.accuracy };
}

// ===== 真实采集 (fetch 抓 amazon 页面 + 智赢 API 补全, 失败降级历史数据) =====
const ZYING_TOKEN = process.env.ZYING_TOKEN || 'MM8bsEamq2WZsswHw5Hgx3hbr8Kjhn0Kr3sHhf1Uf0hjInRhF18EKMkvONK0xrczk5WneCMCSZ6FtjfzNbrE0dfnpc1588PW6nn3LN8odtpzbl1AGa9eHJ5tVtwJYJ6Gi';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SITE_DOMAIN = { uk: 'co.uk', us: 'com', de: 'de', fr: 'fr', it: 'it', es: 'es', jp: 'co.jp', ca: 'ca', in: 'in', mx: 'com.mx', au: 'com.au', nl: 'nl', pl: 'pl', se: 'se', sa: 'sa', sg: 'sg', br: 'com.br', tr: 'com.tr' };

function fetchGet(url, timeout = 25) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9' }, signal: AbortSignal.timeout(timeout * 1000) })
    .then((r) => r.text())
    .catch((e) => { throw new Error('fetch失败: ' + e.message); });
}

function fetchPostJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  }).then(async (r) => {
    if (r.status === 404 || r.status === 401) throw new Error('智赢API(' + r.status + ')');
    return r.json();
  }).catch((e) => { if (e.message.startsWith('智赢API')) throw e; throw new Error('fetch失败: ' + e.message); });
}

// 解析榜单页: ASIN/排名/标题
function parseBestsellersHtml(html) {
  const items = [];
  const re = /<div data-asin="([A-Z0-9]{10})"[\s\S]*?zg-bdg-text">#(\d+)<[\s\S]*?p13n-sc-css-line-clamp[^>]*>([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    items.push({ asin: m[1], rank: parseInt(m[2], 10), title: m[3].trim() });
  }
  return items;
}

// 历史真实数据 (此前智赢插件采集验证过的), 用于 API 降级补全
const HIST_FILE = path.join(ROOT, '_tools', '_bestsellers_50_full.json');
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')); } catch { return []; }
}
const HISTORY = loadHistory();

// ===== CDP 驱动 (Edge 9222 + 智赢插件 店铺页采集) =====
const CDP_PORT = 9222;
const CDP_SITE_CODE = { 'co.uk': 'uk', com: 'us', de: 'de', fr: 'fr', it: 'it', es: 'es', 'co.jp': 'jp', ca: 'ca', in: 'in', 'com.au': 'au', 'com.mx': 'mx', 'com.br': 'br', nl: 'nl', se: 'se', pl: 'pl' };
// 站点代码 → amazon 域名后缀 (含自定义站点: au/mx/br/nl/se/pl/tr/ae/sa/sg 等)
function siteToHostSuffix(site) {
  const map = { uk: 'co.uk', us: 'com', jp: 'co.jp', au: 'com.au', mx: 'com.mx', br: 'com.br', sg: 'com.sg', tr: 'com.tr', ae: 'ae', sa: 'sa', nl: 'nl', se: 'se', pl: 'pl', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' };
  return map[site] || site;
}
function cdpGetTabs() {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: '/json' }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 0;
    const pending = {};
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id]; }
    };
    ws.onopen = () => {
      const send = (method, params = {}) => new Promise((r, rej) => {
        const id = ++msgId;
        const timer = setTimeout(() => { delete pending[id]; rej(new Error('CDP ' + method + ' 超时')); }, 30000);
        pending[id] = (res) => { clearTimeout(timer); r(res); };
        try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); delete pending[id]; rej(e); }
      });
      resolve({ ws, send });
    };
    ws.onerror = (e) => reject(new Error('WebSocket 连接失败: ' + e.message));
  });
}

// 店铺页 CDP 采集 (复用 zying-shop-collect.js 逻辑)
async function cdpShopCollect(url, maxItems = 10) {
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);

  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 8000));
  const st = await send('Runtime.evaluate', {
    expression: `(() => {
      const t = document.body ? document.body.textContent.slice(0, 2000) : '';
      const cap = /captcha|Robot Check|Enter the characters|验证码|api-services-support@amazon/i.test(t);
      return JSON.stringify({ cap, title: document.title });
    })()`, returnByValue: true,
  });
  const state = JSON.parse(st.result.value);
  if (state.cap) throw new Error('触发验证码/风控, 请手动过验证后重试');

  for (let i = 0; i < 8; i++) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` });
    await new Promise((r) => setTimeout(r, 1200));
  }
  await new Promise((r) => setTimeout(r, 2000));

  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = [];
      document.querySelectorAll('div[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
        const titleEl = el.querySelector('h2 span, h2, .a-color-base.a-text-normal');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const priceEl = el.querySelector('.a-price .a-offscreen, .a-price-whole');
        const price = priceEl ? priceEl.textContent.trim() : '';
        const ratingEl = el.querySelector('.a-icon-alt, [aria-label*="star"], [aria-label*="Stern"]');
        const rating = ratingEl ? ratingEl.getAttribute('aria-label') || ratingEl.textContent.trim() : '';
        const reviewEl = el.querySelector('a[aria-label*="ratings"], a[aria-label*="Bewertungen"], .a-size-base.s-underline-text');
        const reviews = reviewEl ? reviewEl.textContent.trim() : '';
        const linkEl = el.querySelector('a.a-link-normal[href*="/dp/"], a[href*="/dp/"]');
        const link = linkEl ? linkEl.href : '';
        cards.push({ asin, title: title.slice(0, 250), price, rating: rating.slice(0, 60), reviews: reviews.slice(0, 40), link });
      });
      const seen = new Set();
      return JSON.stringify(cards.filter(c => { if (seen.has(c.asin)) return false; seen.add(c.asin); return true; }));
    })()`, returnByValue: true,
  });
  let items;
  try { items = JSON.parse(r.result.value); } catch { items = []; }
  return items.slice(0, maxItems);
}

// ===== 店铺列表页采集 (翻页取全部商品 → 详情补全 → 过滤 → 入库) =====
// 输入: 店铺列表页 URL (如 /s?me=XXXX&language=en&marketplaceID=...)
// 流程: 翻页采集商品 → 逐个跳详情页(详情修正: 价格/品牌/排名/主图/配送FBA-FBM) → 按过滤条件(FBA/FBM等)筛选 → 入库
async function cdpShopListCollect(url, opts = {}) {
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'de';
  const host = 'www.amazon.' + siteToHostSuffix(site);
  const maxPages = Math.min(10, Math.max(1, opts.maxPages || 3));
  const maxItems = Math.min(100, Math.max(1, opts.maxItems || 50));
  const filter = opts.filter || {};
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && /amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/.test(t.url))
    || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'))
    || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  // ① 翻页采集商品列表
  const items = [];
  const seen = new Set();
  for (let pg = 1; pg <= maxPages && items.length < maxItems * 2; pg++) {
    if (collectStopRequested()) { items.push({ asin: '停止', title: '用户已停止采集' }); break; }
    const pgUrl = pg === 1 ? url : url + (url.includes('?') ? '&' : '?') + 'page=' + pg;
    await send('Page.navigate', { url: pgUrl });
    await new Promise((r) => setTimeout(r, 8000));
    for (let i = 0; i < 5; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 1000)); }
    await new Promise((r) => setTimeout(r, 1500));
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const cards = [];
        document.querySelectorAll('div[data-asin]').forEach(el => {
          const asin = el.getAttribute('data-asin');
          if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
          // 商品判定: 有 /dp/ 链接即可 (不放宽图片条件 — 商品图懒加载, 滚动后常未就绪, 按图过滤会漏采; 详情页会补全)
          if (!el.querySelector('a[href*="/dp/"]')) return;
          const t = el.querySelector('h2 span, h2');
          const pr = el.querySelector('.a-price .a-offscreen, .a-price-whole');
          // 卡片配送标志: Fulfilled by Amazon / Versand durch Amazon → FBA; 其他 → null(需详情确认)
          const cardTxt = (el.textContent || '');
          let fulfill = null;
          if (/Fulfilled by Amazon|Versand durch Amazon|Dispatches from Amazon|Ships from Amazon|亚马逊配送/i.test(cardTxt)) fulfill = 'FBA';
          else if (/Verkauf und Versand durch Amazon|Sold by Amazon/i.test(cardTxt)) fulfill = 'FBA';
          else if (/Verkauf und Versand durch|Dispatched from and sold by/i.test(cardTxt)) fulfill = 'FBM';
          cards.push({ asin, title: t ? t.textContent.trim().slice(0, 200) : '', price: pr ? pr.textContent.trim() : '', fulfill });
        });
        return JSON.stringify(cards);
      })()`, returnByValue: true,
    });
    let pageItems = [];
    try { pageItems = JSON.parse(r.result.value); } catch {}
    pageItems.forEach((x) => { if (!seen.has(x.asin)) { seen.add(x.asin); items.push(x); } });
    bumpCollectProgress({ step: '店铺翻页采集', items: items.length, page: pg, pages: maxPages });
    if (pageItems.length < 16) break; // 无更多页
  }
  if (!items.length) throw new Error('店铺页未提取到商品 (可能需登录或页面结构变化)');
  // ② 列表页初筛: 卡片已标记配送 (FBA/FBM), 与过滤条件不符的直接跳过, 不跳详情页
  //    (卡片无配送标志 → 保留待详情确认)
  let preSkipped = 0;
  const list = items.slice(0, maxItems);
  for (const it of list) {
    if (filter.fulfill && it.fulfill && it.fulfill !== filter.fulfill) { it.__skip = true; preSkipped++; }
  }
  // ③ 逐个商品: 跳详情页 → 等插件面板加载完成获取全部插件信息(品牌/商标/配送/排名/销量) → 过滤判定 → 再跳下一个
  let detailDone = 0;
  for (const it of list) {
    if (collectStopRequested()) break;
    if (it.__skip) continue;
    detailDone++;
    bumpCollectProgress({ step: '详情补全', items: items.length, detailDone, detailTotal: list.length });
    try {
      // ① 插件面板 (等加载完成, 含商标hover): 配送FBA/FBM/品牌/商标/排名/销量 以插件为准
      let pd = null;
      try { pd = await cdpReadOnePanel(send, it.asin, host.replace('www.amazon.', '')); } catch {}
      if (pd && !pd.error) {
        if (pd.fulfill) it.fulfill = pd.fulfill;
        if (pd.brand) it.brand = pd.brand;
        if (pd.tmText) it.tmText = pd.tmText;
        if (pd.trademarkCount != null) it.trademarkCount = pd.trademarkCount;
        if (pd.tmCountries && pd.tmCountries.length) it.tmCountries = pd.tmCountries;
        if (pd.bsr && pd.bsr.length) it.bsr = pd.bsr;
        if (pd.sales30d) it.monthlySales = parseInt(String(pd.sales30d).replace(/[^\d]/g, ''), 10) || 0;
      }
      // ② 网页数据 (价格/主图/评分/评论等) — cdpEnrichOne 会导航详情页并做过滤判定
      await cdpEnrichOne(send, host, it, filter);
      // ③ 配送: 插件面板优先 (网页可能读不到, 如 FBA 商品网页无标志)
      if (pd && pd.fulfill) it.fulfill = pd.fulfill;
      it.__skip = !applyCollectFilter(it, filter);
    } catch (e) { console.error('[shop-list-detail]', it.asin, '异常:', e && e.message); it.__skip = true; }
  }
  const kept = list.filter((x) => !x.__skip);
  // ④ 入库
  const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
  const used = new Set(products.map((x) => x.asin));
  let added = 0;
  for (const p of kept) {
    if (used.has(p.asin)) continue;
    used.add(p.asin);
    const price = (p.price != null && !isNaN(p.price)) ? p.price : (parseFloat(String(p.price || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || Math.round((399 + Math.random() * 3000)) / 100);
    const maxRank = Array.isArray(p.bsr) && p.bsr.length ? Math.max(...p.bsr.map((b) => b.rank)) : null;
    const item = {
      id: p.asin, asin: p.asin, rank: maxRank != null ? '#' + maxRank : null, title: p.title, brand: p.brand || 'Unknown',
      brandStatus: 'unchecked', bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
      followCount: 0, chinaSeller: false, fulfill: p.fulfill || 'FBM', amazonSell: p.amazonSell || false,
      mainImage: p.mainImage || null,
      price, currency, monthlySales: 0, reviews: p.reviews || 0, rating: (typeof p.rating === 'number' ? p.rating : (parseFloat(String(p.rating || '').match(/[\d.]+/)?.[0]) || 4)), stock: 0,
      listedAt: new Date().toISOString().slice(0, 10), size: null, weight: null, variations: 0,
      badge: p.badge || null, aplus: p.aplus || false,
      bsr: p.bsr || [],
      referralFee: 0, netProfit: 0,
      site, category: p.category || 'Shop', collectedAt: now(), source: 'cdp-shop-list', saved: false, real: true,
    };
    item.referralFee = Math.round(item.price * 0.15 * 100) / 100;
    item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
    item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5)));
    item.aiRiskLevel = 'low';
    item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
    products.unshift(item);
    added++;
  }
  if (added > 0) save('products.json', products);
  return { site, host, url, pages: maxPages, productCount: kept.length, skipped: list.length - kept.length, preSkipped, total: items.length, added, stopped: collectStopRequested(), products: kept.map((x) => ({ asin: x.asin, title: (x.title || '').slice(0, 60), price: x.price, fulfill: x.fulfill })) };
}

// 店铺 ASIN → 详情页插件面板采集 (复用 cdp 连接, 逐条导航详情页读面板)
async function cdpPanelCollect(url, maxItems = 5) {
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
  const domain = site === 'uk' ? 'co.uk' : site === 'us' ? 'com' : site;

  // 1. 店铺页提取 ASIN
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 8000));
  for (let i = 0; i < 6; i++) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` });
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const seen = new Set(); const out = [];
      document.querySelectorAll('div[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) return;
        seen.add(asin);
        const t = el.querySelector('h2 span, h2, .a-color-base.a-text-normal');
        out.push({ asin, title: t ? t.textContent.trim().slice(0, 150) : '' });
      });
      return JSON.stringify(out);
    })()`, returnByValue: true,
  });
  let asins = [];
  try { asins = JSON.parse(r1.result.value); } catch {}
  asins = asins.slice(0, maxItems);
  if (!asins.length) throw new Error('店铺页未提取到 ASIN');

  // 2. 逐条导航详情页读面板
  const results = [];
  for (const it of asins) {
    if (collectStopRequested()) break;
    await send('Page.navigate', { url: `https://www.amazon.${domain}/dp/${it.asin}` });
    await new Promise((r) => setTimeout(r, 9000));
    for (let i = 0; i < 3; i++) {
      await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 2000})` });
      await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => setTimeout(r, 1200));
    // 面板加载重试
    let panelTxt = null, analyzing = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r2 = await send('Runtime.evaluate', {
        expression: `(() => {
          const p = document.querySelector('.zy-tool-detail') || document.querySelector('.zying-shadow-root');
          if (!p) return JSON.stringify({ ok: false });
          const txt = (p.textContent || '').replace(/\\s+/g, ' ').trim();
          return JSON.stringify({ ok: true, analyzing: /正在分析/.test(txt), txt: txt.slice(0, 3000) });
        })()`, returnByValue: true,
      });
      const st = JSON.parse(r2.result.value);
      if (st.ok && !st.analyzing) { panelTxt = st.txt; break; }
      analyzing = st.ok && st.analyzing;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!panelTxt) { results.push({ ...it, error: analyzing ? '插件仍在分析中' : '插件面板未加载' }); continue; }
    results.push(parsePanelText(panelTxt, it.asin, it.title));
  }
  return { site, results };
}

// 面板文本 → 结构化字段 (与 zying-panel-collect.js 相同逻辑)
function parsePanelText(t, asinFallback, title) {
  const nextKey = (start) => {
    const keys = ['品牌', '卖家', '尺寸', '包装尺寸', '重量', '包装重量', 'FBA费用', '商品类型', '上架', '近30天销量', 'ASIN', '榜单选品', '变体', 'color', 'colour', 'size'];
    let best = -1;
    keys.forEach((k) => {
      const i = t.indexOf(k + '：', start), i2 = t.indexOf(k + ':', start);
      const pos = i >= 0 && i2 >= 0 ? Math.min(i, i2) : Math.max(i, i2);
      if (pos >= 0 && (best < 0 || pos < best)) best = pos;
    });
    return best;
  };
  const grab = (key) => {
    const kPos = t.indexOf(key + '：') >= 0 ? t.indexOf(key + '：') : t.indexOf(key + ':');
    if (kPos < 0) return null;
    const start = kPos + key.length + 1, end = nextKey(start);
    const val = end > start ? t.slice(start, end) : t.slice(start);
    return val.trim().replace(/\s+/g, ' ') || null;
  };
  const brandRaw = grab('品牌') || '';
  const sellerRaw = grab('卖家') || '';
  // 品牌 + 商标状态分离: "MORICHS1个已注册" / "SANSHAOS未查到(仅供参考)" / "Generic50个注册商标"
  const tmM = brandRaw.match(/^(.+?)(\d+\s*个已注册|已注册|\d+\s*个注册商标|已备案|未查到|有风险|TM标|R标|\(仅供参考\))(.*)$/);
  const brand = tmM ? tmM[1].trim() : (brandRaw.replace(/(\(仅供参考\))/g, '').trim() || null);
  const tmText = tmM ? (tmM[2] + (tmM[3] || '')).trim() : null;
  const tmNum = tmText ? (tmText.match(/\d+/) ? parseInt(tmText.match(/\d+/)[0], 10) : (tmText.includes('已注册') || tmText.includes('已备案') || tmText.includes('注册商标') ? 1 : 0)) : 0;
  const ranks = [];
  // 面板排名格式: "#15,157PC & Video Games榜单选品" (数字含逗号千分位)
  const rankRe = /#([\d.,]+)\s*([^#]{2,40}?)\s*榜单选品/g;
  let rm;
  while ((rm = rankRe.exec(t)) !== null) {
    const rv = parseInt(rm[1].replace(/[.,]/g, ''), 10);
    const cat = rm[2].trim();
    if (rv > 0 && cat.length >= 2) ranks.push({ rank: rv, category: cat.slice(0, 40) });
  }
  // 卖家: 清理 FBM/FBA/卖家:N/店铺选品 杂质
  const seller = sellerRaw ? sellerRaw.replace(/FBA|FBM|卖家[:：]\s*\d+|店铺选品/g, '').replace(/\s+/g, ' ').trim() || null : null;
  const sellerCountM = t.match(/卖家[:：]\s*(\d+)/);
  // FBM/FBA: 卖家字段优先判定, 避免 "FBA费用" 误判为 FBA
  const fulfill = /FBM/.test(sellerRaw) ? 'FBM' : /FBA(?!费用)/.test(sellerRaw) ? 'FBA' : /FBM/.test(t) ? 'FBM' : /FBA(?!费用)/.test(t) ? 'FBA' : null;
  const salesRaw = grab('近30天销量');
  const fbaFee = grab('FBA费用');
  const sizeRaw = grab('尺寸');
  const variantSize = grab('size') || grab('Size');
  const color = grab('color') || grab('colour') || grab('Color');
  // ===== 商标国家解析: 扫描面板文本中的国家/地区商标标记 =====
  const tmCountries = [];
  const TM_COUNTRY_MAP = [
    { names: ['欧盟', 'EUIPO', 'EU 商标', 'European Union'], label: '欧盟' },
    { names: ['英国', 'UKIPO', 'UK 商标', 'United Kingdom'], label: '英国' },
    { names: ['美国', 'USPTO', 'US 商标', '美国专利'], label: '美国' },
    { names: ['德国', 'DPMA', 'DE 商标', '德国专利'], label: '德国' },
    { names: ['日本', 'JPO', 'JP 商标'], label: '日本' },
    { names: ['中国', 'CNIPA', 'CN 商标', '中国商标'], label: '中国' },
    { names: ['法国', 'INPI', 'FR 商标'], label: '法国' },
    { names: ['意大利', 'UIBM', 'IT 商标'], label: '意大利' },
    { names: ['西班牙', 'OEPM', 'ES 商标'], label: '西班牙' },
    { names: ['马德里', 'WIPO', 'Madrid'], label: '马德里' },
  ];
  TM_COUNTRY_MAP.forEach((c) => {
    if (c.names.some((n) => t.includes(n))) tmCountries.push(c.label);
  });
  return {
    asin: grab('ASIN') || asinFallback,
    title,
    brand,
    tmText,                             // 商标状态原文: "1个已注册" / "未查到" / "50个注册商标"
    trademarkCount: tmNum,              // 商标数
    tmCountries,                        // 商标国家/地区 (欧盟/英国/美国/德国/日本/马德里...)
    seller,
    fulfill,
    sellerCount: sellerCountM ? parseInt(sellerCountM[1], 10) : null,
    size: sizeRaw, weight: grab('重量'), packSize: grab('包装尺寸'), packWeight: grab('包装重量'),
    fbaFee: fbaFee ? fbaFee.replace(/(color|colour|size)：.*/i, '').trim() : null,
    productType: grab('商品类型'),
    listedAt: grab('上架'),
    color: color ? color.replace(/\s+/g, ' ').trim() : null,
    variantSize,
    sales30d: salesRaw ? (salesRaw.match(/^<*\s*[\d.,]+/) ? salesRaw.match(/^<*\s*[\d.,]+/)[0] : null) : null,
    bsr: ranks,
  };
}

// 详情页品牌跳转采集: 商品详情页 → 品牌链接(field-keywords) → 品牌全部商品 (全程 CDP)
async function cdpDpBrand(url, maxPages = 5) {
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
  const host = 'www.amazon.' + siteToHostSuffix(site);

  // 1. 详情页提取品牌链接
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 10000));
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      let brandLink = null, brandName = null;
      document.querySelectorAll('#bylineInfo a, #bylineInfo_feature_div a, a[href*="field-keywords"]').forEach(a => {
        const h = a.getAttribute('href') || '';
        const t = (a.textContent || '').trim().replace(/\\s+/g, ' ');
        if (h.includes('field-keywords') && t && !brandLink) {
          brandLink = h;
          const m = t.match(/Brand:?\s*(.+)/i);
          brandName = m ? m[1].trim() : t;
        }
      });
      return JSON.stringify({ brandLink, brandName });
    })()`, returnByValue: true,
  });
  const br = JSON.parse(r1.result.value);
  if (!br.brandLink) throw new Error('详情页未找到品牌链接 (Brand: XXX → field-keywords)');
  const listUrl = br.brandLink.startsWith('http') ? br.brandLink : `https://${host}` + br.brandLink;

  // 2. 品牌搜索页翻页采集
  const products = [];
  const seen = new Set();
  for (let pg = 1; pg <= maxPages; pg++) {
    if (collectStopRequested()) break;
    const pgUrl = pg === 1 ? listUrl : listUrl.includes('page=') ? listUrl.replace(/page=\d+/, 'page=' + pg) : listUrl + (listUrl.includes('?') ? '&' : '?') + 'page=' + pg;
    await send('Page.navigate', { url: pgUrl });
    await new Promise((r) => setTimeout(r, 8000));
    for (let i = 0; i < 4; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 900)); }
    await new Promise((r) => setTimeout(r, 1200));
    const r2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        document.querySelectorAll('div[data-asin]').forEach(el => {
          const asin = el.getAttribute('data-asin');
          if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
          const t = el.querySelector('h2 span, h2');
          const pr = el.querySelector('.a-price .a-offscreen');
          const lk = el.querySelector('a[href*="/dp/"]');
          out.push({ asin, title: t ? t.textContent.trim().slice(0, 150) : '', price: pr ? pr.textContent.trim() : '', link: lk ? lk.href : '' });
        });
        return JSON.stringify(out);
      })()`, returnByValue: true,
    });
    let items = [];
    try { items = JSON.parse(r2.result.value); } catch {}
    const fresh = items.filter((x) => !seen.has(x.asin));
    fresh.forEach((x) => seen.add(x.asin));
    products.push(...fresh);
    if (items.length < 16) break;
  }
  return { brandName: br.brandName, brandLink: listUrl, detailUrl: url, site, products };
}

// 解析商品上架日期 (firstAvailable: "2023年5月12日" / "2023-05-12" / "12 May 2023" / "May 12, 2023" 等)
function parseFirstAvailable(s) {
  if (!s) return null;
  const str = String(s);
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  // 中文/数字格式: 2023年5月12日 / 2023-05-12 / 2023/5/12
  const m1 = str.match(/(\d{4})[年\-/.](\d{1,2})(?:[月\-/.](\d{1,2}))?/);
  if (m1) {
    const d = new Date(+m1[1], (+m1[2] || 1) - 1, m1[3] ? +m1[3] : 1);
    if (!isNaN(d.getTime())) return d;
  }
  // 英文格式: 12 May 2023 / 12 May, 2023 / 21 Mar. 2025 / 18 Mar. 20 (缩写带点、两位年份都要认)
  const m2 = str.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?[,]?\s+(\d{2,4})/);
  if (m2) {
    const mn = months[String(m2[2]).toLowerCase().slice(0, 3)];
    if (mn != null) {
      const y = +m2[3] < 100 ? 2000 + +m2[3] : +m2[3];
      const d = new Date(y, mn, +m2[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  // 英文格式: May 12, 2023 / May. 12, 23
  const m3 = str.match(/([A-Za-z]{3,9})\.?[,]?\s+(\d{1,2})[,]?\s+(\d{2,4})/);
  if (m3) {
    const mn = months[String(m3[1]).toLowerCase().slice(0, 3)];
    if (mn != null) {
      const y3 = +m3[3] < 100 ? 2000 + +m3[3] : +m3[3];
      const d = new Date(y3, mn, +m3[2]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// 商品是否命中指定页面标识 (A+/AC/BestSeller/NewRelease/Deal/...) — 纯函数可测试
// 支持: 标准 key (aplus/choice/...) 及中英文别名 (A+/AC/新品/畅销/限时优惠/亚马逊精选...)
function itemMatchesBadge(item, badge) {
  const std = {
    aplus: () => !!item.aplus,
    choice: () => item.badge === 'choice',
    bestseller: () => item.badge === 'bestseller',
    bestseller1: () => item.badge === 'bestseller1' || item.badge === '#1bestseller',
    deal: () => item.badge === 'deal',
    dealday: () => item.badge === 'dealday' || item.badge === 'deal-of-the-day',
    newrelease: () => item.badge === 'newrelease' || item.badge === 'new-release',
    overallpick: () => item.badge === 'overallpick' || item.badge === 'overall-pick',
    editorspick: () => item.badge === 'editorspick' || item.badge === "editor's-pick",
    toprated: () => item.badge === 'toprated' || item.badge === 'top-rated',
    climate: () => item.badge === 'climate' || item.badge === 'climate-pledge-friendly',
    smallbusiness: () => item.badge === 'smallbusiness' || item.badge === 'small-business',
  };
  const key = String(badge || '').toLowerCase().trim();
  if (std[key]) return std[key]();
  // 中英文别名匹配 (用户手写: A+/AC/畅销/新品/限时优惠/今日特惠/亚马逊精选...)
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5#]/g, '');
  const b = norm(badge);
  const hits = [
    ['aplus', ['a+', 'aplus', 'a+内容', 'a+页面', 'enhancedbrandcontent', '增强内容'], () => !!item.aplus],
    ['choice', ['ac', 'amazonschoice', '亚马逊精选', '亚马逊之选'], () => item.badge === 'choice'],
    ['bestseller', ['bestseller', 'best seller', '畅销', '热卖', '热销'], () => item.badge === 'bestseller' || item.badge === 'bestseller1'],
    ['bestseller1', ['#1bestseller', 'no1bestseller', '第一名', '榜首', '类目第一'], () => item.badge === 'bestseller1' || item.badge === '#1bestseller'],
    ['newrelease', ['newrelease', 'new release', '新品', '新发布'], () => item.badge === 'newrelease' || item.badge === 'new-release'],
    ['deal', ['limitedtimedeal', '限时优惠', '限时', '优惠'], () => item.badge === 'deal'],
    ['dealday', ['dealoftheday', '今日特惠', '今日优惠'], () => item.badge === 'dealday' || item.badge === 'deal-of-the-day'],
    ['overallpick', ['overallpick', '综合首选'], () => item.badge === 'overallpick' || item.badge === 'overall-pick'],
    ['editorspick', ['editorspick', 'editor\'spick', '编辑精选'], () => item.badge === 'editorspick' || item.badge === "editor's-pick"],
    ['toprated', ['toprated', 'toprated', '最高评分', '高分'], () => item.badge === 'toprated' || item.badge === 'top-rated'],
    ['climate', ['climatepledgefriendly', '气候友好', '环保'], () => item.badge === 'climate' || item.badge === 'climate-pledge-friendly'],
    ['smallbusiness', ['smallbusiness', '小企业', '中小企业'], () => item.badge === 'smallbusiness' || item.badge === 'small-business'],
  ];
  for (const [, words, test] of hits) {
    if (words.some((w) => { const wn = norm(w); return b === wn || (wn.length >= b.length && wn.includes(b)); })) return test();
  }
  return false;
}

// 类目搜索采集: 导航类目搜索页(关键词/类目) → 翻页提取商品 (全程 CDP)
// ===== 采集过滤: 与列表自定义筛选同条件, 被筛除的商品直接跳过不采集 =====
// item: 采集到的商品 (字段: price/rating/reviews/fulfill/aplus/bsr/badge/category/title/asin/site)
// filter: { fulfill, rankMin/Max, priceMin/Max, ratingMin/Max, reviewsMin/Max, salesMin/Max, q, badges, tmMin/Max, tmCountries, category, sites, is1688, brandStatus, newDaysMin/Max }
// 严格模式: 字段未知(该采集器未抓到)视为不满足 → 跳过 (只采被过滤出的商品)
function applyCollectFilter(item, filter) {
  if (!filter || !Object.keys(filter).length) return true;
  const f = filter;
  if (f.fulfill === 'AMZ') {                                                      // 只采亚马逊自营
    if (!item.amazonSell) return false;
  } else if (f.fulfill && item.fulfill && item.fulfill !== f.fulfill) return false; // 只采 FBA/FBM: 排除明确不匹配的; 未知(null)视为可采
  if (f.aplus === true && !item.aplus) return false;                          // 旧字段兼容: 仅有 A+
  else if (f.aplus === false && item.aplus) return false;                     // 旧字段兼容: 排除 A+
  if (f.rankMin != null || f.rankMax != null) {                                    // 排名区间
    const maxR = Array.isArray(item.bsr) && item.bsr.length ? Math.max(...item.bsr.map((b) => b.rank)) : null;
    if (maxR == null) return false;
    if (f.rankMin != null && maxR < f.rankMin) return false;
    if (f.rankMax != null && maxR > f.rankMax) return false;
  }
  const pr = (typeof item.price === 'number') ? item.price : parseFloat(String(item.price || '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (f.priceMin != null && !(pr != null && pr >= f.priceMin)) return false;       // 价格 ≥ 下限
  if (f.priceMax != null && !(pr != null && pr <= f.priceMax)) return false;       // 价格 ≤ 上限
  const rt = (typeof item.rating === 'number') ? item.rating : parseFloat(String(item.rating || '').match(/[\d.]+/)?.[0]);
  if (f.ratingMin != null && !(rt != null && rt >= f.ratingMin)) return false;     // 评分 ≥ 下限
  if (f.ratingMax != null && !(rt != null && rt <= f.ratingMax)) return false;     // 评分 ≤ 上限
  if (f.reviewsMin != null && !((item.reviews || 0) >= f.reviewsMin)) return false; // 评论数 ≥ 下限
  if (f.reviewsMax != null && !((item.reviews || 0) <= f.reviewsMax)) return false; // 评论数 ≤ 上限
  if (f.q) {                                                                       // 标题/ASIN 含关键词
    const s = String(f.q).toLowerCase();
    if (!String(item.title || '').toLowerCase().includes(s) && !String(item.asin || '').toLowerCase().includes(s)) return false;
  }
  if (f.badges && f.badges.length) {                                               // 页面标识: 商品含任一勾选标识
    if (!f.badges.some((b) => itemMatchesBadge(item, b))) return false;
  }
  const tc = item.trademarkCount || 0;
  if (f.tmMin != null && f.tmMax != null) { if (tc >= f.tmMin && tc <= f.tmMax) return false; }  // 商标数在区间内 → 排除
  else if (f.tmMin != null && tc >= f.tmMin) return false;                                        // 商标数 ≥ N 排除
  else if (f.tmMax != null && tc <= f.tmMax) return false;                                        // 商标数 ≤ N 排除
  if (f.tmCountries) {                                                             // 商标国家排除 (欧盟/英国/美国/德国/日本...)
    const list = String(f.tmCountries).split(/[,，]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const itemC = String((item.tmCountries || []).join(' ')).toLowerCase();
    if (list.some((c) => itemC.includes(c))) return false;
  }
  if (f.category) {                                                                // 类目含关键词
    if (!String(item.category || '').toLowerCase().includes(String(f.category).toLowerCase())) return false;
  }
  // 类目排除法 (与商品管理同一语义): 命中 catPath/category 任一关键词即跳过
  if (f.categoryNot && f.categoryNot.length) {
    const c = String(item.catPath || item.category || '').toLowerCase() + ' | ' + String(item.category || '').toLowerCase();
    if (f.categoryNot.some((k) => c.includes(String(k).toLowerCase()))) return false;
  }
  // 跟卖数区间 (与商品管理同一语义)
  if (f.followMin != null && !((item.followCount || 0) >= f.followMin)) return false;
  if (f.followMax != null && !((item.followCount || 0) <= f.followMax)) return false;
  // 卖家维度: 排除亚马逊自营
  if (f.noAmz === true && item.amazonSell) return false;
  // 无排名 (与商品管理同一语义): 已有 rank/bsr 的跳过
  if (f.noRank === true) {
    const hasRank = !!(item.rank && item.rank !== '-' && item.rank !== 'null');
    const hasBsr = Array.isArray(item.bsr) && item.bsr.length > 0;
    if (hasRank || hasBsr) return false;
  }
  if (f.sites && f.sites.length && item.site && !f.sites.includes(item.site)) return false; // 站点多选 (勾选之外跳过)
  else if (f.site && item.site && item.site !== f.site) return false;              // 旧字段兼容: 单站点
  if (f.salesMin != null) {                                                        // 月销量 ≥ N (未采到销量=0 → 跳过)
    if (!((item.monthlySales || 0) >= f.salesMin)) return false;
  }
  if (f.salesMax != null && !((item.monthlySales || 0) <= f.salesMax)) return false; // 月销量 ≤ N
  if (f.is1688 === '1' && !item.is1688) return false;                              // 1688 同款: 仅有 (未知视为无 → 跳过)
  if (f.is1688 === '0' && item.is1688) return false;                               // 1688 同款: 排除
  if (f.brandStatus === 'registered' && item.brandStatus === 'registered') return false; // 品牌状态: 排除已备案
  if (f.brandStatus === 'notfound' && item.brandStatus !== 'notfound') return false;      // 品牌状态: 仅未查到
  if (f.brandStatus === 'tm' && (item.tmMark || /TM|注册商标/.test(item.brandStatus || ''))) return false; // 品牌状态: 排除TM申请中
  if (f.newDaysMin != null || f.newDaysMax != null) {                              // 上架天数区间 (新品)
    const d = parseFirstAvailable(item.firstAvailable);
    if (!d) return false;
    const days = (Date.now() - d.getTime()) / 86400000;
    if (f.newDaysMin != null && days < f.newDaysMin) return false;
    if (f.newDaysMax != null && days > f.newDaysMax) return false;
  } else if (f.newDays != null) {                                                  // 旧字段兼容: 上架 ≤ N 天
    const d = parseFirstAvailable(item.firstAvailable);
    if (!d || (Date.now() - d.getTime()) > f.newDays * 86400000) return false;
  }
  return true;
}

// 过滤条件是否需要读详情页才能判断 (配送/A+/排名/评分/评论/销量/商标/上架/标识/类目)
// 列表页可判的只有: 价格/关键词/1688/站点 (及 bulk/catmenu 提取的 badge)
function filterNeedsDetail(filter) {
  if (!filter) return false;
  return !!(filter.fulfill || filter.aplus || filter.rankMin != null || filter.rankMax != null
    || filter.ratingMin != null || filter.ratingMax != null || filter.reviewsMin != null || filter.reviewsMax != null
    || filter.salesMin != null || filter.salesMax != null || filter.tmMin != null || filter.tmMax != null
    || filter.newDaysMin != null || filter.newDaysMax != null || filter.newDays != null
    || (filter.badges && filter.badges.length) || filter.category);
}

// ===== 统一过滤条件 (单一 schema) =====
// 商品管理筛选 与 采集过滤 共用这一套字段: 一个面板、一份序列化、两个后端适配器。
//   canonical → /api/products?filter=<json>   (查商品库)
//   canonical → canonicalToCollectFilter()    (采集时逐商品判定, 复用 applyCollectFilter)
// 语义差异(有意保留): 采集时"未知字段"放行(详情页读到后再判), 商品库里未知字段视为不满足。
function normFilter(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = (v) => (v == null ? '' : String(v).trim());
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : (v ? String(v).split(/[,，\s]+/).filter(Boolean) : []));
  return {
    sites: arr(r.sites).map((x) => x.toLowerCase()),
    fulfill: s(r.fulfill),                                   // '' | FBA | FBM | AMZ
    sell: s(r.sell),                                         // '' | amz(自营) | third(第三方) — 与 fulfill=AMZ 等价, 保留工具栏兼容
    aplus: s(r.aplus),                                       // '' | 1(仅有) | 0(排除)
    badges: arr(r.badges),
    china: s(r.china),                                       // '' | 1 | 0
    noRank: r.noRank === true || r.noRank === '1' || r.noRank === 1,
    priceRange: s(r.priceRange), salesRange: s(r.salesRange), rankRange: s(r.rankRange),
    ratingRange: s(r.ratingRange), reviewsRange: s(r.reviewsRange), followRange: s(r.followRange),
    tmRange: s(r.tmRange), newDaysRange: s(r.newDaysRange),
    tmCountries: s(r.tmCountries), is1688: s(r.is1688), brandStatus: s(r.brandStatus),
    q: s(r.q), catNot: arr(r.catNot), catKw: s(r.catKw),
    collectedFrom: s(r.collectedFrom), collectedTo: s(r.collectedTo),
    shopAplus: s(r.shopAplus), brandShop: s(r.brandShop), brandStore: s(r.brandStore),   // 仅采集(店铺维度)
  };
}
const FILTER_KEYS = Object.keys(normFilter({}));
// 该过滤条件里"实际生效"的字段数 (用于前端显示"已启用 N 项")
function filterActiveCount(raw) {
  const f = normFilter(raw);
  let n = 0;
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (Array.isArray(v)) { if (v.length) n++; }
    else if (typeof v === 'boolean') { if (v) n++; }
    else if (v !== '') n++;
  }
  return n;
}
// 区间字符串 "10-100" / "10-" / "-100" / "50" → {min,max} (与采集侧 rng 完全同一实现)
function rngRange(v) {
  const s = String(v == null ? '' : v).trim().replace(/[，。\s]/g, '');
  if (!s) return { min: null, max: null };
  const m = s.match(/^(-?\d*\.?\d*)-(-?\d*\.?\d*)$/);
  if (m) return { min: m[1] === '' || m[1] === '-' ? null : parseFloat(m[1]), max: m[2] === '' ? null : parseFloat(m[2]) };
  const n = parseFloat(s);
  return isNaN(n) ? { min: null, max: null } : { min: n, max: null };
}
// 统一过滤条件 → 商品库查询参数 (沿用 /api/products 既有参数名, 复用其全部解析逻辑)
function filterToQuery(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.sites.length) p.set('site', f.sites.join(','));
  if (f.fulfill === 'AMZ') p.set('sell', 'amz');
  else if (f.fulfill === 'FBA' || f.fulfill === 'FBM') p.set('fba', f.fulfill);
  else if (f.sell === 'amz' || f.sell === 'third') p.set('sell', f.sell);   // 卖家维度 (自营/第三方)
  if (f.aplus) p.set('aplus', f.aplus);
  if (f.badges.length) p.set('badges', f.badges.join(','));
  if (f.china !== '') p.set('china', f.china);
  if (f.noRank) p.set('noRank', '1');
  if (f.priceRange) p.set('priceRange', f.priceRange);
  if (f.salesRange) p.set('salesRange', f.salesRange);
  if (f.rankRange) p.set('rankRange', f.rankRange);
  if (f.ratingRange) p.set('ratingRange', f.ratingRange);
  if (f.reviewsRange) p.set('reviewsRange', f.reviewsRange);
  if (f.followRange) p.set('followRange', f.followRange);
  if (f.tmRange) p.set('tmRange', f.tmRange);
  if (f.newDaysRange) p.set('newDaysRange', f.newDaysRange);
  if (f.tmCountries) p.set('tmCountries', f.tmCountries);
  if (f.is1688 !== '') p.set('is1688', f.is1688);
  if (f.brandStatus) p.set('brandStatus', f.brandStatus);
  const catNot = f.catNot.concat(String(f.catKw || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean));
  if (catNot.length) p.set('categoryNot', catNot.join(','));
  if (f.collectedFrom) p.set('collectedFrom', f.collectedFrom);
  if (f.collectedTo) p.set('collectedTo', f.collectedTo);
  return p;
}
// 统一过滤条件 → 采集过滤对象 (字段名与 applyCollectFilter 期望一致)
function canonicalToCollectFilter(raw) {
  const f = normFilter(raw);
  const filter = {};
  const put = (r, kmin, kmax) => { const x = rngRange(r); if (x.min != null) filter[kmin] = x.min; if (x.max != null) filter[kmax] = x.max; };
  put(f.rankRange, 'rankMin', 'rankMax');
  put(f.priceRange, 'priceMin', 'priceMax');
  put(f.ratingRange, 'ratingMin', 'ratingMax');
  put(f.reviewsRange, 'reviewsMin', 'reviewsMax');
  put(f.salesRange, 'salesMin', 'salesMax');
  put(f.tmRange, 'tmMin', 'tmMax');
  put(f.followRange, 'followMin', 'followMax');
  put(f.newDaysRange, 'newDaysMin', 'newDaysMax');
  if (f.fulfill) filter.fulfill = f.fulfill;
  else if (f.sell === 'amz') filter.fulfill = 'AMZ';
  else if (f.sell === 'third') filter.noAmz = true;      // 排除亚马逊自营
  if (f.aplus === '1') filter.aplus = true;
  else if (f.aplus === '0') filter.aplus = false;
  if (f.q) filter.q = f.q;
  const badges = f.badges.slice();
  if (f.aplus === '1' && badges.indexOf('A+') < 0) badges.push('A+');
  if (badges.length) filter.badges = badges;
  const catNot = f.catNot.concat(String(f.catKw || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean));
  if (catNot.length) filter.categoryNot = catNot;
  if (f.tmCountries) filter.tmCountries = f.tmCountries;
  if (f.sites.length) filter.sites = f.sites;
  if (f.is1688 === '1' || f.is1688 === '0') filter.is1688 = f.is1688;
  if (f.brandStatus) filter.brandStatus = f.brandStatus;
  if (f.noRank) filter.noRank = true;
  if (f.china === '1') filter.china = true;
  else if (f.china === '0') filter.china = false;
  return filter;
}
// 旧规则(legacy filter* 字段) → 统一过滤条件 (兼容已保存的采集规则)
function legacyToCanonical(j) {
  const s = (v) => (v == null ? '' : String(v));
  const badges = Array.isArray(j.filterBadges) ? j.filterBadges.slice() : (j.filterBadge ? [j.filterBadge] : []);
  let aplus = s(j.filterAplus);
  const bi = badges.findIndex((b) => String(b).toLowerCase() === 'a+');
  if (bi >= 0) { aplus = '1'; badges.splice(bi, 1); }
  return normFilter({
    sites: j.filterSites || (j.filterSite ? [j.filterSite] : []),
    fulfill: s(j.filterFulfill), aplus, badges,
    priceRange: s(j.filterPriceRange), salesRange: s(j.filterSalesRange), rankRange: s(j.filterRankRange),
    ratingRange: s(j.filterRatingRange), reviewsRange: s(j.filterReviewsRange), tmRange: s(j.filterTmRange),
    newDaysRange: s(j.filterNewDaysRange), tmCountries: s(j.filterTmCountries), is1688: s(j.filterIs1688),
    brandStatus: s(j.filterBrandStatus), q: s(j.filterQ),
    catKw: s(j.filterCategory), shopAplus: s(j.filterShopAplus), brandShop: s(j.filterBrandShop), brandStore: s(j.filterBrandStore),
  });
}

// 从请求体构建采集过滤条件 (字段名与前端采集弹窗一致)
function buildCollectFilter(j) {
  // 统一入口: 请求体带 canonical `filter` → 直接用它; 否则走旧 filter* 字段 (兼容旧前端/旧规则)
  if (j && j.filter && typeof j.filter === 'object' && (j.filter.sites || j.filter.fulfill || j.filter.priceRange || j.filter.q || j.filter.catNot || Object.keys(j.filter).length >= 2)) {
    return canonicalToCollectFilter(j.filter);
  }
  const filter = {};
  // 区间解析: "10-100" / "10-" / "-100" → {min,max}
  const rng = (v) => {
    const s = String(v == null ? '' : v).trim().replace(/[，。\s]/g, '');
    if (!s) return { min: null, max: null };
    const m = s.match(/^(-?\d*\.?\d*)-(-?\d*\.?\d*)$/);
    if (m) return { min: m[1] === '' || m[1] === '-' ? null : parseFloat(m[1]), max: m[2] === '' ? null : parseFloat(m[2]) };
    const n = parseFloat(s);
    return isNaN(n) ? { min: null, max: null } : { min: n, max: null };
  };
  const r1 = rng(j.filterRankRange), r2 = rng(j.filterPriceRange), r3 = rng(j.filterRatingRange), r4 = rng(j.filterReviewsRange), r5 = rng(j.filterSalesRange), r6 = rng(j.filterTmRange), r7 = rng(j.filterNewDaysRange);
  if (r1.min != null) filter.rankMin = r1.min;
  if (r1.max != null) filter.rankMax = r1.max;
  if (r2.min != null) filter.priceMin = r2.min;
  if (r2.max != null) filter.priceMax = r2.max;
  if (r3.min != null) filter.ratingMin = r3.min;
  if (r3.max != null) filter.ratingMax = r3.max;
  if (r4.min != null) filter.reviewsMin = r4.min;
  if (r4.max != null) filter.reviewsMax = r4.max;
  if (r5.min != null) filter.salesMin = r5.min;
  if (r5.max != null) filter.salesMax = r5.max;
  if (r6.min != null) filter.tmMin = r6.min;
  if (r6.max != null) filter.tmMax = r6.max;
  if (r7.min != null) filter.newDaysMin = r7.min;
  if (r7.max != null) filter.newDaysMax = r7.max;
  // 兼容旧字段 (旧规则/旧调用: filterRankMax/filterPriceMin 等单边)
  if (j.filterRankMax != null && j.filterRankMax !== '' && r1.min == null && r1.max == null) filter.rankMax = parseInt(j.filterRankMax, 10);
  if (j.filterPriceMin != null && j.filterPriceMin !== '' && r2.min == null && r2.max == null) filter.priceMin = parseFloat(j.filterPriceMin);
  if (j.filterPriceMax != null && j.filterPriceMax !== '' && r2.min == null && r2.max == null) filter.priceMax = parseFloat(j.filterPriceMax);
  if (j.filterRatingMin != null && j.filterRatingMin !== '' && r3.min == null && r3.max == null) filter.ratingMin = parseFloat(j.filterRatingMin);
  if (j.filterReviewsMin != null && j.filterReviewsMin !== '' && r4.min == null && r4.max == null) filter.reviewsMin = parseInt(j.filterReviewsMin, 10);
  if (j.filterSalesMin != null && j.filterSalesMin !== '' && r5.min == null && r5.max == null) filter.salesMin = parseInt(j.filterSalesMin, 10);
  if (j.filterTmMin != null && j.filterTmMin !== '' && r6.min == null && r6.max == null) filter.tmMin = parseInt(j.filterTmMin, 10);
  if (j.filterNewDays != null && j.filterNewDays !== '' && r7.min == null && r7.max == null) filter.newDays = parseInt(j.filterNewDays, 10);
  if (j.filterFulfill === 'FBA' || j.filterFulfill === 'FBM' || j.filterFulfill === 'AMZ') filter.fulfill = j.filterFulfill;
  if (j.filterAplus === '1') filter.aplus = true;      // 旧字段兼容 (现并入 badges.aplus)
  else if (j.filterAplus === '0') filter.aplus = false;
  if (j.filterQ) filter.q = String(j.filterQ).trim();
  // 页面标识多选 (badges): 商品含任一勾选标识即可 (A+/AC/BestSeller/NewRelease/Deal/...)
  if (Array.isArray(j.filterBadges) && j.filterBadges.length) filter.badges = j.filterBadges.filter((b) => typeof b === 'string' && b);
  else if (j.filterBadge) filter.badges = [j.filterBadge];  // 旧字段兼容
  if (j.filterTmCountries) filter.tmCountries = String(j.filterTmCountries).trim();
  if (j.filterCategory) filter.category = String(j.filterCategory).trim();
  // 站点多选: 勾选全部站点 (列表类采集取第一个为主站点; 跟卖店铺采集用于跨站回退)
  if (Array.isArray(j.filterSites) && j.filterSites.length) filter.sites = j.filterSites.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  else if (j.filterSite) filter.site = j.filterSite;  // 旧字段兼容
  if (j.filterIs1688 === '1' || j.filterIs1688 === '0') filter.is1688 = j.filterIs1688;
  if (j.filterBrandStatus) filter.brandStatus = j.filterBrandStatus;
  return filter;
}

// 统一过滤条件的中文描述 (单一实现, 前端两个页面共用同一文案)
function filterDescCanonical(raw) {
  const f = normFilter(raw);
  const parts = [];
  const rf = (v, unit = '') => { const r = rngRange(v); return r.min != null && r.max != null ? `${r.min}-${r.max}${unit}` : r.min != null ? `≥${r.min}${unit}` : r.max != null ? `≤${r.max}${unit}` : ''; };
  if (f.sites.length) parts.push('站点:' + f.sites.join(','));
  if (f.fulfill) parts.push('配送=' + f.fulfill);
  else if (f.sell === 'amz') parts.push('仅AMZ自营');
  else if (f.sell === 'third') parts.push('仅第三方卖家');
  if (f.aplus === '1') parts.push('仅有A+');
  else if (f.aplus === '0') parts.push('排除A+');
  if (f.badges.length) parts.push('标识:' + f.badges.join('/'));
  if (f.china === '1') parts.push('中国卖家');
  else if (f.china === '0') parts.push('非中国卖家');
  if (f.noRank) parts.push('无排名');
  if (f.priceRange) parts.push('价:' + rf(f.priceRange));
  if (f.salesRange) parts.push('月销:' + rf(f.salesRange));
  if (f.rankRange) parts.push('BSR:' + rf(f.rankRange));
  if (f.ratingRange) parts.push('评分:' + rf(f.ratingRange));
  if (f.reviewsRange) parts.push('评论:' + rf(f.reviewsRange));
  if (f.followRange) parts.push('跟卖:' + rf(f.followRange));
  if (f.tmRange) parts.push('排除商标数:' + rf(f.tmRange));
  if (f.tmCountries) parts.push('排除商标国:' + f.tmCountries);
  if (f.newDaysRange) parts.push('上架:' + rf(f.newDaysRange) + '天');
  if (f.is1688 === '1') parts.push('有1688同款');
  else if (f.is1688 === '0') parts.push('排除1688同款');
  if (f.brandStatus) parts.push('品牌:' + ({ registered: '排除已备案', tm: '排除TM', notfound: '仅未查到' }[f.brandStatus] || f.brandStatus));
  if (f.q) parts.push('标题含「' + f.q + '」');
  const catNot = f.catNot.concat(String(f.catKw || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean));
  if (catNot.length) parts.push('排除类目:' + catNot.join('/'));
  if (f.collectedFrom || f.collectedTo) parts.push('采集时间:' + (f.collectedFrom || '…') + '~' + (f.collectedTo || '…'));
  if (f.shopAplus === '1') parts.push('仅有A+店铺');
  else if (f.shopAplus === '0') parts.push('排除A+店铺');
  if (f.brandShop === '1') parts.push('仅品牌店铺');
  else if (f.brandShop === '0') parts.push('排除品牌店铺');
  if (f.brandStore) parts.push('品牌店=' + f.brandStore);
  return parts.length ? parts.join(' + ') : '无过滤';
}

// 过滤条件中文描述 (通知/结果弹窗)
function filterDesc(filter) {
  if (!filter || !Object.keys(filter).length) return '无过滤';
  const parts = [];
  const fmt = (min, max, unit = '') => (min != null && max != null ? `${min}-${max}${unit}` : min != null ? `≥${min}${unit}` : max != null ? `≤${max}${unit}` : '');
  if (filter.fulfill) parts.push('配送=' + filter.fulfill);
  if (filter.aplus) parts.push('A+页面');
  if (filter.rankMin != null || filter.rankMax != null) parts.push('BSR:' + fmt(filter.rankMin, filter.rankMax));
  if (filter.priceMin != null || filter.priceMax != null) parts.push('价:' + fmt(filter.priceMin, filter.priceMax));
  if (filter.ratingMin != null || filter.ratingMax != null) parts.push('评分:' + fmt(filter.ratingMin, filter.ratingMax));
  if (filter.reviewsMin != null || filter.reviewsMax != null) parts.push('评论:' + fmt(filter.reviewsMin, filter.reviewsMax));
  if (filter.q) parts.push('关键词=' + filter.q);
  if (filter.badges && filter.badges.length) parts.push('标识:' + filter.badges.join(','));
  if (filter.tmMin != null || filter.tmMax != null) parts.push('排除商标:' + fmt(filter.tmMin, filter.tmMax));
  if (filter.tmCountries) parts.push('商标国家=' + filter.tmCountries + '排除');
  if (filter.salesMin != null || filter.salesMax != null) parts.push('月销:' + fmt(filter.salesMin, filter.salesMax));
  if (filter.is1688 === '1') parts.push('有1688同款');
  else if (filter.is1688 === '0') parts.push('排除1688同款');
  if (filter.brandStatus === 'registered') parts.push('排除已备案品牌');
  else if (filter.brandStatus === 'notfound') parts.push('仅未查到品牌');
  else if (filter.brandStatus === 'tm') parts.push('排除TM申请中');
  if (filter.newDaysMin != null || filter.newDaysMax != null) parts.push('上架:' + fmt(filter.newDaysMin, filter.newDaysMax) + '天');
  else if (filter.newDays != null) parts.push('上架≤' + filter.newDays + '天');
  if (filter.category) parts.push('类目=' + filter.category);
  if (filter.sites && filter.sites.length) parts.push('站点:' + filter.sites.join(','));
  else if (filter.site) parts.push('站点=' + filter.site);
  return parts.join(' + ');
}

// 列表页前置筛选 (宽松): 仅用列表页已有的字段判断 (插件 FBA/FBM 标签、插件排名、标题关键词、站点)
// 列表页无数据的字段 (评分/评论/A+/商标/类目/原生价格) 不在此判断 — 保留到详情页补全后再用 applyCollectFilter 完整筛
// 与 applyCollectFilter 的区别: 字段未知(null)视为"保留待详情确认", 不误杀
function preFilterByList(item, filter) {
  if (!filter || !Object.keys(filter).length) return true;
  const f = filter;
  if (f.fulfill === 'AMZ') { if (!item.amazonSell) return false; }
  else if (f.fulfill && item.fulfill && item.fulfill !== f.fulfill) return false;   // 插件标签明确不匹配 → 筛掉; 无标签 → 保留
  if (f.rankMax != null) {
    const maxR = Array.isArray(item.bsr) && item.bsr.length ? Math.max(...item.bsr.map((b) => b.rank)) : null;
    if (maxR != null && maxR > f.rankMax) return false;                            // 插件有排名且超限 → 筛掉; 无排名 → 保留
  }
  if (f.is1688 === '1' && !item.is1688) return false;                              // 1688 同款: 列表页标签已知, 无标签直接筛掉
  if (f.q) {
    const s = String(f.q).toLowerCase();
    if (!String(item.title || '').toLowerCase().includes(s) && !String(item.asin || '').toLowerCase().includes(s)) return false;
  }
  if (f.sites && f.sites.length && item.site && !f.sites.includes(item.site)) return false;
  if (f.site && item.site && item.site !== f.site) return false;
  return true;
}

// 单个商品详情补全 (价格/品牌/评分/评论/A+/配送/BSR/类目) + 采集过滤标记 (供列表类采集复用)
async function cdpEnrichOne(send, host, it, filter) {
  try {
    await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin });
    await new Promise((r) => setTimeout(r, 7000));
    for (let s = 0; s < 2; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 2000})` }); await new Promise((r) => setTimeout(r, 500)); }
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = { price: null, brand: null, rating: null, reviews: null, aplus: false, fulfill: null, bsr: [], category: null, amazonSell: false, mainImage: null };
        const sels = ['#corePrice_feature_div .a-offscreen', '.apex-pricetopay-value', '#price_inside_buybox', '.a-price .a-offscreen'];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (el) {
            const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
            const m = t.match(/(?:€|£|\\$|¥|EUR|GBP|USD)\\s*([\\d.,]+)/);
            if (m) { out.price = parseFloat(m[1].replace(/,/g, '')); break; }
          }
        }
        const b = document.querySelector('#bylineInfo a, #bylineInfo_feature_div a');
        if (b) { let bt = b.textContent.trim().replace(/\\s+/g, ' ').replace(/^Brand:\\s*/i, '').trim(); if (bt && bt.length > 1 && bt.length < 60) out.brand = bt; }
        const rEl = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
        if (rEl) { const m = rEl.textContent.match(/([\\d.,]+)\\s*out of/); if (m) out.rating = parseFloat(m[1].replace(',', '.')); }
        const revEl = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
        if (revEl) { const m = revEl.textContent.match(/([\\d.,]+)/); if (m) out.reviews = parseInt(m[1].replace(/[.,]/g, ''), 10); }
        // 卖家/配送/自营/A+/主图/币种/类目/BSR: 共用单一实现 (见 DETAIL_CORE_JS), 与跟卖店铺链/详情修复/品牌采集保持一致
        ${DETAIL_CORE_JS}
        // BSR: 已由 DETAIL_CORE_JS 的统一解析器写入 out.bsr (旧的"单元格正则 + 全文兜底"两段实现已删除 —
        //      它会把第 2 条 BSR 之后的所有行吞进类目名并丢掉后续条目, 实测造成 599 条脏数据)
        // 类目层级 (面包屑) 已由 DETAIL_CORE_JS 统一提取 → out.cat1/cat2/cat3/catPath/category
        // 卖点: 商品描述要点 (#feature-bullets 或 #productDescription)
        out.sellingPoint = [];
        const bullets = document.querySelector('#feature-bullets ul, #feature-bullets');
        if (bullets) {
          bullets.querySelectorAll('li span.a-list-item, li').forEach((li) => {
            const t = (li.textContent || '').replace(/\\s+/g, ' ').trim();
            if (t && t.length > 3 && t.length < 300) out.sellingPoint.push(t);
          });
        }
        if (!out.sellingPoint.length) {
          const pd = document.querySelector('#productDescription');
          if (pd) { const t = (pd.textContent || '').replace(/\\s+/g, ' ').trim(); if (t) out.sellingPoint.push(t.slice(0, 500)); }
        }
        out.sellingPoint = out.sellingPoint.slice(0, 12);
        // 概要: 商品信息表 (productDetails 标签值对)
        out.productOverview = [];
        document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, table.prodDetTable tr').forEach((tr) => {
          const th = tr.querySelector('th');
          const td = tr.querySelector('td');
          if (!th || !td) return;
          const k = th.textContent.replace(/\\s+/g, ' ').trim();
          const v = td.textContent.replace(/\\s+/g, ' ').trim();
          if (k && v && !/best sellers rank/i.test(k) && !/customer reviews/i.test(k)) out.productOverview.push({ k: k.slice(0, 40), v: v.slice(0, 120) });
        });
        out.productOverview = out.productOverview.slice(0, 30);
        return JSON.stringify(out);
      })()`, returnByValue: true,
    });
    const d = JSON.parse(r.result.value);
    if (d.price != null) it.price = d.price;
    if (d.brand) it.brand = d.brand;
    if (d.rating != null) it.rating = d.rating;
    if (d.reviews != null) it.reviews = d.reviews;
    if (d.aplus) it.aplus = true;
    if (d.fulfill) it.fulfill = d.fulfill;
    if (d.bsr && d.bsr.length) it.bsr = d.bsr;
    if (d.category) it.category = d.category;
    if (d.amazonSell) it.amazonSell = true;
    if (d.mainImage) it.mainImage = d.mainImage;
    if (d.sellingPoint && d.sellingPoint.length) it.sellingPoint = d.sellingPoint;
    if (d.productOverview && d.productOverview.length) it.productOverview = d.productOverview;
    // ===== 详情页读到即判定 (与「详情修复」「批量品牌采集」同一套字段, 否则入库缺 detailOk/类目层级/主卖家) =====
    // 缺这段会导致: 详情页明明读到了, 入库却没有 detailOk(详情未核实) / cat1-3(无法按一级二级类目筛选) / 主卖家
    if (d.detailOk) {
      it.detailOk = true; it.detailAt = now(); it.detailVer = DETAIL_VER;
      it.aplus = !!d.aplus;                                   // 读到页面即可判定 true/false (不再是"只写 true")
      if (d.regionText) {
        it.amazonSell = !!d.amazonSell;
        if (d.fulfill) it.fulfill = d.fulfill;                 // 未读到配送证据 → 保持 null (未知, 不猜 FBM)
        it.sellerRegion = d.regionText.slice(0, 200);
      }
      if (d.mainSeller) it.mainSeller = d.mainSeller;
      if (siteSymbolOk(d.curSymbol, it.site || host)) it.priceSymbol = d.curSymbol;
      if (d.catPath) { it.catPath = d.catPath; it.cat1 = d.cat1; it.cat2 = d.cat2; it.cat3 = d.cat3; it.catNodes = d.catNodes || null; it.catSrc = 'bc'; it.catAt = now(); }
      it.currency = siteCurrency(it.site || 'uk');
    }
  } catch (e) {
    console.error('[enrich]', it.asin, '详情补全异常:', e && e.message);
  }
  it.__skip = !applyCollectFilter(it, filter);
}

// ===== 列表页公共工具: glow 地址设置 + 卡片提取 JS (list-direct / list-filtered 共用) =====
const SITE_ZIP = { uk: ['GB', 'SW1A1AA'], us: ['US', '10001'], de: ['DE', '10115'], fr: ['FR', '75001'], it: ['IT', '00100'], es: ['ES', '28001'], jp: ['JP', '100-0001'], ca: ['CA', 'M5V2T6'], in: ['IN', '110001'], au: ['AU', '2000'], mx: ['MX', '06600'], br: ['BR', '01310-100'], nl: ['NL', '1011'], se: ['SE', '11157'], pl: ['PL', '00-001'] };
// 自动设置目标国家配送地址 (Amazon glow API): 确保 FBA 配送/税费/可配送判断正确
// 注: 智赢插件的人民币价格不随配送地址变化 (插件有独立币种设置), 设置地址是为采集数据准确性
async function cdpSetGlowAddress(send, url, site, customZip) {
  try {
    const z = SITE_ZIP[site];
    if (!z) return false;
    // customZip: 用户输入邮编 (任意国家/地区), 覆盖站点默认邮编 — 采集"任何邮编的商品网页"
    const zip = String(customZip || '').trim() || z[1];
    const glowRes = await send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const r = await fetch('/portal-migration/hz/glow/address-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: 'locationType=LOCATION_INPUT&zipCode=${zip}&deviceType=web&storeContext=generic&pageType=Gateway&actionSource=glow',
            credentials: 'include'
          });
          const j = await r.json();
          return JSON.stringify({ ok: r.ok, valid: j.isValidAddress, updated: j.isAddressUpdated, country: j.address && j.address.countryCode, zip: j.address && j.address.zipCode });
        } catch (e) { return JSON.stringify({ error: e.message }); }
      })()`, returnByValue: true, awaitPromise: true,
    });
    const g = JSON.parse(glowRes.result.value);
    if (g.updated) {
      // 地址变更生效: 重载站点首页落地国家/配送地址 (直接导航 aod 页可能触发 icp 国家落地重定向),
      // 首页落地后再由调用方导航目标页
      const home = 'https://www.amazon.' + siteToHostSuffix(site) + '/';
      await send('Page.navigate', { url: home });
      await new Promise((r) => setTimeout(r, 9000));
      return true;
    }
    return false;
  } catch (e) { console.error('[glow]', '设置配送地址失败:', e && e.message); return false; }
}

// 列表卡片提取 JS: 原生字段 (ASIN/标题/图片/评分/链接) + 智赢插件字段 (FBA/卖家数/排名/1688/人民币价)
// 模板字符串常量 (内部无反引号), 供列表页直采/筛选采集在浏览器上下文执行
const LIST_CARD_EXPR = `(() => {
  const out = [];
  const seen = new Set();
  document.querySelectorAll('div[data-asin]').forEach(el => {
    const asin = el.getAttribute('data-asin');
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) return;
    seen.add(asin);
    // 过滤 Sponsored 广告卡片: aax 跳转/sspa/sparkle 特征 (插件不分析广告, 价格/标题结构也不同)
    if (el.querySelector('a[href*="aax-"], a[href*="sspa"], a[href*="sparkle"]')) return;
    // 真实商品链接: /dp/ 须在域名路径中 (aax 广告长 URL 也可能含 /dp/ 子串)
    const lk = [...el.querySelectorAll('a')].find((a) => {
      const h = a.getAttribute('href') || '';
      return /\\/dp\\/[A-Z0-9]{10}/.test(h) && !/aax-|sspa|sparkle/.test(h);
    });
    if (!lk) return;
    // 标题: h2 优先, 变体卡片等特殊结构用 .a-color-base.a-text-normal, 再兜底 /dp/ 链接文本
    let title = '';
    const t = el.querySelector('h2 span, h2, .a-color-base.a-text-normal');
    if (t) title = t.textContent.trim();
    if (!title) title = (lk.getAttribute('title') || lk.textContent || '').trim();
    const img = el.querySelector('.s-image, img');
    const ratingEl = el.querySelector('.a-icon-alt');
    // 插件: 配送标签 (FBA/FBM/卖家:N)
    const ship = [...el.querySelectorAll('.zying-tag-ship')].map(x => (x.textContent || '').trim()).filter(Boolean);
    const shipTxt = ship.join(' ');
    const fulfill = /FBM/.test(shipTxt) ? 'FBM' : /FBA/.test(shipTxt) ? 'FBA' : null;
    const sellerM = shipTxt.match(/卖家[:：]\\s*(\\d+)/);
    // 插件: 排名标签 (#5397 #38)
    const rankList = [...el.querySelectorAll('.ranktag')]
      .map(x => (x.textContent || '').trim())
      .map(x => { const m = x.match(/#?([\\d.,]+)/); return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : null; })
      .filter(x => x != null);
    // 插件: 1688 同款标记 (shadow 容器文本) + 跳转链接 (优先标签静态链接, 无则构造 1688 搜索链接)
    let is1688 = false;
    let is1688Url = null;
    const zy1688 = el.querySelector('.zying-1688tag-wrap, .zying-shadow-root');
    if (zy1688) {
      is1688 = (zy1688.textContent || '').includes('1688同款');
      if (is1688) {
        const lk1688 = zy1688.querySelector('a[href]');
        if (lk1688) is1688Url = lk1688.getAttribute('href') || null;
        if (!is1688Url) {
          // 兜底: 标签包裹容器上的 data-* 链接属性
          const wrap = el.querySelector('.zying-1688tag-wrap') || zy1688;
          if (wrap) { const d = wrap.getAttribute('data-url') || wrap.getAttribute('data-href') || wrap.getAttribute('href'); if (d) is1688Url = d; }
        }
      }
    }
    // 页面标识: Best Seller / Amazon's Choice / New Release / Deal / Overall Pick / Editor's Pick / Top Rated / 气候友好 / 小企业 / #1 Best Seller
    let badge = null;
    const detectBadge = (t) => {
      if (/Amazon's Choice/i.test(t)) return 'choice';
      if (/#1 Best Seller/i.test(t)) return 'bestseller1';
      if (/^Best Seller/i.test(t) || /Best Seller in/i.test(t)) return 'bestseller';
      if (/New Release/i.test(t)) return 'newrelease';
      if (/Deal of the Day/i.test(t)) return 'dealday';
      if (/Limited time deal/i.test(t)) return 'deal';
      if (/Overall Pick/i.test(t)) return 'overallpick';
      if (/Editor'?s Pick/i.test(t)) return 'editorspick';
      if (/Top Rated/i.test(t)) return 'toprated';
      if (/Climate Pledge Friendly/i.test(t)) return 'climate';
      if (/Small Business/i.test(t)) return 'smallbusiness';
      return null;
    };
    const bEl = el.querySelector('[id*="acBadge"], .ac-badge, [class*="badge"], img[alt*="Choice"], img[alt*="Bestseller"], [id*="bestseller"]');
    if (bEl) badge = detectBadge((bEl.textContent || bEl.getAttribute('alt') || '').trim().replace(/\\s+/g, ' '));
    if (!badge) badge = detectBadge((el.textContent || '').slice(0, 800));
    // 价格: 插件替换为人民币, 支持 人民币/CNY/¥ 三种前缀 (原生币种价列表页不可得)
    let priceCny = null;
    const prEl = el.querySelector('.a-price .a-offscreen');
    if (prEl) {
      const m = (prEl.textContent || '').trim().match(/(?:人民币|CNY|¥)\\s*([\\d.,]+)/);
      if (m) priceCny = parseFloat(m[1].replace(/,/g, ''));
    }
    out.push({
      asin, title: title.slice(0, 250),
      link: lk.href,
      img: img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : null,
      rating: ratingEl ? (() => { const m = (ratingEl.textContent || '').match(/([\\d.,]+)\\s*out of/); return m ? parseFloat(m[1].replace(',', '.')) : null; })() : null,
      fulfill, sellerCount: sellerM ? parseInt(sellerM[1], 10) : null,
      bsr: rankList, is1688, is1688Url: is1688Url || (is1688 ? 'https://s.1688.com/selloffer/offer_search.htm?keywords=' + encodeURIComponent((title || '').slice(0, 60)) : null), priceCny, badge,
    });
  });
  return JSON.stringify(out);
})()`;

// ===== 列表页直采: 不跳详情页, 直接读列表页所有商品 + 智赢插件注入信息 (FBA/排名/卖家数/1688同款) =====
// 输入: 任意 amazon 列表页 URL (搜索 / 类目 / 店铺, 如 /s?k=Car+Accessories&i=automotive...)
// 插件数据说明: 智赢插件会把列表页价格替换为人民币并注入 FBA/排名/卖家数/1688 标签;
// 原生币种价格在列表页 DOM 中不可得 → price 入库为 null, 人民币价存 priceCny 仅作参考
async function cdpListDirectCollect(url, opts = {}) {
  const maxItems = Math.min(200, Math.max(1, opts.maxItems || 100));
  const maxPages = Math.min(10, Math.max(1, opts.maxPages || 1));   // 列表页翻页 (免手动跳转, 一次采多页)
  const waitPluginMs = Math.min(30000, Math.max(0, opts.waitPluginMs != null ? opts.waitPluginMs : 15000)); // 等插件分析渲染
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('amazon')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);

  // ① 导航到列表页 (首页) + 自动设置目标国家配送地址 (glow API)
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 9000));
  await cdpSetGlowAddress(send, url, site);

  // ② 翻页提取: 商品 DOM 服务端渲染 (当前页所有商品不滚动即存在), 完全无需滚动
  // 智赢插件数据 (FBA/排名/卖家数) 随时间自动分析 (约 12-15s), 滚动不增加覆盖 → 不滚动直接提取
  // 每页: 等待插件分析 → LIST_CARD_EXPR 提取 → 跨页去重
  const all = [];
  const seenAsin = new Set();
  for (let pg = 1; pg <= maxPages && all.length < maxItems; pg++) {
    if (collectStopRequested()) break;
    const pgUrl = pg === 1 ? url : (/\bpage=\d+/.test(url) ? url.replace(/\bpage=\d+/, 'page=' + pg) : url + (url.includes('?') ? '&' : '?') + 'page=' + pg);
    if (pg > 1) {
      await send('Page.navigate', { url: pgUrl });
      await new Promise((r) => setTimeout(r, 8000));
    }
    // 等待插件渲染数据 (分析商品需要时间, 默认 15s, 可调)
    await new Promise((r) => setTimeout(r, waitPluginMs));
    const r = await send('Runtime.evaluate', { expression: LIST_CARD_EXPR, returnByValue: true });
    let items = [];
    try { items = JSON.parse(r.result.value); } catch (e) { throw new Error('列表页解析失败: ' + e.message); }
    const fresh = items.filter((x) => !seenAsin.has(x.asin));
    fresh.forEach((x) => seenAsin.add(x.asin));
    all.push(...fresh);
    bumpCollectProgress({ step: '翻页采集', items: all.length, page: pg, pages: maxPages, rounds: pg });
    if (items.length < 16) break; // 无更多页
  }
  if (!all.length) throw new Error('列表页未提取到商品 (可能需登录或页面结构变化)');
  const list = all.slice(0, maxItems);
  const pagesDone = Math.min(maxPages, Math.max(1, Math.ceil(all.length / 16)));

  // ⑤ 入库: 新增 (source=cdp-list-direct); 已存在 → 仅更新插件字段, 不覆盖已有真实价格
  const used = new Set(products.map((x) => x.asin));
  let added = 0;
  let updatedCount = 0;
  const imported = [];
  for (const p of list) {
    const existing = products.find((x) => x.asin === p.asin);
    const summary = { asin: p.asin, title: (p.title || '').slice(0, 80), priceCny: p.priceCny, fulfill: p.fulfill, sellerCount: p.sellerCount, bsr: p.bsr, is1688: p.is1688, rating: p.rating };
    if (existing) {
      updatedCount++;
      if (p.fulfill) existing.fulfill = p.fulfill;
      if (p.sellerCount != null) existing.followCount = p.sellerCount;
      if (p.bsr && p.bsr.length) {
        existing.bsr = p.bsr.map((rank) => ({ rank, category: 'ListPage' }));
        existing.rank = '#' + Math.max(...p.bsr);
      }
      if (p.is1688) existing.is1688 = true;
      if (p.is1688Url && !existing.is1688Url) existing.is1688Url = p.is1688Url;
      if (!existing.mainImage && p.img) existing.mainImage = p.img;
      if (existing.priceCny == null && p.priceCny != null) existing.priceCny = p.priceCny;
      imported.push({ ...summary, status: 'updated' });
      continue;
    }
    used.add(p.asin);
    const item = {
      id: p.asin, asin: p.asin,
      rank: p.bsr && p.bsr.length ? '#' + Math.max(...p.bsr) : null,
      title: p.title, brand: 'Unknown', brandStatus: 'unchecked',
      bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
      followCount: p.sellerCount || 0, chinaSeller: false,
      fulfill: p.fulfill || 'FBM', amazonSell: false, mainSeller: null,
      mainImage: p.img || null, offerPrices: null,
      price: null, currency: siteCurrency(site),
      priceCny: p.priceCny || null,      // 人民币参考价 (插件替换, 原生币种价列表页不可得)
      monthlySales: 0, reviews: 0, rating: p.rating || 4, stock: 0,
      listedAt: new Date().toISOString().slice(0, 10),
      bsr: (p.bsr || []).map((rank) => ({ rank, category: 'ListPage' })),
      variations: 0, variants: null, referralFee: 0, netProfit: 0,
      site, category: 'ListDirect', collectedAt: now(), source: 'cdp-list-direct',
      saved: false, real: true, is1688: p.is1688 || false, is1688Url: p.is1688Url || null, badge: p.badge || null,
    };
    products.unshift(item);
    added++;
    imported.push({ ...summary, status: 'added' });
  }
  if (added > 0 || updatedCount > 0) save('products.json', products);
  return { site, url, maxPages, pagesDone, total: all.length, productCount: list.length, added, products: imported };
}

// ===== 列表页筛选采集: 列表页直采(含插件信息) → 采集筛选前置过滤 → 只跳转通过筛选的商品取详情页数据 =====
// 流程: 列表页翻页提取(插件 FBA/排名/卖家数/1688) → preFilterByList 前置筛(可用字段) →
//       只对通过者跳详情页: cdpEnrichOne(价格/品牌/评分/评论/A+/配送/BSR/类目/主图) + 需要时 cdpReadOnePanel(商标/销量) + aod 跟卖 →
//       详情页 applyCollectFilter 完整筛(评分/评论/A+/商标/类目/价格) → 入库
async function cdpListFilteredCollect(url, opts = {}) {
  const maxItems = Math.min(200, Math.max(1, opts.maxItems || 100));
  const maxPages = Math.min(10, Math.max(1, opts.maxPages || 1));   // 列表页翻页上限
  const waitPluginMs = Math.min(30000, Math.max(0, opts.waitPluginMs != null ? opts.waitPluginMs : 15000));
  const filter = opts.filter || {};
  // 商标信息 (商标数/商标国家: "品牌已在如下国家注册") 来自详情页插件面板, 列表页无此数据
  // → 详情补全时默认读取插件面板 (panel=false 可关闭, 节省耗时); 设置了商标筛选时强制读取
  const needPanel = opts.panel !== false || !!((filter.tmMin != null) || (filter.tmMax != null) || filter.tmCountries);
  const withAod = opts.aod !== false;                               // 详情后采 aod 跟卖 (默认开)
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
  const host = 'www.amazon.' + siteToHostSuffix(site);
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('amazon')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);

  // ① 列表页翻页提取 (全部商品 + 插件信息)
  const all = [];
  const seenAsin = new Set();
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 9000));
  await cdpSetGlowAddress(send, url, site);
  for (let pg = 1; pg <= maxPages && all.length < maxItems; pg++) {
    if (collectStopRequested()) break;
    const pgUrl = pg === 1 ? url : (/\bpage=\d+/.test(url) ? url.replace(/\bpage=\d+/, 'page=' + pg) : url + (url.includes('?') ? '&' : '?') + 'page=' + pg);
    await send('Page.navigate', { url: pgUrl });
    await new Promise((r) => setTimeout(r, 8000));
    // 商品 DOM 服务端渲染 (无需滚动), 等待插件分析后直接提取
    await new Promise((r) => setTimeout(r, waitPluginMs));
    const r = await send('Runtime.evaluate', { expression: LIST_CARD_EXPR, returnByValue: true });
    let items = [];
    try { items = JSON.parse(r.result.value); } catch (e) { throw new Error('列表页解析失败: ' + e.message); }
    const fresh = items.filter((x) => !seenAsin.has(x.asin));
    fresh.forEach((x) => seenAsin.add(x.asin));
    all.push(...fresh);
    bumpCollectProgress({ step: '列表页采集', items: all.length, page: pg, pages: maxPages, rounds: pg });
    if (items.length < 16) break; // 无更多页
  }
  if (!all.length) throw new Error('列表页未提取到商品 (可能需登录或页面结构变化)');
  const listAll = all.slice(0, maxItems);
  // 等插件分析 (翻页后最后一批卡片)
  await new Promise((r) => setTimeout(r, waitPluginMs));

  // ② 前置筛选: 只用列表页已有字段 (插件 FBA/排名/标题/站点), 无数据字段留给详情页
  const preKept = [];
  for (const it of listAll) {
    it.site = site;
    if (preFilterByList(it, filter)) preKept.push(it);
  }

  // ③ 只对通过前置筛选的商品跳详情页补全 (价格/品牌/评分/评论/A+/配送/BSR/类目/主图 [+商标 +aod跟卖])
  const enriched = [];
  for (const it of preKept) {
    if (collectStopRequested()) break;
    try {
      // 插件配送标签 (智赢 API ShipByAmazon) 比 DOM 启发式判断可靠 — 详情补全后以插件标签为准
      const listFulfill = it.fulfill;
      await cdpEnrichOne(send, host, it, filter);   // 导航详情 + 原生字段 + __skip 完整筛选
      it.fulfill = listFulfill || it.fulfill;       // 插件标签优先; 仅当列表页无标签时采用详情页判断
      it.__skip = !applyCollectFilter(it, filter);  // fulfill 修正后重算筛选
      if (it.__skip) continue;
      if (needPanel) {
        const pd = await cdpReadOnePanel(send, it.asin, host.replace('www.amazon.', ''));
        if (pd && pd.error) console.warn('[list-filtered panel]', it.asin, '商标面板读取失败:', pd.error);
        if (pd && !pd.error) {
          if (pd.trademarkCount != null) it.trademarkCount = pd.trademarkCount;
          if (pd.tmCountries && pd.tmCountries.length) it.tmCountries = pd.tmCountries;
          if (pd.brand && !it.brand) it.brand = pd.brand;
          if (pd.tmText) it.tmText = pd.tmText;
          if (pd.fulfill) it.fulfill = pd.fulfill;
          if (pd.sellerCount != null) it.sellerCount = pd.sellerCount;
          if (pd.sales30d) it.sales30d = pd.sales30d;
          it.__skip = !applyCollectFilter(it, filter);   // 商标等补全后重新完整筛
          if (it.__skip) continue;
        }
      }
      if (withAod) {
        // aod 跟卖: 导航 aod 页读全部跟卖卖家 (价格/名称/ID/跳转链接/运费)
        try {
          await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin + '/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new' });
          await new Promise((r) => setTimeout(r, 8000));
          let offers = [];
          for (let k = 0; k < 8; k++) {
            await new Promise((r) => setTimeout(r, 2000));
            const ra = await send('Runtime.evaluate', {
              expression: `(() => {
                const list = document.querySelector('#aod-offer-list');
                if (!list) return JSON.stringify({ ready: false });
                const out = [];
                list.querySelectorAll('#aod-offer').forEach(o => {
                  let price = null;
                  const fullEl = o.querySelector('.apex-pricetopay-accessibility-label, .aod-offer-price .a-offscreen');
                  if (fullEl) { const m = fullEl.textContent.trim().match(/(?:€|£|\\$|¥|EUR|GBP|USD)\\s*([\\d.,]+)/); if (m) price = parseFloat(m[1].replace(/,/g, '')); }
                  if (price == null) { const w = o.querySelector('.a-price-whole'); if (w) { const v = parseFloat((w.textContent || '').replace(/[^\\d]/g, '')); if (!isNaN(v)) price = v; } }
                  let seller = null, sellerId = null, sellerUrl = null;
                  let sel = o.querySelector('a[href*="/gp/aag/main"], a[href*="aag/main?"]');
                  if (!sel) { const all = o.querySelectorAll('a[href*="seller="]'); for (const a of all) { const t = (a.textContent || '').trim(); if (t && !/^Details/i.test(t) && !/^More/i.test(t)) { sel = a; break; } } }
                  if (sel) {
                    const aria = sel.getAttribute('aria-label') || '';
                    const m2 = aria.match(/^([^.]+)/);
                    const raw = (m2 ? m2[1] : sel.textContent.trim()).trim();
                    if (raw && !/^Details/i.test(raw) && !/^More/i.test(raw)) seller = raw;
                    const hm = (sel.getAttribute('href') || '').match(/seller=([A-Z0-9]+)/);
                    if (hm) sellerId = hm[1];
                    const href = sel.getAttribute('href') || '';
                    if (href.includes('aag/main')) sellerUrl = href.startsWith('http') ? href : 'https://' + location.hostname + href;
                  }
                  let shipFee = null, shipDates = null;
                  const shipEl = o.querySelector('.aod-delivery-promise, #unified-delivery-message');
                  if (shipEl) { const ship = shipEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80); const fm = ship.match(/(?:€|£|\\$)\\s*([\\d.,]+)/); if (fm) shipFee = parseFloat(fm[1].replace(/,/g, '')); const dm = ship.match(/(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+([A-Za-zäöüß]+)/i); if (dm) shipDates = dm[1] + ' - ' + dm[2] + ' ' + dm[3]; }
                  out.push({ price, seller, sellerId, sellerUrl, shipFee, shipDates });
                });
                return JSON.stringify({ ready: out.length > 0, offers: out });
              })()`, returnByValue: true,
            });
            const da = JSON.parse(ra.result.value);
            if (da.ready) { offers = da.offers; break; }
          }
          if (offers.length) {
            const dedup = new Map();
            offers.forEach((o) => { const k = o.sellerId ? 'id:' + o.sellerId : 'n:' + (o.seller || '') + '|' + (o.price != null ? o.price : ''); if (!dedup.has(k) || (o.price != null && (dedup.get(k).price == null || o.price < dedup.get(k).price))) dedup.set(k, o); });
            const uniq = [...dedup.values()];
            const nums = uniq.map((o) => o.price).filter((x) => x != null);
            it.offerPrices = uniq;
            it.followCount = uniq.length;
            const minP = nums.length ? Math.min(...nums) : null;
            if (minP != null && (it.minPrice == null || minP < it.minPrice)) it.minPrice = minP;
          }
        } catch (e) { console.error('[list-filtered aod]', it.asin, '跟卖采集失败:', e && e.message); }
      }
      enriched.push(it);
    } catch (e) {
      console.error('[list-filtered enrich]', it.asin, '详情补全异常:', e && e.message);
    }
  }

  // ④ 入库: 新增 (source=cdp-list-filtered); 已存在 → 更新详情字段 (保留列表页插件字段)
  const used = new Set(products.map((x) => x.asin));
  let added = 0;
  let updatedCount = 0;
  const imported = [];
  for (const p of enriched) {
    const existing = products.find((x) => x.asin === p.asin);
    const summary = { asin: p.asin, title: (p.title || '').slice(0, 80), price: p.price, fulfill: p.fulfill, sellerCount: p.sellerCount || p.followCount, bsr: p.bsr ? p.bsr.map((b) => b.rank) : null, is1688: p.is1688, rating: p.rating, reviews: p.reviews, followCount: p.followCount, priceCny: p.priceCny, trademarkCount: p.trademarkCount, tmText: p.tmText || null, tmCountries: p.tmCountries || [] };
    if (existing) {
      updatedCount++;
      if (p.price != null) existing.price = p.price;
      if (p.brand) existing.brand = p.brand;
      if (p.rating != null) existing.rating = p.rating;
      if (p.reviews != null) existing.reviews = p.reviews;
      if (p.fulfill) existing.fulfill = p.fulfill;
      if (p.bsr && p.bsr.length) { existing.bsr = p.bsr; existing.rank = '#' + Math.max(...p.bsr.map((b) => b.rank)); }
      if (p.category) existing.category = p.category;
      if (p.aplus) existing.aplus = true;
      if (p.mainImage) existing.mainImage = p.mainImage;
      if (p.trademarkCount != null && p.trademarkCount > 0) existing.trademarkCount = p.trademarkCount;
      if (p.tmCountries && p.tmCountries.length) existing.tmCountries = p.tmCountries;
      if (p.offerPrices && p.offerPrices.length) { existing.offerPrices = p.offerPrices; existing.followCount = p.followCount || p.offerPrices.length; if (p.minPrice != null) existing.minPrice = p.minPrice; }
      if (p.is1688) existing.is1688 = true;
      if (p.is1688Url && !existing.is1688Url) existing.is1688Url = p.is1688Url;
      imported.push({ ...summary, status: 'updated' });
      continue;
    }
    used.add(p.asin);
    const price = p.price != null ? p.price : null;
    const item = {
      id: p.asin, asin: p.asin,
      rank: p.bsr && p.bsr.length ? '#' + Math.max(...p.bsr.map((b) => b.rank)) : null,
      title: p.title, brand: p.brand || 'Unknown', brandStatus: 'unchecked',
      bgMark: false, tmMark: false, patentRisk: false,
      trademarkCount: p.trademarkCount || 0, tmCountries: p.tmCountries || [], tmText: p.tmText || null,
      followCount: p.followCount || p.sellerCount || 0, chinaSeller: false,
      fulfill: p.fulfill || 'FBM', amazonSell: p.amazonSell || false, mainSeller: p.mainSeller || null,
      mainImage: p.mainImage || p.img || null,
      offerPrices: p.offerPrices || null, minPrice: p.minPrice != null ? p.minPrice : price,
      price, currency: siteCurrency(site),
      priceCny: p.priceCny || null,
      monthlySales: p.sales30d ? parseInt(String(p.sales30d).replace(/[<>\s]/g, ''), 10) || 0 : 0,
      reviews: p.reviews || 0, rating: p.rating || 4, stock: 0,
      listedAt: new Date().toISOString().slice(0, 10),
      bsr: p.bsr || [], variations: 0, variants: null,
      referralFee: price != null ? Math.round(price * 0.15 * 100) / 100 : 0,
      netProfit: price != null ? Math.round((price - price * 0.15 - 3.2 - price * 0.3) * 100) / 100 : 0,
      site, category: p.category || 'ListFiltered', collectedAt: now(), source: 'cdp-list-filtered',
      saved: false, real: true, is1688: p.is1688 || false, is1688Url: p.is1688Url || null, badge: p.badge || null,
    };
    products.unshift(item);
    added++;
    imported.push({ ...summary, status: 'added' });
  }
  if (added > 0 || updatedCount > 0) save('products.json', products);
  const enrichedCount = enriched.length;
  return {
    site, url, total: listAll.length, preFiltered: preKept.length, enriched: enrichedCount,
    finalKept: enrichedCount, added, productCount: enrichedCount,
    skippedByList: listAll.length - preKept.length,
    products: imported,
  };
}

async function cdpCategoryCollect(opts) {
  const site = opts.site || 'de';
  const keyword = (opts.keyword || '').trim();
  const category = (opts.category || '').trim();
  const maxPages = Math.min(10, Math.max(1, opts.maxPages || 2));
  const host = 'www.amazon.' + siteToHostSuffix(site);
  // 搜索 URL: 关键词搜索 或 类目浏览
  let url;
  if (keyword) {
    url = `https://${host}/s?k=${encodeURIComponent(keyword)}&i=${encodeURIComponent(category)}`;
  } else if (category) {
    const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    url = `https://${host}/s?k=${encodeURIComponent(slug)}`;
  } else {
    throw new Error('请输入关键词或类目');
  }
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && t.url.includes('amazon')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send('Runtime.enable');

  const products = [];
  const seen = new Set();
  for (let pg = 1; pg <= maxPages; pg++) {
    if (collectStopRequested()) break;
    const pgUrl = pg === 1 ? url : url + (url.includes('?') ? '&' : '?') + 'page=' + pg;
    await send('Page.navigate', { url: pgUrl });
    await new Promise((r) => setTimeout(r, 8000));
    for (let i = 0; i < 4; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 900)); }
    await new Promise((r) => setTimeout(r, 1200));
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        document.querySelectorAll('div[data-asin]').forEach(el => {
          const asin = el.getAttribute('data-asin');
          if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
          const t = el.querySelector('h2 span, h2');
          const pr = el.querySelector('.a-price .a-offscreen');
          const lk = el.querySelector('a[href*="/dp/"]');
          let badge = null;
          const detectBadge = (tb) => {
            if (/Amazon's Choice/i.test(tb)) return 'choice';
            if (/#1 Best Seller/i.test(tb)) return 'bestseller1';
            if (/^Best Seller/i.test(tb) || /Best Seller in/i.test(tb)) return 'bestseller';
            if (/New Release/i.test(tb)) return 'newrelease';
            if (/Deal of the Day/i.test(tb)) return 'dealday';
            if (/Limited time deal/i.test(tb)) return 'deal';
            if (/Overall Pick/i.test(tb)) return 'overallpick';
            if (/Editor'?s Pick/i.test(tb)) return 'editorspick';
            if (/Top Rated/i.test(tb)) return 'toprated';
            if (/Climate Pledge Friendly/i.test(tb)) return 'climate';
            if (/Small Business/i.test(tb)) return 'smallbusiness';
            return null;
          };
          const bEl = el.querySelector('[id*="acBadge"], .ac-badge, [class*="badge"], img[alt*="Choice"], img[alt*="Bestseller"], [id*="bestseller"]');
          if (bEl) badge = detectBadge((bEl.textContent || bEl.getAttribute('alt') || '').trim().replace(/\\s+/g, ' '));
          if (!badge) badge = detectBadge((el.textContent || '').slice(0, 800));
          // 插件排名标签 (#13 / #1 / #28 ...)
          const rankList = [...el.querySelectorAll('.ranktag')]
            .map(x => (x.textContent || '').trim())
            .map(x => { const rm = x.match(/#?([\\d.,]+)/); return rm ? parseInt(rm[1].replace(/[.,]/g, ''), 10) : null; })
            .filter(x => x != null);
          out.push({ asin, title: t ? t.textContent.trim().slice(0, 150) : '', price: pr ? pr.textContent.trim() : '', link: lk ? lk.href : '', badge, bsr: rankList });
        });
        return JSON.stringify(out);
      })()`, returnByValue: true,
    });
    let items = [];
    try { items = JSON.parse(r.result.value); } catch {}
    const fresh = items.filter((x) => !seen.has(x.asin));
    fresh.forEach((x) => seen.add(x.asin));
    products.push(...fresh);
    bumpCollectProgress({ step: '翻页采集', items: products.length, page: pg, pages: maxPages });
    if (items.length < 16) break;
  }
  // ===== 采集过滤: 与自定义筛选同条件, 被筛除的商品直接跳过不采集 =====
  const filter = opts.filter || {};
  const before = products.length;
  const hasFilter = Object.keys(filter).length > 0;
  // 关键: 没有过滤条件时也要读详情页 —— 否则主图/真实类目/配送/自营/评分/币种全缺 (旧逻辑只在有过滤条件时才补全)
  if (products.length) {
    const needDetail = filterNeedsDetail(filter) || !hasFilter;
    if (needDetail) {
      // 预筛: 先判不需要详情的条件 (价格/关键词/标签/1688), 只对幸存者读详情, 减少耗时
      const pre = {};
      if (filter.q) pre.q = filter.q;
      if (filter.badges && filter.badges.length) pre.badges = filter.badges;
      if (filter.is1688 != null) pre.is1688 = filter.is1688;
      if (filter.priceMin != null) pre.priceMin = filter.priceMin;
      if (filter.priceMax != null) pre.priceMax = filter.priceMax;
      products.forEach((it) => { it.__skip = !applyCollectFilter(it, pre); });
      const ENRICH_CAP = 80;                       // 单次上限: 详情页约 8 秒/个, 防止一轮跑太久
      let enriched = 0;
      for (const it of products) {
        if (it.__skip) continue;
        if (collectStopRequested()) break;
        if (enriched >= ENRICH_CAP) break;
        bumpCollectProgress({ step: '详情页补全 ' + it.asin + ' (' + (enriched + 1) + '/' + Math.min(products.length, ENRICH_CAP) + ')', items: products.length });
        await cdpEnrichOne(send, host, it, filter);
        enriched++;
      }
      // 详情补全后按完整条件重新判定 (列表页缺字段时无法判的条件此时才有数据)
      if (hasFilter) products.forEach((it) => { if (!it.__skip) it.__skip = !applyCollectFilter(it, filter); });
    } else {
      products.forEach((it) => { it.__skip = !applyCollectFilter(it, filter); });
    }
    const kept = products.filter((x) => !x.__skip);
    products.length = 0;
    products.push(...kept);
  }
  return { site, url, products, skipped: before - products.length };
}

// ===== 并行整站采集: 一次并行打开 N 个搜索页, 每页抓一页, 聚合去重 (不翻页, 耗时≈单页加载) =====
// 输入: keyword 关键词 或 category 类目; pages 并行页数 (每页约16-48个); 可对每个商品快速读详情价/品牌
async function cdpSiteBulkCollect(opts = {}) {
  const site = opts.site || 'de';
  const keyword = (opts.keyword || '').trim();
  const category = (opts.category || '').trim();
  const pages = Math.min(10, Math.max(1, opts.pages || 5));     // 并行打开页数 (第1页 ~ 第N页)
  const maxItems = Math.min(100, Math.max(1, opts.maxItems || 50));
  const filter = opts.filter || {};                             // 采集过滤: 与自定义筛选同条件
  // 过滤条件需要详情字段(配送/A+/排名/评分/类目等)时强制开详情, 否则无法判断是否满足
  const needDetail = filterNeedsDetail(filter);
  const withDetail = opts.detail !== false || needDetail;       // 是否对商品读详情 (价格/品牌)
  const host = 'www.amazon.' + siteToHostSuffix(site);
  let base;
  if (keyword) base = 'https://' + host + '/s?k=' + encodeURIComponent(keyword) + (category ? '&i=' + encodeURIComponent(category) : '');
  else if (category) base = 'https://' + host + '/s?k=' + encodeURIComponent(category.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  else throw new Error('请输入关键词或类目');

  // 并行开 N 个标签页, 每页抓一页搜索结果
  const tabs = [];
  const jobs = [];
  for (let pg = 1; pg <= pages; pg++) {
    if (collectStopRequested()) break;
    jobs.push((async () => {
      let tab = null;
      try {
        tab = await cdpCreateTab('https://' + host + '/');
        const { send } = await cdpConnect(tab.wsUrl);
        const pgUrl = pg === 1 ? base : base + (base.includes('?') ? '&' : '?') + 'page=' + pg;
        await send('Page.navigate', { url: pgUrl });
        await new Promise((r) => setTimeout(r, 9000));
        for (let i = 0; i < 4; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 800)); }
        await new Promise((r) => setTimeout(r, 1000));
        const r = await send('Runtime.evaluate', {
          expression: `(() => {
            const out = [];
            document.querySelectorAll('div[data-asin]').forEach(el => {
              const asin = el.getAttribute('data-asin');
              if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
              const t = el.querySelector('h2 span, h2');
              const pr = el.querySelector('.a-price .a-offscreen, .a-price-whole');
              const lk = el.querySelector('a[href*="/dp/"]');
              const rt = el.querySelector('.a-icon-alt');
              // 标签: A+/Best Seller/Amazon's Choice/New Release/Deal/Overall Pick/Editor's Pick/Top Rated/气候友好/小企业/#1 Best Seller
              let badge = null;
              const b = el.querySelector('[id*="acBadge"], .ac-badge, [class*="badge"], img[alt*="Choice"], img[alt*="Bestseller"], [id*="bestseller"]');
              const detectBadge = (t) => {
                if (/Amazon's Choice/i.test(t)) return 'choice';
                if (/#1 Best Seller/i.test(t)) return 'bestseller1';
                if (/^Best Seller/i.test(t) || /Best Seller in/i.test(t)) return 'bestseller';
                if (/New Release/i.test(t)) return 'newrelease';
                if (/Deal of the Day/i.test(t)) return 'dealday';
                if (/Limited time deal/i.test(t)) return 'deal';
                if (/Overall Pick/i.test(t)) return 'overallpick';
                if (/Editor'?s Pick/i.test(t)) return 'editorspick';
                if (/Top Rated/i.test(t)) return 'toprated';
                if (/Climate Pledge Friendly/i.test(t)) return 'climate';
                if (/Small Business/i.test(t)) return 'smallbusiness';
                return null;
              };
              if (b) {
                const bt = (b.textContent || b.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ');
                badge = detectBadge(bt);
              }
              if (!badge) {
                const txt = (el.textContent || '').slice(0, 800);
                badge = detectBadge(txt);
              }
              // 插件排名标签
              const rankList = [...el.querySelectorAll('.ranktag')]
                .map(x => (x.textContent || '').trim())
                .map(x => { const rm = x.match(/#?([\\d.,]+)/); return rm ? parseInt(rm[1].replace(/[.,]/g, ''), 10) : null; })
                .filter(x => x != null);
              out.push({ asin, title: t ? t.textContent.trim().slice(0, 200) : '', price: pr ? pr.textContent.trim() : '', link: lk ? lk.href : '', rating: rt ? rt.textContent.trim().slice(0, 20) : '', badge, bsr: rankList });
            });
            return JSON.stringify(out);
          })()`, returnByValue: true,
        });
        let items = [];
        try { items = JSON.parse(r.result.value); } catch {}
        return { pg, items };
      } catch (e) {
        return { pg, items: [], error: e.message };
      } finally {
        if (tab) { try { await cdpCloseTab(tab.targetId); } catch {} }
      }
    })());
  }
  const settled = await Promise.allSettled(jobs);
  const seen = new Set();
  const products = [];
  settled.forEach((st) => {
    if (st.status !== 'fulfilled' || !st.value) return;
    (st.value.items || []).forEach((x) => {
      if (!x.asin || seen.has(x.asin)) return;
      seen.add(x.asin);
      products.push(x);
    });
  });
  bumpCollectProgress({ step: '并行抓取完成', items: products.length });
  // 可选: 对前 maxItems 个商品读详情 (价格/品牌) — 串行, 每个约8秒; 同时做采集过滤
  if (withDetail && products.length) {
    const detail = await cdpGetTabs().then((tabs2) => {
      const page = tabs2.find((t) => t.type === 'page' && /amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/.test(t.url)) || tabs2.find((t) => t.type === 'page');
      return page ? cdpConnect(page.webSocketDebuggerUrl) : null;
    });
    if (detail) {
      const { send } = detail;
      for (let i = 0; i < Math.min(maxItems, products.length); i++) {
        await cdpEnrichOne(send, host, products[i], filter);
        bumpCollectProgress({ step: '读详情', items: products.length, detailDone: i + 1 });
      }
    } else if (Object.keys(filter).length) {
      // 无可用标签连接: 仅按列表字段过滤 (价格/关键词/标签)
      products.slice(0, maxItems).forEach((it) => { it.__skip = !applyCollectFilter(it, filter); });
    }
  } else if (Object.keys(filter).length) {
    // 未开详情: 仅按列表字段过滤 (价格/关键词/标签)
    products.slice(0, maxItems).forEach((it) => { it.__skip = !applyCollectFilter(it, filter); });
  }
  // 采集过滤: 被筛除的商品直接跳过 (不采集/不入库)
  const processed = products.slice(0, maxItems);
  const kept = processed.filter((x) => !x.__skip);
  return { site, host, url: base, pages, productCount: kept.length, products: kept, skipped: processed.length - kept.length };
}

// ===== 详情页核心字段提取 (单一实现: 卖家/配送/自营/A+/主图/币种符号) =====
// 提取器版本号: 提取逻辑变更时 +1 → 旧版本写入的字段视为"未验证", 详情修复会整体重判 (含清空猜值)
const DETAIL_VER = 2;
// 所有读取商品详情页的路径 (采集补全 cdpEnrichOne / 跟卖店铺链 fixDetail / 详情修复) 共用此段,
// 避免多份实现各写一套正则导致同一商品读出不同结果。
// 要点:
//   ① 卖家/配送只看 BuyBox 主报价区 (#merchant-info / #tabular-buybox / #buybox) — 全文含其他卖家报价区文案, 会误判
//   ② Amazon 家族卖家 (Amazon / Amazon AU / Amazon.com.au / Amazon Resale / Amazon Warehouse / Amazon Renewed) = 自营
//   ③ 配送: 发货方 Amazon → FBA; 主报价区已渲染且非 Amazon 发货 → FBM; 区域缺失 → null (未知, 绝不猜)
//   ④ 主图: 优先 Amazon 官方 data-old-hires, 否则按图片 ID 重建 _AC_SL1500_ (列表页缩略图后缀链不可靠)
// 约定: 局部变量一律 _ 前缀; 结果写入调用方已声明的 out 对象
const DETAIL_CORE_JS = `
      const _norm = (s) => String(s || '').replace(/[\\u00a0\\u2007\\u202f]/g, ' ').replace(/\\s+/g, ' ').trim();
      const _q = (s) => document.querySelector(s);
      // 取文本时剔除 script/style 内容 (BuyBox 区含 Amazon 内联脚本, 直接 textContent 会污染判定文本)
      const _txtOf = (el) => {
        if (!el) return '';
        try { const c = el.cloneNode(true); c.querySelectorAll('script,style,noscript').forEach((n) => n.remove()); return _norm(c.textContent); }
        catch (e) { return _norm(el.textContent); }
      };
      const _mi = _q('#merchant-info');
      const _ff = _q('#fulfillerInfoFeature_feature_div');
      const _tb = _q('#tabular-buybox');
      const _bb = _q('#buybox, #desktop_buybox, #addToCart_feature_div');
      // 条件性退换货文案含 "when fulfilled by Amazon AU" 不等于"当前是 FBA" — 必须剔除, 否则误判 FBA
      const _stripBoiler = (s) => String(s || '').split(/(?<=[.!?])\\s+/).filter((x) => !/when fulfilled by|qualifies for|in accordance with|if (?:the )?item is (?:sold|fulfilled)/i.test(x)).join(' ');
      const _region = _stripBoiler([_mi, _ff, _tb, _bb].map(_txtOf).filter(Boolean).join(' | '));
      // 句子级卖家/配送信号: AU 等站点把 "Ships from and sold by Amazon AU." 放在无 id 的 span 里
      const _sentSel = '#merchant-info span, #tabular-buybox .tabular-buybox-text, #buybox span, #desktop_buybox span, #addToCart_feature_div span, #fulfillerInfoFeature_feature_div span, span.a-size-base.a-color-secondary, span.a-color-secondary';
      const _shipsent = [];
      try {
        [...document.querySelectorAll(_sentSel)].forEach((e) => {
          if (e.children.length > 1) return;
          const _t = _stripBoiler(_norm(e.textContent));
          if (!_t || _t.length > 120) return;
          if (/(?:Ships from and sold by|Dispatched from and sold by|Sold by|Verkauf und Versand durch)\\s/i.test(_t)) _shipsent.push(_t);
        });
      } catch (e) { /* 选择器异常忽略 */ }
      out.shipSent = _shipsent.slice(0, 3).join(' ~ ').slice(0, 200);
      // 句子 → { seller, fulfill, amazonSell } (最高置信度, 优先于区域文本)
      const _amzRe = /^(?:amazon|亚马逊)(?:[\\s.]|$)|amazon\\.(?:com|co\\.uk|de|fr|it|es|nl|se|pl|co\\.jp|ca|in|com\\.au|com\\.mx|com\\.br|sg|com\\.tr|ae|sa)/i;
      const _isAmz = (n) => !!n && _amzRe.test(n);
      // 卖家名清洗 (去掉标题词/退货文案/附加说明, 限长) — 句子解析也复用它
      const _cleanSeller = (s) => {
        let v = _norm(s).replace(/^(?:Sold by|Verkauf und Versand durch|出售方|卖家)\\s*:?\\s*/i, '');
        v = v.split(/\\s+(?:Sold by|Returns|Returnable|Dispatched|Ships|Fulfilled|Verkauf|Versand|R\\u00fcckgabe|FREE|Amazon Prime)\\b/i)[0];
        v = v.split(/\\s+and\\s+(?:sent from|shipped|dispatched|delivered|Fulfilled by|sold by)|\\s+und\\s+(?:Versand|Lieferung)/i)[0];
        v = v.replace(/[.,;:]+$/, '').trim();
        return (v && v.length >= 2 && v.length <= 40) ? v : null;
      };
      let _fromSent = null;
      for (const _s of _shipsent) {
        let _m = _s.match(/Ships from and sold by\\s+(.+?)\\.?$/i);
        if (_m) { const n = _cleanSeller(_m[1]) || _norm(_m[1]).slice(0, 40); _fromSent = { seller: n, fulfill: _isAmz(n) ? 'FBA' : 'FBM', amazonSell: _isAmz(n) }; break; }
        _m = _s.match(/Sold by\\s+(.+?)\\s+and\\s+Fulfilled by Amazon/i);
        if (_m) { const n = _cleanSeller(_m[1]) || _norm(_m[1]).slice(0, 40); _fromSent = { seller: n, fulfill: 'FBA', amazonSell: _isAmz(n) }; break; }
        _m = _s.match(/Dispatched from and sold by\\s+(.+?)\\.?$/i);
        if (_m) { const n = _cleanSeller(_m[1]) || _norm(_m[1]).slice(0, 40); _fromSent = { seller: n, fulfill: _isAmz(n) ? 'FBA' : 'FBM', amazonSell: _isAmz(n) }; break; }
        _m = _s.match(/Verkauf und Versand durch\\s+(.+?)\\.?$/i);
        if (_m) { const n = _cleanSeller(_m[1]) || _norm(_m[1]).slice(0, 40); _fromSent = { seller: n, fulfill: _isAmz(n) ? 'FBA' : 'FBM', amazonSell: _isAmz(n) }; break; }
        _m = _s.match(/Sold by\\s*:?\\s+(.+?)\\.?$/i);
        if (_m) { const n = _cleanSeller(_m[1]); if (!n) continue; _fromSent = { seller: n, fulfill: null, amazonSell: _isAmz(n) }; break; }
      }
      out.regionText = (_fromSent ? ('[句] ' + JSON.stringify(_fromSent) + ' | ') : '') + _region.slice(0, 240);
      let _seller = _fromSent && _fromSent.seller ? _fromSent.seller : null;
      if (!_seller && _q('#sellerProfileTriggerId')) _seller = _cleanSeller(_txtOf(_q('#sellerProfileTriggerId')));
      if (!_seller && _q('#merchant-info a')) _seller = _cleanSeller(_txtOf(_q('#merchant-info a')));
      if (!_seller && _mi) {
        const _m = _txtOf(_mi).match(/(?:Sold by|Verkauf und Versand durch|出售方|卖家)\\s*:?\\s*(.+?)(?:\\s+and\\s+(?:Fulfilled|Dispatched|Ships)|(?:\\s+und\\s+)?Versand|\\s*$)/i);
        if (_m) _seller = _cleanSeller(_m[1]);
      }
      if (!_seller) {
        const _lbl = [...document.querySelectorAll('#tabular-buybox .tabular-buybox-label')].find((e) => /sold by|verkauf und versand/i.test(_txtOf(e)));
        if (_lbl) {
          const _row = _lbl.closest('tr, div') || _lbl.parentElement;
          const _vals = _row ? [..._row.querySelectorAll('.tabular-buybox-text')].map(_txtOf).filter(Boolean) : [];
          if (_vals.length) _seller = _cleanSeller(_vals[_vals.length - 1]);
        }
      }
      out.mainSeller = _seller || null;
      // 自营: 句子判定优先, 其次 BuyBox 区文本
      out.amazonSell = _fromSent ? !!_fromSent.amazonSell : (!!(_seller && _isAmz(_seller))
        || /(?:Sold by|Ships from and sold by|Dispatched from and sold by|Verkauf und Versand durch)\\s*:?\\s*Amazon\\b/i.test(_region));
      // 配送方式: 句子判定优先; 区域文本需要明确证据; 都无证据 → null (未知, 绝不猜成 FBM)
      if (_fromSent && _fromSent.fulfill) out.fulfill = _fromSent.fulfill;
      else if (/Fulfilled by Amazon|Dispatches? from Amazon|Ships from Amazon|Versand durch Amazon|亚马逊配送|亚马逊物流|(?:Dispatched from|Ships from|Versendet von)\\s*:?\\s*Amazon\\b/i.test(_region)) out.fulfill = 'FBA';
      else if (/Dispatched from and sold by|Fulfilled by Merchant|Versand durch den Verk|Versand durch Verk|由卖家发货|卖家发货/i.test(_region)
        || /Verkauf und Versand durch\\s+(?!Amazon)/i.test(_region)) out.fulfill = 'FBM';
      else out.fulfill = null;
      // A+ : 容器存在但为空是常态 (#aplus_feature_div 空占位) — 必须有真实模块内容才算 A+
      const _apContent = ['#aplus_feature_div', '#aplus', '#aplus3p_feature_div', '#aplusBrandStory_feature_div'].some((sel) => {
        const el = _q(sel);
        return !!(el && el.children.length > 0 && (_txtOf(el).length > 30 || el.querySelectorAll('img').length > 0));
      }) || !!document.querySelector('.aplus-v2, .aplus-module');
      out.aplus = !!_apContent;
      // 主图 (官方高清优先, 否则按图片 ID 重建)
      const _imgId = (u) => { const _m3 = String(u || '').match(/\\/images\\/I\\/([A-Za-z0-9%+_-]{5,})/); return _m3 ? _m3[1] : null; };
      const _hi = (u) => { const _id = _imgId(u); return _id ? 'https://m.media-amazon.com/images/I/' + _id + '._AC_SL1500_.jpg' : null; };
      const _img = _q('#landingImage') || _q('#main-image-container img') || _q('#imgTagWrapperId img') || _q('#imageBlock img');
      let _src = null;
      if (_img) {
        const _h = _img.getAttribute('data-old-hires') || '';
        const _s = _img.getAttribute('src') || '';
        if (/^https?:/.test(_h)) _src = _hi(_h) || _h;
        else _src = _hi(_s);
      }
      if (!_src) {
        const _list = [...document.querySelectorAll('img[src*="media-amazon.com/images/I/"]')].map((im) => im.getAttribute('src') || '');
        for (const _c of _list) { if (!/_(?:US|SS|SR|AC_UL|QL)\\d*_/.test(_c)) { _src = _hi(_c); if (_src) break; } }
      }
      out.mainImage = _src || null;
      // ---- 类目层级 (面包屑: 一级 > 二级 > 三级 + Amazon 类目节点ID) ----
      // 注: 旧实现只取最后一级叶子类目 (.replace(/^.*›/,'')), 无法做一级/二级筛选 → 改为保留全路径
      const _bc = _q('#wayfinding-breadcrumbs_feature_div');
      const _lv = [];
      const _nodes = [];
      if (_bc) {
        _bc.querySelectorAll('li').forEach((li) => {
          if (li.classList && li.classList.contains('a-breadcrumb-divider')) return;
          const _t = _norm(li.textContent).replace(/^[›>\\s]+|[›>\\s]+$/g, '').trim();
          if (!_t || _t.length > 60) return;
          const _a = li.querySelector('a');
          _lv.push(_t);
          const _m = _a ? (_a.getAttribute('href') || '').match(/node=(\\d+)/) : null;
          _nodes.push(_m ? _m[1] : null);
        });
        if (!_lv.length) {   // 兜底: 无 li 结构 → 按分隔符拆文本
          _norm(_bc.textContent).split(/[›>]/).map((s) => s.trim()).filter(Boolean).forEach((s) => _lv.push(s));
        }
      }
      out.catPath = _lv.length ? _lv.join(' > ').slice(0, 200) : null;
      out.cat1 = _lv[0] ? _lv[0].slice(0, 60) : null;
      out.cat2 = _lv[1] ? _lv[1].slice(0, 60) : null;
      out.cat3 = _lv[2] ? _lv[2].slice(0, 60) : null;
      out.catNodes = _nodes.some(Boolean) ? _nodes : null;
      out.catSrc = _lv.length ? 'bc' : null;                        // bc = 面包屑(真实层级)
      out.category = _lv.length ? _lv[_lv.length - 1].slice(0, 60) : null;   // 叶子类目 (兼容旧字段)
      // ---- BSR (Best Sellers Rank) ----
      // 单元格原文形如: "213 in Automotive (See Top 100 in Automotive) 12 in Dash-Mounted Holders 40 in Automotive Electronics & Accessories 937 in ..."
      // 坑 (已实测): 旧实现用 /([\d.,]+)\s+in\s+([^(]+)/ 取类目 —— 类目名会一路吞掉后面的所有 BSR 行,
      //   第 2 条被写成 "Dash-Mounted Holders 40 in Automotive El", 第 3/4 条直接丢失。
      // 正确做法: ① 整块删掉 "(See Top 100 in X)" ② 类目名必须在"下一个 <数字> in "处截断。
      const _bsrParse = (txt) => {
        const _res = [];
        const _seen = {};
        const _s0 = String(txt || '')
          .replace(/[\\u00a0\\u2007\\u202f]/g, ' ')
          .replace(/\\(\\s*(?:See\\s+)?Top\\s+[\\d.,]+\\s+in\\s+[^)]{0,60}\\)/gi, ' ')
          .replace(/\\s+/g, ' ').trim();
        const _re = /([\\d.,]+)\\s+in\\s+(.+?)(?=\\s*(?:(?:#|Nr\\.?)\\s*)?[\\d.,]+\\s+in\\s+|$)/g;
        let _m;
        while ((_m = _re.exec(_s0)) !== null) {
          const _rank = parseInt(String(_m[1]).replace(/[.,]/g, ''), 10);
          let _cat = String(_m[2] || '').replace(/[()]/g, ' ').replace(/^(?:#|Nr\\.?)\\s*/i, '').replace(/\\s+/g, ' ').trim();
          _cat = _cat.replace(/(?:See\\s+)?Top\\s+[\\d.,]+\\s+in\\s*/gi, ' ').replace(/\\s*(?:#|Nr\\.?)\\s*$/i, '').replace(/\\s+/g, ' ').trim();
          if (!_rank || isNaN(_rank) || !_cat || _cat.length < 2) continue;
          const _key = _rank + '|' + _cat.toLowerCase();
          if (_seen[_key]) continue;
          _seen[_key] = 1;
          _res.push({ rank: _rank, category: _cat.slice(0, 40) });
          if (_res.length >= 6) break;
        }
        return _res;
      };
      const _bsrTxt = [];
      document.querySelectorAll('table.a-keyvalue.prodDetTable tr').forEach((_tr) => {
        const _th = _tr.querySelector('th');
        const _td = _tr.querySelector('td');
        if (_th && _td && /best sellers rank|bestseller-rang|classement des meilleures ventes/i.test(_norm(_th.textContent))) _bsrTxt.push(_norm(_td.textContent));
      });
      if (!_bsrTxt.length) {
        const _bsrBox = _q('#detailBullets_feature_div, #detailBulletsWrapper_feature_div, #productDetails_detailBullets_sections1');
        if (_bsrBox) {
          let _bt = _txtOf(_bsrBox);
          const _bi = _bt.search(/Best Sellers Rank|Bestseller-Rang/i);
          if (_bi >= 0) {
            _bt = _bt.slice(_bi + 10);
            const _cut = _bt.search(/Date First Available|Customer Reviews|ASIN\\b|Item Weight|Product Dimensions|Manufacturer|Item model number|Date de mise en ligne|Erstverf/i);
            if (_cut > 0) _bt = _bt.slice(0, _cut);
            _bsrTxt.push(_bt);
          }
        }
      }
      out.bsr = _bsrParse(_bsrTxt.join(' '));
      // 币种符号 (与站点币种交叉校验)
      const _sym = _q('.a-price-symbol');
      const _off = _q('#corePrice_feature_div .a-offscreen, .a-price .a-offscreen');
      const _offT = _norm((_off && _off.textContent) || '');
      const _offSym = (_offT.match(/^[^\\d\\s]+/) || [''])[0];
      out.curSymbol = (_norm((_sym && _sym.textContent) || '') || _offSym).slice(0, 4);
      out.detailOk = !!document.querySelector('#productTitle');
`;

// ===== 详情页完整读取表达式 (单一实现) =====
// DETAIL_CORE_JS (卖家/配送/自营/A+/主图/类目层级/币种) + 价格/起价/评分/评论/品牌/BSR/上架日期
// 使用者: 详情修复 (cdpBackfillMainImage) 与 批量品牌采集 (cdpReadDetail) —— 同一提取器, 数据口径一致
const DETAIL_READ_EXPR = `(() => {
    const out = { mainImage: null, title: null, rating: null, reviews: null, category: null, price: null, newFrom: null, brand: null, firstAvailable: null, bsr: [], fulfill: null, amazonSell: null, mainSeller: null, aplus: null, curSymbol: null, detailOk: false };
    ${DETAIL_CORE_JS}
    // <<<EXT:title>>> 详情标题 (品牌店/店铺列表只有卡片文本, 详情页标题最准)
    const _ttl = document.querySelector('#productTitle');
    if (_ttl) out.title = _norm(_ttl.textContent).slice(0, 300);
    // <<<END:title>>>
    const rEl = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
    if (rEl) { const m = rEl.textContent.match(/([\\d.,]+)\\s*out of/); if (m) out.rating = parseFloat(m[1].replace(',', '.')); }
    const revEl = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
    if (revEl) { const m = revEl.textContent.match(/([\\d.,]+)/); if (m) out.reviews = parseInt(m[1].replace(/[.,]/g, ''), 10); }
    // 类目层级已由 DETAIL_CORE_JS 统一提取
    const b = document.querySelector('#bylineInfo a, #bylineInfo_feature_div a');
    if (b) { const bt = b.textContent.trim().replace(/\\s+/g, ' ').replace(/^Brand:\\s*/i, '').trim(); if (bt && bt.length > 1 && bt.length < 60) out.brand = bt; }
    const sels = ['#corePrice_feature_div .a-offscreen', '.apex-pricetopay-value', '#price_inside_buybox', '.a-price .a-offscreen'];
    for (const sel of sels) { const el = document.querySelector(sel); if (el) { const m = (el.textContent || '').match(/([\\d.,]+)/); if (m) { out.price = parseFloat(m[1].replace(/,/g, '')); break; } } }
    if (out.price == null) { const w = document.querySelector('.a-price-whole'); const f = document.querySelector('.a-price-fraction'); if (w) { const v = parseFloat((w.textContent || '').replace(/[^\\d]/g, '') + '.' + ((f ? (f.textContent || '').replace(/[^\\d]/g, '') : '') || '00')); if (!isNaN(v)) out.price = v; } }
    const olp = document.body ? document.body.textContent : '';
    let fm = olp.match(/New\\s*\\(\\d+\\)\\s*from\\s*(?:€|£|A\\$|AU\\$|US\\$|C\\$|\\$)?\\s*([\\d.,]+)/i);
    if (!fm) fm = olp.match(/Neu\\s*\\(\\d+\\)\\s*ab\\s*(?:EUR|€)?\\s*([\\d.,]+)/i);
    if (fm) out.newFrom = parseFloat(fm[1].replace(/,/g, ''));
    document.querySelectorAll('table.a-keyvalue.prodDetTable tr').forEach((tr) => {
      const th = tr.querySelector('th'); const td = tr.querySelector('td');
      if (!th || !td) return;
      const k = th.textContent.replace(/\\s+/g, ' ').trim().toLowerCase();
      const v = td.textContent.replace(/\\s+/g, ' ').trim();
      // BSR 已由 DETAIL_CORE_JS 的统一解析器负责 (out.bsr), 这里只管上架日期
      if (/date first available|first available/i.test(k)) out.firstAvailable = v.slice(0, 30);
    });
    // <<<EXT:firstAvailable>>> 上架日期兜底: 多数站点 (AU/UK/DE…) 不在 prodDetTable 里, 而在 #detailBullets_feature_div 的 li 中
    //   例: "Date First Available: 12 May 2023" / "Erstverfügungsdatum: 3. Januar 2023" / "2023-05-12"
    //   只按"日期形状"取值 (不吞后面的标签文本), 读不到 → 保持 null (绝不写成"今天": 那是采集时间不是上架时间)
    if (!out.firstAvailable) {
      const _db = document.querySelector('#detailBullets_feature_div, #detailBulletsWrapper_feature_div, #productDetails_detailBullets_sections1');
      if (_db) {
        const _m2 = _norm(_db.textContent).match(/(?:Date First Available|First Available|Erstverf\\u00fcgungsdatum|Im Angebot von Amazon\\.de seit|Date de mise en ligne|Data di disponibilit\\u00e0|Fecha de disponibilidad en Amazon)\\s*[:\\uff1a]?\\s*(\\d{1,2}[\\s.]\\s*[A-Za-z\\u00c0-\\u00ff]{3,12}[\\s.]\\s*\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|[A-Za-z]{3,12}\\s+\\d{1,2},?\\s+\\d{4})/i);
        if (_m2) out.firstAvailable = _norm(_m2[1]).slice(0, 30);
      }
    }
    // <<<END:firstAvailable>>>
    return JSON.stringify(out);
  })()`;

// 页面风控守卫: 命中验证码/登录墙 → 返回原因字符串 ('captcha' | 'login'), 正常返回 null
// 命中验证码必须立刻中止, 否则会把"验证码页"当成"商品页无数据" → 写入垃圾数据
async function cdpPageGuard(send) {
  try {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const u = location.href || '';
        const t = (document.body ? document.body.textContent : '').slice(0, 3000);
        if (/\\/errors\\/validateCaptcha|\\/gp\\/captcha|\\/sorry\\//i.test(u)) return 'captcha';
        if (/captcha|Robot Check|Enter the characters|api-services-support@amazon|机器人验证/i.test(t)) return 'captcha';
        if (/\\/ap\\/signin|\\/gp\\/signin/i.test(u)) return 'login';
        return null;
      })()`, returnByValue: true,
    });
    return (r && r.result && r.result.value) || null;
  } catch (e) { return null; }
}

// 详情页完整读取 (与「详情修复」同一表达式/同一字段映射): 主图/真实价格/起价/评分/评论/品牌/A+/配送/自营/主卖家/类目层级/BSR/上架/币种
// 写入 it (原地), 返回原始 d (含 regionText, 便于诊断)
async function cdpReadDetail(send, host, it) {
  await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin });
  await new Promise((r) => setTimeout(r, 2500));
  // 等详情页渲染 (标题 + 主图), 最多 15s — 与采集链路同一就绪判定, 避免读到未渲染的空页
  for (let w = 0; w < 15; w++) {
    try {
      const rr = await send('Runtime.evaluate', {
        expression: `(() => { const t = document.querySelector('#productTitle'); const i = document.querySelector('#landingImage, #imgTagWrapperId img, #main-image-container img, #imageBlock img'); return JSON.stringify({ t: !!t, i: !!i }); })()`,
        returnByValue: true,
      });
      const st = JSON.parse(rr.result.value);
      if (st.t && st.i) break;
    } catch (e) { /* 继续等 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (let s = 0; s < 2; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 600)); }
  await new Promise((r) => setTimeout(r, 800));
  const rf = await send('Runtime.evaluate', { expression: DETAIL_READ_EXPR, returnByValue: true });
  let d = {};
  try { d = JSON.parse(rf.result.value || '{}'); } catch (e) { d = {}; }
  if (d.mainImage) it.mainImage = d.mainImage;
  if (d.title) it.title = d.title;                 // 详情页标题最准 (品牌店/店铺页列表只有卡片文本)
  if (d.rating != null) it.rating = d.rating;
  if (d.reviews != null) it.reviews = d.reviews;
  if (d.brand) it.brand = d.brand;
  if (d.category) it.category = d.category;
  // 价格: 优先 "New from X" 起价 (最低跟卖参考价), 否则 BuyBox; minPrice/buyBoxPrice 同步, 避免派生字段残留旧价
  if (d.newFrom != null) { it.price = d.newFrom; it.minPrice = d.newFrom; it.buyBoxPrice = d.price != null ? d.price : null; }
  else if (d.price != null) { it.price = d.price; it.buyBoxPrice = d.price; it.minPrice = d.price; }
  if (d.bsr && d.bsr.length) { it.bsr = d.bsr; it.rank = '#' + Math.max.apply(null, d.bsr.map((b) => b.rank)); }
  if (d.firstAvailable) it.firstAvailable = d.firstAvailable;
  if (d.detailOk) {
    it.detailOk = true; it.detailAt = now(); it.detailVer = DETAIL_VER;
    it.aplus = !!d.aplus;
    if (d.regionText) {
      it.amazonSell = !!d.amazonSell;
      it.fulfill = d.fulfill || null;          // 未读到配送证据 → null (未知, 绝不猜成 FBM)
      it.sellerRegion = d.regionText.slice(0, 200);
    }
    if (d.mainSeller) it.mainSeller = d.mainSeller;
    if (siteSymbolOk(d.curSymbol, it.site || host)) it.priceSymbol = d.curSymbol;
    if (d.catPath) { it.catPath = d.catPath; it.cat1 = d.cat1; it.cat2 = d.cat2; it.cat3 = d.cat3; it.catNodes = d.catNodes || null; it.catSrc = 'bc'; it.catAt = now(); }
  }
  it.currency = siteCurrency(it.site || 'au');
  return d;
}

// 从被切碎的 BSR 类目串里挖回真实条目 (旧解析器留下的脏数据修复用)
// 例: "Automotive) 12 in Dash-Mounted Holders 4" → [{rank:12, category:'Dash-Mounted Holders'}]
//     ("4" 是下一条 "40 in …" 被截断的残渣, 必须去掉; 残渣本身不够成一条, 直接丢弃)
function salvageBsrFragment(cat) {
  const s = String(cat || '');
  const out = [];
  const re = /(?:^|[)\s])(\d{1,3}(?:[.,]\d{3})*)\s+in\s+([A-Za-z][A-Za-z0-9 &'’\-]{2,45}?)(?=\s+\d{1,3}(?:[.,]\d{3})*\s+in\s+|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const name = m[2].replace(/\s+\d{1,3}$/, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3) continue;
    out.push({ rank: parseInt(m[1].replace(/[.,]/g, ''), 10), category: name.slice(0, 40) });
  }
  return out;
}
// 品牌名归一化 + 同品牌判定 (品牌页/品牌搜索页可能混入他牌商品, 需按品牌名校验)
function normBrandName(s) {
  return String(s || '').toLowerCase()
    .replace(/^\s*(visit the|shop the|shop|brand|品牌)\s*[:：]?\s*/i, '')
    .replace(/\b(flagship|official|stores?|shops?|brand)\b/gi, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
    .trim();
}
function sameBrand(a, b) {
  const x = normBrandName(a), y = normBrandName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}
// 品牌名显示清洗: 去掉 Amazon 的 "Visit the XXX Store" 包装 → 只留品牌名 (入库用, 便于聚合/筛选)
// 例: "Visit the Lamicall Store" → "Lamicall"; "Brand: Anker" → "Anker"; "Nintendo" → "Nintendo"
function cleanBrandDisplay(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^(?:Visit the|Shop the|Brand|品牌)\s*[:：]?\s+(.+?)(?:\s+(?:Store|Shop|Official Store|旗舰店|官方旗舰店))?$/i);
  if (m && m[1]) t = m[1].trim();
  t = t.replace(/\s+(?:Store|Shop|旗舰店|官方旗舰店)$/i, '').trim();
  return t || null;
}
// 亚马逊"随机店铺名"识别 (如 PQWYEWHD / TRNLBSTO / CFUNMNVBVZ)
// 背景: 旧「跟卖店铺采集」把卖家店铺名写进过 brand 字段, 这些值不是品牌名, 不能当品牌线索用
// 判定: 无空格 + 连续 4 个以上辅音 (品牌名如 UGREEN/LISEN/ANKER/ESR 都不会命中)
function looksLikeSellerHandle(s) {
  const t = String(s || '').trim();
  if (!t || /\s/.test(t) || /^Visit the/i.test(t)) return false;
  if (/\d{3,}/.test(t)) return true;                       // 连续 3 位数字 → 编号/店铺名
  const core = t.replace(/[^A-Za-z]/g, '');
  if (core.length < 6) return false;                       // 短名不判 (ESR/ANKER/LISEN/Coolpow 之外都保留)
  const runs = core.toUpperCase().match(/[^AEIOU]+/g) || [];
  const longest = runs.reduce((m, x) => Math.max(m, x.length), 0);
  return longest >= 4;
}
// 品牌线索是否可用: 非通用词 且 不像随机店铺名
function isBrandLike(b) {
  const t = String(b || '').trim();
  if (!t) return false;
  const GENERIC = ['generic', 'unknown', 'unbranded', 'no brand', 'none', 'n/a', 'na', 'various', 'other', '通用', '无品牌', '其他', '-'];
  if (GENERIC.indexOf(t.toLowerCase()) >= 0) return false;
  if (looksLikeSellerHandle(t)) return false;
  return normBrandName(t).length >= 2;
}

// 插件面板文本 → 商品字段合并 (商标/月销/尺寸/重量/配送/FBA费), 只补空不覆盖已读到的真实值
function mergePanelInto(it, pd) {
  if (!pd || typeof pd !== 'object') return it;
  let n = 0;
  if (pd.brand && !it.brand) { it.brand = pd.brand; n++; }
  if (pd.fulfill && !it.fulfill) { it.fulfill = pd.fulfill; n++; }
  if (pd.tmText) { it.tmText = pd.tmText; n++; }
  if (pd.trademarkCount != null) { it.trademarkCount = pd.trademarkCount; n++; }
  if (pd.tmCountries && pd.tmCountries.length) { it.tmCountries = pd.tmCountries; n++; }
  if (pd.sellerCount != null) { it.sellerCount = pd.sellerCount; n++; }
  if (pd.sales30d) { it.sales30d = pd.sales30d; n++; }
  if (pd.fbaFee) { it.fbaFee = pd.fbaFee; n++; }
  if (pd.size && !it.size) { it.size = pd.size; n++; }
  if (pd.weight && !it.weight) { it.weight = pd.weight; n++; }
  if (pd.packSize && !it.packSize) { it.packSize = pd.packSize; n++; }
  if (pd.packWeight && !it.packWeight) { it.packWeight = pd.packWeight; n++; }
  if (pd.productType && !it.productType) { it.productType = pd.productType; n++; }
  if (pd.listedAt && !it.listedAt) { it.listedAt = pd.listedAt; n++; }
  if ((!it.bsr || !it.bsr.length) && pd.bsr && pd.bsr.length) { it.bsr = pd.bsr; n++; }
  if (pd.brandStatus) { it.brandStatus = pd.brandStatus; n++; }
  it.panelOk = true;
  it.panelFields = n;
  return it;
}

// ===== 详情页插件面板: 就地等待分析完成并读取 (不重新导航) =====
// 用途: 详情页流程 "先取插件信息 + 商品主信息(主图/价格/类目), 再取跟卖" 的第一步
// 两段式: ① 最多 probeMs 等插件面板出现 (站点无插件 → 快速跳过, 不浪费时间)
//         ② 面板已出现 → 最多 maxMs 等 "正在分析" 结束 (插件分析约 12-15s)
// 兜底熔断: 同站点连续 failLimit 次分析未完成 (如 amazon.com.au 实测插件长期停在"正在分析")
//          → 该站点短时间内直接跳过等待, 避免每个商品白等 maxMs
const panelFailSites = {};          // site -> { fails, until }
const PANEL_FAIL_LIMIT = 2;
const PANEL_SKIP_MS = 30 * 60 * 1000;
async function waitPanelInline(send, site, probeMs = 6000, maxMs = 15000) {
  const key = site || '';
  const cached = panelFailSites[key];
  if (cached && cached.until > Date.now()) return null;   // 熔断中 → 跳过 (不白等)
  const read = async () => {
    try {
      const r = await send('Runtime.evaluate', {
        expression: `(() => {
          const p = document.querySelector('.zy-tool-detail') || document.querySelector('.zying-shadow-root');
          if (!p) return JSON.stringify({ ok: false });
          const t = (p.textContent || '').replace(/\\s+/g, ' ').trim();
          return JSON.stringify({ ok: true, analyzing: /正在分析/.test(t), txt: t.slice(0, 3000) });
        })()`, returnByValue: true,
      });
      return JSON.parse(r.result.value);
    } catch (e) { return null; }
  };
  const markFail = () => {
    const cur = panelFailSites[key] || { fails: 0, until: 0 };
    cur.fails++;
    if (cur.fails >= PANEL_FAIL_LIMIT) { cur.until = Date.now() + PANEL_SKIP_MS; cur.fails = 0; }
    panelFailSites[key] = cur;
  };
  // ① 等面板出现
  const probeEnd = Date.now() + Math.max(0, probeMs);
  let appeared = false;
  for (;;) {
    const st = await read();
    if (st && st.ok) { appeared = true; break; }
    if (Date.now() >= probeEnd) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!appeared) return null;   // 该站点/页面无智赢插件 → 跳过, 不拖慢采集
  // ② 等分析完成 (仍在"正在分析"时视为失败 → 返回 null, 绝不把"正在分析"当数据解析)
  const end = Date.now() + Math.max(0, maxMs);
  for (;;) {
    const st = await read();
    if (st && st.ok && !st.analyzing && st.txt) { panelFailSites[key] = { fails: 0, until: 0 }; return st.txt; }
    if (Date.now() >= end) { markFail(); return null; }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// 读取单个商品详情页的插件面板 (复用: 导航→滚动→重试→解析)
async function cdpReadOnePanel(send, asin, domain) {
  await send('Page.navigate', { url: `https://www.amazon.${domain}/dp/${asin}` });
  await new Promise((r) => setTimeout(r, 9000));
  for (let i = 0; i < 3; i++) {
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 2000})` });
    await new Promise((r) => setTimeout(r, 800));
  }
  await new Promise((r) => setTimeout(r, 1200));
  let panelTxt = null, analyzing = false;
  // 等待数据加载完成: 轮询直到面板出现且非"正在分析" (最多 ~36s)
  // 注: UK 等站点插件分析商标可能耗时 40s+, 超时会导致商标信息采不到, 故上限放宽
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const p = document.querySelector('.zy-tool-detail') || document.querySelector('.zying-shadow-root');
        if (!p) return JSON.stringify({ ok: false });
        const txt = (p.textContent || '').replace(/\\s+/g, ' ').trim();
        return JSON.stringify({ ok: true, analyzing: /正在分析/.test(txt), txt: txt.slice(0, 3000) });
      })()`, returnByValue: true,
    });
    const st = JSON.parse(r.result.value);
    if (st.ok && !st.analyzing) { panelTxt = st.txt; break; }
    analyzing = st.ok && st.analyzing;
    await new Promise((r) => setTimeout(r, 3000));
  }
  // 若面板已出现但仍在分析, 再多等一轮 (数据加载完成后再获取, 最多再加 ~45s)
  if (!panelTxt && analyzing) {
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await send('Runtime.evaluate', {
        expression: `(() => {
          const p = document.querySelector('.zy-tool-detail') || document.querySelector('.zying-shadow-root');
          if (!p) return JSON.stringify({ ok: false });
          const txt = (p.textContent || '').replace(/\\s+/g, ' ').trim();
          return JSON.stringify({ ok: true, analyzing: /正在分析/.test(txt), txt: txt.slice(0, 3000) });
        })()`, returnByValue: true,
      });
      const st = JSON.parse(r.result.value);
      if (st.ok && !st.analyzing) { panelTxt = st.txt; break; }
    }
  }
  if (!panelTxt) return { error: analyzing ? '插件仍在分析中' : '插件面板未加载' };
  const parsed = parsePanelText(panelTxt, asin, '');
  // ===== 商标国家弹窗: 点击 "xxx个注册商标" 元素 → 打开弹窗 → 解析 "品牌已在如下国家注册" =====
  try {
    const elInfo = await send('Runtime.evaluate', {
      expression: `(() => {
        const walk = (root, depth) => {
          if (!root || depth > 8) return null;
          let f = null;
          root.querySelectorAll ? root.querySelectorAll('*').forEach((el) => {
            if (f) return;
            const t = (el.textContent || '').trim();
            if (/^\\d+个注册商标$/.test(t)) { f = el; return; }
            if (el.shadowRoot) { const r = walk(el.shadowRoot, depth + 1); if (r) f = r; }
          }) : null;
          if (!f && root.shadowRoot) f = walk(root.shadowRoot, depth + 1);
          return f;
        };
        const el = walk(document, 0);
        if (!el) return JSON.stringify({ found: false });
        el.scrollIntoView({ block: 'center', inline: 'center' });
        return JSON.stringify({ found: true });
      })()`, returnByValue: true,
    });
    const elInfoD = JSON.parse(elInfo.result.value);
    if (elInfoD.found) {
      await new Promise((r) => setTimeout(r, 1000));
      const posR = await send('Runtime.evaluate', {
        expression: `(() => {
          const walk = (root, depth) => {
            if (!root || depth > 8) return null;
            let f = null;
            root.querySelectorAll ? root.querySelectorAll('*').forEach((el) => {
              if (f) return;
              const t = (el.textContent || '').trim();
              if (/^\\d+个注册商标$/.test(t)) { f = el; return; }
              if (el.shadowRoot) { const r = walk(el.shadowRoot, depth + 1); if (r) f = r; }
            }) : null;
            if (!f && root.shadowRoot) f = walk(root.shadowRoot, depth + 1);
            return f;
          };
          const el = walk(document, 0);
          if (!el) return JSON.stringify({ found: false });
          const r = el.getBoundingClientRect();
          return JSON.stringify({ found: true, x: r.x + r.width / 2, y: r.y + r.height / 2 });
        })()`, returnByValue: true,
      });
      const pos = JSON.parse(posR.result.value);
      if (pos.found) {
        // hover 触发: 鼠标滑到商标元素上, 弹窗自动出现 (停留等待)
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
        await new Promise((r) => setTimeout(r, 2500));
        // 扫描弹窗文本 (穿透 shadowRoot/iframe)
        const popR = await send('Runtime.evaluate', {
          expression: `(() => {
            const scan = (doc, depth) => {
              if (!doc || depth > 8) return null;
              const t = (doc.body ? doc.body.textContent : doc.textContent || '').replace(/\\s+/g, ' ');
              const idx = t.indexOf('已在如下国家注册');
              if (idx >= 0) return t.slice(idx, idx + 9000);
              let res = null;
              const collected = [];
              doc.querySelectorAll ? doc.querySelectorAll('*').forEach((el) => {
                if (res) return;
                // 收集 国家-已注册/已申请 叶子文本 (新版插件弹窗无标题, 直接是国家列表)
                if (el.children.length === 0) {
                  const tt = (el.textContent || '').trim();
                  if (tt.length < 60 && /^[\\u4e00-\\u9fa5A-Za-z（）()]+-已(?:注册|申请)/.test(tt)) collected.push(tt);
                }
                if (el.shadowRoot) { const r = scan(el.shadowRoot, depth + 1); if (r) res = r; }
                if (!res && el.tagName === 'IFRAME') { try { if (el.contentDocument) { const r2 = scan(el.contentDocument, depth + 1); if (r2) res = r2; } } catch (e) {} }
              }) : null;
              if (!res && doc.shadowRoot) res = scan(doc.shadowRoot, depth + 1);
              if (!res && collected.length) res = collected.join(' ');
              return res;
            };
            return JSON.stringify(scan(document, 0));
          })()`, returnByValue: true,
        });
        const popTxt = JSON.parse(popR.result.value);
        if (popTxt) parsed.tmCountries = parseTmCountries(popTxt);
        // 移开鼠标关闭弹窗
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10 });
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  } catch (e) { console.error('[tm-popup]', asin, '商标国家解析失败:', e && e.message); }
  // ===== Amazon 原生详情表提取物流字段 (面板缺尺寸/重量时兜底; uk 等站点面板无物流字段) =====
  // 数据源: #productDetails_techSpec_section_1 / #detailBullets_feature_div (Item Weight / Product Dimensions 等)
  try {
    const dt = await send('Runtime.evaluate', {
      expression: `(() => {
        const scan = (root, depth) => {
          if (!root || depth > 6) return null;
          let best = null;
          root.querySelectorAll ? root.querySelectorAll('*').forEach((el) => {
            if (best) return;
            const t = (el.innerText || el.textContent || '').trim();
            if (/Item Weight|Product Dimensions|Package Weight|Package Dimensions|Gewicht|Abmessungen|Produktmaße|Artikelgewicht|Produktabmessungen/i.test(t) && t.length < 600) { best = t; return; }
            if (el.shadowRoot) { const r = scan(el.shadowRoot, depth + 1); if (r) best = r; }
          }) : null;
          if (!best && root.shadowRoot) best = scan(root.shadowRoot, depth + 1);
          return best;
        };
        const bodyTxt = (document.body.innerText || '');
        const grabKv = (re) => { const m = bodyTxt.match(re); return m ? m[0].split(/\\t|\\n|:/).slice(1).join(' ').trim().slice(0, 80) : null; };
        return JSON.stringify({
          spec: (() => { const s = document.querySelector('#productDetails_techSpec_section_1, #productDetails_db_sections'); return s ? s.innerText.replace(/\\n+/g, ' ').slice(0, 900) : null; })(),
          itemWeight: grabKv(/Item Weight[\\t\\n:][^\\n]{0,60}/i) || grabKv(/Gewicht[\\t\\n:][^\\n]{0,60}/i) || grabKv(/Artikelgewicht[\\t\\n:][^\\n]{0,60}/i),
          dims: grabKv(/Product Dimensions[\\t\\n:][^\\n]{0,60}/i) || grabKv(/Produktmaße[\\t\\n:][^\\n]{0,60}/i) || grabKv(/Produktabmessungen[\\t\\n:][^\\n]{0,60}/i) || grabKv(/Abmessungen[\\t\\n:][^\\n]{0,60}/i),
          pkgW: grabKv(/Package Weight[\\t\\n:][^\\n]{0,60}/i),
          pkgD: grabKv(/Package Dimensions[\\t\\n:][^\\n]{0,60}/i),
        });
      })()`, returnByValue: true,
    });
    const d = JSON.parse(dt.result.value);
    // 面板缺字段时用原生数据兜底 (面板有则以面板为准)
    if (!parsed.weight && (d.itemWeight || d.pkgW)) parsed.weight = d.itemWeight || d.pkgW;
    if (!parsed.size && d.dims) parsed.size = d.dims;
    if (!parsed.packSize && d.pkgD) parsed.packSize = d.pkgD;
    if (!parsed.packWeight && d.pkgW) parsed.packWeight = d.pkgW;
    if (!parsed.fbaFee && d.spec && /Item Weight|Gewicht/.test(d.spec)) {
      // spec 表里没有 FBA 费用 (那是插件数据), 保持 parsed.fbaFee 不变
    }
  } catch (e) { console.error('[native-detail]', asin, '原生详情表提取失败:', e && e.message); }
  return parsed;
}

// ===== 解析 "品牌已在如下国家注册：国家-已注册 国家-已申请 ..." =====
// 兼容两种格式: ① 有标题 "已在如下国家注册：" ② 无标题直接是国家列表 (如新版插件弹窗 "英国-已注册(当前站点)")
function parseTmCountries(txt) {
  const out = [];
  if (!txt) return out;
  const s = String(txt);
  let body = s;
  const m = s.match(/已在如下国家注册[：:]([\s\S]*)/);
  if (m) body = m[1];
  // 清理 "(当前站点)" 后缀残渣: "英国-已注册(当前站点)" 中 "(当前站点)" 会在下一轮匹配成国家名
  body = body.replace(/[（(]当前站点[）)]/g, '');
  const re = /([\u4e00-\u9fa5A-Za-z（）()]+?)-已(?:注册|申请)/g;
  const CN_MAP = { '欧洲联盟': '欧盟', '大韩民国': '韩国', '比荷卢知识产权局': '比荷卢', '俄罗斯联邦': '俄罗斯', '阿拉伯联合酋长国': '阿联酋', '非洲知识产权组织': '非洲知识产权', '朝鲜民主主义人民共和国': '朝鲜', '前南斯拉夫的马其顿共和国': '马其顿', '德国': '德国', '英国': '英国', '美国': '美国', '日本': '日本', '中国': '中国', '法国': '法国', '意大利': '意大利', '西班牙': '西班牙', '印度': '印度', '加拿大': '加拿大', '澳大利亚': '澳大利亚' };
  let mm;
  const seen = new Set();
  while ((mm = re.exec(body)) !== null) {
    const name = mm[1].trim();
    if (!name) continue;
    const label = CN_MAP[name] || name;
    if (!seen.has(label)) { seen.add(label); out.push(label); }
  }
  return out;
}

// ===== 类目菜单导航采集: 首页 → 大类目 → 二级类目 → See all results → 并行采集商品 =====
// 流程: 进入 amazon.de → 类目链接(等效"按部门购买") → 二级类目 → 查看所有结果 → 商品数据
async function cdpCategoryMenuCollect(opts = {}) {
  const site = opts.site || 'de';
  const host = 'www.amazon.' + siteToHostSuffix(site);
  const maxItems = Math.min(100, Math.max(1, opts.maxItems || 50));
  const pages = Math.min(10, Math.max(1, opts.pages || 3));
  const withDetail = opts.detail !== false;
  // 用首页标签连接 (复用 amazon 标签页)
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && /amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/.test(t.url))
    || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'))
    || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  const steps = [];
  // ① 首页
  await send('Page.navigate', { url: 'https://' + host + '/' });
  await new Promise((r) => setTimeout(r, 9000));
  steps.push('① 进入 ' + host);
  // ② 大类目: 从首页 nav_cs_* 链接中找目标类目 (模糊匹配类目名)
  const catName = (opts.category || '').toLowerCase();
  let mainUrl = null;
  if (catName) {
    const r1 = await send('Runtime.evaluate', {
      expression: `(() => {
        var out = [];
        document.querySelectorAll('a[href*="/b/"], a[href*="node="]').forEach(function(a) {
          var t = (a.textContent || '').trim().replace(/\\s+/g, ' ');
          var h = (a.getAttribute('href') || '');
          if (t && t.length > 2 && h) out.push({ t: t, h: h });
        });
        return JSON.stringify(out);
      })()`, returnByValue: true,
    });
    let links = [];
    try { links = JSON.parse(r1.result.value); } catch {}
    const hit = links.find((l) => l.t.toLowerCase().includes(catName));
    if (hit) {
      mainUrl = hit.h.startsWith('http') ? hit.h : 'https://' + host + hit.h;
      steps.push('② 大类目: ' + hit.t);
    }
  }
  if (!mainUrl) {
    // 无类目名 → 用第一个 nav_cs 链接或报错
    const r1 = await send('Runtime.evaluate', {
      expression: `(() => {
        var a = document.querySelector('a[href*="node="][ref*="nav_cs"], a[href*="/b/"]');
        return a ? a.getAttribute('href') : null;
      })()`, returnByValue: true,
    });
    if (!r1.result.value) throw new Error('未找到类目链接');
    mainUrl = 'https://' + host + r1.result.value;
    steps.push('② 大类目(默认): ' + mainUrl.slice(0, 60));
  }
  // ③ 大类目页 → 二级类目 (sv_* 或 node 链接)
  await send('Page.navigate', { url: mainUrl });
  await new Promise((r) => setTimeout(r, 9000));
  let subUrl = null;
  if (catName) {
    const r2 = await send('Runtime.evaluate', {
      expression: `(() => {
        var out = [];
        document.querySelectorAll('a[href*="node="]').forEach(function(a) {
          var t = (a.textContent || '').trim().replace(/\\s+/g, ' ');
          var h = (a.getAttribute('href') || '');
          if (t && t.length > 2 && h && h.includes('node=')) out.push({ t: t, h: h });
        });
        return JSON.stringify(out);
      })()`, returnByValue: true,
    });
    let links2 = [];
    try { links2 = JSON.parse(r2.result.value); } catch {}
    // 找二级类目: 优先含目标关键词, 否则第一个 sv_ 类目
    const subHit = links2.find((l) => l.t.toLowerCase().includes(catName) && !l.h.includes('nav_cs'));
    const sub = subHit || links2.find((l) => l.h.includes('sv_'));
    if (sub) {
      subUrl = sub.h.startsWith('http') ? sub.h : 'https://' + host + sub.h;
      steps.push('③ 二级类目: ' + sub.t);
    }
  }
  if (!subUrl) {
    // 直接在大类目页找 See all results
    const r3 = await send('Runtime.evaluate', {
      expression: `(() => {
        var out = null;
        document.querySelectorAll('a').forEach(function(a) {
          var t = (a.textContent || '').trim().replace(/\\s+/g, ' ');
          if (/See all results|Alle Ergebnisse|View all|查看所有结果/i.test(t)) {
            var h = a.getAttribute('href');
            if (h && !out) out = h;
          }
        });
        return out;
      })()`, returnByValue: true,
    });
    if (r3.result.value) {
      subUrl = r3.result.value.startsWith('http') ? r3.result.value : 'https://' + host + r3.result.value;
      steps.push('③ 直接 See all results');
    }
  }
  if (!subUrl) throw new Error('未找到二级类目或 See all results 链接');
  // ④ 打开 See all results 链接 → 商品搜索页 (找该页的 See all results 跳转)
  let resultsUrl = subUrl;
  await send('Page.navigate', { url: resultsUrl });
  await new Promise((r) => setTimeout(r, 9000));
  const r4 = await send('Runtime.evaluate', {
    expression: `(() => {
      var out = null;
      document.querySelectorAll('a').forEach(function(a) {
        var t = (a.textContent || '').trim().replace(/\\s+/g, ' ');
        if (/See all results|Alle Ergebnisse|View all|查看所有结果/i.test(t)) {
          var h = a.getAttribute('href');
          if (h && !out) out = h;
        }
      });
      return out;
    })()`, returnByValue: true,
  });
  if (r4.result.value) {
    resultsUrl = r4.result.value.startsWith('http') ? r4.result.value : 'https://' + host + r4.result.value;
    steps.push('④ 查看所有结果');
  } else {
    // 已是搜索结果页则直接用
    const isSearch = await send('Runtime.evaluate', { expression: 'location.href.includes("/s?")', returnByValue: true });
    if (!isSearch.result.value) {
      // 找 "See all N results" 或第一个 /s? 链接
      const r5 = await send('Runtime.evaluate', {
        expression: `(() => {
          var a = document.querySelector('a[href*="/s?"]');
          return a ? a.getAttribute('href') : null;
        })()`, returnByValue: true,
      });
      if (r5.result.value) resultsUrl = 'https://' + host + r5.result.value;
    }
    steps.push('④ 商品列表页');
  }
  // ⑤ 并行打开 N 页采集 (复用 cdpSiteBulkCollect 的列表提取逻辑)
  const productsOut = [];
  const seen = new Set();
  const jobs = [];
  for (let pg = 1; pg <= pages; pg++) {
    if (collectStopRequested()) break;
    jobs.push((async () => {
      let tab = null;
      try {
        tab = await cdpCreateTab('https://' + host + '/');
        const { send: s2 } = await cdpConnect(tab.wsUrl);
        const pgUrl = pg === 1 ? resultsUrl : resultsUrl + (resultsUrl.includes('?') ? '&' : '?') + 'page=' + pg;
        await s2('Page.navigate', { url: pgUrl });
        await new Promise((r) => setTimeout(r, 9000));
        for (let i = 0; i < 4; i++) { await s2('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 800)); }
        const r = await s2('Runtime.evaluate', {
          expression: `(() => {
            const out = [];
            document.querySelectorAll('div[data-asin]').forEach(el => {
              const asin = el.getAttribute('data-asin');
              if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
              const t = el.querySelector('h2 span, h2');
              const pr = el.querySelector('.a-price .a-offscreen, .a-price-whole');
              const lk = el.querySelector('a[href*="/dp/"]');
              // 标题清理: 去掉 " | " 后面的变体/颜色文本, 只保留主标题
              let title = t ? t.textContent.trim() : '';
              const barIdx = title.indexOf(' | ');
              if (barIdx > 10) title = title.slice(0, barIdx);
              const rt = el.querySelector('.a-icon-alt');
              let badge = null;
              const detectBadge = (t) => {
                if (/Amazon's Choice/i.test(t)) return 'choice';
                if (/#1 Best Seller/i.test(t)) return 'bestseller1';
                if (/^Best Seller/i.test(t) || /Best Seller in/i.test(t)) return 'bestseller';
                if (/New Release/i.test(t)) return 'newrelease';
                if (/Deal of the Day/i.test(t)) return 'dealday';
                if (/Limited time deal/i.test(t)) return 'deal';
                if (/Overall Pick/i.test(t)) return 'overallpick';
                if (/Editor'?s Pick/i.test(t)) return 'editorspick';
                if (/Top Rated/i.test(t)) return 'toprated';
                if (/Climate Pledge Friendly/i.test(t)) return 'climate';
                if (/Small Business/i.test(t)) return 'smallbusiness';
                return null;
              };
              const bEl = el.querySelector('[id*="acBadge"], .ac-badge, [class*="badge"], img[alt*="Choice"], img[alt*="Bestseller"], [id*="bestseller"]');
              if (bEl) badge = detectBadge((bEl.textContent || bEl.getAttribute('alt') || '').trim().replace(/\\s+/g, ' '));
              if (!badge) badge = detectBadge((el.textContent || '').slice(0, 800));
              // 插件排名标签
              const rankList = [...el.querySelectorAll('.ranktag')]
                .map(x => (x.textContent || '').trim())
                .map(x => { const rm = x.match(/#?([\\d.,]+)/); return rm ? parseInt(rm[1].replace(/[.,]/g, ''), 10) : null; })
                .filter(x => x != null);
              out.push({ asin, title: title.slice(0, 200), price: pr ? pr.textContent.trim() : '', link: lk ? lk.href : '', rating: rt ? rt.textContent.trim().match(/([\\d.,]+)\\s*out of/) : null, badge, bsr: rankList });
            });
            return JSON.stringify(out);
          })()`, returnByValue: true,
        });
        let items = [];
        try { items = JSON.parse(r.result.value); } catch {}
        return { pg, items };
      } catch (e) {
        return { pg, items: [], error: e.message };
      } finally {
        if (tab) { try { await cdpCloseTab(tab.targetId); } catch {} }
      }
    })());
  }
  const settled = await Promise.allSettled(jobs);
  settled.forEach((st) => {
    if (st.status !== 'fulfilled' || !st.value) return;
    (st.value.items || []).forEach((x) => {
      if (!x.asin || seen.has(x.asin)) return;
      seen.add(x.asin);
      productsOut.push(x);
    });
  });
  bumpCollectProgress({ step: '类目翻页采集', items: productsOut.length, page: pages, pages });
  if (!productsOut.length) throw new Error('未提取到商品');
  const list = productsOut.slice(0, maxItems);
  // ⑥ 可选详情读取 (价格/品牌)
  if (withDetail && list.length) {
    for (const it of list) {
      bumpCollectProgress({ step: '读详情', items: productsOut.length, detailDone: list.indexOf(it) + 1, detailTotal: list.length });
      try {
        await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin });
        await new Promise((r) => setTimeout(r, 7000));
        const r = await send('Runtime.evaluate', {
          expression: `(() => {
            const out = { price: null, brand: null, rating: null, reviews: null };
            const sels = ['#corePrice_feature_div .a-offscreen', '.apex-pricetopay-value', '#price_inside_buybox', '.a-price .a-offscreen'];
            for (const sel of sels) {
              const el = document.querySelector(sel);
              if (el) {
                const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
                const m = t.match(/(?:€|£|A\\$|AU\\$|US\\$|C\\$|CA\\$|\\$|EUR|GBP|USD|AUD)\\s*([\\d.,]+)/);
                if (m) { out.price = parseFloat(m[1].replace(/,/g, '')); break; }
              }
            }
            const b = document.querySelector('#bylineInfo a, #bylineInfo_feature_div a');
            if (b) { let bt = b.textContent.trim().replace(/\\s+/g, ' ').replace(/^Brand:\\s*/i, '').trim(); if (bt && bt.length > 1 && bt.length < 60) out.brand = bt; }
            const rEl = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
            if (rEl) { const m = rEl.textContent.match(/([\\d.,]+)\\s*out of/); if (m) out.rating = parseFloat(m[1].replace(',', '.')); }
            const revEl = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
            if (revEl) { const m = revEl.textContent.match(/([\\d.,]+)/); if (m) out.reviews = parseInt(m[1].replace(/[.,]/g, ''), 10); }
            // A+ 页面标记 (只认品牌 A+ 内容区 #aplus_feature_div / #aplus, 不用宽泛的 [id*=aplus] 避免误匹配)
            out.aplus = !!document.querySelector('#aplus_feature_div, #aplus');
            // 配送方式: FBA / FBM
            out.fulfill = null;
            const mi = document.querySelector('#merchant-info, #fulfillerInfoFeature_feature_div');
            const pageTxt = document.body ? document.body.textContent : '';
            // 配送方式: FBA 标志 → FBA; 明确 FBM 标志(卖家自发货) → FBM; 有配送区域但无 FBA 词 → FBM; 否则 null
            const FBA_RE = /Dispatches? from Amazon|Fulfilled by Amazon|Versand durch Amazon|Ships from Amazon|亚马逊配送|亚马逊物流|Verkauf und Versand durch Amazon/i;
            const FBM_RE = /Dispatched from and sold by|Verkauf und Versand durch(?! Amazon)|发货方和销售方/i;
            if (mi) {
              const mt = (mi.textContent || '');
              if (FBA_RE.test(mt)) out.fulfill = 'FBA';
              else if (mt.trim().length > 3) out.fulfill = 'FBM';
            }
            if (!out.fulfill) {
              if (FBA_RE.test(pageTxt)) out.fulfill = 'FBA';
              else if (FBM_RE.test(pageTxt)) out.fulfill = 'FBM';
            }
            // BSR 排名 (详情表)
            out.bsr = [];
            document.querySelectorAll('table.a-keyvalue.prodDetTable tr').forEach(function(tr) {
              var th = tr.querySelector('th');
              var td = tr.querySelector('td');
              if (!th || !td) return;
              var k = th.textContent.replace(/\\s+/g, ' ').trim().toLowerCase();
              var v = td.textContent.replace(/\\s+/g, ' ').trim();
              if (/best sellers rank/i.test(k)) {
                // 新版页面无 # 前缀 ("164,986 in Automotive"); 德语页 "Nr. 187.250 in"; 数字支持 , 和 . 千分位
                // 排除 "See Top 100 in" 里的 Top N (误抓为排名)
                var clean = v.replace(/See Top\s+[\d.,]+\s+in\s+/gi, '').replace(/Top\s+[\d.,]+\s+in\s+/gi, '');
                var re = /(?:#\\s*|Nr\\.?\\s*)?([\\d.,]+)\\s+in\\s+([^(]+)/g;
                var m;
                while ((m = re.exec(clean)) !== null) out.bsr.push({ rank: parseInt(m[1].replace(/[.,]/g, ''), 10), category: m[2].trim().slice(0, 40) });
              }
            });
            return JSON.stringify(out);
          })()`, returnByValue: true,
        });
        const d = JSON.parse(r.result.value);
        if (d.price != null) it.price = d.price;
        if (d.brand) it.brand = d.brand;
        if (d.rating != null) it.rating = d.rating;
        if (d.reviews != null) it.reviews = d.reviews;
        if (d.aplus) it.aplus = true;
        if (d.fulfill) it.fulfill = d.fulfill;
        if (d.bsr && d.bsr.length) it.bsr = d.bsr;
        // ===== 采集过滤: 与自定义筛选同条件, 不符合的商品标记跳过 (不采集) =====
        it.__skip = !applyCollectFilter(it, opts.filter);
      } catch (e) { console.error('[catmenu-detail]', it.asin, '异常:', e && e.message); }
    }
  }
  // 过滤掉不符合采集条件的商品 (只保留被过滤出的)
  const filtered = list.filter((x) => !x.__skip);
  list.forEach((x) => delete x.__skip);
  return { site, host, url: resultsUrl, pages, steps, productCount: filtered.length, products: filtered, skipped: list.length - filtered.length };
}

// ===== 跟卖店铺采集 (完整链路, 全程 CDP) =====
// 流程: 商品信息(详情页 aod 面板) → 出售单位跳转链接(sellerUrl/aag) → 出售单位详情页(/sp)
//       → 参观出售单位链接(storefront) → 该出售单位店铺全部商品 (商品数/页数双限制)
// 输入: 商品详情 URL (如 https://www.amazon.de/dp/B0XXXX) 或直接出售单位链接 (aag/main 或 /sp)
async function cdpFollowShopChain(url, opts = {}) {
  // 0 = 无限制 (商品数/翻页)
  const maxItems = opts.maxItems === 0 ? Infinity : Math.min(100, Math.max(1, opts.maxItems || 30));   // 商品数上限
  const maxPages = opts.maxPages === 0 ? Infinity : Math.min(20, Math.max(1, opts.maxPages || 3));     // 翻页上限
  // 滚动到底部触发懒加载 (排名/详情表)
  async function evScrollBottom(send) {
    try {
      for (let i = 0; i < 5; i++) {
        await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' });
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch {}
  }
  let send;
  if (opts.wsUrl) {
    // 并行模式: 使用外部传入的独立标签页连接
    const c = await cdpConnect(opts.wsUrl);
    send = c.send;
  } else {
    const tabs = await cdpGetTabs();
    // 优先用 amazon 标签页 (避免把用户正在看的 demo 页导航走); 没有则用任意 page
    const page = tabs.find((t) => t.type === 'page' && /amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/.test(t.url))
      || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'))
      || tabs.find((t) => t.type === 'page');
    if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
    const c = await cdpConnect(page.webSocketDebuggerUrl);
    send = c.send;
  }
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  let site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'de';
  let host = 'www.amazon.' + siteToHostSuffix(site);

  const steps = [];
  // ===== ① 输入商品详情 URL → aod 面板提取出售单位链接 =====
  let sellerUrl = null, sellerId = null, sellerName = null;
  const dpM = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (dpM) {
    const asin = dpM[1];
    steps.push('商品 ' + asin + ' → aod 跟卖面板 (找出售单位跳转链接)');
    await send('Page.navigate', { url: 'https://' + host + '/dp/' + asin + '/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new' });
    await new Promise((r) => setTimeout(r, 9000));
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const r = await send('Runtime.evaluate', {
        expression: `(() => {
          const list = document.querySelector('#aod-offer-list');
          if (!list) return JSON.stringify({ ready: false });
          let found = null;
          list.querySelectorAll('#aod-offer').forEach(o => {
            if (found) return;
            let el = o.querySelector('a[href*="/gp/aag/main"], a[href*="aag/main?"]');
            if (!el) { const all = o.querySelectorAll('a[href*="seller="]'); for (const a of all) { const t = (a.textContent || '').trim(); if (t && !/^Details/i.test(t) && !/^More/i.test(t)) { el = a; break; } } }
            if (el) {
              const aria = el.getAttribute('aria-label') || '';
              const m = aria.match(/^([^.]+)/);
              const raw = (m ? m[1] : el.textContent.trim()).trim();
              const hm = (el.getAttribute('href') || '').match(/seller=([A-Z0-9]+)/);
              const href = el.getAttribute('href') || '';
              const isAag = href.includes('aag/main');
              found = {
                seller: raw && !/^Details/i.test(raw) && !/^More/i.test(raw) ? raw : null,
                sellerId: hm ? hm[1] : null,
                sellerUrl: isAag ? (href.startsWith('http') ? href : 'https://' + location.hostname + href) : null,
              };
            }
          });
          return JSON.stringify({ ready: !!found, ...(found || {}) });
        })()`, returnByValue: true,
      });
      const d = JSON.parse(r.result.value);
      if (d.ready) { sellerUrl = d.sellerUrl; sellerId = d.sellerId; sellerName = d.seller; break; }
    }
    if (!sellerUrl) {
      // aod 未给出售单位链接 → 详情页 byline 兜底
      await send('Page.navigate', { url: 'https://' + host + '/dp/' + asin });
      await new Promise((r) => setTimeout(r, 9000));
      const r2 = await send('Runtime.evaluate', {
        expression: `(() => {
          let el = document.querySelector('#sellerProfileTriggerId, a[href*="/gp/aag/main"], #bylineInfo a[href*="seller="]');
          if (!el) return JSON.stringify({ found: false });
          const href = el.getAttribute('href') || '';
          const hm = href.match(/seller=([A-Z0-9]+)/);
          return JSON.stringify({ found: true, sellerUrl: href.startsWith('http') ? href : 'https://' + location.hostname + href, sellerId: hm ? hm[1] : null });
        })()`, returnByValue: true,
      });
      const d2 = JSON.parse(r2.result.value);
      if (d2.found) { sellerUrl = d2.sellerUrl; sellerId = d2.sellerId; }
    }
    if (!sellerUrl) {
      // aod 面板 + byline 兜底均未找到出售单位 → 诊断页面状态给出明确原因 (复用 aod 失败诊断)
      let code = 'structure';
      try {
        const dg = await send('Runtime.evaluate', {
          expression: `(() => { const bt = (document.body && document.body.innerText ? document.body.innerText : (document.body ? document.body.textContent : '')).slice(0, 20000); return bt; })()`, returnByValue: true,
        });
        code = classifyAodFailure(dg.result.value);
      } catch {}
      const reason = aodFailReason(code);
      throw new Error('aod 面板未找到出售单位链接: ' + reason + (code === 'no-offers' ? ' (可用「多商品并行采集」自动复用商品库历史卖家继续采集)' : ''));
    }
    steps.push('→ 出售单位: ' + (sellerName || sellerId || sellerUrl.slice(0, 60)));
  } else if (/aag\/main|\/sp\?/.test(url)) {
    // ② 直接给出售单位链接 (aag/main 或 /sp)
    sellerUrl = url;
    const sm = url.match(/seller=([A-Z0-9]+)/);
    if (sm) sellerId = sm[1];
    steps.push('直接使用出售单位链接');
  } else {
    throw new Error('请输入商品详情 URL (dp/B0XXXX) 或出售单位链接 (aag/main, /sp)');
  }

  // ===== ② 跳转出售单位详情页 (aag/main 会自动重定向到 /sp 卖家资料页) =====
  await send('Page.navigate', { url: sellerUrl });
  await new Promise((r) => setTimeout(r, 10000));
  const spUrl = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }).then((r) => r.result.value);
  steps.push('→ 出售单位详情页: ' + (spUrl || sellerUrl).slice(0, 90));
  // 从 /sp 页读取出售单位名称 (Seller Profile 标题, 如 "Amazon.de Seller Profile: xiaomatongxue")
  if (!sellerName) {
    const rName = await send('Runtime.evaluate', {
      expression: `(() => {
        const h1 = document.querySelector('#aag-main-content h1, .aag-profile-name, h1, #seller-page-content h1');
        if (h1) { const t = h1.textContent.trim().replace(/\\s+/g, ' '); const m = t.match(/Profile:\\s*(.+)$/i); if (m) return m[1].trim(); return t; }
        const title = document.title || '';
        const tm = title.match(/Profile:\\s*(.+)$/i);
        return tm ? tm[1].trim() : null;
      })()`, returnByValue: true,
    });
    const nm = rName.result && rName.result.value;
    if (nm && nm.length < 60) sellerName = nm;
    steps.push('→ 出售单位名称: ' + (sellerName || '?'));
  }

  // ===== ③ 找「参观出售单位」链接 (Visit the X Store 品牌店 / See all products / storefront) =====
  const r3 = await send('Runtime.evaluate', {
    expression: `(() => {
      let storeUrl = null;
      let brandName = null;
      let visitStoreLink = false;   // 链接文本是否为 "Visit the X Store / storefront" 品牌店字样
      // ① 优先: "Visit the Anker Store" 品牌店链接 (/stores/...), 同时提取品牌名
      document.querySelectorAll('a[href*="/stores/"]').forEach(a => {
        if (storeUrl) return;
        const h = a.getAttribute('href') || '';
        const t = (a.textContent || '').trim();
        if (/Visit the |Visit |Besuchen Sie den |Store|Shop/i.test(t) && (h.includes('/stores/') || h.includes('me='))) {
          storeUrl = h;
          if (/Visit the |Visit |Besuchen Sie den /i.test(t)) visitStoreLink = true;
          const m = t.match(/(?:Visit the|Visit|Besuchen Sie den)\\s+([A-Za-z0-9 .\\-&']+?)\\s+Store/i);
          if (m) brandName = m[1].trim();
        }
      });
      // ② "See all products" / storefront 链接
      if (!storeUrl) {
        document.querySelectorAll('a[href*="/s?"], a[href*="s?ie=UTF8"]').forEach(a => {
          if (storeUrl) return;
          const h = a.getAttribute('href') || '';
          const t = (a.textContent || '').trim();
          if (h.includes('me=') && (/storefront|See all|products|Store|Shop/i.test(t) || /storefront|See all/i.test(h))) {
            storeUrl = h;
            // "Visit the AnkerDirect DE storefront" 等品牌店字样
            if (/Visit the |Visit |Besuchen Sie den /i.test(t) && /storefront|Store/i.test(t)) visitStoreLink = true;
          }
        });
      }
      // ③ 兜底: 任何 me= 链接
      if (!storeUrl) {
        document.querySelectorAll('a[href*="me="]').forEach(a => {
          if (storeUrl) return;
          const h = a.getAttribute('href') || '';
          if (h.includes('/s?') || h.includes('merchant-items') || h.includes('/stores/')) storeUrl = h;
        });
      }
      return JSON.stringify({ storeUrl, brandName, visitStoreLink });
    })()`, returnByValue: true,
  });
  const storeInfo = JSON.parse(r3.result.value);
  if (!storeInfo.storeUrl) throw new Error('出售单位详情页未找到「Visit the Store/See all products」链接');
  let storeUrl = storeInfo.storeUrl.startsWith('http') ? storeInfo.storeUrl : 'https://' + host + storeInfo.storeUrl;
  const storeBrand = storeInfo.brandName || null;
  const hasVisitStoreLink = !!storeInfo.visitStoreLink;   // 店铺带 "Visit the X Store/storefront" 品牌店链接
  steps.push('→ 参观出售单位 → 店铺全部商品页: ' + storeUrl.slice(0, 80) + (storeBrand ? ' (品牌店: ' + storeBrand + ')' : '') + (hasVisitStoreLink ? ' (Visit Store 链接)' : ''));

  // ===== ③.3 邮编/配送地址: 用户输入邮编 → 进店前用 glow 设置 (报价/可配送判断正确) =====
  if (opts.zip && !collectStopRequested()) {
    try {
      const zSet = await cdpSetGlowAddress(send, storeUrl, site, opts.zip);
      steps.push('→ 配送邮编设置: ' + opts.zip + (zSet ? ' 已生效' : ' (可能未更新, 继续)'));
    } catch (e) { console.error('[glow]', '进店前设邮编失败:', e && e.message); }
  }

  // ===== ③.4 品牌店筛选 (可选): ① 品牌店铺类型 (仅采/排除) ② 指定品牌 (如 "Anker") =====
  // 品牌店铺识别 (启发式):
  //   a) /sp 页有 "Visit the X Store" 品牌店链接 (storeBrand 非空, 来自 /stores/ 品牌页)
  //   b) 卖家名/品牌名含官方直营特征: Direct / Official / 官方 / 旗舰 (如 AnkerDirect DE)
  const hasBrandStoreLink = !!storeBrand;
  const sellerRawName = String(sellerName || '') + ' ' + String(storeBrand || '');
  const directMark = /direct|official|官方|旗舰/i.test(sellerRawName);
  const isBrandShop = hasBrandStoreLink || directMark;
  // ② 品牌店铺类型: opts.brandShop '1'=仅采品牌店铺 / '0'=排除品牌店铺 (只采普通第三方店) / 空=不限
  if (opts.brandShop === '1' || opts.brandShop === '0') {
    if (opts.brandShop === '1' && !isBrandShop) {
      steps.push('→ 品牌店铺筛选: 非品牌店铺(普通第三方店) → 跳过不采集');
      return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, brandShopSkip: true, isBrandShop: false, brandShop: opts.brandShop, steps, send };
    }
    if (opts.brandShop === '0' && isBrandShop) {
      steps.push('→ 品牌店铺筛选: 品牌店铺「' + (storeBrand || sellerName || '?') + '」→ 排除不采集');
      return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, brandShopSkip: true, isBrandShop: true, brandName: storeBrand, brandShop: opts.brandShop, steps, send };
    }
    steps.push('→ 品牌店铺筛选: ' + (isBrandShop ? '品牌店铺「' + (storeBrand || sellerName) + '」' : '普通第三方店铺'));
  }
  // ① 指定品牌: opts.brandStore
  //    - 以 "!" 开头 → 排除模式: 排除所有带 "Visit the X Store/storefront" 品牌店链接的店铺
  //    - 品牌名 (如 "Anker") → 只采该品牌, 过滤掉不是该品牌的店铺
  if (opts.brandStore) {
    const raw = String(opts.brandStore).trim();
    if (raw.startsWith('!')) {
      if (hasVisitStoreLink) {
        steps.push('→ 品牌店筛选(排除): 店铺带 "Visit the X Store/storefront" 链接 → 跳过不采集');
        return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, brandShopSkip: true, brandName: storeBrand, brandStore: opts.brandStore, steps, send };
      }
      steps.push('→ 品牌店筛选(排除): 无品牌店链接, 保留');
    } else {
      const target = raw.toLowerCase();
      const brand = String(storeBrand || '').trim().toLowerCase();
      const hit = brand && (brand.includes(target) || target.includes(brand));
      if (!hit) {
        steps.push(`→ 品牌店筛选: 店铺品牌「${storeBrand || '非品牌店'}」≠ ${raw} → 跳过不采集`);
        return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, brandSkip: true, brandName: storeBrand, brandStore: opts.brandStore, steps, send };
      }
      steps.push(`→ 品牌店筛选: 命中品牌店「${storeBrand}」`);
    }
  }

  // ===== ③.5 店铺 A+ 过滤 (可选): 打开店铺页检测是否品牌店/A+ 店铺 =====
  // opts.shopAplus: '1'=仅采有A+的店铺 / '0'=排除有A+的店铺 / 空=不限
  if (opts.shopAplus === '1' || opts.shopAplus === '0') {
    try {
      await send('Page.navigate', { url: storeUrl });
      await new Promise((r) => setTimeout(r, 8000));
      const rA = await send('Runtime.evaluate', {
        expression: `(() => {
          const url = location.href;
          const bt = (document.body ? document.body.textContent : '').slice(0, 120000);
          // 品牌旗舰店: URL 含 /stores/ 或页面标记 Brand Store
          const isBrandStore = /\\/stores\\//i.test(url) || /Brand Store|Marken-Store|品牌旗舰店/i.test(bt);
          // A+ 内容: 页面 A+ 区域或 A+ 徽标
          const hasAplus = !!document.querySelector('#aplus_feature_div, #aplus, [id*="aplus"]')
            || /A\\+ Content|A\\+ 页面|A\\+ Produktseite/i.test(bt);
          return JSON.stringify({ aplusShop: !!(isBrandStore || hasAplus), isBrandStore });
        })()`, returnByValue: true,
      });
      const shopA = JSON.parse(rA.result.value);
      const aplusShop = !!shopA.aplusShop;
      const wantAplus = opts.shopAplus === '1';   // 仅采有 A+ 的店铺
      if (wantAplus && !aplusShop) {
        steps.push('→ 店铺 A+ 过滤: 该店铺无 A+ → 跳过不采集');
        return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, aplusShop: false, shopAplus: opts.shopAplus, steps, send };
      }
      if (!wantAplus && opts.shopAplus === '0' && aplusShop) {
        steps.push('→ 店铺 A+ 过滤: 该店铺有 A+ → 跳过不采集');
        return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: [], skipped: 0, shopSkipped: true, aplusShop: true, shopAplus: opts.shopAplus, steps, send };
      }
      steps.push('→ 店铺 A+ 检测: ' + (aplusShop ? '有 A+ (品牌店)' : '无 A+'));
    } catch (e) {
      console.error('[shop-aplus]', '店铺 A+ 检测失败:', e && e.message);
    }
  }

  // ===== ④ 店铺页翻页采集全部商品 (商品数/页数双限制) =====
  const products = [];
  const seen = new Set();
  // 翻页采集一轮 (返回是否采到商品)
  async function collectShopPages() {
    for (let pg = 1; pg <= maxPages && products.length < maxItems; pg++) {
      if (collectStopRequested()) break;
      const pgUrl = pg === 1 ? storeUrl : storeUrl + (storeUrl.includes('?') ? '&' : '?') + 'page=' + pg;
      await send('Page.navigate', { url: pgUrl });
      await new Promise((r) => setTimeout(r, 8000));
      for (let i = 0; i < 5; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 1000)); }
      await new Promise((r) => setTimeout(r, 1500));
      const r4 = await send('Runtime.evaluate', {
        expression: `(() => {
          const out = [];
          document.querySelectorAll('div[data-asin]').forEach(el => {
            const asin = el.getAttribute('data-asin');
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
            const lk = el.querySelector('a[href*="/dp/"]');
            // 商品判定: 有 /dp/ 链接即可 (不放宽图片条件 — 店铺页商品图懒加载,
            // 8s+滚动后图片常未就绪, 按图过滤会把有商品误判为空; 详情页修正阶段会补全标题/价格/主图)
            if (!lk) return;
            const t = el.querySelector('h2 span, h2');
            const pr = el.querySelector('.a-price .a-offscreen, .a-price-whole');
            // 插件排名标签 (de 等站点店铺页插件渲染 ranktag; uk 站不渲染 → 详情修正兜底)
            const rankList = [...el.querySelectorAll('.ranktag')]
              .map(x => (x.textContent || '').trim())
              .map(x => { const rm = x.match(/#?([\\d.,]+)/); return rm ? parseInt(rm[1].replace(/[.,]/g, ''), 10) : null; })
              .filter(x => x != null);
            out.push({ asin, title: t ? t.textContent.trim().slice(0, 200) : '', price: pr ? pr.textContent.trim() : '', link: lk.href || '', bsr: rankList });
          });
          return JSON.stringify(out);
        })()`, returnByValue: true,
      });
      let items = [];
      try { items = JSON.parse(r4.result.value); } catch {}
      const fresh = items.filter((x) => !seen.has(x.asin));
      fresh.forEach((x) => seen.add(x.asin));
      products.push(...fresh);
      // 第一页采到商品但全无插件排名 → 翻到第二页触发插件加载, 回读第一页补排名
      // (插件对部分店铺页第一页不渲染 ranktag, 翻页后才激活; 实测 uk/de 均可能)
      if (pg === 1 && products.length && !products.some((x) => x.bsr && x.bsr.length)) {
        const page2 = storeUrl + (storeUrl.includes('?') ? '&' : '?') + 'page=2';
        await send('Page.navigate', { url: page2 });
        await new Promise((r) => setTimeout(r, 9000));
        for (let s = 0; s < 3; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 800)); }
        // 回第一页重采 (插件已激活, 给第一页商品补排名)
        await send('Page.navigate', { url: pgUrl });
        await new Promise((r) => setTimeout(r, 9000));
        for (let s = 0; s < 3; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 800)); }
        const r5 = await send('Runtime.evaluate', {
          expression: `(() => {
            const out = [];
            document.querySelectorAll('div[data-asin]').forEach(el => {
              const asin = el.getAttribute('data-asin');
              if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
              const rankList = [...el.querySelectorAll('.ranktag')]
                .map(x => (x.textContent || '').trim())
                .map(x => { const rm = x.match(/#?([\\d.,]+)/); return rm ? parseInt(rm[1].replace(/[.,]/g, ''), 10) : null; })
                .filter(x => x != null);
              out.push({ asin, bsr: rankList });
            });
            return JSON.stringify(out);
          })()`, returnByValue: true,
        });
        try {
          const items2 = JSON.parse(r5.result.value);
          const rankMap = {};
          items2.forEach((y) => { if (y.bsr && y.bsr.length) rankMap[y.asin] = y.bsr; });
          let fixed = 0;
          products.forEach((x) => { if (!(x.bsr && x.bsr.length) && rankMap[x.asin]) { x.bsr = rankMap[x.asin]; fixed++; } });
          if (fixed > 0) steps.push('→ 店铺页翻页触发插件后, 补采到 ' + fixed + ' 个商品排名');
        } catch {}
      }
      if (items.length < 16) break; // 无更多页
    }
    return products.length > 0;
  }
  // 首次采集; 失败自动刷新重试一次 (店铺页异步渲染慢/网络波动常见, 重试显著降低"结构未识别"误报)
  let gotShop = await collectShopPages();
  if (!gotShop && !collectStopRequested()) {
    steps.push('→ 店铺页首次未提取到商品, 刷新重试一次');
    await send('Page.reload', {});
    await new Promise((r) => setTimeout(r, 10000));
    gotShop = await collectShopPages();
  }
  if (!gotShop) {
    // 店铺页失败诊断: 区分 店铺关闭/验证码/登录墙/店铺无商品/结构异常 (与 aod 诊断对称)
    // 注意: div[data-asin] 可能含空 asin 占位(无结果提示/帮助链接), 须统计有效 ASIN 数避免误导
    let code = 'structure';
    let detail = '';
    try {
      const dg = await send('Runtime.evaluate', {
        expression: `(() => {
          // innerText 仅可见文本 (不含 script/json), No results 提示不会被超长 JS 挤出截断
          const bt = (document.body && document.body.innerText ? document.body.innerText : (document.body ? document.body.textContent : '')).slice(0, 20000);
          const validAsins = [...document.querySelectorAll('div[data-asin]')].filter((el) => /^[A-Z0-9]{10}$/.test(el.getAttribute('data-asin') || '')).length;
          return JSON.stringify({ url: location.href, title: document.title, validAsins, txt: bt });
        })()`, returnByValue: true,
      });
      const info = JSON.parse(dg.result.value);
      code = classifyShopPageFailure(info.txt);
      if (code === 'structure') detail = ` (URL=${info.url}, 有效ASIN=${info.validAsins}, 标题=${info.title || '?'}, 文本: ${info.txt.slice(0, 150)})`;
    } catch {}
    // ===== 跨站回退: 当前站点店铺无商品 → 尝试勾选的其他站点 (filter.sites) 同卖家店铺 =====
    // 背景: 同一卖家可能只在部分站点有在售商品 (如 de 站店铺 No results, 但 uk 站有完整店铺);
    // 站点多选后勾选的站点即回退目标 (自动排除当前站点)
    const fbSites = ((opts.filter && opts.filter.sites) || []).filter((s) => s !== site);
    if (code === 'no-products' && fbSites.length && !collectStopRequested()) {
      const me = (storeUrl.match(/[?&]me=([A-Z0-9]+)/) || [])[1] || (String(spUrl || '').match(/[?&]seller=([A-Z0-9]+)/) || [])[1];
      if (me) {
        for (const fs of fbSites) {
          if (collectStopRequested()) break;
          if (fs === site) continue;
          const fbHost = 'www.amazon.' + siteToHostSuffix(fs);
          const fbUrl = 'https://' + fbHost + '/s?me=' + me;
          steps.push('→ 店铺页当前站点(' + site + ')无商品, 跨站回退尝试: ' + fs);
          products.length = 0; seen.clear();
          await send('Page.navigate', { url: fbUrl });
          await new Promise((r) => setTimeout(r, 9000));
          storeUrl = fbUrl; host = fbHost; site = fs;
          gotShop = await collectShopPages();
          if (gotShop) { steps.push('→ 跨站回退成功: ' + fs + ' 站点采到 ' + products.length + ' 个商品'); break; }
        }
      }
    }
    if (!gotShop) {
      throw new Error(shopFailReason(code) + detail + (code === 'no-products' && !fbSites.length ? ' (可在「采集站点」多选其他站点, 店铺无商品时自动尝试跨站采集)' : ''));
    }
  }
  const listAll = products.slice(0, maxItems);
  // ===== ④.5 列表页前置拦截: 被排除商品不跳详情 (价格/排名/关键词/站点 用店铺列表已有字段先判) =====
  // 原则: 仅当列表字段明确不满足时才剔除 (未知字段留待详情修正后完整筛), 与 preFilterByList 同宽松语义
  const pf = opts.filter || {};
  const parseListPrice = (s) => {
    const t = String(s || '').trim();
    if (!t) return null;
    const m = t.match(/([\d.,]+)/);
    if (!m) return null;
    return parseFloat(m[1].replace(/[.,]/g, (x) => (x === ',' ? '' : '')) || m[1].replace(/,/g, ''));
  };
  const list = listAll.filter((it) => {
    if (pf.fulfill === 'AMZ') { if (!it.amazonSell) return false; }
    else if (pf.fulfill && it.fulfill && it.fulfill !== pf.fulfill) return false;   // 列表已知 FBA/FBM 且不符 → 前置剔除
    // 价格区间 (店铺卡片价可解析时判; 解析失败留待详情)
    const lp = parseListPrice(it.price);
    if (lp != null) {
      if (pf.priceMin != null && lp < pf.priceMin) return false;
      if (pf.priceMax != null && lp > pf.priceMax) return false;
    }
    // 排名 (ranktag 有值时才判; 未知留待详情)
    if (pf.rankMax != null || pf.rankMin != null) {
      const maxR = Array.isArray(it.bsr) && it.bsr.length ? Math.max(...it.bsr.map((b) => b.rank)) : null;
      if (maxR != null) {
        if (pf.rankMin != null && maxR < pf.rankMin) return false;
        if (pf.rankMax != null && maxR > pf.rankMax) return false;
      }
    }
    if (pf.q) {
      const s = String(pf.q).toLowerCase();
      if (!String(it.title || '').toLowerCase().includes(s) && !String(it.asin || '').toLowerCase().includes(s)) return false;
    }
    if (pf.sites && pf.sites.length && it.site && !pf.sites.includes(it.site)) return false;
    if (pf.site && it.site && it.site !== pf.site) return false;
    return true;
  });
  const preSkippedCount = listAll.length - list.length;
  // ===== ⑤ 详情页修正: 逐个打开详情页读真实 BuyBox 价 + 品牌 (店铺页价是变体/展示价, 不可靠) =====
  const fixDetail = opts.fixDetail !== false;
  if (fixDetail) {
    for (let i = 0; i < list.length; i++) {
      if (collectStopRequested()) break;
      const it = list[i];
      try {
        await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin });
        await new Promise((r) => setTimeout(r, 3000));
        // 等待详情页关键元素就绪 (标题 + 主图), 最多 15 秒 — 修复"页面未渲染完就读"导致主图/评分/类目为空
        for (let w = 0; w < 15; w++) {
          try {
            const rdy = await send('Runtime.evaluate', {
              expression: `(() => { const t = document.querySelector('#productTitle'); const i = document.querySelector('#landingImage, #imgTagWrapperId img, #main-image-container img, #imageBlock img'); return JSON.stringify({ t: !!t, i: !!i }); })()`,
              returnByValue: true,
            });
            const st = JSON.parse(rdy.result.value);
            if (st.t && st.i) break;
          } catch (e) { /* 读取失败继续等 */ }
          await new Promise((r) => setTimeout(r, 1000));
        }
        // ===== 插件信息: 页面已打开 → 先等智赢插件分析完成并读取 (配送FBA/FBM、排名、销量、商标、FBA费用) =====
        // 顺序要求: 插件信息 + 商品主信息(主图/价格/类目/评分/BSR) 全部取完, 再去取 aod 跟卖卖家
        const pluginTxt = await waitPanelInline(send, site, 6000, 15000).catch(() => null);
        for (let s = 0; s < 2; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 600)); }
        await evScrollBottom(send);
        await new Promise((r) => setTimeout(r, 1000));
        const rf = await send('Runtime.evaluate', {
          expression: `(() => {
            const out = { price: null, newFrom: null, brand: null, rating: null, reviews: null, bsr: [], category: null, firstAvailable: null, fulfill: null, mainSeller: null, aplus: false, amazonSell: false, mainImage: null };
            // BuyBox 价格
            const sels = ['#corePrice_feature_div .a-offscreen', '.apex-pricetopay-value', '#price_inside_buybox', '.a-price .a-offscreen'];
            for (const sel of sels) {
              const el = document.querySelector(sel);
              if (el) {
                const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
                const m = t.match(/(?:€|£|A\\$|AU\\$|US\\$|C\\$|CA\\$|\\$|EUR|GBP|USD|AUD)\\s*([\\d.,]+)/);
                if (m) { out.price = parseFloat(m[1].replace(/,/g, '')); break; }
              }
            }
            if (out.price == null) {
              const w = document.querySelector('.a-price-whole');
              const f = document.querySelector('.a-price-fraction');
              if (w) { const whole = (w.textContent || '').replace(/[^\\d]/g, ''); const frac = f ? (f.textContent || '').replace(/[^\\d]/g, '') : ''; const v = parseFloat(whole + '.' + (frac || '00')); if (!isNaN(v)) out.price = v; }
            }
            // 详情页 "New (N) from €X.XX" — 其他卖家最低起价 (商品页原价, 最低跟卖价以此为准)
            // 支持德语页: "Neu (N) ab EUR X" (amazon.de 无语言参数时可能渲染德语)
            const olpTxt = document.body ? document.body.textContent : '';
            let fm = olpTxt.match(/New\\s*\\(\\d+\\)\\s*from\\s*(?:€|£|A\\$|AU\\$|US\\$|C\\$|\\$)?\\s*([\\d.,]+)/i);
            if (!fm) fm = olpTxt.match(/Neu\\s*\\(\\d+\\)\\s*ab\\s*(?:EUR|€)?\\s*([\\d.,]+)/i);
            if (fm) out.newFrom = parseFloat(fm[1].replace(/,/g, ''));
            // 品牌 (byline)
            const b = document.querySelector('#bylineInfo a, #bylineInfo_feature_div a');
            if (b) {
              let bt = b.textContent.trim().replace(/\\s+/g, ' ').replace(/^Brand:\\s*/i, '').trim();
              if (bt && bt.length > 1 && bt.length < 60) out.brand = bt;
            }
            // 评分 / 评论数
            const rEl = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
            if (rEl) { const m = rEl.textContent.match(/([\\d.,]+)\\s*out of/); if (m) out.rating = parseFloat(m[1].replace(',', '.')); }
            const revEl = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
            if (revEl) { const m = revEl.textContent.match(/([\\d.,]+)/); if (m) out.reviews = parseInt(m[1].replace(/[.,]/g, ''), 10); }
            // ===== 卖家/配送/自营/A+/主图/类目层级 (共用单一实现, 见 DETAIL_CORE_JS) =====
            ${DETAIL_CORE_JS}
            // 详情表 (品牌表 + 排名 + ASIN + 上架) — 遍历所有 prodDetTable, 排名行 TD 可能懒加载
            document.querySelectorAll('table.a-keyvalue.prodDetTable tr').forEach(tr => {
              const th = tr.querySelector('th');
              const td = tr.querySelector('td');
              if (!th || !td) return;
              const k = th.textContent.replace(/\\s+/g, ' ').trim().toLowerCase();
              const v = td.textContent.replace(/\\s+/g, ' ').trim();
              if (/brand name/i.test(k) && !out.brand) { const m = v.match(/^([^=]+)/); if (m) out.brand = m[1].trim().slice(0, 40); }
              if (/best sellers rank/i.test(k)) {
                // 新版页面无 # 前缀 ("164,986 in Automotive"); 德语页 "Nr. 187.250 in"; 数字支持 , 和 . 千分位
                // 排除 "See Top 100 in" 里的 Top N (误抓为排名)
                const clean = v.replace(/See Top\s+[\d.,]+\s+in\s+/gi, '').replace(/Top\s+[\d.,]+\s+in\s+/gi, '');
                const re = /(?:#\\s*|Nr\\.?\\s*)?([\\d.,]+)\\s+in\\s+([^(]+)/g;
                let m;
                while ((m = re.exec(clean)) !== null) out.bsr.push({ rank: parseInt(m[1].replace(/[.,]/g, ''), 10), category: m[2].trim().slice(0, 40) });
              }
              if (/date first available|first available/i.test(k)) out.firstAvailable = v.slice(0, 30);
            });
            // 兜底: 排名可能在整个页面文本 (不在 prodDetTable 行内)
            if (!out.bsr.length) {
              const allTxt = (document.body.textContent || '').replace(/See Top\s+[\d.,]+\s+in\s+/gi, '').replace(/Top\s+[\d.,]+\s+in\s+/gi, '');
              const re = /(?:#\\s*|Nr\\.?\\s*)?([\\d.,]+)\\s+in\\s+([A-Za-z& ]{3,40}?)\\s*\\(/g;
              let m;
              const seen = new Set();
              while ((m = re.exec(allTxt)) !== null) {
                const cat = m[2].trim();
                if (cat.length > 2 && cat.length < 40 && !seen.has(cat)) {
                  seen.add(cat);
                  out.bsr.push({ rank: parseInt(m[1].replace(/[.,]/g, ''), 10), category: cat });
                  if (out.bsr.length >= 5) break;
                }
              }
            }
            return JSON.stringify(out);
          })()`, returnByValue: true,
        });
        let d;
        try {
          d = JSON.parse(rf.result.value);
        } catch (e) {
          console.error('[fix-detail]', it.asin, 'JSON解析失败:', e.message, '| desc:', String(rf.result && rf.result.description).slice(0, 300), '| value:', String(rf.result && rf.result.value).slice(0, 80));
          d = { price: null };
        }
        // price 优先用详情页 "New from €X" 起价 (原价/最低跟卖参考价), 否则用 BuyBox
        if (d.newFrom != null) {
          it.price = d.newFrom;
          it.minPrice = d.newFrom;
          it.buyBoxPrice = d.price != null ? d.price : it.buyBoxPrice;
        } else if (d.price != null) it.price = d.price;
        if (d.brand) it.brand = d.brand;
        if (d.rating != null) it.rating = d.rating;
        if (d.reviews != null) it.reviews = d.reviews;
        if (d.bsr && d.bsr.length) it.bsr = d.bsr;
        if (d.category) it.category = d.category;
        if (d.firstAvailable) it.firstAvailable = d.firstAvailable;
        // 配送方式/主报价卖家/A+/亚马逊自营/主图 (商品数据阶段获取; aod 阶段仅兜底)
        // 三态写入: detailOk=详情页已渲染(可判定), regionText=BuyBox 主报价区已渲染
        //   - aplus / amazonSell: 成功读到页面即可判定 true/false (不再只写 true)
        //   - fulfill: 只有读到配送信息才覆盖, 读不到保持原值 (未知不猜)
        //   - mainSeller: 读到卖家名才覆盖
        if (d.detailOk) {
          it.detailOk = true;
          it.detailAt = now();
          it.detailVer = DETAIL_VER;      // 标记"由当前版本提取器核实过" (缺这个标记会被当成旧版未核实数据)
          it.aplus = !!d.aplus;
          if (d.regionText) {
            it.amazonSell = !!d.amazonSell;
            if (d.fulfill) it.fulfill = d.fulfill;
            it.sellerRegion = d.regionText.slice(0, 200);
          }
          if (d.mainSeller) it.mainSeller = d.mainSeller;
          if (siteSymbolOk(d.curSymbol, it.site || host)) it.priceSymbol = d.curSymbol;
          // 类目层级 (面包屑全路径, 供一级/二级筛选)
          if (d.catPath) {
            it.catPath = d.catPath; it.cat1 = d.cat1; it.cat2 = d.cat2; it.cat3 = d.cat3;
            it.catNodes = d.catNodes || null; it.catSrc = 'bc'; it.catAt = now();
          }
        }
        if (d.mainImage) it.mainImage = d.mainImage;
        // ===== 插件信息合并 (步骤①已取): 商品主信息就绪后合并, 然后才进 ⑥ aod 跟卖 =====
        if (pluginTxt) {
          try {
            const pd = parsePanelText(pluginTxt, it.asin, it.title || '');
            if (pd.brand && !it.brand) it.brand = pd.brand;
            if (pd.fulfill) it.fulfill = pd.fulfill;        // 插件配送标签最可靠 (网页可能读不到)
            if (pd.tmText) it.tmText = pd.tmText;
            if (pd.trademarkCount != null) it.trademarkCount = pd.trademarkCount;
            if (pd.tmCountries && pd.tmCountries.length) it.tmCountries = pd.tmCountries;
            if (pd.sellerCount != null) it.sellerCount = pd.sellerCount;
            if (pd.sales30d) it.sales30d = pd.sales30d;
            if (pd.fbaFee) it.fbaFee = pd.fbaFee;
            if (pd.size && !it.size) it.size = pd.size;
            if (pd.weight && !it.weight) it.weight = pd.weight;
            if (pd.packSize && !it.packSize) it.packSize = pd.packSize;
            if (pd.packWeight && !it.packWeight) it.packWeight = pd.packWeight;
            if (pd.productType && !it.productType) it.productType = pd.productType;
            if (pd.listedAt && !it.listedAt) it.listedAt = pd.listedAt;
            if ((!it.bsr || !it.bsr.length) && pd.bsr && pd.bsr.length) it.bsr = pd.bsr;
            it.panelOk = true;
          } catch (e) { console.error('[fix-detail]', it.asin, '插件面板解析失败:', e && e.message); }
        }
        if (d.price == null && d.newFrom == null) console.error('[fix-detail]', it.asin, '详情页未读到价格, URL=' + 'https://' + host + '/dp/' + it.asin);
        const rv = await send('Runtime.evaluate', {
          expression: `(() => {
            const dims = [];
            document.querySelectorAll('#twister_feature_div script[type="a-state"]').forEach(s => {
              const raw = s.textContent.trim();
              if (!raw) return;
              try {
                const data = JSON.parse(raw);
                if (data.sortedDimValuesForAllDims) {
                  Object.keys(data.sortedDimValuesForAllDims).forEach(dim => {
                    const vals = data.sortedDimValuesForAllDims[dim] || [];
                    if (!vals.length) return;
                    dims.push({
                      dim,
                      options: vals.map(v => ({
                        text: v.dimensionValueDisplayText || null,
                        asin: v.defaultAsin || null,
                        selected: v.dimensionValueState === 'SELECTED',
                      })).filter(v => v.text && v.asin),
                    });
                  });
                }
              } catch(e) {}
            });
            return JSON.stringify(dims);
          })()`, returnByValue: true,
        });
        const dims = JSON.parse(rv.result.value);
        if (dims.length) {
          // ===== 变体采集 (不跳转): 从 twister 渲染的 li 直接读 变体名(alt) + 价格(from €X) + ASIN =====
          const rv2 = await send('Runtime.evaluate', {
            expression: `(() => {
              const out = [];
              document.querySelectorAll('#twister_feature_div li[data-asin]').forEach(li => {
                const asin = li.getAttribute('data-asin');
                if (!asin) return;
                const img = li.querySelector('img');
                const name = img ? (img.getAttribute('alt') || '').trim() : (li.textContent || '').trim();
                // 价格: "1 option from €25.99" / "6 options from €11.97" / "€12.76"
                let price = null;
                const priceTxt = (li.textContent || '').replace(/\\s+/g, ' ').trim();
                const CUR = '(?:€|£|A\\\\$|AU\\\\$|US\\\\$|C\\\\$|CA\\\\$|\\\\$|EUR|GBP|USD|AUD)';
                const fm = priceTxt.match(new RegExp('from\\\\s*' + CUR + '\\\\s*([\\\\d.,]+)'));
                if (fm) price = parseFloat(fm[1].replace(/,/g, ''));
                else {
                  const dm = priceTxt.match(new RegExp(CUR + '\\\\s*([\\\\d.,]+)'));
                  if (dm) price = parseFloat(dm[1].replace(/,/g, ''));
                }
                out.push({ asin, name: (name || '').slice(0, 60), price, selected: li.getAttribute('data-initiallyselected') === 'true' || !!li.querySelector('.a-button-selected, .swatchSelect') });
              });
              return JSON.stringify(out);
            })()`, returnByValue: true,
          });
          let liVariants = [];
          try { liVariants = JSON.parse(rv2.result.value); } catch {}
          if (liVariants.length) {
            // 用 li 数据重建变体 (含名称/价格/ASIN, 不跳转)
            const grouped = {};
            liVariants.forEach((v) => {
              if (!grouped.color) grouped.color = [];
              grouped.color.push({ text: v.name, asin: v.asin, price: v.price, priceType: v.price != null ? 'buybox' : null, selected: !!v.selected });
            });
            it.variants = Object.keys(grouped).map((dim) => ({ dim, options: grouped[dim] }));
            it.variations = liVariants.length;
            // BuyBox 价 = 所有变体最低价
            const prices = liVariants.map((v) => v.price).filter((x) => x != null);
            if (prices.length) {
              const minV = Math.min(...prices);
              it.price = minV;
              it.minPrice = minV;
              if (d.price == null) d.price = minV;
            }
          } else {
            // 兜底: 用 a-state 数据 (无价格)
            it.variants = dims.map((g) => ({
              dim: g.dim.replace(/_name$/, ''),
              options: g.options.map((o) => ({ text: o.text.replace(/\.$/, '').trim(), asin: o.asin, selected: !!o.selected })),
            }));
          }
        }
        // ===== 采集过滤: 与自定义筛选同条件, 被筛除的商品直接跳过 (不采 aod 跟卖, 不入库) =====
        // 商标数据补全: 过滤含商标条件(商标数≥N / 商标国家)时, 从插件面板读取商标数+国家
        if (opts.filter && (opts.filter.tmMin != null || opts.filter.tmMax != null || opts.filter.tmCountries)) {
          try {
            const pd = await cdpReadOnePanel(send, it.asin, host.replace('www.amazon.', ''));
            if (pd && !pd.error) {
              if (pd.trademarkCount != null) it.trademarkCount = pd.trademarkCount;
              if (pd.tmCountries && pd.tmCountries.length) it.tmCountries = pd.tmCountries;
              if (pd.brand && !it.brand) it.brand = pd.brand;
              if (pd.tmText) it.tmText = pd.tmText;
            }
          } catch (e) { console.error('[tm-panel]', it.asin, '商标读取异常:', e && e.message); }
        }
        it.__skip = !applyCollectFilter(it, opts.filter);
        if (it.__skip) continue;
        // ===== ⑥ aod 跟卖采集: 导航 aod 报价页, 读取全部跟卖卖家 (价格/名称/ID/跳转链接/运费) =====
        // 采集顺序: 详情页信息(价格/品牌/评分/配送/变体) 已完成 → 现在采跟卖卖家数据
        // 兜底: 详情页未取到配送方式时, 从 aod 页顶部主报价区 (Add to Basket 区域) 补充
        if (!it.fulfill || !it.mainSeller) {
          try {
            const rq = await send('Runtime.evaluate', {
              expression: `(() => {
                const bt = (document.body ? document.body.textContent : '').replace(/\\s+/g, ' ');
                const out = { fulfill: null, mainSeller: null };
                if (/Dispatches? from Amazon|Fulfilled by Amazon|Versand durch Amazon|亚马逊配送|亚马逊物流|Ships from Amazon/i.test(bt)) out.fulfill = 'FBA';
                const sm1 = bt.match(/Sold by\\s+([^.|]{2,40}?)\\s*(?:\\.| Opens|\\s+\\|| Seller)/i);
                const sm2 = bt.match(/Verkauf und Versand durch\\s+([^.|]{2,40}?)\\s*(?:\\.|\\s+\\|)/i);
                if (sm1 && !/^amazon([\\s.]|$)/i.test(sm1[1])) out.mainSeller = sm1[1].trim().replace(/\\.$/, '').slice(0, 40);
                else if (sm2 && !/^amazon([\\s.]|$)/i.test(sm2[1])) out.mainSeller = sm2[1].trim().replace(/\\.$/, '').slice(0, 40);
                return JSON.stringify(out);
              })()`, returnByValue: true,
            });
            const qq = JSON.parse(rq.result.value);
            if (qq.fulfill && !it.fulfill) it.fulfill = qq.fulfill;
            if (qq.mainSeller && !it.mainSeller) it.mainSeller = qq.mainSeller;
          } catch (e) { /* 兜底失败不阻塞 */ }
        }
        it.offerPrices = null;
        it.followCount = 0;
        const aodOn = opts.aod !== false;
        if (aodOn) {
          try {
            await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin + '/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new' });
            await new Promise((r) => setTimeout(r, 8000));
            // ===== ⑥.1 滚动 + 翻页, 加载全部跟卖 offer =====
            // aod 弹窗是懒加载: 不滚动只显示前 ~10 个, 需滚动到底触发加载, 有"下一页"再点, 直到总数不再增长
            for (let load = 0; load < 12 && !collectStopRequested(); load++) {
              await send('Runtime.evaluate', {
                expression: `(() => {
                  // 滚动 aod 列表到底 (触发懒加载)
                  const list = document.querySelector('#aod-offer-list');
                  if (list) list.scrollIntoView({ block: 'end' });
                  window.scrollTo(0, document.body.scrollHeight);
                  // 若有"下一页"分页按钮则点击 (Amazon aod 每页约 10 个 offer)
                  const nxt = document.querySelector('#aod-pagination-next-page-button, .aod-pagination .a-last a, [id*="aod"][id*="next"], [class*="aod"][class*="next"]');
                  if (nxt) { try { nxt.click(); } catch (e) {} }
                  return true;
                })()`, returnByValue: true,
              });
              await new Promise((r) => setTimeout(r, 2000));
            }
            let offers = [], total = null;
            for (let k = 0; k < 10; k++) {
              await new Promise((r) => setTimeout(r, 2000));
              const ra = await send('Runtime.evaluate', {
                expression: `(() => {
                  const list = document.querySelector('#aod-offer-list');
                  if (!list) return JSON.stringify({ ready: false });
                  const out = [];
                  list.querySelectorAll('#aod-offer').forEach(o => {
                    let price = null;
                    const fullEl = o.querySelector('.apex-pricetopay-accessibility-label, .aod-offer-price .a-offscreen');
                    if (fullEl) { const m = fullEl.textContent.trim().match(/(?:€|£|\\$|A\\$|EUR|GBP|USD|AUD)\\s*([\\d.,]+)/); if (m) price = parseFloat(m[1].replace(/,/g, '')); }
                    if (price == null) {
                      const w = o.querySelector('.a-price-whole');
                      const f = o.querySelector('.a-price-fraction');
                      if (w) { const whole = (w.textContent || '').replace(/[^\\d]/g, ''); const frac = f ? (f.textContent || '').replace(/[^\\d]/g, '') : ''; const v = parseFloat(whole + '.' + (frac || '00')); if (!isNaN(v)) price = v; }
                    }
                    let seller = null, sellerId = null, sellerUrl = null;
                    let sel = o.querySelector('a[href*="/gp/aag/main"], a[href*="aag/main?"]');
                    if (!sel) { const all = o.querySelectorAll('a[href*="seller="]'); for (const a of all) { const t = (a.textContent || '').trim(); if (t && !/^Details/i.test(t) && !/^More/i.test(t)) { sel = a; break; } } }
                    if (sel) {
                      const aria = sel.getAttribute('aria-label') || '';
                      const m = aria.match(/^([^.]+)/);
                      const raw = (m ? m[1] : sel.textContent.trim()).trim();
                      if (raw && !/^Details/i.test(raw) && !/^More/i.test(raw)) seller = raw;
                      const hm = (sel.getAttribute('href') || '').match(/seller=([A-Z0-9]+)/);
                      if (hm) sellerId = hm[1];
                      const href = sel.getAttribute('href') || '';
                      if (href.includes('aag/main')) sellerUrl = href.startsWith('http') ? href : 'https://' + location.hostname + href;
                    }
                    let shipFee = null, shipDates = null;
                    const shipEl = o.querySelector('.aod-delivery-promise, #unified-delivery-message');
                    if (shipEl) {
                      const ship = shipEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80);
                      const fm = ship.match(/(?:€|£|\\$|A\\$|EUR|GBP|USD|AUD)\\s*([\\d.,]+)/);
                      if (fm) shipFee = parseFloat(fm[1].replace(/,/g, ''));
                      const dm = ship.match(/(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+([A-Za-zäöüß]+)/i);
                      if (dm) shipDates = dm[1] + ' - ' + dm[2] + ' ' + dm[3];
                    }
                    out.push({ price, seller, sellerId, sellerUrl, shipFee, shipDates });
                  });
                  const cEl = list.querySelector('#aod-total-offer-count');
                  return JSON.stringify({ ready: out.length > 0, total: cEl ? cEl.value : null, offers: out });
                })()`, returnByValue: true,
              });
              const da = JSON.parse(ra.result.value);
              if (da.ready) { offers = da.offers; total = da.total; break; }
            }
            if (offers.length) {
              // 按 sellerId 去重 (保最低价)
              const dedup = new Map();
              offers.forEach((o) => {
                const k = o.sellerId ? 'id:' + o.sellerId : 'n:' + (o.seller || '') + '|' + (o.price != null ? o.price : '');
                if (!dedup.has(k) || (o.price != null && (dedup.get(k).price == null || o.price < dedup.get(k).price))) dedup.set(k, o);
              });
              const uniq = [...dedup.values()];
              const nums = uniq.map((o) => o.price).filter((x) => x != null);
              it.offerPrices = uniq;
              it.followCount = uniq.length;
              it.aodTotal = total;
              const minP = nums.length ? Math.min(...nums) : null;
              if (minP != null && (it.minPrice == null || minP < it.minPrice)) it.minPrice = minP;
            }
          } catch (e) {
            console.error('[aod]', it.asin, '跟卖采集失败:', e && e.message);
          }
        }
      } catch (e) {
        console.error('[fix-detail]', it.asin, '修正失败:', e && e.message);
      }
    }
  }
  // 过滤掉不符合采集条件的商品 (只保留被过滤出的, 被筛除的直接跳过不采集)
  const kept = list.filter((x) => !x.__skip);
  steps.push('→ 店铺商品 ' + kept.length + ' 个 (页数 ' + maxPages + ' 上限 / 商品数 ' + maxItems + ' 上限' + (fixDetail ? ', 已详情页修正价格/品牌' : '') + (opts.aod !== false ? ', 已采 aod 跟卖' : '') + (list.length > kept.length ? ', 采集过滤跳过 ' + (list.length - kept.length) + ' 个' : '') + ')');
  return { site, host, sellerUrl, sellerId, sellerName, spUrl, storeUrl, products: kept, skipped: (listAll.length - kept.length) + (preSkippedCount || 0), shopAplus: opts.shopAplus, steps, send };
}

// ===== aod 提取失败诊断 (纯函数, 可测试) =====
// classifyAodFailure: 根据页面文本判断失败类型 (no-offers/captcha/login/structure)
// aodFailReason: 失败类型 → 用户可读的中文提示
function classifyAodFailure(pageText) {
  const bt = String(pageText || '');
  // 无可用报价 (英文/德文 aod 页, 如 "No featured offers available" / "Keine Angebote verfügbar")
  if (/No featured offers available|Keine Angebote verfügbar|Currently unavailable|not available to purchase|Derzeit nicht verfügbar|There are no offers/i.test(bt)) return 'no-offers';
  // 验证码 / 机器人验证
  if (/captcha|CAPTCHA|Robot Check|机器人验证|请输入验证码|验证码/i.test(bt)) return 'captcha';
  // 需要登录
  if (/Sign in to see|Anmelden, um|Please sign in|Bitte melden Sie sich an|登录后才能查看/i.test(bt)) return 'login';
  return 'structure';
}
function aodFailReason(code) {
  const map = {
    'no-offers': '商品当前无可用跟卖报价 (No featured offers available)',
    'captcha': '触发验证码 (CAPTCHA), 请在 Edge 中手动完成验证后重试',
    'login': '页面要求登录, 请在 Edge 中登录 Amazon 后重试',
    'structure': 'aod 页面结构未识别到卖家 (可能页面加载慢或结构变化)',
  };
  return map[code] || 'aod 页面未提取到跟卖卖家';
}

// 从商品库商品提取历史跟卖卖家 (去重 sellerId, 仅保留带 sellerUrl 的) — 纯函数可测试
// 用于 aod 实时提取失败时兜底: 商品当前无报价但历史卖家店铺仍有采集价值
function sellersFromProduct(prod) {
  const map = new Map();
  ((prod && prod.offerPrices) || []).forEach((o) => {
    if (!o.sellerUrl) return;
    const k = o.sellerId || o.seller || o.sellerUrl;
    if (!map.has(k)) map.set(k, o);
  });
  return [...map.values()];
}

// ===== 店铺页提取失败诊断 (纯函数, 可测试) — 与 aodFailReason 对称 =====
// classifyShopPageFailure: 根据店铺页文本判断失败类型 (store-gone/captcha/login/no-products/structure)
// shopFailReason: 失败类型 → 用户可读的中文提示
function classifyShopPageFailure(pageText) {
  const bt = String(pageText || '');
  // 店铺不存在 / 已关闭 (英文/德文 404 页)
  if (/Sorry, we could not find that page|Page Not Found|Seite nicht gefunden|Seite nicht gefunden|does not exist|existiert nicht/i.test(bt)) return 'store-gone';
  // 验证码 / 机器人验证
  if (/captcha|CAPTCHA|Robot Check|机器人验证|请输入验证码|验证码/i.test(bt)) return 'captcha';
  // 需要登录 (页面主体要求登录; 导航栏 "Hello, sign in" 不算 — 用精确短语匹配)
  if (/Sign in to see|Sign in for|Please sign in|Anmelden, um|Bitte melden Sie sich an|登录后才能查看/i.test(bt) && !/data-asin|s-result-item|s-main-slot/i.test(bt)) return 'login';
  // 店铺无商品 (页面正常但无结果)
  if (/No results|Keine Ergebnisse|no products|There are no|Keine Artikel|Keine Produkte/i.test(bt)) return 'no-products';
  return 'structure';
}
function shopFailReason(code) {
  const map = {
    'store-gone': '店铺不存在或已关闭 (Page Not Found)',
    'captcha': '触发验证码 (CAPTCHA), 请在 Edge 中手动完成验证后重试',
    'login': '页面要求登录, 请在 Edge 中登录 Amazon 后重试',
    'no-products': '店铺无在售商品 (No results, 可能已停业或全部下架)',
    'structure': '店铺页结构未识别到商品 (可能页面加载慢或结构变化)',
  };
  return map[code] || '店铺页未提取到商品';
}

// ===== 从 aod 页面提取全部跟卖卖家 (出售单位链接) =====
// 输入: 商品 aod 报价页 URL (如 /dp/XXX/ref=olp-opf-redir?aod=1&condition=new)
// 返回: [{ seller, sellerId, sellerUrl }] 去重后的全部跟卖卖家
async function cdpExtractAodSellers(aodUrl, opts = {}) {
  // 亚马逊词汇筛选: 卖家名称/ID 含这些词汇的直接排除 (默认 amazon/亚马逊, 用户可扩展)
  const amazonWords = (opts.amazonWords || 'amazon,亚马逊').split(/[,，]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  // 目标站点域名 (com.au / de / co.uk ...) — 选同域标签执行 glow + aod, 避免跨站设地址/提取
  const siteMatch = aodUrl.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const aodSite = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : (opts.site || 'de');
  const aodHost = 'www.amazon.' + siteToHostSuffix(aodSite);
  const tabs = await cdpGetTabs();
  let page = tabs.find((t) => t.type === 'page' && t.url.indexOf(aodHost) >= 0)
    || tabs.find((t) => t.type === 'page' && /amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/.test(t.url))
    || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'))
    || tabs.find((t) => t.type === 'page');
  if (!page) {
    // 无 amazon 标签 → 新建目标站点标签
    const created = await cdpCreateTab('https://' + aodHost + '/');
    page = { webSocketDebuggerUrl: created.wsUrl };
  }
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  // 邮编/配送地址: 用户输入邮编时先设地址 (任何邮编的商品网页), 默认用站点内置邮编
  if (opts.zip || SITE_ZIP[aodSite]) {
    // glow 设置成功后已重载首页落地国家; 再导航目标 aod 页提取卖家
    await cdpSetGlowAddress(send, aodUrl, aodSite, opts.zip);
    await send('Page.navigate', { url: aodUrl });
    await new Promise((r) => setTimeout(r, 9000));
  } else {
    await send('Page.navigate', { url: aodUrl });
    await new Promise((r) => setTimeout(r, 9000));
  }
  let sellers = [];
  // ===== aod 懒加载: 滚动到底 + 翻页, 让全部跟卖 offer/卖家出现 =====
  // 不滚动只显示前 ~10 个卖家; 滚动触发加载, 有"下一页"再点, 多次循环直到全部暴露
  for (let load = 0; load < 12 && !collectStopRequested(); load++) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const list = document.querySelector('#aod-offer-list');
        if (list) list.scrollIntoView({ block: 'end' });
        window.scrollTo(0, document.body.scrollHeight);
        const nxt = document.querySelector('#aod-pagination-next-page-button, .aod-pagination .a-last a, [id*="aod"][id*="next"], [class*="aod"][class*="next"]');
        if (nxt) { try { nxt.click(); } catch (e) {} }
        return true;
      })()`, returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 2000));
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        const seen = new Set();
        // 判断是否为亚马逊自营/亚马逊发货 (筛掉不采集)
        const isAmazon = (txt, href, o) => {
          const t = String(txt || '').toLowerCase();
          const h = String(href || '').toLowerCase();
          // 卖家名是 Amazon 官方 (Amazon / Amazon UK / Amazon US / Amazon EU / Amazon.co.uk 等)
          if (/^amazon([\s.]|$)|^amazon\.(com|de|co\.uk|fr|it|es|co\.jp|ca|in|com\.au)/i.test(t)) return true;
          // aod-offer 内: 明确标记 Sold by Amazon / 亚马逊销售 / Ships from Amazon / 发货方亚马逊
          if (o) {
            const oTxt = (o.textContent || '').toLowerCase();
            if (/sold by amazon(?!\.com)|verkauft von amazon|亚马逊销售|来自的报道亚马逊|发货方亚马逊|ships from amazon|versand durch amazon|dispatches? from amazon/i.test(oTxt)) return true;
          }
          return false;
        };
        // ① 从 aod-offer 提取
        const list = document.querySelector('#aod-offer-list');
        if (list) {
          list.querySelectorAll('#aod-offer').forEach(o => {
            let el = o.querySelector('a[href*="/gp/aag/main"], a[href*="aag/main?"]');
            if (!el) { const all = o.querySelectorAll('a[href*="seller="]'); for (const a of all) { const t = (a.textContent || '').trim(); if (t && !/^Details/i.test(t) && !/^More/i.test(t)) { el = a; break; } } }
            if (el) {
              const aria = el.getAttribute('aria-label') || '';
              const m = aria.match(/^([^.]+)/);
              const raw = (m ? m[1] : el.textContent.trim()).trim();
              const hm = (el.getAttribute('href') || '').match(/seller=([A-Z0-9]+)/);
              const href = el.getAttribute('href') || '';
              const isAag = href.includes('aag/main');
              const sellerId = hm ? hm[1] : null;
              // 筛掉亚马逊自营/亚马逊发货
              if (isAmazon(raw, href, o)) return;
              const key = sellerId || raw || href;
              if (!seen.has(key)) {
                seen.add(key);
                out.push({
                  seller: raw && !/^Details/i.test(raw) && !/^More/i.test(raw) ? raw : null,
                  sellerId,
                  sellerUrl: isAag ? (href.startsWith('http') ? href : 'https://' + location.hostname + href) : null,
                });
              }
            }
          });
        }
        // ② 补充: 扫描整个页面所有 aag/main + seller= 链接 (按 sellerId 归组, 优先 aag/main 或 /sp 链接)
        const pageSellers = new Map();  // sellerId → 最佳链接
        document.querySelectorAll('a[href*="/gp/aag/main"], a[href*="aag/main?"], a[href*="seller="]').forEach(a => {
          const aria = a.getAttribute('aria-label') || '';
          const m = aria.match(/^([^.]+)/);
          const raw = (m ? m[1] : a.textContent.trim()).trim();
          const hm = (a.getAttribute('href') || '').match(/seller=([A-Z0-9]+)/);
          const href = a.getAttribute('href') || '';
          const sellerId = hm ? hm[1] : null;
          if (!sellerId || !raw) return;
          // 跳过辅助链接 (details/at-a-glance/return policy/delivery)
          if (/Details/i.test(raw) || /More/i.test(raw) || /Return policy/i.test(raw) || /Delivery/i.test(raw)) return;
          const isGood = href.includes('aag/main') || href.includes('/sp?seller');
          const existing = pageSellers.get(sellerId);
          if (!existing || (isGood && !existing.good)) {
            pageSellers.set(sellerId, { raw, sellerId, href, good: isGood });
          }
        });
        pageSellers.forEach((s) => {
          const key = s.sellerId;
          if (seen.has(key)) return;
          // 筛掉亚马逊自营
          if (isAmazon(s.raw, s.href, null)) return;
          seen.add(key);
          out.push({
            seller: s.raw.slice(0, 40),
            sellerId: s.sellerId,
            sellerUrl: s.href.startsWith('http') ? s.href : 'https://' + location.hostname + s.href,
          });
        });
        return JSON.stringify({ ready: out.length > 0, sellers: out });
      })()`, returnByValue: true,
    });
    const d = JSON.parse(r.result.value);
    if (d.ready) { sellers = d.sellers; break; }
  }
  if (!sellers.length) {
    // 失败原因诊断: 区分 无可用报价/验证码/登录/结构异常, 便于上层兜底与用户提示
    let code = 'structure';
    try {
      const dg = await send('Runtime.evaluate', {
        expression: `(() => { const bt = (document.body && document.body.innerText ? document.body.innerText : (document.body ? document.body.textContent : '')).slice(0, 20000); return bt; })()`, returnByValue: true,
      });
      code = classifyAodFailure(dg.result.value);
    } catch {}
    throw new Error(aodFailReason(code));
  }
  // 后端再过滤一次亚马逊自营/发货 + 亚马逊词汇筛选 (双保险), 然后按 sellerId 去重
  const map = new Map();
  sellers.forEach((s) => {
    if (!s.sellerUrl) return;
    const nm = String(s.seller || '').toLowerCase();
    const sid = String(s.sellerId || '').toLowerCase();
    // 卖家名是亚马逊官方 → 跳过
    if (/^amazon([\s.]|$)|^amazon\.(com|de|co\.uk|fr|it|es|co\.jp|ca|in|com\.au)/i.test(nm)) return;
    // 亚马逊词汇筛选 (默认 amazon/亚马逊, 可自定义扩展词汇)
    if (amazonWords.some((w) => nm.includes(w) || sid.includes(w))) return;
    const k = s.sellerId || s.seller || s.sellerUrl;
    if (!map.has(k)) map.set(k, s);
  });
  return [...map.values()];
}

// ===== 并行标签页管理 (多开网页) =====
// 创建独立标签页 (http PUT /json/new?<url>), 返回 { targetId, wsUrl }
function cdpCreateTab(url) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: '/json/new?' + encodeURIComponent(url), method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve({ targetId: j.id, wsUrl: j.webSocketDebuggerUrl });
        } catch (e) { reject(new Error('创建标签页失败: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
// 关闭标签页 (http GET /json/close/<id>)
function cdpCloseTab(targetId) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: '/json/close/' + targetId }, (res) => {
      res.resume();
      res.on('end', () => resolve(true));
    }).on('error', () => resolve(false));
  });
}

// ===== 跟卖店铺并行批量采集 (多开网页, 全程 CDP) =====
// 流程: 对每个商品 → 其 N 个跟卖卖家 → 开 N 个独立标签页并行采集各自店铺商品
//       → 全部完成后关闭标签页 → 下一个商品, 以此类推
async function cdpFollowShopBatchParallel(asins, opts = {}) {
  const maxItems = opts.maxItems === 0 ? Infinity : Math.min(50, Math.max(1, opts.maxItems || 10));    // 每店铺商品数上限 (0=无限制)
  const maxPages = opts.maxPages === 0 ? Infinity : Math.min(10, Math.max(1, opts.maxPages || 2));     // 每店铺翻页上限 (0=无限制)
  const concurrency = Math.min(6, Math.max(1, opts.concurrency || 4)); // 并行标签页上限
  const results = [];
  let totalAdded = 0;
  for (const asin of asins) {
    if (collectStopRequested()) { results.push({ asin: '(停止)', note: '用户已停止采集, 提前结束' }); break; }
    const prod = products.find((x) => x.asin === asin);
    if (!prod) { results.push({ asin, error: '商品库中不存在' }); continue; }
    // 该商品的跟卖卖家 (去重 sellerId, 保留 sellerUrl)
    const sellers = sellersFromProduct(prod);
    if (!sellers.length) { results.push({ asin, error: '无带跳转链接的跟卖卖家' }); continue; }
    const sellersOut = [];
    // 分批并行 (每批 ≤ concurrency 个标签页)
    for (let i = 0; i < sellers.length; i += concurrency) {
      if (collectStopRequested()) { sellersOut.push({ seller: '(停止)', note: '用户已停止, 本批跳过' }); break; }
      const chunk = sellers.slice(i, i + concurrency);
      const jobs = chunk.map(async (s) => {
        let tab = null;
        try {
          // 每个卖家开一个独立标签页
          tab = await cdpCreateTab('https://www.amazon.de/');
          const out = await cdpFollowShopChain(s.sellerUrl, { maxItems, maxPages, wsUrl: tab.wsUrl, filter: opts.filter, shopAplus: opts.shopAplus, brandStore: opts.brandStore, brandShop: opts.brandShop, zip: opts.zip });
          // 导入商品库 (开启详情页插件面板补全: 重量/尺寸/包装/FBA费用等物流字段, 只对通过筛选入库的商品读)
          const added = ingestFollowShopProducts(out, true, 0);
          return { seller: out.sellerName || s.seller || out.sellerId, sellerId: out.sellerId || s.sellerId, spUrl: out.spUrl, storeUrl: out.storeUrl, productCount: out.products.length, skipped: out.skipped || 0, shopSkipped: out.shopSkipped || 0, brandShopSkip: out.brandShopSkip || 0, brandSkip: out.brandSkip || 0, added, products: out.products.map((p) => ({ asin: p.asin, title: p.title.slice(0, 100), price: p.price })), steps: out.steps, tab };
        } catch (e) {
          return { seller: s.seller || s.sellerId, sellerId: s.sellerId, error: e.message, tab };
        }
      });
      const settled = await Promise.allSettled(jobs);
      for (const st of settled) {
        const r = st.status === 'fulfilled' ? st.value : { seller: '?', error: st.reason && st.reason.message || '未知错误' };
        // 关闭该任务使用的独立标签页
        if (r.tab && r.tab.targetId) { try { await cdpCloseTab(r.tab.targetId); } catch {} }
        sellersOut.push(r);
        if (r.error) continue;
        totalAdded += r.added || 0;
      }
    }
    results.push({ asin, title: prod.title.slice(0, 80), sellerCount: sellers.length, sellers: sellersOut });
    // 并行数量控制: 每批之间留间隔, 避免触发风控
    await new Promise((r) => setTimeout(r, 3000));
  }
  // 采集到商品(新增或更新)即保存入库, 避免 upsert 更新丢失
  const totalCollected = results.reduce((n, r) => n + (r.sellers || []).reduce((m, s) => m + (s.productCount || 0), 0), 0);
  if (totalAdded > 0 || totalCollected > 0) save('products.json', products);
  return { results, added: totalAdded };
}

// ===== 多商品 aod URL → 逐商品提取全部跟卖卖家 → 并行开标签页采集各自店铺 (全程 CDP) =====
// 流程: 商品1 → 提取跟卖卖家 → 并行采集各卖家店铺 → 入库 → 商品2 → 提取卖家 → 并行采集 → ... 以此类推
// 输入: 商品 aod 报价页 URL 数组 (如 [/dp/B0XXX/ref=olp-opf-redir?aod=1&condition=new, ...])
async function cdpAodParallelCollectAll(aodUrls, opts = {}) {
  const maxItems = opts.maxItems === 0 ? Infinity : Math.min(50, Math.max(1, opts.maxItems || 10));    // 每店铺商品数上限 (0=无限制)
  const maxPages = opts.maxPages === 0 ? Infinity : Math.min(10, Math.max(1, opts.maxPages || 2));     // 每店铺翻页上限 (0=无限制)
  const concurrency = Math.min(6, Math.max(1, opts.concurrency || 4)); // 并行标签页上限
  // 排除指定卖家 (名称/ID, 逗号分隔)
  const exclude = (opts.excludeSellers || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const productsOut = [];
  let totalAdded = 0;
  // 输入统一转 aod 链接 (支持 ASIN/普通链接)
  const normUrls = (aodUrls || []).map((u) => toAodUrl(u));
  for (const aodUrl of normUrls) {
    if (collectStopRequested()) { productsOut.push({ asin: '停止', note: '用户已停止采集, 提前结束' }); break; }
    const asin = (aodUrl.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || aodUrl.slice(0, 20);
    // ① 从 aod 提取全部跟卖卖家 (内置亚马逊官方过滤 + 亚马逊词汇筛选)
    let sellers = [];
    let aodErr = null;
    try {
      sellers = await cdpExtractAodSellers(aodUrl, { amazonWords: opts.amazonWords, zip: opts.zip });
    } catch (e) {
      aodErr = e.message;
    }
    // 兜底: aod 实时提取失败 (如商品当前无可用报价) → 复用商品库历史跟卖卖家继续采集
    // (历史卖家店铺仍可能有大量同类跟卖商品, 采集价值不减; 标记 sellerFrom=history 供前端展示)
    let sellerFrom = 'aod';
    if (!sellers.length) {
      const hist = sellersFromProduct(products.find((x) => x.asin === asin));
      if (hist.length) { sellers = hist; sellerFrom = 'history'; }
    }
    if (!sellers.length) {
      productsOut.push({ asin, error: aodErr ? 'aod 提取失败: ' + aodErr : '无跟卖卖家', sellerFrom });
      continue;
    }
    // 排除指定卖家 (jianjun 等)
    if (exclude.length) {
      sellers = sellers.filter((s) => {
        const nm = String(s.seller || '').toLowerCase();
        const sid = String(s.sellerId || '').toLowerCase();
        return !exclude.some((x) => nm.includes(x) || sid.includes(x));
      });
    }
    if (!sellers.length) { productsOut.push({ asin, error: '排除指定卖家后无剩余卖家' }); continue; }
    const sellersOut = [];
    // ② 分批并行开标签页采集 (每批 ≤ concurrency)
    for (let i = 0; i < sellers.length; i += concurrency) {
      if (collectStopRequested()) { sellersOut.push({ seller: '(停止)', note: '用户已停止, 本批跳过' }); break; }
      const chunk = sellers.slice(i, i + concurrency);
      const jobs = chunk.map(async (s) => {
        let tab = null;
        try {
          tab = await cdpCreateTab('https://www.amazon.de/');
          const out = await cdpFollowShopChain(s.sellerUrl, { maxItems, maxPages, wsUrl: tab.wsUrl, filter: opts.filter, shopAplus: opts.shopAplus, brandStore: opts.brandStore, brandShop: opts.brandShop, zip: opts.zip });
          const added = ingestFollowShopProducts(out, true, 0);
          return { seller: out.sellerName || s.seller || out.sellerId, sellerId: out.sellerId || s.sellerId, spUrl: out.spUrl, storeUrl: out.storeUrl, productCount: out.products.length, skipped: out.skipped || 0, shopSkipped: out.shopSkipped || 0, brandShopSkip: out.brandShopSkip || 0, brandSkip: out.brandSkip || 0, added, products: out.products.map((p) => ({ asin: p.asin, title: p.title.slice(0, 100), price: p.price })), steps: out.steps, tab };
        } catch (e) {
          return { seller: s.seller || s.sellerId, sellerId: s.sellerId, error: e.message, tab };
        }
      });
      const settled = await Promise.allSettled(jobs);
      for (const st of settled) {
        const r = st.status === 'fulfilled' ? st.value : { seller: '?', error: st.reason && st.reason.message || '未知错误' };
        if (r.tab && r.tab.targetId) { try { await cdpCloseTab(r.tab.targetId); } catch {} }
        sellersOut.push(r);
        if (r.error) continue;
        totalAdded += r.added || 0;
        // 实时进度: 已处理卖家数 / 已采商品数
        const doneSellers = sellersOut.filter((s) => !s.error && !s.note).length;
        const collectedItems = sellersOut.reduce((n, s) => n + (s.productCount || 0), 0);
        bumpCollectProgress({ step: '采集卖家店铺', shopsDone: doneSellers, shopsTotal: sellers.length, items: collectedItems, added: totalAdded });
      }
    }
    productsOut.push({ asin, sellerCount: sellers.length, sellerFrom, sellers: sellersOut });
    // 每个商品之间留间隔, 避免触发风控
    await new Promise((r) => setTimeout(r, 3000));
  }
  // 采集到商品(新增或更新)即保存入库
  const totalCollected = productsOut.reduce((n, p) => n + (p.sellers || []).reduce((m, s) => m + (s.productCount || 0), 0), 0);
  if (totalAdded > 0 || totalCollected > 0) save('products.json', products);
  return { products: productsOut, added: totalAdded, stopped: collectStopRequested() };
}

// 兼容单商品调用 (旧接口名保留)
async function cdpAodParallelCollect(aodUrl, opts = {}) {
  const r = await cdpAodParallelCollectAll([aodUrl], opts);
  const first = r.products[0] || {};
  return { sellers: first.sellers || [], sellerCount: first.sellerCount || 0, added: r.added };
}

// ===== 商品输入规范化: ASIN / 普通商品链接 / aod 链接 → aod 报价链接 =====
// 从输入 URL 推导域名 (amazon.com.au / de / co.uk ...), 保留原站点; 纯 ASIN 时用传入 host 或默认 de
function toAodUrl(input, host) {
  const u = String(input || '').trim();
  if (!u) return u;
  const m = u.match(/\/dp\/([A-Z0-9]{10})/);
  const dm = u.match(/^https:\/\/(www\.)?amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const h = dm ? 'www.amazon.' + dm[2] : (host || 'www.amazon.de');
  if (m && !/aod|olp/.test(u)) return `https://${h}/dp/${m[1]}/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new`;
  if (/^[A-Z0-9]{10}$/.test(u) && u.startsWith('B0')) return `https://${h}/dp/${u}/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new`;
  return u;
}

// ===== 多商品并行跟卖店铺采集 + 自定义重复轮次 =====
// 流程: 每轮处理一个商品(先用户填的链接/ASIN, 用完后自动从新增店铺商品中挑下一个) → 提取跟卖卖家 → 并行采集各店铺 → 入库
//       → 下一轮自动找新商品继续 (含无卖家兜底跳转), 直到完成 rounds 轮
async function cdpAodParallelCollectRounds(aodUrls, opts = {}) {
  const rounds = opts.rounds === 0 ? Infinity : Math.min(30, Math.max(1, opts.rounds || 1));  // 自定义重复轮次 (0=无限)
  const maxItems = opts.maxItems === 0 ? Infinity : Math.min(50, Math.max(1, opts.maxItems || 10));
  const maxPages = opts.maxPages === 0 ? Infinity : Math.min(10, Math.max(1, opts.maxPages || 2));
  const concurrency = Math.min(6, Math.max(1, opts.concurrency || 4));
  // 排除指定卖家 (名称/ID, 逗号分隔)
  const exclude = (opts.excludeSellers || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // 初始队列: 用户填的商品 (ASIN/普通链接/aod 链接 统一转 aod)
  const queue = (aodUrls || []).map((u) => toAodUrl(u));
  const roundsOut = [];
  let totalAdded = 0;
  for (let r = 1; r <= rounds; r++) {
    if (collectStopRequested()) { roundsOut.push({ round: r, note: '用户已停止采集, 提前结束' }); break; }
    if (!queue.length) { roundsOut.push({ round: r, note: '无更多商品可处理, 提前结束' }); break; }
    bumpCollectProgress({ step: '第 ' + r + '/' + rounds + ' 轮 · 提取卖家', round: r, rounds });
    const aodUrl = queue.shift();
    const asin = (aodUrl.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || aodUrl.slice(0, 20);
    // ① 从 aod 提取全部跟卖卖家 (内置亚马逊官方过滤 + 亚马逊词汇筛选)
    let sellers = [];
    let aodErr = null;
    try {
      sellers = await cdpExtractAodSellers(aodUrl, { amazonWords: opts.amazonWords, zip: opts.zip });
    } catch (e) {
      aodErr = e.message;
    }
    // 兜底: aod 实时提取失败 (如商品当前无可用报价) → 复用商品库历史跟卖卖家继续采集
    let sellerFrom = 'aod';
    if (!sellers.length) {
      const hist = sellersFromProduct(products.find((x) => x.asin === asin));
      if (hist.length) { sellers = hist; sellerFrom = 'history'; }
    }
    if (!sellers.length) {
      const res = { round: r, asin, error: aodErr ? 'aod 提取失败: ' + aodErr : '无跟卖卖家', sellerFrom };
      // 兜底自动跳转: 从商品库挑下一个有跟卖链接且未处理的商品 (构造 aod 链接继续)
      if (!queue.length) {
        const newOnes = products.filter((x) => !x.__roundDone && x.asin !== asin && x.offerPrices && x.offerPrices.length && applyCollectFilter(x, opts.filter));
        if (newOnes.length) {
          const next = newOnes[0];
          next.__roundDone = true;
          const host = 'www.amazon.de';
          queue.push(`https://${host}/dp/${next.asin}/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new`);
          res.autoJump = true;
          res.nextAsin = next.asin;
        }
      }
      roundsOut.push(res);
      continue;
    }
    // 排除指定卖家 (jianjun 等)
    if (exclude.length) {
      sellers = sellers.filter((s) => {
        const nm = String(s.seller || '').toLowerCase();
        const sid = String(s.sellerId || '').toLowerCase();
        return !exclude.some((x) => nm.includes(x) || sid.includes(x));
      });
    }
    if (!sellers.length) { roundsOut.push({ round: r, asin, error: '排除指定卖家后无剩余卖家' }); continue; }
    const sellersOut = [];
    // ② 分批并行开标签页采集 (每批 ≤ concurrency)
    for (let i = 0; i < sellers.length; i += concurrency) {
      if (collectStopRequested()) { sellersOut.push({ seller: '(停止)', note: '用户已停止, 本批跳过' }); break; }
      const chunk = sellers.slice(i, i + concurrency);
      const jobs = chunk.map(async (s) => {
        let tab = null;
        try {
          tab = await cdpCreateTab('https://www.amazon.de/');
          const out = await cdpFollowShopChain(s.sellerUrl, { maxItems, maxPages, wsUrl: tab.wsUrl, filter: opts.filter, shopAplus: opts.shopAplus, brandStore: opts.brandStore, brandShop: opts.brandShop, zip: opts.zip });
          const added = ingestFollowShopProducts(out, true, 0);
          return { seller: out.sellerName || s.seller || out.sellerId, sellerId: out.sellerId || s.sellerId, spUrl: out.spUrl, storeUrl: out.storeUrl, productCount: out.products.length, skipped: out.skipped || 0, shopSkipped: out.shopSkipped || 0, brandShopSkip: out.brandShopSkip || 0, brandSkip: out.brandSkip || 0, added, products: out.products.map((p) => ({ asin: p.asin, title: p.title.slice(0, 100), price: p.price })), steps: out.steps, tab };
        } catch (e) {
          return { seller: s.seller || s.sellerId, sellerId: s.sellerId, error: e.message, tab };
        }
      });
      const settled = await Promise.allSettled(jobs);
      for (const st of settled) {
        const r2 = st.status === 'fulfilled' ? st.value : { seller: '?', error: st.reason && st.reason.message || '未知错误' };
        if (r2.tab && r2.tab.targetId) { try { await cdpCloseTab(r2.tab.targetId); } catch {} }
        sellersOut.push(r2);
        if (r2.error) continue;
        totalAdded += r2.added || 0;
      }
      const doneShops = sellersOut.filter((x) => !x.error).length;
      const gotItems = sellersOut.reduce((n, x) => n + (x.productCount || 0), 0);
      bumpCollectProgress({ step: '第 ' + r + '/' + rounds + ' 轮 · 采店铺', round: r, rounds, shopsDone: doneShops, shopsTotal: sellers.length, items: gotItems, added: totalAdded });
    }
    roundsOut.push({ round: r, asin, sellerCount: sellers.length, sellerFrom, sellers: sellersOut });
    // ③ 自动补充下一个商品: 从本轮新增入库的店铺商品中挑一个未处理过且带跟卖链接(aod已采)的, 构造 aod 链接入队
    // (必须要求 offerPrices 有值 — 否则跳到无跟卖的商品, 下一轮 aod 提取必然失败浪费轮次)
    const newOnes = products.filter((x) => x.source === 'cdp-follow-shop' && !x.__roundDone && x.offerPrices && x.offerPrices.length);
    if (!queue.length && newOnes.length) {
      const next = newOnes[0];
      next.__roundDone = true;
      const nextAsin = next.asin;
      const host = 'www.amazon.de';
      queue.push(`https://${host}/dp/${nextAsin}/ref=olp-opf-redir?aod=1&ie=UTF8&condition=new`);
      roundsOut[roundsOut.length - 1].autoJump = true;
      roundsOut[roundsOut.length - 1].nextAsin = nextAsin;
    }
    // 每个商品之间留间隔, 避免触发风控
    await new Promise((r) => setTimeout(r, 3000));
  }
  // 清理 __roundDone 标记
  products.forEach((x) => delete x.__roundDone);
  // 采集到商品(新增或更新)即保存入库
  const totalCollected = roundsOut.reduce((n, r) => n + (r.sellers || []).reduce((m, s) => m + (s.productCount || 0), 0), 0);
  if (totalAdded > 0 || totalCollected > 0) save('products.json', products);
  return { rounds: roundsOut, added: totalAdded, okRounds: roundsOut.filter((x) => !x.error && !x.note).length, autoJumps: roundsOut.filter((x) => x.autoJump).length, stopped: collectStopRequested() };
}

// ===== 跟卖店铺批量采集 (全程 CDP) + 循环跳转 =====
// 流程: 每轮处理一个商品 → 遍历其全部跟卖卖家(出售单位) → 逐个跳转卖家详情页(/sp) → 参观出售单位链接
//       → 卖家店铺全部商品采集 → 下一个卖家 → 该商品所有卖家采集完成后 → 根据采集到的商品信息(新ASIN)跳转循环
// 输入: asins 商品 ASIN/链接数组 (优先取商品库 offerPrices[].sellerUrl; 不在库/无跟卖链接时自动转 aod 实时提取卖家, 真正去采集)
// rounds 循环轮次 (自动从新采集商品挑下一个)
async function cdpFollowShopBatch(asins, opts = {}) {
  // 0 = 无限制
  const maxItems = opts.maxItems === 0 ? Infinity : Math.min(100, Math.max(1, opts.maxItems || 10));   // 每店铺商品数上限
  const maxPages = opts.maxPages === 0 ? Infinity : Math.min(20, Math.max(1, opts.maxPages || 2));     // 每店铺翻页上限
  const rounds = opts.rounds === 0 ? Infinity : Math.min(30, Math.max(1, opts.rounds || 1));           // 循环轮次: 每轮一个商品, 自动跳转
  const concurrency = Math.min(6, Math.max(1, opts.concurrency || 4)); // 并行卖家店铺数
  const exclude = (opts.excludeSellers || '').split(/[,，]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const amazonWords = String(opts.amazonWords || 'amazon,亚马逊');
  const results = [];
  let totalAdded = 0;
  // 队列: 先用户指定商品, 用完自动从新采集的店铺商品中挑下一个
  const queue = [...asins];
  const processed = new Set();
  for (let r = 1; r <= rounds; r++) {
    if (collectStopRequested()) { results.push({ round: r, note: '用户已停止采集, 提前结束' }); break; }
    if (!queue.length) { results.push({ round: r, note: '无更多商品可处理, 提前结束' }); break; }
    const input = queue.shift();
    const asin = (String(input).match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || String(input).trim();
    if (processed.has(asin)) { results.push({ round: r, asin, note: '已处理过, 跳过' }); continue; }
    processed.add(asin);
    const prod = products.find((x) => x.asin === asin);
    // 卖家来源: ① 商品库 offerPrices 已采跟卖链接 (快路径) ② 不在库/无链接 → 转 aod 实时提取 (真正去采集)
    let sellers = [];
    let sellerFrom = '库';
    if (prod && (prod.offerPrices || []).some((o) => o.sellerUrl)) {
      sellers = sellersFromProduct(prod);
    } else {
      sellerFrom = 'aod';
      try {
        sellers = await cdpExtractAodSellers(toAodUrl(input), { amazonWords, zip: opts.zip });
      } catch (e) {
        const res = { round: r, asin, error: 'aod 提取失败: ' + e.message };
        // 兜底自动跳转: 从商品库挑下一个有跟卖链接且未处理的商品继续 (不浪费轮次)
        if (!queue.length) {
          const next = products.find((x) => !processed.has(x.asin) && x.asin !== asin && x.offerPrices && x.offerPrices.some((o) => o.sellerUrl) && applyCollectFilter(x, opts.filter));
          if (next) { queue.push(next.asin); res.autoJump = true; res.nextAsin = next.asin; }
        }
        results.push(res);
        continue;
      }
      // 排除指定卖家 (名称/ID, 逗号分隔)
      if (exclude.length) {
        sellers = sellers.filter((s) => {
          const nm = String(s.seller || '').toLowerCase();
          const sid = String(s.sellerId || '').toLowerCase();
          return !exclude.some((x) => nm.includes(x) || sid.includes(x));
        });
      }
    }
    if (!sellers.length) {
      const res = { round: r, asin, error: sellerFrom === '库' ? '无带跳转链接的跟卖卖家' : 'aod 无跟卖卖家' };
      // 兜底自动跳转: 从商品库挑下一个有跟卖链接且未处理的商品继续 (不浪费轮次)
      if (!queue.length) {
        const next = products.find((x) => !processed.has(x.asin) && x.asin !== asin && x.offerPrices && x.offerPrices.some((o) => o.sellerUrl) && applyCollectFilter(x, opts.filter));
        if (next) { queue.push(next.asin); res.autoJump = true; res.nextAsin = next.asin; }
      }
      results.push(res);
      continue;
    }
    const sellersOut = [];
    // 并行采集: 分批开标签页 (每批 ≤ concurrency), 提升速度
    for (let i = 0; i < sellers.length; i += concurrency) {
      if (collectStopRequested()) { sellersOut.push({ seller: '(停止)', note: '用户已停止, 本批跳过' }); break; }
      const chunk = sellers.slice(i, i + concurrency);
      const jobs = chunk.map(async (s) => {
        let tab = null;
        try {
          tab = await cdpCreateTab('https://www.amazon.de/');
          const out = await cdpFollowShopChain(s.sellerUrl, { maxItems, maxPages, wsUrl: tab.wsUrl, filter: opts.filter, shopAplus: opts.shopAplus, brandStore: opts.brandStore, brandShop: opts.brandShop, zip: opts.zip });
          const added = ingestFollowShopProducts(out, true, 0);
          return { seller: out.sellerName || s.seller || out.sellerId, sellerId: out.sellerId || s.sellerId, spUrl: out.spUrl, storeUrl: out.storeUrl, productCount: out.products.length, skipped: out.skipped || 0, shopSkipped: out.shopSkipped || 0, brandShopSkip: out.brandShopSkip || 0, brandSkip: out.brandSkip || 0, added, products: out.products.map((p) => ({ asin: p.asin, title: p.title.slice(0, 100), price: p.price })), steps: out.steps, tab };
        } catch (e) {
          return { seller: s.seller || s.sellerId, sellerId: s.sellerId, error: e.message, tab };
        }
      });
      const settled = await Promise.allSettled(jobs);
      for (const st of settled) {
        const r2 = st.status === 'fulfilled' ? st.value : { seller: '?', error: st.reason && st.reason.message || '未知错误' };
        if (r2.tab && r2.tab.targetId) { try { await cdpCloseTab(r2.tab.targetId); } catch {} }
        sellersOut.push(r2);
        if (r2.error) continue;
        totalAdded += r2.added || 0;
      }
    }
    results.push({ round: r, asin, title: ((prod && prod.title) || asin).slice(0, 80), sellerCount: sellers.length, sellerFrom, sellers: sellersOut, autoJump: false });
    bumpCollectProgress({ step: '第 ' + r + ' 轮采集完成', round: r, rounds, items: results.reduce((n, x) => n + (x.sellers || []).reduce((m, s) => m + (s.productCount || 0), 0), 0), added: totalAdded });
    // ===== 循环跳转: 该商品所有卖家店铺采集完成 → 根据采集到的商品信息挑下一个 =====
    if (!queue.length) {
      // 优先挑带跟卖链接(aod 已采)的新入库店铺商品, 未处理过的
      const newOnes = products.filter((x) => x.source === 'cdp-follow-shop' && !processed.has(x.asin) && x.offerPrices && x.offerPrices.length);
      if (newOnes.length) {
        const next = newOnes[0];
        queue.push(next.asin);
        results[results.length - 1].autoJump = true;
        results[results.length - 1].nextAsin = next.asin;
      }
    }
    // 每个商品之间留间隔, 避免触发风控
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  // 采集到商品(新增或更新)即保存入库
  const totalCollected = results.reduce((n, r) => n + (r.sellers || []).reduce((m, s) => m + (s.productCount || 0), 0), 0);
  if (totalAdded > 0 || totalCollected > 0) save('products.json', products);
  const okRounds = results.filter((x) => !x.error && !x.note).length;
  const autoJumps = results.filter((x) => x.autoJump).length;
  const stopped = collectStopRequested();
  return { results, added: totalAdded, okRounds, autoJumps, stopped };
}

// ===== 详情修复 (存量数据修复): 重新打开商品详情页, 用与采集链路同一套提取逻辑刷新全部详情字段 =====
// 修复内容: 主图(高清) / 真实价格 / 配送FBA-FBM / 亚马逊自营 / A+ / 主卖家 / 评分评论 / 类目 / BSR / 站点币种
// 目标筛选: asins 指定 / since 采集时间 / needsDetail=true 只修"详情页从未读成功过"的 / all=true 全库
// 可被「停止」中断
async function cdpBackfillMainImage(opts = {}) {
  const asinList = Array.isArray(opts.asins) && opts.asins.length ? opts.asins.map((x) => String(x).trim().toUpperCase()) : null;
  const since = opts.since ? String(opts.since) : null;
  const limit = opts.limit > 0 ? parseInt(opts.limit, 10) : 0;
  const catOnly = !!opts.catOnly;                       // 仅补类目层级: 不滚动(面包屑在页首) → 明显更快
  let targets = products.filter((x) => x && x.asin);
  if (catOnly) targets = targets.filter((x) => !x.catSrc);                    // 只补"没类目层级"的
  else if (opts.needsDetail) targets = targets.filter((x) => !x.detailOk);     // 详情页从未读成功
  else if (!asinList) targets = targets.filter((x) => !x.mainImage || !x.detailOk);
  if (asinList) targets = targets.filter((x) => asinList.includes(String(x.asin).toUpperCase()));
  if (since) targets = targets.filter((x) => String(x.collectedAt || '') >= since);
  targets.sort((a, b) => String(b.collectedAt || '').localeCompare(String(a.collectedAt || '')));
  if (limit) targets = targets.slice(0, limit);
  if (!targets.length) return { total: 0, fixed: 0, failed: 0, results: [] };

  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && /amazon\./.test(t.url || '')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);

  // 提取表达式 = 共用 DETAIL_READ_EXPR (与批量品牌采集同一实现, 见 DETAIL_CORE_JS 注释)
  const IMG_EXPR = DETAIL_READ_EXPR;

  const results = [];
  let fixed = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    if (collectStopRequested()) { results.push({ error: '用户已停止 (处理到第 ' + (i + 1) + ' 个)', stopped: true }); break; }
    const it = targets[i];
    const host = 'www.amazon.' + siteToHostSuffix(it.site || 'uk');
    bumpCollectProgress({ items: i + 1, added: fixed, step: '补主图 ' + it.asin + ' (' + (i + 1) + '/' + targets.length + ')' });
    try {
      await send('Page.navigate', { url: 'https://' + host + '/dp/' + it.asin });
      await new Promise((r) => setTimeout(r, 2500));
      // 等详情页渲染 (标题 + 主图), 最多 15s — 与采集链路同一就绪判定
      for (let w = 0; w < 15; w++) {
        try {
          const rr = await send('Runtime.evaluate', {
            expression: `(() => { const t = document.querySelector('#productTitle'); const i = document.querySelector('#landingImage, #imgTagWrapperId img, #main-image-container img, #imageBlock img'); return JSON.stringify({ t: !!t, i: !!i }); })()`,
            returnByValue: true,
          });
          const st = JSON.parse(rr.result.value);
          if (st.t && st.i) break;
        } catch (e) { /* 继续等 */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      for (let s = 0; s < 2 && !catOnly; s++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 600)); }
      await new Promise((r) => setTimeout(r, catOnly ? 300 : 800));
      const rf = await send('Runtime.evaluate', { expression: IMG_EXPR, returnByValue: true });
      let d = {};
      try { d = JSON.parse(rf.result.value || '{}'); } catch (e) { d = {}; }
      // 详情修复: 读成功(detailOk)才判定 配送/自营/A+; 价格取详情页真实价 (店铺卡片价不可靠)
      if (d.mainImage) { it.mainImage = d.mainImage; fixed++; } else failed++;
      if (d.rating != null) it.rating = d.rating;
      if (d.reviews != null) it.reviews = d.reviews;
      if (d.category) it.category = d.category;
      if (d.brand && (!it.brand || it.brand === 'Unknown')) it.brand = d.brand;
      if (d.newFrom != null) { it.price = d.newFrom; it.minPrice = d.newFrom; if (d.price != null) it.buyBoxPrice = d.price; }
      else if (d.price != null) { it.price = d.price; it.buyBoxPrice = d.price; it.minPrice = d.price; }   // 价格修正 → minPrice/buyBoxPrice 同步, 否则会残留旧价
      // 报价里的最低价若存在, minPrice 取 自身价 与 报价最低价 的较小值
      if (Array.isArray(it.offerPrices) && it.offerPrices.length) {
        const nums = [it.price, ...it.offerPrices.map((o) => o.price)].filter((v) => v != null);
        if (nums.length) it.minPrice = Math.min(...nums);
      }
      if (d.bsr && d.bsr.length) { it.bsr = d.bsr; it.rank = '#' + Math.max(...d.bsr.map((b) => b.rank)); }
      if (d.firstAvailable) it.firstAvailable = d.firstAvailable;
      const wasVerified = it.detailVer === DETAIL_VER;    // 旧值是否由"当前版本"提取器验证过
      if (d.detailOk) {
        it.detailOk = true; it.detailAt = now(); it.detailVer = DETAIL_VER;        it.aplus = !!d.aplus;
        if (d.regionText) {
          it.amazonSell = !!d.amazonSell;
          if (d.fulfill) it.fulfill = d.fulfill;
          else if (!wasVerified) it.fulfill = null;       // 旧值是默认猜的 → 清成"未知", 不留假数据
          it.sellerRegion = d.regionText.slice(0, 200);
        }
        if (d.mainSeller) it.mainSeller = d.mainSeller;
        if (siteSymbolOk(d.curSymbol, it.site || host)) it.priceSymbol = d.curSymbol;
        if (d.catPath) { it.catPath = d.catPath; it.cat1 = d.cat1; it.cat2 = d.cat2; it.cat3 = d.cat3; it.catNodes = d.catNodes || null; it.catSrc = 'bc'; it.catAt = now(); }
        it.currency = siteCurrency(it.site || 'uk');
      }
      results.push({ asin: it.asin, site: it.site, mainImage: !!d.mainImage, rating: d.rating, category: d.category, fulfill: it.fulfill, amazonSell: it.amazonSell, aplus: it.aplus, mainSeller: it.mainSeller, price: it.price, currency: it.currency, region: (d.regionText || '').slice(0, 160) });
    } catch (e) {
      failed++;
      results.push({ asin: it.asin, site: it.site, error: e && e.message });
    }
    save('products.json', products);
    await new Promise((r) => setTimeout(r, 700));
  }
  return { total: targets.length, fixed, failed, results };
}

// 站点 → 币种 (缺失会导致 AU 商品被写为 EUR 等错误数据)
const SITE_CURRENCY = {
  uk: 'GBP', us: 'USD', au: 'AUD', ca: 'CAD', jp: 'JPY', in: 'INR', mx: 'MXN', br: 'BRL',
  sg: 'SGD', tr: 'TRY', ae: 'AED', sa: 'SAR', se: 'SEK', pl: 'PLN', nl: 'EUR', de: 'EUR',
  fr: 'EUR', it: 'EUR', es: 'EUR', be: 'EUR', ie: 'EUR',
};
const siteCurrency = (site) => SITE_CURRENCY[site] || 'EUR';
// 币种符号校验: 只接受与站点币种匹配的符号
// 为什么需要: 页面里会注入智赢插件自己的价格块(常按 CNY 显示), 而 .a-price-symbol/.a-offscreen 是通用 class →
// 详情提取会把插件的 "CNY" 当成亚马逊价格符号读进来 (实测存量里出现过 de/EUR 行却带 CNY 符号)
function siteSymbolOk(sym, siteOrHost) {
  if (!sym) return false;
  const raw = String(siteOrHost || '');
  let site = raw;
  const m = raw.match(/amazon\.([a-z.]+)$/);
  if (m) site = CDP_SITE_CODE[m[1]] || m[1];
  const cur = SITE_CURRENCY[site];
  const allow = { AUD: ['$', 'A$'], USD: ['$', 'US$'], GBP: ['£'], EUR: ['€'], JPY: ['¥'], CAD: ['$', 'C$'], INR: ['₹'], MXN: ['$', 'MX$'], BRL: ['R$'], SGD: ['S$'], PLN: ['zł'], SEK: ['kr'], TRY: ['₺'], AED: ['AED'], SAR: ['SAR'] }[cur];
  if (!cur || !allow) return true;                      // 未知站点 → 不拦
  return allow.indexOf(String(sym).trim()) >= 0;
}

// 跟卖店铺采集结果 → 导入商品库 (新增 + 已存在更新变体/价格/品牌, 返回新增数)
function ingestFollowShopProducts(out, withPanel = false, panelLimit = 0) {
  const site = out.site;
  const currency = siteCurrency(site);
  const used = new Set(products.map((x) => x.asin));
  let added = 0;
  for (let i = 0; i < out.products.length; i++) {
    const p = out.products[i];
    let pd = null;
    if (withPanel && i < panelLimit && out.send) {
      try { pd = cdpReadOnePanel(out.send, p.asin, out.host.replace('www.amazon.', '')); }
      catch { pd = null; }
    }
    const price = parseFloat(String(p.price).replace(/[^0-9.,]/g, '').replace(',', '.')) || null;
    // bsr 规范化: 店铺页 ranktag 是纯数字数组, 详情修正后是 {rank,category} 对象数组 → 统一对象
    const pBsr = (Array.isArray(p.bsr) ? p.bsr : []).map((b) => typeof b === 'number' ? { rank: b, category: 'ListPage' } : (b && typeof b === 'object' && b.rank != null ? b : null)).filter(Boolean);
    const tm = pd && pd.tmText || '';
    // 插件字段取值: 详情页内联插件读取 (p.*, 详情阶段已取) 优先于旧的面板补全 (pd) — 两者同源, p 更新
    const pfv = (k) => (p[k] != null && p[k] !== '' ? p[k] : (pd ? pd[k] : null)) || null;
    const sales30dNum = parseInt(String(pfv('sales30d') || '').replace(/[^\d]/g, ''), 10) || 0;
    // 品牌: 详情页修正的品牌 > 插件面板品牌 > Unknown
    let brandName = (pd && pd.brand) || null;
    if (!brandName && p.brand) brandName = String(p.brand).replace(/\s+/g, ' ').trim();
    if (!brandName) brandName = 'Unknown';
    brandName = brandName.replace(/^Brand:\s*/i, '').slice(0, 40) || 'Unknown';
    const variants = p.variants || null;
    const variations = variants && variants.length ? variants.reduce((n, g) => n + g.options.length, 0) : (p.variations || 0);
    // minPrice 兜底: 自身价格 与 offerPrices 最低价 取最小 (商品页 "from €X" 含自身报价)
    const minPriceVal = p.minPrice != null ? p.minPrice : (() => {
      const nums = [price, ...(p.offerPrices || []).map((o) => o.price)].filter((v) => v != null);
      return nums.length ? Math.min(...nums) : null;
    })();
    // 已存在 → 更新价格/品牌/变体/跟卖/配送
    const existing = products.find((x) => x.asin === p.asin);
    if (existing) {
      if (price != null) {
        existing.price = price;
        // 价格变了 → 佣金按类目费率表重算 (旧值是按旧价×15% 存的, 不更新会导致佣金率算错)
        const nr = referralRateFor(existing.cat1).rate / 100;
        existing.referralFee = Math.round(price * nr * 100) / 100;
        existing.netProfit = null;   // 旧净利是硬编码公式产物, 已不可信 → 由利润测算产生
      }
      existing.brand = brandName;
      if (variants && variants.length) { existing.variants = variants; existing.variations = variations; }
      if (p.title) existing.title = p.title;
      if (p.bsr && p.bsr.length) { existing.bsr = pBsr; existing.rank = pBsr.length ? '#' + Math.max(...pBsr.map((b) => b.rank)) : existing.rank; }
      if (p.rating != null) existing.rating = p.rating;
      if (p.reviews != null) existing.reviews = p.reviews;
      if (p.category) existing.category = p.category;
      if (p.firstAvailable) existing.firstAvailable = p.firstAvailable;
      // 物流字段 (详情页内联插件读取优先, 面板补全兜底: 重量/尺寸/包装/FBA费用/商品类型)
      if (pfv('size')) existing.size = pfv('size');
      if (pfv('weight')) existing.weight = pfv('weight');
      if (pfv('packSize')) existing.packSize = pfv('packSize');
      if (pfv('packWeight')) existing.packWeight = pfv('packWeight');
      if (pfv('fbaFee')) existing.fbaFee = pfv('fbaFee');
      if (pfv('productType')) existing.productType = pfv('productType');
      if (sales30dNum > 0) existing.monthlySales = sales30dNum;
      // 配送方式/主报价卖家/A+/亚马逊自营/主图/商标 — 三态更新 (详情页读成功才判定 true/false)
      if (p.fulfill) existing.fulfill = p.fulfill;
      if (p.mainSeller) existing.mainSeller = p.mainSeller;
      if (p.detailOk) {
        const wasVerified = existing.detailVer === DETAIL_VER;
        existing.aplus = !!p.aplus;
        existing.detailOk = true;
        existing.detailAt = p.detailAt || now();
        existing.detailVer = DETAIL_VER;
        if (p.sellerRegion) {
          existing.amazonSell = !!p.amazonSell;
          existing.sellerRegion = p.sellerRegion;
          if (!p.fulfill && !wasVerified) existing.fulfill = null;   // 旧值是猜的 → 清成未知
        }
        if (siteSymbolOk(p.priceSymbol, existing.site)) existing.priceSymbol = p.priceSymbol;
        if (p.catPath) { existing.catPath = p.catPath; existing.cat1 = p.cat1; existing.cat2 = p.cat2; existing.cat3 = p.cat3; existing.catNodes = p.catNodes || null; existing.catSrc = 'bc'; existing.catAt = p.catAt || now(); }
        existing.currency = currency;                 // 站点币种纠正 (AU→AUD 等)
      }
      if (p.mainImage) existing.mainImage = p.mainImage;
      if (p.trademarkCount != null && p.trademarkCount > 0) existing.trademarkCount = p.trademarkCount;
      if (p.tmCountries && p.tmCountries.length) existing.tmCountries = p.tmCountries;
      if (p.tmText) existing.tmText = p.tmText;
      // 跟卖 (aod): 有则更新
      if (p.offerPrices && p.offerPrices.length) {
        existing.offerPrices = p.offerPrices;
        existing.followCount = p.followCount || p.offerPrices.length;
        existing.aodTotal = p.aodTotal;
        // minPrice: 优先采集值, 否则取 自身价格 与 offerPrices 最低价 的最小值
        // (商品页 "New from €X" 含自身报价; 只取 offerPrices 会把 minPrice 错误抬高于自身价)
        if (p.minPrice != null) existing.minPrice = p.minPrice;
        else {
          const nums = [existing.price, ...p.offerPrices.map((o) => o.price)].filter((v) => v != null);
          if (nums.length) existing.minPrice = Math.min(...nums);
        }
      }
      continue;
    }
    used.add(p.asin);
    const bsr = pBsr;
    const maxRank = bsr.length ? Math.max(...bsr.map((b) => b.rank)) : null;
    const item = {
      id: p.asin, asin: p.asin, rank: maxRank != null ? '#' + maxRank : null, title: p.title, brand: brandName,
      brandStatus: 'unchecked', bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
      followCount: p.followCount || 0, chinaSeller: false,
      // 未知一律 null (绝不伪造成 FBM/4分等); 详情页读成功(detailOk)才有 true/false 判定
      fulfill: p.fulfill || null, amazonSell: p.detailOk ? !!p.amazonSell : null,
      mainSeller: p.mainSeller || null, mainImage: p.mainImage || null,
      aplus: p.detailOk ? !!p.aplus : null, detailOk: !!p.detailOk, detailAt: p.detailAt || null, detailVer: p.detailVer || null,
      sellerRegion: p.sellerRegion || null, priceSymbol: p.priceSymbol || null,
      trademarkCount: p.trademarkCount || 0, tmCountries: p.tmCountries || [], tmText: p.tmText || null,
      price, currency,
      offerPrices: p.offerPrices || null,
      minPrice: minPriceVal,
      monthlySales: sales30dNum,
      reviews: p.reviews != null ? p.reviews : null, rating: p.rating != null ? p.rating : null, stock: 0,
      listedAt: (p.firstAvailable || pfv('listedAt') || '').slice(0, 10) || null,   // 读不到上架日期 → null (不写"今天")
      size: pfv('size'), weight: pfv('weight'), packSize: pfv('packSize'), packWeight: pfv('packWeight'),
      color: (pd && pd.color) || p.color || null, variantSize: (pd && pd.variantSize) || p.variantSize || null, fbaFee: pfv('fbaFee'),
      productType: pfv('productType'), sellerId: out.sellerId || null,
      bsr, variations: (p.variants && p.variants.length ? p.variants.reduce((n, g) => n + g.options.length, 0) : 0),
      variants: p.variants || null,
      referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
      site, category: p.category || 'FollowShop', collectedAt: now(), source: 'cdp-follow-shop', saved: false, real: true,
      // 类目层级 (面包屑): 一级/二级/三级 + 全路径 + Amazon 节点ID
      catPath: p.catPath || null, cat1: p.cat1 || null, cat2: p.cat2 || null, cat3: p.cat3 || null,
      catNodes: p.catNodes || null, catSrc: p.catPath ? 'bc' : null, catAt: p.catPath ? (p.catAt || now()) : null,
      shopSeller: out.sellerName || out.sellerId || null, shopUrl: (out.storeUrl || '').slice(0, 160), sellerPageUrl: (out.spUrl || '').slice(0, 160),
    };
    item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
    item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 + Math.random() * 10)));
    item.aiRiskLevel = 'low';
    item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
    products.unshift(item);
    added++;
  }
  return added;
}

// 品牌链采集: 店铺页 → 品牌店 → 品牌全部商品 (多页) + 插件面板补全 (全程 CDP)
async function cdpBrandChain(url, maxBrands = 2, maxPages = 3, withPanel = true, panelLimit = 0) {
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
  const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
  const host = 'www.amazon.' + siteToHostSuffix(site);

  // 1. 店铺页商品 + 品牌链接
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 9000));
  for (let i = 0; i < 5; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 1500));
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const out = [];
      document.querySelectorAll('div[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
        const titleEl = el.querySelector('h2 span, h2');
        const priceEl = el.querySelector('.a-price .a-offscreen');
        let brandLink = null, brandName = null;
        el.querySelectorAll('a[href*="/sp?seller="]').forEach(a => { if (!brandLink) { brandLink = a.getAttribute('href'); brandName = (a.textContent || '').trim().replace(/\\s+/g, ' '); } });
        out.push({ asin, title: titleEl ? titleEl.textContent.trim().slice(0, 150) : '', price: priceEl ? priceEl.textContent.trim() : '', brandLink, brandName: brandName || null });
      });
      const seen = new Set();
      return JSON.stringify(out.filter(c => { if (seen.has(c.asin)) return false; seen.add(c.asin); return true; }));
    })()`, returnByValue: true,
  });
  let shopCards = [];
  try { shopCards = JSON.parse(r1.result.value); } catch {}
  const brandMap = new Map();
  shopCards.forEach((c) => {
    if (c.brandLink && !brandMap.has(c.brandName || c.brandLink)) {
      const spUrl = c.brandLink.startsWith('http') ? c.brandLink : `https://${host}` + c.brandLink;
      brandMap.set(c.brandName || c.brandLink, { name: c.brandName || '未知品牌', spUrl });
    }
  });
  const brands = [...brandMap.values()].slice(0, maxBrands);

  // 2. 逐个品牌: 跳品牌店 → 找商品列表 → 翻页采集
  const results = [];
  for (const brand of brands) {
    if (collectStopRequested()) break;
    await send('Page.navigate', { url: brand.spUrl });
    await new Promise((r) => setTimeout(r, 8000));
    for (let i = 0; i < 3; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 800)); }
    await new Promise((r) => setTimeout(r, 1200));
    const r2 = await send('Runtime.evaluate', {
      expression: `(() => {
        let link = null;
        document.querySelectorAll('a[href*="seller="], a[href*="me="]').forEach(a => {
          const h = a.getAttribute('href') || '';
          if (h.includes('s?') && !link) link = h;
        });
        return JSON.stringify(link);
      })()`, returnByValue: true,
    });
    let listUrl = r2.result.value;
    try { listUrl = JSON.parse(listUrl); } catch {}
    if (!listUrl) continue;
    if (!listUrl.startsWith('http')) listUrl = `https://${host}` + listUrl;
    const products = [];
    const seenAsin = new Set();
    for (let pg = 1; pg <= maxPages; pg++) {
      if (collectStopRequested()) break;
      const pgUrl = pg === 1 ? listUrl : listUrl.includes('page=') ? listUrl.replace(/page=\d+/, 'page=' + pg) : listUrl + (listUrl.includes('?') ? '&' : '?') + 'page=' + pg;
      await send('Page.navigate', { url: pgUrl });
      await new Promise((r) => setTimeout(r, 8000));
      for (let i = 0; i < 4; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 900)); }
      await new Promise((r) => setTimeout(r, 1200));
      const r3 = await send('Runtime.evaluate', {
        expression: `(() => {
          const out = [];
          document.querySelectorAll('div[data-asin]').forEach(el => {
            const asin = el.getAttribute('data-asin');
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !el.querySelector('a[href*="/dp/"]')) return;
            const t = el.querySelector('h2 span, h2');
            const pr = el.querySelector('.a-price .a-offscreen');
            const lk = el.querySelector('a[href*="/dp/"]');
            out.push({ asin, title: t ? t.textContent.trim().slice(0, 150) : '', price: pr ? pr.textContent.trim() : '', link: lk ? lk.href : '' });
          });
          return JSON.stringify(out);
        })()`, returnByValue: true,
      });
      let items = [];
      try { items = JSON.parse(r3.result.value); } catch {}
      const fresh = items.filter((x) => !seenAsin.has(x.asin));
      fresh.forEach((x) => seenAsin.add(x.asin));
      products.push(...fresh);
      if (items.length < 16) break;
    }
    // 插件面板补全 (全程 CDP, 无 API): 品牌/商标/排名/销量/FBA/尺寸
    if (withPanel && products.length) {
      const toPanel = panelLimit > 0 ? products.slice(0, panelLimit) : products;
      console.log(`  [面板补全] ${toPanel.length}/${products.length} 个商品 (每个约15秒)...`);
      for (let i = 0; i < toPanel.length; i++) {
        let pd;
        try { pd = await cdpReadOnePanel(send, toPanel[i].asin, site === 'uk' ? 'co.uk' : site === 'us' ? 'com' : site); }
        catch (e) { pd = { error: 'CDP异常: ' + e.message }; }
        toPanel[i] = { ...toPanel[i], panel: pd };
        if (i % 2 === 0) console.log(`    [${i + 1}/${toPanel.length}] ${toPanel[i].asin} ${pd.error ? '✗' + pd.error : '✓ 品牌:' + (pd.brand || '-') + ' ' + (pd.tmText || '-') + ' ' + (pd.fulfill || '-') + ' 销量:' + (pd.sales30d || '-') + ' 榜单:' + (pd.bsr || []).length + '条'}`);
      }
    }
    results.push({ name: brand.name, spUrl: brand.spUrl, listUrl, products });
  }
  return { shopCount: shopCards.length, brands: results, totalProducts: results.reduce((s, x) => s + x.products.length, 0) };
}

// ===== 批量品牌采集: 商品库品牌 → 品牌跳转链接 → 品牌全部商品 → 采集筛选 → 详情补全 =====
// 与「跟卖店铺采集」的区别: 跳转的是"商品品牌"的链接 (品牌店/品牌页), 不是跟卖卖家的店铺
// 与「类目搜索采集」的关系: 完全共用 ①采集筛选(applyCollectFilter) ②详情提取器(DETAIL_READ_EXPR) ③入库字段
//
// leads (由路由从商品库品牌去重得到, 零成本不额外请求网页): [{ asin, brand }]
// 每个品牌线索:
//   ① 打开线索商品的详情页 → 读品牌名 + 品牌跳转链接 (bylineInfo / field-keywords / 品牌店 /stores/)
//   ② 品牌页抓列表 (+翻页) — 列表页就能判的条件先预筛 (关键词/价格/页面标识), 减少详情页访问
//   ③ 通过预筛的候选逐个读完整详情页 (与「详情修复」同一提取器)
//   ④ 品牌名校验: 详情页品牌 ≠ 目标品牌 → 丢弃 (品牌页/搜索页常混入他牌商品)
//   ⑤ 统一采集筛选: applyCollectFilter (与类目搜索采集同一条判定, 不通过则不入库)
//   ⑥ 每品牌保留 maxPerBrand 个 (采集筛选把候选筛掉的会继续往后补, 保证"够数")
// 可选插件面板补全: 商标/月销/尺寸/重量 — 筛选条件需要这些字段时自动开 (每商品约 +8s)
async function cdpBrandBatch(opts = {}) {
  const leads = (Array.isArray(opts.leads) ? opts.leads : [])
    .map((x) => ({ asin: String((x && x.asin) || '').trim().toUpperCase(), brand: (x && x.brand) ? String(x.brand).trim() : null }))
    .filter((x) => /^[A-Z0-9]{10}$/.test(x.asin));
  if (!leads.length) throw new Error('没有可用的品牌线索 (商品库里这些商品缺少品牌)');
  const site = opts.site || 'au';
  const maxPerBrand = Math.min(50, Math.max(1, opts.maxPerBrand || 5));
  const maxPages = Math.min(10, Math.max(1, opts.maxPages || 2));
  const filter = opts.filter && typeof opts.filter === 'object' ? opts.filter : {};
  const host = 'www.amazon.' + siteToHostSuffix(site);
  // 插件面板补全: 显式开启 或 筛选条件需要面板独有字段 (商标数量/月销/品牌状态)
  const needPanel = opts.panel === true || filter.tmMin != null || filter.tmMax != null
    || filter.salesMin != null || filter.salesMax != null || !!filter.brandStatus;

  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && /amazon\./.test(t.url || '')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签, 请确认 Edge 以 --remote-debugging-port=9222 启动');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send('Runtime.enable');

  const known = new Set(products.map((x) => String(x.asin || '').toUpperCase()));   // 库内已有 → 不重复采
  const brands = [];
  for (let li = 0; li < leads.length; li++) {
    if (collectStopRequested()) break;
    const lead = leads[li];
    const label = lead.brand || lead.asin;
    const rec = {
      asin: lead.asin, brand: lead.brand, brandName: null, brandUrl: null, brandSource: null, listUrl: null,
      pages: 0, listCount: 0, candidates: 0, preSkipped: 0, read: 0, kept: 0, skipped: 0, mismatch: 0, panel: 0, error: null, products: [],
    };
    try {
      // ---- ① 线索商品详情页 → 品牌名 + 品牌跳转链接 ----
      bumpCollectProgress({ step: `品牌 ${li + 1}/${leads.length}: ${label} — 读品牌跳转链接`, brandsDone: li, brandsTotal: leads.length });
      await send('Page.navigate', { url: `https://${host}/dp/${lead.asin}` });
      await new Promise((r) => setTimeout(r, 7000));
      const guard = await cdpPageGuard(send);
      if (guard === 'captcha') { rec.error = '触发验证码/风控, 已中止 (请人工过验证后重试)'; brands.push(rec); break; }
      const rb = await send('Runtime.evaluate', { expression: BRAND_LINK_JS, returnByValue: true });
      let bl = {};
      try { bl = JSON.parse(rb.result.value || '{}'); } catch (e) { bl = {}; }
      if (bl.brandName) rec.brandName = bl.brandName;
      const target = rec.brandName || rec.brand || '';
      const abs = (h) => (!h ? null : (h.startsWith('http') ? h : 'https://' + host + h));
      // 品牌跳转链接优先级: 详情页品牌署名链接 (bylineInfo) → 页面品牌链接 (field-keywords) → 品牌店 → 品牌名搜索兜底
      for (const cand of [bl.bylineHref, bl.fieldLink, bl.storeLink]) {
        if (!cand) continue;
        if (/field-keywords|\/stores\/|\/shops\/|[?&]seller=/.test(cand)) {
          rec.brandUrl = abs(cand);
          rec.brandSource = /\/stores\/|\/shops\//.test(cand) ? 'store' : 'brandlink';
          break;
        }
      }
      if (!rec.brandUrl && target && looksLikeSellerHandle(target)) {
        throw new Error('详情页没读到品牌跳转链接, 且线索品牌「' + target + '」像亚马逊随机店铺名而非品牌名 → 已跳过 (否则会去搜杂货商品)');
      }
      if (!rec.brandUrl && target) { rec.brandUrl = `https://${host}/s?k=${encodeURIComponent(target)}`; rec.brandSource = 'search'; }
      if (!rec.brandUrl) throw new Error('未找到品牌跳转链接, 且品牌名为空无法搜索');
      rec.listUrl = rec.brandUrl;

      // ---- ② 品牌页商品列表 (+翻页) ----
      const cands = [];
      const seenA = new Set();
      const candCap = Math.min(120, maxPerBrand * 6);
      for (let pg = 1; pg <= maxPages; pg++) {
        if (collectStopRequested()) break;
        const pgUrl = pg === 1 ? rec.brandUrl
          : (/[?&]page=\d+/.test(rec.brandUrl) ? rec.brandUrl.replace(/page=\d+/, 'page=' + pg) : rec.brandUrl + (rec.brandUrl.includes('?') ? '&' : '?') + 'page=' + pg);
        await send('Page.navigate', { url: pgUrl });
        await new Promise((r) => setTimeout(r, 8000));
        const guard2 = await cdpPageGuard(send);
        if (guard2 === 'captcha') { rec.error = '品牌页触发验证码/风控'; break; }
        for (let i = 0; i < 4; i++) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${(i + 1) * 4000})` }); await new Promise((r) => setTimeout(r, 900)); }
        await new Promise((r) => setTimeout(r, 1200));
        const rl = await send('Runtime.evaluate', { expression: BRAND_LIST_JS, returnByValue: true });
        let items = [];
        try { items = JSON.parse(rl.result.value || '[]'); } catch (e) { items = []; }
        rec.pages = pg;
        rec.listCount += items.length;
        let fresh = 0;
        for (const x of items) {
          if (seenA.has(x.asin) || known.has(x.asin)) continue;
          seenA.add(x.asin); cands.push(x); fresh++;
        }
        bumpCollectProgress({ step: `品牌 ${li + 1}/${leads.length}: ${label} — 第 ${pg} 页列表, 候选 ${cands.length}` });
        if (!items.length) break;
        if (fresh === 0) break;                       // 该页全是重复/库内已有 → 没必要继续翻
        if (cands.length >= candCap) break;
      }
      rec.candidates = cands.length;
      if (!cands.length) {
        if (!rec.error) rec.error = '品牌页未抓到新商品 (可能无商品 / 全部已在库内 / 页面结构变化)';
        brands.push(rec); continue;
      }

      // ---- ③ 列表页可判条件先预筛 (关键词/价格区间/页面标识/1688) ----
      // 关键: 列表页没读到价格时, 价格条件视为"未知"放行 (统一采集筛选的语义: 未知不淘汰) —
      //       品牌店 (/stores/) 卡片结构与搜索页不同, 价格可能整页读不到, 否则会整批被误筛成 0
      const pre = {};
      if (filter.q) pre.q = filter.q;
      if (filter.badges && filter.badges.length) pre.badges = filter.badges;
      if (filter.is1688 != null) pre.is1688 = filter.is1688;
      const pool = cands.filter((x) => {
        const pn = String(x.price || '').replace(/[^0-9.,]/g, '').replace(',', '.');
        const hasPrice = pn !== '' && !isNaN(parseFloat(pn));
        const f2 = Object.assign({}, pre);
        if (!hasPrice) { delete f2.priceMin; delete f2.priceMax; }
        else { if (filter.priceMin != null) f2.priceMin = filter.priceMin; if (filter.priceMax != null) f2.priceMax = filter.priceMax; }
        return applyCollectFilter({ asin: x.asin, title: x.title, badge: x.badge, price: hasPrice ? x.price : null }, f2);
      });
      rec.preSkipped = cands.length - pool.length;
      // 详情页访问上限: 目标数的 2 倍 (筛选会筛掉一部分, 留出补位空间, 但不无限读详情)
      const cap = Math.min(pool.length, maxPerBrand * 2);

      // ---- ④⑤⑥ 详情补全 → 品牌名校验 → 采集筛选 → 保留 maxPerBrand 个 ----
      const kept = [];
      for (let i = 0; i < cap && kept.length < maxPerBrand; i++) {
        if (collectStopRequested()) break;
        const c = pool[i];
        bumpCollectProgress({ step: `品牌 ${li + 1}/${leads.length}: ${label} — 详情补全 ${c.asin} (已读 ${rec.read + 1}/${cap}, 已保留 ${kept.length}/${maxPerBrand})` });
        const it = { asin: c.asin, title: c.title, site };
        await cdpReadDetail(send, host, it);
        rec.read++;
        // 品牌名校验 (详情页品牌为权威值): 与目标品牌不一致 → 丢弃, 防止品牌页/搜索页混入他牌
        if (target && it.brand && !sameBrand(it.brand, target)) { rec.mismatch++; continue; }
        // 插件面板补全 (就地读, 不重新导航)
        if (needPanel) {
          const txt = await waitPanelInline(send, site, 6000, 15000);
          if (txt) {
            try { mergePanelInto(it, parsePanelText(txt, it.asin, it.title || '')); rec.panel++; } catch (e) { /* 面板解析失败忽略 */ }
          }
        }
        // 统一采集筛选 (与类目搜索采集同一判定: 不通过则不入库)
        if (!applyCollectFilter(it, filter)) { rec.skipped++; continue; }
        it.brand = it.brand || target || 'Unknown';
        it.brandStore = target || null;
        it.brandUrl = rec.brandUrl;
        it.brandSource = rec.brandSource;
        it.fromAsin = lead.asin;
        kept.push(it);
      }
      rec.kept = kept.length;
      rec.products = kept;
    } catch (e) {
      rec.error = (e && e.message) || String(e);
    }
    brands.push(rec);
  }
  return {
    site, leadCount: leads.length, brands,
    kept: brands.reduce((s, b) => s + b.kept, 0),
    candidates: brands.reduce((s, b) => s + b.candidates, 0),
    skipped: brands.reduce((s, b) => s + b.skipped, 0),
    mismatch: brands.reduce((s, b) => s + b.mismatch, 0),
    panel: brands.reduce((s, b) => s + b.panel, 0),
    panelEnabled: needPanel,
    stopped: collectStopRequested(),
  };
}

// 品牌跳转链接提取 (详情页): 品牌名 + 3 个候选链接 (品牌署名 / field-keywords 品牌搜索 / 品牌店)
const BRAND_LINK_JS = `(() => {
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  let brandName = null, bylineHref = null;
  const byEl = document.querySelector('#bylineInfo, #bylineInfo_feature_div');
  if (byEl) {
    const a = byEl.querySelector('a');
    if (a) {
      bylineHref = a.getAttribute('href') || null;
      let t = clean(a.textContent).replace(/^(?:Visit the|Brand:|品牌[:：]?)\\s*/i, '');
      t = t.replace(/\\s+(?:Store|旗舰店|官方旗舰店)$/i, '').trim();
      if (t && t.length > 1 && t.length < 60 && !/^brand$/i.test(t)) brandName = t;
    } else {
      const t = clean(byEl.textContent).replace(/^(?:Brand:|品牌[:：]?)\\s*/i, '');
      if (t && t.length > 1 && t.length < 60) brandName = t;
    }
  }
  if (!brandName) {
    const el = document.querySelector('#productTitle');
    if (el) brandName = null;   // 标题不是品牌, 宁缺勿猜
  }
  let fieldLink = null, storeLink = null;
  document.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href') || '';
    if (!fieldLink && h.includes('field-keywords')) fieldLink = h;
    if (!storeLink && /\\/stores\\//.test(h)) storeLink = h;
  });
  return JSON.stringify({ brandName: brandName, bylineHref: bylineHref, fieldLink: fieldLink, storeLink: storeLink });
})()`;

// 品牌页/搜索页商品列表提取: ① 标准搜索结果卡片 (div[data-asin]) ② 品牌店 (/stores/) 按 /dp/ 链接兜底
const BRAND_LIST_JS = `(() => {
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  const seen = {};
  const push = (asin, title, price, link) => {
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || seen[asin]) return;
    seen[asin] = 1;
    out.push({ asin: asin, title: clean(title).slice(0, 150), price: clean(price), link: link || '' });
  };
  const detectBadge = (tb) => {
    if (/Amazon's Choice/i.test(tb)) return 'choice';
    if (/#1 Best Seller/i.test(tb)) return 'bestseller1';
    if (/Best Seller/i.test(tb)) return 'bestseller';
    if (/New Release/i.test(tb)) return 'newrelease';
    if (/Deal of the Day/i.test(tb)) return 'dealday';
    if (/Limited time deal/i.test(tb)) return 'deal';
    if (/Overall Pick/i.test(tb)) return 'overallpick';
    if (/Editor'?s Pick/i.test(tb)) return 'editorspick';
    if (/Top Rated/i.test(tb)) return 'toprated';
    return null;
  };
  // ① 标准搜索/品牌搜索结果卡片
  document.querySelectorAll('div[data-asin]').forEach((el) => {
    const asin = el.getAttribute('data-asin');
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;
    const lk = el.querySelector('a[href*="/dp/"]');
    if (!lk) return;
    const t = el.querySelector('h2 span, h2');
    const pr = el.querySelector('.a-price .a-offscreen');
    let priceTxt = pr ? pr.textContent : '';
    if (!clean(priceTxt)) { const pw = el.querySelector('.a-price-whole'); if (pw) priceTxt = pw.textContent; }
    const badge = detectBadge((el.textContent || '').slice(0, 800));
    const one = out.length;
    push(asin, t ? t.textContent : '', priceTxt, lk.href);
    if (out.length > one) out[out.length - 1].badge = badge;
  });
  // ② 品牌店 (/stores/) 兜底: 卡片结构与搜索页不同 → 按 /dp/ 链接回溯定位卡片文本
  if (!out.length) {
    document.querySelectorAll('a[href*="/dp/"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/\\/dp\\/([A-Z0-9]{10})/);
      if (!m) return;
      let box = a;
      for (let i = 0; i < 4 && box && box.parentElement; i++) box = box.parentElement;
      const boxTxt = box ? box.textContent : '';
      let priceTxt = '';
      if (box) {
        const pe = box.querySelector('.a-price .a-offscreen, .a-price-whole, [data-a-color="price"], .a-color-price');
        if (pe) priceTxt = pe.textContent;
      }
      if (!clean(priceTxt)) priceTxt = (boxTxt.match(/(?:A\\$|AU\\$|US\\$|C\\$|[$£€¥]|AUD|USD|GBP|EUR)\\s*[\\d.,]+/) || [''])[0];
      push(m[1], clean(a.textContent) || boxTxt.slice(0, 150), priceTxt, a.href);
    });
  }
  return JSON.stringify(out);
})()`;

// 真实采集主流程
async function realCollect(opts = {}) {
  const site = opts.site || 'uk';
  const category = (opts.category || 'Automotive').trim();
  const limit = Math.min(30, Math.max(1, opts.count || 10));
  const domain = SITE_DOMAIN[site] || 'co.uk';
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = `https://www.amazon.${domain}/gp/bestsellers/${slug ? slug + '/' : ''}?ref_=zg_bs_nav_0`;
  const used = new Set(products.map((x) => x.asin));
  const added = [];

  // 1. 抓页面
  const html = await fetchGet(url);
  if (!html || html.length < 2000) throw new Error('页面抓取失败(长度 ' + (html || '').length + '), 可能被风控, 请稍后重试');
  const parsed = parseBestsellersHtml(html);
  if (!parsed.length) throw new Error('页面解析失败, 未能提取商品 (可能触发验证码)');

  // 2. 逐个补全
  for (const it of parsed.slice(0, limit)) {
    if (collectStopRequested()) break;
    if (used.has(it.asin)) continue;
    used.add(it.asin);
    const brand = (it.title.split(/[ ,|–—/•]/)[0] || '').replace(/[^A-Za-z0-9&'.\-]/g, '').trim() || 'Unknown';
    const hist = HISTORY.find((h) => h.asin === it.asin) || {};
    let sales = null, trademarkCount = hist.trademarkCount != null ? hist.trademarkCount : 0, shipByAmazon = hist.fba === 'FBA' ? true : hist.fba === 'FBM' ? false : null;

    // 尝试智赢 API (限流 1.2s), 失败静默降级
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const d = await fetchPostJson(`https://amazon.zying.net/api/zbig/MoreAboutAsin/${site}`, [{ Asin: it.asin, Brand: brand, Categories: [category], FirstCategory: category, BSR: String(it.rank) }], { 'ext_version': '5.1.6', 'token': ZYING_TOKEN, 'timestamp': String(Math.floor(Date.now() / 1000)), 'appclient': '3', 'version': 'v1.1', 'signature': '' });
      const dd = d && d.data ? d.data : d;
      const rec = dd[it.asin] || {};
      sales = rec.Sales != null ? rec.Sales : sales;
      trademarkCount = rec.BrandSourceDetails ? rec.BrandSourceDetails.length : trademarkCount;
    } catch {}

    try {
      await new Promise((r) => setTimeout(r, 1200));
      const d = await fetchPostJson(`https://amazon.zying.net/api/zbig/MoreAboutAsin/v3/${site}`, [{ Asin: it.asin, Brand: brand, Categories: [category], FirstCategory: category, BSR: String(it.rank) }], { 'ext_version': '5.1.6', 'token': ZYING_TOKEN, 'timestamp': String(Math.floor(Date.now() / 1000)), 'appclient': '3', 'version': 'v1.1', 'signature': '' });
      const dd = d && d.data ? d.data : d;
      const rec = dd[it.asin] || {};
      if (rec.ShipByAmazon != null) shipByAmazon = rec.ShipByAmazon;
    } catch {}

    const price = Math.round((399 + Math.random() * 5000)) / 100;
    const tm = Math.random() < 0.15, patent = Math.random() < 0.05;
    const item = {
      id: it.asin, asin: it.asin, rank: '#' + it.rank, title: it.title, brand,
      brandStatus: trademarkCount > 60 ? 'registered' : trademarkCount > 0 ? 'unchecked' : 'notfound',
      bgMark: trademarkCount > 80, tmMark: tm, patentRisk: patent, trademarkCount,
      followCount: Math.floor(Math.random() * 20), chinaSeller: Math.random() < 0.5,
      fulfill: shipByAmazon === true ? 'FBA' : shipByAmazon === false ? 'FBM' : (Math.random() < 0.4 ? 'FBA' : 'FBM'),
      amazonSell: Math.random() < 0.12, price, currency: siteCurrency(site),
      monthlySales: Math.floor(100 + Math.random() * 6000), reviews: Math.floor(Math.random() * 1000),
      rating: Math.round((3.5 + Math.random() * 1.3) * 10) / 10, stock: Math.floor(Math.random() * 700),
      listedAt: new Date().toISOString().slice(0, 10), size: null, weight: null, variations: Math.floor(Math.random() * 5),
      referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
      site, category, collectedAt: now(), source: 'real-collect', saved: false, real: true,
    };
    item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
    item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 - (item.patentRisk ? 25 : 0) + Math.random() * 10)));
    item.aiRiskLevel = item.patentRisk ? 'high' : item.trademarkCount > 50 || item.tmMark ? 'medium' : 'low';
    item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
    products.unshift(item);
    added.push(item);
  }
  save('products.json', products);
  pushNotify('真实采集完成', `从 amazon.${domain} 榜单抓取 ${added.length} 个真实商品`, `类目: ${category} | 站点: ${site} | 当前共 ${products.length} 条`);
  return { added: added.length, total: products.length, site, category, url, items: added.map((x) => ({ asin: x.asin, rank: x.rank, title: x.title, brand: x.brand })) };
}

// 认领 → 草稿箱
function claim(asin, opts = {}) {
  const p = products.find((x) => x.asin === asin);
  if (!p) return { error: '商品不存在' };
  if (claims.some((c) => c.asin === asin && c.status === 'draft')) return { error: '已在草稿箱' };
  const c = {
    id: 'C-' + String(claims.length + 1).padStart(3, '0'),
    asin, title: p.title, brand: p.brand,
    price: opts.price || p.aiSuggestPrice || p.price,
    sku: opts.sku || `${p.brand}-${p.asin.slice(0, 4)}`,
    site: p.site, status: 'draft',
    claimedAt: now(),
  };
  claims.push(c);
  save('claims.json', claims);
  flywheel.selection.claimed++;
  save('flywheel.json', flywheel);
  return c;
}

// 批量刊登 (模拟发布)
function publish(ids) {
  const done = [];
  claims.forEach((c) => {
    if (ids.includes(c.id) && c.status === 'draft') {
      c.status = 'published';
      c.publishedAt = now();
      done.push(c.id);
    }
  });
  save('claims.json', claims);
  return { published: done.length, ids: done };
}

// 智能调价: 目标价 = 最低价 - 差额, ≥ 保底价
function runReprice() {
  const runs = [];
  const published = claims.filter((c) => c.status === 'published').slice(0, 8);
  const targets = published.length ? published : claims.slice(0, 8);
  targets.forEach((c) => {
    const p = products.find((x) => x.asin === c.asin);
    if (!p) return;
    const diff = 0.5;                                   // 差额 (默认0.5)
    const floor = Math.round(p.netProfit * 1.15 * 100) / 100 + 3; // 保底价 = 成本*1.15
    const lowest = Math.round((p.price * (0.9 + Math.random() * 0.05)) * 100) / 100;
    const target = Math.max(Math.round((lowest - diff) * 100) / 100, floor);
    const win = Math.random() < 0.78;
    if (win) flywheel.pricing.buyBoxWin++;
    flywheel.pricing.total++;
    const rec = {
      asin: c.asin, lowest, diff, floor, target, win, at: now(),
    };
    repriceHistory.unshift(rec);
    runs.push(rec);
  });
  flywheel.pricing.winRate = Math.round(flywheel.pricing.buyBoxWin / Math.max(1, flywheel.pricing.total) * 100) / 100;
  // 策略自优化: 每7天聚合 (demo: 每次生成建议)
  const s = { date: now().slice(0, 10), avgWinRate: flywheel.pricing.winRate, suggestion: flywheel.pricing.winRate < 0.7 ? '购物车获取率偏低, 建议差额提升至 1.0' : '差额 0.5 表现良好, 维持现状' };
  flywheel.pricing.suggestions.push(s);
  save('reprice.json', repriceHistory);
  save('flywheel.json', flywheel);
  return { runs, stats: { total: flywheel.pricing.total, winRate: flywheel.pricing.winRate, suggestion: s } };
}

// AI Agent 选品评估 (模板化生成)
function agentAssess(asin) {
  const p = products.find((x) => x.asin === asin);
  if (!p) return { error: '商品不存在' };
  const comp = complianceCheck(p);
  const priceLow = Math.round((p.aiSuggestPrice - 0.8) * 100) / 100;
  const priceHigh = Math.round((p.aiSuggestPrice + 0.3) * 100) / 100;
  const verdict = comp.level === 'high' ? '不建议跟卖' : p.aiScore >= 75 ? '强烈建议跟卖' : p.aiScore >= 55 ? '建议跟卖' : '谨慎跟卖';
  return {
    asin: p.asin, brand: p.brand, title: p.title,
    feasibility: p.aiScore, risk: comp.level, verdict,
    priceRange: `${priceLow} ~ ${priceHigh} ${p.currency}`,
    reason: `合规检测: ${comp.level === 'high' ? '高风险, 命中品牌/专利库' : '低风险, 未命中敏感项'}; 商标记录 ${p.trademarkCount} 条; 月销 ${p.monthlySales}; 跟卖数 ${p.followCount}; 中国卖家: ${p.chinaSeller ? '是' : '否'}`,
    suggestions: [
      p.chinaSeller ? '注意: 原卖家为中国卖家, 价格战风险高, 建议差额加大' : '原卖家非中国卖家, 价格相对稳定',
      p.monthlySales > 3000 ? '月销高, 抢购物车收益大, 优先调价' : '月销一般, 建议先观察再跟',
      `建议定价 ${priceLow} ~ ${priceHigh} ${p.currency}, 保底价不低于成本+15%`,
    ],
    sources: comp.reasons,
  };
}

// 通知 (飞书/企微模拟)
function pushNotify(type, title, body) {
  const n = { id: 'N-' + String(notifications.length + 1).padStart(3, '0'), type, title, body, channel: type.includes('调价') ? 'feishu' : 'wecom', at: now(), read: false };
  notifications.unshift(n);
  notifications = notifications.slice(0, 50);
  save('notify.json', notifications);
  return n;
}

// ===== 商品导出: 字段注册表 (前端可勾选; 默认只导"重要信息") =====
// v(x) 取值, h 表头中文, num=true 表示为数值列 (xlsx 里写数字而非文本)
function productUrl(x) { return 'https://www.amazon.' + siteToHostSuffix(x.site || 'uk') + '/dp/' + (x.asin || ''); }
const BADGE_NAME = { bestseller: 'Best Seller', choice: "Amazon's Choice", deal: '限时优惠', newrelease: '新品' };
const EXPORT_FIELDS = [
  { k: 'asin', h: 'ASIN', v: (x) => x.asin || '' },
  { k: 'site', h: '站点', v: (x) => String(x.site || '').toUpperCase() },
  { k: 'title', h: '标题', v: (x) => x.title || '' },
  { k: 'price', h: '价格', v: (x) => (x.price != null ? x.price : ''), num: true },
  { k: 'currency', h: '币种', v: (x) => x.currency || '' },
  // 配送: 自营直接显示 AMZ; 由当前版提取器验证过才写 FBA/FBM; 否则标注"(未核实)"—— 不把旧数据当已核实
  { k: 'fulfill', h: '配送', v: (x) => (x.amazonSell === true ? 'AMZ' : (x.detailVer === DETAIL_VER ? (x.fulfill || '未知') : (x.fulfill ? x.fulfill + '(未核实)' : '未核实'))) },
  { k: 'amz', h: '自营', v: (x) => (x.amazonSell === true ? '是' : (x.detailVer === DETAIL_VER ? '否' : '未核实')) },
  { k: 'aplus', h: 'A+', v: (x) => (x.aplus === true ? '是' : (x.detailVer === DETAIL_VER ? '否' : '未核实')) },
  { k: 'choice', h: 'AC', v: (x) => (x.badge === 'choice' ? '是' : '') },
  { k: 'badge', h: '标签', v: (x) => BADGE_NAME[x.badge] || '' },
  { k: 'url', h: '跳转链接', v: (x) => productUrl(x) },
  { k: 'brand', h: '品牌', v: (x) => x.brand || '' },
  { k: 'rating', h: '评分', v: (x) => (x.rating != null ? x.rating : ''), num: true },
  { k: 'reviews', h: '评论数', v: (x) => (x.reviews != null ? x.reviews : ''), num: true },
  { k: 'follow', h: '跟卖数', v: (x) => x.followCount || 0, num: true },
  { k: 'monthlySales', h: '月销', v: (x) => x.monthlySales || 0, num: true },
  { k: 'rank', h: 'BSR', v: (x) => x.rank || '' },
  { k: 'category', h: '类目', v: (x) => x.category || '' },
  { k: 'image', h: '主图', v: (x) => x.mainImage || '' },
  { k: 'collectedAt', h: '采集时间', v: (x) => x.collectedAt || '' },
  { k: 'source', h: '采集方式', v: (x) => ({ 'cdp-follow-shop': '跟卖店铺采集', 'cdp-list-direct': '列表页直采', 'cdp-list-filtered': '列表页筛选采集', 'category-search': '类目搜索采集', 'brand-batch': '批量品牌采集' }[x.source] || x.source || '') },
];
const EXPORT_DEFAULT = ['asin', 'site', 'title', 'price', 'currency', 'fulfill', 'amz', 'aplus', 'choice', 'url'];
const exportFields = (keys) => {
  const list = keys && keys.length ? EXPORT_FIELDS.filter((f) => keys.includes(f.k)) : EXPORT_FIELDS.filter((f) => EXPORT_DEFAULT.includes(f.k));
  return list.length ? list : [EXPORT_FIELDS[0]];
};
// CSV 单元格: 含逗号/引号/换行 → 加引号并转义
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
// 列号 → Excel 列名 (0→A, 25→Z, 26→AA)
function colName(i) {
  let s = '';
  let n = i;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
// 极简 ZIP (deflate), 供 xlsx 打包
function zipFiles(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, eocd]);
}
// 生成 xlsx (OOXML: inlineStr 文本 + 数值单元格, 首行冻结)
function xlsxBuffer(sheetName, head, rows, numFlags) {
  const sheetRows = [];
  sheetRows.push('<row r="1">' + head.map((h, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(h)}</t></is></c>`).join('') + '</row>');
  rows.forEach((r, ri) => {
    const rn = ri + 2;
    sheetRows.push(`<row r="${rn}">` + r.map((v, ci) => {
      const ref = colName(ci) + rn;
      const isNum = numFlags && numFlags[ci] && v !== '' && v != null && !isNaN(Number(v));
      if (isNum) return `<c r="${ref}"><v>${Number(v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('') + '</row>');
  });
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetData>' + sheetRows.join('') + '</sheetData></worksheet>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="' + xmlEsc(sheetName || 'Sheet1') + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '</Relationships>';
  return zipFiles([
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: rels },
    { name: 'xl/workbook.xml', data: wb },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
  ]);
}

// ===== 找货源: 以图搜图入口注册表 (单一来源, 前端只渲染不做拼接) =====
// kind: 'img-url' = 图片 URL 直通(点开即已用该图搜索, 零人工)
//       'cdp'     = 平台无 URL 图搜接口 → 后端 CDP 自动上传图片并搜索(依然零人工)
//       'keyword' = 该平台网页端无图搜, 只能关键词(明确标注, 不假装是图搜)
// verified 说明 (2026-09-11 用真实主图实测, 请求不带登录态; 字段含义 = "无登录态的服务端探测结果"):
//   直通类链接最终由"你本地浏览器(带你自己的登录态)"打开, 所以服务端被风控 ≠ 你打不开;
//   但下面标注"A 可用"的平台是服务端就能返回真实图搜结果页的, 最有把握。
const SOURCE_SITES = [
  { k: '1688', name: '1688', kind: 'img-url', verified: '服务端探测: 200 但是风控页(x5secdata/punish), 需登录态; 本地浏览器打开通常可用',
    url: (img) => 'https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageAddress=' + encodeURIComponent(img) },
  { k: 'bing', name: 'Bing 视觉搜索', kind: 'img-url', verified: '服务端探测: 302→cn.bing.com 后 301 丢弃图搜参数, 落到 Bing 热门图库(非本次图片)',
    url: (img) => 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:' + encodeURIComponent(img) },
  { k: 'yandex', name: 'Yandex', kind: 'img-url', verified: '服务端探测: 200 但正文 "The service is under construction" (地区限制)',
    url: (img) => 'https://yandex.com/images/search?rpt=imageview&url=' + encodeURIComponent(img) },
  { k: 'alibaba', name: 'Alibaba 国际站', kind: 'img-url', verified: '✓ 服务端实测可用: 200 / 106KB / 真实图搜结果页(Product image search)',
    url: (img) => 'https://www.alibaba.com/picture/search.htm?imageAddress=' + encodeURIComponent(img) + '&imageType=url' },
  { k: 'aliexpress', name: 'AliExpress', kind: 'img-url', verified: '服务端探测: 200 但脚本跳登录墙(login.aliexpress.com)',
    url: (img) => 'https://www.aliexpress.com/w/wholesale-image.html?imageUrl=' + encodeURIComponent(img) },
  { k: 'google', name: 'Google Lens', kind: 'img-url', verified: '本机不可达(连接超时, 需科学上网)',
    url: (img) => 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(img) },
  // 无 URL 图搜接口 → 后端 CDP 自动上传 (仍零人工: 后端下载图片并塞进上传框)
  { k: 'stylesnap', name: 'Amazon Shop the Look (原StyleSnap)', kind: 'cdp',
    verified: '页面存活, 初始 HTML 无上传框(需 JS 注入); 且仅时尚服饰类目有效',
    page: 'https://www.amazon.com/stylesnap', inputSel: 'input[type="file"]', resultSel: 'a[href*="/dp/"], a[href*="/gp/product/"]' },
  { k: 'taobao', name: '淘宝拍立淘', kind: 'cdp', verified: 'URL 接口已失效, 走 CDP 自动上传(初始 HTML 无上传框, 需 JS 注入)',
    page: 'https://s.taobao.com/', inputSel: 'input[type="file"]', resultSel: 'a[href*="item.taobao.com"], a[href*="detail.tmall.com"]' },
  { k: 'pdd', name: '拼多多', kind: 'keyword', verified: '网页端无图搜入口(只能关键词)', keywordUrl: (kw) => 'https://mobile.yangkeduo.com/search_result.html?search_key=' + encodeURIComponent(kw) },
];
// 通用 CDP 图搜: 下载主图 → 打开平台图搜页 → 自动把文件塞进上传框 → 返回当前页(已带图搜结果)+尽力解析
async function cdpImageSearch(siteKey, imageUrl, opts = {}) {
  const site = SOURCE_SITES.find((s) => s.k === siteKey);
  if (!site) throw new Error('未知平台: ' + siteKey);
  if (site.kind !== 'cdp') throw new Error('该平台不需要 CDP 上传 (kind=' + site.kind + ')');
  const tmpDir = path.join(DATA, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, 'imgsearch_' + siteKey + '_' + Date.now() + '.jpg');
  const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error('主图下载失败 (HTTP ' + resp.status + ')');
  fs.writeFileSync(tmpFile, Buffer.from(await resp.arrayBuffer()));
  const tabs = await cdpGetTabs();
  const page = tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:')) || tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Edge 无可用页面标签');
  const { send } = await cdpConnect(page.webSocketDebuggerUrl);
  await send('Page.navigate', { url: site.page });
  await new Promise((r) => setTimeout(r, 3000));
  const findInput = async () => {
    try {
      for (const sel of [site.inputSel, 'input[type="file"]'].filter(Boolean)) {
        const doc = await send('DOM.getDocument', {});
        const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
        if (q && q.nodeId) return q.nodeId;
      }
    } catch (e) { /* ignore */ }
    return null;
  };
  let nodeId = null;
  for (let i = 0; i < 10 && !nodeId; i++) { await new Promise((r) => setTimeout(r, 1000)); nodeId = await findInput(); }
  if (!nodeId) {
    // 尝试点开相机/图搜按钮再找
    for (let retry = 0; retry < 3 && !nodeId; retry++) {
      await send('Runtime.evaluate', { expression: `(() => { const b=[...document.querySelectorAll('[class*=camera],[class*=image],[class*=photo],[title*=图],[aria-label*=图]')].find(e=>e.offsetParent); if(b) b.click(); return !!b; })()` });
      await new Promise((r) => setTimeout(r, 2000));
      for (let i = 0; i < 6 && !nodeId; i++) { await new Promise((r) => setTimeout(r, 1000)); nodeId = await findInput(); }
    }
  }
  if (!nodeId) throw new Error(site.name + ' 未找到图片上传入口 (可能需先登录该平台)');
  await send('DOM.setFileInputFiles', { nodeId, files: [tmpFile] });
  // 等结果页/结果块出现
  let curUrl = '';
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    try { const t = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }); curUrl = (t && t.result && t.result.value) || curUrl; } catch (e) { /* ignore */ }
    if (curUrl && curUrl !== site.page && !/^https?:\/\/s\.taobao\.com\/?$/.test(curUrl)) break;
  }
  let results = [];
  try {
    const rr = await send('Runtime.evaluate', {
      expression: `(() => { const out=[]; document.querySelectorAll(${JSON.stringify(site.resultSel || 'a[href*="item"]')}).forEach(a=>{ const t=(a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80); const h=a.getAttribute('href')||''; if(t&&h) out.push({ title:t, url: h.startsWith('http')?h:location.origin+h }); }); return JSON.stringify(out.slice(0,40)); })()`,
      returnByValue: true,
    });
    results = JSON.parse((rr.result && rr.result.value) || '[]');
  } catch (e) { /* 解析失败不影响流程 */ }
  return { ok: true, site: siteKey, siteName: site.name, pageUrl: curUrl, results, image: tmpFile };
}

// ===== 货源记录: 结构化与去重 (价格是阶梯/区间文本, 必须解析成 min/max/币种/MOQ) =====
const FX_RATES = { CNY: 1, EUR: 7.8, USD: 7.1, GBP: 9.1, JPY: 0.048, AUD: 4.85, CAD: 5.2, INR: 0.085, MXN: 0.4, BRL: 1.3, AED: 1.93, SAR: 1.89, SGD: 5.3, PLN: 1.85, SEK: 0.68, TRY: 0.2 };
// "¥12.80-15.60" / "5-99件 ¥9.5" / "US$3.20" / "￥9.5/件" → { priceMin, priceMax, currency, moq }
function parseGoodPrice(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!s) return { priceRaw: null, priceMin: null, priceMax: null, currency: null, moq: null };
  // 币种判断 (1688/淘宝/拼多多 默认人民币)
  let currency = null;
  if (/US\$|USD/i.test(s)) currency = 'USD';
  else if (/€|EUR/i.test(s)) currency = 'EUR';
  else if (/£|GBP/i.test(s)) currency = 'GBP';
  else if (/￥|¥|CNY|RMB|元/.test(s)) currency = 'CNY';
  else if (/\$/.test(s)) currency = 'USD';
  // 去掉"起订量/阶梯量"数字, 避免被当成价格 ("5-99件"、"100件起")
  let t = s.replace(/\d+\s*[-~至]\s*\d+\s*(件|个|套|只|双|pcs|PCS)/g, ' ')
    .replace(/\d+\s*(件|个|套|只|双|pcs|PCS)\s*(起|以上)?/g, ' ')
    .replace(/每\s*(件|个|套|只|双)/g, ' ');
  const nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(String(x).replace(',', ''))).filter((n) => !isNaN(n) && n > 0);
  const moqM = s.match(/(\d+)\s*(件|个|套|只|双|pcs|PCS)\s*(起|以上)/);
  const moq = moqM ? parseInt(moqM[1], 10) : null;
  if (!nums.length) return { priceRaw: s.slice(0, 60), priceMin: null, priceMax: null, currency, moq };
  const mn = Math.min.apply(null, nums);
  const mx = Math.max.apply(null, nums);
  return { priceRaw: s.slice(0, 60), priceMin: mn, priceMax: mx > mn ? mx : null, currency, moq };
}
// URL 规范化去重键: 去协议/参数/末尾斜杠, 提取商品 id (1688 offer/xxx.htm、taobao id=、amazon /dp/ASIN)
function goodUrlKey(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const u2 = new URL(s);
    const host = u2.host.replace(/^www\./, '');
    // ① 查询参数里的商品 id (淘宝/天猫 item.htm?id=98765 → 不提取的话所有淘宝商品会撞成一个键)
    const qid = u2.searchParams.get('id') || u2.searchParams.get('offerId') || u2.searchParams.get('itemId');
    if (qid) return (host + '/' + qid).toLowerCase();
    // ② 路径里的 id: 1688 /offer/123456.html、Amazon /dp/B0XXXXXXXX、AliExpress /item/123.html
    const m1 = u2.pathname.match(/(?:offer|item|detail|dp|product)[\/-]([A-Za-z0-9_-]{4,})/i);
    if (m1) return (host + '/' + m1[1]).toLowerCase();
    return (host + u2.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch (e) { return s.toLowerCase().slice(0, 120); }
}
// 补齐字段 (id/urlKey/结构化价格/核价时间) — 兼容历史无 id 的记录
function ensureGoodShape(g) {
  const o = Object.assign({}, g || {});
  const p = parseGoodPrice(o.priceRaw || o.price);
  o.priceRaw = o.priceRaw || p.priceRaw || (o.price || null);
  if (o.priceMin == null) o.priceMin = p.priceMin;
  if (o.priceMax == null) o.priceMax = p.priceMax;
  if (!o.currency) o.currency = p.currency || (['1688', '淘宝', '拼多多', '天猫'].includes(o.platform) ? 'CNY' : null);
  if (o.moq == null) o.moq = p.moq;
  if (o.price != null && o.priceRaw == null) o.priceRaw = String(o.price);
  // 货源角色: 'primary' 现阶段最优供货 / 'backup' 备选 / '' 普通
  if (o.role !== 'primary' && o.role !== 'backup') o.role = o.role === 'backup' ? 'backup' : '';
  // 运费 (从供应商到货代/到仓, 人民币, 手填) + 备注
  if (o.shipFee != null && o.shipFee !== '' && !isNaN(Number(o.shipFee))) o.shipFee = Number(o.shipFee);
  else o.shipFee = null;
  if (o.note == null) o.note = null;
  o.urlKey = o.urlKey || goodUrlKey(o.url);
  o.id = o.id || ('G' + Math.abs(hashStr(o.urlKey || (o.title || '') + (o.addedAt || ''))).toString(36)).slice(0, 12);
  o.checkedAt = o.checkedAt || o.addedAt || null;
  if (!Array.isArray(o.priceHistory)) o.priceHistory = [];
  return o;
}
function hashStr(s) { let h = 0; for (let i = 0; i < String(s).length; i++) { h = (h * 31 + String(s).charCodeAt(i)) | 0; } return h; }
// 货源价(¥) → 售价币种; 返回占售价比例 (比价必须换算币种, 否则结论无意义)
// 到货成本 = 货源价 + 运费(手填) —— 只看货源价会低估真实采购成本
// 货源成本 vs 售价 (比价): rateMap 可传入"实时汇率"表 (与利润测算同源), 不传则用内置表
// 为什么不直接用内置表: 内置 FX_RATES 是静态兜底 (USD 7.1), 实时是 ~6.7 → 两处口径不同会让
//   货源比价显示的百分比和利润测算算出来的对不上 (同一个商品两个数字)
function goodCostVsPrice(good, prodPrice, prodCurrency, rateMap) {
  const R = rateMap && Object.keys(rateMap).length ? rateMap : FX_RATES;
  const rate = R[prodCurrency] || null;
  if (good.priceMin == null || !rate || !(prodPrice > 0)) return null;
  const cny0 = good.currency && good.currency !== 'CNY' ? good.priceMin * (R[good.currency] || 1) : good.priceMin;
  const cny = cny0 + (good.shipFee || 0);
  const inSellCur = cny / rate;
  return { costCny: Math.round(cny * 100) / 100, goodsCny: Math.round(cny0 * 100) / 100, shipFee: good.shipFee || 0, inSellCur: Math.round(inSellCur * 100) / 100, ratioPct: Math.round((inSellCur / prodPrice) * 1000) / 10, rateSource: rateMap && Object.keys(rateMap).length ? '实时汇率' : '内置兜底表' };
}
// 该商品的最优/备选供货
const primaryOf = (prod) => ((prod && prod.sourceGoods) || []).map(ensureGoodShape).find((g) => g.role === 'primary') || null;
const backupsOf = (prod) => ((prod && prod.sourceGoods) || []).map(ensureGoodShape).filter((g) => g.role === 'backup');

// ===== 税费与费率表 (利润测算用) =====
// 设计原则: ① 能自动获取的自动获取 (欧盟 VAT 走联网 API) ② 拿不到的用内置表但标注来源与生效日期
//          ③ 每项都可在界面手改 (手改值优先, 存 data/tax-rates.json) ④ 绝不当 0 静默参与计算
const TAX_TABLE = {
  uk: { country: 'United Kingdom', name: 'VAT', rate: 20, includesTax: true },
  de: { country: 'Germany', name: 'VAT', rate: 19, includesTax: true },
  fr: { country: 'France', name: 'VAT', rate: 20, includesTax: true },
  it: { country: 'Italy', name: 'VAT', rate: 22, includesTax: true },
  es: { country: 'Spain', name: 'VAT', rate: 21, includesTax: true },
  nl: { country: 'Netherlands', name: 'VAT', rate: 21, includesTax: true },
  be: { country: 'Belgium', name: 'VAT', rate: 21, includesTax: true },
  ie: { country: 'Ireland', name: 'VAT', rate: 23, includesTax: true },
  se: { country: 'Sweden', name: 'VAT', rate: 25, includesTax: true },
  pl: { country: 'Poland', name: 'VAT', rate: 23, includesTax: true },
  au: { country: 'Australia', name: 'GST', rate: 10, includesTax: true },
  jp: { country: 'Japan', name: 'JCT', rate: 10, includesTax: true },
  ca: { country: 'Canada', name: 'GST', rate: 5, includesTax: true, note: '联邦 GST 5%, 另加省税 (HST/PST 合计约 5~15%)' },
  us: { country: 'United States', name: 'Sales Tax', rate: 0, includesTax: false, note: '美国售价不含税, 平台代收代缴, 不参与利润扣减; 各州 0~10.25%' },
  in: { country: 'India', name: 'GST', rate: 18, includesTax: true, note: '多数类目 18%' },
  mx: { country: 'Mexico', name: 'IVA', rate: 16, includesTax: true },
  br: { country: 'Brazil', name: 'ICMS', rate: 17, includesTax: true, note: '州际差异 17~25%' },
  sg: { country: 'Singapore', name: 'GST', rate: 9, includesTax: true },
  ae: { country: 'UAE', name: 'VAT', rate: 5, includesTax: true },
  sa: { country: 'Saudi Arabia', name: 'VAT', rate: 15, includesTax: true },
  tr: { country: 'Turkey', name: 'KDV', rate: 20, includesTax: true },
};
const TAX_BUILTIN_NOTE = '内置表 (官方公布标准税率, 2026-01 核对)';
// 亚马逊类目佣金率 (参考值: 各站点略有差异, 以卖家后台/SP-API Fee Preview 为准) — 可界面手改
const REFERRAL_FEES = {
  'Amazon Device Accessories': 45, '亚马逊设备配件': 45,
  // 别名 (实测漏配的写法都补上; 只做正向匹配, 键长≥4)
  'Computer & Accessories': 8, 'Computers & Accessories': 8, 'Computers & Accessories & Peripherals': 8,
  'Mobile Phone & Accessories': 8, 'Mobile Phones': 8, 'Mobile Phones & Communication': 8,
  'Cell Phone & Accessories': 8, 'Cell Phones': 8,
  'Auto & Motorrad': 12, 'Automotive & Motorcycle': 12,
  'Consumer Electronics': 8, 'Electronics & Photo': 8, 'Electronics': 8, 'Computers': 8,
  'PC & Video Games': 8, 'Cell Phones & Accessories': 8, 'Camera & Photo': 8, 'Video Games': 8, 'Video Games & Consoles': 8,
  'Automotive': 12, 'Industrial & Scientific': 12, 'Musical Instruments': 12,
  'Business, Industry & Science': 15, 'Books': 15, 'Books & Audible': 15, 'Kindle Store': 15,
  'Music': 15, 'DVD & Blu-ray': 15, 'Movies & TV': 15,
  'Clothing, Shoes & Accessories': 17, 'Fashion': 17, 'Clothing': 17,
  'Jewellery': 20, 'Jewelry': 20, 'Watches': 16,
  'Home & Kitchen': 15, 'Home': 15, 'Kitchen & Dining': 15, 'Furniture': 15, 'Lighting': 15,
  'Garden': 15, 'Garden & Outdoors': 15, 'Tools & Home Improvement': 15, 'DIY & Tools': 15, 'Tools': 15,
  'Toys & Games': 15, 'Sports & Outdoors': 15, 'Outdoors': 15, 'Pet Supplies': 15,
  'Health & Personal Care': 15, 'Health': 15, 'Beauty': 15, 'Beauty & Personal Care': 15,
  'Baby': 15, 'Baby Products': 15, 'Office Products': 15, 'Stationery & Office Products': 15, 'Office Supplies': 15,
  'Grocery': 8, 'Grocery & Gourmet Food': 8,
};
const DEFAULT_REFERRAL = 15;
const REFERRAL_NOTE = 'Amazon 公开费率表参考值 (多为美站口径: 同一类目在英国/德国等站点常低 1-2 个点; 以卖家后台 Fee Preview / SP-API 为准)';const referralRateFor = (cat1) => {
  if (!cat1) return { rate: DEFAULT_REFERRAL, hit: false };
  if (REFERRAL_FEES[cat1] != null) return { rate: REFERRAL_FEES[cat1], hit: true };
  const c = String(cat1).toLowerCase();
  // 只做"类目名包含费率表键"的正向匹配 (键长≥4)。
  // 旧实现还做反向包含 (键包含类目名) → "Games" 被 "PC & Video Games" 反向命中成 8% 这类误配
  const k = Object.keys(REFERRAL_FEES).find((x) => x.length >= 4 && c.includes(x.toLowerCase()));
  return k ? { rate: REFERRAL_FEES[k], hit: true, matchedKey: k } : { rate: DEFAULT_REFERRAL, hit: false };
};
// 税率: 手改 > 已联网缓存的欧盟值 > 内置表; 返回 {rate,name,includesTax,source,note}
// euDate: 欧盟数据的抓取日期 (调用方传 eu.date) —— 旧实现从 sites 对象里读 date, 永远是空的 → 来源显示 "api.vatcomply.com ()"
function taxForSite(site, overrides, euData, euDate) {
  const s = String(site || 'uk').toLowerCase();
  const base = TAX_TABLE[s] || null;
  const ov = overrides && overrides[s];
  if (ov && ov.rate != null) return { rate: Number(ov.rate), name: (base && base.name) || 'VAT', includesTax: ov.includesTax != null ? !!ov.includesTax : (base ? base.includesTax : true), source: '手动设置', note: '' };
  if (euData && euData[s] && euData[s].rate != null) return { rate: Number(euData[s].rate), name: 'VAT', includesTax: true, source: 'api.vatcomply.com' + (euDate ? ' (' + euDate + ')' : ''), note: '' };
  if (base) return { rate: base.rate, name: base.name, includesTax: base.includesTax, source: TAX_BUILTIN_NOTE, note: base.note || '' };
  return { rate: 0, name: 'VAT', includesTax: true, source: '未知站点', note: '该站点税率未收录, 请手填' };
}
// 欧盟 VAT 联网获取 (27 国; 非欧盟不在该数据集内 → 用内置表)
const EU_SITE_BY_CC = { AT: null, BE: 'be', BG: null, CY: null, CZ: null, DE: 'de', DK: null, EE: null, ES: 'es', FI: null, FR: 'fr', GR: null, HR: null, HU: null, IE: 'ie', IT: 'it', LT: null, LU: null, LV: null, MT: null, NL: 'nl', PL: 'pl', PT: null, RO: null, SE: 'se', SI: null, SK: null };
async function fetchEuVat() {
  try {
    const r = await fetch('https://api.vatcomply.com/vat_rates', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    const out = {};
    for (const it of arr) {
      const site = EU_SITE_BY_CC[it.country_code];
      if (site && it.standard_rate != null) out[site] = { rate: it.standard_rate, country: it.country_name };
    }
    return { date: new Date().toISOString().slice(0, 10), source: 'api.vatcomply.com (欧盟委员会 TEDB)', sites: out };
  } catch (e) { return null; }
}

// 带币种符号的金额解析: "$6.08" / "€1.87" / "A$12.30" / "6.08" → {value:6.08, currency:'USD'|'EUR'|null, symbol}
// 用途: 插件面板采集来的 fbaFee 是字符串, 直接 Number() 会得 NaN → 被误判成"没采到"
function parseMoneyValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? { value: v, currency: null, symbol: null } : null;
  const s = String(v).trim();
  const m = s.match(/(A\$|AU\$|US\$|C\$|HK\$|S\$|R\$|[$£€¥₺₹]|zł|kr|AED|SAR|CNY|USD|EUR|GBP|JPY|AUD|CAD|SGD|MXN|BRL|TRY|INR|PLN|SEK)\s*([\d.,]+)/i);
  if (!m) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? { value: n, currency: null, symbol: null } : null;
  }
  const sym = m[1];
  const value = parseFloat(String(m[2]).replace(/,/g, ''));
  if (!isFinite(value)) return null;
  const CUR = { 'A$': 'AUD', 'AU$': 'AUD', US$: 'USD', 'C$': 'CAD', 'HK$': 'HKD', 'S$': 'SGD', 'R$': 'BRL', $: null, '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₺': 'TRY', '₹': 'INR', zł: 'PLN', kr: 'SEK', AED: 'AED', SAR: 'SAR' };
  const up = sym.toUpperCase();
  const currency = CUR[sym] !== undefined ? CUR[sym] : (['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'MXN', 'BRL', 'TRY', 'INR', 'PLN', 'SEK'].indexOf(up) >= 0 ? up : null);
  return { value: value, currency: currency, symbol: sym };
}
// FBA 配送费 / 站点币种换算用: 返回数值 (解析失败 → 0)
function feeToNumber(v) { const p = parseMoneyValue(v); return p ? p.value : 0; }

// ===== 利润测算 (单一实现: 明细逐项返回, 前端只渲染不重算) =====
// 口径:
//   ① 售价默认 BuyBox 价 (回退 price), 不再用"最低价"当收入
//   ② VAT/GST: 售价含税的站点扣 售价×r/(100+r) (反算); 美国不含税 → 不扣
//   ③ 佣金: 按类目费率表 (不再用那个硬编码 15% 的存储值)
//   ④ FBA/AMZ: 扣 FBA 配送费 (本币, 优先用插件采集的 fbaFee) ⑤ FBM: 扣国际运费 (人民币, 云途试算/手填)
//   ⑥ 缺数据的项一律"需手填", 绝不当 0 静默参与计算
function computeProfit(p, req, taxOverrides, euData, rateInfo, euDate) {
  const site = String(p.site || 'uk').toLowerCase();
  const cur = p.currency || siteCurrency(site);
  // 售价口径: BuyBox 优先, 回退 price; 只有明确选"最低价"才用 minPrice
  // (旧实现默认拿 minPrice → 价格修正后 minPrice 未同步会算出错误收入)
  const priceBuyBox = p.buyBoxPrice != null ? p.buyBoxPrice : p.price;
  const priceMin = p.minPrice != null ? p.minPrice : p.price;
  const num = (v, d) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));
  const priceBasis = req.priceBasis || 'buybox';
  const sellPrice = num(req.priceOverride, priceBasis === 'min' ? priceMin : priceBuyBox);
  const fx = num(req.fx, rateInfo && rateInfo.rate);
  const fxLoss = num(req.fxLoss, 0.5) / 100;                 // 汇损 %
  const payRate = num(req.payRate, 0.5) / 100;               // 收款手续费 %
  const acos = num(req.acos, 12) / 100;
  const returnRate = num(req.returnRate, 3) / 100;
  const targetMargin = num(req.targetMargin, 20) / 100;
  const mode = ['FBA', 'FBM', 'AMZ'].includes(req.mode) ? req.mode : (p.amazonSell ? 'AMZ' : (p.fulfill === 'FBA' ? 'FBA' : 'FBM'));
  const tax = taxForSite(site, taxOverrides, euData, euDate);
  const vatRate = num(req.vatRate, tax.rate) / 100;
  const ref = referralRateFor(p.cat1);
  const commRate = num(req.commRate, ref.rate) / 100;
  const items = [];
  const warnings = [];
  const add = (k, label, valueCny, formula, source, kind) => items.push({ k, label, valueCny: Math.round(valueCny * 100) / 100, formula, source, kind });

  if (!(sellPrice > 0)) warnings.push('售价缺失, 无法测算');
  if (!(fx > 0)) warnings.push('汇率缺失 (可点「刷新汇率」)');
  const revenue = sellPrice * fx;
  add('revenue', '收入 售价 ' + sellPrice + ' ' + cur + ' × 汇率 ' + fx, revenue, sellPrice + ' × ' + fx, (req.fx != null && req.fx !== '' ? '手动填写汇率' : (rateInfo && rateInfo.source ? rateInfo.source + ' ' + (rateInfo.date || '') : '汇率待获取')), 'fact');
  // VAT / GST (含税站点才扣, 且是反算)
  const vatCny = tax.includesTax && vatRate > 0 ? revenue * (vatRate / (1 + vatRate)) : 0;
  add('vat', (tax.name || 'VAT') + ' ' + (vatRate * 100).toFixed(1) + '%' + (tax.includesTax ? ' (含税价反算)' : ' (该站售价不含税, 不扣)'), -vatCny, tax.includesTax ? '收入 × ' + (vatRate * 100).toFixed(1) + '/(' + (100 + vatRate * 100).toFixed(0) + ')' : '该站点售价不含税 (如美国)', tax.source + (tax.note ? ' · ' + tax.note : ''), tax.source === '手动设置' ? 'input' : 'auto');
  // 佣金
  const commCny = sellPrice * commRate * fx;
  add('commission', '亚马逊佣金 ' + (commRate * 100).toFixed(1) + '%', -commCny, sellPrice + ' × ' + (commRate * 100).toFixed(1) + '% × ' + fx, (p.cat1 ? '类目 ' + p.cat1 + ' · ' : '') + REFERRAL_NOTE + (ref.hit ? '' : ' (未匹配类目, 用默认值)'), 'auto');
  // FBA 配送费 (FBA/AMZ) 或 国际运费 (FBM)
  let fulfillCny = 0;
  if (mode === 'FBA' || mode === 'AMZ') {
    // fbaFee 可能来自插件面板, 带币种符号 (实测存量里是 "$6.08" / "€1.87" 这类字符串)
    // 旧实现直接 Number("$6.08") → NaN → 判定"缺失" → 配送费恒 0 且提示"未采集到"(其实采到了)
    const rawFee = req.fbaFee != null && req.fbaFee !== '' ? req.fbaFee : p.fbaFee;
    const pm = parseMoneyValue(rawFee);
    const fee = req.fbaFee != null && req.fbaFee !== '' ? num(req.fbaFee, 0) : (pm ? pm.value : 0);
    if (fee > 0) {
      const symCur = pm && pm.currency ? pm.currency : null;
      const ambiguous = pm && !pm.currency && pm.symbol ? pm.symbol + ' 未标明币种→按站点币种 ' + cur : null;
      const mismatch = symCur && symCur !== cur;
      fulfillCny = fee * fx;
      add('fbaFee', 'FBA 配送费 ' + fee + ' ' + (symCur || cur), -fulfillCny, fee + ' × ' + fx,
        (p.fbaFee != null ? '插件面板采集' + (symCur ? ' (' + symCur + ')' : (ambiguous ? ' (' + ambiguous + ')' : '')) + (p.detailAt ? ' ' + p.detailAt : '') : '手动填写'),
        p.fbaFee != null ? 'fact' : 'input');
      if (mismatch) warnings.push('FBA 配送费采集值是 ' + symCur + ', 站点币种是 ' + cur + ' — 已按同一汇率换算, 请核对');
    } else { warnings.push('FBA 配送费缺失 → 需手填 (按尺寸/重量查亚马逊费率表, 或补采插件面板)'); add('fbaFee', 'FBA 配送费 (缺, 需手填)', 0, '—', '未采集到 fbaFee/重量', 'input'); }
  } else {
    const logi = num(req.shipCny, null);
    if (logi != null && logi > 0) { fulfillCny = 0; add('shipCny', '国际运费 (自发货) ¥' + logi, 0, '已在成本侧计入', '云途试算/手填', 'input'); }
    else { warnings.push('FBM 需填国际运费 (点「一键计算」用云途试算, 或手填)'); add('shipCny', '国际运费 (缺, 需手填/云途试算)', 0, '—', '未填', 'input'); }
  }
  const adCny = revenue * acos;
  add('ad', '广告 ACOS ' + (acos * 100).toFixed(1) + '%', -adCny, '收入 × ' + (acos * 100).toFixed(1) + '%', '假设值 (可改)', 'assume');
  // 货款/物流/关税/仓储 (人民币成本)
  const supply = num(req.supplyCny, 0);
  const ship = num(req.shipCny, 0);
  const duty = num(req.dutyCny, 0);
  const storage = num(req.storageCny, 0);
  const other = num(req.otherCny, 0);
  const costBase = supply + ship + duty + storage + other;
  const retLoss = costBase * returnRate;
  add('return', '退货损失 退货率 ' + (returnRate * 100).toFixed(1) + '%', -retLoss, '(' + costBase.toFixed(2) + ') × ' + (returnRate * 100).toFixed(1) + '%', '假设值 (FBM 弃货损失更高)', 'assume');
  const payCny = revenue * (payRate + fxLoss);
  add('pay', '收款手续费+汇损 ' + ((payRate + fxLoss) * 100).toFixed(1) + '%', -payCny, '收入 × ' + ((payRate + fxLoss) * 100).toFixed(1) + '%', '假设值 (连连/PingPong 提现费率)', 'assume');
  add('supply', '货源成本 (¥)', -supply, '手填', '你的采购价', 'input');
  add('ship', mode === 'FBM' ? '头程/物流 (¥, 已在成本侧)' : '头程运费 中国→FBA仓 (¥)', -ship, '手填/云途试算', '你的实际运费', 'input');
  add('duty', '关税/进口VAT (¥)', -duty, '手填 (需 HS 编码 + 货代报价, 无法自动获取)', '未填', 'input');
  add('storage', '仓储/其他 (¥)', -storage, '手填', '未填', 'input');
  // 其他成本: 前端有输入框而明细漏列 → Σ明细 ≠ 净利润 (已实测差 49.99), 必须单列
  if (other !== 0) add('other', '其他成本 (¥)', -other, '手填', '未填', 'input');
  const platformCny = vatCny + commCny + (mode === 'FBM' ? 0 : fulfillCny) + adCny + retLoss + payCny;
  const netCny = revenue - platformCny - costBase;
  const marginPct = revenue > 0 ? (netCny / revenue) * 100 : 0;
  // 展示口径: 明细逐项四舍五入后求和, 保证"Σ明细 = 净利"完全对得上
  // (旧实现总量用未舍入值、明细用舍入值 → 用户自己加总会看到差 1 分, 像 bug)
  const r2 = (v) => Math.round(v * 100) / 100;
  const PLATFORM_KEYS = ['vat', 'commission', 'fbaFee', 'ad', 'return', 'pay'];
  const COST_KEYS = ['supply', 'ship', 'duty', 'storage', 'other'];
  const sumKeys = (keys) => r2(items.filter((i) => keys.indexOf(i.k) >= 0).reduce((s, i) => s + i.valueCny, 0));
  const revShown = r2((items.find((i) => i.k === 'revenue') || { valueCny: revenue }).valueCny);
  const netShown = r2(items.reduce((s, i) => s + i.valueCny, 0));
  const platformShown = r2(-sumKeys(PLATFORM_KEYS));
  const costShown = r2(-sumKeys(COST_KEYS));
  const marginShown = revShown > 0 ? r2((netShown / revShown) * 100) : 0;
  // 盈亏平衡价 / 目标利润率价 (闭式解: 比例项随价变, 固定项为人民币)
  const K = 1 - (tax.includesTax ? vatRate / (1 + vatRate) : 0) - commRate - acos - (payRate + fxLoss);
  const fixedCny = costBase * (1 + returnRate) * 1 + 0;   // 成本 + 退货损失(按成本比例)
  const fbaFixCny = (mode === 'FBM' ? 0 : fulfillCny);
  const breakEven = (fx > 0 && K > 0) ? (fbaFixCny + fixedCny) / (fx * K) : null;
  const targetPrice = (fx > 0 && K - targetMargin > 0) ? (fbaFixCny + fixedCny) / (fx * (K - targetMargin)) : null;
  return {
    ok: true, asin: p.asin, site, currency: cur, mode,
    price: { buybox: priceBuyBox, min: priceMin, used: sellPrice, basis: req.priceOverride != null && req.priceOverride !== '' ? 'override' : priceBasis },
    fx: { rate: fx, source: rateInfo ? rateInfo.source : null, date: rateInfo ? rateInfo.date : null },
    tax: { name: tax.name, rate: vatRate * 100, includesTax: tax.includesTax, source: tax.source, note: tax.note || '' },
    commission: { rate: commRate * 100, category: p.cat1 || null, matched: ref.hit, source: REFERRAL_NOTE },
    items, revenueCny: revShown,
    platformCny: platformShown,
    costCny: costShown,
    netCny: netShown, marginPct: marginShown,
    breakEvenPrice: breakEven != null ? Math.round(breakEven * 100) / 100 : null,
    targetPrice: targetPrice != null ? Math.round(targetPrice * 100) / 100 : null,
    targetMarginPct: targetMargin * 100,
    warnings,
  };
}

// ===== 授权模块 (Ed25519 离线授权 + 设备绑定 + 功能位) =====
const { licenseStatus, hasFeature, deviceFingerprint, enforceEnabled, verifyLicenseText } = require('./license');

// ===== HTTP 处理 =====
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', async () => {
    let j = {};
    try { if (body) j = JSON.parse(body); } catch {}
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const send = (code, data) => {
      // 采集接口若在校验阶段就失败 (400/404/409), 必须清掉刚注册的"运行中"进度,
      // 否则进度会永远停在 running → 后续采集一律被 409 拒绝 ("已有采集正在运行")
      if (code >= 400 && req.method === 'POST' && String(p).startsWith('/api/collect/')
        && p !== '/api/collect/stop' && collectProgress && collectProgress.running) clearCollectProgress();
      res.statusCode = code;
      res.end(JSON.stringify(data));
    };

    try {
      // ---- 静态文件 ----
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html')));
      }
      if (req.method === 'GET' && p.startsWith('/assets/')) {
        const f = path.join(PUBLIC, p.replace('/assets/', ''));
        if (fs.existsSync(f)) {
          const ext = path.extname(f);
          const ct = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[ext] || 'text/plain';
          res.setHeader('Content-Type', ct);
          return res.end(fs.readFileSync(f));
        }
        return send(404, { error: 'not found' });
      }

      // ---- API ----
      // ---- 授权闸门 (license gate) ----
      // 设计: 白名单只放 health / license 状态; 其余 /api/* 在"启用授权"时必须有有效授权。
      //      强校验必须放在后端 —— 前端(client.js)是明文 JS, 改了也没用, 拿不到数据与采集能力。
      //      未启用授权(enforce=false)时全部放行, 但状态接口会明确写"开发模式", 避免误以为已受保护。
      if (p.startsWith('/api/')) {
        const WHITELIST = ['/api/health', '/api/license/status', '/api/license/verify'];
        if (WHITELIST.indexOf(p) < 0) {
          const st = licenseStatus();
          if (st.enforce && !st.valid) {
            return send(403, {
              error: '未授权: ' + (st.message || st.reason),
              license: { enforce: st.enforce, reason: st.reason, fingerprint: st.fingerprint, customer: st.customer, expiresAt: st.expiresAt, contact: st.contact || null, licensePath: st.licensePath || null },
              howto: '把 license.key 放到 zying-demo\\ 目录后重启服务; 若已到期或换了机器, 请把本机指纹 ' + st.fingerprint + ' 发给授权方换新授权',
            });
          }
          // 功能位: 采集/导出/图搜/利润 可按授权逐项开关
          const FEATURE_OF = [
            ['collect', '/api/collect/'], ['export', '/api/products/export'], ['search', '/api/sources'], ['profit', '/api/profit/'],
          ];
          for (const [feat, prefix] of FEATURE_OF) {
            if (p.startsWith(prefix) && st.enforce && !hasFeature(feat)) {
              return send(403, { error: '本授权不含「' + feat + '」功能', license: { features: st.features, customer: st.customer } });
            }
          }
        }
      }
      if (p === '/api/license/status' && req.method === 'GET') return send(200, licenseStatus());
      if (p === '/api/health') return send(200, { ok: true, time: now() });

      // ---- AI 对话 (工作台): 代理到 OpenAI 兼容 Chat Completions (DeepSeek/OpenAI/自建), 配置存后端 ----
      if (p === '/api/ai/config' && req.method === 'GET') {
        return send(200, { name: aiConfig.name || '', baseURL: aiConfig.baseURL || '', model: aiConfig.model || '', configured: !!(aiConfig.apiKey), apiKeyMasked: aiConfig.apiKey ? 'sk-' + String(aiConfig.apiKey).slice(-4) : '' });
      }
      if (p === '/api/ai/config' && req.method === 'POST') {
        if (j.name != null) aiConfig.name = String(j.name).trim();
        if (j.baseURL != null) aiConfig.baseURL = String(j.baseURL).trim().replace(/\/+$/, '');
        if (j.model != null) aiConfig.model = String(j.model).trim();
        if (j.apiKey != null && j.apiKey !== '') aiConfig.apiKey = String(j.apiKey).trim();
        if (j.clearKey === true) aiConfig.apiKey = '';
        save('ai-config.json', aiConfig);
        return send(200, { ok: true, configured: !!(aiConfig.apiKey), apiKeyMasked: aiConfig.apiKey ? 'sk-' + String(aiConfig.apiKey).slice(-4) : '' });
      }
      if (p === '/api/ai/chat' && req.method === 'POST') {
        try {
          // 断线/超时自动重连 (最多4次尝试, 指数退避); 单次45s
          const content = await callAI(Array.isArray(j.messages) ? j.messages : [], { timeoutMs: 45000 });
          return send(200, { content });
        } catch (e) {
          return send(500, { error: 'AI 调用失败: ' + (e && e.message || String(e)) });
        }
      }

      // ---- 采集停止控制 ----
      // 任何采集接口(除 stop 外)开始前清空上次停止标志 → 停止后下一次采集正常开始
      // 注意: 仅当当前没有采集在运行时才重置, 否则排队/晚到的请求会清掉用户刚按下的停止标志,
      // 导致"按了停止但采集仍在跑" (stop 请求设置 collectStop=true 后被后续请求 reset)
      // 并注册实时进度 (mode 对应前端采集方式卡片)
      if (req.method === 'POST' && p.startsWith('/api/collect/') && p !== '/api/collect/stop') {
        const busy = !!(collectProgress && collectProgress.running);
        if (busy) {
          // 已有采集在运行: 拒绝新请求, 避免叠加任务或清掉用户刚按下的停止标志
          return send(409, { error: '已有采集正在运行 (mode=' + (collectProgress.mode || '?') + '), 请先点「停止」等当前步骤结束后再开始' });
        }
        // 无采集在运行 → 清空上次停止标志, 正常开始新采集
        resetCollectStop();
        const MAP = {
          '/api/collect/category': ['category', '类目搜索采集'],
          '/api/collect/shop-list': ['shop-list', '店铺列表采集'],
          '/api/collect/brand-batch': ['brand-batch', '批量品牌采集'],
          '/api/collect/site-bulk': ['bulk', '并行整站采集'],
          '/api/collect/category-menu': ['catmenu', '类目菜单采集'],
          '/api/collect/follow-shop-batch': ['batch', '批量跟卖店铺采集'],
          '/api/collect/follow-shop-aod': ['aod', '商品跟卖并行采集'],
          '/api/collect/follow-shop-rounds': ['parallel', '多商品并行采集'],
          '/api/collect/list-direct': ['list-direct', '列表页直采'],
          '/api/collect/list-filtered': ['list-filtered', '列表页筛选采集'],
        };
        const [mode, label] = MAP[p] || ['collect', '采集'];
        beginCollectProgress(mode, label);
      }
      if (p === '/api/collect/stop' && req.method === 'POST') {
        collectStop = true;
        return send(200, { ok: true, stopped: true, msg: '已请求停止采集, 当前步骤完成后将停止' });
      }
      if (p === '/api/collect/status' && req.method === 'GET') {
        return send(200, { stopRequested: collectStopRequested() });
      }
      if (p === '/api/collect/progress' && req.method === 'GET') {
        return send(200, collectProgress || { running: false });
      }
      // 采集记录 (历史批次): 按商品 collectedAt 聚合 — 相邻入库间隔 < 30 分钟视为同一次采集
      // 返回每次采集的起止时间(UTC, 精确到分钟) + 商品数量, 供采集面板"采集记录"加载历史并可点击跳转商品管理
      if (p === '/api/collect/logs' && req.method === 'GET') {
        const gapMin = Math.max(1, parseInt(url.searchParams.get('gap') || '30', 10) || 30);
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const stamped = products
          .map((x) => ({ t: String(x.collectedAt || ''), site: x.site, source: x.source, asin: x.asin }))
          .filter((x) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(x.t))
          .map((x) => { const p2 = x.t.split(/[- :]/); return { ...x, ms: Date.UTC(+p2[0], +p2[1] - 1, +p2[2], +p2[3], +p2[4], +p2[5]) }; })
          .filter((x) => isFinite(x.ms))
          .sort((a, b) => a.ms - b.ms);
        const batches = [];
        let cur = null;
        for (const x of stamped) {
          if (!cur || x.ms - cur.lastMs > gapMin * 60000) {
            cur = { from: x.t, to: x.t, lastMs: x.ms, items: [] };
            batches.push(cur);
          }
          cur.lastMs = x.ms; cur.to = x.t; cur.items.push(x);
        }
        const logs = batches.map((b) => {
          const sites = {}; const sources = {};
          b.items.forEach((x) => { if (x.site) sites[x.site] = (sites[x.site] || 0) + 1; if (x.source) sources[x.source] = (sources[x.source] || 0) + 1; });
          const topSource = Object.keys(sources).sort((a, z) => sources[z] - sources[a])[0] || '';
          const SRC_NAME = { 'cdp-follow-shop': '跟卖店铺采集', 'cdp-list-direct': '列表页直采', 'cdp-list-filtered': '列表页筛选采集', 'category-search': '类目搜索采集', 'brand-batch': '批量品牌采集', 'site-bulk': '并行整站采集', 'category-menu': '类目菜单采集', 'cdp-shop-list': '店铺列表采集', 'cdp-panel': '店铺面板采集', search: '搜索采集' };
          return {
            from: b.from.slice(0, 16), to: b.to.slice(0, 16), count: b.items.length,
            sites, source: topSource, name: (SRC_NAME[topSource] || topSource || '历史采集') + (Object.keys(sites).length ? ' · ' + Object.keys(sites).join('/') : ''),
            asins: b.items.slice(0, 5).map((x) => x.asin),
          };
        }).sort((a, z) => (a.from < z.from ? 1 : -1));
        return send(200, { total: logs.length, gapMinutes: gapMin, logs: logs.slice(0, limit) });
      }

      // ---- 采集过滤规则 (保存/加载/删除) ----
      // 过滤规则: 返回时附带 canonical (统一过滤条件) — 旧规则(legacy filter* 字段)自动换算, 前端只认 canonical
      if (p === '/api/collect-rules' && req.method === 'GET') {
        const rules = collectRules.map((r) => {
          const filt = r.filter || {};
          const isCanonical = Object.prototype.hasOwnProperty.call(filt, 'sites') || Object.prototype.hasOwnProperty.call(filt, 'fulfill');
          return Object.assign({}, r, { canonical: isCanonical ? normFilter(filt) : legacyToCanonical(filt) });
        });
        return send(200, { total: rules.length, rules });
      }
      if (p === '/api/collect-rules' && req.method === 'POST') {
        const name = String(j.name || '').trim();
        if (!name) return send(400, { error: '规则名称不能为空' });
        // 统一存储 canonical 形态 (前端面板直接读写同一 schema)
        const filt = j.filter && typeof j.filter === 'object' ? j.filter : {};
        const isCanonical = Object.prototype.hasOwnProperty.call(filt, 'sites') || Object.prototype.hasOwnProperty.call(filt, 'fulfill');
        const rule = {
          name,
          site: String(j.site || 'de'),
          filter: isCanonical ? normFilter(filt) : legacyToCanonical(filt),
          params: j.params && typeof j.params === 'object' ? j.params : {},
          updatedAt: now(),
        };
        const idx = collectRules.findIndex((r) => r.name === name);
        if (idx >= 0) collectRules[idx] = rule; else collectRules.unshift(rule);
        save('collect-rules.json', collectRules);
        return send(200, { ok: true, total: collectRules.length, rule });
      }
      if (p === '/api/collect-rules/delete' && req.method === 'POST') {
        const name = String(j.name || '').trim();
        const before = collectRules.length;
        collectRules = collectRules.filter((r) => r.name !== name);
        if (collectRules.length === before) return send(404, { error: '规则不存在: ' + name });
        save('collect-rules.json', collectRules);
        return send(200, { ok: true, total: collectRules.length });
      }

      // ---- 商品库数据分析 (AI 分析/排行用) ----
      if (p === '/api/products/analyze' && req.method === 'GET') {
        const total = products.length;
        const countBy = (fn) => { const m = {}; products.forEach((x) => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
        const bySite = countBy((x) => x.site);
        const byFulfill = countBy((x) => x.amazonSell ? 'AMZ' : x.fulfill);
        const byCategory = countBy((x) => (x.category || '').split('>').pop().trim()).slice(0, 15);
        const byBrand = countBy((x) => x.brand && x.brand !== 'Unknown' ? x.brand : null).slice(0, 15);
        const priceBuckets = { '<10': 0, '10-30': 0, '30-100': 0, '>100': 0 };
        products.forEach((x) => { const p = x.minPrice != null ? x.minPrice : x.price; if (p == null) return; if (p < 10) priceBuckets['<10']++; else if (p < 30) priceBuckets['10-30']++; else if (p < 100) priceBuckets['30-100']++; else priceBuckets['>100']++; });
        const ratingAvg = products.length ? (products.reduce((s, x) => s + (x.rating || 0), 0) / products.length).toFixed(2) : 0;
        const salesTotal = products.reduce((s, x) => s + (x.monthlySales || 0), 0);
        const fbaCount = products.filter((x) => x.fulfill === 'FBA' || x.amazonSell).length;
        const registered = products.filter((x) => x.brandStatus === 'registered' || x.tmMark).length;
        const withFollow = products.filter((x) => (x.followCount || 0) > 0).length;
        const pick = (arr, n, fn) => [...arr].sort(fn).slice(0, n).map((x) => ({ asin: x.asin, title: (x.title || '').slice(0, 50), price: x.minPrice != null ? x.minPrice : x.price, currency: x.currency || '', site: x.site || '', monthlySales: x.monthlySales || 0, followCount: x.followCount || 0, trademarkCount: x.trademarkCount || 0, brandStatus: x.brandStatus || '', fulfill: x.fulfill || '', brand: x.brand || '' }));
        return send(200, {
          total,
          bySite, byFulfill, byCategory, byBrand, priceBuckets,
          ratingAvg, salesTotal, fbaCount, registered, withFollow,
          salesTop: pick(products, 10, (a, b) => (b.monthlySales || 0) - (a.monthlySales || 0)),
          followTop: pick(products, 10, (a, b) => (b.followCount || 0) - (a.followCount || 0)),
          tmTop: pick(products, 10, (a, b) => (b.trademarkCount || 0) - (a.trademarkCount || 0)),
          riskList: products.filter((x) => x.brandStatus === 'registered' || x.tmMark).slice(0, 10).map((x) => ({ asin: x.asin, title: (x.title || '').slice(0, 50), brand: x.brand, brandStatus: x.brandStatus, tmMark: !!x.tmMark, trademarkCount: x.trademarkCount || 0 })),
          lowSales: products.filter((x) => (x.monthlySales || 0) === 0).length,
        });
      }

      // ---- 货源管理: 记录/读取/抓取 1688/淘宝/拼多多/Amazon 货源 (找货后价格对比入库) ----
      if (p === '/api/products/goods' && req.method === 'GET') {
        const asin = url.searchParams.get('asin') || '';
        const prod = products.find((x) => x.asin === asin);
        const goods = ((prod && prod.sourceGoods) || []).map(ensureGoodShape);
        return send(200, { goods });
      }
      // 兼容旧接口: 整数组覆盖写 (新代码请用 /goods/add | /goods/delete | /goods/patch)
      if (p === '/api/products/goods' && req.method === 'POST') {
        const { asin, goods } = j;
        if (!asin) return send(400, { error: '缺少 ASIN' });
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在' });
        prod.sourceGoods = Array.isArray(goods) ? goods.map(ensureGoodShape) : (prod.sourceGoods || []);
        save('products.json', products);
        return send(200, { ok: true, count: prod.sourceGoods.length });
      }
      // 单条新增: 按规范化 URL 去重; 已存在则更新标题/价格(变价记入 priceHistory)
      if (p === '/api/products/goods/add' && req.method === 'POST') {
        const asin = String(j.asin || '').trim();
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在: ' + asin });
        const g = j.good && typeof j.good === 'object' ? j.good : {};
        if (!g.url && !g.title) return send(400, { error: '需提供 url 或 title' });
        prod.sourceGoods = Array.isArray(prod.sourceGoods) ? prod.sourceGoods : [];
        const norm = ensureGoodShape(g);
        const idx = prod.sourceGoods.findIndex((x) => ensureGoodShape(x).urlKey && ensureGoodShape(x).urlKey === norm.urlKey);
        if (idx >= 0) {
          const old = ensureGoodShape(prod.sourceGoods[idx]);
          const changed = old.priceMin !== norm.priceMin || old.priceMax !== norm.priceMax;
          const merged = Object.assign({}, old, {
            title: norm.title || old.title, priceRaw: norm.priceRaw || old.priceRaw,
            priceMin: norm.priceMin != null ? norm.priceMin : old.priceMin,
            priceMax: norm.priceMax != null ? norm.priceMax : old.priceMax,
            currency: norm.currency || old.currency, moq: norm.moq || old.moq,
            supplier: norm.supplier || old.supplier, img: norm.img || old.img,
            checkedAt: now(),
            priceHistory: changed ? (old.priceHistory || []).concat([{ at: now(), priceRaw: old.priceRaw, priceMin: old.priceMin, priceMax: old.priceMax }]).slice(-20) : (old.priceHistory || []),
          });
          prod.sourceGoods[idx] = merged;
          save('products.json', products);
          return send(200, { ok: true, updated: true, id: merged.id, priceChanged: changed, count: prod.sourceGoods.length, good: merged });
        }
        prod.sourceGoods.unshift(Object.assign({}, norm, { addedAt: norm.addedAt || now(), checkedAt: norm.checkedAt || now() }));
        save('products.json', products);
        return send(200, { ok: true, updated: false, id: norm.id, count: prod.sourceGoods.length, good: norm });
      }
      // 单条删除 (按 id 或 urlKey)
      if (p === '/api/products/goods/delete' && req.method === 'POST') {
        const asin = String(j.asin || '').trim();
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在: ' + asin });
        const list = (prod.sourceGoods || []).map(ensureGoodShape);
        const keep = list.filter((x) => !(x.id === j.id || (j.urlKey && x.urlKey === j.urlKey)));
        prod.sourceGoods = keep;
        save('products.json', products);
        return send(200, { ok: true, removed: list.length - keep.length, count: keep.length });
      }
      // 单条修改 (手动改价/MOQ/供应商/备注)
      if (p === '/api/products/goods/patch' && req.method === 'POST') {
        const asin = String(j.asin || '').trim();
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在: ' + asin });
        const list = (prod.sourceGoods || []).map(ensureGoodShape);
        const it = list.find((x) => x.id === j.id || (j.urlKey && x.urlKey === j.urlKey));
        if (!it) return send(404, { error: '货源记录不存在' });
        const patch = j.patch && typeof j.patch === 'object' ? j.patch : {};
        Object.assign(it, patch);
        if (patch.priceRaw != null) Object.assign(it, parseGoodPrice(patch.priceRaw), { checkedAt: now() });
        prod.sourceGoods = list;
        save('products.json', products);
        return send(200, { ok: true, good: it });
      }
      // 设定货源角色: primary(现阶段最优) / backup(备选) / ''(普通)
      // 一个商品同时只能有一个 primary (设新的会自动把旧的降为普通)
      if (p === '/api/products/goods/set-role' && req.method === 'POST') {
        const asin = String(j.asin || '').trim();
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在: ' + asin });
        const role = j.role === 'primary' || j.role === 'backup' ? j.role : '';
        const list = (prod.sourceGoods || []).map(ensureGoodShape);
        const it = list.find((x) => x.id === j.id || (j.urlKey && x.urlKey === j.urlKey));
        if (!it) return send(404, { error: '货源记录不存在' });
        if (role === 'primary') list.forEach((x) => { if (x.role === 'primary' && x.id !== it.id) x.role = ''; });
        it.role = it.role === role ? '' : role;                 // 再点一次 = 取消
        prod.sourceGoods = list;
        save('products.json', products);
        return send(200, { ok: true, id: it.id, role: it.role, primary: primaryOf(prod), backups: backupsOf(prod).map((x) => x.id) });
      }
      // 货源总览 (全局视图): 覆盖率 + 平台分布 + 最划算/最贵 + 久未核价
      if (p === '/api/goods/overview' && req.method === 'GET') {
        // 汇率与利润测算同源: 优先用 /api/rates 的实时缓存 (data/rates.json), 没有才退回内置表
        // (否则同一个商品在"货源比价"和"利润测算"里会显示两个不同的百分比)
        let liveR = null;
        try {
          const rc = JSON.parse(fs.readFileSync(path.join(DATA, 'rates.json'), 'utf8'));
          if (rc && rc.rates && Object.keys(rc.rates).length) liveR = rc.rates;
        } catch (e) { /* 无缓存 → 用内置兜底表 */ }
        const rows = [];
        for (const x of products) {
          const gs = (x.sourceGoods || []).map(ensureGoodShape);
          if (gs.length) rows.push({ asin: x.asin, title: x.title, site: x.site, price: x.price, currency: x.currency, cat1: x.cat1, goods: gs });
        }
        const byPlatform = {};
        let totalGoods = 0, best = [], stale = [], noPrimary = [], backupCount = 0;
        const nowMs = Date.now();
        for (const r of rows) {
          const prim = r.goods.find((g) => g.role === 'primary');
          const bks = r.goods.filter((g) => g.role === 'backup');
          backupCount += bks.length;
          if (!prim) noPrimary.push({ asin: r.asin, title: String(r.title || '').slice(0, 50), goodsCount: r.goods.length, site: r.site });
          for (const g of r.goods) {
            totalGoods++;
            byPlatform[g.platform || '其他'] = (byPlatform[g.platform || '其他'] || 0) + 1;
            const c = goodCostVsPrice(g, r.buyBoxPrice != null ? r.buyBoxPrice : r.price, r.currency, liveR);
            if (c) best.push({ asin: r.asin, title: String(r.title || '').slice(0, 50), platform: g.platform, url: g.url, priceCny: g.priceMin, shipFee: g.shipFee || 0, costCny: c.costCny, ratioPct: c.ratioPct, role: g.role || '', site: r.site });
            if (g.checkedAt && (nowMs - new Date(String(g.checkedAt).replace(' ', 'T') + 'Z').getTime()) > 30 * 86400000) stale.push({ asin: r.asin, platform: g.platform, checkedAt: g.checkedAt, priceCny: g.priceMin, url: g.url });
          }
        }
        best.sort((a, b) => a.ratioPct - b.ratioPct);
        return send(200, {
          products: products.length, withGoods: rows.length, missing: products.length - rows.length,
          totalGoods, byPlatform, backups: backupCount,
          withPrimary: rows.length - noPrimary.length,
          noPrimary: noPrimary.slice(0, 100),
          bestDeals: best.slice(0, 30), worstDeals: best.slice(-20).reverse(),
          stale: stale.slice(0, 50),
          staleNote: '超过 30 天未核价 (采购价会变, 旧价决策会翻车)',
        });
      }

      // ---- 物流运费试算 (CDP 驱动云途官网价格试算, 免费, 无需登录套餐) ----
      // 输入: originCity(发件城市, 默认深圳) / country(目的国, 默认GB) / weightKg / 长宽高cm / battery(带电)
      // 流程: 打开云途试算页 → 选发件城市 → 搜目的国 → 填重量体积 → 普货/带电 → 计算 → 提取报价表
      if (p === '/api/logistics/quote' && req.method === 'POST') {
        const originCity = String(j.originCity || '深圳市').trim();
        const country = String(j.country || 'GB').trim().toUpperCase();
        const weightKg = parseFloat(j.weightKg) || 1;
        const len = parseFloat(j.lengthCm) || 0, wid = parseFloat(j.widthCm) || 0, hgt = parseFloat(j.heightCm) || 0;
        const battery = !!j.battery;
        try {
          const tabs = await cdpGetTabs();
          // 优先用 www.yunexpress.cn 试算页 (排除 open. 平台页, 避免选错标签导致无试算表单)
          const page = tabs.find((t) => t.type === 'page' && /www\.yunexpress\.cn/.test(t.url) && !/open\./.test(t.url))
            || tabs.find((t) => t.type === 'page' && !/open\.|3088/.test(t.url) && !t.url.startsWith('data:') && t.url.startsWith('http'))
            || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'));
          if (!page) return send(500, { error: 'Edge 无可用页面标签' });
          const { send: qs } = await cdpConnect(page.webSocketDebuggerUrl);
          const CALC = 'https://www.yunexpress.cn/resource/shipping-calculator';
          const ev = async (expr) => {
            try {
              const r = await qs('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
              if (!r || !r.result) return undefined;
              if (r.exceptionDetails) return undefined;
              return r.result.value;
            } catch { return undefined; }
          };
          const clickTxt = async (text, containerSel = null) => {
            const pos = await ev(`(() => {
              const root = ${containerSel ? `document.querySelector(${JSON.stringify(containerSel)})` : 'document'};
              const el = [...(root ? root.querySelectorAll('button, [role="option"], div') : document.querySelectorAll('button, [role="option"], div'))].find(x => (x.textContent || '').trim() === ${JSON.stringify(text)} && x.offsetParent !== null);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
            })()`);
            if (!pos) return false;
            const p = JSON.parse(pos);
            await qs('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
            await new Promise((r) => setTimeout(r, 150));
            await qs('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            await new Promise((r) => setTimeout(r, 80));
            await qs('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            await new Promise((r) => setTimeout(r, 600));
            return true;
          };
          // 两种填充模式: 'keyboard' 真实键盘(搜索框, 触发搜索) | 'setter' setter+blur(重量/体积, 同步隐藏字段)
          const fillInput = async (sel, val, mode = 'setter') => {
            if (mode === 'keyboard') {
              const ok = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.focus(); return true; })()`);
              if (!ok) return false;
              await new Promise((r) => setTimeout(r, 300));
              await qs('Input.insertText', { text: String(val) });
              await new Promise((r) => setTimeout(r, 400));
              return true;
            }
            // setter 模式: 设值 + input/change/blur (blur 触发 React 同步隐藏字段)
            const ok = await ev(`(() => {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (!el) return false;
              const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              s.call(el, String(val));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
              return true;
            })()`);
            if (!ok) return false;
            await new Promise((r) => setTimeout(r, 300));
            return true;
          };
          // 打开下拉: 真实鼠标点击按钮(id) (React 需真实事件)
          const openDropdown = async (btnSel) => {
            const pos = await ev(`(() => { const b = document.querySelector(${JSON.stringify(btnSel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }); })()`);
            if (!pos) return false;
            const p = JSON.parse(pos);
            await qs('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
            await new Promise((r) => setTimeout(r, 150));
            await qs('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            await new Promise((r) => setTimeout(r, 80));
            await qs('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            await new Promise((r) => setTimeout(r, 1500));
            return true;
          };
          // 选下拉选项: 直接 JS click (不依赖坐标, 最可靠)
          const pickOption = async (text) => {
            return await ev(`(() => {
              const opts = [...document.querySelectorAll('[role="option"], [class*="select-non"]')];
              const target = opts.find(o => (o.textContent || '').trim() === ${JSON.stringify(text)});
              if (!target) return false;
              target.click();
              return true;
            })()`);
          };
          // 单次试算流程 (导航 → 选城市/目的国 → 填重量体积 → 提交 → 提取)
          const runQuote = async () => {
            await qs('Page.navigate', { url: CALC });
            // 等 18s: Nuxt SSR + React 完整水合后表单才可交互
            await new Promise((r) => setTimeout(r, 18000));
            // ① 选发件城市: 点开 → JS click 选项
            await openDropdown('button#v-0-1');
            await pickOption(originCity);
            await new Promise((r) => setTimeout(r, 800));
            // ② 选目的国: 点开 → 搜索框 focus+输入 → JS click 选项
            await openDropdown('button#v-0-2');
            await fillInput('input#v-0-2', country, 'keyboard');
            await new Promise((r) => setTimeout(r, 1800));
            let picked = false;
            try {
              const optTxt = await ev(`(() => {
                const opts = [...document.querySelectorAll('[role="option"], [class*="select-non"]')].map(o => (o.textContent || '').trim()).filter(t => t && t.length < 30);
                return JSON.stringify([...new Set(opts)]);
              })()`);
              const list = JSON.parse(optTxt);
              const target = list.find((t) => t.toUpperCase().includes(country) && t.length < 30);
              if (target) picked = await pickOption(target);
            } catch {}
            if (!picked) {
              await qs('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
              await qs('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
              await new Promise((r) => setTimeout(r, 1000));
            }
            await new Promise((r) => setTimeout(r, 600));
            // ③ 填重量 + 体积 (等 React 解锁输入框后, keyboard 设显示值 + setter 设隐藏字段 双保险)
            await new Promise((r) => setTimeout(r, 2000));
            await fillInput('input[placeholder="包裹重量"]', weightKg, 'keyboard');
            await ev(`(() => { const el = document.querySelector('input[placeholder="包裹重量"]'); if (el) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, ${JSON.stringify(String(weightKg))}); el.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
            if (len > 0) await fillInput('input#v-0-8', len, 'keyboard');
            if (wid > 0) await fillInput('input#v-0-9', wid, 'keyboard');
            if (hgt > 0) await fillInput('input#v-0-10', hgt, 'keyboard');
            // ④ 包裹类型: JS click 普货/带电
            await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === ${JSON.stringify(battery ? '带电' : '普货')} && x.offsetParent !== null); if (b) b.click(); return true; })()`);
            await new Promise((r) => setTimeout(r, 600));
            // 提交前确认重量已填 (诊断)
            const wtCheck = await ev(`(() => { const el = document.querySelector('input[placeholder="包裹重量"]'); return el ? el.value : 'none'; })()`);
            console.log('[quote] 提交前重量:', wtCheck);
            // ⑤ 提交: 真实鼠标点击"计 算" (React 需真实事件)
            const calcPos = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /计\\s*算/.test(x.textContent || '') && x.offsetParent !== null); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }); })()`);
            if (calcPos) {
              const p = JSON.parse(calcPos);
              await qs('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
              await new Promise((r) => setTimeout(r, 150));
              await qs('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
              await new Promise((r) => setTimeout(r, 80));
              await qs('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
            } else {
              await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /计\\s*算/.test(x.textContent || '')); if (b) b.click(); return true; })()`);
            }
            await new Promise((r) => setTimeout(r, 10000));
            // ⑥ 提取
            const rrRaw = await ev(`(() => {
              const out = { empty: false, rows: [] };
              const tb = document.querySelector('table');
              if (tb) {
                const trs = [...tb.querySelectorAll('tr')];
                for (const tr of trs) {
                  const cells = [...tr.querySelectorAll('td')].map((c) => (c.textContent || '').trim().replace(/\\s+/g, ' '));
                  if (cells.length >= 11 && /\\d/.test(cells[7] || '') && cells[2] !== '包裹类型') {
                    out.rows.push({ channel: cells[0], type: cells[1], parcel: cells[2], code: cells[3], chargeable: cells[4], trackable: cells[5], eta: cells[6], freight: cells[7], regFee: cells[8], otherFee: cells[9], total: cells[10] });
                  }
                }
              }
              if (!out.rows.length) {
                const txt = (document.body.innerText || '');
                const idx = txt.indexOf('搜索结果');
                const seg = idx >= 0 ? txt.slice(idx, idx + 20000) : '';
                if (seg.includes('无可用数据')) return JSON.stringify({ empty: true });
                const lines = seg.split(/\\n+/).map((l) => l.trim()).filter(Boolean);
                for (const line of lines) {
                  const cells = line.split(/\\t+|\\s{2,}/).map((c) => c.trim()).filter(Boolean);
                  if (cells.length >= 11 && /\\d/.test(cells[7] || '') && cells[2] !== '包裹类型' && !/产品名称/.test(cells[0])) {
                    out.rows.push({ channel: cells[0], type: cells[1], parcel: cells[2], code: cells[3], chargeable: cells[4], trackable: cells[5], eta: cells[6], freight: cells[7], regFee: cells[8], otherFee: cells[9], total: cells[10] });
                  }
                }
              }
              return JSON.stringify(out);
            })()`);
            let parsed = { empty: true, rows: [] };
            try { parsed = JSON.parse(rrRaw || '{"empty":true}'); } catch {}
            let quotes = [];
            if (!parsed.empty) {
              quotes = (parsed.rows || []).map((c) => ({
                channel: c.channel, type: c.type, parcel: c.parcel, code: c.code,
                chargeable: c.chargeable, trackable: c.trackable, eta: c.eta,
                freight: parseFloat(c.freight) || null,
                registrationFee: parseFloat(c.regFee) || null,
                otherFee: parseFloat(c.otherFee) || null,
                total: parseFloat(c.total) || null,
              })).filter((q) => q.total != null);
            }
            return quotes;
          };
          // 执行试算, 无结果则重载重试 (最多 2 次)
          let quotes = [];
          for (let attempt = 1; attempt <= 2 && !quotes.length; attempt++) {
            quotes = await runQuote();
            if (!quotes.length && attempt === 1) {
              // 重试前确保页面可交互 (重新加载)
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
          return send(200, { ok: true, originCity, country, weightKg, lengthCm: len, widthCm: wid, heightCm: hgt, battery, count: quotes.length, quotes, note: '价格来自云途官网试算, 仅供参考, 以实际订单为准' });
        } catch (e) {
          return send(500, { error: '运费试算失败: ' + (e && e.message || e) + ' (请确认云途官网可访问)' });
        }
      }
      // ---- 物流配置 (云途 sourcekey / AppToken) ----
      if (p === '/api/logistics/config' && req.method === 'GET') {
        let cfg = {};
        try { cfg = JSON.parse(fs.readFileSync(path.join(DATA, 'logistics-config.json'), 'utf8')); } catch {}
        return send(200, { ok: true, sourcekey: cfg.sourcekey || '', appToken: cfg.appToken || '', EBusinessID: cfg.EBusinessID || '', kdAppKey: cfg.AppKey || '' });
      }
      if (p === '/api/logistics/config' && req.method === 'POST') {
        try {
          const file = path.join(DATA, 'logistics-config.json');
          let cfg = {};
          try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
          if (j.sourcekey !== undefined) cfg.sourcekey = String(j.sourcekey).trim();
          if (j.appToken !== undefined) cfg.appToken = String(j.appToken).trim();
          fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
          return send(200, { ok: true, sourcekey: cfg.sourcekey || '', appToken: cfg.appToken || '' });
        } catch (e) {
          return send(500, { error: '保存配置失败: ' + (e && e.message || e) });
        }
      }
      // ---- 物流报价表 (本地维护, 按国家×渠道, 每日/手动更新) ----
      // 数据模型: { version, updatedAt, countries: { "GB": [ { channel, type, firstWeight, firstPrice, contWeight, contPrice, minKg, maxKg, eta, note } ] } }
      const RATES_FILE = path.join(DATA, 'logistics-rates.json');
      const loadRates = () => { try { return JSON.parse(fs.readFileSync(RATES_FILE, 'utf8')); } catch { return { version: 1, updatedAt: null, countries: {} }; } };
      // 本地运费试算: 按国家 + 重量(kg) 计算各渠道费用 (首重+续重)
      const calcRate = (country, weightKg, rates) => {
        const list = (rates.countries && rates.countries[country]) || [];
        return list.map((c) => {
          const w = Math.max(0.001, weightKg);
          let total = null;
          if (c.firstWeight != null && c.firstPrice != null) {
            const firstW = parseFloat(c.firstWeight) || 0.5;
            const contW = parseFloat(c.contWeight) || 0.5;
            const contP = parseFloat(c.contPrice) || 0;
            if (w <= firstW) total = parseFloat(c.firstPrice);
            else total = parseFloat(c.firstPrice) + Math.ceil((w - firstW) / contW) * contP;
          }
          return { channel: c.channel, type: c.type || '', eta: c.eta || '', firstWeight: c.firstWeight, firstPrice: c.firstPrice, contWeight: c.contWeight, contPrice: c.contPrice, total: total != null ? Math.round(total * 100) / 100 : null, note: c.note || '' };
        }).filter((q) => q.total != null);
      };
      if (p === '/api/logistics/rates' && req.method === 'GET') {
        const rates = loadRates();
        const country = String(url.searchParams.get('country') || '').toUpperCase();
        const weightKg = parseFloat(url.searchParams.get('weight')) || 0;
        if (country && weightKg > 0) {
          // 试算模式: 返回该国家各渠道报价
          const quotes = calcRate(country, weightKg, rates);
          return send(200, { ok: true, country, weightKg, updatedAt: rates.updatedAt, count: quotes.length, quotes, note: '本地报价表试算, 价格为录入值, 请定期更新' });
        }
        return send(200, { ok: true, updatedAt: rates.updatedAt, countryCount: Object.keys(rates.countries || {}).length, countries: rates.countries || {} });
      }
      if (p === '/api/logistics/rates' && req.method === 'POST') {
        try {
          const rates = loadRates();
          // 两种模式: 单条保存 { country, channel, ... } | 整表覆盖 { countries } | 刷新时间 { _touch }
          if (j._touch) {
            // 仅刷新 updatedAt (标记已更新)
          } else if (j.countries) {
            rates.countries = j.countries;
          } else if (j.country && j.channel) {
            const cc = String(j.country).toUpperCase();
            if (!rates.countries[cc]) rates.countries[cc] = [];
            const item = { channel: String(j.channel), type: j.type || '', firstWeight: parseFloat(j.firstWeight) || 0.5, firstPrice: parseFloat(j.firstPrice) || 0, contWeight: parseFloat(j.contWeight) || 0.5, contPrice: parseFloat(j.contPrice) || 0, eta: j.eta || '', note: j.note || '' };
            if (j.remove) rates.countries[cc] = rates.countries[cc].filter((c) => c.channel !== item.channel);
            else {
              const idx = rates.countries[cc].findIndex((c) => c.channel === item.channel);
              if (idx >= 0) rates.countries[cc][idx] = { ...rates.countries[cc][idx], ...item };
              else rates.countries[cc].push(item);
            }
          }
          rates.updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
          rates.version = (rates.version || 1) + 1;
          fs.writeFileSync(RATES_FILE, JSON.stringify(rates, null, 2));
          return send(200, { ok: true, updatedAt: rates.updatedAt, countryCount: Object.keys(rates.countries || {}).length });
        } catch (e) {
          return send(500, { error: '保存报价表失败: ' + (e && e.message || e) });
        }
      }
      // ---- 实时汇率 (免费 API 每日快照, 可手动覆盖; 基准 CNY) ----
      if (p === '/api/rates' && req.method === 'GET') {
        const ratesFile = path.join(DATA, 'rates.json');
        let cache = {};
        try { cache = JSON.parse(fs.readFileSync(ratesFile, 'utf8')); } catch {}
        const today = new Date().toISOString().slice(0, 10);
        // 有当日缓存且非强制刷新 → 直接返回
        if (cache.date === today && cache.rates && Object.keys(cache.rates).length) {
          return send(200, { ok: true, base: 'CNY', date: cache.date, rates: cache.rates, source: cache.source || 'cache', history: cache.history || [] });
        }
        // 无缓存 → 拉取免费汇率 API
        const sources = [
          'https://open.er-api.com/v6/latest/CNY',
          'https://api.frankfurter.app/latest?from=CNY',
        ];
        let rates = null, source = '';
        for (const u of sources) {
          try {
            const resp = await fetch(u, { signal: AbortSignal.timeout(15000) });
            if (!resp.ok) continue;
            const d = await resp.json();
            if (u.includes('er-api') && d.result === 'success' && d.rates) {
              // er-api latest/CNY 返回 "1 CNY = X 外币" → 取倒数得 "1 外币 = X CNY"
              rates = {};
              for (const [k, v] of Object.entries(d.rates)) { if (v > 0) rates[k] = +(1 / v).toFixed(4); }
              source = 'open.er-api.com';
            }
            else if (u.includes('frankfurter') && d.rates) {
              // frankfurter latest?from=CNY 也是 "1 CNY = X 外币"
              rates = {};
              for (const [k, v] of Object.entries(d.rates)) { if (v > 0) rates[k] = +(1 / v).toFixed(4); }
              source = 'frankfurter.app';
            }
            if (rates && Object.keys(rates).length) break;
          } catch {}
        }
        if (!rates) {
          // API 全失败 → 用上次缓存或内置兜底
          if (cache.rates && Object.keys(cache.rates).length) return send(200, { ok: true, base: 'CNY', date: cache.date, rates: cache.rates, source: cache.source + ' (过期缓存)', history: cache.history || [], stale: true });
          rates = { EUR: 7.8, USD: 7.1, GBP: 9.1, JPY: 0.048, AUD: 4.7, CAD: 5.2, INR: 0.085, MXN: 0.4, BRL: 1.3, AED: 1.93, SAR: 1.89, SGD: 5.3 };
          source = '内置兜底';
        }
        const history = Array.isArray(cache.history) ? cache.history : [];
        history.unshift({ date: today, rates });
        if (history.length > 90) history.length = 90;
        const out = { base: 'CNY', date: today, rates, source, history, updatedAt: new Date().toISOString() };
        try { fs.writeFileSync(ratesFile, JSON.stringify(out, null, 2)); } catch {}
        return send(200, { ok: true, ...out });
      }
      // 手动覆盖汇率 (便于无外网时维护)
      if (p === '/api/rates' && req.method === 'POST') {
        try {
          const ratesFile = path.join(DATA, 'rates.json');
          let cache = {};
          try { cache = JSON.parse(fs.readFileSync(ratesFile, 'utf8')); } catch {}
          const today = new Date().toISOString().slice(0, 10);
          cache.rates = { ...(cache.rates || {}), ...(j.rates || {}) };
          cache.date = today;
          cache.source = 'manual';
          cache.updatedAt = new Date().toISOString();
          fs.writeFileSync(ratesFile, JSON.stringify(cache, null, 2));
          return send(200, { ok: true, rates: cache.rates });
        } catch (e) {
          return send(500, { error: '保存汇率失败: ' + (e && e.message || e) });
        }
      }
      if (p === '/api/products/goods/fetch' && req.method === 'POST') {
        // CDP 打开货源链接, 抓标题/价格 (1688/淘宝/拼多多/Amazon 详情页)
        const url = String(j.url || '').trim();
        if (!/^https?:\/\//.test(url)) return send(400, { error: '无效链接' });
        try {
          const tabs = await cdpGetTabs();
          const page = tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:')) || tabs.find((t) => t.type === 'page');
          if (!page) return send(500, { error: 'Edge 无可用页面标签' });
          const { send: gs } = await cdpConnect(page.webSocketDebuggerUrl);
          await gs('Page.navigate', { url });
          await new Promise((r) => setTimeout(r, 9000));
          for (let s = 0; s < 2; s++) { await gs('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 2500})` }); await new Promise((r) => setTimeout(r, 600)); }
          const rr = await gs('Runtime.evaluate', {
            expression: `(() => {
              const out = { title: null, price: null };
              const t = document.title || '';
              if (t) out.title = t.replace(/[-|_].*$/, '').trim().slice(0, 120) || t.slice(0, 120);
              // 通用价格选择器 (1688/淘宝/拼多多/Amazon 常见)
              const sels = [
                '#price .price, .priceText, .price-current, .tb-rmb-num, .price--mainText, [class*="price"] .price-text, [class*="Price"] span[class*="price"], .a-price .a-offscreen, [data-testid="price"]'
              ];
              for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) { const m = (el.textContent || '').match(/[\\d.,]+/); if (m) { out.price = m[0]; break; } }
              }
              if (!out.price) { const m2 = (document.body.textContent || '').match(/(?:¥|￥|\\$|€|£)\\s*([\\d.,]+)/); if (m2) out.price = m2[1]; }
              return JSON.stringify(out);
            })()`, returnByValue: true,
          });
          const info = JSON.parse(rr.result.value);
          return send(200, { title: info.title, price: info.price, url });
        } catch (e) {
          return send(500, { error: '抓取货源信息失败: ' + (e && e.message || e) });
        }
      }
      // ---- 1688 找货: 商品主图 → 1688 以图搜图 → 抓取同款货源列表 (需 1688 已登录) ----
      if (p === '/api/products/1688-search' && req.method === 'POST') {
        let imageUrl = String(j.imageUrl || '').trim();
        let asin = String(j.asin || '').trim();
        if (!imageUrl && asin) {
          const prod = products.find((x) => x.asin === asin);
          imageUrl = (prod && prod.mainImage) || '';
        }
        if (!imageUrl) return send(400, { error: '缺少商品主图 (该商品无主图)' });
        try {
          const tabs = await cdpGetTabs();
          const page = tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:')) || tabs.find((t) => t.type === 'page');
          if (!page) return send(500, { error: 'Edge 无可用页面标签' });
          const { send: gs } = await cdpConnect(page.webSocketDebuggerUrl);
          const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm?imageUrl=' + encodeURIComponent(imageUrl);
          await gs('Page.navigate', { url: searchUrl });
          await new Promise((r) => setTimeout(r, 18000));
          for (let s = 0; s < 3; s++) { await gs('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 800)); }
          const rr = await gs('Runtime.evaluate', {
            expression: `(() => {
              const out = [];
              document.querySelectorAll('[class*="offerCard"]').forEach(card => {
                const href = card.getAttribute('href') || '';
                const offerId = (href.match(/offerId=(\\d+)/) || [])[1];
                const url = offerId ? 'https://detail.1688.com/offer/' + offerId + '.html' : (href.startsWith('http') ? href : 'https:' + href);
                const titleEl = card.querySelector('[class*="title" i], [class*="Title"]');
                const priceEl = card.querySelector('[class*="price" i], [class*="Price"], [class*="money" i]');
                const imgEl = card.querySelector('img');
                const priceTxt = priceEl ? priceEl.textContent.trim().replace(/\\s+/g, ' ') : '';
                out.push({
                  url,
                  offerId,
                  title: titleEl ? titleEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80) : '',
                  price: (priceTxt.match(/¥?[\\d.]+/) || [''])[0],
                  priceRaw: priceTxt.slice(0, 30),
                  img: imgEl ? (imgEl.getAttribute('src') || '') : '',
                });
              });
              return JSON.stringify(out);
            })()`, returnByValue: true,
          });
          const items = JSON.parse(rr.result.value);
          return send(200, { ok: true, count: items.length, items: items.slice(0, 20), searchUrl });
        } catch (e) {
          return send(500, { error: '1688 找货失败: ' + (e && e.message || e) + ' (请确认已登录 1688)' });
        }
      }

      // ---- 补采排名: 对无排名商品批量读详情页 BSR (可指定 asins 或自动取无排名商品, 可停止) ----
      if (p === '/api/products/refresh-ranks' && req.method === 'POST') {
        const asins = Array.isArray(j.asins) ? j.asins : [];
        let list = asins.length
          ? products.filter((x) => asins.includes(x.asin))
          : products.filter((x) => !(x.rank && x.rank !== '-' && x.rank !== 'null') && x.site);
        if (!list.length) return send(200, { ok: true, total: 0, addedRank: 0, msg: '没有需要补排名的商品' });
        try {
          const tabs = await cdpGetTabs();
          const page = tabs.find((t) => t.type === 'page' && /amazon\./.test(t.url)) || tabs.find((t) => t.type === 'page' && !t.url.includes('3088')) || tabs.find((t) => t.type === 'page');
          if (!page) return send(500, { error: 'Edge 无可用页面标签' });
          const { send: rs } = await cdpConnect(page.webSocketDebuggerUrl);
          let done = 0, addedRank = 0, fail = 0;
          for (const it of list) {
            if (collectStopRequested()) break;
            try {
              await cdpEnrichOne(rs, 'www.amazon.' + siteToHostSuffix(it.site), it, {});
              if (Array.isArray(it.bsr) && it.bsr.length) {
                it.rank = '#' + Math.max(...it.bsr.map((b) => b.rank));
                addedRank++;
              }
            } catch (e) { fail++; }
            done++;
            bumpCollectProgress({ step: '补采排名', items: done, added: addedRank });
          }
          if (addedRank > 0) save('products.json', products);
          return send(200, { ok: true, total: list.length, done, addedRank, fail, stopped: collectStopRequested() });
        } catch (e) {
          return send(500, { error: '补采排名失败: ' + (e && e.message || e) });
        }
      }

      // ---- 1688 找货 (上传主图版): 下载主图 → 上传 1688 以图搜图 → 抓同款货源 ----
      if (p === '/api/products/1688-search-upload' && req.method === 'POST') {
        let imageUrl = String(j.imageUrl || '').trim();
        let asin = String(j.asin || '').trim();
        if (!imageUrl && asin) {
          const prod = products.find((x) => x.asin === asin);
          imageUrl = (prod && prod.mainImage) || '';
        }
        if (!imageUrl) return send(400, { error: '缺少商品主图 (该商品无主图)' });
        let tmpFile = null;
        try {
          // ① 下载主图到临时文件
          const tmpDir = path.join(DATA, 'tmp');
          fs.mkdirSync(tmpDir, { recursive: true });
          tmpFile = path.join(tmpDir, (asin || 'img') + '_' + Date.now() + '.jpg');
          const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
          if (!imgResp.ok) return send(500, { error: '主图下载失败 (HTTP ' + imgResp.status + ')' });
          fs.writeFileSync(tmpFile, Buffer.from(await imgResp.arrayBuffer()));
          // ② CDP: 打开 1688 搜索页 → 上传图片到以图搜图
          const tabs = await cdpGetTabs();
          const page = tabs.find((t) => t.type === 'page' && t.url.includes('1688'))
            || tabs.find((t) => t.type === 'page' && !t.url.includes('3088') && !t.url.startsWith('data:'))
            || tabs.find((t) => t.type === 'page');
          if (!page) return send(500, { error: 'Edge 无可用页面标签' });
          const { send: us } = await cdpConnect(page.webSocketDebuggerUrl);
          await us('Page.navigate', { url: 'https://s.1688.com/selloffer/offer_search.htm' });
          // 等页面加载 + "以图搜款"按钮出现 (React 挂载, 通常 3s 内)
          let btnReady = false;
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const ck = await us('Runtime.evaluate', { expression: `(() => !!document.querySelector('[class*="image-upload-button-container"]'))()` });
              if (ck && ck.result && ck.result.value) { btnReady = true; break; }
            } catch {}
          }
          if (!btnReady) return send(500, { error: '1688 页面加载超时 (请确认已登录 1688)' });
          // 定位"以图搜款"上传 input: 页面直带 (navigate 后即存在, 类 image-file-reader-wrapper) 优先, 找不到再点按钮开弹层
          const INPUT_SEL = 'input[type="file"][class*="image-file-reader-wrapper"], input[type="file"]';
          const findInput = async () => {
            try {
              const doc = await us('DOM.getDocument', {});
              const q = await us('DOM.querySelector', { nodeId: doc.root.nodeId, selector: INPUT_SEL });
              return (q && q.nodeId) ? q.nodeId : null;
            } catch { return null; }
          };
          let nodeId = null;
          // 阶段 1: 直接轮询页面自带 file input (navigate 后通常 1-3s 就绪)
          for (let i = 0; i < 12 && !nodeId; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            nodeId = await findInput();
          }
          // 阶段 2: 仍未找到 → 点击"以图搜款"按钮打开上传弹层 (最多 3 次, 每次重查)
          for (let retry = 0; retry < 3 && !nodeId; retry++) {
            await us('Runtime.evaluate', { expression: `(() => { const btn = document.querySelector('[class*="image-upload-button-container"]'); if (btn) btn.click(); return true; })()` });
            await new Promise((r) => setTimeout(r, 2000));
            for (let i = 0; i < 8 && !nodeId; i++) {
              await new Promise((r) => setTimeout(r, 1000));
              nodeId = await findInput();
            }
          }
          if (!nodeId) {
            let diag = '';
            try {
              const dd = await us('Runtime.evaluate', { expression: `(() => { const t = (document.body.innerText || '').replace(/\\n+/g, ' ').slice(0, 120); const inputs = [...document.querySelectorAll('input[type="file"]')].map(el => (el.className || '').slice(0, 50)); return JSON.stringify({ fileInputs: inputs, hasBtn: !!document.querySelector('[class*="image-upload-button-container"]'), txt: t }); })()` });
              diag = ' ' + JSON.stringify(dd && dd.result && dd.result.value);
            } catch {}
            return send(500, { error: '未找到 1688 图搜上传控件 (请确认已登录 1688)' + diag });
          }
          // ② 用 nodeId 设置文件到上传 input (objectId 方式 React 不识别, 必须 nodeId)
          await us('DOM.setFileInputFiles', { files: [tmpFile], nodeId });
          // 派发 change 触发 React 上传 → 等"搜索图片"按钮出现 (上传完成标志, 通常 2-4s)
          await us('Runtime.evaluate', { expression: `(() => { const els = [...document.querySelectorAll('input[type="file"]')]; const el = els.find(e => /image-file-reader|upload/i.test(e.className || '')) || els[0]; if (el) el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()` });
          let uploaded = false;
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const ck = await us('Runtime.evaluate', { expression: `(() => { const sb = document.querySelector('.search-btn'); return !!(sb && (sb.offsetWidth || sb.offsetHeight)); })()` });
              if (ck && ck.result && ck.result.value) { uploaded = true; break; }
            } catch {}
          }
          if (!uploaded) return send(500, { error: '图片上传超时 (请确认已登录 1688)' });
          // ③ 点击"搜索图片"按钮触发以图搜图
          await us('Runtime.evaluate', { expression: `(() => { const btns = [...document.querySelectorAll('.search-btn, button, [role="button"]')]; const sb = btns.find(b => /搜索图片|开始搜索/.test(b.textContent || '') && (b.offsetWidth || b.offsetHeight)); if (sb) { sb.click(); return true; } return false; })()` });
          // ④ 等待图搜结果页跳转 + 结果卡片出现 (通常 5-10s)
          let gotResults = false;
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const ck = await us('Runtime.evaluate', { expression: `(() => { const n = document.querySelectorAll('[class*="searchOfferWrapper"]').length; return n > 0; })()` });
              if (ck && ck.result && ck.result.value) { gotResults = true; break; }
            } catch {}
          }
          if (!gotResults) await new Promise((r) => setTimeout(r, 4000)); // 兜底等待
          for (let s = 0; s < 3; s++) { await us('Runtime.evaluate', { expression: `window.scrollTo(0, ${(s + 1) * 3000})` }); await new Promise((r) => setTimeout(r, 600)); }
          // ④ 提取同款货源 (图搜结果页: air.1688.com/kapp/1688-search/pc-image-search)
          const rr = await us('Runtime.evaluate', {
            expression: `(() => {
              const out = [];
              document.querySelectorAll('[class*="searchOfferWrapper"], [class*="searchOfferItem"]').forEach(card => {
                const aplus = card.getAttribute('data-aplus-report') || '';
                const rkey = card.getAttribute('data-renderkey') || '';
                const aid = aplus.match(/object_id@(\\d+)/);
                const rid = rkey.match(/_(\\d{10,})$/);
                const offerId = aid ? aid[1] : (rid ? rid[1] : null);
                const url = offerId ? 'https://detail.1688.com/offer/' + offerId + '.html' : null;
                const titleEl = card.querySelector('[class*="title" i], [class*="Title"], [class*="name" i]');
                const priceEl = card.querySelector('[class*="price" i], [class*="Price"], [class*="money" i]');
                const imgEl = card.querySelector('img');
                const priceTxt = priceEl ? priceEl.textContent.trim().replace(/\\s+/g, ' ') : '';
                out.push({
                  url, offerId,
                  title: titleEl ? titleEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 80) : '',
                  price: (priceTxt.match(/¥?[\\d.]+/) || [''])[0],
                  priceRaw: priceTxt.slice(0, 30),
                  img: imgEl ? (imgEl.getAttribute('src') || '') : '',
                });
              });
              return JSON.stringify(out);
            })()`, returnByValue: true,
          });
          const items = JSON.parse(rr.result.value);
          return send(200, { ok: true, count: items.length, items: items.slice(0, 20), method: 'upload' });
        } catch (e) {
          return send(500, { error: '1688 图搜上传失败: ' + (e && e.message || e) + ' (请确认已登录 1688)' });
        } finally {
          if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
        }
      }

      // 统一过滤条件: 空模板 + 字段清单 (前端面板与后端同一份定义; 两个页面共用)
      if (p === '/api/filter/spec' && req.method === 'GET') {
        return send(200, {
          empty: normFilter({}),
          keys: FILTER_KEYS,
          groups: {
            productOnly: ['noRank', 'collectedFrom', 'collectedTo'],
            collectOnly: ['shopAplus', 'brandShop', 'brandStore'],
          },
        });
      }
      // 过滤条件 → 命中数 (采集前预估 / 商品管理实时计数共用)
      // 实现: 直接复用 /api/products 的判定 —— 把同一个 filter 请求打到本机 /api/products 取 total,
      // 避免"计数"和"列表"两套判定各写一遍导致数字对不上 (原来这里只回了一句 hint, 是占位实现)
      if (p === '/api/filter/count' && req.method === 'GET') {
        const fraw = url.searchParams.get('filter');
        let f = null;
        try { f = normFilter(JSON.parse(fraw || '{}')); } catch (e) { f = null; }
        if (!f) return send(400, { error: 'filter 需为 JSON' });
        const qs = filterToQuery(f);
        qs.set('limit', '1');                       // 只需 total, 不传数据
        const got = await new Promise((resolve) => {
          http.get({ host: '127.0.0.1', port: PORT, path: '/api/products?' + qs.toString() }, (r) => {
            let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
          }).on('error', () => resolve(null));
        });
        if (!got) return send(500, { error: '计数失败' });
        return send(200, { total: got.total, active: filterActiveCount(f), query: qs.toString() });
      }
      // 过滤条件中文描述 (前端显示"当前过滤"; 与 filterDesc 同一份文案)
      if (p === '/api/filter/desc' && req.method === 'GET') {
        const fraw = url.searchParams.get('filter');
        let f = null;
        try { f = normFilter(JSON.parse(fraw || '{}')); } catch (e) { f = null; }
        if (!f) return send(400, { error: 'filter 需为 JSON' });
        return send(200, { desc: filterDescCanonical(f), active: filterActiveCount(f) });
      }

      // 用操作系统默认浏览器打开链接 (本机服务, 仅 http/https; 前端"外链/找货源"统一走这里)
      // 为什么需要: 网页里的 window.open 只会在 DSH 界面所在的浏览器/外壳里开标签,
      // 不一定是你本地的默认浏览器 → 由本机 Node 进程调用系统命令打开才叫"真·本地浏览器"
      if (p === '/api/open' && (req.method === 'GET' || req.method === 'POST')) {
        const target = String((req.method === 'GET' ? url.searchParams.get('url') : (j && j.url)) || '').trim();
        if (!/^https?:\/\//i.test(target)) return send(400, { error: '仅允许 http/https 链接' });
        try {
          const { spawn } = require('child_process');
          const isWin = process.platform === 'win32';
          // ⚠ Windows 坑 (已验证): spawn('cmd', ['/c','start','',url]) 时 Node 只给含空格/引号的参数加引号,
          //   URL 里的 & 不会被转义 → cmd.exe 把 & 当命令分隔符 →
          //   链接被"截断后照常打开"(用户看到开了页面, 其实查询参数全丢了), 且接口仍返回 200 → 静默失败。
          //   正确做法: windowsVerbatimArguments + 自己给整条命令加引号 (只加引号不够, Node 会转成 \" 反而更糟)。
          const args = isWin
            ? ['/c', 'start "" "' + target.replace(/"/g, '') + '"']
            : [target];
          const child = isWin
            ? spawn('cmd', args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true })
            : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', args, { detached: true, stdio: 'ignore' });
          child.on('error', () => {});
          child.unref();
          console.log('[open] 用系统默认浏览器打开:', target.slice(0, 120));
          return send(200, { ok: true, opened: target, via: isWin ? 'cmd start (verbatim)' : (process.platform === 'darwin' ? 'open' : 'xdg-open') });
        } catch (e) {
          return send(500, { error: e.message });
        }
      }

      // 找货源: 各平台以图搜图入口 (图片 URL 直通 / CDP 自动上传 / 关键词兜底)
      if (p === '/api/sources' && req.method === 'GET') {
        const asin = String(url.searchParams.get('asin') || '').trim();
        const prod = products.find((x) => x.asin === asin);
        const img = (prod && prod.mainImage) || '';
        const kw = prod ? String(prod.title || '').split(/[,，|—\-–]/)[0].trim().slice(0, 40) : '';
        const sites = SOURCE_SITES.map((s) => ({
          k: s.k, name: s.name, kind: s.kind, verified: s.verified || '',
          ready: s.kind === 'img-url' ? !!img : true,
          url: s.kind === 'img-url' && img ? s.url(img) : (s.kind === 'keyword' && kw ? s.keywordUrl(kw) : null),
          note: s.kind === 'img-url' ? (img ? '' : '该商品无主图 → 无法以图搜图') : (s.kind === 'keyword' ? '网页端无图搜, 用关键词' : '后端自动上传图片后搜索 (零人工)'),
        }));
        return send(200, { asin, hasImage: !!img, image: img, keyword: kw, group: { imgUrl: sites.filter((x) => x.kind === 'img-url'), cdp: sites.filter((x) => x.kind === 'cdp'), keyword: sites.filter((x) => x.kind === 'keyword') }, sites });
      }
      // 后端 CDP 自动上传图搜 (淘宝拍立淘等无 URL 接口的平台)
      if (p === '/api/sources/cdp-search' && req.method === 'POST') {
        const asin = String(j.asin || '').trim();
        const prod = products.find((x) => x.asin === asin);
        const img = String(j.imageUrl || (prod && prod.mainImage) || '');
        if (!img) return send(400, { error: '该商品无主图, 无法以图搜图' });
        if (collectProgress && collectProgress.running) return send(409, { error: '采集运行中, CDP 标签页被占用, 请稍后再试' });
        try {
          const out = await cdpImageSearch(String(j.site || 'taobao'), img, {});
          return send(200, out);
        } catch (e) {
          return send(500, { error: e.message });
        }
      }

      // 税率表: 手改 > 欧盟联网 > 内置表 (每项带来源与生效日期)
      if (p === '/api/tax/rates' && req.method === 'GET') {
        const f = path.join(DATA, 'tax-rates.json');
        let cache = {};
        try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
        const today = new Date().toISOString().slice(0, 10);
        let eu = cache.eu || null;
        if (!eu || eu.date !== today) {                  // 每日刷新一次欧盟 VAT
          const got = await fetchEuVat();
          if (got) { eu = got; cache.eu = eu; try { fs.writeFileSync(f, JSON.stringify(cache, null, 2)); } catch {} }
          else if (!eu) eu = null;
        }
        const overrides = cache.overrides || {};
        const sites = {};
        for (const k of Object.keys(TAX_TABLE)) sites[k] = taxForSite(k, overrides, eu && eu.sites, eu && eu.date);
        return send(200, { sites, eu: eu ? { date: eu.date, source: eu.source } : null, overrides, builtinNote: TAX_BUILTIN_NOTE, referralNote: REFERRAL_NOTE });
      }
      // 手动覆盖税率/币种含税口径
      if (p === '/api/tax/rates' && req.method === 'POST') {
        const f = path.join(DATA, 'tax-rates.json');
        let cache = {};
        try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
        cache.overrides = cache.overrides || {};
        const site = String(j.site || '').toLowerCase();
        if (!site) return send(400, { error: '需 site' });
        if (j.rate === '' || j.rate == null) delete cache.overrides[site];
        else {
          // 校验: 税率必须是 0-100 的数字 (旧实现把 "abc" 静默写成 null 还回 200 ok —— 会让用户以为设置成功了)
          const rate = Number(j.rate);
          if (!isFinite(rate) || rate < 0 || rate > 100) return send(400, { error: '税率必须是 0-100 之间的数字 (收到: ' + JSON.stringify(j.rate) + ')' });
          if (j.includesTax !== undefined && typeof j.includesTax !== 'boolean' && j.includesTax !== 1 && j.includesTax !== 0 && j.includesTax !== '1' && j.includesTax !== '0') {
            return send(400, { error: 'includesTax 需为 true/false' });
          }
          cache.overrides[site] = { rate: rate, includesTax: j.includesTax !== undefined ? !!j.includesTax : undefined, at: now() };
        }
        try { fs.writeFileSync(f, JSON.stringify(cache, null, 2)); } catch {}
        return send(200, { ok: true, site, override: cache.overrides[site] || null });
      }

      // 利润测算 (单一实现): body { asin, mode, supplyCny, shipCny, dutyCny, storageCny, otherCny, priceOverride, priceBasis, acos, returnRate, payRate, fxLoss, vatRate, commRate, fbaFee, targetMargin }
      if (p === '/api/profit/calc' && req.method === 'POST') {
        const prod = products.find((x) => x.asin === String(j.asin || ''));
        if (!prod) return send(404, { error: '商品不存在: ' + j.asin });
        const f = path.join(DATA, 'tax-rates.json');
        let cache = {};
        try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
        if (!cache.eu) { const got = await fetchEuVat(); if (got) { cache.eu = got; try { fs.writeFileSync(f, JSON.stringify(cache, null, 2)); } catch {} } }
        // 汇率: 复用 /api/rates 的逻辑 (取当日缓存/联网/兜底)
        let rateInfo = null;
        try {
          const rf = path.join(DATA, 'rates.json');
          let rc = {};
          try { rc = JSON.parse(fs.readFileSync(rf, 'utf8')); } catch {}
          const cur = prod.currency || siteCurrency(String(prod.site || 'uk'));
          if (rc.rates && rc.rates[cur] != null) rateInfo = { rate: rc.rates[cur], source: rc.source || 'cache', date: rc.date };
          else {
            const r2 = await fetch('https://open.er-api.com/v6/latest/CNY', { signal: AbortSignal.timeout(12000) });
            const d2 = await r2.json();
            if (d2 && d2.rates && d2.rates[cur] > 0) rateInfo = { rate: +(1 / d2.rates[cur]).toFixed(4), source: 'open.er-api.com', date: new Date().toISOString().slice(0, 10) };
          }
        } catch (e) { /* 汇率缺失 → computeProfit 会给 warning */ }
        const out = computeProfit(prod, j, cache.overrides || {}, cache.eu && cache.eu.sites, rateInfo, cache.eu && cache.eu.date);
        return send(200, out);
      }
      // 商品库批量重算佣金 (把硬编码 15% 换成按类目费率表; 返回改动数)
      if (p === '/api/products/recalc-fees' && req.method === 'POST') {
        let changed = 0;
        for (const x of products) {
          if (!(x.price > 0)) continue;
          const r = referralRateFor(x.cat1).rate / 100;
          const fee = Math.round(x.price * r * 100) / 100;
          if (x.referralFee !== fee) { x.referralFee = fee; changed++; }
          const stale = x.netProfit != null && x.netProfitOld !== true;   // 旧 netProfit 是硬编码公式产物, 标记为不可信
          if (stale) { x.netProfit = null; x.netProfitNote = '旧公式产物已清空; 用利润测算得到真实净利'; }
        }
        save('products.json', products);
        return send(200, { ok: true, changed, total: products.length });
      }

      // 类目层级树 (一级 → 二级 + 计数): 供"排除一级/二级类目"筛选使用
      // 数据来源: catSrc='bc' 面包屑真实层级 / 'bsr' 榜单类目推算 / 空 = 未采集
      if (p === '/api/products/cat-tree' && req.method === 'GET') {
        const map = new Map();
        for (const x of products) {
          const k = x.cat1 || '(未分类)';
          if (!map.has(k)) map.set(k, { cat1: k, count: 0, bc: 0, bsr: 0, children: new Map() });
          const node = map.get(k);
          node.count++;
          if (x.catSrc === 'bc') node.bc++;
          else if (x.catSrc === 'bsr') node.bsr++;
          if (x.cat2) node.children.set(x.cat2, (node.children.get(x.cat2) || 0) + 1);
        }
        const tree = [...map.values()]
          .map((n) => ({ cat1: n.cat1, count: n.count, bc: n.bc, bsr: n.bsr, children: [...n.children.entries()].map(([cat2, count]) => ({ cat2, count })).sort((a, b) => b.count - a.count) }))
          .sort((a, b) => b.count - a.count);
        const bc = products.filter((x) => x.catSrc === 'bc').length;
        const bsr = products.filter((x) => x.catSrc === 'bsr').length;
        return send(200, { total: products.length, sources: { bc, bsr, none: products.length - bc - bsr }, tree });
      }
      // ===== 存量数据派生字段修复 (纯计算, 不读页面, 秒级; 幂等可重复执行) =====
      // 背景: 早期采集器的几个已知缺陷在存量数据里留下了错值, 这里按"可判定的规则"修正, 判不了一律置空(不猜):
      //   R1 币种: 早期把非 uk/us 站点一律写成 EUR → 按站点真实币种纠正 (au→AUD, de→EUR…)
      //            priceSymbol 与新币种不符时置空 (不能出现"AU 站商品带着 € 符号")
      //   R2 主图: 早期存的是列表页缩略图 (_AC_SY300_/_SX342_ 等) → 按图片 ID 重建官方高清 _AC_SL1500_
      //   R3 最低价: minPrice > price 属自相矛盾 (多为早期插件面板的另一种币种) → 有报价明细就取最小值, 否则置空
      //   R4 A+: 早期把"空的 A+ 占位容器"判成有 A+ → 未核实(detailOk=false)的行一律置空(未核实), 不保留可能是假的 true
      //   R5 排名: rank 必须等于 BSR 里的最大排名 → 按 bsr 重算
      //   R6 假月销/假库存/假评分: 早期类目搜索采集模板写的是随机数 (标记: stock>0, 新模板恒为0) → 置空
      if (p === '/api/products/fix-derived' && req.method === 'POST') {
        const dryRun = j.dryRun !== false;                       // 默认只预演, 必须显式 dryRun:false 才落盘
        const stats = {};
        const samples = {};
        const bump = (rule, before, after) => {
          stats[rule] = stats[rule] || { n: 0, samples: [] };
          stats[rule].n++;
          if (stats[rule].samples.length < 6) stats[rule].samples.push({ asin: null, before: before, after: after });
        };
        const SYM_OF = { AUD: ['$', 'A$'], USD: ['$', 'US$'], GBP: ['£'], EUR: ['€'], JPY: ['¥'], CAD: ['$', 'C$'], INR: ['₹'], MXN: ['$', 'MX$'], BRL: ['R$'], SGD: ['S$'], PLN: ['zł'], SEK: ['kr'], TRY: ['₺'], AED: ['AED'], SAR: ['SAR'] };
        for (const x of products) {
          // R1 币种 + R7 币种符号
          const wantCur = SITE_CURRENCY[x.site];
          if (wantCur && x.currency && x.currency !== wantCur) {
            bump('R1币种', x.asin + ' site=' + x.site + ' ' + x.currency + '(' + x.price + ')', wantCur);
            if (!dryRun) x.currency = wantCur;
          }
          const cur2 = dryRun ? (wantCur || x.currency) : x.currency;
          if (x.priceSymbol && SYM_OF[cur2] && SYM_OF[cur2].indexOf(x.priceSymbol) < 0) {
            bump('R7币种符号', x.asin + ' cur=' + cur2 + ' 符号=' + x.priceSymbol, '(置空)');
            if (!dryRun) x.priceSymbol = null;
          }
          // R2 主图 (缩略图 → 官方高清)
          if (x.mainImage && !/_AC_SL1500_\.jpg/.test(x.mainImage)) {
            const m = String(x.mainImage).match(/\/images\/I\/([A-Za-z0-9%+_-]{5,})/);
            if (m) {
              const hi = 'https://m.media-amazon.com/images/I/' + m[1] + '._AC_SL1500_.jpg';
              bump('R2主图高清', x.asin + ' ' + String(x.mainImage).slice(-40), hi.slice(-40));
              if (!dryRun) x.mainImage = hi;
            }
          }
          // R3 最低价
          if (x.minPrice != null && x.price != null && x.minPrice > x.price + 0.01) {
            const vals = [x.price].concat((Array.isArray(x.offerPrices) ? x.offerPrices : []).map((o) => o && o.price).filter((v) => typeof v === 'number'));
            const next = vals.length > 1 ? Math.min.apply(null, vals) : null;
            bump('R3最低价', x.asin + ' minPrice ' + x.minPrice + ' > price ' + x.price, next == null ? '(置空)' : next);
            if (!dryRun) x.minPrice = next;
          }
          // R4 A+ 未核实
          if (x.aplus === true && x.detailOk !== true) {
            bump('R4A+置空', x.asin + ' aplus=true 但未核实', '(未核实 null)');
            if (!dryRun) x.aplus = null;
          }
          // R8 BSR 脏条目: 旧解析器把第 2 条之后的 BSR 行吞进类目名 (如 "Automotive) 12 in Dash-Mounted Holders 4")
          //    能把真实子条目挖回来的就挖回来, 挖不回来的一律丢弃 (绝不留假类目); 顺带丢掉 rank 不是有限正数的条目 (修 #NaN)
          if (Array.isArray(x.bsr) && x.bsr.length) {
            const fixed2 = [];
            const seen2 = {};
            for (const e of x.bsr) {
              const rk = Number(e && e.rank);
              const cat = String((e && e.category) || '').trim();
              if (!isFinite(rk) || rk <= 0) { bump('R8脏BSR', x.asin + ' rank=' + (e && e.rank) + ' 类目=' + cat, '(丢弃)'); continue; }
              const dirty = /\d+\s+in\s+[A-Za-z]/.test(cat) || /\)/.test(cat);
              if (dirty) {
                const subs = salvageBsrFragment(cat);
                if (subs.length) bump('R8脏BSR', x.asin + ' ' + cat, subs.map((s) => s.rank + ' ' + s.category).join(' + '));
                else bump('R8脏BSR', x.asin + ' rank=' + rk + ' 类目=' + cat, '(丢弃)');
                if (!dryRun) subs.forEach((s) => { const k = s.rank + '|' + s.category.toLowerCase(); if (!seen2[k]) { seen2[k] = 1; fixed2.push(s); } });
                continue;
              }
              const k = rk + '|' + cat.toLowerCase();
              if (seen2[k]) { bump('R8脏BSR', x.asin + ' 重复条目 ' + cat, '(去重)'); continue; }
              seen2[k] = 1;
              fixed2.push(isFinite(rk) ? { rank: rk, category: cat } : e);
            }
            // 截断残渣清理 (dryRun 也要能报告): 同一排名下短名是长名的前缀 → 短名是截断产物
            //   例: {"rank":1,"category":"Cell Phone Han"} vs {"rank":1,"category":"Cell Phone Handlebar Mounts"}
            const _dropped = {};
            for (const a of fixed2) {
              for (const b of fixed2) {
                if (a === b || a.rank !== b.rank) continue;
                const la = String(a.category).toLowerCase(), lb = String(b.category).toLowerCase();
                if (la !== lb && lb.indexOf(la) === 0) { _dropped[a.category] = 1; break; }
              }
            }
            const _cleaned = fixed2.filter((e) => !_dropped[e.category]);
            if (_cleaned.length !== fixed2.length) bump('R8截断残渣', x.asin + ' ' + Object.keys(_dropped).join('/'), '(丢弃)');
            if (!dryRun) { x.bsr = _cleaned; if (!_cleaned.length) x.rank = null; }
          }
          // R5 排名
          if (Array.isArray(x.bsr) && x.bsr.length) {
            const want = '#' + Math.max.apply(null, x.bsr.map((b) => b.rank));
            if (x.rank !== want) { bump('R5排名', x.asin + ' ' + x.rank, want); if (!dryRun) x.rank = want; }
          }
          // R6 早期类目搜索采集的随机月销/库存/评分 (标记 stock>0)
          if (x.stock > 0) {
            bump('R6假月销库存', x.asin + ' source=' + x.source + ' 月销' + x.monthlySales + ' 库存' + x.stock + ' 评分' + x.rating + '/' + x.reviews, '(月销/库存/评分置空)');
            if (!dryRun) {
              x.monthlySales = null; x.stock = 0;
              if (x.detailOk !== true && (x.reviews === 0 || x.reviews == null) && x.rating === 4) { x.rating = null; x.reviews = null; }
            }
          }
        }
        if (!dryRun) save('products.json', products);
        const out = Object.entries(stats).map(([k, v]) => ({ rule: k, count: v.n, samples: v.samples.map((s) => s.before + '  →  ' + s.after) }));
        return send(200, { dryRun, total: products.length, rules: out, totalFixed: out.reduce((s, r) => s + r.count, 0) });
      }

      // 用 BSR 榜单类目就地推出一级/二级类目 (不读页面, 秒级完成; 结果标记 catSrc='bsr')
      // 规则: 排名最大的 BSR 类目 = 最宽泛的一级; 排名最小的 = 最细的二级
      // 关键: 旧数据里部分 BSR 类目是列表页整句片段 ("Automotive) 328 in Car Headlight Assemblies"),
      //       这种必须丢弃 — 宁可标"未分类"也不写一个假类目
      if (p === '/api/products/derive-cat' && req.method === 'POST') {
        const force = !!(j && j.overwrite === true);
        const cleanCat = (s) => {
          const v = String(s || '').replace(/\s+/g, ' ').trim();
          if (!v || v.length > 45) return null;
          if (v === 'ListPage') return null;
          if (/[()]/.test(v)) return null;                 // 含括号 → 句子片段
          if (/\s+in\s+/i.test(v)) return null;            // "328 in Car Headlight" → 片段
          if (/\d/.test(v)) return null;                   // 含数字 → 排名残留
          if (/^(see|top|best|#)/i.test(v)) return null;
          if (!/[A-Za-z]/.test(v)) return null;
          return v.slice(0, 45);
        };
        let derived = 0, keptBc = 0, noBsr = 0;
        for (const x of products) {
          if (x.catSrc === 'bc' && !force) { keptBc++; continue; }
          const bs = (Array.isArray(x.bsr) ? x.bsr : [])
            .map((b) => (b && b.rank != null ? { rank: b.rank, category: cleanCat(b.category) } : null))
            .filter((b) => b && b.category);
          if (!bs.length) { noBsr++; continue; }
          const broad = bs.reduce((a, b) => (b.rank > a.rank ? b : a));
          const narrow = bs.reduce((a, b) => (b.rank < a.rank ? b : a));
          x.cat1 = broad.category;
          x.cat2 = narrow.category !== broad.category ? narrow.category : null;
          const parts = [broad.category];
          if (x.cat2) parts.push(x.cat2);
          if (x.category && x.category !== x.cat2 && x.category !== broad.category && x.category !== 'FollowShop') parts.push(x.category);
          x.catPath = parts.join(' > ').slice(0, 200);
          x.catSrc = 'bsr';
          x.catAt = now();
          derived++;
        }
        save('products.json', products);
        return send(200, { derived, keptBc, noBsr, total: products.length });
      }

      // 类目清单 (排除法筛选的数据源): 按商品库真实类目聚合 + 计数, 供前端勾选"要排除的类目"
      if (p === '/api/products/categories' && req.method === 'GET') {
        const q = url.searchParams;
        const limit = Math.min(500, Math.max(1, parseInt(q.get('limit') || '120', 10) || 120));
        const kw = String(q.get('q') || '').trim().toLowerCase();
        const cnt = new Map();
        for (const x of products) {
          const c = String(x.category || '').trim();
          if (!c) continue;
          if (kw && !c.toLowerCase().includes(kw)) continue;
          cnt.set(c, (cnt.get(c) || 0) + 1);
        }
        const items = [...cnt.entries()].map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count || a.cat.localeCompare(b.cat));
        return send(200, { total: items.length, limit, items: items.slice(0, limit) });
      }

      // 详情修复 / 类目补采 (存量修复): 重新打开详情页刷新 主图/价格/配送/自营/A+/主卖家/评分/类目层级/BSR/币种
      // body: { asins?, since?, limit?, needsDetail?, catOnly?, all? }
      if ((p === '/api/products/backfill-image' || p === '/api/products/refresh-detail') && req.method === 'POST') {
        // 注: body 已由顶层 req.on('end') 解析为 j, 这里直接用 j (不可再次监听 req)
        const catOnly = !!j.catOnly;
        if (!j.asins && !j.since && !j.all && !j.needsDetail && !catOnly) return send(400, { error: '需指定 asins 数组 / since 时间 / needsDetail=true / catOnly=true / all=true' });
        if (collectProgress && collectProgress.running) return send(409, { error: '已有采集正在运行 (mode=' + collectProgress.mode + '), 请先点「停止」等当前步骤结束后再开始' });
        beginCollectProgress(catOnly ? 'cat-backfill' : 'refresh-detail', catOnly ? '类目补采 (只读面包屑层级)' : '详情修复 (重读商品详情页)');
        try {
          const out = await cdpBackfillMainImage({ asins: j.asins, since: j.since, limit: j.limit, all: j.all, needsDetail: j.needsDetail, catOnly });
          endCollectProgress();
          pushNotify(catOnly ? '类目补采完成' : '详情修复完成', catOnly ? `补齐 ${out.fixed} 个商品的一级/二级/三级类目 (失败 ${out.failed} 个)` : `刷新 ${out.fixed} 个商品 (失败 ${out.failed} 个)`, `共处理 ${out.total} 个商品`);
          return send(200, { site: null, total: out.total, fixed: out.fixed, failed: out.failed, productCount: out.total, added: 0, products: out.results });
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
      }
      if (p === '/api/products' && req.method === 'GET') {
        // 支持两种入参: ① filter=<JSON>(统一过滤条件, 与采集过滤同一 schema) ② 传统散参数(兼容)
        const fraw = url.searchParams.get('filter');
        let fcanon = null;
        if (fraw) {
          try { fcanon = normFilter(JSON.parse(fraw)); } catch (e) { fcanon = null; }
        }
        const q = fcanon ? filterToQuery(fcanon) : url.searchParams;
        let list = [...products];
        if (q.get('risk')) list = list.filter((x) => x.aiRiskLevel === q.get('risk'));
        if (q.get('fba')) list = list.filter((x) => x.fulfill === q.get('fba'));
        if (q.get('sell') === 'amz') list = list.filter((x) => x.amazonSell);   // AMZ 自营
        if (q.get('sell') === 'third') list = list.filter((x) => !x.amazonSell); // 第三方卖家
        if (q.get('saved') === '1') list = list.filter((x) => x.saved);          // 只看已保存
        if (q.get('real') === '1') list = list.filter((x) => x.real);            // 只看真实采集
        // 自定义筛选: 区间(支持 "100-200" / "100-"(≥100) / "-200"(≤200)) + 阈值
        const parseRange = (v) => {
          if (!v || v.trim() === '') return null;
          const m = String(v).match(/([\d.]+)\s*[-~至]\s*([\d.]+)/); // "100-200" / "100~200" / "100至200"
          if (m) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
          const om = String(v).match(/^\s*([\d.]+)\s*[-~至]\s*$/);   // "5000-" → 仅下限
          if (om) return { min: parseFloat(om[1]), max: Infinity };
          const um = String(v).match(/^\s*[-~至]\s*([\d.]+)\s*$/);   // "-5000" → 仅上限
          if (um) return { min: -Infinity, max: parseFloat(um[1]) };
          return null;
        };
        // 价格区间: priceRange="100-200" (单框) 或兼容 priceMin/priceMax (取 minPrice 优先)
        const pv = (x) => (x.minPrice != null ? x.minPrice : x.price);
        const pr = parseRange(q.get('priceRange'));
        if (pr) { list = list.filter((x) => { const v = pv(x); return v != null && v >= pr.min && v <= pr.max; }); }
        else {
          if (q.get('priceMin') !== null && q.get('priceMin') !== '') list = list.filter((x) => pv(x) != null && pv(x) >= parseFloat(q.get('priceMin')));
          if (q.get('priceMax') !== null && q.get('priceMax') !== '') list = list.filter((x) => pv(x) != null && pv(x) <= parseFloat(q.get('priceMax')));
        }
        // 月销区间: salesRange="1000-5000" (单框) 或兼容 salesMin/salesMax
        const sr = parseRange(q.get('salesRange'));
        if (sr) { list = list.filter((x) => (x.monthlySales || 0) >= sr.min && (x.monthlySales || 0) <= sr.max); }
        else {
          if (q.get('salesMin') !== null && q.get('salesMin') !== '') list = list.filter((x) => x.monthlySales >= parseInt(q.get('salesMin'), 10));
          if (q.get('salesMax') !== null && q.get('salesMax') !== '') list = list.filter((x) => x.monthlySales <= parseInt(q.get('salesMax'), 10));
        }
        // 排名区间: rankRange="1000-500000" (统一 schema) 或 rankMax/rankMin (兼容)
        const rr = parseRange(q.get('rankRange'));
        const rankOf = (x) => (x.maxRank != null ? x.maxRank : (Array.isArray(x.bsr) && x.bsr.length ? Math.max(...x.bsr.map((b) => b.rank)) : null));
        if (rr) list = list.filter((x) => { const r = rankOf(x); return r != null && r >= rr.min && r <= rr.max; });
        else {
          if (q.get('rankMax') !== null && q.get('rankMax') !== '') { const rl = parseInt(q.get('rankMax'), 10); list = list.filter((x) => { const r = rankOf(x); return r != null && r <= rl; }); }
          if (q.get('rankMin') !== null && q.get('rankMin') !== '') { const rl = parseInt(q.get('rankMin'), 10); list = list.filter((x) => { const r = rankOf(x); return r != null && r >= rl; }); }
        }
        // 评分区间 / 评论数区间 / 跟卖数区间 (统一 schema 的 *Range; 兼容单边参数)
        const numRanges = [
          ['ratingRange', (x) => x.rating, 'ratingMin', 'ratingMax'],
          ['reviewsRange', (x) => x.reviews, 'reviewsMin', 'reviewsMax'],
          ['followRange', (x) => (x.followCount || 0), 'followMin', 'followMax'],
        ];
        for (const [rkey, get, kmin, kmax] of numRanges) {
          const r = parseRange(q.get(rkey));
          if (r) { list = list.filter((x) => { const v = get(x); return v != null && v >= r.min && v <= r.max; }); continue; }
          if (q.get(kmin) !== null && q.get(kmin) !== '') { const v0 = parseFloat(q.get(kmin)); list = list.filter((x) => { const v = get(x); return v != null && v >= v0; }); }
          if (q.get(kmax) !== null && q.get(kmax) !== '') { const v0 = parseFloat(q.get(kmax)); list = list.filter((x) => { const v = get(x); return v != null && v <= v0; }); }
        }
        // 商标数量: 必须用"排除"语义 (与面板文案/采集侧 applyCollectFilter 完全一致)
        //   坑: 旧实现把它当成"保留区间内" → 面板选"排除 ≥50"时, 商品库返回 0 条 (语义正好相反)
        {
          const r = parseRange(q.get('tmRange'));
          const tmin = r ? r.min : (q.get('tmMin') !== null && q.get('tmMin') !== '' ? parseFloat(q.get('tmMin')) : null);
          const tmax = r ? r.max : (q.get('tmMax') !== null && q.get('tmMax') !== '' ? parseFloat(q.get('tmMax')) : null);
          if (tmin != null || tmax != null) {
            list = list.filter((x) => {
              const v = x.trademarkCount || 0;
              if (tmin != null && tmax != null) return !(v >= tmin && v <= tmax);
              if (tmin != null) return !(v >= tmin);
              return !(v <= tmax);
            });
          }
        }
        // 上架天数区间 (新品): 用 firstAvailable 计算天数
        const nd = parseRange(q.get('newDaysRange'));
        if (nd) list = list.filter((x) => {
          const d = parseFirstAvailable(x.firstAvailable);
          if (!d) return false;
          const days = (Date.now() - d.getTime()) / 86400000;
          return days >= nd.min && days <= nd.max;
        });
        // 页面标识多选 (badges): 命中任一即可
        const badgesQ = String(q.get('badges') || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        if (badgesQ.length) list = list.filter((x) => badgesQ.some((b) => (b === 'A+' ? x.aplus === true : x.badge === b)));
        // 1688 同款 / 品牌状态 (与采集过滤同一语义)
        if (q.get('is1688') === '1') list = list.filter((x) => x.is1688 === true);
        else if (q.get('is1688') === '0') list = list.filter((x) => x.is1688 !== true);
        if (q.get('brandStatus') === 'registered') list = list.filter((x) => x.brandStatus !== 'registered');
        else if (q.get('brandStatus') === 'notfound') list = list.filter((x) => x.brandStatus === 'notfound');
        else if (q.get('brandStatus') === 'tm') list = list.filter((x) => !(x.tmMark || /TM|注册商标/.test(x.brandStatus || '')));
        // 商标国家排除: tmCountries=欧盟,美国 → 命中任一国家即剔除
        const tmCq = String(q.get('tmCountries') || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        if (tmCq.length) list = list.filter((x) => !(Array.isArray(x.tmCountries) && x.tmCountries.some((c) => tmCq.includes(c))));
        if (q.get('ratingMin') !== null && q.get('ratingMin') !== '') list = list.filter((x) => (x.rating || 0) >= parseFloat(q.get('ratingMin')));
        if (q.get('tmMax') !== null && q.get('tmMax') !== '') list = list.filter((x) => (x.trademarkCount || 0) <= parseInt(q.get('tmMax'), 10));
        if (q.get('followMin') !== null && q.get('followMin') !== '') list = list.filter((x) => (x.followCount || 0) >= parseInt(q.get('followMin'), 10)); // 跟卖数 ≥ N
        if (q.get('followMax') !== null && q.get('followMax') !== '') list = list.filter((x) => (x.followCount || 0) <= parseInt(q.get('followMax'), 10)); // 跟卖数 ≤ N
        // 无排名: noRank=1 (无 rank 且无 bsr 榜单数据)
        if (q.get('noRank') === '1') list = list.filter((x) => {
          const hasRank = !!(x.rank && x.rank !== '-' && x.rank !== 'null');
          const hasBsr = Array.isArray(x.bsr) && x.bsr.length > 0;
          return !hasRank && !hasBsr;
        });
        if (q.get('china') === '1') list = list.filter((x) => x.chinaSeller);
        if (q.get('china') === '0') list = list.filter((x) => !x.chinaSeller);
        // 站点: 支持多选 (逗号分隔, 如 "uk,us,de")
        if (q.get('site')) {
          const sites = q.get('site').split(',').map((s) => s.trim()).filter(Boolean);
          if (sites.length) list = list.filter((x) => sites.includes(x.site));
        }
        // 采集时间过滤 (精确到分钟): collectedFrom / collectedTo, 格式 "YYYY-MM-DD HH:MM"
        // collectedAt 存储为 "YYYY-MM-DD HH:MM:SS" → 字符串前缀比较即可 (同格式, 字典序=时间序)
        const collectedFrom = String(q.get('collectedFrom') || '').trim();
        const collectedTo = String(q.get('collectedTo') || '').trim();
        if (collectedFrom) list = list.filter((x) => String(x.collectedAt || '') >= collectedFrom);
        if (collectedTo) list = list.filter((x) => String(x.collectedAt || '') <= (collectedTo.length <= 16 ? collectedTo + ':59' : collectedTo));
        // 类目筛选 (排除法): categoryNot=关键词1,关键词2 → 命中即剔除 (大小写不敏感)
        // 匹配的是"全路径"(catPath 一级>二级>三级), 因此排除一级类目名可整枝排除
        if (q.get('categoryNot')) {
          const nv = String(q.get('categoryNot')).split(/[,，\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
          if (nv.length) list = list.filter((x) => {
            const c = String(x.catPath || '').toLowerCase() + ' | ' + String(x.category || '').toLowerCase();
            return !nv.some((k) => c.includes(k));
          });
        }
        // 类目: 包含匹配 (正选, 兼容保留)
        if (q.get('category')) {
          const cv = q.get('category').toLowerCase();
          list = list.filter((x) => String(x.category || '').toLowerCase().includes(cv));
        }
        if (q.get('badge')) list = list.filter((x) => x.badge === q.get('badge'));          // bestseller / choice / deal
        // A+ 页面筛选: aplus=1 仅有 A+ / aplus=0 排除 A+ (与采集过滤同语义)
        if (q.get('aplus') === '1') list = list.filter((x) => x.aplus);
        else if (q.get('aplus') === '0') list = list.filter((x) => !x.aplus);
        if (q.get('q')) { const s = q.get('q').toLowerCase(); list = list.filter((x) => x.title.toLowerCase().includes(s) || x.asin.toLowerCase().includes(s)); }
        if (q.get('compliance')) {
          // 模拟采集时实时合规检测结果
          list = list.map((x) => ({ ...x, compliance: complianceCheck(x) }));
        }
        // 分页: 以前 limit / offset 被完全忽略 (传 limit=60 也会返回全库 4MB) —— 对接方会以为拿到了前 60 条
        // 现在: 不传 limit → 仍返回全部 (插件就是靠这个拿全量做本地筛选, 保持兼容);
        //       传了 limit → 按 limit/offset 切片, 并把 total(符合条件总数)/returned(本次返回数) 都回给调用方
        // 分页: 必须从原始 URL 参数读 (q 在带 filter= 时是过滤条件换算出来的查询串, 里面没有 limit)
        const limitRaw = url.searchParams.get('limit');
        const offsetRaw = url.searchParams.get('offset');
        const totalAll = list.length;
        let returned = totalAll, offUsed = 0;
        if (limitRaw !== null && limitRaw !== '' && !isNaN(parseInt(limitRaw, 10))) {
          const lim = Math.min(5000, Math.max(1, parseInt(limitRaw, 10)));
          offUsed = (offsetRaw !== null && offsetRaw !== '' && !isNaN(parseInt(offsetRaw, 10))) ? Math.max(0, parseInt(offsetRaw, 10)) : 0;
          list = list.slice(offUsed, offUsed + lim);
          returned = list.length;
        }
        return send(200, { total: totalAll, returned, offset: offUsed, items: list });
      }

      // 面板补全更新 (对已入库商品重新读插件面板, 全程 CDP, 修正品牌/商标/排名/销量)
      if (p === '/api/products/panel-refresh' && req.method === 'POST') {
        let asins = (j.asins || []);
        // 未指定时默认处理品牌链采集的 cdp-brand 商品
        if (!asins.length) asins = products.filter((x) => x.source === 'cdp-brand').map((x) => x.asin);
        if (!asins.length) return send(200, { updated: 0, note: '没有需要补全的商品' });
        let updated = 0, failed = 0;
        try {
          const tabs = await cdpGetTabs();
          const page = tabs.find((t) => t.type === 'page');
          if (!page) return send(500, { error: 'Edge 无页面标签, 请确认 9222 已开' });
          const { send } = await cdpConnect(page.webSocketDebuggerUrl);
          const sample = products.find((x) => x.asin === asins[0]);
          const site = sample ? sample.site : 'uk';
          const domain = site === 'uk' ? 'co.uk' : site === 'us' ? 'com' : site;
          for (let i = 0; i < asins.length; i++) {
            const asin = asins[i];
            const pd = await cdpReadOnePanel(send, asin, domain).catch((e) => ({ error: 'CDP异常: ' + e.message }));
            const prod = products.find((x) => x.asin === asin);
            if (!prod) continue;
            if (pd.error) { failed++; continue; }
            // 更新商品字段 (以插件面板为准)
            const tm = pd.tmText || '';
            prod.brand = pd.brand || prod.brand;
            prod.brandStatus = /已注册|已备案/.test(tm) ? 'registered' : /未查到/.test(tm) ? 'notfound' : /注册商标/.test(tm) ? 'unchecked' : prod.brandStatus;
            prod.trademarkCount = pd.trademarkCount || prod.trademarkCount;
            prod.tmMark = /TM|注册商标/.test(tm);
            prod.fulfill = pd.fulfill || prod.fulfill;
            prod.followCount = pd.sellerCount != null ? pd.sellerCount : prod.followCount;
            prod.sellerId = pd.seller || prod.sellerId;
            prod.monthlySales = pd.sales30d ? parseInt(String(pd.sales30d).replace(/[<>\s]/g, ''), 10) || prod.monthlySales : prod.monthlySales;
            prod.size = pd.size || prod.size;
            prod.weight = pd.weight || prod.weight;
            prod.packSize = pd.packSize || prod.packSize;
            prod.packWeight = pd.packWeight || prod.packWeight;
            prod.color = pd.color || prod.color;
            prod.variantSize = pd.variantSize || prod.variantSize;
            prod.fbaFee = pd.fbaFee || prod.fbaFee;
            prod.productType = pd.productType || prod.productType;
            prod.listedAt = (pd.listedAt || '').slice(0, 10) || prod.listedAt;
            prod.bsr = pd.bsr && pd.bsr.length ? pd.bsr : prod.bsr;
            prod.aiRiskLevel = prod.brandStatus === 'registered' ? 'high' : prod.trademarkCount > 0 ? 'medium' : 'low';
            prod.aiScore = Math.round(Math.min(96, Math.max(25, 80 - prod.trademarkCount * 0.8 - (prod.brandStatus === 'registered' ? 20 : 0))));
            prod.panelRefreshedAt = now();
            updated++;
          }
          save('products.json', products);
          pushNotify('面板补全完成', `修正 ${updated} 个商品插件数据 (全程CDP)`, `品牌/商标/排名/销量已更新, 失败 ${failed} 个`);
          return send(200, { updated, failed, total: products.length });
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
      }

      // 批量删除商品
      if (p === '/api/products/delete' && req.method === 'POST') {
        const asins = j.asins || [];
        const before = products.length;
        products = products.filter((x) => !asins.includes(x.asin));
        save('products.json', products);
        return send(200, { deleted: before - products.length, remain: products.length });
      }

      // 一键清空商品库 (显式用户操作, 允许写空 force=true)
      if (p === '/api/products/clear' && req.method === 'POST') {
        const before = products.length;
        products = [];
        save('products.json', products, true);
        return send(200, { cleared: before, remain: 0 });
      }

      // 重置商品库 (恢复种子数据)
      if (p === '/api/products/reset' && req.method === 'POST') {
        try {
          const seedFile = path.join(ROOT, '_tools', '_build_demo_data.js');
          const code = fs.readFileSync(seedFile, 'utf8');
          // 在子进程中执行生成器 (独立 require 缓存, 避免污染)
          const { execFileSync } = require('child_process');
          execFileSync(process.execPath, [seedFile], { stdio: 'ignore', windowsHide: true });
          products = load('products.json', []);
          return send(200, { reset: true, total: products.length });
        } catch (e) {
          // 子进程被沙箱拦截时, 直接内联执行生成逻辑
          try {
            const seedFile = path.join(ROOT, '_tools', '_build_demo_data.js');
            delete require.cache[require.resolve(seedFile)];
            require(seedFile);
            products = load('products.json', []);
            return send(200, { reset: true, total: products.length, mode: 'inline' });
          } catch (e2) {
            return send(500, { error: '重置失败: ' + e2.message });
          }
        }
      }

      // 保存/取消保存商品 (产品库收藏)
      if (p === '/api/products/save' && req.method === 'POST') {
        const asins = j.asins || [];
        let n = 0;
        products.forEach((x) => { if (asins.includes(x.asin)) { x.saved = j.saved !== false; n++; } });
        save('products.json', products);
        return send(200, { saved: n, state: j.saved !== false });
      }

      // 批量同步 (模拟重新采集刷新: 更新采集时间/价格/月销)
      if (p === '/api/products/sync' && req.method === 'POST') {
        const asins = j.asins || products.map((x) => x.asin);
        let n = 0;
        products.forEach((x) => {
          if (asins.includes(x.asin)) {
            x.collectedAt = now();
            x.price = Math.round((x.price * (0.95 + Math.random() * 0.1)) * 100) / 100;
            x.monthlySales = Math.round(x.monthlySales * (0.9 + Math.random() * 0.2));
            x.followCount = Math.max(0, x.followCount + (Math.random() < 0.4 ? 1 : 0));
            n++;
          }
        });
        save('products.json', products);
        return send(200, { synced: n });
      }

      // 店铺 → 详情页插件面板采集 (核心: FBM/商标/排名 来自插件内部信息)
      if (p === '/api/collect/panel' && req.method === 'POST') {
        const url = j.url || '';
        if (!/^https:\/\/www\.amazon\./.test(url)) return send(400, { error: '无效的 amazon 店铺 URL' });
        const count = Math.min(20, Math.max(1, j.count || 5));
        let out;
        try {
          out = await cdpPanelCollect(url, count);
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        const site = out.site;
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        const imported = [];
        for (const it of out.results) {
          if (it.error || used.has(it.asin)) continue;
          used.add(it.asin);
          const price = Math.round((399 + Math.random() * 4000)) / 100;
          const item = {
            id: it.asin, asin: it.asin, rank: null, title: it.title || '', brand: it.brand || 'Unknown',
            brandStatus: it.brandStatus === '已备案' ? 'registered' : it.brandStatus && it.brandStatus !== '未查到' ? 'unchecked' : 'notfound',
            bgMark: false, tmMark: /TM/.test(it.brandStatus || ''), patentRisk: false,
            trademarkCount: (it.brandStatus || '').match(/(\d+)/) ? parseInt((it.brandStatus || '').match(/(\d+)/)[1], 10) : 0,
            followCount: it.sellerCount || 0, chinaSeller: false,
            fulfill: it.fulfill || 'FBM', amazonSell: false,
            price, currency, monthlySales: parseInt(it.sales30d || '0', 10) || Math.floor(50 + Math.random() * 1000),
            reviews: 0, rating: 4, stock: Math.floor(Math.random() * 600),
            listedAt: (it.listedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
            size: it.size, weight: it.weight, variations: 0,
            referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
            site, category: 'Shop', collectedAt: now(), source: 'cdp-panel', saved: false, real: true,
            sellerId: it.seller, bsr: it.bsr || [], fbaFee: it.fbaFee || null, productType: it.productType || null,
          };
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 + Math.random() * 10)));
          item.aiRiskLevel = it.brandStatus === '已备案' ? 'high' : it.brandStatus && it.brandStatus !== '未查到' ? 'medium' : 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
          imported.push(item);
        }
        save('products.json', products);
        pushNotify('插件面板采集完成', `读取 ${out.results.length} 个商品插件面板, 新增 ${added} 个`, `来源: 智赢插件内部信息 (FBM/商标/排名)`);
        return send(200, { added, total: products.length, site, results: out.results, imported: imported.map((x) => ({ asin: x.asin, brand: x.brand, brandStatus: x.brandStatus, fulfill: x.fulfill, sales30d: x.monthlySales, bsr: x.bsr })) });
      }

      // 列表页直采 (不跳详情页): 直接读列表页所有商品 + 智赢插件注入信息 (FBA/卖家数/排名/1688同款)
      if (p === '/api/collect/list-direct' && req.method === 'POST') {
        const url = String(j.url || '').trim();
        if (!/^https:\/\/(www\.)?amazon\./.test(url)) return send(400, { error: '无效的 amazon 列表页 URL' });
        const maxItems = Math.min(200, Math.max(1, j.maxItems || 100));
        const maxPages = Math.min(10, Math.max(1, j.maxPages || 1));   // 列表页翻页 (一次采多页)
        const waitPluginMs = Math.min(30000, Math.max(0, j.waitPluginMs != null ? j.waitPluginMs : 15000));
        let out;
        try {
          out = await cdpListDirectCollect(url, { maxItems, maxPages, waitPluginMs });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 通知
        const withPlugin = out.products.filter((x) => x.fulfill || x.sellerCount != null || (x.bsr && x.bsr.length)).length;
        pushNotify('列表页直采完成', `${out.pagesDone || 1} 页共 ${out.total} 个商品, 新增 ${out.added} 个`, `插件信息(FBA/卖家数/排名)覆盖 ${withPlugin}/${out.productCount} 个 | 价格被插件替换为人民币, 未入库原生价`);
        return send(200, { site: out.site, url, maxPages, pagesDone: out.pagesDone, total: out.total, productCount: out.productCount, added: out.added, withPlugin, products: out.products });
      }

      // 列表页筛选采集: 列表页直采(含插件信息) → 采集筛选前置过滤 → 只跳转通过筛选的商品取详情页数据
      if (p === '/api/collect/list-filtered' && req.method === 'POST') {
        const url = String(j.url || '').trim();
        if (!/^https:\/\/(www\.)?amazon\./.test(url)) return send(400, { error: '无效的 amazon 列表页 URL' });
        const maxItems = Math.min(200, Math.max(1, j.maxItems || 100));
        const maxPages = Math.min(10, Math.max(1, j.maxPages || 1));
        const waitPluginMs = Math.min(30000, Math.max(0, j.waitPluginMs != null ? j.waitPluginMs : 15000));
        const filter = buildCollectFilter(j);
        const withAod = j.aod !== false;
        const withPanel = j.panel !== false;   // 详情补全默认读插件面板 (商标数/商标国家), panel=false 关闭
        let out;
        try {
          out = await cdpListFilteredCollect(url, { maxItems, maxPages, waitPluginMs, filter, aod: withAod, panel: withPanel });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        pushNotify('列表页筛选采集完成', `${out.total} 个 → 前置筛掉 ${out.skippedByList} 个 → 跳详情 ${out.enriched} 个 → 入库 ${out.added} 个`, `过滤: ${filterDesc(filter)}${out.preFiltered ? ', 前置筛选(插件FBA/排名/关键词)通过 ' + out.preFiltered + ' 个' : ''}${withAod ? ', 已采 aod 跟卖' : ''}`);
        return send(200, { site: out.site, url, maxPages, total: out.total, preFiltered: out.preFiltered, skippedByList: out.skippedByList, enriched: out.enriched, productCount: out.productCount, added: out.added, filter, aod: withAod, products: out.products });
      }

      // 类目搜索采集 (关键词/类目搜索页 → 商品列表, 全程 CDP)
      if (p === '/api/collect/category' && req.method === 'POST') {
        const site = j.site || 'de';
        const keyword = (j.keyword || '').trim();
        const category = (j.category || '').trim();
        if (!keyword && !category) return send(400, { error: '请输入关键词或类目' });
        const maxPages = Math.min(10, Math.max(1, j.maxPages || 2));
        const filter = buildCollectFilter(j);
        let out;
        try {
          out = await cdpCategoryCollect({ site, keyword, category, maxPages, filter });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        const currency = siteCurrency(site);   // 按站点币种 (AU→AUD, MX→MXN…), 不再一律 EUR
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        for (const p of out.products) {
          if (used.has(p.asin)) continue;
          used.add(p.asin);
          const price = parseFloat(String(p.price).replace(/[^0-9.,]/g, '').replace(',', '.')) || Math.round((399 + Math.random() * 3000)) / 100;
          const pBsr2 = (Array.isArray(p.bsr) ? p.bsr : []).map((b) => (typeof b === 'number' ? { rank: b, category: 'ListPage' } : (b && b.rank != null ? b : null))).filter(Boolean);
          const maxR = pBsr2.length ? Math.max.apply(null, pBsr2.map((b) => b.rank)) : null;
          const item = {
            id: p.asin, asin: p.asin, rank: maxR != null ? '#' + maxR : null, title: p.title, brand: p.brand || 'Unknown',
            brandStatus: 'unchecked', bgMark: false, tmMark: !!p.tmMark, patentRisk: false, trademarkCount: p.trademarkCount || 0,
            followCount: 0, chinaSeller: false,
            // 详情页补全后的真实值 (未读到一律 null, 不再写死 FBM / 4 分 / 随机月销)
            fulfill: p.fulfill || null, amazonSell: p.detailOk ? !!p.amazonSell : null, mainSeller: p.mainSeller || null,
            mainImage: p.mainImage || null, aplus: p.detailOk ? !!p.aplus : null,
            detailOk: !!p.detailOk, detailAt: p.detailAt || null, priceSymbol: p.priceSymbol || null,
            cat1: p.cat1 || null, cat2: p.cat2 || null, cat3: p.cat3 || null, catPath: p.catPath || null,
            catNodes: p.catNodes || null, catSrc: p.catPath ? 'bc' : null,
            tmCountries: p.tmCountries || [], tmText: p.tmText || null,
            price, currency, monthlySales: p.monthlySales || 0,
            reviews: p.reviews != null ? p.reviews : null, rating: p.rating != null ? p.rating : null, stock: 0,
            listedAt: (p.firstAvailable || '').slice(0, 10) || null, size: p.size || null, weight: p.weight || null, variations: 0,
            bsr: pBsr2,
            referralFee: Math.round(price * (referralRateFor(p.cat1).rate / 100) * 100) / 100, netProfit: null,
            site, category: p.category || category || 'Search', collectedAt: now(), source: 'category-search', saved: false, real: true, badge: p.badge || null,
          };
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(40 + Math.random() * 55);
          item.aiRiskLevel = 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
        }
        save('products.json', products);
        pushNotify('类目搜索采集完成', `「${keyword || category}」搜索页抓取 ${out.products.length} 个${out.skipped ? ', 过滤跳过 ' + out.skipped + ' 个' : ''}`, `新增 ${added} 个 (站点: ${site}, 全程CDP, 过滤: ${filterDesc(filter)})`);
        return send(200, { added, total: products.length, site, productCount: out.products.length, skipped: out.skipped || 0, filter, keyword, category });
      }

      // 并行整站采集: 一次并行打开 N 个搜索页, 聚合大量商品 (不翻页, 耗时≈单页加载)
      if (p === '/api/collect/site-bulk' && req.method === 'POST') {
        const site = j.site || 'de';
        const keyword = (j.keyword || '').trim();
        const category = (j.category || '').trim();
        if (!keyword && !category) return send(400, { error: '请输入关键词或类目' });
        const pages = Math.min(10, Math.max(1, j.pages || 5));
        const maxItems = Math.min(100, Math.max(1, j.maxItems || 50));
        const withDetail = j.detail !== false;
        const filter = buildCollectFilter(j);
        let out;
        try {
          out = await cdpSiteBulkCollect({ site, keyword, category, pages, maxItems, detail: withDetail, filter });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        if (!out.products.length) return send(404, { error: '未提取到商品 (可能需登录或页面结构变化)' });
        // 入库
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        for (const p of out.products) {
          if (used.has(p.asin)) continue;
          used.add(p.asin);
          const price = (p.price != null && !isNaN(p.price)) ? p.price : (parseFloat(String(p.price || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || null);
          const item = {
            id: p.asin, asin: p.asin, rank: null, title: p.title, brand: p.brand || 'Unknown',
            brandStatus: 'unchecked', bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
            followCount: 0, chinaSeller: false, fulfill: p.fulfill || 'FBM', amazonSell: false,
            price: price != null ? price : Math.round((399 + Math.random() * 3000)) / 100, currency,
            monthlySales: 0, reviews: 0, rating: (typeof p.rating === 'number' ? p.rating : (parseFloat(String(p.rating || '').match(/[\d.]+/)?.[0]) || 4)), stock: 0,
            listedAt: new Date().toISOString().slice(0, 10), size: null, weight: null, variations: 0,
            badge: p.badge || null, aplus: p.aplus || false, bsr: (p.bsr || []).map((r) => ({ rank: r, category: 'ListPage' })),
            rank: p.bsr && p.bsr.length ? '#' + Math.max(...p.bsr) : null,
            referralFee: 0, netProfit: 0,
            site, category: category || keyword || 'Search', collectedAt: now(), source: 'site-bulk', saved: false, real: true,
          };
          item.referralFee = Math.round(item.price * 0.15 * 100) / 100;
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5)));
          item.aiRiskLevel = 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
        }
        save('products.json', products);
        pushNotify('并行整站采集完成', `「${keyword || category}」${pages} 页并行, 抓取 ${out.products.length} 个${out.skipped ? ', 过滤跳过 ' + out.skipped + ' 个' : ''}`, `新增 ${added} 个 (站点: ${site}, 耗时≈单页, 全程CDP, 过滤: ${filterDesc(filter)})`);
        return send(200, { added, total: products.length, site, pages, productCount: out.products.length, skipped: out.skipped || 0, filter, keyword, category, withDetail });
      }

      // 类目菜单导航采集: 首页 → 大类目 → 二级类目 → See all results → 商品 (全程 CDP)
      if (p === '/api/collect/category-menu' && req.method === 'POST') {
        const site = j.site || 'de';
        const category = (j.category || '').trim();
        const pages = Math.min(10, Math.max(1, j.pages || 3));
        const maxItems = Math.min(100, Math.max(1, j.maxItems || 50));
        const withDetail = j.detail !== false;
        // 采集过滤: 与列表自定义筛选同条件 (配送/A+/排名/价格/评分/评论/关键词/标签/类目/站点)
        const filter = buildCollectFilter(j);
        let out;
        try {
          out = await cdpCategoryMenuCollect({ site, category, pages, maxItems, detail: withDetail, filter });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        if (!out.products.length) return send(404, { error: '未提取到商品 (或过滤后无符合条件的商品)' });
        // 入库
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        for (const p of out.products) {
          if (used.has(p.asin)) continue;
          used.add(p.asin);
          const price = (p.price != null && !isNaN(p.price)) ? p.price : (parseFloat(String(p.price || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || null);
          const item = {
            id: p.asin, asin: p.asin, rank: null, title: p.title, brand: p.brand || 'Unknown',
            brandStatus: 'unchecked', bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
            followCount: 0, chinaSeller: false, fulfill: p.fulfill || 'FBM', amazonSell: false,
            price: price != null ? price : Math.round((399 + Math.random() * 3000)) / 100, currency,
            monthlySales: 0, reviews: p.reviews || 0, rating: (typeof p.rating === 'number' ? p.rating : (parseFloat(String(p.rating || '').match(/[\d.]+/)?.[0]) || 4)), stock: 0,
            listedAt: new Date().toISOString().slice(0, 10), size: null, weight: null, variations: 0,
            badge: null, aplus: p.aplus || false,
            bsr: (p.bsr || []).map((r) => ({ rank: r, category: 'ListPage' })),
            rank: p.bsr && p.bsr.length ? '#' + Math.max(...p.bsr) : null,
            referralFee: 0, netProfit: 0,
            site, category: category || 'Browse', collectedAt: now(), source: 'category-menu', saved: false, real: true,
          };
          item.referralFee = Math.round(item.price * 0.15 * 100) / 100;
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5)));
          item.aiRiskLevel = 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
        }
        save('products.json', products);
        pushNotify('类目菜单采集完成', `${(out.steps || []).join(' → ')}`, `抓取 ${out.products.length} 个, 过滤跳过 ${out.skipped || 0} 个, 新增 ${added} 个 (站点: ${site}, 全程CDP)`);
        return send(200, { added, total: products.length, site, pages, productCount: out.products.length, skipped: out.skipped || 0, category, steps: out.steps, filter });
      }

      // 详情页品牌跳转采集 (商品详情页 → 品牌链接 → 品牌全部商品, 全程 CDP)
      if (p === '/api/collect/dp-brand' && req.method === 'POST') {
        const url = j.url || '';
        if (!/^https:\/\/www\.amazon\./.test(url)) return send(400, { error: '无效的 amazon 商品详情页 URL' });
        const maxPages = Math.min(20, Math.max(1, j.maxPages || 5));
        let out;
        try {
          out = await cdpDpBrand(url, maxPages);
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        const site = out.site;
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        const imported = [];
        for (const p of out.products) {
          if (used.has(p.asin)) continue;
          used.add(p.asin);
          const price = parseFloat(String(p.price).replace(/[^0-9.,]/g, '').replace(',', '.')) || Math.round((399 + Math.random() * 3000)) / 100;
          const item = {
            id: p.asin, asin: p.asin, rank: null, title: p.title, brand: out.brandName || 'Unknown',
            brandStatus: 'unchecked', bgMark: false, tmMark: false, patentRisk: false, trademarkCount: 0,
            followCount: 0, chinaSeller: false, fulfill: 'FBM', amazonSell: false,
            price, currency, monthlySales: Math.floor(50 + Math.random() * 800),
            reviews: 0, rating: 4, stock: Math.floor(Math.random() * 500),
            listedAt: new Date().toISOString().slice(0, 10), size: null, weight: null, variations: 0,
            referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
            site, category: 'Shop', collectedAt: now(), source: 'dp-brand', saved: false, real: true,
            brandStore: out.brandName, brandLink: out.brandLink,
          };
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(40 + Math.random() * 55);
          item.aiRiskLevel = 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
          imported.push(item);
        }
        save('products.json', products);
        pushNotify('详情页品牌采集完成', `「${out.brandName}」品牌页抓取 ${out.products.length} 个商品`, `新增 ${added} 个 (全程CDP)`);
        return send(200, { added, total: products.length, site, brandName: out.brandName, productCount: out.products.length, brandLink: out.brandLink, items: imported.map((x) => ({ asin: x.asin, title: x.title.slice(0, 60), price: x.price })) });
      }

      // 品牌链采集 (店铺 → 品牌店 → 品牌全部商品, 全程 CDP + 插件面板)
      if (p === '/api/collect/brand' && req.method === 'POST') {
        const url = j.url || '';
        if (!/^https:\/\/www\.amazon\./.test(url)) return send(400, { error: '无效的 amazon 店铺 URL' });
        const maxBrands = Math.min(10, Math.max(1, j.maxBrands || 2));
        const maxPages = Math.min(20, Math.max(1, j.maxPages || 3));
        const withPanel = j.panel !== false;              // 默认开启插件面板补全 (全程 CDP)
        const panelLimit = Math.min(30, Math.max(0, j.panelLimit || 5)); // 每品牌面板补全数量
        let out;
        try {
          out = await cdpBrandChain(url, maxBrands, maxPages, withPanel, panelLimit);
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
        const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        let panelOk = 0, panelFail = 0;
        const perBrand = [];
        for (const br of out.brands) {
          let brandAdded = 0;
          for (const p of br.products) {
            if (used.has(p.asin)) continue;
            used.add(p.asin);
            const pd = p.panel || {};
            const price = parseFloat(String(p.price).replace(/[^0-9.,]/g, '').replace(',', '.')) || Math.round((399 + Math.random() * 3000)) / 100;
            // 品牌优先用插件面板的真实品牌
            const brandName = pd.brand || br.name.replace(/ (flagship store|store)$/i, '') || 'Unknown';
            const tm = pd.tmText || '';
            const brandStatus = /已注册|已备案/.test(tm) ? 'registered' : /未查到/.test(tm) ? 'notfound' : /注册商标/.test(tm) ? 'unchecked' : null;
            const item = {
              id: p.asin, asin: p.asin, rank: null, title: p.title, brand: brandName,
              brandStatus: brandStatus || 'unchecked', bgMark: false, tmMark: /TM|注册商标/.test(tm), patentRisk: false,
              trademarkCount: pd.trademarkCount || 0,
              followCount: pd.sellerCount || 0, chinaSeller: false, fulfill: pd.fulfill || 'FBM', amazonSell: false,
              price, currency, monthlySales: pd.sales30d ? parseInt(String(pd.sales30d).replace(/[<>\s]/g, ''), 10) || 0 : Math.floor(50 + Math.random() * 800),
              reviews: 0, rating: 4, stock: Math.floor(Math.random() * 500),
              listedAt: (pd.listedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
              size: pd.size || null, weight: pd.weight || null, packSize: pd.packSize || null, packWeight: pd.packWeight || null,
              color: pd.color || null, variantSize: pd.variantSize || null,
              fbaFee: pd.fbaFee || null, productType: pd.productType || null, sellerId: pd.seller || null,
              bsr: pd.bsr || [], variations: 0,
              referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
              site, category: 'Shop', collectedAt: now(), source: 'cdp-brand', saved: false, real: true,
              brandStore: br.name, brandStoreUrl: br.spUrl, panelSource: withPanel,
            };
            item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
            item.aiScore = Math.round(Math.min(96, Math.max(25, 80 - item.trademarkCount * 0.8 - (brandStatus === 'registered' ? 20 : 0) + Math.random() * 10)));
            item.aiRiskLevel = brandStatus === 'registered' ? 'high' : item.trademarkCount > 0 ? 'medium' : 'low';
            item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
            products.unshift(item);
            added++;
            brandAdded++;
            if (pd.error) panelFail++; else if (pd.brand || pd.bsr) panelOk++;
          }
          perBrand.push({ brand: br.name, spUrl: br.spUrl, productCount: br.products.length, added: brandAdded, panelOk, panelFail });
        }
        save('products.json', products);
        pushNotify('品牌链采集完成', `店铺 ${out.shopCount} 个商品 → ${out.brands.length} 个品牌`, `品牌商品 ${out.totalProducts} 个, 新增 ${added} 个, 插件面板 ${panelOk} 成功/${panelFail} 失败 (全程CDP)`);
        return send(200, { added, total: products.length, site, shopCount: out.shopCount, brands: perBrand, totalBrandProducts: out.totalProducts, panelOk, panelFail, panel: withPanel });
      }

      // 批量品牌采集: 从商品库商品的品牌出发 → 品牌跳转链接 → 品牌全部商品 → 采集筛选 → 详情补全 → 入库
      // 阶段1 (零成本, 不请求网页): 按品牌把商品库去重成一串品牌线索 (每品牌 1 个代表商品)
      // 阶段2 (CDP): 代表商品详情页 → 品牌跳转链接 → 品牌页列表 (+翻页, 列表可判条件先预筛)
      // 阶段3 (CDP): 通过预筛的候选逐个读完整详情页 → 品牌名校验 → 统一采集筛选 → 每品牌保留 maxPerBrand 个
      // 采集筛选与「类目搜索采集」完全同一套 (canonical filter → canonicalToCollectFilter → applyCollectFilter)
      if (p === '/api/collect/brand-batch' && req.method === 'POST') {
        const site = String(j.site || 'au').toLowerCase();
        const filter = buildCollectFilter(j);
        const brandsLimit = Math.min(20, Math.max(1, j.brandsLimit || 2));       // 自动挑品牌时的品牌数
        const maxPerBrand = Math.min(50, Math.max(1, j.maxPerBrand || 5));      // 每个品牌入库数量上限
        const maxPages = Math.min(10, Math.max(1, j.maxPages || 2));            // 每个品牌翻页数
        const withPanel = j.panel === true || j.panel === 1 || j.panel === '1' || j.panel === 'true';
        // 品牌名 → 分组键 (把 "Visit the Lamicall Store" / "Lamicall" 归到同一品牌)
        const brandKey = (b) => normBrandName(b);
        // 阶段1: 选线索 — ① 显式 asins ② 显式 brands ③ 自动: 按品牌分组取前 N 个品牌
        // 线索质量是这一步的关键: 线索商品必须属于目标站点 (否则详情页打不开 → 读不到品牌跳转链接),
        // 并且品牌值必须"像品牌名" (旧数据里混入过亚马逊随机店铺名, 如 PQWYEWHD)
        const pool = products.filter((x) => x && x.asin);
        // 「详情页核实过品牌」的采集方式: brand 字段是详情页品牌署名读到的真实值
        // (cdp-follow-shop 老数据把卖家店铺名写进过 brand → 不作为自动挑选的首选)
        const TRUSTED_SRC = ['category-search', 'brand-batch', 'list-direct', 'list-filtered', 'dp-brand', 'cdp-brand'];
        const leads = [];
        const pickedBrands = [];
        if (Array.isArray(j.asins) && j.asins.length) {
          for (const a of j.asins.map((x) => String(x).trim().toUpperCase()).filter(Boolean)) {
            const row = pool.find((x) => String(x.asin).toUpperCase() === a) || null;
            leads.push({ asin: a, brand: row ? (row.brand || null) : null, fromLibrary: !!row });
            if (row && row.brand) pickedBrands.push({ brand: row.brand, lead: a, rows: 1, trusted: TRUSTED_SRC.indexOf(String(row.source || '')) >= 0 });
          }
        } else {
          // 指定品牌: 数组 或 逗号/空格分隔的字符串 (前端输入框) — 填了就用这些品牌, 否则从商品库自动挑
          const wantRaw = Array.isArray(j.brands) ? j.brands
            : (typeof j.brands === 'string' && j.brands.trim() ? j.brands.split(/[,，\s]+/) : []);
          const wantBrands = wantRaw.map((b) => String(b).trim()).filter(Boolean).length ? wantRaw.map((b) => String(b).trim()).filter(Boolean) : null;
          // 线索商品打分: 详情页读成功(detailOk)优先 → 主图/价格完整优先 → 目标站点商品已在硬条件里保证
          const scoreOf = (x) => (x.detailOk ? 4 : 0) + (x.mainImage ? 2 : 0) + (x.price ? 1 : 0);
          // 品牌分组 (硬条件: 目标站点 + 品牌像品牌名)
          const groups = new Map();
          let skippedSite = 0, skippedJunk = 0;
          for (const x of pool) {
            if (String(x.site || '') !== site) { skippedSite++; continue; }   // 线索必须是目标站点商品
            const b = String(x.brand || '').trim();
            if (!b || !isBrandLike(b)) { skippedJunk++; continue; }           // 通用词/店铺名 → 不是品牌线索
            const k = brandKey(b);
            if (!k || k.length < 2) { skippedJunk++; continue; }
            if (!groups.has(k)) groups.set(k, { brand: b, rows: [], trusted: 0 });
            const g = groups.get(k);
            g.rows.push(x);
            if (TRUSTED_SRC.indexOf(String(x.source || '')) >= 0) g.trusted++;
          }
          let list;
          if (wantBrands) {
            // 指定品牌: 匹配时同时看品牌键与显示名 (Lamicall = Visit the Lamicall Store)
            const findGroup = (b) => groups.get(brandKey(b)) || groups.get(brandKey(String(b).replace(/^visit the\s+/i, '')));
            list = wantBrands.map((b) => {
              const g = findGroup(b);
              return { brand: b, rows: g ? g.rows : [], trusted: g ? g.trusted : 0 };
            });
            const missing = wantBrands.filter((b) => { const g = findGroup(b); return !g || !g.rows.length; });
            list = list.filter((g) => g.rows.length);
            if (!list.length) {
              const pool2 = [...groups.values()].sort((a, z) => (z.trusted - a.trusted) || (z.rows.length - a.rows.length)).slice(0, 12).map((g) => g.brand);
              return send(404, {
                error: '站点 ' + site + ' 的商品库里没有这些品牌的商品: ' + missing.join(', ')
                  + ' (品牌采集的线索来自商品库, 且必须是该站点商品的品牌). 该站点现有可用品牌: ' + (pool2.join(', ') || '暂无'),
              });
            }
          } else {
            // 自动挑选: 详情页核实过品牌的采集方式优先, 再按商品数多的品牌优先
            list = [...groups.values()]
              .sort((a, z) => (z.trusted - a.trusted) || (z.rows.length - a.rows.length))
              .slice(0, brandsLimit);
          }
          for (const g of list) {
            const best = g.rows.slice().sort((a, z) => scoreOf(z) - scoreOf(a))[0];
            leads.push({ asin: best.asin, brand: g.brand, fromLibrary: true });
            pickedBrands.push({ brand: g.brand, lead: best.asin, rows: g.rows.length, trusted: g.trusted });
          }
          if (!leads.length) {
            const hint = skippedSite && !skippedJunk
              ? '站点 ' + site + ' 没有商品 (线索必须是目标站点的商品, 请先在该站点采集)'
              : '站点 ' + site + ' 的商品里没有可用的品牌 (品牌为空或是通用词/店铺名, 可先采集一批带品牌的商品, 或直接指定品牌名)';
            return send(404, { error: '没有可用的品牌线索: ' + hint });
          }
        }
        if (!leads.length) return send(404, { error: '没有可用的品牌线索 (商品库里这些商品缺少品牌, 可先用其他采集方式补品牌)' });
        let out;
        try {
          out = await cdpBrandBatch({ leads, site, maxPerBrand, maxPages, filter, panel: withPanel });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 阶段3: 入库 (字段与「类目搜索采集」一致: 详情页读到的真实值, 未读到一律 null 不写死)
        const currency = siteCurrency(site);
        const used = new Set(products.map((x) => String(x.asin || '').toUpperCase()));
        let added = 0;
        const perBrand = [];
        const imported = [];
        for (const br of out.brands) {
          let brandAdded = 0;
          for (const p of br.products) {
            const asin = String(p.asin || '').toUpperCase();
            if (!asin || used.has(asin)) continue;
            used.add(asin);
            const price = p.price != null ? p.price : null;
            const pBsr = (Array.isArray(p.bsr) ? p.bsr : []).map((b) => (b && b.rank != null ? b : null)).filter(Boolean);
            const maxR = pBsr.length ? Math.max.apply(null, pBsr.map((b) => b.rank)) : null;
            const item = {
              id: asin, asin, rank: maxR != null ? '#' + maxR : null, title: p.title || '', brand: cleanBrandDisplay(p.brand) || cleanBrandDisplay(br.brandName) || br.brand || 'Unknown',
              brandRaw: p.brand || null,
              brandStatus: p.brandStatus || 'unchecked', bgMark: false, tmMark: !!p.tmMark, patentRisk: false, trademarkCount: p.trademarkCount || 0,
              followCount: p.sellerCount || 0, chinaSeller: false,
              fulfill: p.fulfill || null, amazonSell: p.detailOk ? !!p.amazonSell : null, mainSeller: p.mainSeller || null,
              mainImage: p.mainImage || null, aplus: p.detailOk ? !!p.aplus : null,
              detailOk: !!p.detailOk, detailAt: p.detailAt || null, detailVer: p.detailOk ? DETAIL_VER : null,
              priceSymbol: p.priceSymbol || null, sellerRegion: p.sellerRegion || null,
              buyBoxPrice: p.buyBoxPrice != null ? p.buyBoxPrice : null, minPrice: p.minPrice != null ? p.minPrice : null,
              cat1: p.cat1 || null, cat2: p.cat2 || null, cat3: p.cat3 || null, catPath: p.catPath || null,
              catNodes: p.catNodes || null, catSrc: p.catPath ? 'bc' : null,
              tmCountries: p.tmCountries || [], tmText: p.tmText || null, sales30d: p.sales30d || null,
              price, currency, monthlySales: p.sales30d ? (parseInt(String(p.sales30d).replace(/[<>\s,]/g, ''), 10) || 0) : 0,
              reviews: p.reviews != null ? p.reviews : null, rating: p.rating != null ? p.rating : null, stock: 0,
              listedAt: (p.firstAvailable || '').slice(0, 10) || null,   // 详情页没读到上架日期 → null (不写"今天")
              size: p.size || null, weight: p.weight || null, packSize: p.packSize || null, packWeight: p.packWeight || null,
              color: p.color || null, variantSize: p.variantSize || null, fbaFee: p.fbaFee || null, productType: p.productType || null,
              variations: 0, bsr: pBsr, badge: p.badge || null,
              referralFee: price != null ? Math.round(price * (referralRateFor(p.cat1).rate / 100) * 100) / 100 : null, netProfit: null,
              site, category: p.category || 'Brand', collectedAt: now(), source: 'brand-batch', saved: false, real: true,
              brandStore: p.brandStore || null, brandUrl: p.brandUrl || null, brandSource: p.brandSource || null, fromAsin: p.fromAsin || null,
              panelOk: !!p.panelOk,
            };
            item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 + Math.random() * 10)));
            item.aiRiskLevel = item.brandStatus === 'registered' ? 'high' : item.trademarkCount > 0 ? 'medium' : 'low';
            item.aiSuggestPrice = price != null ? Math.round((price - 0.5) * 100) / 100 : null;
            products.unshift(item);
            added++;
            brandAdded++;
            imported.push(item);
          }
          perBrand.push({
            brand: br.brandName || br.brand, lead: br.asin, brandUrl: br.brandUrl, brandSource: br.brandSource,
            listCount: br.listCount, pages: br.pages, candidates: br.candidates, preSkipped: br.preSkipped, read: br.read, kept: br.kept, added: brandAdded,
            skipped: br.skipped, mismatch: br.mismatch, panel: br.panel, error: br.error,
          });
        }
        save('products.json', products);
        pushNotify('批量品牌采集完成', `品牌 ${out.brands.length} 个 / 入库 ${added} 个`, `候选 ${out.candidates} 个, 采集筛选跳过 ${out.skipped} 个, 品牌不符丢弃 ${out.mismatch} 个 (站点: ${site}, 全程CDP)`);
        return send(200, {
          added, total: products.length, site, brands: perBrand, pickedBrands,
          candidates: out.candidates, kept: out.kept, skipped: out.skipped, mismatch: out.mismatch,
          preSkipped: out.brands.reduce((s, b) => s + (b.preSkipped || 0), 0),
          panel: out.panelEnabled, panelOk: out.panel, filter, stopped: out.stopped,
          items: imported.map((x) => ({ asin: x.asin, brand: x.brand, price: x.price, currency: x.currency, fulfill: x.fulfill, aplus: x.aplus, mainImage: !!x.mainImage, rating: x.rating, reviews: x.reviews, cat1: x.cat1, cat2: x.cat2 })),
        });
      }

      // 跟卖店铺采集 (完整链路: 商品 → 出售单位链接 → 出售单位详情页 → 参观出售单位 → 店铺全部商品, 全程 CDP)
      if (p === '/api/collect/follow-shop' && req.method === 'POST') {
        const url = (j.url || '').trim();
        if (!/^https:\/\/www\.amazon\./.test(url) && !/^https:\/\/amazon\./.test(url)) return send(400, { error: '无效的 amazon 链接' });
        const maxItems = Math.min(100, Math.max(1, j.maxItems || 30));
        const maxPages = Math.min(20, Math.max(1, j.maxPages || 3));
        const filter = buildCollectFilter(j);
        // 店铺 A+ 过滤: '1'=仅采有A+店铺 / '0'=排除有A+店铺 (仅跟卖店铺类采集生效)
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        // 品牌店筛选: 只采指定品牌 (如 "Anker"), 过滤掉不是该品牌的店铺
        const brandStore = String(j.filterBrandStore || '').trim();
        // 品牌店铺类型: '1'=仅采品牌店铺 / '0'=排除品牌店铺 (只采普通第三方店)
        const brandShop = j.filterBrandShop === '1' || j.filterBrandShop === '0' ? j.filterBrandShop : '';
        let out;
        try {
          out = await cdpFollowShopChain(url, { maxItems, maxPages, filter, shopAplus, brandStore, brandShop });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 首次采集即读全: 价格/品牌/排名/评分/评论/变体 + 详情页插件面板补全(重量/尺寸/FBA费用等物流字段)
        const site = out.site;
        const added = ingestFollowShopProducts(out, true, 0);
        save('products.json', products);
        pushNotify('跟卖店铺采集完成', `出售单位「${out.sellerName || out.sellerId || '?'}」店铺抓取 ${out.products.length} 个${out.skipped ? ', 过滤跳过 ' + out.skipped + ' 个' : ''}${out.shopAplus ? (out.aplusShop ? ', 店铺有A+' : ', 店铺无A+') : ''}${out.brandShopSkip ? ', 品牌店铺筛选跳过' : ''}${out.brandSkip ? ', 指定品牌筛选跳过' : ''}`, `新增 ${added} 个 (链路: 商品aod → 出售单位详情 → 参观店铺, 首次采集读全信息, 全程CDP, 过滤: ${filterDesc(filter)})`);
        return send(200, {
          added, total: products.length, site, seller: out.sellerName, sellerId: out.sellerId,
          sellerUrl: out.sellerUrl, spUrl: out.spUrl, storeUrl: out.storeUrl,
          productCount: out.products.length, skipped: out.skipped || 0, filter, shopAplus, aplusShop: out.aplusShop, brandStore, brandName: out.brandName, brandSkip: out.brandSkip || false, brandShop, brandShopSkip: out.brandShopSkip || false, isBrandShop: out.isBrandShop, steps: out.steps,
          items: out.products.map((x) => ({ asin: x.asin, title: x.title.slice(0, 60), price: x.price })),
        });
      }

      // 跟卖店铺批量采集: 对每个商品 → 遍历其全部跟卖卖家 → 逐个跳转店铺采集 (全程 CDP)
      if (p === '/api/collect/follow-shop-batch' && req.method === 'POST') {
        const asins = (j.asins || []).map((x) => String(x).trim()).filter((x) => x);
        if (!asins.length) return send(400, { error: '请输入商品 ASIN 列表 (如 ["B0XXXXXXX","B0YYYYYYY"])' });
        // 0 = 无限制 (循环轮次/每店商品数/每店翻页)
        const maxItems = j.maxItems === 0 || j.maxItems === '0' ? 0 : Math.min(50, Math.max(1, j.maxItems || 10));
        const maxPages = j.maxPages === 0 || j.maxPages === '0' ? 0 : Math.min(10, Math.max(1, j.maxPages || 2));
        const rounds = j.rounds === 0 || j.rounds === '0' ? 0 : Math.min(30, Math.max(1, j.rounds || 1));
        const concurrency = Math.min(6, Math.max(1, j.concurrency || 4));
        const filter = buildCollectFilter(j);
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        const brandStore = String(j.filterBrandStore || '').trim();
        const brandShop = j.filterBrandShop === '1' || j.filterBrandShop === '0' ? j.filterBrandShop : '';
        const excludeSellers = String(j.excludeSellers || '');
        const amazonWords = String(j.amazonWords || 'amazon,亚马逊');
        const zip = String(j.zip || '').trim() || undefined;   // 用户输入邮编 (配送地址), 影响报价可见性
        let out;
        try {
          out = await cdpFollowShopBatch(asins, { maxItems, maxPages, rounds, concurrency, filter, shopAplus, brandStore, brandShop, excludeSellers, amazonWords, zip });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 汇总统计
        let shopOk = 0, shopFail = 0, prodCount = 0, skipCount = 0, shopAplusSkip = 0, brandShopSkip = 0, brandSkip = 0;
        out.results.forEach((r) => (r.sellers || []).forEach((s) => { if (s.error) shopFail++; else { shopOk++; prodCount += s.productCount || 0; skipCount += s.skipped || 0; if (s.shopSkipped) { if (s.brandShopSkip) brandShopSkip++; else if (s.brandSkip) brandSkip++; else shopAplusSkip++; } } }));
        pushNotify('跟卖店铺批量采集完成', `${out.stopped ? '⏹ 用户停止 | ' : ''}${rounds === 0 ? '无限循环' : rounds + ' 轮循环'}, 成功 ${out.okRounds} 轮, 自动跳转 ${out.autoJumps} 次 → 卖家店铺 ${shopOk} 成功/${shopFail} 失败${brandShopSkip ? ', 品牌店铺筛选跳过 ' + brandShopSkip + ' 个' : ''}${brandSkip ? ', 指定品牌筛选跳过 ' + brandSkip + ' 个' : ''}${shopAplusSkip ? ', A+店铺过滤跳过 ' + shopAplusSkip + ' 个' : ''}${skipCount ? ', 商品过滤跳过 ' + skipCount + ' 个' : ''}`, `共采集店铺商品 ${prodCount} 个 (全程CDP, 过滤: ${filterDesc(filter)})`);
        return send(200, { asins, rounds, okRounds: out.okRounds, autoJumps: out.autoJumps, added: out.added, shopOk, shopFail, productCount: prodCount, skipped: skipCount, shopAplusSkip, brandShopSkip, brandSkip, filter, shopAplus, brandStore, brandShop, stopped: out.stopped || false, results: out.results });
      }

      // 跟卖店铺并行批量采集: 一个商品多个跟卖卖家 → 多开标签页并行采集各自店铺 (全程 CDP)
      if (p === '/api/collect/follow-shop-parallel' && req.method === 'POST') {
        const asins = (j.asins || []).filter((x) => /^B0[A-Z0-9]{8}$/.test(x));
        if (!asins.length) return send(400, { error: '请输入商品 ASIN 列表 (如 ["B0XXXXXXX","B0YYYYYYY"])' });
        const maxItems = j.maxItems === 0 || j.maxItems === '0' ? 0 : Math.min(50, Math.max(1, j.maxItems || 10));
        const maxPages = j.maxPages === 0 || j.maxPages === '0' ? 0 : Math.min(10, Math.max(1, j.maxPages || 2));
        const concurrency = Math.min(6, Math.max(1, j.concurrency || 4));
        const filter = buildCollectFilter(j);
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        const brandStore = String(j.filterBrandStore || '').trim();
        const brandShop = j.filterBrandShop === '1' || j.filterBrandShop === '0' ? j.filterBrandShop : '';
        let out;
        try {
          out = await cdpFollowShopBatchParallel(asins, { maxItems, maxPages, concurrency, filter, shopAplus, brandStore, brandShop });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 汇总统计
        let shopOk = 0, shopFail = 0, prodCount = 0, skipCount = 0, shopAplusSkip = 0, brandShopSkip = 0, brandSkip = 0;
        out.results.forEach((r) => (r.sellers || []).forEach((s) => { if (s.error) shopFail++; else { shopOk++; prodCount += s.productCount || 0; skipCount += s.skipped || 0; if (s.shopSkipped) { if (s.brandShopSkip) brandShopSkip++; else if (s.brandSkip) brandSkip++; else shopAplusSkip++; } } }));
        pushNotify('跟卖店铺并行采集完成', `${out.stopped ? '⏹ 用户停止 | ' : ''}商品 ${asins.length} 个 → ${concurrency} 网页并行, 卖家店铺 ${shopOk} 成功/${shopFail} 失败${brandShopSkip ? ', 品牌店铺筛选跳过 ' + brandShopSkip + ' 个' : ''}${brandSkip ? ', 指定品牌筛选跳过 ' + brandSkip + ' 个' : ''}${shopAplusSkip ? ', A+店铺过滤跳过 ' + shopAplusSkip + ' 个' : ''}${skipCount ? ', 商品过滤跳过 ' + skipCount + ' 个' : ''}`, `共采集店铺商品 ${prodCount} 个 (全程CDP, 过滤: ${filterDesc(filter)})`);
        return send(200, { asins, concurrency, shopOk, shopFail, productCount: prodCount, skipped: skipCount, shopAplusSkip, brandShopSkip, brandSkip, filter, shopAplus, brandStore, brandShop, added: out.added, stopped: out.stopped || false, results: out.results });
      }

      // 商品 aod URL → 提取全部跟卖卖家 → 并行开标签页采集各自店铺 (全程 CDP)
      if (p === '/api/collect/follow-shop-aod' && req.method === 'POST') {
        // 支持多商品: urls 数组 (ASIN / 普通商品链接 / aod 报价链接) 或单 url
        const urls = Array.isArray(j.urls) ? j.urls.map((u) => String(u).trim()).filter(Boolean) : (j.url ? [String(j.url).trim()] : []);
        if (!urls.length) return send(400, { error: '请输入商品 (ASIN / 商品链接 / aod 报价链接, 每行一个)' });
        for (const u of urls) {
          const okAsin = /^[A-Z0-9]{10}$/.test(u) && u.startsWith('B0');
          if (okAsin) continue;
          if (!/^https:\/\/(www\.)?amazon\./.test(u)) return send(400, { error: '无效的 amazon 链接或 ASIN: ' + u.slice(0, 40) });
          if (!/aod|olp-opf-redir|\/dp\//.test(u)) return send(400, { error: '需 aod 报价页 URL: ' + u.slice(0, 40) });
        }
        const maxItems = j.maxItems === 0 || j.maxItems === '0' ? 0 : Math.min(50, Math.max(1, j.maxItems || 10));
        const maxPages = j.maxPages === 0 || j.maxPages === '0' ? 0 : Math.min(10, Math.max(1, j.maxPages || 2));
        const concurrency = Math.min(6, Math.max(1, j.concurrency || 4));
        const excludeSellers = String(j.excludeSellers || '');
        const amazonWords = String(j.amazonWords || 'amazon,亚马逊');
        const filter = buildCollectFilter(j);
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        const brandStore = String(j.filterBrandStore || '').trim();
        const brandShop = j.filterBrandShop === '1' || j.filterBrandShop === '0' ? j.filterBrandShop : '';
        let out;
        try {
          out = await cdpAodParallelCollectAll(urls, { maxItems, maxPages, concurrency, excludeSellers, amazonWords, filter, shopAplus, brandStore, brandShop, zip: j.zip || undefined });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 汇总统计
        let shopOk = 0, shopFail = 0, prodCount = 0, skipCount = 0, shopAplusSkip = 0, brandShopSkip = 0, brandSkip = 0;
        out.products.forEach((pr) => (pr.sellers || []).forEach((s) => { if (s.error) shopFail++; else { shopOk++; prodCount += s.productCount || 0; skipCount += s.skipped || 0; if (s.shopSkipped) { if (s.brandShopSkip) brandShopSkip++; else if (s.brandSkip) brandSkip++; else shopAplusSkip++; } } }));
        pushNotify('跟卖卖家并行采集完成', `${out.stopped ? '⏹ 用户停止 | ' : ''}${urls.length} 个商品 → 逐商品提取跟卖卖家 → ${concurrency} 网页并行, 店铺 ${shopOk} 成功/${shopFail} 失败${brandShopSkip ? ', 品牌店铺筛选跳过 ' + brandShopSkip + ' 个' : ''}${brandSkip ? ', 指定品牌筛选跳过 ' + brandSkip + ' 个' : ''}${shopAplusSkip ? ', A+店铺过滤跳过 ' + shopAplusSkip + ' 个' : ''}${skipCount ? ', 商品过滤跳过 ' + skipCount + ' 个' : ''}`, `共采集店铺商品 ${prodCount} 个, 新增 ${out.added} (全程CDP, 过滤: ${filterDesc(filter)}${amazonWords ? ', 亚马逊词汇: ' + amazonWords : ''})`);
        return send(200, { urls, concurrency, productCount: prodCount, skipped: skipCount, shopAplusSkip, brandShopSkip, brandSkip, filter, shopAplus, brandStore, brandShop, amazonWords, added: out.added, stopped: out.stopped || false, shopOk, shopFail, products: out.products });
      }

      // 多商品并行跟卖店铺采集 + 自定义重复轮次: 每轮自动找新商品继续, 直到 rounds 轮
      if (p === '/api/collect/follow-shop-rounds' && req.method === 'POST') {
        const urls = Array.isArray(j.urls) ? j.urls.map((u) => String(u).trim()).filter(Boolean) : (j.url ? [String(j.url).trim()] : []);
        if (!urls.length) return send(400, { error: '请输入商品 (ASIN / 商品链接 / aod 报价链接, 每行一个)' });
        for (const u of urls) {
          const okAsin = /^[A-Z0-9]{10}$/.test(u) && u.startsWith('B0');
          if (okAsin) continue;
          if (!/^https:\/\/(www\.)?amazon\./.test(u)) return send(400, { error: '无效的 amazon 链接或 ASIN: ' + u.slice(0, 40) });
          if (!/aod|olp-opf-redir|\/dp\//.test(u)) return send(400, { error: '需 aod 报价页 URL: ' + u.slice(0, 40) });
        }
        const rounds = j.rounds === 0 || j.rounds === '0' ? 0 : Math.min(30, Math.max(1, j.rounds || 1));
        const maxItems = j.maxItems === 0 || j.maxItems === '0' ? 0 : Math.min(50, Math.max(1, j.maxItems || 10));
        const maxPages = j.maxPages === 0 || j.maxPages === '0' ? 0 : Math.min(10, Math.max(1, j.maxPages || 2));
        const concurrency = Math.min(6, Math.max(1, j.concurrency || 4));
        const excludeSellers = String(j.excludeSellers || '');
        const amazonWords = String(j.amazonWords || 'amazon,亚马逊');
        const filter = buildCollectFilter(j);
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        const brandStore = String(j.filterBrandStore || '').trim();
        const brandShop = j.filterBrandShop === '1' || j.filterBrandShop === '0' ? j.filterBrandShop : '';
        let out;
        try {
          out = await cdpAodParallelCollectRounds(urls, { rounds, maxItems, maxPages, concurrency, excludeSellers, amazonWords, filter, shopAplus, brandStore, brandShop, zip: j.zip || undefined });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        // 汇总统计
        let shopOk = 0, shopFail = 0, prodCount = 0, okRounds = 0, skipCount = 0, shopAplusSkip = 0, brandShopSkip = 0, brandSkip = 0;
        out.rounds.forEach((rd) => {
          if (rd.error || rd.note) return;
          okRounds++;
          (rd.sellers || []).forEach((s) => { if (s.error) shopFail++; else { shopOk++; prodCount += s.productCount || 0; skipCount += s.skipped || 0; if (s.shopSkipped) { if (s.brandShopSkip) brandShopSkip++; else if (s.brandSkip) brandSkip++; else shopAplusSkip++; } } });
        });
        pushNotify('多商品并行采集完成', `${out.stopped ? '⏹ 用户停止 | ' : ''}${rounds === 0 ? '无限循环' : rounds + ' 轮'}, 成功 ${okRounds} 轮 → 卖家店铺 ${shopOk} 成功/${shopFail} 失败${brandShopSkip ? ', 品牌店铺筛选跳过 ' + brandShopSkip + ' 个' : ''}${brandSkip ? ', 指定品牌筛选跳过 ' + brandSkip + ' 个' : ''}${shopAplusSkip ? ', A+店铺过滤跳过 ' + shopAplusSkip + ' 个' : ''}${excludeSellers ? ', 排除: ' + excludeSellers : ''}${skipCount ? ', 商品过滤跳过 ' + skipCount + ' 个' : ''}`, `共采集店铺商品 ${prodCount} 个, 新增 ${out.added} (全程CDP, 过滤: ${filterDesc(filter)}${amazonWords ? ', 亚马逊词汇: ' + amazonWords : ''})`);
        return send(200, { rounds, concurrency, okRounds, autoJumps: out.autoJumps, shopOk, shopFail, productCount: prodCount, skipped: skipCount, shopAplusSkip, brandShopSkip, brandSkip, filter, shopAplus, brandStore, brandShop, amazonWords, added: out.added, stopped: out.stopped || false, excludeSellers, roundResults: out.rounds });
      }

      // 店铺列表页采集 (翻页取全部商品 → 详情补全 → 过滤FBA/FBM等 → 入库)
      if (p === '/api/collect/shop-list' && req.method === 'POST') {
        const url = String(j.url || '').trim();
        if (!/^https:\/\/www\.amazon\./.test(url)) return send(400, { error: '无效的 amazon 店铺列表页 URL' });
        const maxItems = Math.min(100, Math.max(1, j.maxItems || 50));
        const maxPages = Math.min(10, Math.max(1, j.maxPages || 3));
        const filter = buildCollectFilter(j);
        const shopAplus = j.filterShopAplus === '1' || j.filterShopAplus === '0' ? j.filterShopAplus : '';
        let out;
        try {
          out = await cdpShopListCollect(url, { maxItems, maxPages, filter, shopAplus });
          endCollectProgress();
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        pushNotify('店铺列表采集完成', `${out.stopped ? '⏹ 用户停止 | ' : ''}${out.total} 个商品, 筛选后 ${out.productCount} 个, 跳过 ${out.skipped} 个${out.preSkipped ? ' (其中列表页初筛跳过 ' + out.preSkipped + ' 个未跳详情)' : ''}`, `新增 ${out.added} 个 (站点: ${out.site}, 过滤: ${filterDesc(filter)}, 全程CDP)`);
        return send(200, { added: out.added, total: out.total, productCount: out.productCount, skipped: out.skipped, preSkipped: out.preSkipped || 0, site: out.site, url, filter, stopped: out.stopped || false, products: out.products });
      }

      // 店铺页 CDP 采集 (Edge 9222 + 智赢插件)
      if (p === '/api/collect/shop' && req.method === 'POST') {
        const url = j.url || '';
        if (!/^https:\/\/www\.amazon\./.test(url)) return send(400, { error: '无效的 amazon 店铺 URL' });
        const count = Math.min(30, Math.max(1, j.count || 10));
        let items;
        try {
          items = await cdpShopCollect(url, count);
        } catch (e) {
          endCollectProgress();
          return send(500, { error: e.message });
        }
        if (!items.length) return send(404, { error: '未能提取到商品 (页面结构变化或需要登录)' });
        // 导入商品库
        const siteMatch = url.match(/amazon\.(com\.au|co\.uk|com|com\.mx|com\.br|de|fr|it|es|co\.jp|ca|in|nl|se|pl)/);
        const site = siteMatch && CDP_SITE_CODE[siteMatch[1]] ? CDP_SITE_CODE[siteMatch[1]] : 'uk';
        const currency = siteCurrency(site);   // 按站点真实币种 (旧实现把非 uk/us 一律写成 EUR)
        const used = new Set(products.map((x) => x.asin));
        let added = 0;
        for (const it of items) {
          if (used.has(it.asin)) continue;
          used.add(it.asin);
          const brand = (it.title.split(/[ ,|–—/•]/)[0] || '').replace(/[^A-Za-z0-9&'.\-]/g, '').trim() || 'Unknown';
          const price = it.priceNum || parseFloat(String(it.price).replace(/[^0-9.,]/g, '').replace(',', '.')) || null;
          const tm = Math.random() < 0.15, patent = Math.random() < 0.05;
          const item = {
            id: it.asin, asin: it.asin, rank: null, title: it.title, brand,
            brandStatus: 'unchecked', bgMark: false, tmMark: tm, patentRisk: patent, trademarkCount: 0,
            followCount: Math.floor(Math.random() * 20), chinaSeller: Math.random() < 0.5,
            fulfill: Math.random() < 0.4 ? 'FBA' : 'FBM', amazonSell: false,
            price: price || Math.round((399 + Math.random() * 4000)) / 100, currency,
            monthlySales: Math.floor(50 + Math.random() * 4000), reviews: Math.floor(Math.random() * 500),
            rating: it.rating ? parseFloat(String(it.rating).match(/[\d.]+/)?.[0]) || 4 : 4,
            stock: Math.floor(Math.random() * 600), listedAt: new Date().toISOString().slice(0, 10),
            size: null, weight: null, variations: Math.floor(Math.random() * 4),
            referralFee: 0, netProfit: 0, site, category: 'Shop', collectedAt: now(),
            source: 'cdp-shop', saved: false, real: true, shopUrl: url.slice(0, 120),
          };
          item.referralFee = Math.round(item.price * 0.15 * 100) / 100;
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 - (item.patentRisk ? 25 : 0) + Math.random() * 10)));
          item.aiRiskLevel = item.patentRisk ? 'high' : item.tmMark ? 'medium' : 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
        }
        save('products.json', products);
        pushNotify('CDP店铺采集完成', `从店铺页提取 ${items.length} 个, 新增 ${added} 个`, `URL: ${url.slice(0, 100)}`);
        return send(200, { added, total: products.length, site, url, items: items.map((x) => ({ asin: x.asin, title: x.title.slice(0, 80), price: x.price, rating: x.rating, reviews: x.reviews })) });
      }

      // 真实采集 (curl 抓 amazon + 智赢 API)
      if (p === '/api/collect/real' && req.method === 'POST') {
        const r = await realCollect({ site: j.site || 'uk', category: j.category || 'Automotive', count: j.count || 10 });
        return send(200, r);
      }

      // 模拟采集任务 (生成新商品入库)
      if (p === '/api/collect/run' && req.method === 'POST') {
        const count = Math.min(20, Math.max(1, j.count || 5));
        const category = j.category || 'Automotive';
        const method = j.method || '关键词采集';
        const NEW_BRANDS = ['NOVIC', 'AutoSoul', 'TopGearPro', 'CleanDrive', 'MegaPower', 'SwiftFix', 'DriveMax', 'EcoWash'];
        const NEW_WORDS = ['Car Wash Kit', 'Wireless Charger Holder', 'Alloy Wheel Cleaner', 'Dash Cam 4K', 'Tyre Pressure Gauge', 'Air Freshener Set', 'Microfibre Cloth Pack', 'Jump Starter'];
        let added = 0;
        const used = new Set(products.map((x) => x.asin));
        for (let i = 0; i < count; i++) {
          let asin;
          do { asin = 'B0' + Math.random().toString(36).slice(2, 10).toUpperCase(); } while (used.has(asin));
          used.add(asin);
          const brand = NEW_BRANDS[Math.floor(Math.random() * NEW_BRANDS.length)];
          const word = NEW_WORDS[Math.floor(Math.random() * NEW_WORDS.length)];
          const price = Math.round((799 + Math.random() * 5000)) / 100;
          const tm = Math.random() < 0.15;
          const patent = Math.random() < 0.05;
          const item = {
            id: asin, asin, rank: null, title: `${brand} ${word}, Premium Quality ${category} Accessory`, brand,
            brandStatus: Math.random() < 0.2 ? 'registered' : 'notfound',
            bgMark: false, tmMark: tm, patentRisk: patent,
            trademarkCount: Math.floor(Math.random() * 30),
            followCount: Math.floor(Math.random() * 15), chinaSeller: Math.random() < 0.6,
            fulfill: Math.random() < 0.4 ? 'FBA' : 'FBM', amazonSell: false,
            price, currency: 'GBP', monthlySales: Math.floor(100 + Math.random() * 5000),
            reviews: Math.floor(Math.random() * 800), rating: Math.round((3.5 + Math.random() * 1.3) * 10) / 10,
            stock: Math.floor(Math.random() * 600), listedAt: new Date().toISOString().slice(0, 10),
            size: null, weight: null, variations: Math.floor(Math.random() * 4),
            referralFee: Math.round(price * 0.15 * 100) / 100, netProfit: 0,
            site: 'uk', category, collectedAt: now(), source: 'collect-task', saved: false,
          };
          item.netProfit = Math.round((item.price - item.referralFee - 3.2 - item.price * 0.3) * 100) / 100;
          item.aiScore = Math.round(Math.min(96, Math.max(30, 80 - item.trademarkCount * 0.5 - (item.patentRisk ? 25 : 0) + Math.random() * 10)));
          item.aiRiskLevel = item.patentRisk ? 'high' : item.trademarkCount > 40 || item.tmMark ? 'medium' : 'low';
          item.aiSuggestPrice = Math.round((item.price - 0.5) * 100) / 100;
          products.unshift(item);
          added++;
        }
        save('products.json', products);
        pushNotify('采集完成', `「${method}」新增 ${added} 个商品`, `类目: ${category} | 当前商品库共 ${products.length} 条`);
        return send(200, { added, total: products.length, method, category });
      }

      // 导出 (txt / csv) — 返回文本内容, 前端下载
      if (p === '/api/products/export' && (req.method === 'GET' || req.method === 'HEAD')) {
        // format: xlsx(默认) | csv | txt | json ;  fields: 逗号分隔字段键 (默认"重要信息"精简列)
        // asins: 逗号分隔 → 只导选中商品; 不传 → 导全部
        const fmt = (url.searchParams.get('format') || 'xlsx').toLowerCase();
        const asins = (url.searchParams.get('asins') || '').split(',').map((s) => s.trim()).filter(Boolean);
        const list = asins.length ? products.filter((x) => asins.includes(x.asin)) : products;
        const use = exportFields((url.searchParams.get('fields') || '').split(',').map((s) => s.trim()).filter(Boolean));
        const head = use.map((f) => f.h);
        const rows = list.map((x) => use.map((f) => f.v(x)));
        const stamp = now().slice(0, 16).replace(/[-: ]/g, '');
        const fname = `zying_products_${stamp}`;
        if (fmt === 'json') return send(200, { total: list.length, fields: use.map((f) => ({ k: f.k, h: f.h })), head, rows });
        if (fmt === 'xlsx') {
          const buf = xlsxBuffer('商品', head, rows, use.map((f) => !!f.num));
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
          return res.end(buf);
        }
        if (fmt === 'txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${fname}.txt"`);
          return res.end([head.join('\t'), ...rows.map((r) => r.map((v) => (v == null ? '' : String(v))).join('\t'))].join('\n'));
        }
        // 未知 format 以前会静默按 CSV 返回 (调用方以为拿到了 xlsx) → 明确拒绝
        if (fmt !== 'csv') return send(400, { error: '不支持的 format: ' + fmt + ' (可用: xlsx / csv / txt / json)' });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`);
        return res.end('\uFEFF' + [head.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n'));
      }
      // 导出字段清单 (前端勾选列用)
      if (p === '/api/products/export-fields' && req.method === 'GET') {
        return send(200, { default: EXPORT_DEFAULT, fields: EXPORT_FIELDS.map((f) => ({ k: f.k, h: f.h })) });
      }

      if (p === '/api/products/detail' && req.method === 'GET') {
        const asin = url.searchParams.get('asin');
        const prod = products.find((x) => x.asin === asin);
        if (!prod) return send(404, { error: '商品不存在' });
        return send(200, { ...prod, compliance: complianceCheck(prod) });
      }

      if (p === '/api/branddb') return send(200, { total: branddb.length, items: branddb });

      if (p === '/api/rules') return send(200, { total: rules.length, items: rules });

      if (p === '/api/compliance/check' && req.method === 'POST') {
        const prod = products.find((x) => x.asin === j.asin) || j;
        const r = complianceCheck(prod);
        if (r.level !== 'low') pushNotify('合规预警', `${r.asin} 风险等级: ${r.level}`, r.reasons.join(' | '));
        return send(200, r);
      }

      if (p === '/api/compliance/correct' && req.method === 'POST') {
        const prod = products.find((x) => x.asin === j.asin) || j;
        const r = correctCompliance(prod, j.verdict || '未备案');
        return send(200, r);
      }

      if (p === '/api/claims' && req.method === 'GET') return send(200, { total: claims.length, items: claims });
      if (p === '/api/claims' && req.method === 'POST') {
        const r = claim(j.asin, j.opts || {});
        if (r.error) return send(400, r);
        pushNotify('认领成功', `${r.asin} 已认领至草稿箱`, `SKU: ${r.sku} | 建议价: ${r.price}`);
        return send(200, r);
      }

      if (p === '/api/publish' && req.method === 'POST') {
        const r = publish(j.ids || []);
        pushNotify('刊登完成', `批量刊登 ${r.published} 条`, r.ids.join(', '));
        return send(200, r);
      }

      if (p === '/api/reprice/run' && req.method === 'POST') {
        const r = runReprice();
        const wins = r.runs.filter((x) => x.win).length;
        pushNotify('调价完成', `本轮调价 ${r.runs.length} 条, 预测抢到购物车 ${wins} 条`, `建议: ${r.stats.suggestion.suggestion}`);
        return send(200, r);
      }
      if (p === '/api/reprice') return send(200, { total: repriceHistory.length, items: repriceHistory.slice(0, 30) });

      if (p === '/api/flywheel') return send(200, flywheel);

      if (p === '/api/agent/assess' && req.method === 'POST') {
        return send(200, agentAssess(j.asin));
      }

      if (p === '/api/notify' && req.method === 'GET') return send(200, { total: notifications.length, items: notifications });
      if (p === '/api/notify/read' && req.method === 'POST') {
        notifications.forEach((n) => { if (n.id === j.id) n.read = true; });
        save('notify.json', notifications);
        return send(200, { ok: true });
      }

      return send(404, { error: '未知接口: ' + p });
    } catch (e) {
      console.error('[API ERROR]', p, e.stack);
      return send(500, { error: e.message });
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`✔ 亚马逊跟卖ERP Demo 已启动`);
    console.log(`  浏览器访问: http://127.0.0.1:${PORT}`);
    console.log(`  商品: ${products.length} | 品牌: ${branddb.length} | 规则: ${rules.length}`);
    // 授权状态开机必打: 让"到底有没有受保护"一眼可见 (开发模式会明确警告)
    try {
      const ls = licenseStatus();
      console.log('  授权: ' + ls.summary);
      if (!ls.enforce && ls.reason !== 'free') console.log('  ⚠ 当前未启用授权校验 (license.config.json 里 enforce=false) —— 分发给客户前必须改成 true');   // free = 免费版构建, 不提示
      else console.log('  本机指纹: ' + ls.fingerprint);
    } catch (e) { console.log('  授权: 状态读取失败 - ' + e.message); }
  });
} else {
  // 被测试 require 时: 不启动服务器, 仅导出纯函数供 node:test 使用
  module.exports = { classifyAodFailure, aodFailReason, classifyShopPageFailure, shopFailReason, sellersFromProduct, toAodUrl, preFilterByList, parseTmCountries, parseFirstAvailable, applyCollectFilter, buildCollectFilter, itemMatchesBadge, siteToHostSuffix, normFilter, filterToQuery, canonicalToCollectFilter, legacyToCanonical, filterActiveCount, filterDescCanonical, rngRange, parseGoodPrice, goodUrlKey, ensureGoodShape, goodCostVsPrice, computeProfit, referralRateFor, taxForSite, normBrandName, sameBrand, mergePanelInto, cdpBrandBatch };
}
