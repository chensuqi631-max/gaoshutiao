'use strict';
/**
 * 站点 / 链接解析工具（纯函数，可单测）
 *
 * 来源：《多链接店铺采集-开发文档.md》第三节「关键实现（可直接抄）」+《多链接采集-完整代码.js》的注入契约。
 *
 * 为什么单独成文件（优化）：
 *   文档把这几个函数直接抄进 server.js。但 server.js 没有 module.exports，
 *   放进去就**无法被单测覆盖** —— 而它们正是「选澳洲采到德国」这类错误的根因所在
 *   （坑 #1 硬编码 amazon.de、坑 #34 站点用接口默认值而不是链接域名）。
 *   抽成独立模块后，server.js 与单测 require 同一份实现，避免两处漂移。
 *
 * server.js 用法（作为依赖注入给 links-collector）:
 *   const siteLinks = require('./site-links.js');
 *   opts = { siteToHostSuffix: siteLinks.siteToHostSuffix,
 *            classifySellerLink: siteLinks.classifySellerLink,
 *            resolveCollectSite: siteLinks.resolveCollectSite, ... }
 */

/* ============================== 站点表 ============================== */

/** 站点代码 → 域名后缀 */
const SITE_HOST = {
  uk: 'co.uk', us: 'com', de: 'de', fr: 'fr', it: 'it', es: 'es', jp: 'co.jp', ca: 'ca',
  in: 'in', au: 'com.au', mx: 'com.mx', br: 'com.br', nl: 'nl', se: 'se', pl: 'pl',
  sg: 'com.sg', tr: 'com.tr', ae: 'ae', sa: 'sa',
};

/** 域名后缀 → 站点代码（等价于文档里的 CDP_SITE_CODE） */
const CDP_SITE_CODE = Object.keys(SITE_HOST).reduce((m, k) => { m[SITE_HOST[k]] = k; return m; }, {});
CDP_SITE_CODE.com = 'us';

/** 站点 → marketplaceID（/sp → /s?me= 规范化用）。取自文档第三节。 */
const SITE_MARKETPLACE = {
  uk: 'A1F83G8C2ARO7P', us: 'ATVPDKIKX0DER', de: 'A1PA6795UKMFR9', fr: 'A13V1IB3VIYZZH',
  it: 'APJ6JRA9NG5V4', es: 'A1RKKUPIHCS9HS', jp: 'A1VC38T7YXB528', ca: 'A2EUQ1WTGCTBG2',
  in: 'A21TJRUUN4KGV', au: 'ANEGB3WVEVKZB', mx: 'AVDBXBAVVSXLQ', br: 'A2Q3Y263D00KWC',
  nl: 'A1805IZSGTT6HS', se: 'A2NODRKZP88ZB9', pl: 'A1C3SOZRARQ6R3', sg: 'A19VAU5U5O7RUS',
  tr: 'A33AVAJ2PDY3EV', ae: 'A2VIGQ35RCS4UG', sa: 'A17E79C6D8DWNP',
};

/** 站点 → 币种（商品库 currency 字段；多站混采时尤其重要） */
const SITE_CURRENCY = {
  uk: 'GBP', us: 'USD', ca: 'CAD', au: 'AUD', sg: 'SGD', jp: 'JPY', in: 'INR', br: 'BRL',
  mx: 'MXN', se: 'SEK', pl: 'PLN', tr: 'TRY', ae: 'AED', sa: 'SAR',
};
// de / fr / it / es / nl → EUR（下面兜底）

/** 站点代码 → 域名后缀；也接受直接传后缀（'co.uk'） */
function siteToHostSuffix(site) {
  const s = String(site == null ? '' : site).trim().toLowerCase();
  if (!s) return 'de';
  if (SITE_HOST[s]) return SITE_HOST[s];
  if (CDP_SITE_CODE[s]) return s;
  return 'de';
}

/** 站点 → 币种 */
function siteCurrency(site) {
  const s = String(site == null ? '' : site).trim().toLowerCase();
  return SITE_CURRENCY[s] || 'EUR';
}

