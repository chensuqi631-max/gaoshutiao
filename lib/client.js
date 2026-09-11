// 智赢ERP · 搞薯条 (采集 + 商品管理) — 持久 dsh.client bundle
// 由 _build-persistent.js 从 zywb-client-combined.txt 生成; 手动改动请改源再生成
//
// ⚠️ 模块 id 必须能被 DSH 的加载器找到。加载器按【包名】注册/查找模块
// （官方插件同样如此，例如 id: "@deepseek-ai/dsh-client-hmr"），
// 名字对不上就会报：加载时未通过 __ModuleLoader__.load 注册 "<包名>"。
var __mod = { exports: {}, ready: false };
window.__ModuleLoader__.load({
	id: "zying-erp",
	factory: (require) => {
		Object.defineProperty(__mod.exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		react = react && react.__esModule && react.default ? react.default : react;
		const React = react;
		const styles = {
			insert(css) {
				try {
					if (typeof document === "undefined") return;
					let el = document.querySelector("style[data-zying-gaoshu]");
					if (!el) {
						el = document.createElement("style");
						el.setAttribute("data-zying-gaoshu", "1");
						document.head.appendChild(el);
					}
					el.textContent += String(css || "");
				} catch (e) {}
			}
		};
		const host = {
			async call(method, args) {
				const a = args || {};
				try {
					const opt = { method: a.method || (a.body !== undefined && a.body !== null ? "POST" : "GET"), headers: { "Content-Type": "text/plain;charset=UTF-8" } };
					if (a.body !== undefined && a.body !== null && opt.method !== "GET") opt.body = typeof a.body === "string" ? a.body : JSON.stringify(a.body);
					const r = await fetch("http://127.0.0.1:3088" + a.path, opt);
					const t = await r.text();
					let json = null, jsonError = null;
					try { json = t ? JSON.parse(t) : null; } catch (e) { jsonError = String(e && e.message || e); }
					return { ok: r.ok, status: r.status, json, text: t, jsonError };
				} catch (e) {
					return { ok: false, error: String(e && e.message || e) };
				}
			}
		};
		const __plugin = (() => {
const h = React.createElement;
function fmtNum(n) { return n == null ? '-' : Number(n).toLocaleString(); }
const SITE_GROUPS = [
  { region: '欧洲', sites: [['de','🇩🇪德国'],['uk','🇬🇧英国'],['fr','🇫🇷法国'],['it','🇮🇹意大利'],['es','🇪🇸西班牙'],['nl','🇳🇱荷兰'],['se','🇸🇪瑞典'],['pl','🇵🇱波兰']] },
  { region: '美洲', sites: [['us','🇺🇸美国'],['ca','🇨🇦加拿大'],['mx','🇲🇽墨西哥'],['br','🇧🇷巴西']] },
  { region: '亚太', sites: [['jp','🇯🇵日本'],['au','🇦🇺澳大利亚'],['in','🇮🇳印度'],['sg','🇸🇬新加坡']] },
  { region: '中东', sites: [['ae','🇦🇪阿联酋'],['sa','🇸🇦沙特']] }
];
const ALL_SITES = [].concat(...SITE_GROUPS.map(function (g) { return g.sites.map(function (s) { return s[0]; }); }));
const SITE_SHORT = { de: '德', uk: '英', us: '美', fr: '法', it: '意', es: '西', nl: '荷', se: '瑞典', pl: '波兰', jp: '日', ca: '加', mx: '墨', br: '巴西', au: '澳', in: '印度', sg: '新', ae: '阿联酋', sa: '沙特' };
const CATEGORY_TREE = [
  { v: 'Electronics', l: '电子', children: [['Cell Phones & Accessories','手机及配件'],['Computers & Accessories','电脑及配件'],['TV','电视影音'],['Camera & Photo','相机摄影'],['Headphones','耳机音响'],['Wearable Technology','智能穿戴'],['Video Games','游戏主机']] },
  { v: 'Automotive', l: '汽车', children: [['Automotive Parts','汽车配件'],['Car Electronics','车载电子'],['Car Care','汽车护理'],['Tires & Wheels','轮胎轮毂'],['Motorcycle','摩托车配件']] },
  { v: 'Home & Kitchen', l: '家居厨房', children: [['Kitchen','厨房用品'],['Storage & Organization','收纳整理'],['Furniture','家具'],['Cleaning','清洁用品'],['Bedding','床上用品'],['Home Décor','家居装饰']] },
  { v: 'Toys & Games', l: '玩具游戏', children: [['Toys','儿童玩具'],['Board Games','桌游卡牌'],['Action Figures','模型手办'],['Outdoor Toys','户外玩具'],['Puzzles','拼图积木']] },
  { v: 'Sports & Outdoors', l: '运动户外', children: [['Fitness','健身器材'],['Camping & Hiking','露营野餐'],['Cycling','骑行装备'],['Water Sports','水上运动'],['Sports & Outdoors','户外运动']] },
  { v: 'Garden', l: '花园', children: [['Garden Tools','园艺工具'],['Lawn Care','草坪护理'],['Patio','户外装饰'],['Plants','植物盆栽']] },
  { v: 'Beauty', l: '美妆个护', children: [['Skin Care','护肤'],['Makeup','彩妆'],['Hair Care','美发'],['Fragrance','香水'],['Personal Care','个人护理']] },
  { v: 'Clothing', l: '服装鞋靴', children: [['Men','男装'],['Women','女装'],['Kids','童装'],['Shoes','鞋靴'],['Accessories','服饰配件']] },
  { v: 'Tools', l: '工具五金', children: [['Hand Tools','手动工具'],['Power Tools','电动工具'],['Hardware','五金配件'],['Safety','安全防护']] },
  { v: 'Office Products', l: '办公用品', children: [['Office Supplies','办公文具'],['Ink & Toner','打印耗材'],['Office Furniture','办公家具']] },
  { v: 'Pet Supplies', l: '宠物用品', children: [['Dog Supplies','狗狗用品'],['Cat Supplies','猫咪用品'],['Pet Food','宠物食品']] }
];
const BADGE_SUGGEST = ['aplus','choice','bestseller','bestseller1','newrelease','deal','dealday','overallpick','editorspick','toprated','climate','smallbusiness'];
const Q_SUGGEST = ['anker','usb','phone','case','holder','adapter','charger','cable','watch','gaming'];
const BRAND_SUGGEST = ['Anker','Samsung','Apple','Xiaomi','Sony','Philips','Bosch','Logitech','! 排除所有品牌店链接'];
const TM_COUNTRY_SUGGEST = ['欧盟','英国','美国','德国','日本','中国','法国','意大利','西班牙','马德里'];
const MODES = [
  { mode: 'category', icon: '🔎', name: '类目搜索采集', desc: '选一级/二级类目浏览 或 关键词搜索, 抓取结果商品', path: '/api/collect/category', fields: [
    { f: 'keyword', label: '自定义关键词 (可选: 选类目后可不填; 未选类目则必填)', ph: '如: car phone holder' },
    { f: 'category', label: '类目 (通过上方一级/二级选择)', ph: '如: Automotive' },
    { f: 'maxPages', label: '翻页数 (每页约16个商品)', type: 'number', def: '2' }
  ], hint: '类目与关键词至少选一: 已选类目时关键词可留空; 一个类目都不选则必须填关键词 · 全程CDP无API · 过滤条件不满足的商品直接跳过, 不入库' },
  { mode: 'batch', icon: '🔄', name: '批量跟卖店铺采集', desc: '遍历已入库商品的跟卖卖家, 逐个跳转店铺采集', path: '/api/collect/follow-shop-batch', fields: [
    { f: 'asins', label: '商品 (ASIN 或 amazon 链接, 逗号分隔)', ph: '如: B0CCD88N2Y,B0H11NJ91L' },
    { f: 'excludeSellers', label: '排除卖家 (名称/ID, 逗号分隔)', ph: '如: jianjun' },
    { f: 'amazonWords', label: '排除亚马逊词汇', def: 'amazon,亚马逊' },
    { f: 'rounds', label: '循环轮次 (0=无限; 1-30=固定轮数)', type: 'number', def: '1' },
    { f: 'concurrency', label: '并行网页数 (1-6)', type: 'number', def: '4' },
    { f: 'maxItems', label: '每店铺商品数上限 (0=无限制)', type: 'number', def: '10' },
    { f: 'maxPages', label: '每店铺翻页数上限 (0=无限制)', type: 'number', def: '2' }
  ], hint: '遍历跟卖卖家店铺采集, 支持循环轮次' },
  { mode: 'brand-batch', icon: '🏷️', name: '批量品牌采集', desc: '取商品库商品的品牌 → 跳转品牌页 → 抓该品牌商品, 适用采集筛选', path: '/api/collect/brand-batch', fields: [
    { f: 'brandsLimit', label: '自动挑品牌数 (从商品库品牌去重, 按商品数从多到少)', type: 'number', def: '2' },
    { f: 'brands', label: '指定品牌 (可选, 逗号分隔; 填了就只采这些品牌)', ph: '如: Lamicall,UGREEN (留空 = 从商品库自动挑)' },
    { f: 'maxPerBrand', label: '每品牌入库数量上限', type: 'number', def: '5' },
    { f: 'maxPages', label: '每品牌翻页数 (每页约16个商品)', type: 'number', def: '2' },
    { f: 'panel', label: '插件面板补全 商标/月销/尺寸 (填 1 开启 · 慢: 每商品约 +8 秒)', ph: '留空 = 关闭; 过滤条件用到 商标/月销 时自动开启' }
  ], hint: '品牌线索来自商品库: 每个品牌取 1 个代表商品 → 打开它的详情页读「品牌跳转链接」→ 跳品牌页抓商品 (不是跟卖卖家店铺) · 每个候选商品读完整详情页 (主图/价格/评分/评论/A+/配送/自营/类目层级/币种) · 下方统一过滤面板 = 采集筛选, 不通过的直接跳过不入库 · 品牌页混入的他牌商品按品牌名比对丢弃' },
];
function fmtMoney(n, cur) {
  if (n == null) return '-';
  const sym = { GBP: '£', USD: '$', EUR: '€', JPY: '¥', CAD: 'C$', INR: '₹', MXN: 'MX$', AUD: 'A$', PLN: 'zł', SEK: 'kr', SAR: 'SAR', SGD: 'S$', BRL: 'R$', TRY: '₺' }[cur] || (cur ? cur + ' ' : '£');
  return sym + Number(n).toFixed(2);
}
function F0() {
  return { sites: ['de'], customSites: '', fulfill: '', shopAplus: '', brandShop: '', brandStore: '', rankRange: '', priceRange: '', ratingRange: '', reviewsRange: '', salesRange: '', tmRange: '', newDaysRange: '', is1688: '', brandStatus: '', tmCountries: '', badges: '', q: '', cat1: '', cat2: '' };
}function FmtMoney(n, cur) {
  if (n == null) return '-';
  const sym = { GBP: '£', USD: '$', EUR: '€', JPY: '¥', CAD: 'C$', INR: '₹', MXN: 'MX$', AUD: 'A$', PLN: 'zł', SEK: 'kr', SAR: 'SAR', SGD: 'S$', BRL: 'R$', TRY: '₺' }[cur] || (cur ? cur + ' ' : '£');
  return sym + Number(n).toFixed(2);
}
function FmtNum(n) { return n == null ? '-' : Number(n).toLocaleString(); }
function Fq() { return { q: '', fba: '', sell: '', aplus: '', badge: '', open: true, priceRange: '', salesRange: '', rankMax: '', rating: '', fAplus: '', tmMax: '', china: '', sites: [], catNot: [], catKw: '', collectedFrom: '', collectedTo: '' }; }
return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    styles.insert('.zyp{font-size:13px;color:var(--dsw-alias-label-primary,#e6e6e6)}' +
          '.zyp-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 14px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-1,#1b1b1f);border:1px solid var(--dsw-alias-border-l2,#2a2a2f);border-radius:10px}' +
          '.zyp-card{background:var(--dsw-alias-bg-layer-1,#1b1b1f);border:1px solid var(--dsw-alias-border-l2,#2a2a2f);border-radius:10px;padding:12px 14px;margin-bottom:12px}' +
          '.zyp-h{font-weight:600;margin:0 0 8px;font-size:13px}' +
          '.zyp-note{color:var(--dsw-alias-label-secondary,#9a9a9a);font-size:12px;line-height:1.6}' +
          '.zyp-lbl{color:var(--dsw-alias-label-secondary,#8a8a8a);font-size:11px;margin-bottom:3px}' +
          '.zyp-input{background:var(--dsw-alias-bg-layer-2,#1b1b1f);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#333);border-radius:7px;padding:5px 8px;font-size:12px;box-sizing:border-box}' +
          '.zyp-btn{border:1px solid var(--dsw-alias-border-l2,#3a3a44);background:var(--dsw-alias-bg-layer-2,#23232a);color:var(--dsw-alias-label-primary,#eee);border-radius:7px;padding:4px 10px;font-size:12px;cursor:pointer;white-space:nowrap}' +
          '.zyp-btn:hover:not([disabled]){border-color:#4f8cff}.zyp-btn[disabled]{opacity:.5;cursor:default}' +
          '.zyp-ok{color:#5fd08a}.zyp-warn{color:#f0b253}.zyp-err{color:#f28b8b}' +
          '.zyp-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:1300px}' +
          '.zyp-tbl th{text-align:left;padding:6px 8px;font-size:11.5px;white-space:nowrap;color:#aaa;border-bottom:1px solid #333;position:sticky;top:0;background:var(--dsw-alias-bg-layer-1,#1b1b1f);z-index:2}' +
          '.zyp-tbl td{padding:5px 8px;border-bottom:1px solid #26262c;vertical-align:top}' +
          '.zyp-badge{display:inline-block;font-size:10.5px;padding:1px 6px;border-radius:999px;line-height:1.5}' +
          '.zyp-bz{background:rgba(240,178,83,.14);color:#f0b253}.zyp-br{background:rgba(242,139,139,.14);color:#f28b8b}.zyp-bg{background:rgba(95,208,138,.14);color:#5fd08a}.zyp-bb{background:rgba(79,140,255,.16);color:#8ab4ff}.zyp-bm{background:rgba(200,150,255,.14);color:#c78}' +
          '.zyp-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}' +
          '.zyp-modal{background:var(--dsw-alias-bg-layer-1,#202027);border:1px solid #3a3a44;border-radius:12px;max-width:900px;width:100%;max-height:88vh;display:flex;flex-direction:column}' +
          '.zyp-mhead{padding:12px 16px;font-weight:700;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center}' +
          '.zyp-mbody{padding:14px 16px;overflow:auto;line-height:1.7;font-size:12.5px}' +
          '.zyp-mfoot{padding:12px 16px;border-top:1px solid #333;display:flex;justify-content:flex-end;gap:8px}' +
          '.zyp-pill{border:1px solid #3a3a44;border-radius:999px;padding:1px 8px;font-size:11px;cursor:pointer;background:transparent;color:inherit;white-space:nowrap}' +
          '.zyp-pill.on{background:rgba(79,140,255,.15)}' +
          '.zyp-lnk{color:#8ab4ff;cursor:pointer;text-decoration:none}' +
          '.zyp-sel{outline:1px solid #4f8cff;outline-offset:-1px}');
styles.insert('.zywb{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary,#e6e6e6)}' +
      '.zywb-top{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#2a2a2a);flex-wrap:wrap}' +
      '.zywb-title{font-weight:700;font-size:15px}' +
      '.zywb-tabs{display:flex;gap:6px;padding:8px 16px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#222)}' +
      '.zywb-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);padding:7px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;border-bottom:2px solid transparent}' +
      '.zywb-tab:hover{color:#eee}.zywb-tab.on{color:#fff;border-bottom-color:#4f8cff;background:rgba(79,140,255,.07)}' +
      '.zywb-body{flex:1;overflow:auto;padding:14px 16px;min-height:0}' +
      '.zywb-card{background:var(--dsw-alias-bg-layer-1,#1b1b1f);border:1px solid var(--dsw-alias-border-l2,#2a2a2f);border-radius:10px;padding:12px 14px;margin-bottom:12px}' +
      '.zywb-h{font-weight:600;margin:0 0 8px;font-size:13px}' +
      '.zywb-note{color:var(--dsw-alias-label-secondary,#9a9a9a);font-size:12px;line-height:1.7}' +
      '.zywb-lbl{color:var(--dsw-alias-label-secondary,#8a8a8a);font-size:11px;margin-bottom:3px}' +
      '.zywb-input{background:var(--dsw-alias-bg-layer-2,#1b1b1f);color:var(--dsw-alias-label-primary,#eee);border:1px solid var(--dsw-alias-border-l2,#333);border-radius:7px;padding:6px 8px;font-size:12px;box-sizing:border-box}' +
      '.zywb-input:focus{outline:none;border-color:#4f8cff}' +
      '.zywb-btn{border:1px solid var(--dsw-alias-border-l2,#3a3a44);background:var(--dsw-alias-bg-layer-2,#23232a);color:var(--dsw-alias-label-primary,#eee);border-radius:8px;padding:5px 11px;font-size:12px;cursor:pointer}' +
      '.zywb-btn:hover:not([disabled]){border-color:#4f8cff}.zywb-btn[disabled]{opacity:.5;cursor:default}' +
      '.zywb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:8px}' +
      '.zywb-ok{color:#5fd08a}.zywb-warn{color:#f0b253}.zywb-err{color:#f28b8b}' +
      '.zywb-table{width:100%;border-collapse:collapse;font-size:12px;min-width:1100px}' +
      '.zywb-table th{text-align:left;padding:6px 8px;font-size:11.5px;white-space:nowrap;color:#aaa;border-bottom:1px solid #333}' +
      '.zywb-table td{padding:6px 6px;border-bottom:1px solid #26262c;vertical-align:top}' +
      '.zywb-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}' +
      '.zywb-modal{background:var(--dsw-alias-bg-layer-1,#202027);border:1px solid #3a3a44;border-radius:12px;max-width:820px;width:100%;max-height:86vh;display:flex;flex-direction:column}' +
      '.zywb-mhead{padding:12px 16px;font-weight:700;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center}' +
      '.zywb-mbody{padding:14px 16px;overflow:auto;line-height:1.8;font-size:12.5px}' +
      '.zywb-mfoot{padding:12px 16px;border-top:1px solid #333;display:flex;justify-content:flex-end;gap:8px}' +
      '.zywb-pill{border:1px solid #3a3a44;border-radius:999px;padding:2px 10px;font-size:11.5px;cursor:pointer;background:transparent;color:inherit}' +
      '.zywb-pill.on{background:rgba(79,140,255,.15)}' +
      '.zywb-lnk{text-decoration:none;color:#8ab4ff}');
    const api = function (path, method, body) {
      return host.call('zying/api', { path: path, method: method, body: body === undefined ? null : body }).then(function (r) {
        if (r && r.ok === false) { const e = new Error(r.error || ('HTTP ' + r.status)); throw e; }
        return r;
      });
    };
    function Modal(props) {
      const btns = props.buttons || [{ label: '关闭', primary: true, onClick: props.onClose }];
      return h('div', { className: 'zywb-mask', onClick: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
        h('div', { className: 'zywb-modal' },
          h('div', { className: 'zywb-mhead' }, h('span', null, props.title), h('button', { onClick: props.onClose, style: { background: 'none', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' } }, '✕')),
          h('div', { className: 'zywb-mbody' }, props.children != null ? props.children : (props.rows || []).map(function (t, i) { return h('div', { key: i }, t); })),
          h('div', { className: 'zywb-mfoot' }, btns.map(function (b, i) { return h('button', { key: i, onClick: b.onClick, className: 'zywb-btn', style: b.primary ? { background: '#2f6feb', borderColor: '#2f6feb', color: '#fff' } : undefined }, b.label); }))));
    }
    function fmtResRows(r) {
      const rows = [];
      if (!r || typeof r !== 'object') return ['(无数据)'];
      if (r.error) return ['✗ ' + r.error];
      if (Array.isArray(r.results)) r.results.forEach(function (res) {
        const head = '第' + (res.round != null ? res.round : '?') + '轮 · ' + (res.asin || '');
        if (res.error) rows.push('✗ ' + head + ' — ' + res.error);
        else rows.push('✓ ' + head + (res.note ? ' (' + res.note + ')' : ''));
        (res.sellers || []).forEach(function (s) { rows.push((s.error ? '✗ ' : '✓ ') + (s.seller || s.sellerId || '?') + (s.error ? ': ' + s.error : ' — 店铺商品 ' + (s.productCount || 0) + ' 个' + (s.skipped ? ' (跳过 ' + s.skipped + ')' : ''))); });
      });
      if (Array.isArray(r.roundResults)) r.roundResults.forEach(function (res) {
        const head = '第' + (res.round != null ? res.round : '?') + '轮 · ' + (res.asin || '') + (res.note ? ' (' + res.note + ')' : '');
        if (res.error) rows.push('✗ ' + head + ' — ' + res.error);
        else rows.push('✓ ' + head + (res.sellerFrom === 'aod' ? ' [aod实时]' : res.sellerFrom === 'history' ? ' [历史兜底]' : '') + (res.sellerCount != null ? ' · ' + res.sellerCount + ' 个卖家' : ''));
        (res.sellers || []).forEach(function (s) { rows.push((s.error ? '✗ ' : '✓ ') + (s.seller || s.sellerId || '?') + (s.error ? ': ' + s.error : ' — 店铺商品 ' + (s.productCount || 0) + ' 个' + (s.skipped ? ' (跳过 ' + s.skipped + ')' : ''))); });
      });
      // 批量品牌采集: 每个品牌一行 (列表/候选/详情已读/入库/筛选跳过/品牌不符)
      if (Array.isArray(r.brands) && r.brands[0] && r.brands[0].candidates != null) r.brands.forEach(function (b) {
        rows.push((b.error ? '⚠ ' : '✓ ') + '品牌 ' + (b.brand || b.lead || '?') + ' — 列表 ' + (b.listCount || 0) + ' 个 · 候选 ' + (b.candidates || 0)
          + ' · 详情已读 ' + (b.read || 0) + ' · 入库 ' + (b.added || 0)
          + (b.skipped ? ' · 筛选跳过 ' + b.skipped : '') + (b.mismatch ? ' · 品牌不符 ' + b.mismatch : '') + (b.error ? ' — ' + b.error : ''));
        if (b.brandUrl) rows.push('   ↳ 品牌跳转 (' + (b.brandSource || '?') + '): ' + String(b.brandUrl).slice(0, 120));
      });
      if (Array.isArray(r.steps)) r.steps.forEach(function (s) { rows.push('· ' + s); });
      let summary = '';
      if (r.seller) summary += '出售单位: ' + r.seller + '; ';
      if (r.shopOk != null) summary += '卖家店铺成功 ' + r.shopOk + ' / 失败 ' + (r.shopFail || 0) + '; ';
      if (r.autoJumps != null) summary += '自动跳转 ' + r.autoJumps + ' 次; ';
      if (r.productCount != null) summary += '抓取 ' + r.productCount + ' 个' + (r.skipped ? ' (过滤跳过 ' + r.skipped + ')' : '') + '; ';
      if (r.added != null) summary += '新增入库 ' + r.added + '; ';
      if (r.total != null) summary += '当前共 ' + r.total + ' 条; ';
      if (r.okRounds != null) summary += '成功 ' + r.okRounds + ' 轮; ';
      if (summary) rows.push(summary.replace(/; $/, ''));
      if (r.stopped) rows.push('⏹ 本次采集已被您手动停止 — 已采集数据已保存入库');
      if (!rows.length) rows.push('✓ 采集完成');
      return rows;
    }
    function NameModal(props) {
      const [v, setV] = React.useState(props.def || '');
      return h(Modal, { title: '保存过滤为规则', onClose: props.onClose, buttons: [{ label: '取消', onClick: props.onClose }, { label: '保存', primary: true, onClick: function () { const nm = v.trim(); if (!nm) return; props.onSave(nm); } }],
        children: h('div', null,
          h('div', { style: { marginBottom: 6 } }, '规则名称 (必填)'),
          h('input', { className: 'zywb-input', value: v, onChange: function (e) { setV(e.target.value); }, style: { width: '100%' } }),
          h('div', { className: 'zywb-note', style: { marginTop: 8 } }, props.hint)) });
    }
    function ModeModal(props) {
      const m = props.modeObj;
      const [vals, setVals] = React.useState({});
      const isCatMode = m.mode === 'category';
      const [cat1, setCat1] = React.useState('');
      const [cat2, setCat2] = React.useState('');
      const fval = function (fd) { return vals[fd.f] != null ? vals[fd.f] : (fd.def != null ? fd.def : ''); };
      const chg = function (fd) { return function (e) { setVals(function (o) { const n = Object.assign({}, o); delete n.__err; n[fd.f] = e.target.value; return n; }); }; };
      const rows = m.fields.map(function (fd) { return h('div', { key: fd.f, style: { marginBottom: 10 } },
        h('div', { className: 'zywb-lbl' }, fd.label),
        h('textarea', { className: 'zywb-input', value: fval(fd), onChange: chg(fd), placeholder: fd.ph || '', rows: (fd.f === 'urls' || fd.f === 'asins') ? 3 : 1, style: { width: '100%', resize: 'vertical' } })); });
      const cat1Opts = CATEGORY_TREE.map(function (c) { return h('option', { key: c.v, value: c.v }, c.l + ' (' + c.v + ')'); });
      const cat1Node = CATEGORY_TREE.find(function (c) { return c.v === cat1; });
      const cat2Arr = (cat1Node && cat1Node.children) || [];
      const cat2Opts = cat2Arr.map(function (c) { return h('option', { key: c[0], value: c[0] }, c[1] + ' (' + c[0] + ')'); });
      const catFields = h('div', null,
        h('div', { className: 'zywb-note', style: { marginBottom: 8 } }, '类目搜索采集: 选 一级类目 + (可选)二级类目 → 在该类目里浏览采集; 或只填自定义关键词搜索采集。'),
        h('div', { style: { marginBottom: 10 } },
          h('div', { className: 'zywb-lbl' }, '一级类目'),
          h('select', { className: 'zywb-input', value: cat1, onChange: function (e) { setCat1(e.target.value); setCat2(''); }, style: { width: '100%' } }, h('option', { value: '' }, '— 不选 (用关键词搜索) —'), cat1Opts)),
        cat1 ? h('div', { style: { marginBottom: 10 } },
          h('div', { className: 'zywb-lbl' }, '二级类目 (可选)'),
          h('select', { className: 'zywb-input', value: cat2, onChange: function (e) { setCat2(e.target.value); }, style: { width: '100%' } }, h('option', { value: '' }, '— 整个 ' + cat1Node.l + ' —'), cat2Opts)) : null,
        h('div', { style: { marginBottom: 10 } },
          h('div', { className: 'zywb-lbl' }, '自定义关键词 (可选)'),
          h('input', { className: 'zywb-input', value: fval({ f: 'keyword' }), onChange: chg({ f: 'keyword' }), placeholder: '如: car phone holder', style: { width: '100%' } })),
        h('div', { style: { marginBottom: 10 } },
          h('div', { className: 'zywb-lbl' }, '翻页数 (每页约16个商品)'),
          h('input', { className: 'zywb-input', type: 'number', value: fval({ f: 'maxPages' }), onChange: chg({ f: 'maxPages' }), style: { width: '100%' } })),
        h('div', { className: 'zywb-note', style: { color: '#8a8a8a', marginTop: 6 } }, '⚠ 选了类目 → 关键词可留空; 一个类目都不选 → 关键词必填。'));
      const onSubmit = function () {
        if (isCatMode) {
          const keyword = String(fval({ f: 'keyword' }) || '').trim();
          const category = cat2 || cat1 || '';
          if (!keyword && !category) {
            setVals(function (o) { return Object.assign({}, o, { __err: '请选择一级/二级类目, 或填写自定义关键词' }); });
            return;
          }
          props.onSubmit({ keyword: keyword, category: category, maxPages: fval({ f: 'maxPages' }) });
          return;
        }
        const out = {}; m.fields.forEach(function (fd) { out[fd.f] = fval(fd); }); props.onSubmit(out);
      };
      const errRow = vals.__err ? h('div', { className: 'zywb-note zywb-err', style: { marginBottom: 8 } }, '⚠ ' + vals.__err) : null;
      return h(Modal, { title: m.icon + ' ' + m.name, onClose: props.onClose, buttons: [{ label: '取消', onClick: props.onClose }, { label: '🚀 开始采集', primary: true, onClick: onSubmit }],
        children: h('div', null, isCatMode ? h('div', null, errRow, catFields) : h('div', null, rows), h('div', { className: 'zywb-note', style: { marginTop: 6 } }, '💡 ' + m.hint)) });
    }
    function CollectPage(props) {
      const [f, setF] = React.useState(F0());
      const [siteOpen, setSiteOpen] = React.useState(false);
      // 统一过滤条件 (与商品管理同一 schema/同一组件): 唯一数据源, 提交时整体作为 filter 传给后端
      const [filt, setFilt] = React.useState(NF());
      const [catTree, setCatTree] = React.useState(null);
      const [fdesc, setFdesc] = React.useState('无过滤');
      const loadCatTree = function () { props.api('/api/products/cat-tree', 'GET', null).then(function (r) { if (r && r.ok && r.json && r.json.tree) setCatTree(r.json); }).catch(function () {}); };
      const [cat2List, setCat2List] = React.useState([]);
      const [rules, setRules] = React.useState([]);
      const [ruleSel, setRuleSel] = React.useState('');
      const [ruleInfo, setRuleInfo] = React.useState('');
      const [modal, setModal] = React.useState(null);
      const [run, setRun] = React.useState(null);
      const [srvRunning, setSrvRunning] = React.useState(false);
      const [prog, setProg] = React.useState('');
      const [logs, setLogs] = React.useState([]);
      const [collectLogs, setCollectLogs] = React.useState([]);   // 采集日志: [{at,to,mode,name,added,count}] 点击跳商品管理
      // 加载历史采集记录 (后端按商品 collectedAt 聚合的批次), 与本次会话记录合并
      const reloadCollectLogs = function () {
        return props.api('/api/collect/logs?limit=80', 'GET', null).then(function (r) {
          const hist = (r && r.ok && r.json && Array.isArray(r.json.logs)) ? r.json.logs : [];
          setCollectLogs(function (cur) {
            // 会话内记录(带新增数)优先保留; 历史部分每次以接口为准重建, 只补会话记录未覆盖的批次
            const sessionLogs = cur.filter(function (g) { return !g.history; });
            const overlap = function (a1, a2, b1, b2) { return a1 <= b2 && b1 <= a2; };
            const toLocal = function (s) {
              const d = new Date(String(s).replace(' ', 'T') + ':00Z');
              if (isNaN(d.getTime())) return s;
              const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
              return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
            };
            const histLogs = hist.filter(function (lg) {
              return !sessionLogs.some(function (g) { return overlap(g.fromUtc, g.toUtc, lg.from, lg.to); });
            }).map(function (lg) {
              return { fromUtc: lg.from, toUtc: lg.to, atLocal: toLocal(lg.from), mode: lg.source, name: lg.name, added: null, count: lg.count, productCount: lg.count, history: true };
            });
            return sessionLogs.concat(histLogs).sort(function (a, b) { return (a.fromUtc < b.fromUtc ? 1 : -1); }).slice(0, 80);
          });
          return hist.length;
        }).catch(function () { return 0; });
      };
      const upd = function (k) { return function (e) { setF(function (o) { return Object.assign({}, o, { [k]: e.target.value }); }); }; };
      // 采集过滤条件 = 统一 filter 对象 (后端 buildCollectFilter 直接读 j.filter)
      const cfValues = function () {
        const custom = f.customSites ? f.customSites.split(/[,， ]+/).filter(Boolean).map(function (x) { return x.toLowerCase(); }) : [];
        const sites = f.sites.concat(custom).filter(function (v, i, a) { return a.indexOf(v) === i; });
        const filt2 = Object.assign({}, filt);
        if (sites.length && !filt2.sites.length) filt2.sites = sites;   // 过滤未指定站点时沿用采集目标站点
        return { filter: filt2 };
      };
      // 过滤条件描述: 由后端 /api/filter/desc 统一生成 (与通知/结果弹窗同一份文案)
      React.useEffect(function () {
        props.api('/api/filter/desc?filter=' + encodeURIComponent(JSON.stringify(filt)), 'GET', null).then(function (r) {
          if (r && r.ok && r.json) setFdesc(r.json.desc || '无过滤');
        }).catch(function () { setFdesc('无过滤'); });
      }, [JSON.stringify(filt)]);
      const activeDesc = function () { return fdesc; };
      const toggleSite = function (s) { setF(function (o) { const arr = o.sites.indexOf(s) >= 0 ? o.sites.filter(function (x) { return x !== s; }) : o.sites.concat([s]); return Object.assign({}, o, { sites: arr }); }); };
      const clearAll = function () { setF(F0()); setCat2List([]); };
      const reloadRules = function () { return props.api('/api/collect-rules', 'GET', null).then(function (r) { if (r && r.ok && r.json && Array.isArray(r.json.rules)) { setRules(r.json.rules); return r.json.rules; } return []; }).catch(function () { return []; }); };
      const loadRuleToUI = function (rule) {
        if (!rule) return;
        // 规则里的过滤条件: 优先用后端已换算好的 canonical (旧规则自动兼容), 否则直接读 filter
        const canon = rule.canonical || (rule.filter && rule.filter.fulfill !== undefined ? rule.filter : null);
        if (canon) { setFilt(Object.assign(NF(), canon)); }
        else { setFilt(NF()); }
        const fl = rule.filter || {};
        // 采集目标站点 (不是过滤条件: 决定去哪里采) 仍走旧字段
        let sites = Array.isArray(fl.filterSites) ? fl.filterSites.slice() : (rule.site ? [rule.site] : ['de']);
        const known = sites.filter(function (s) { return ALL_SITES.indexOf(s) >= 0; });
        const custom = sites.filter(function (s) { return ALL_SITES.indexOf(s) < 0; }).join(',');
        let cat1 = '', cat2 = '', cat2arr = [];
        const nf = F0();
        nf.sites = known.length ? known : ['de'];
        nf.customSites = custom;
        setF(nf); setCat2List(cat2arr);
        setRuleInfo('已加载规则「' + rule.name + '」' + (canon ? '' : ' (旧规则无过滤条件)'));
      };
      React.useEffect(function () { reloadRules(); reloadCollectLogs(); }, []);
      // 常驻轮询服务端真实进度: 采集可能由别处发起(API/工具/另一标签页), 停止按钮必须按服务端状态启用
      React.useEffect(function () {
        const poll = function () { props.api('/api/collect/progress', 'GET', null).then(function (r) {
          if (r && r.ok && r.json && r.json.running) {
            const g = r.json; const p = [];
            setSrvRunning(true);
            if (g.step) p.push(g.step);
            if (g.startedAt) p.push(Math.round((Date.now() - g.startedAt) / 1000) + 's');
            if (g.items != null) p.push('采集 ' + g.items);
            if (g.added != null) p.push('新增 ' + g.added);
            if (g.page != null && g.pages != null) p.push('第 ' + g.page + '/' + g.pages + ' 页');
            if (g.detailDone != null && g.detailTotal != null) p.push('详情 ' + g.detailDone + '/' + g.detailTotal);
            if (g.round != null && g.rounds != null) p.push('第 ' + g.round + '/' + g.rounds + ' 轮');
            if (g.shopsDone != null && g.shopsTotal != null) p.push('店铺 ' + g.shopsDone + '/' + g.shopsTotal);
            if (g.mode) p.push('[' + g.mode + ']');
            setProg('⏳ ' + p.join(' · '));
          } else { setSrvRunning(false); setProg(''); }
        }).catch(function () {}); };
        poll();
        const off = ctx.interval(poll, 2000);
        return function () { if (typeof off === 'function') { try { off(); } catch (e) {} } };
      }, []);
      const doCollect = function (modeObj, vals) {
        const body = {};
        modeObj.fields.forEach(function (fd) {
          let v = vals[fd.f];
          if (fd.type === 'number') { const pv = parseInt(v, 10); v = (v === '' || isNaN(pv)) ? '' : pv; }
          body[fd.f] = v;
        });
        if (body.asins != null && typeof body.asins === 'string') { const NL = String.fromCharCode(10); body.asins = body.asins.split(NL).join(',').split(/[,， ]+/).filter(Boolean); }
        if (body.urls != null && typeof body.urls === 'string') { const NL2 = String.fromCharCode(10); body.urls = body.urls.split(NL2).join(',').split(/[,， ]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
        const isAmazon = function (u) { return /^https:/.test(u) && u.indexOf('amazon.') > 0; };
        const warn = function (msg) { setModal({ kind: 'alert', title: '⚠️ 校验失败', rows: [msg] }); };
        if (modeObj.mode === 'shop' && !isAmazon(String(body.url || ''))) { warn('无效链接 — 请输入 amazon 商品链接'); return; }
        if (modeObj.mode === 'parallel' && (body.urls || []).some(function (u) { return !isAmazon(String(u)); })) { warn('存在非 amazon 链接'); return; }
        if ((modeObj.mode === 'category' || modeObj.mode === 'bulk') && !String(body.keyword || '').trim() && !String(body.category || '').trim()) { warn('请输入关键词或类目'); return; }
        if (modeObj.mode === 'catmenu' && !String(body.category || '').trim()) { warn('请输入大类目名'); return; }
        if (modeObj.mode === 'batch' && (!body.asins || !body.asins.length)) { warn('请输入商品 ASIN 或链接'); return; }
        if (modeObj.mode === 'parallel' && (!body.urls || !body.urls.length)) { warn('请输入商品 ASIN 或链接'); return; }
        const cf = cfValues();
        const payload = Object.assign({}, cf);
        // payload.filter = 统一过滤条件; 采集目标站点由 body.site 决定 (不是过滤条件)
        const targetSites = (payload.filter && payload.filter.sites && payload.filter.sites.length) ? payload.filter.sites : f.sites.concat(f.customSites ? f.customSites.split(/[,， ]+/).filter(Boolean) : []);
        if (modeObj.mode === 'category' || modeObj.mode === 'bulk' || modeObj.mode === 'catmenu' || modeObj.mode === 'brand-batch') body.site = targetSites[0] || 'de';
        Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
        setModal(null); setRun({ mode: modeObj.mode }); setProg('⏳ 启动…');
        const startedAtLocal = new Date();   // 本次采集开始时间 (本地), 用于采集日志
        setLogs(function (ls) { return ls.concat(['▶ ' + startedAtLocal.toLocaleTimeString('zh-CN') + ' 启动 ' + modeObj.name + ' · 过滤: ' + activeDesc()]); });
        props.api(modeObj.path, 'POST', body).then(function (r) {
          setRun(null); setProg('');
          const rows = r && r.ok ? fmtResRows(r.json) : ['✗ ' + ((r && r.error) || '采集失败, 请确认 Edge 9222 已开启')];
          setModal({ kind: 'alert', title: modeObj.name + ' 结果', rows: rows });
          setLogs(function (ls) { return ls.concat(['✔ ' + new Date().toLocaleTimeString('zh-CN') + ' ' + modeObj.name + ' 完成']); });
          // 采集日志: 记录起止时间(UTC, 与商品 collectedAt 同基准) + 采集数量, 供跳转商品管理过滤
          if (r && r.ok && r.json) {
            const g = r.json;
            const endedAtLocal = new Date();
            const toUtcMin = function (d) { return d.toISOString().slice(0, 16).replace('T', ' '); };
            const count = (g.added != null ? g.added : 0) || (g.productCount != null ? g.productCount : 0);
            setCollectLogs(function (ls) {
              return [{
                fromUtc: toUtcMin(startedAtLocal), toUtc: toUtcMin(endedAtLocal),
                atLocal: startedAtLocal.toLocaleString('zh-CN', { hour12: false }).slice(0, 16),
                mode: modeObj.mode, name: modeObj.name,
                added: g.added || 0, count: count, productCount: g.productCount || 0,
              }].concat(ls).slice(0, 50);
            });
          }
        }).catch(function (e) {
          setRun(null); setProg('');
          setModal({ kind: 'alert', title: '❌ ' + modeObj.name + '失败', rows: [String(e && e.message || e)] });
        });
      };
      const doStop = function () { props.api('/api/collect/stop', 'POST', {}).then(function () { setProg('⏹ 已请求停止, 当前步骤完成后退出'); }).catch(function (e) { setProg('✗ 停止失败: ' + String(e && e.message || e)); }); };
      // 采集过滤 = 统一过滤面板 (与商品管理完全相同的一个组件)
      const filterCard = h('div', { className: 'zywb-card' },
        h(ZypFilterPanel, { value: filt, onChange: setFilt, catTree: catTree, onReloadCat: loadCatTree }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' } },
          h('button', { className: 'zywb-btn', onClick: function () { setFilt(NF()); } }, '✕ 清空过滤'),
          h('span', { className: 'zywb-note' }, '当前过滤: ' + activeDesc()),
          h('span', { className: 'zywb-note', style: { marginLeft: 'auto' } }, '与商品管理筛选同一逻辑 · 被筛除的商品直接跳过(不跳详情/不入库)')));
      const ruleButtons = h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 } },
        h('select', { className: 'zywb-input', value: ruleSel, onChange: function (e) { setRuleSel(e.target.value); }, style: { maxWidth: 240 } }, h('option', { value: '' }, '— 选择规则 —'), rules.map(function (r) { return h('option', { key: r.name, value: r.name }, r.name); })),
        h('button', { className: 'zywb-btn', onClick: function () { const def = 'FBA筛选' + new Date().toLocaleDateString('zh-CN'); setModal({ kind: 'name', def: def, hint: '将保存: 采集站点 ' + f.sites.join(',') + ' · 过滤 ' + activeDesc() }); } }, '保存当前为规则'),
        h('button', { className: 'zywb-btn', onClick: function () { if (!ruleSel) { setRuleInfo('请先选择规则'); return; } props.api('/api/collect-rules', 'GET', null).then(function (r) { if (r && r.ok && r.json) { const rule = r.json.rules.find(function (x) { return x.name === ruleSel; }); if (rule) loadRuleToUI(rule); else setRuleInfo('规则不存在'); } }); } }, '加载选中'),
        h('button', { className: 'zywb-btn', onClick: function () { if (!ruleSel) { setRuleInfo('请先选择规则'); return; } setModal({ kind: 'confirmDel', name: ruleSel }); } }, '删除选中'),
        h('span', { className: 'zywb-note zywb-ok' }, ruleInfo));
      const rulePills = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } }, rules.map(function (r) { return h('button', { key: r.name, className: 'zywb-pill' + (r.name === ruleSel ? ' on' : ''), onClick: function () { setRuleSel(r.name); loadRuleToUI(r); } }, r.name); }));
      const modeCards = MODES.map(function (m) { return h('button', { key: m.mode, onClick: function () { setModal({ kind: 'mode', mode: m }); }, disabled: !!run, style: { textAlign: 'left', display: 'block', border: '1px solid #333', background: run ? 'transparent' : 'var(--dsw-alias-bg-layer-2,#24242b)', borderRadius: 10, padding: 10, cursor: run ? 'not-allowed' : 'pointer', opacity: run ? .55 : 1 } },
        h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 3 } }, m.icon + ' ' + m.name),
        h('div', { className: 'zywb-note' }, m.desc),
        run && run.mode === m.mode ? h('div', { className: 'zywb-note zywb-warn', style: { marginTop: 5 } }, prog) : null); });
      return h('div', null,
        filterCard,
        h('div', { className: 'zywb-card' }, h('div', { className: 'zywb-h' }, '💾 过滤规则 (保存/加载/删除)'), ruleButtons, rulePills),
        h('div', { className: 'zywb-card' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { className: 'zywb-h', style: { flex: 1, margin: 0 } }, '🚀 采集方式 (点击卡片开始, 全程CDP无API)'),
            (run || srvRunning) ? h('span', { className: 'zywb-note zywb-warn' }, prog) : null,
            h('button', { className: 'zywb-btn', onClick: doStop, disabled: !(run || srvRunning), style: { color: '#f28b8b' } }, '⏹ 停止')),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8, marginTop: 10 } }, modeCards)),
        collectLogs.length ? h('div', { className: 'zywb-card' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { className: 'zywb-h', style: { flex: 1, margin: 0 } }, '🗂 采集记录 (' + collectLogs.length + ') — 点击跳转商品管理, 只显示该次采集的商品'),
            h('button', { className: 'zywb-btn', onClick: function () { reloadCollectLogs(); } }, '⟳ 刷新')),
          h('div', { style: { maxHeight: 260, overflow: 'auto', marginTop: 6 } }, collectLogs.map(function (g, i) {
            return h('div', { key: i, onClick: function () { if (props.onOpenProducts) props.onOpenProducts(g); }, title: '点击查看该次采集的商品 (' + g.fromUtc + ' ~ ' + g.toUtc + ' UTC)', style: { display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px', borderBottom: '1px dashed #2a2a30', fontSize: 12, cursor: 'pointer', borderRadius: 6 } },
              h('span', { style: { color: '#8ab4ff', fontWeight: 600, whiteSpace: 'nowrap' } }, g.atLocal),
              h('span', { className: 'zywb-note', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, g.name + ' · 采集 ' + (g.productCount || g.count || 0) + ' 个'),
              g.added != null ? h('span', { style: { color: '#5fd08a', fontWeight: 600, whiteSpace: 'nowrap' } }, '新增 ' + g.added) : h('span', { className: 'zywb-note', style: { whiteSpace: 'nowrap' } }, '历史批次'),
              h('span', { className: 'zywb-note', style: { color: '#8ab4ff', whiteSpace: 'nowrap' } }, '查看商品 →'));
          }))) : null,
        logs.length ? h('div', { className: 'zywb-card' }, h('div', { className: 'zywb-h' }, '📄 采集日志'), h('div', { style: { maxHeight: 150, overflow: 'auto', fontSize: 12, lineHeight: 1.7 } }, logs.map(function (t, i) { return h('div', { key: i }, t); }))) : null,
        modal && modal.kind === 'alert' ? h(Modal, { title: modal.title, rows: modal.rows, onClose: function () { setModal(null); } }) : null,
        modal && modal.kind === 'confirmDel' ? h(Modal, { title: '删除规则', rows: ['确定删除规则「' + modal.name + '」吗?'], onClose: function () { setModal(null); }, buttons: [{ label: '取消', onClick: function () { setModal(null); } }, { label: '确定删除', primary: true, onClick: function () { props.api('/api/collect-rules/delete', 'POST', { name: modal.name }).then(function () { setRuleInfo('🗑 已删除「' + modal.name + '」'); setModal(null); setRuleSel(''); reloadRules(); }).catch(function (e) { setRuleInfo('删除失败: ' + String(e && e.message || e)); }); } }] }) : null,
        modal && modal.kind === 'name' ? h(NameModal, { def: modal.def, hint: modal.hint, onClose: function () { setModal(null); }, onSave: function (nm) { props.api('/api/collect-rules', 'POST', { name: nm, site: (filt.sites && filt.sites[0]) || f.sites[0] || 'de', filter: filt }).then(function (r) { setRuleInfo('✔ 已保存规则「' + nm + '」'); setModal(null); reloadRules(); }).catch(function (e) { setRuleInfo('保存失败: ' + String(e && e.message || e)); }); } }) : null,
        modal && modal.kind === 'mode' ? h(ModeModal, { modeObj: modal.mode, onClose: function () { setModal(null); }, onSubmit: function (vals) { doCollect(modal.mode, vals); } }) : null);
    }
function openExternal(url, title) {
      if (!url) return;
      const u = String(url);
      // ① 首选: 交给本机服务用系统默认浏览器打开 (真·本地浏览器)
      try {
        if (typeof fetch === 'function') {
          fetch('http://127.0.0.1:3088/api/open?url=' + encodeURIComponent(u), { method: 'GET', cache: 'no-store' })
            .then(function (r) { if (!r || !r.ok) throw new Error('open api ' + (r && r.status)); })
            .catch(function () { openExternalFallback(u); });
          return;
        }
      } catch (e) { /* 同步异常 → 兜底 */ }
      openExternalFallback(u);
    }
    // 兜底: ERP 服务不可用时, 在当前浏览器开新标签 (仍不使用任何侧边栏/内嵌浏览)
    function openExternalFallback(url) {
      try {
        const w = (typeof window !== 'undefined' && window.open) ? window.open(url, '_blank', 'noopener,noreferrer') : null;
        if (w) return;
      } catch (e) { /* ignore */ }
      try {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { /* ignore */ }
    }

const SITES9 = [['de', '🇩🇪德国'], ['uk', '🇬🇧英国'], ['us', '🇺🇸美国'], ['fr', '🇫🇷法国'], ['it', '🇮🇹意大利'], ['es', '🇪🇸西班牙'], ['jp', '🇯🇵日本'], ['ca', '🇨🇦加拿大'], ['au', '🇦🇺澳大利亚'], ['in', '🇮🇳印度']];
    const CAT9 = [
      { v: 'Electronics', l: '电子', children: [['Cell Phones & Accessories', '手机及配件'], ['Computers & Accessories', '电脑及配件'], ['Headphones', '耳机音响'], ['Camera & Photo', '相机摄影'], ['TV', '电视影音'], ['Video Games', '游戏主机']] },
      { v: 'Automotive', l: '汽车', children: [['Automotive Parts', '汽车配件'], ['Car Electronics', '车载电子'], ['Car Care', '汽车护理'], ['Tires & Wheels', '轮胎轮毂']] },
      { v: 'Home & Kitchen', l: '家居厨房', children: [['Kitchen', '厨房用品'], ['Storage & Organization', '收纳整理'], ['Furniture', '家具'], ['Cleaning', '清洁用品'], ['Bedding', '床上用品']] },
      { v: 'Toys & Games', l: '玩具游戏', children: [['Toys', '儿童玩具'], ['Board Games', '桌游卡牌'], ['Action Figures', '模型手办'], ['Puzzles', '拼图积木']] },
      { v: 'Sports & Outdoors', l: '运动户外', children: [['Fitness', '健身器材'], ['Camping & Hiking', '露营野餐'], ['Cycling', '骑行装备'], ['Water Sports', '水上运动']] },
      { v: 'Beauty', l: '美妆个护', children: [['Skin Care', '护肤'], ['Makeup', '彩妆'], ['Hair Care', '美发'], ['Fragrance', '香水']] },
      { v: 'Clothing', l: '服装鞋靴', children: [['Men', '男装'], ['Women', '女装'], ['Shoes', '鞋靴'], ['Accessories', '服饰配件']] },
      { v: 'Tools', l: '工具五金', children: [['Hand Tools', '手动工具'], ['Power Tools', '电动工具'], ['Hardware', '五金配件']] },
      { v: 'Office Products', l: '办公用品', children: [['Office Supplies', '办公文具'], ['Ink & Toner', '打印耗材']] },
      { v: 'Garden', l: '花园', children: [['Garden Tools', '园艺工具'], ['Lawn Care', '草坪护理'], ['Patio', '户外装饰']] },
      { v: 'Pet Supplies', l: '宠物用品', children: [['Dog Supplies', '狗狗用品'], ['Cat Supplies', '猫咪用品'], ['Pet Food', '宠物食品']] }
    ];
    // 导出可勾选列 (与后端 EXPORT_FIELDS 对应; 第三项 true=默认"重要信息"列)
    const EXPORT_COLS = [
      ['asin', 'ASIN', true], ['site', '站点', true], ['title', '标题', true], ['price', '价格', true], ['currency', '币种', true],
      ['fulfill', '配送', true], ['amz', '自营', true], ['aplus', 'A+', true], ['choice', 'AC', true], ['url', '跳转链接', true],
      ['brand', '品牌', false], ['rating', '评分', false], ['reviews', '评论数', false], ['follow', '跟卖数', false],
      ['monthlySales', '月销', false], ['rank', 'BSR', false], ['category', '类目', false], ['badge', '标签', false],
      ['image', '主图', false], ['collectedAt', '采集时间', false], ['source', '采集方式', false]
    ];
    const EXPORT_BASE = 'http://127.0.0.1:3088/api/products/export';
    const UI_BUILD = 'built-20260911-verify';   // 界面构建标记: 商品管理工具栏会显示, 用于确认已加载新版本
    // ===== 统一过滤面板 (商品管理 + 采集过滤 共用同一组件 / 同一 schema) =====
    // 后端适配: canonical → GET /api/products?filter=<json> (查库) / POST /api/collect/* {filter} (采集判定)
    // 语义差异(有意): 采集时未知字段放行(详情页读到再判); 商品库里未知字段视为不满足。
    function NF() {
      return { sites: [], fulfill: '', sell: '', aplus: '', badges: [], china: '', noRank: false,
        priceRange: '', salesRange: '', rankRange: '', ratingRange: '', reviewsRange: '', followRange: '',
        tmRange: '', newDaysRange: '', tmCountries: '', is1688: '', brandStatus: '', q: '',
        catNot: [], catKw: '', collectedFrom: '', collectedTo: '',
        shopAplus: '', brandShop: '', brandStore: '' };
    }
    const BADGE_OPTS = [['bestseller', 'Best Seller'], ['choice', "AC"], ['deal', '限时优惠'], ['newrelease', '新品'], ['A+', 'A+']];
    const BRAND_STATUS_OPTS = [['', '不限'], ['registered', '排除已备案'], ['tm', '排除 TM'], ['notfound', '仅未查到']];
    const FILTER_SITES = [['de', '🇩🇪德国'], ['uk', '🇬🇧英国'], ['us', '🇺🇸美国'], ['fr', '🇫🇷法国'], ['it', '🇮🇹意大利'], ['es', '🇪🇸西班牙'], ['jp', '🇯🇵日本'], ['ca', '🇨🇦加拿大'], ['au', '🇦🇺澳大利亚'], ['in', '🇮🇳印度'], ['mx', '🇲🇽墨西哥'], ['br', '🇧🇷巴西'], ['nl', '🇳🇱荷兰'], ['se', '🇸🇪瑞典'], ['pl', '🇵🇱波兰'], ['sg', '🇸🇬新加坡'], ['tr', '🇹🇷土耳其'], ['ae', '🇦🇪阿联酋'], ['sa', '🇸🇦沙特']];
    function ZypFilterPanel(props) {
      const v = props.value || NF();
      const mode = props.mode || 'product';
      const tree = props.catTree || null;
      const ch = function (patch) { props.onChange(Object.assign({}, v, patch)); };
      const sete = function (k) { return function (e) { const x = {}; x[k] = e.target.value; ch(x); }; };
      const toggle = function (k, val) { const arr = v[k] || []; const nx = {}; nx[k] = arr.indexOf(val) >= 0 ? arr.filter(function (z) { return z !== val; }) : arr.concat([val]); ch(nx); };
      const chip = function (k, val, label) {
        const on = (v[k] || []).indexOf(val) >= 0;
        return h('label', { key: k + '|' + val, style: { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12, border: '1px solid ' + (on ? (k === 'catNot' ? '#a33' : '#4f8cff') : '#333'), borderRadius: 6, padding: '1px 7px', cursor: 'pointer', background: on ? (k === 'catNot' ? 'rgba(255,120,120,.16)' : 'rgba(79,140,255,.14)') : 'transparent' } },
          h('input', { type: 'checkbox', checked: on, onChange: function () { toggle(k, val); } }), label);
      };
      const inp = function (k, ph) { return h('input', { className: 'zyp-input', value: v[k] || '', onChange: sete(k), placeholder: ph, style: { width: '100%' } }); };
      const sel = function (k, opts) { return h('select', { className: 'zyp-input', value: v[k] || '', onChange: sete(k), style: { width: '100%' } }, opts.map(function (o) { return h('option', { key: o[0], value: o[0] }, o[1]); })); };
      const fld = function (label, node) { return h('div', null, h('div', { className: 'zyp-lbl' }, label), node); };
      const wide = function (label, node) { return h('div', { style: { gridColumn: '1/-1' } }, h('div', { className: 'zyp-lbl' }, label), node); };
      const l1 = (tree && tree.tree ? tree.tree : []).filter(function (n) { return n.cat1 !== '(未分类)'; });
      const unc = (tree && tree.tree ? tree.tree : []).filter(function (n) { return n.cat1 === '(未分类)'; })[0];
      const l2groups = l1.filter(function (n) { return (v.catNot || []).indexOf(n.cat1) >= 0 && n.children && n.children.length; });
      return h('div', { className: 'zyp-card', style: props.open === false ? { display: 'none' } : {} },
        h('div', { className: 'zyp-h' }, props.title || '🎛 过滤条件'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: 8 } },
          wide('站点 (多选, 不选=全部)', h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, FILTER_SITES.map(function (s) { return chip('sites', s[0], s[1]); }))),
          fld('配送方式', sel('fulfill', [['', '不限'], ['FBA', 'FBA'], ['FBM', 'FBM'], ['AMZ', 'AMZ 自营']])),
          fld('卖家', sel('sell', [['', '不限'], ['amz', '仅 AMZ 自营'], ['third', '仅第三方卖家']])),
          fld('A+', sel('aplus', [['', '不限'], ['1', '仅有 A+'], ['0', '排除 A+']])),
          fld('中国卖家', sel('china', [['', '不限'], ['1', '中国卖家'], ['0', '非中国卖家']])),
          fld('价格区间', inp('priceRange', '如 10-100')),
          fld('月销区间', inp('salesRange', '如 100-5000')),
          fld('BSR 区间', inp('rankRange', '如 1000-500000')),
          fld('评分区间', inp('ratingRange', '如 3.5-4.8')),
          fld('评论数区间', inp('reviewsRange', '如 50-5000')),
          fld('跟卖数区间', inp('followRange', '如 1-20')),
          fld('排除商标数区间', inp('tmRange', '如 50- (排除≥50)')),
          fld('上架天数区间', inp('newDaysRange', '如 30-180')),
          fld('排除商标国家', inp('tmCountries', '欧盟,美国…')),
          fld('1688 同款', sel('is1688', [['', '不限'], ['1', '仅有 1688 同款'], ['0', '排除 1688 同款']])),
          fld('品牌状态', sel('brandStatus', BRAND_STATUS_OPTS)),
          fld('标题含关键词', inp('q', '如 anker')),
          fld('无排名', h('label', { style: { display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, paddingTop: 6 } }, h('input', { type: 'checkbox', checked: !!v.noRank, onChange: function () { ch({ noRank: !v.noRank }); } }), '只看无 BSR 排名的商品')),
          fld('A+ 店铺 *', sel('shopAplus', [['', '不限'], ['1', '仅有 A+ 店铺'], ['0', '排除 A+ 店铺']])),
          fld('品牌店铺 *', sel('brandShop', [['', '不限'], ['0', '排除品牌店铺'], ['1', '仅品牌店铺']])),
          fld('品牌店筛选 *', inp('brandStore', '品牌名 或 !排除')),
          fld('采集时间 起 *', h('input', { className: 'zyp-input', type: 'datetime-local', value: v.collectedFrom || '', onChange: sete('collectedFrom'), style: { width: '100%' } })),
          fld('采集时间 止 *', h('input', { className: 'zyp-input', type: 'datetime-local', value: v.collectedTo || '', onChange: sete('collectedTo'), style: { width: '100%' } })),
          wide('页面标识 (多选)', h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, BADGE_OPTS.map(function (b) { return chip('badges', b[0], b[1]); }))),
          wide('类目 (排除法: 命中任一项即剔除; 排除一级 = 整枝排除)', h('div', null,
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 150, overflow: 'auto', border: '1px solid #333', borderRadius: 8, padding: 6 } },
              l1.length ? l1.map(function (n) { return chip('catNot', n.cat1, n.cat1 + ' (' + n.count + ')'); })
                : h('span', { className: 'zyp-note' }, props.catHint || '暂无一级类目数据 (可去商品管理点「用榜单类目即时推算」)')),
            l2groups.length ? h('div', { style: { marginTop: 6 } }, l2groups.map(function (n) {
              return h('div', { key: n.cat1 }, h('div', { className: 'zyp-note' }, '└ ' + n.cat1 + ' 的二级'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, margin: '2px 0 6px' } }, n.children.map(function (c) { return chip('catNot', c.cat2, c.cat2 + ' (' + c.count + ')'); })));
            })) : null,
            h('div', { style: { marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
              h('input', { className: 'zyp-input', value: v.catKw || '', onChange: sete('catKw'), placeholder: '也可手填关键词, 逗号分隔 (如 Books, Cable)', style: { flex: 1, minWidth: 240 } }),
              unc ? h('button', { className: 'zyp-btn', onClick: function () { toggle('catNot', '(未分类)'); } }, ((v.catNot || []).indexOf('(未分类)') >= 0 ? '☑' : '☐') + ' 排除未采集类目 (' + unc.count + ')') : null,
              props.onReloadCat ? h('button', { className: 'zyp-btn', onClick: props.onReloadCat }, '⟳ 刷新类目') : null)))),
      h('div', { className: 'zyp-note', style: { marginTop: 6, fontSize: 10.5 } }, '区间格式: 最小-最大 (单个数字=≥; 如 1000-500000, -5000 表示 ≤5000)。带 * 的条件仅在对应场景生效: 采集时间* 看的是入库时间(仅商品库); A+店铺/品牌店铺/品牌店筛选* 是店铺维度(仅采集时判定); 其余条件两处完全同义。'));
    }

    function DetailPane(props) {
      const p = props.p || {};
      const api = props.api;
      const openExternal = props.openExternal;
      const notify = props.notify || function () {};
      const [md, setMd] = React.useState(null); // {kind:'img'|'quote'|'confirm'|'add', ...}
      const [big, setBig] = React.useState(false);
      const [claimed, setClaimed] = React.useState(!!(p.claimedAt || p.claimed));
      const [msg, setMsg] = React.useState('');
      const [prof, setProf] = React.useState(null); // 利润测算结果 (后端 /api/profit/calc 逐项返回)
      const [busy, setBusy] = React.useState('');
      // 利润测算输入 (全部可改; 默认值由后端按站点/类目/采集数据带出)
      const [wKg, setWKg] = React.useState('');
      const [dims, setDims] = React.useState('');
      const [supply, setSupply] = React.useState('');       // 货源成本 (¥)
      const [logi, setLogi] = React.useState('');           // 头程/FBM国际运费 (¥)
      const [duty, setDuty] = React.useState('');           // 关税/进口VAT (¥, 无法自动获取)
      const [storage, setStorage] = React.useState('');     // 仓储/其他 (¥)
      const [other, setOther] = React.useState('');         // 其他成本 (¥)
      const [fmode, setFmode] = React.useState(p.amazonSell ? 'AMZ' : (p.fulfill === 'FBA' ? 'FBA' : 'FBM'));
      const [pBasis, setPBasis] = React.useState('buybox'); // 售价口径: buybox|min|manual
      const [pManual, setPManual] = React.useState('');
      const [acos, setAcos] = React.useState('12');
      const [returnRate, setReturnRate] = React.useState('3');
      const [payRate, setPayRate] = React.useState('0.5');
      const [fxLoss, setFxLoss] = React.useState('0.5');
      const [targetMargin, setTargetMargin] = React.useState('20');
      const [rate, setRate] = React.useState(null);
      const [ratesTxt, setRatesTxt] = React.useState('');
      const [fxAll, setFxAll] = React.useState(null);        // /api/rates 的整张表 (货源比价换算要用到非站点币种)
      const [taxInfo, setTaxInfo] = React.useState(null);   // 税率表 (来源/含税口径)
      const [ovaVat, setOvaVat] = React.useState('');       // 手改 VAT 率
      const [ovaComm, setOvaComm] = React.useState('');     // 手改 佣金率
      const [ovaFba, setOvaFba] = React.useState('');       // 手改 FBA 配送费
      // 1688 图搜
      const [g1688, setG1688] = React.useState(null);
      const [gBusy, setGBusy] = React.useState(false);
      // 货源
      const [goods, setGoods] = React.useState(Array.isArray(p.sourceGoods) ? p.sourceGoods.slice() : []);
      const [gPlat, setGPlat] = React.useState('1688');
      const [gUrl, setGUrl] = React.useState('');
      const [fetchBusy, setFetchBusy] = React.useState(false);
      const cur = p.currency || 'EUR';
      const siteU = String(p.site || 'de').toUpperCase();
      const CURR_SYM2 = { GBP: '£', USD: '$', EUR: '€', JPY: '¥', CAD: 'C$', INR: '₹', MXN: 'MX$', AUD: 'A$', PLN: 'zł', SEK: 'kr', SAR: 'SAR', SGD: 'S$', BRL: 'R$', TRY: '₺' };
      const fmt = function (n) { return n == null ? '-' : (CURR_SYM2[cur] || cur + ' ') + Number(n).toFixed(2); };
      const fmtN = function (n) { return n == null ? '-' : Number(n).toLocaleString(); };
      // 外链地址 (站点后缀必须与后端 siteToHostSuffix 一致, 否则小站点会拼出 amazon.tr 这类错误域名)
      const DOM = { uk: 'co.uk', us: 'com', jp: 'co.jp', au: 'com.au', mx: 'com.mx', br: 'com.br', sg: 'com.sg', tr: 'com.tr', ae: 'ae', sa: 'sa', nl: 'nl', se: 'se', pl: 'pl', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' };
      const amzDom = DOM[p.site] || p.site || 'de';
      const amzUrl = 'https://www.amazon.' + amzDom + '/dp/' + p.asin;
      const enc = function (s) { return encodeURIComponent(String(s == null ? '' : s)); };
      const kw = enc((p.title || '').slice(0, 40));
      const mainImg = p.mainImage || '';
      const siteCountry = { de: 'DE', uk: 'GB', us: 'US', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', jp: 'JP', ca: 'CA', in: 'IN', au: 'AU' }[p.site] || 'GB';
      const parseKg = function (s) {
        const str = String(s || '');
        const m = str.match(/[0-9.]+/);
        if (!m) return null;
        const v = parseFloat(m[0]);
        if (str.indexOf('pound') >= 0) return Math.round(v * 0.4536 * 1000) / 1000;
        if (/(^|[^a-zA-Z])g([^a-zA-Z]|$)/.test(str) && str.toLowerCase().indexOf('kg') < 0) return Math.round(v / 1000 * 1000) / 1000;
        return v;
      };
      const firstNums = function (s) { const arr = String(s || '').match(/[0-9.]+/g); return arr ? arr.slice(0, 3).map(parseFloat) : []; };
      const wG = parseKg(p.weight) != null ? parseKg(p.weight) : (parseKg(p.packWeight) || 0);
      const dimArr = firstNums(p.size || p.packSize);
      // ---- 行渲染辅助 ----
      const Row = function (k, v, wide) { return h('div', { key: k, style: { fontSize: 12, padding: '2px 0' } }, h('span', { style: { color: '#8a8a8a', marginRight: 6 } }, k + ':'), h('span', { style: { wordBreak: 'break-word' } }, v == null || v === '' ? '-' : String(v))); };
      const gridRows = [];
      gridRows.push(Row('ASIN', p.asin)); gridRows.push(Row('品牌', p.brand));
      gridRows.push(Row('商标记录', p.trademarkCount != null ? (p.trademarkCount + ' 条' + (p.tmText ? ' (' + p.tmText + ')' : '')) : null));
      if (Array.isArray(p.tmCountries) && p.tmCountries.length) gridRows.push(Row('商标注册国家', p.tmCountries.join('、')));
      gridRows.push(Row('榜单排名', p.rank)); gridRows.push(Row('类目', p.category));
      gridRows.push(Row('站点', p.site)); gridRows.push(Row('当前价格', fmt(p.minPrice != null ? p.minPrice : p.price)));
      if (p.buyBoxPrice != null && p.buyBoxPrice !== (p.minPrice != null ? p.minPrice : p.price)) gridRows.push(Row('BuyBox 价', fmt(p.buyBoxPrice)));
      gridRows.push(Row('全部跟卖', Array.isArray(p.offerPrices) ? p.offerPrices.length + ' 个' : null));
      gridRows.push(Row('月销量', fmtN(p.monthlySales)));
      gridRows.push(Row('评分 / 评论', p.rating ? p.rating + '★ / ' + fmtN(p.reviews) : null));
      gridRows.push(Row('库存', fmtN(p.stock))); gridRows.push(Row('跟卖数量', p.followCount != null ? p.followCount + ' 个' : null));
      gridRows.push(Row('中国卖家', p.chinaSeller ? '是' : (p.chinaSeller === false ? '否' : null)));
      gridRows.push(Row('Amazon自营', p.amazonSell ? '是' : null)); gridRows.push(Row('配送', p.fulfill));
      gridRows.push(Row('FBA 配送费', p.fbaFee != null ? fmt(p.fbaFee) : null));
      gridRows.push(Row('佣金 (按类目费率表估)', p.referralFee != null ? fmt(p.referralFee) : null));
      // 「净收益(估)」已移除: 旧字段是 price×0.55−3.2 的硬编码产物, 与下方利润测算口径冲突 → 利润只在利润测算面板出现一次
      gridRows.push(Row('重量', p.weight)); gridRows.push(Row('尺寸', p.size));
      gridRows.push(Row('包装尺寸', p.packSize)); gridRows.push(Row('包装重量', p.packWeight));
      gridRows.push(Row('当前主卖家', p.mainSeller)); gridRows.push(Row('卖家ID', p.sellerId));
      gridRows.push(Row('来源店铺', p.shopSeller)); gridRows.push(Row('产品类型', p.productType));
      gridRows.push(Row('上架时间', p.listedAt)); gridRows.push(Row('首发', p.firstAvailable)); gridRows.push(Row('采集时间', p.collectedAt));
      gridRows.push(Row('来源', p.source)); gridRows.push(Row('保存', p.saved ? '已保存' : '否')); gridRows.push(Row('真实', p.real ? '是' : null));
      if (p.aiScore != null) gridRows.push(Row('AI 评分', p.aiScore)); 
      if (p.aiRiskLevel) gridRows.push(Row('AI 风险', p.aiRiskLevel));
      if (p.aiSuggestPrice != null) gridRows.push(Row('AI 建议价', fmt(p.aiSuggestPrice)));
      if (Array.isArray(p.bsr) && p.bsr.length) gridRows.push(Row('BSR 榜单', p.bsr.map(function (b) { return '#' + b.rank + ' ' + (b.category || b.name || ''); }).join('；')));
      const badges = [];
      const bdg = function (t, c) { return h('span', { key: t, style: { marginRight: 6 } }, h('span', { className: 'zyp-badge ' + (c || 'zyp-bg') }, t)); };
      if (p.brandStatus === 'registered') badges.push(bdg('已备案', 'zyp-br'));
      else if (p.brandStatus === 'unchecked') badges.push(bdg('未核查', 'zyp-bm'));
      else if (p.brandStatus === 'notfound') badges.push(bdg('未查到', 'zyp-bg'));
      else badges.push(bdg('未查到', 'zyp-bg'));
      if (p.bgMark) badges.push(bdg('BG标', 'zyp-br'));
      if (p.tmMark) badges.push(bdg('TM标', 'zyp-bm'));
      if (p.patentRisk) badges.push(bdg('专利风险', 'zyp-br'));
      if (p.amazonSell) badges.push(bdg('AMZ 自营', 'zyp-bz'));
      else if (p.fulfill) badges.push(bdg(p.fulfill, p.fulfill === 'FBA' ? 'zyp-bb' : 'zyp-warn'));
      if (p.aplus) badges.push(bdg('A+', 'zyp-bm'));
      if (p.is1688) badges.push(bdg('1688', 'zyp-bz'));
      if (p.badge) badges.push(bdg(String(p.badge), 'zyp-bz'));
      // ---- 概要表 / 卖点 ----
      const ovArr = (Array.isArray(p.productOverview) ? p.productOverview : (p.productInfo && typeof p.productInfo === 'object' ? Object.keys(p.productInfo).map(function (k) { return { k: k, v: p.productInfo[k] }; }) : []));
      const spArr = Array.isArray(p.sellingPoint) ? p.sellingPoint : (Array.isArray(p.sellingPoints) ? p.sellingPoints : []);
      // ---- 商标局 ----
      const offices = [];
      const siteTMO = {
        de: ['德国 DPMA', 'https://register.dpma.de/DPMAregister/marke/partiell?query=' + enc(p.brand) + '&lang=en'],
        uk: ['英国 UKIPO', 'https://trademarks.ipo.gov.uk/ipo-tmtext'],
        fr: ['法国 INPI', 'https://data.inpi.fr/marques?q=' + enc(p.brand)],
        it: ['意大利 UIBM', 'https://www.uibm.gov.it/bancadati/'],
        es: ['西班牙 OEPM', 'https://consultas2.oepm.es/gestor/faces/rest/verPublicaciones.jsp?tipo=Marcas'],
        nl: ['比荷卢 BOIP', 'https://www.boip.int/nl/merken/merkenregister'],
        se: ['瑞典 PRV', 'https://tc.prv.se/'],
        pl: ['波兰 PUP', 'https://ewyszukiwarka.pue.uprp.gov.pl/search/simple'],
        us: ['美国 USPTO', 'https://tmsearch.uspto.gov/search/search-information'],
        ca: ['加拿大 CIPO', 'https://ised-isde.canada.ca/cipo/trademarks/search/quick?q=' + enc(p.brand)],
        mx: ['墨西哥 IMPI', 'https://siga.impi.gob.mx/'],
        br: ['巴西 INPI', 'https://busca.inpi.gov.br/pePI/jsp/marcas/MarcaSearchBasico.jsp'],
        jp: ['日本 JPO', 'https://www.j-platpat.inpit.go.jp/'],
        au: ['澳洲 IP Australia', 'https://search.ipaustralia.gov.au/trademarks/search/quick?q=' + enc(p.brand)],
        in: ['印度 IP India', 'https://iprsearch.ipindia.gov.in/trademarksearch/'],
        sg: ['新加坡 IPOS', 'https://gobusiness.ipos.gov.sg/trademarksearch/'],
        ae: ['阿联酋 MOEC', 'https://www.moec.gov.ae/'],
        sa: ['沙特 SAIP', 'https://saip.gov.sa/']
      };
      if (siteTMO[p.site]) offices.push(siteTMO[p.site]);
      if (['de', 'fr', 'it', 'es', 'nl', 'se', 'pl'].indexOf(p.site) >= 0) offices.push(['欧盟 EUIPO', 'https://euipo.europa.eu/eSearch/#basic/1+1+1+1/30+30+30+30/' + enc(p.brand).replace(/%20/g, '+')]);
      // ---- 找货平台 ----
      const kwNo = enc((p.title || '').slice(0, 40));
      const imgUrl = p.mainImage || '';
      // 找货源平台清单由后端 /api/sources 提供 (单一来源: URL 直通图搜 / CDP 自动上传 / 关键词兜底)
      const [srcList, setSrcList] = React.useState(null);
      const [cdpOut, setCdpOut] = React.useState(null);
      const loadSources = function () {
        return api('/api/sources?asin=' + encodeURIComponent(p.asin), 'GET', null).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && j.group) { setSrcList(j); return j; }
          return null;
        }).catch(function () { return null; });
      };
      // 一键去某平台以图搜图: img-url 类直接跳(已带图) / cdp 类交后端自动上传
      const goImageSearch = function (site) {
        if (site.kind === 'keyword') { openExternal(site.url, site.name + ' 关键词搜'); return; }
        if (site.kind === 'cdp') {
          setCdpOut({ loading: true, site: site.name });
          notify('⏳ ' + site.name + ' 自动上传图搜中 (后端执行, 无需操作)…');
          api('/api/sources/cdp-search', 'POST', { asin: p.asin, site: site.k }).then(function (r) {
            const j = r && r.json ? r.json : {};
            if (j && j.pageUrl) { setCdpOut({ site: site.name, pageUrl: j.pageUrl, results: j.results || [], err: null }); notify('✔ ' + site.name + ' 图搜完成, 已在浏览器打开结果页 (' + (j.results || []).length + ' 条已解析)'); }
            else setCdpOut({ site: site.name, err: (j && j.error) || '未取到结果' });
          }).catch(function (e) { setCdpOut({ site: site.name, err: String(e && e.message || e) }); notify('✗ ' + site.name + ' 图搜失败: ' + String(e && e.message || e)); });
          return;
        }
        if (!site.url) { notify('✗ ' + (site.note || '无可跳转链接')); return; }
        openExternal(site.url, site.name + ' 以图搜图');
        notify('✔ 已在浏览器新标签打开 ' + site.name + ' 图搜结果页 (已自动带上本商品主图, 无需手动上传)');
      };
      // ---- 认领 ----
      const doClaim = function () { setBusy('claim'); api('/api/claims', 'POST', { asin: p.asin }).then(function () { setClaimed(true); setBusy(''); notify('✔ 已认领 (' + (p.brand || '').slice(0, 20) + '-' + String(p.asin).slice(0, 4) + ')'); }).catch(function (e) { setBusy(''); notify('⚠ ' + String(e && e.message || e)); }); };
      // ---- 利润测算 (算法在后端 /api/profit/calc, 前端只渲染, 保证一个数字一个来源) ----
      const loadTax = function () {
        if (taxInfo) return Promise.resolve(taxInfo);
        return api('/api/tax/rates', 'GET', null).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && j.sites) { setTaxInfo(j); return j; }
          return null;
        }).catch(function () { return null; });
      };
      const ensureRate = function () {
        if (rate != null) return Promise.resolve(rate);
        setMsg('正在获取汇率…');
        return api('/api/rates', 'GET', null).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && j.rates) setFxAll(j.rates);
          const rv = j && j.rates ? (j.rates[cur] || null) : null;
          if (rv != null) { setRate(rv); setRatesTxt('1 ' + cur + ' = ' + Number(rv).toFixed(4) + ' CNY (' + (j.date || '') + ')'); return rv; }
          setRatesTxt('汇率接口无 ' + cur + ', 请手填'); return null;
        }).catch(function () { setRatesTxt('汇率获取失败, 请手填'); return null; });
      };
      const saveTaxOverride = function (site, val, includesTax) {
        if (val === '' || val == null) return Promise.resolve();
        return api('/api/tax/rates', 'POST', { site: site, rate: val, includesTax: includesTax }).catch(function () {});
      };
      const doCalc = function () {
        setBusy('calc'); setMsg('测算中…');
        return loadTax().then(function (tx) {
          return ensureRate().then(function () {
            const body = {
              asin: p.asin, mode: fmode,
              supplyCny: supply, shipCny: logi, dutyCny: duty, storageCny: storage, otherCny: other,
              priceBasis: pBasis, priceOverride: pBasis === 'manual' ? pManual : '',
              acos: acos, returnRate: returnRate, payRate: payRate, fxLoss: fxLoss,
              targetMargin: targetMargin,
              vatRate: ovaVat, commRate: ovaComm, fbaFee: ovaFba,
            };
            return api('/api/profit/calc', 'POST', body).then(function (r) {
              setBusy(''); setMsg('');
              if (r && r.json && r.json.items) { setProf(r.json); return r.json; }
              setMsg('✗ ' + ((r && r.json && r.json.error) || '测算失败')); return null;
            });
          });
        }).catch(function (e) { setBusy(''); setMsg('✗ 测算失败: ' + String(e && e.message || e)); return null; });
      };
      // 一键: 补汇率 + 税率 → FBM 用云途试算回填运费 → 测算
      const oneClick = function () {
        setBusy('one'); setMsg('一键计算: 汇率 → 税率 → 物流报价…');
        loadTax().then(function () { return ensureRate(); }).then(function () {
          if (fmode !== 'FBM') { setMsg(''); setBusy(''); return doCalc(); }
          const wK = parseFloat(wKg) || (wG > 0 ? wG / 1000 : 1);
          const d = dims ? dims.split('x').map(function (z) { return parseFloat(z) || 0; }) : dimArr;
          return api('/api/logistics/rates?country=' + siteCountry + '&weight=' + wK, 'GET', null).then(function (r) {
            const j = r && r.json ? r.json : null;
            if (j && Array.isArray(j.quotes) && j.quotes.length) {
              const best = j.quotes.filter(function (q) { return q.total != null; }).sort(function (a, b) { return a.total - b.total; })[0];
              if (best) { setLogi(String(best.total)); setMsg('✔ 物流成本: ' + best.channel + ' ¥' + best.total); return; }
            }
            return api('/api/logistics/quote', 'POST', { originCity: '深圳市', country: siteCountry, weightKg: wK, lengthCm: d[0] || 0, widthCm: d[1] || 0, heightCm: d[2] || 0, battery: qB === '1' }).then(function (qr) {
              const qj = qr && qr.json ? qr.json : null;
              if (qj && Array.isArray(qj.quotes) && qj.quotes.length) {
                const b2 = qj.quotes.filter(function (q) { return q.total != null; }).sort(function (a, b) { return a.total - b.total; })[0];
                if (b2) setMsg('✔ 云途试算: ' + b2.channel + ' ¥' + b2.total);
              } else setMsg('⚠ 物流试算失败, 请手填物流成本');
            }).catch(function () { setMsg('⚠ 物流试算失败, 请手填物流成本'); });
          }).catch(function () { setMsg('⚠ 报价表失败, 请手填物流成本'); });
        }).then(function () { setBusy(''); setTimeout(function () { doCalc(); }, 0); }).catch(function (e) { setBusy(''); setMsg('✗ 一键计算失败: ' + String(e && e.message || e)); });
      };
      const loadRates = function () { loadTax(); ensureRate().then(function () { setMsg(ratesTxt || '汇率已加载'); }); };
      // ---- 1688 图搜 ----
      const do1688 = function () {
        setGBusy(true); setG1688(null); notify('正在 1688 以图搜图 (约 20-30 秒)…');
        api('/api/products/1688-search-upload', 'POST', { asin: p.asin }).then(function (r) {
          setGBusy(false);
          const j = r && r.json ? r.json : {};
          if (!j.items || !j.items.length) { setG1688({ err: '未找到同款 (请确认已登录 1688)' }); return; }
          setG1688({ items: j.items });
          const g0 = j.items[0];
          const now = new Date(); const pad = function (n) { return n < 10 ? '0' + n : String(n); };
          const addT = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
          const newG = { platform: '1688', url: g0.url, title: g0.title, price: g0.priceRaw || g0.price, addedAt: addT };
          const list = goods.concat([newG]);
          api('/api/products/goods', 'POST', { asin: p.asin, goods: list }).then(function () { setGoods(list); notify('✔ 已自动加入第一个 1688 货源'); }).catch(function () {});
        }).catch(function (e) { setGBusy(false); setG1688({ err: String(e && e.message || e) }); });
      };
      // 货源列表: 每次变更后从服务端重读 (服务端已按 URL 去重并补 id/结构化价格)
      const reloadGoods = function () {
        return api('/api/products/goods?asin=' + encodeURIComponent(p.asin), 'GET', null).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && Array.isArray(j.goods)) { setGoods(j.goods); return j.goods; }
          return null;
        }).catch(function () { return null; });
      };
      // 单条新增 (服务端去重: 同链接已存在则更新标题/价格, 变价记入 priceHistory)
      const addGood = function (good, label) {
        return api('/api/products/goods/add', 'POST', { asin: p.asin, good: good }).then(function (r) {
          const j = r && r.json ? r.json : {};
          reloadGoods();
          if (j.updated) notify('✔ 该货源已存在, 已更新' + (j.priceChanged ? ' (价格有变动, 已记入价格历史)' : '') + (label ? ' · ' + label : ''));
          else notify('✔ 已保存货源' + (label ? ' · ' + label : ''));
          return j;
        }).catch(function (e) { notify('✗ 保存货源失败: ' + String(e && e.message || e)); return null; });
      };
      const add1688Item = function (it) {
        addGood({ platform: '1688', url: it.url, title: it.title, priceRaw: it.priceRaw || it.price, img: it.img, supplier: it.company || null }, String(it.title || '').slice(0, 40));
      };
      const delGood = function (g) {
        api('/api/products/goods/delete', 'POST', { asin: p.asin, id: g.id, urlKey: g.urlKey }).then(function () { reloadGoods(); notify('🗑 已删除该货源'); })
          .catch(function (e) { notify('✗ ' + String(e && e.message || e)); });
      };
      // 抓取货源信息: 抓到后直接落库 (旧实现只弹提示, 数据没存 —— 这是 bug)
      const fetchGood = function () {
        if (!gUrl.trim()) { notify('请先粘贴货源链接'); return; }
        setFetchBusy(true); notify('抓取中 (~9 秒)…');
        api('/api/products/goods/fetch', 'POST', { url: gUrl.trim() }).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && (j.title || j.priceRaw || j.price)) {
            return addGood({ platform: gPlat, url: gUrl.trim(), title: j.title, priceRaw: j.priceRaw || j.price, supplier: j.supplier, img: j.img }, String(j.title || '').slice(0, 40)).then(function () { setGUrl(''); setFetchBusy(false); });
          }
          setFetchBusy(false);
          notify('⚠ 未抓到标题/价格 — 已按纯链接保存, 价格可稍后手动补');
          return addGood({ platform: gPlat, url: gUrl.trim(), title: gUrl.trim().slice(0, 60) }, null).then(function () { setGUrl(''); });
        }).catch(function (e) { setFetchBusy(false); notify('✗ ' + String(e && e.message || e)); });
      };
      const addManual = function () {
        if (!gUrl.trim()) { notify('请粘贴货源链接'); return; }
        addGood({ platform: gPlat, url: gUrl.trim(), title: gUrl.trim().slice(0, 60) }, null).then(function () { setGUrl(''); });
      };
      // 比价: 货源价(¥) 换算成售价币种 → 占售价比例 (旧实现直接拿人民币减澳元, 结论是错的)
      // 比价: 到货成本 = 货源价 + 运费(手填); 基准价可选 BuyBox 或 最低跟卖价
      const goodRatio = function (g) {
        if (g.priceMin == null) return null;
        const sellPrice = (gRatioBasis === 'min' ? p.minPrice : p.buyBoxPrice) != null
          ? (gRatioBasis === 'min' ? p.minPrice : p.buyBoxPrice)
          : (p.minPrice != null ? p.minPrice : p.price);
        // 汇率口径必须与后端利润测算一致: 实时表(fxAll) → 内置兜底表; 绝不写死 7.8 (对 USD 货源会差 5%~16%)
        const FX_FALLBACK = { CNY: 1, EUR: 7.8, USD: 7.1, GBP: 9.1, JPY: 0.048, AUD: 4.85, CAD: 5.2, INR: 0.085, MXN: 0.4, BRL: 1.3, AED: 1.93, SAR: 1.89, SGD: 5.3, PLN: 1.85, SEK: 0.68, TRY: 0.2 };
        const fxFor = function (c) { if (!c) return null; if (c === 'CNY') return 1; if (fxAll && fxAll[c] != null) return Number(fxAll[c]); return FX_FALLBACK[c] != null ? FX_FALLBACK[c] : null; };
        const rt = rate || fxFor(cur) || 7.1;                    // 1 售价币种 = rt 人民币
        const gRate = fxFor(g.currency) || 7.1;                  // 货源币种 → 人民币 (1688 的 CNY 直接 1)
        const cny0 = (g.currency && g.currency !== 'CNY') ? g.priceMin * gRate : g.priceMin;
        const cny = cny0 + (Number(g.shipFee) || 0);
        if (!(sellPrice > 0) || !(rt > 0)) return null;
        const inSell = cny / rt;
        return { cny: cny, goodsCny: cny0, fee: Number(g.shipFee) || 0, inSell: inSell, ratioPct: inSell / sellPrice * 100, sellPrice: sellPrice };
      };
      // 货源变更 (运费/备注/角色) 统一走 patch / set-role
      const patchGood = function (g, patch) {
        return api('/api/products/goods/patch', 'POST', { asin: p.asin, id: g.id, urlKey: g.urlKey, patch: patch })
          .then(function () { reloadGoods(); }).catch(function (e) { notify('✗ 保存失败: ' + String(e && e.message || e)); });
      };
      const setRole = function (g, role) {
        return api('/api/products/goods/set-role', 'POST', { asin: p.asin, id: g.id, urlKey: g.urlKey, role: role })
          .then(function (r) {
            const j = (r && r.json) || {};
            reloadGoods();
            notify(j.role === 'primary' ? '⭐ 已设为现阶段最优供货' : j.role === 'backup' ? '已设为备选' : '已取消标记');
          }).catch(function (e) { notify('✗ ' + String(e && e.message || e)); });
      };
      const diffBadge = function (g) {
        const r = goodRatio(g);
        if (!r) return g.priceRaw ? h('span', { className: 'zyp-note', style: { fontSize: 10.5 } }, g.priceRaw) : null;
        const pct = r.ratioPct;
        const cls = pct <= 15 ? 'zyp-bg' : pct <= 30 ? 'zyp-bm' : 'zyp-br';
        return h('span', { className: 'zyp-badge ' + cls, title: '货源 ¥' + r.cny + ' ÷ 汇率 ' + (rate || '?') + ' = ' + (Math.round(r.inSell * 100) / 100) + ' ' + cur + ', 占售价 ' + (Math.round(pct * 10) / 10) + '%' },
          '货源占售价 ' + (Math.round(pct * 10) / 10) + '%  (¥' + r.cny + ' ≈ ' + CURR_SYM2[cur] + (Math.round(r.inSell * 100) / 100) + ')');
      };
      // 打开详情时重读一次货源 (补齐 id/结构化价格)
      React.useEffect(function () { if (!goods.length) reloadGoods(); }, []);
      // 把该货源(含运费)带入利润测算的货源成本
      const useGoodForProfit = function (g) {
        const v = (g.priceMin || 0) + (Number(g.shipFee) || 0);
        setSupply(String(v));
        notify('✔ 已带入利润测算: 货源成本 ¥' + v.toFixed(2) + (g.shipFee ? ' · 含运费 ¥' + g.shipFee : ''));
      };
      // 去货源页下单 (本地浏览器直接打开)
      const orderGood = function (g) {
        if (!g.url) { notify('该货源没有链接'); return; }
        openExternal(g.url, '下单: ' + String(g.title || '').slice(0, 30));
        notify('已在浏览器打开货源页, 可直接下单');
      };
      const onEnterBlur = function (e) { if (e.key === 'Enter') e.target.blur(); };
      const onShipFeeBlur = function (g, e) {
        const v = e.target.value.trim();
        const old = g.shipFee != null ? String(g.shipFee) : '';
        if (v !== old) patchGood(g, { shipFee: v === '' ? null : Number(v) });
      };
      const onNoteBlur = function (g, e) {
        const v = e.target.value.trim();
        if (v !== (g.note || '')) patchGood(g, { note: v || null });
      };
      const ratioCls = function (pct) { return pct <= 15 ? 'zyp-bg' : pct <= 30 ? 'zyp-bm' : 'zyp-br'; };
      // 单条货源行 (用子元素数组构建, 避免超长嵌套导致的括号错误)
      const renderGood = function (g, i) {
        const r = goodRatio(g);
        const isPrim = g.role === 'primary';
        const isBk = g.role === 'backup';
        const kids = [];
        kids.push(isPrim ? h('span', { className: 'zyp-badge zyp-bg' }, '⭐ 最优')
          : isBk ? h('span', { className: 'zyp-badge zyp-bm' }, '备选')
          : h('span', { className: 'zyp-badge zyp-bz' }, g.platform || '其他'));
        kids.push(h('span', { style: { flex: 1, minWidth: 140, cursor: 'pointer' }, title: g.title || g.url, onClick: function () { if (g.url) openExternal(g.url, String(g.title || '货源').slice(0, 40)); } }, String(g.title || g.url || '').slice(0, 42) + (g.url ? ' ↗' : '')));
        if (g.priceRaw) kids.push(h('span', null, g.priceRaw));
        if (g.moq) kids.push(h('span', { className: 'zyp-note' }, g.moq + '件起'));
        kids.push(h('span', { className: 'zyp-note', title: '供应商到货代/到仓的运费, 人民币手填' }, '运费¥'));
        kids.push(h('input', { className: 'zyp-input', defaultValue: g.shipFee != null ? String(g.shipFee) : '', placeholder: '0', style: { width: 46, padding: '0 3px' }, onBlur: function (e) { onShipFeeBlur(g, e); }, onKeyDown: onEnterBlur }));
        if (r) kids.push(h('span', { className: 'zyp-badge ' + ratioCls(r.ratioPct), title: '到货成本 ¥' + r.cny + ' = 货源 ¥' + r.goodsCny + ' + 运费 ¥' + r.fee + '; ÷ 汇率 ' + (rate || '?') + ' = ' + (Math.round(r.inSell * 100) / 100) + ' ' + cur }, '占售价 ' + (Math.round(r.ratioPct * 10) / 10) + '% (¥' + r.cny + ')'));
        kids.push(h('input', { className: 'zyp-input', defaultValue: g.note || '', placeholder: '备注', title: g.note || '填写备注: 时效/可否代发/账期…', style: { width: 118, padding: '0 4px' }, onBlur: function (e) { onNoteBlur(g, e); }, onKeyDown: onEnterBlur }));
        kids.push(h('button', { className: 'zyp-btn', title: '设为现阶段最优供货', onClick: function () { setRole(g, 'primary'); } }, isPrim ? '⭐ 取消最优' : '⭐ 设为最优'));
        kids.push(h('button', { className: 'zyp-btn', onClick: function () { setRole(g, 'backup'); } }, isBk ? '✓ 备选' : '设为备选'));
        if (g.priceMin != null) kids.push(h('button', { className: 'zyp-btn', title: '到货成本带入利润测算', onClick: function () { useGoodForProfit(g); } }, '→利润'));
        if (g.url) kids.push(h('button', { className: 'zyp-btn', style: { background: '#1e7a3c', borderColor: '#1e7a3c', color: '#fff' }, title: '打开货源商品页去下单 · 本地浏览器', onClick: function () { orderGood(g); } }, '🛒 去下单'));
        if (g.checkedAt) kids.push(h('span', { className: 'zyp-note' }, '核价 ' + String(g.checkedAt).slice(0, 10)));
        kids.push(h('button', { className: 'zyp-btn', onClick: function () { delGood(g); } }, '✕'));
        return h('div', { key: g.id || i, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '5px 0', borderBottom: '1px dashed #26262c', fontSize: 12, flexWrap: 'wrap', background: isPrim ? 'rgba(95,208,138,.07)' : 'transparent' } }, kids);
      };
      // ---- compliance ----
      const comp = p.compliance;
      const offers = Array.isArray(p.offerPrices) ? p.offerPrices : [];
      const variants = (p.variants && Array.isArray(p.variants)) ? p.variants : (Array.isArray(p.variationAsins) ? [] : []);
      const btn = function (t, fn, opts) { return h('button', Object.assign({ className: 'zyp-btn', onClick: fn, disabled: !!busy && !opts }, opts || {}), t); };
          const kindColor = { fact: '#8ab4ff', auto: '#5fd08a', assume: '#f0b253', input: '#c9c9d1' };
          const profitCard = h('div', { className: 'zyp-card' },
            h('div', { className: 'zyp-h' }, '💰 利润测算 (与店铺/来源无关 · 单一算法) · ' + siteU + ' · ' + cur),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 8 } },
              h('div', null, h('div', { className: 'zyp-lbl' }, '配送方式 (决定成本结构)'),
                h('select', { className: 'zyp-input', value: fmode, onChange: function (e) { setFmode(e.target.value); }, style: { width: '100%' } },
                  h('option', { value: 'FBA' }, 'FBA (亚马逊配送)'), h('option', { value: 'FBM' }, 'FBM (自发货)'), h('option', { value: 'AMZ' }, 'AMZ (亚马逊自营占BuyBox)'))),
              h('div', null, h('div', { className: 'zyp-lbl' }, '售价口径'),
                h('select', { className: 'zyp-input', value: pBasis, onChange: function (e) { setPBasis(e.target.value); }, style: { width: '100%' } },
                  h('option', { value: 'buybox' }, 'BuyBox 价 ' + fmt(p.buyBoxPrice != null ? p.buyBoxPrice : p.price)), h('option', { value: 'min' }, '最低价 ' + fmt(p.minPrice != null ? p.minPrice : p.price)), h('option', { value: 'manual' }, '手填'))),
              pBasis === 'manual' ? h('div', null, h('div', { className: 'zyp-lbl' }, '手填售价 (' + cur + ')'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: pManual, onChange: function (e) { setPManual(e.target.value); }, style: { width: '100%' } })) : null,
              h('div', null, h('div', { className: 'zyp-lbl' }, '货源成本 (¥)'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: supply, onChange: function (e) { setSupply(e.target.value); }, placeholder: '1688 采购价', style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, fmode === 'FBM' ? '国际运费 (¥, 可一键云途试算)' : '头程运费 中国→FBA仓 (¥)'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: logi, onChange: function (e) { setLogi(e.target.value); }, placeholder: fmode === 'FBM' ? '云途试算' : '按 kg 摊到单件', style: { width: '100%' } })),
            h('div', null, h('div', { className: 'zyp-lbl' }, '重量 kg (一键算运费/FBA费用)'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: wKg, onChange: function (e) { setWKg(e.target.value); }, placeholder: wG > 0 ? String(Math.round(wG / 10) / 100) : '商品未采到, 请填', style: { width: '100%' } })),
            h('div', null, h('div', { className: 'zyp-lbl' }, '尺寸 长x宽x高 cm'), h('input', { className: 'zyp-input', value: dims, onChange: function (e) { setDims(e.target.value); }, placeholder: dimArr[0] ? dimArr.join('x') : '如 30x20x10', style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '关税/进口VAT (¥) ⚠需手填'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: duty, onChange: function (e) { setDuty(e.target.value); }, placeholder: '需 HS 编码/货代报价', style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '仓储/其他 (¥)'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: storage, onChange: function (e) { setStorage(e.target.value); }, style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, 'ACOS (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.5, value: acos, onChange: function (e) { setAcos(e.target.value); }, style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '退货率 (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.5, value: returnRate, onChange: function (e) { setReturnRate(e.target.value); }, style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '收款手续费 (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.1, value: payRate, onChange: function (e) { setPayRate(e.target.value); }, style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '汇损 (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.1, value: fxLoss, onChange: function (e) { setFxLoss(e.target.value); }, style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '手改 VAT 率 (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.5, value: ovaVat, onChange: function (e) { setOvaVat(e.target.value); }, placeholder: '留空=按站点', style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '手改 佣金率 (%)'), h('input', { className: 'zyp-input', type: 'number', step: 0.5, value: ovaComm, onChange: function (e) { setOvaComm(e.target.value); }, placeholder: '留空=按类目', style: { width: '100%' } })),
              h('div', null, h('div', { className: 'zyp-lbl' }, '手改 FBA 配送费 (' + cur + ')'), h('input', { className: 'zyp-input', type: 'number', step: 0.01, value: ovaFba, onChange: function (e) { setOvaFba(e.target.value); }, placeholder: p.fbaFee != null ? ('采集 ' + p.fbaFee) : '未采集, 需填', style: { width: '100%' } }))),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 } },
              h('button', { className: 'zyp-btn', style: { background: '#2f6feb', borderColor: '#2f6feb', color: '#fff' }, onClick: doCalc, disabled: !!busy }, busy === 'calc' ? '测算中…' : '🧮 计算利润'),
              h('button', { className: 'zyp-btn', onClick: oneClick, disabled: !!busy }, busy === 'one' ? '计算中…' : '⚡ 一键计算'),
              h('button', { className: 'zyp-btn', onClick: loadRates }, '🔄 刷新汇率/税率'),
              h('span', { className: 'zyp-note' }, ratesTxt || '汇率读取中…'),
              h('span', { className: 'zyp-note', style: { marginLeft: 'auto' } }, '费用来源: ' + (taxInfo && taxInfo.eu ? taxInfo.eu.source : '税表') + ' · 欧盟VAT自动 / 非欧盟内置表')),
            prof ? h('div', null,
              h('table', { className: 'zyp-tbl', style: { fontSize: 12 } },
                h('thead', null, h('tr', null, h('th', null, '项目'), h('th', null, '金额 (¥)'), h('th', null, '算式'), h('th', null, '来源/类型'))),
                h('tbody', null, prof.items.map(function (it, i) {
                  return h('tr', { key: i },
                    h('td', null, it.label),
                    h('td', { style: { textAlign: 'right', fontWeight: 600, color: it.valueCny < 0 ? '#e08a8a' : '#7fe0a0' } }, (it.valueCny >= 0 ? '' : '') + it.valueCny.toFixed(2)),
                    h('td', { className: 'zyp-note', style: { fontSize: 11 } }, it.formula),
                    h('td', { className: 'zyp-note', style: { fontSize: 10.5, color: kindColor[it.kind] || undefined } }, it.source));
                }),
                h('tr', { style: { borderTop: '2px solid #444' } },
                  h('td', null, h('b', null, '净利 (¥)')),
                  h('td', { style: { textAlign: 'right', fontWeight: 700, color: prof.netCny >= 0 ? '#5fd08a' : '#f28b8b' } }, prof.netCny.toFixed(2)),
                  h('td', { className: 'zyp-note', colSpan: 2 }, '利润率 ' + prof.marginPct.toFixed(1) + '% · 收入 ¥' + prof.revenueCny.toFixed(2) + ' − 平台扣费 ¥' + prof.platformCny.toFixed(2) + ' − 采购物流 ¥' + prof.costCny.toFixed(2))))),
              h('div', { className: 'zyp-note', style: { marginTop: 6 } },
                '盈亏平衡价: ' + (prof.breakEvenPrice != null ? (S2(prof.breakEvenPrice) + ' (' + cur + ')') : '-') + ' · 目标利润率 ' + prof.targetMarginPct + '% → 需卖 ' + (prof.targetPrice != null ? (S2(prof.targetPrice) + ' (' + cur + ')') : '-')),
              prof.warnings && prof.warnings.length ? h('div', { className: 'zyp-note', style: { marginTop: 4, color: '#f0b253' } }, '⚠ ' + prof.warnings.join(' · ')) : null,
              h('div', { className: 'zyp-note', style: { marginTop: 4, fontSize: 10.5, opacity: .75 } }, '颜色: 蓝=已采集事实 · 绿=按表自动(类目/站点) · 黄=假设值(可改) · 灰=需你填写。关税/关税进口VAT 无法自动获取, 留 0 会高估利润。')) : h('div', { className: 'zyp-note' }, '填好货源成本/运费后点「🧮 计算利润」; 没有 FBA 配送费或重量数据时会明确提示需手填, 不会当 0 算。'));

      return h('div', null,
        // ===== 顶栏 =====
        h('div', { className: 'zyp-toolbar', style: { justifyContent: 'space-between' } },
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            btn('← 返回列表', props.onBack),
            h('span', { className: 'zyp-h', style: { margin: 0 } }, '🔍 商品详情'),
            h('code', { style: { fontSize: 12 } }, p.asin),
            badges),
          h('div', null,
            h('span', { className: 'zyp-lnk', onClick: function () { openExternal(amzUrl, (p.title || p.asin).slice(0, 40)); } }, '⧉ Amazon 商品 ↗ '),
            p.shopUrl ? h('span', { className: 'zyp-lnk', onClick: function () { openExternal(p.shopUrl, '店铺'); } }, '🏪 店铺 ↗ ') : null,
            p.sellerPageUrl ? h('span', { className: 'zyp-lnk', onClick: function () { openExternal(p.sellerPageUrl, '卖家页'); } }, '👤 卖家页 ↗') : null)),
        // ===== 主图 + 标题 =====
        h('div', { className: 'zyp-card', style: { display: 'flex', gap: 14, alignItems: 'flex-start' } },
          mainImg ? h('img', { src: mainImg, onClick: function () { setBig(true); }, title: '点击放大', style: { width: 150, height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid #333', cursor: 'zoom-in', flex: '0 0 auto' } }) : null,
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 15, fontWeight: 600, lineHeight: 1.5 } }, p.title || p.asin),
            h('div', { className: 'zyp-note', style: { marginTop: 6 } }, '「商品详情」完整视图 · 数据来自 /api/products/detail (含 compliance)')),
          h('div', null,
            claimed ? h('span', { className: 'zyp-badge zyp-bg' }, '✔ 已认领') : btn('📌 认领到草稿箱', doClaim, { style: { background: '#2f6feb', borderColor: '#2f6feb', color: '#fff' } }))),
        // ===== 概要字段 =====
        h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '📋 商品概要 (' + p.asin + ')'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1px 18px' } }, gridRows)),
        // ===== 概要表 / 卖点 =====
        (ovArr.length || spArr.length) ? h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '📄 产品概要 / 卖点'),
          ovArr.length ? h('table', { className: 'zyp-tbl', style: { minWidth: 0, width: '100%' } }, h('tbody', null, ovArr.map(function (o, i) { return h('tr', { key: i }, h('td', { style: { color: '#8a8a8a', width: 160 } }, String(o.k || o.label || '')), h('td', null, String(o.v == null ? '' : (typeof o.v === 'object' ? JSON.stringify(o.v) : o.v)))); }))) : null,
          spArr.length ? h('div', { style: { marginTop: 8 } }, spArr.map(function (s, i) { return h('div', { key: i, style: { fontSize: 12, padding: '2px 0' } }, '• ' + String(s)); })) : null) : null,
        // ===== 全部跟卖 =====
        h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '🛒 全部跟卖 (' + offers.length + ')'),
          offers.length ? offers.map(function (o, i) { return h('div', { key: i, style: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px dashed #26262c', fontSize: 12, flexWrap: 'wrap' } },
            h('span', { className: 'zyp-lnk', onClick: function () { if (o.sellerUrl) openExternal(o.sellerUrl, String(o.seller || o.sellerId || '')); else if (o.sellerId) openExternal('https://www.amazon.' + amzDom + '/sp?seller=' + o.sellerId, String(o.sellerId)); } }, (o.chinaSeller ? '🇨🇳 ' : '') + String(o.seller || o.sellerId || '-') + ' ↗'),
            o.price != null ? h('b', null, fmt(o.price)) : null,
            h('span', { className: 'zyp-note' }, (o.fulfillment || o.fulfill || '') + (o.shipFee != null ? ' +运费' + o.shipFee : '') + (o.shipDates ? ' · ' + o.shipDates : '') + (o.condition ? ' · ' + o.condition : '') + (o.quantity != null ? ' · 数量' + o.quantity : ''))); }) : h('div', { className: 'zyp-note' }, '无跟卖数据')),
        // ===== 变体 =====
        (function () {
          if (!(variants.length || (p.variations != null))) return null;
          const groupEls = variants.map(function (g, gi) {
            const opts = Array.isArray(g.options) ? g.options : (Array.isArray(g) ? g : []);
            const chipEls = opts.map(function (o, oi) { return h('button', { key: oi, className: 'zyp-btn', style: { fontSize: 11.5 } }, String(o.text || o.label || o.asin || o) + (o.price != null ? ' ' + fmt(o.price) : '')); });
            return h('div', { key: gi, style: { marginBottom: 6 } },
              h('div', { className: 'zyp-lbl' }, String(g.dim || g.name || ('分组' + (gi + 1)))),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, chipEls));
          });
          return h('div', { className: 'zyp-card' },
            h('div', { className: 'zyp-h' }, '🧩 变体 (' + (p.variations != null ? p.variations : variants.length) + ')'),
            groupEls);
        })(),
            profitCard,
        // ===== 查商标 =====
        h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '🏛 查商标 · 品牌 ' + (p.brand || '') + (p.tmMark ? ' (TM标)' : '') + (p.bgMark ? ' (BG标)' : '') + (p.trademarkCount ? ' · 已记录 ' + p.trademarkCount + ' 条' : '')),
          h('div', { className: 'zyp-note', style: { marginBottom: 6 } }, '打开对应国家/地区官方商标局 (点击在浏览器新标签打开)。查到已注册商标 = 侵权风险, 请谨慎使用该品牌。'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } }, offices.map(function (o, i) { return h('button', { key: i, className: 'zyp-btn', style: { fontSize: 11.5 }, onClick: function () { openExternal(o[1], o[0]); } }, o[0] + ' ↗'); }))),
        // ===== 找货 / 图搜 =====
        h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '🛍 找货源 · 以图搜图 (点一下即在浏览器新标签打开结果页, 无需手动上传/粘贴)'),
          h('div', { className: 'zyp-note', style: { marginBottom: 6 } }, srcList ? (srcList.hasImage ? '主图: ' + String(srcList.image).slice(0, 60) + '… (可被外部抓取, 已实测)' : '⚠ 该商品无主图 → 只能用关键词搜') : '平台清单加载中…'),
          // 图片 URL 直通图搜 (零人工)
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 } },
            h('span', { className: 'zyp-note', style: { minWidth: 96 } }, '以图搜图 (直接开浏览器):'),
            (srcList && srcList.group.imgUrl ? srcList.group.imgUrl : []).map(function (x) {
              return h('button', { key: x.k, className: 'zyp-btn', style: { fontSize: 11.5, opacity: x.ready ? 1 : .45 }, title: x.verified + (x.note ? ' · ' + x.note : ''), onClick: function () { goImageSearch(x); } }, x.name + ' 图搜 ↗');
            }),
            h('button', { className: 'zyp-btn', style: { fontSize: 11.5 }, onClick: loadSources }, '⟳')),
          // CDP 自动上传 (后端执行, 依然零人工)
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 } },
            h('span', { className: 'zyp-note', style: { minWidth: 96 } }, '其他方式 (后端执行/关键词):'),
            btn(gBusy ? '1688 找货中…' : '1688 (解析结果入库)', do1688, gBusy ? { disabled: true } : {}),
            (srcList && srcList.group.cdp ? srcList.group.cdp : []).map(function (x) {
              return h('button', { key: x.k, className: 'zyp-btn', style: { fontSize: 11.5 }, title: x.verified, onClick: function () { goImageSearch(x); } }, x.name + ' 自动图搜');
            }),
            (srcList && srcList.group.keyword ? srcList.group.keyword : []).map(function (x) {
              return h('button', { key: x.k, className: 'zyp-btn', style: { fontSize: 11.5, opacity: .6 }, title: '该平台网页端无图搜, 只能用关键词', onClick: function () { goImageSearch(x); } }, x.name + ' (关键词) ↗');
            })),
          cdpOut ? h('div', { className: 'zyp-note', style: { marginBottom: 6 } },
            cdpOut.loading ? '⏳ ' + cdpOut.site + ' 自动上传中…'
              : cdpOut.err ? h('span', { style: { color: '#f28b8b' } }, '✗ ' + cdpOut.site + ': ' + cdpOut.err)
                : h('span', null, '✔ ' + cdpOut.site + ' 已自动完成图搜 → ' + (cdpOut.pageUrl ? h('span', { className: 'zyp-lnk', onClick: function () { openExternal(cdpOut.pageUrl, cdpOut.site + ' 图搜结果'); } }, '打开结果页 ↗') : '') + ' (解析到 ' + (cdpOut.results || []).length + ' 条)')) : null),
        // ===== 货源记录 =====
        h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '📦 货源记录 (' + goods.length + ')'),
          (function () {
            if (!goods.length) return h('div', { className: 'zyp-note' }, '暂无货源记录 — 用上方「找货」图搜或粘贴链接添加。');
            const sorted = goods.slice().sort(function (a, b) {
              const w = function (x) { return x.role === 'primary' ? 0 : x.role === 'backup' ? 1 : 2; };
              return w(a) - w(b) || ((a.priceMin || 1e9) - (b.priceMin || 1e9));
            });
            const prim = sorted.find(function (x) { return x.role === 'primary'; });
            const bkCount = sorted.filter(function (x) { return x.role === 'backup'; }).length;
            const primCost = prim ? ((prim.priceMin || 0) + (Number(prim.shipFee) || 0)).toFixed(2) : null;
            const headerKids = [];
            headerKids.push(prim
              ? h('span', null, '⭐ 现阶段最优: ' + String(prim.title || prim.url || '').slice(0, 36) + ' · 到货 ¥' + primCost)
              : h('span', { style: { color: '#f0b253' } }, '⚠ 还没选定「现阶段最优供货」— 点某行的「⭐ 设为最优」'));
            headerKids.push(h('span', null, ' · 备选 ' + bkCount + ' 个 · 比价基准 '));
            headerKids.push(h('select', { className: 'zyp-input', value: gRatioBasis, onChange: function (e) { setGRatioBasis(e.target.value); }, style: { fontSize: 11, padding: '0 2px' } },
              h('option', { value: 'buybox' }, 'BuyBox 价'), h('option', { value: 'min' }, '最低跟卖价')));
            return h('div', null, h('div', { className: 'zyp-note', style: { marginBottom: 4 } }, headerKids), sorted.map(renderGood));
          })(),
          h('div', { style: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
            h('select', { className: 'zyp-input', value: gPlat, onChange: function (e) { setGPlat(e.target.value); } }, ['1688', '淘宝', '拼多多', 'Amazon', 'Alibaba', '其他'].map(function (x) { return h('option', { key: x, value: x }, x); })),
            h('input', { className: 'zyp-input', value: gUrl, onChange: function (e) { setGUrl(e.target.value); }, placeholder: '粘贴 1688/淘宝/拼多多 商品链接…', style: { flex: 1, minWidth: 180 } }),
            btn(fetchBusy ? '抓取中…' : '🔍 抓取并保存', fetchGood, fetchBusy ? { disabled: true } : {}),
            btn('➕ 添加', addManual))),
        // ===== 合规 =====
        comp ? h('div', { className: 'zyp-card' },
          h('div', { className: 'zyp-h' }, '🛡 合规检测' + (comp.level ? (' · ' + ({ high: '高风险', medium: '中风险', low: '低风险' }[comp.level] || comp.level)) : '')),
          comp.score != null ? h('div', { className: 'zyp-note' }, '合规评分: ' + comp.score + '/100' + (comp.checkedAt ? ' · ' + comp.checkedAt : '')) : null,
          comp.brandHit ? h('div', { className: 'zyp-note' }, '品牌库命中: ' + String(comp.brandHit)) : null,
          Array.isArray(comp.reasons) && comp.reasons.length ? h('div', { style: { marginTop: 4 } }, comp.reasons.map(function (r, i) { return h('div', { key: i, style: { fontSize: 12, color: '#f0b253' } }, '⚠ ' + String(r)); })) : null) : null,
        // ===== 弹窗 =====
        big ? h(Modal, { title: (p.title || p.asin).slice(0, 80), onClose: function () { setBig(false); }, children: h('div', { style: { textAlign: 'center' } }, h('img', { src: mainImg, style: { maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 } })) }) : null
      );
    }


    function ProductPage(props) {
      const seed = props && props.seed ? props.seed : null;
      // seed 的 from/to 为 UTC ("YYYY-MM-DD HH:MM") → 转本地 datetime-local 值 (YYYY-MM-DDTHH:MM)
      const utcToLocalInput = function (s) {
        if (!s) return '';
        const d = new Date(String(s).replace(' ', 'T') + ':00Z');
        if (isNaN(d.getTime())) return String(s).replace(' ', 'T').slice(0, 16);
        const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
      };
      // flt = 统一过滤条件 (NF 模板; 与采集过滤同一 schema) —— 唯一数据源
      const [flt, setFlt] = React.useState(function () { const b = NF(); if (seed) { b.collectedFrom = utcToLocalInput(seed.collectedFrom); b.collectedTo = utcToLocalInput(seed.collectedTo); } return b; });
      const [fopen, setFopen] = React.useState(true);   // 默认展开 (与采集面板一致, 打开就能看到筛选)
      const [items, setItems] = React.useState(null);
      const [total, setTotal] = React.useState(0);
      const [page, setPage] = React.useState(1);
      const [size, setSize] = React.useState(50);
      const [sel, setSel] = React.useState({});
      const [msg, setMsg] = React.useState(null);
      const [task, setTask] = React.useState('');
      const [busy, setBusy] = React.useState('');
      const [expOpen, setExpOpen] = React.useState(false);
      const [catTree, setCatTree] = React.useState(null);      // {sources:{bc,bsr,none}, tree:[{cat1,count,children:[{cat2,count}]}]}
      const [govOpen, setGovOpen] = React.useState(false);
      const [gov, setGov] = React.useState(null);          // 货源总览 /api/goods/overview
      const loadGoodsOverview = function () {
        api('/api/goods/overview', 'GET', null).then(function (r) {
          const j = r && r.json ? r.json : null;
          if (j && j.totalGoods != null) setGov(j);
        }).catch(function () {});
      };
      // 统一过滤条件 → 查询串 (本地时间→UTC 后交给后端 /api/products?filter=)
      const localToUtcMin2 = function (val) {
        const s = String(val || '').trim();
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 16);
        return d.toISOString().slice(0, 16).replace('T', ' ');
      };
      const filterJson = function (f) {
        const o = Object.assign({}, f);
        if (o.collectedFrom) o.collectedFrom = localToUtcMin2(o.collectedFrom);
        if (o.collectedTo) o.collectedTo = localToUtcMin2(o.collectedTo);
        return JSON.stringify(o);
      };
      const loadCatTree = function () {
        api('/api/products/cat-tree', 'GET', null).then(function (r) {
          if (r && r.ok && r.json && r.json.tree) setCatTree(r.json);
        }).catch(function () {});
      };
      const deriveCat = function () {
        setTask('推算类目中…');
        api('/api/products/derive-cat', 'POST', {}).then(function (r) {
          setTask('');
          const j = (r && r.json) || {};
          setMsg('🧭 已用榜单类目推算出 ' + (j.derived || 0) + ' 个商品的一级/二级类目 (跳过 ' + (j.noBsr || 0) + ' 个无榜单数据的)');
          loadCatTree();
        }).catch(function (e) { setTask(''); setMsg('✗ 推算失败: ' + String(e && e.message || e)); });
      };
      const load = function () {
        // 统一过滤条件 → 一个 filter JSON (后端 /api/products 与采集过滤共用同一 schema)
        setTask('加载中…');
        api('/api/products?filter=' + encodeURIComponent(filterJson(flt)), 'GET', null).then(function (r) {
          if (r && r.ok && r.json) { setItems(r.json.items || []); setTotal(r.json.total || 0); setPage(1); }
          setTask('');
        }).catch(function (e) { setTask(''); setMsg('加载失败: ' + String(e && e.message || e)); });
      };
      React.useEffect(function () { loadCatTree(); load(); }, []);
      const pages = items ? Math.max(1, Math.ceil(items.length / size)) : 1;
      const cur = items ? items.slice((page - 1) * size, page * size) : [];
      const selArr = function () { return Object.keys(sel).filter(function (k) { return sel[k]; }); };
      const toggle = function (id) { setSel(function (o) { const n = Object.assign({}, o); n[id] = !n[id]; return n; }); };
      const allOn = cur.length && cur.every(function (x) { return sel[x.asin]; });
      const someOn = cur.some(function (x) { return sel[x.asin]; });
      const toggleAll = function (e) { const v = e.target.checked; const n = Object.assign({}, sel); cur.forEach(function (x) { n[x.asin] = v; }); setSel(n); };
      const needSel = function () { const a = selArr(); if (!a.length) { setMsg('请先勾选商品'); return null; } return a; };
      const after = function () { setSel({}); load(); };
      const batchSave = function () { const a = needSel(); if (!a) return; api('/api/products/save', 'POST', { asins: a, saved: true }).then(function (r) { setMsg('✔ 已保存 ' + a.length + ' 个商品到产品库'); load(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); };
      const batchClaim = function () { const a = needSel(); if (!a) return; let ok = 0; const next = function (i) { if (i >= a.length) { setMsg('✔ 已认领 ' + ok + '/' + a.length + ' 个到草稿箱'); return; } api('/api/claims', 'POST', { asin: a[i] }).then(function () { ok++; next(i + 1); }).catch(function () { next(i + 1); }); }; next(0); };
      const batchSync = function () { const a = needSel(); if (!a) return; api('/api/products/sync', 'POST', { asins: a }).then(function () { setMsg('🔄 已同步刷新 ' + a.length + ' 个商品'); load(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); };
      const batchDelete = function () { const a = needSel(); if (!a) return; setMsg(null); setModal2({ title: '删除商品', rows: ['确定删除选中的 ' + a.length + ' 个商品吗?'], onOk: function () { api('/api/products/delete', 'POST', { asins: a }).then(function (r) { setMsg('🗑 已删除 ' + a.length + ' 个商品'); after(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); } }); };
      const clearAll = function () { setModal2({ title: '一键清空', rows: ['⚠️ 确定清空全部商品吗? 清空后可点「↩ 重置」恢复种子数据。', '再次确认: 此操作不可撤销。'], onOk: function () { api('/api/products/clear', 'POST', {}).then(function (r) { setMsg('🧹 已清空'); after(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); } }); };
      const resetAll = function () { setModal2({ title: '重置种子', rows: ['恢复初始种子数据?'], onOk: function () { api('/api/products/reset', 'POST', {}).then(function () { setMsg('↩ 已重置'); after(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); } }); };
      const [modal2, setModal2] = React.useState(null);
      // ===== 导出表格: 勾选列 + 真实下载 (xlsx/csv 由后端生成, 浏览器直接落盘) =====
      // (expOpen 已在上面状态区声明)
      const [expCols, setExpCols] = React.useState(function () { const m = {}; EXPORT_COLS.forEach(function (c) { m[c[0]] = !!c[2]; }); return m; });
      const expChosen = function () { return Object.keys(expCols).filter(function (k) { return expCols[k]; }); };
      const expToggle = function (k) { setExpCols(function (o) { const n = Object.assign({}, o); n[k] = !n[k]; return n; }); };
      const expUrl = function (fmt) {
        const cols = expChosen();
        const a = selArr();
        const qs = ['format=' + fmt, 'fields=' + cols.join(',')];
        if (a.length) qs.push('asins=' + a.join(','));
        return EXPORT_BASE + '?' + qs.join('&');
      };
      // 用 <a> 触发下载: 响应带 Content-Disposition: attachment → 浏览器直接存文件 (不经 api 代理, 避免二进制被当文本解码)
      const doExport = function (fmt) {
        const cols = expChosen();
        if (!cols.length) { setMsg('✗ 请至少勾选一列'); return; }
        const a = selArr();
        const url = expUrl(fmt);
        try {
          const el = document.createElement('a');
          el.href = url; el.rel = 'noopener';
          document.body.appendChild(el); el.click(); el.remove();
          setMsg('⬇ 已开始下载 ' + (fmt === 'xlsx' ? 'Excel(.xlsx)' : fmt.toUpperCase()) + ' — ' + cols.length + ' 列 · ' + (a.length ? '选中 ' + a.length + ' 个商品' : '全部 ' + total + ' 个商品') + ' (若浏览器拦截下载, 点「🔗 浏览器打开」)');
        } catch (e) { setMsg('✗ 导出失败: ' + String(e && e.message || e)); }
      };
      const refreshRank = function () {
        setModal2({ title: '补采排名', rows: ['将对所有无排名商品逐个打开详情页补采 BSR 排名 (每个约 8 秒, 可在采集面板点停止中断)。确定开始?'], onOk: function () {
          setModal2(null); setBusy('rank'); setTask('补采排名中…');
          api('/api/products/refresh-ranks', 'POST', {}).then(function (r) {
            setBusy(''); setTask('');
            const j = r && r.json ? r.json : {};
            const rows = ['✅ 补采排名完成 共处理 ' + (j.done || 0) + ' / 补到 ' + (j.addedRank || 0) + ' / 失败 ' + (j.fail || 0)];
            if (j.stopped) rows.push('⏹ 已手动停止');
            setMsg2(rows); load();
          }).catch(function (e) { setBusy(''); setTask(''); setMsg('✗ 补采失败: ' + String(e && e.message || e)); });
        } });
      };
      React.useEffect(function () {
        if (busy !== 'rank') return undefined;
        const poll = function () { api('/api/collect/progress', 'GET', null).then(function (r) { if (r && r.ok && r.json && r.json.running) { const g = r.json; setTask('补采排名中: ' + (g.items != null ? g.items : 0) + ' 个, 已补 ' + (g.added != null ? g.added : 0)); } else { setTask(''); } }).catch(function () {}); };
        poll();
        const off = ctx.interval(poll, 3000);
        return function () { if (typeof off === 'function') { try { off(); } catch (e) {} } };
      }, [busy]);
      const [msg2, setMsg2] = React.useState(null);
      const search1688 = function () {
        const targets = selArr().length ? items.filter(function (x) { return selArr().indexOf(x.asin) >= 0; }) : (items || []).filter(function (x) { return x.mainImage; }).slice(0, 10);
        if (!targets.length) { setMsg('请先勾选商品 (或库中无主图商品)'); return; }
        setModal2({ title: '1688 图搜找货', rows: ['将对 ' + targets.length + ' 个商品逐个上传主图到 1688 以图搜图 (每个约 30 秒, 可停止)。确定开始?'], onOk: function () {
          setModal2(null); setBusy('g1688'); setTask('');
          const res = [];
          const next = function (i) {
            if (i >= targets.length) { setBusy(''); setTask(''); setMsg2(['✅ 1688 批量图搜完成 共处理 ' + targets.length + ' / 找到同款 ' + res.filter(function (x) { return x.count > 0; }).length + ' 个 (已自动存入第一个货源)'].concat(res.map(function (x) { return x.count > 0 ? '✓ ' + x.asin + ': ' + x.count + ' 个同款' : '✗ ' + x.asin + ': 未找到'; }))); load(); return; }
            const p = targets[i];
            setTask('1688 图搜 ' + (i + 1) + '/' + targets.length + ': ' + p.asin);
            api('/api/products/1688-search-upload', 'POST', { asin: p.asin }).then(function (r) {
              const j = r && r.json ? r.json : {};
              const cnt = j.count || 0;
              if (cnt && j.items && j.items[0]) {
                const g0 = j.items[0];
                const goods = (p.sourceGoods || []).slice();
                const now = new Date();
                const pad = function (n) { return n < 10 ? '0' + n : String(n); };
                goods.push({ platform: '1688', url: g0.url, title: g0.title, price: g0.priceRaw || g0.price, addedAt: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) });
                api('/api/products/goods', 'POST', { asin: p.asin, goods: goods }).then(function () { res.push({ asin: p.asin, count: cnt }); next(i + 1); }).catch(function () { res.push({ asin: p.asin, count: 0 }); next(i + 1); });
              } else { res.push({ asin: p.asin, count: 0 }); next(i + 1); }
            }).catch(function () { res.push({ asin: p.asin, count: 0 }); next(i + 1); });
          };
          next(0);
        } });
      };
      // 站点 → amazon 域名后缀 (必须与后端 siteToHostSuffix 完全一致, 否则小站点会拼出 amazon.tr 这种错误域名)
      const domOf = function (site) { return ({ uk: 'co.uk', us: 'com', jp: 'co.jp', au: 'com.au', mx: 'com.mx', br: 'com.br', sg: 'com.sg', tr: 'com.tr', ae: 'ae', sa: 'sa', nl: 'nl', se: 'se', pl: 'pl', de: 'de', fr: 'fr', it: 'it', es: 'es', ca: 'ca', in: 'in' }[site] || site || 'de'); };
      const amazonOf = function (p) { return 'https://www.amazon.' + domOf(p.site) + '/dp/' + p.asin; };
      const th = function (t, k) { return h('th', { key: k }, t); };
      const badge = function (t, cls) { return h('span', { className: 'zyp-badge ' + (cls || 'zyp-bg') }, t); };
      const tmBadge = function (p) {
        if (p.brandStatus === 'registered') return badge('已备案', 'zyp-br');
        if (p.brandStatus === 'unchecked') return badge('有商标', 'zyp-bm');
        if (p.trademarkCount > 0) return badge(p.trademarkCount + '商标', 'zyp-bm');
        return badge('未查到', 'zyp-bg');
      };
      const openTm = function (p) {
        api('/api/products/detail?asin=' + encodeURIComponent(p.asin), 'GET', null).then(function (r) {
          const d = r && r.json ? (r.json.product || r.json) : null;
          if (!d) return;
          const cs = Array.isArray(d.tmCountries) ? d.tmCountries : [];
          setMsg2([(d.brand || p.brand || '') + ' 商标注册国家:', cs.length ? cs.join('、') : '无记录', d.tmText ? ('原文: ' + d.tmText) : ''].concat(cs.length ? [] : []));
        }).catch(function () {});
      };
      const rowCells = function (p) {
        const img = p.mainImage ? h('img', { src: p.mainImage, style: { width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid #333', cursor: 'pointer' }, onClick: function () { setMsg2(null); setBigImg(p.mainImage); }, alt: '' }) : h('div', { style: { width: 36, height: 36, border: '1px dashed #333', borderRadius: 6, cursor: 'pointer' }, onClick: function () { openDetail(p); } });
        const bigRank = p.rank || (Array.isArray(p.bsr) && p.bsr.length ? '#' + Math.max.apply(null, p.bsr.map(function (b) { return b.rank; })) : '');
        const smallRank = Array.isArray(p.bsr) && p.bsr.length ? Math.min.apply(null, p.bsr.map(function (b) { return b.rank; })) : null;
        const mainV = p.minPrice != null ? p.minPrice : p.price;
        const title = String(p.title || '-');
        const badgeCell = h('span', { style: { cursor: 'help' }, onClick: function () { openTm(p); } }, tmBadge(p), (Array.isArray(p.tmCountries) && p.tmCountries.length) ? h('span', { className: 'zyp-note', style: { fontSize: 10 } }, ' ' + p.tmCountries.length + '国') : null);
        const tags = [];
        if (p.badge === 'bestseller') tags.push(badge('Best', 'zyp-bz'));
        else if (p.badge === 'choice') tags.push(badge('⭐ A', 'zyp-bb'));
        else if (p.badge === 'deal') tags.push(badge('Deal', 'zyp-br'));
        else if (p.badge === 'newrelease') tags.push(badge('新品', 'zyp-bg'));
        if (p.aplus) tags.push(badge('A+', 'zyp-bm'));
        if (p.is1688) tags.push(p.is1688Url ? h('span', { key: 'i1688', className: 'zyp-badge zyp-bz', style: { cursor: 'pointer' }, onClick: function () { openExternal(p.is1688Url, '1688 同款'); } }, '1688 ↗') : badge('1688', 'zyp-bz'));
        if (p.bgMark) tags.push(h('span', { key: 'bg', title: 'BG标' }, badge('BG', 'zyp-br')));
        if (p.tmMark) tags.push(h('span', { key: 'tm', title: 'TM标' }, badge('TM', 'zyp-bm')));
        if (p.patentRisk) tags.push(h('span', { key: 'pat', title: '专利风险' }, badge('专利', 'zyp-br')));
        return h('tr', { key: p.asin },
          h('td', null, h('input', { type: 'checkbox', checked: !!sel[p.asin], onChange: function () { toggle(p.asin); } })),
          h('td', { style: { color: (p.rank && Number(String(p.rank).split('#').join('').split(',').join('').replace(' ', '')) < 100) ? '#f0b253' : undefined } }, p.rank || '-'),
          h('td', null, h('code', { style: { fontSize: 11 } }, p.asin)),
          h('td', null,
            h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
              bigRank ? h('span', { title: '大排名', className: 'zyp-badge zyp-bz' }, '#' + String(bigRank).split('#').pop()) : null,
              img,
              h('div', { style: { fontSize: 12, cursor: 'pointer', maxWidth: 240, lineHeight: 1.35, maxHeight: 34, overflow: 'hidden' }, onClick: function () { openDetail(p); } }, title.slice(0, 55) + (title.length > 55 ? '…' : '')))),
          h('td', null, h('b', null, p.brand || '')),
          h('td', null, badgeCell),
          h('td', null, p.amazonSell ? badge('AMZ 自营', 'zyp-bz') : (p.fulfill === 'FBA' ? badge('FBA', 'zyp-bb') : (p.fulfill === 'FBM' ? badge('FBM', 'zyp-warn') : (p.fulfill ? badge(p.fulfill, 'zyp-bm') : '-')))),
          h('td', null, h('div', null, h('b', null, FmtMoney(mainV, p.currency))), (p.buyBoxPrice != null && p.buyBoxPrice !== mainV) ? h('div', { className: 'zyp-note', title: 'BuyBox价', style: { fontSize: 10.5 } }, FmtMoney(p.buyBoxPrice, p.currency)) : null),
          h('td', null, FmtNum(p.monthlySales)),
          h('td', null, Array.isArray(p.bsr) && p.bsr.length ? h('div', null, p.bsr.slice(0, 2).map(function (b, i) { return h('span', { key: i, className: 'zyp-pill', style: { margin: '0 2px 2px 0' } }, '#' + b.rank + ' ' + String(b.category || b.name || '').slice(0, 16)); }), smallRank != null && p.bsr.length > 1 ? h('div', { className: 'zyp-note', style: { fontSize: 10 } }, '细分 小 ' + FmtNum(smallRank)) : null) : (p.rank ? p.rank : '-')),
          h('td', null, h('div', { style: { whiteSpace: 'nowrap' } }, tags)),
          h('td', null, h('div', null, h('span', { style: { fontSize: 11 } }, p.sellerId || '-')), p.chinaSeller ? h('div', null, badge('中国卖家', 'zyp-br')) : null),
          h('td', null, p.followCount != null ? p.followCount : '-'),
          h('td', null, String(p.site || '').toUpperCase()),
          h('td', { className: 'zyp-note', title: '采集时间(UTC) ' + (p.collectedAt || '-') }, (function () {
            const s = String(p.collectedAt || ''); if (!s) return '-';
            const d = new Date(s.replace(' ', 'T') + 'Z');   // collectedAt 存 UTC
            if (isNaN(d.getTime())) return s.slice(0, 16);
            const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
            return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
          })()),
          h('td', null, h('div', { style: { display: 'flex', gap: 4, whiteSpace: 'nowrap' } },
            h('span', { className: 'zyp-lnk', title: '在亚马逊打开', onClick: function () { openExternal(amazonOf(p), p.asin + ' ' + (p.title || '').slice(0, 20)); } }, '⧉ 链接↗'),
            h('span', { className: 'zyp-lnk', onClick: function () { api('/api/products/save', 'POST', { asins: [p.asin], saved: !p.saved }).then(function () { load(); }).catch(function () {}); } }, p.saved ? '★' : '☆'),
            h('span', { className: 'zyp-lnk', title: '认领到草稿箱', onClick: function () { api('/api/claims', 'POST', { asin: p.asin }).then(function (r) { setMsg('✔ 已认领: ' + p.asin); }).catch(function (e) { setMsg('⚠ ' + String(e && e.message || e)); }); } }, '⚡'),
            h('span', { className: 'zyp-lnk', title: '删除', onClick: function () { setModal2({ title: '删除', rows: ['确定删除 ' + p.asin + ' 吗?'], onOk: function () { api('/api/products/delete', 'POST', { asins: [p.asin] }).then(function () { setSel(function (o) { const n = Object.assign({}, o); delete n[p.asin]; return n; }); load(); }).catch(function (e) { setMsg('✗ ' + String(e && e.message || e)); }); } }); } }, '🗑'))));
      };
      const openDetail = function (p) {
        api('/api/products/detail?asin=' + encodeURIComponent(p.asin), 'GET', null).then(function (r) {
          const d = r && r.json ? (r.json.product || r.json) : null;
          if (!d) { setMsg('未取到详情'); return; }
          setDtl(d);
        }).catch(function () { setMsg('详情加载失败'); });
      };
      const [bigImg, setBigImg] = React.useState(null);
      const [dtl, setDtl] = React.useState(null);
      // 统一过滤面板: 与采集面板是同一个组件、同一组字段 (不按场景裁剪)
      // ===== 货源总览 (全局视图: 覆盖率/平台分布/最划算/久未核价) =====
      const govCard = h('div', { className: 'zyp-card', style: govOpen ? { borderColor: '#4f8cff' } : {} },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('div', { className: 'zyp-h', style: { flex: 1, margin: 0 } }, '📦 货源总览' + (gov ? ' · 已找货源 ' + gov.withGoods + '/' + gov.products + ' 个商品 · 共 ' + gov.totalGoods + ' 条' : '')),
          h('button', { className: 'zyp-btn', onClick: function () { if (!govOpen && !gov) loadGoodsOverview(); setGovOpen(!govOpen); } }, govOpen ? '收起' : '展开'),
          h('button', { className: 'zyp-btn', onClick: loadGoodsOverview }, '⟳')),
        !govOpen ? null : (!gov ? h('div', { className: 'zyp-note' }, '加载中…') : h('div', null,
          h('div', { className: 'zyp-note', style: { marginBottom: 6 } },
            '未找货源: ' + gov.missing + ' 个商品' + (gov.missing ? ' ← 这些还没定过供应商' : '') + ' · 平台分布: ' + Object.keys(gov.byPlatform).map(function (k) { return k + ' ' + gov.byPlatform[k]; }).join(' / ')),
          gov.bestDeals && gov.bestDeals.length ? h('div', { style: { marginBottom: 6 } },
            h('div', { className: 'zyp-lbl' }, '货源成本占售价最低 (最划算 30 个)'),
            h('div', { style: { maxHeight: 160, overflow: 'auto' } }, gov.bestDeals.slice(0, 30).map(function (b, i) {
              return h('div', { key: i, style: { display: 'flex', gap: 8, fontSize: 12, padding: '2px 0', borderBottom: '1px dashed #26262c' } },
                h('span', { style: { color: '#5fd08a', width: 52 } }, b.ratioPct + '%'),
                h('span', { className: 'zyp-note', style: { width: 92 } }, String(b.site || '').toUpperCase() + ' ¥' + b.priceCny),
                h('code', { style: { fontSize: 11 } }, b.asin),
                h('span', { style: { flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, onClick: function () { openExternal(b.url, b.asin + ' 货源'); } }, String(b.title || '').slice(0, 40) + ' ↗'));
            }))) : null,
          gov.stale && gov.stale.length ? h('div', null,
            h('div', { className: 'zyp-lbl' }, '⚠ 超过 30 天未核价 (' + gov.stale.length + ' 条) — 采购价会变, 旧价决策会翻车'),
            h('div', { className: 'zyp-note', style: { fontSize: 11, maxHeight: 80, overflow: 'auto' } }, gov.stale.slice(0, 20).map(function (x) { return x.asin + '(' + (x.checkedAt || '').slice(0, 10) + ')'; }).join(' · '))) : null)));
      const filterPanel = h(ZypFilterPanel, {
        value: flt, open: fopen, catTree: catTree, onReloadCat: loadCatTree,
        onChange: function (nf) { setFlt(nf); }
      });
      const filterActions = h('div', { style: { marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' } },
        h('button', { className: 'zyp-btn', style: { background: '#2f6feb', borderColor: '#2f6feb', color: '#fff' }, onClick: function () { setPage(1); load(); } }, '✓ 应用筛选'),
        h('button', { className: 'zyp-btn', onClick: function () { setFlt(NF()); setPage(1); setTimeout(load, 0); } }, '✕ 清除'),
        h('span', { className: 'zyp-note', style: { marginLeft: 'auto' } }, '已启用 ' + Object.keys(NF()).filter(function (k) { const val = flt[k]; return Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? val : (val !== '' && val != null)); }).length + ' 项条件'));
      const expPanel = !expOpen ? null : h('div', { className: 'zyp-card', style: { borderColor: '#4f8cff' } },
        h('div', { className: 'zyp-h' }, '📊 导出表格 (勾选要导出的列)'),
        h('div', { className: 'zyp-note', style: { marginBottom: 6 } }, '默认已勾选「重要信息」10 列: ASIN / 站点 / 标题 / 价格 / 币种 / 配送 / 自营 / A+ / AC / 跳转链接。表格第一行冻结, 价格等为数值列。'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, border: '1px solid #333', borderRadius: 8, padding: 6 } },
          EXPORT_COLS.map(function (c) {
            const on = !!expCols[c[0]];
            return h('label', { key: c[0], style: { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12, border: '1px solid #333', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', background: on ? 'rgba(79,140,255,.14)' : 'transparent' } },
              h('input', { type: 'checkbox', checked: on, onChange: function () { expToggle(c[0]); } }), c[1]);
          })),
        h('div', { style: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { className: 'zyp-btn', style: { background: '#1e7a3c', borderColor: '#1e7a3c', color: '#fff' }, onClick: function () { doExport('xlsx'); } }, '⬇ 下载 Excel (.xlsx)'),
          h('button', { className: 'zyp-btn', onClick: function () { doExport('csv'); } }, '⬇ 下载 CSV'),
          h('button', { className: 'zyp-btn', onClick: function () { doExport('txt'); } }, '⬇ 下载 TXT'),
          h('button', { className: 'zyp-btn', onClick: function () { const m = {}; EXPORT_COLS.forEach(function (c) { m[c[0]] = !!c[2]; }); setExpCols(m); } }, '↺ 只选重要信息'),
          h('button', { className: 'zyp-btn', onClick: function () { const m = {}; EXPORT_COLS.forEach(function (c) { m[c[0]] = true; }); setExpCols(m); } }, '全选'),
          h('button', { className: 'zyp-btn', onClick: function () { const m = {}; EXPORT_COLS.forEach(function (c) { m[c[0]] = false; }); setExpCols(m); } }, '全不选'),
          h('button', { className: 'zyp-btn', onClick: function () { const u = expUrl('xlsx'); if (typeof openExternal === 'function') openExternal(u, '导出 Excel'); else window.open(u, '_blank'); } }, '🔗 浏览器打开'),
          h('span', { className: 'zyp-note', style: { marginLeft: 'auto' } }, '已勾选 ' + expChosen().length + ' 列 · ' + (selArr().length ? '将导出选中 ' + selArr().length + ' 个' : '将导出全部 ' + total + ' 个')),
          h('button', { className: 'zyp-btn', onClick: function () { setExpOpen(false); } }, '✕ 收起')));
      const seedBar = seed ? h('div', { className: 'zyp-toolbar', style: { background: 'rgba(79,140,255,.10)', borderColor: '#4f8cff' } },
        h('span', { style: { fontWeight: 600, color: '#8ab4ff' } }, '🗂 正在查看单次采集结果: ' + (seed.label || '')),
        h('span', { className: 'zyp-note' }, '仅显示该次采集入库的商品'),
        h('button', { className: 'zyp-btn', style: { marginLeft: 'auto' }, onClick: function () { setFlt(NF()); setPage(1); setTimeout(load, 0); } }, '✕ 显示全部商品')) : null;
      // 工具栏: 搜索框 + 常用快捷筛选 (与面板同一个 flt 状态 / 同一套逻辑) + 面板开关 + 动作按钮
      const toolbar = h('div', { className: 'zyp-toolbar' },
        h('input', { className: 'zyp-input', value: flt.q, onChange: function (e) { setFlt(Object.assign({}, flt, { q: e.target.value })); }, placeholder: '🔍 搜索 ASIN/标题', style: { width: 190 } }),
        h('select', { className: 'zyp-input', value: flt.fulfill || (flt.sell === 'third' ? 'THIRD' : ''), onChange: function (e) { const v = e.target.value; setFlt(Object.assign({}, flt, { fulfill: (v === 'THIRD' ? '' : v), sell: (v === 'THIRD' ? 'third' : '') })); } },
          h('option', { value: '' }, '全部配送'), h('option', { value: 'FBA' }, 'FBA'), h('option', { value: 'FBM' }, 'FBM'), h('option', { value: 'AMZ' }, 'AMZ 自营'), h('option', { value: 'THIRD' }, '第三方卖家')),
        h('select', { className: 'zyp-input', value: flt.aplus, onChange: function (e) { setFlt(Object.assign({}, flt, { aplus: e.target.value })); } },
          h('option', { value: '' }, '全部 A+'), h('option', { value: '1' }, '仅有 A+'), h('option', { value: '0' }, '排除 A+')),
        h('select', { className: 'zyp-input', value: (flt.badges || []).length === 1 ? flt.badges[0] : '', onChange: function (e) { setFlt(Object.assign({}, flt, { badges: e.target.value ? [e.target.value] : [] })); } },
          h('option', { value: '' }, '全部标签'), h('option', { value: 'bestseller' }, 'Best Seller'), h('option', { value: 'choice' }, '⭐ A(AC)'), h('option', { value: 'deal' }, '限时优惠'), h('option', { value: 'newrelease' }, '新品'), h('option', { value: 'A+' }, 'A+')),
        h('select', { className: 'zyp-input', value: flt.china, onChange: function (e) { setFlt(Object.assign({}, flt, { china: e.target.value })); } },
          h('option', { value: '' }, '全部卖家地区'), h('option', { value: '1' }, '中国卖家'), h('option', { value: '0' }, '非中国卖家')),
        h('button', { className: 'zyp-btn', onClick: function () { setPage(1); load(); } }, '🔍 搜索'),
        h('button', { className: 'zyp-btn', style: fopen ? { borderColor: '#4f8cff', color: '#8ab4ff' } : undefined, onClick: function () { if (!fopen && !catTree) loadCatTree(); setFopen(!fopen); } }, '🎛 过滤条件' + (function () { const n = Object.keys(NF()).filter(function (k) { const val = flt[k]; return Array.isArray(val) ? val.length > 0 : (typeof val === 'boolean' ? val : (val !== '' && val != null)); }).length; return n ? ' (' + n + ')' : ''; })()),
        h('button', { className: 'zyp-btn', onClick: refreshRank, disabled: !!busy }, busy === 'rank' ? '补采中…' : '📡 补采排名'),
        h('button', { className: 'zyp-btn', onClick: search1688, disabled: !!busy }, busy === 'g1688' ? '图搜中…' : '🖼 1688 图搜找货'),
        h('span', { className: 'zyp-note', style: { marginLeft: 'auto' } }, task || ('共 ' + total + ' 条')),
        h('span', { className: 'zyp-note', style: { fontSize: 10, opacity: .6 } }, UI_BUILD));
      const batchBar = h('div', { className: 'zyp-toolbar' },
        h('span', { className: 'zyp-note' }, '已选 ' + selArr().length + ' 项'),
        h('button', { className: 'zyp-btn', onClick: batchSave }, '💾 保存选中'),
        h('button', { className: 'zyp-btn', onClick: batchClaim }, '📌 认领选中'),
        h('button', { className: 'zyp-btn', onClick: batchSync }, '🔄 同步选中'),
        h('button', { className: 'zyp-btn', onClick: batchDelete }, '🗑 批量删除'),
        h('button', { className: 'zyp-btn', onClick: clearAll }, '🧹 一键清空'),
        h('button', { className: 'zyp-btn', style: expOpen ? { borderColor: '#4f8cff', color: '#8ab4ff' } : undefined, onClick: function () { setExpOpen(!expOpen); } }, '📊 导出表格'),
        h('button', { className: 'zyp-btn', onClick: resetAll }, '↩ 重置'));
      const tableEl = h('div', { style: { overflow: 'auto', maxHeight: '52vh' } },
        items === null ? h('div', { className: 'zyp-note', style: { padding: 14 } }, '加载中…') :
        h('table', { className: 'zyp-tbl' },
          h('thead', null, h('tr', null,
            h('th', null, h('input', { type: 'checkbox', checked: !!allOn, ref: function (el) { if (el) el.indeterminate = someOn && !allOn; }, onChange: toggleAll })),
            th('排名', 'rk'), th('ASIN', 'asin'), th('商品', 't'), th('品牌', 'b'), th('备案/商标', 'tm'), th('配送', 'fba'), th('价格', 'pr'), th('30天销量', 's'), th('榜单排名', 'bsr'), th('标签', 'tag'), th('卖家', 'sl'), th('跟卖', 'fc'), th('站点', 'site'), th('采集时间', 'ct'), th('操作', 'op'))),
          h('tbody', null, cur.length ? cur.map(rowCells) : h('tr', null, h('td', { colSpan: 16, className: 'zyp-note', style: { textAlign: 'center', padding: 20 } }, '无匹配商品 (可去采集面板采集)')))));
      const pager = h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', flexWrap: 'wrap' } },
        h('button', { className: 'zyp-btn', disabled: page <= 1, onClick: function () { setPage(page - 1); } }, '◀ 上一页'),
        h('span', { className: 'zyp-note' }, '第 ' + page + '/' + pages + ' 页 · 共 ' + total + ' 条'),
        h('button', { className: 'zyp-btn', disabled: page >= pages, onClick: function () { setPage(page + 1); } }, '下一页 ▶'),
        h('select', { className: 'zyp-input', value: String(size), onChange: function (e) { setSize(Number(e.target.value)); setPage(1); } }, [20, 50, 100, 200].map(function (n) { return h('option', { key: n, value: String(n) }, '每页 ' + n); })));
      return h('div', null,
        seedBar,
        toolbar,
        govCard,
        filterPanel,
        filterActions,
        expPanel,
        batchBar,
        tableEl,
        pager,
        bigImg ? h(Modal, { title: '主图', onClose: function () { setBigImg(null); }, children: h('div', { style: { textAlign: 'center' } }, h('img', { src: bigImg, style: { maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 } }, null)) }) : null,
        dtl ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.62)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '18px', overflow: 'auto' }, onClick: function (e) { if (e.target === e.currentTarget) { setDtl(null); load(); } } },  h('div', { style: { background: 'var(--dsw-alias-bg-layer-1,#1b1b1f)', border: '1px solid #3a3a44', borderRadius: 12, maxWidth: 1080, width: '100%' } },    h('div', { style: { padding: '10px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: 'var(--dsw-alias-bg-layer-1,#1b1b1f)', zIndex: 2 } },      h('b', null, '📋 商品详情'), h('span', { className: 'zyp-note' }, String(dtl.asin || '') + ' · ' + String(dtl.site || '').toUpperCase()),      h('button', { className: 'zyp-btn', style: { marginLeft: 'auto' }, onClick: function () { setDtl(null); load(); } }, '✕ 关闭')),    h('div', { style: { padding: '4px 16px 16px', maxHeight: '86vh', overflowY: 'auto' } }, h(DetailPane, { p: dtl, api: api, openExternal: openExternal, notify: setMsg })))) : null,
        msg2 ? h(Modal, { title: '提示', rows: msg2, onClose: function () { setMsg2(null); } }) : null,
        msg ? h(Modal, { title: '操作结果', rows: [msg], onClose: function () { setMsg(null); } }) : null,
        modal2 ? h(Modal, { title: modal2.title, rows: modal2.rows, onClose: function () { setModal2(null); }, buttons: [{ label: '取消', onClick: function () { setModal2(null); } }, { label: '确定', primary: true, onClick: function () { modal2.onOk(); } }] }) : null
      );
    }
    function ZyRoot() {
      const [tp, setTp] = React.useState('collect');
      const [prodSeed, setProdSeed] = React.useState(null);   // 从采集日志跳转带入的商品管理初始过滤 {collectedFrom,collectedTo,label}
      const [lic, setLic] = React.useState(null);             // 后端授权状态 (enforce/valid/fingerprint/到期)
      React.useEffect(function () { api('/api/license/status', 'GET', null).then(function (r) { if (r && r.ok && r.json) setLic(r.json); }).catch(function () {}); }, []);
      const btn = function (id, icon, label) { return h('button', { className: 'zywb-tab' + (tp === id ? ' on ' : '') , onClick: function () { setTp(id); } }, icon + ' ' + label); };
      const openProducts = function (g) { setProdSeed({ collectedFrom: g.fromUtc, collectedTo: g.toUtc, label: (g.atLocal || '') + ' · ' + (g.name || '') }); setTp('product'); };
      if (lic && lic.enforce && !lic.valid) {
        return h('div', { className: 'zywb' }, h('div', { className: 'zywb-body' },
          h('div', { className: 'zywb-card', style: { maxWidth: 720, margin: '48px auto' } },
            h('div', { className: 'zywb-h', style: { color: '#f0b253', fontSize: 15 } }, '🔒 本机未授权'),
            h('div', { className: 'zywb-note' }, '原因: ' + (lic.message || lic.reason || '无有效授权')),
            h('div', { className: 'zywb-note', style: { marginTop: 10 } }, '本机设备指纹 (发给授权方换取授权文件):'),
            h('div', { style: { fontFamily: 'monospace', fontSize: 16, letterSpacing: 1, padding: '8px 10px', marginTop: 4, background: 'var(--dsw-alias-bg-layer-2,#24242b)', border: '1px solid #3a3a44', borderRadius: 6, display: 'inline-block', userSelect: 'text' } }, String(lic.fingerprint || '')),
            h('div', { className: 'zywb-note', style: { marginTop: 12, color: '#8ab4ff' } }, '联系授权方' + (lic.contact ? ': ' + lic.contact : '') + ' → 把上面这串指纹发给他'),
            h('div', { className: 'zywb-note', style: { marginTop: 6 } }, '激活步骤: ① 把指纹发给授权方 ② 收到 license.key 后放到 ' + (lic.licensePath || lic.dataDir || '数据目录') + ' ③ 刷新本页'),
            h('div', { className: 'zywb-note', style: { marginTop: 8, opacity: .8 } }, '授权客户: ' + (lic.customer || '-') + ' · 到期: ' + (lic.expiresAt || '-') + ' · 机器绑定: ' + ((lic.licenseId ? '是' : '否'))))));
      }
      const licChip = lic ? (lic.enforce
        ? (lic.valid ? h('span', { className: 'zywb-note', style: { marginLeft: 'auto', fontSize: 11 } }, '✅ ' + (lic.customer || '已授权') + (lic.expiresAt ? ' · 到期 ' + lic.expiresAt : '')) : null)
        : null) : null;   // 免授权版(enforce=false)不显示任何提示, 界面干净
      return h('div', { className: 'zywb' },
        h('div', { className: 'zywb-tabs' }, btn('collect', '🛰', '采集面板'), btn('product', '📦', '商品管理'), licChip),
        tp === 'collect' ? h('div', { className: 'zywb-body' }, h(CollectPage, { api: api, onOpenProducts: openProducts })) : h('div', { className: 'zywb-body' }, h(ProductPage, { seed: prodSeed, key: prodSeed ? (prodSeed.collectedFrom + '_' + prodSeed.collectedTo) : 'all' })));
    }
    slots.inject('conversation.view', function () { return slots.register(
      { name: 'conversation.view', id: 'zying-all', order: 5, label: '搞薯条' },
      function () { return h(ZyRoot, null); }
    ); });
  }
}

		})();
		__mod.exports.inject = __plugin.inject || ["slots", "timer"];
		__mod.exports.apply = __plugin.apply;
		__mod.ready = true;
		return __mod.exports;
	}
});
// ── 兜底：同一个包再挂几个历史上用过的 id ──
// 某些 DSH 版本的加载器按"登记用的名字"查找模块，只认一个 id 时会报
// "加载时未通过 __ModuleLoader__.load 注册 <名字>"。多注册几个名字就都不会找不到。
// 用的是同一个 __mod，所以即使被加载两次也不会挂出两个页签。
(function () {
	var alias = ["zying-collect-dsh-plugin"];
	for (var i = 0; i < alias.length; i++) {
		if (alias[i] === "zying-erp") continue;
		window.__ModuleLoader__.load({ id: alias[i], factory: function () { return __mod.exports; } });
	}
})();