/* ============================== 链接解析 ============================== */

/**
 * 从链接里认出站点代码（文档第三节 1）。
 * ★ 长后缀必须排在前面，否则 com.au 会被 com 抢先匹配 → 澳洲链接被当成美国站。
 */
function siteFromUrl(url) {
  const m = String(url || '').match(/amazon\.(com\.au|co\.uk|com\.mx|com\.br|co\.jp|com\.sg|com\.tr|com|de|fr|it|es|ca|in|nl|se|pl|ae|sa)/);
  return m && CDP_SITE_CODE[m[1]] ? CDP_SITE_CODE[m[1]] : null;
}

/**
 * 链接分类 + 规范化（文档第三节 2）。
 *   /s?me=XXXX          → kind='shop'    直接用
 *   /sp?...seller=XXXX  → kind='seller'  规范化成 /s?me=XXXX&marketplaceID=...
 *   /dp/ASIN            → kind='product' 取该商品的跟卖卖家
 *   其它                → kind='unknown'
 *
 * ★ 站点以【链接里的域名】为准（坑 #34）：用接口默认值会生成错域名 → 采到 0 个。
 * ★ /sp 必须规范化（坑 #7）：实测 /sp 上的商品是懒加载，滚动后仍读到 0 个卡片。
 */
function classifySellerLink(rawUrl) {
  const u = String(rawUrl || '').trim();
  const site = siteFromUrl(u);
  const asin = (u.match(/\/dp\/([A-Z0-9]{10})/) || u.match(/[?&]asin=([A-Z0-9]{10})/) || [])[1] || null;
  const me = (u.match(/[?&]me=([A-Z0-9]+)/) || [])[1] || null;
  const seller = (u.match(/[?&]seller=([A-Z0-9]+)/) || [])[1] || null;

  if (/\/s[/?]/.test(u) && me) {
    return { kind: 'shop', shopId: me, asin, site, url: u };
  }
  if (/\/sp[/?]/.test(u) && seller) {
    const suffix = siteToHostSuffix(site || 'de');
    const mk = SITE_MARKETPLACE[site || 'de'];
    return {
      kind: 'seller', shopId: seller, asin, site,
      url: 'https://www.amazon.' + suffix + '/s?me=' + seller + (mk ? '&marketplaceID=' + mk : ''),
      originalUrl: u,
    };
  }
  if (asin) {
    const suffix = siteToHostSuffix(site || 'de');
    return { kind: 'product', shopId: null, asin, site, url: 'https://www.amazon.' + suffix + '/dp/' + asin };
  }
  return { kind: 'unknown', shopId: null, asin: null, site, url: u };
}

/**
 * 采集前定站点（文档第三节 3）。
 * 优先级：① 显式 site → ② filter.site → ③ filter.sites 只勾一个 → ④ 商品自己的站点 → ⑤ 兜底 'de'
 * 背景：原先跟卖链路硬编码 amazon.de，导致「选澳洲采到德国」。
 */
function resolveCollectSite(opts = {}, prod = null) {
  const f = opts.filter || {};
  const cand = [opts.site, f.site,
    Array.isArray(f.sites) && f.sites.length === 1 ? f.sites[0] : null,
    prod && prod.site];
  for (const c of cand) {
    const s = String(c == null ? '' : c).trim().toLowerCase();
    if (s) return CDP_SITE_CODE[siteToHostSuffix(s)] || s;
  }
  return 'de';
}

/** 站点首页（地址校准必须先导航到这里，坑 #3：地址按域名分别存储） */
function siteStartUrl(site) {
  return 'https://www.amazon.' + siteToHostSuffix(site) + '/';
}

/** 输入端：数组，或换行/中英文逗号分隔的字符串 */
function parseLinkList(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/[\n,，]/);
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const s = String(x == null ? '' : x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

module.exports = {
  SITE_HOST, CDP_SITE_CODE, SITE_MARKETPLACE, SITE_CURRENCY,
  siteToHostSuffix, siteCurrency, siteFromUrl, classifySellerLink,
  resolveCollectSite, siteStartUrl, parseLinkList,
};
