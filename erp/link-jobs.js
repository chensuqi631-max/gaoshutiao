'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  多链接采集 —— 任务存储（link-jobs.js）
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 【为什么要有这个文件】
 *   原来的多链接采集是「一锤子买卖」: 链接列表和结果只在内存里, 一次跑几小时,
 *   中途后端重启 / Edge 崩了 / 弹出机器人验证, 整批白采且毫无记录。
 *   这里把「哪些单元做完了」落到 data/link-jobs/job-*.json, 于是:
 *     · 重启后点「继续上次任务」接着跑
 *     · 已采过的店铺/品牌【零导航】跳过(不重复采)
 *     · 失败清单留在任务里, 可以单独「重跑失败」
 *
 * 【设计取舍】(照着做, 别换)
 *   1. 任务状态存文件、不存数据库: 断点续跑只需要「哪些单元做完了」, 文件足够;
 *      写入用 `写临时文件 + rename`, 断电不会留半个 JSON。
 *   2. 落盘粒度 = 业务单元(一条链接 / 一个店铺 / 一个品牌), 不是「一批」:
 *      最坏情况只损失一个单元的工作量。批(batchSize)只是进度展示与强制刷新的边界。
 *   3. 完成状态只认 done, 其余一律重做: 没有「部分完成」。
 *      店铺翻到第 2 页断了 → 整个店铺重采(重复的 ASIN 由入库函数去重, 不会脏数据)。
 *   4. 品牌在阶段 2 采店铺时就登记进任务: 不能等阶段 3 再从「本轮采到的商品」推导 ——
 *      续跑时阶段 2 全命中 done 被跳过, 本轮店铺商品是空的, 会推导出 0 个品牌(坑 26)。
 *   5. 失败不写进 done, 也不静默跳过: 失败单元留在任务里, remaining() 能报出来,
 *      前端显示「重跑失败(N)」。
 */

const fs = require('fs');
const path = require('path');

/** 每批链接数默认值 */
const DEFAULT_BATCH_SIZE = 20;
/** 单单元失败重试次数默认值 */
const DEFAULT_RETRY = 2;
/** 单元之间限速基准(毫秒) */
const DEFAULT_DELAY_MS = 1500;
/** 任务日志上限 */
const LOG_MAX = 400;

/** 时间戳: 与 server.js 的 now() 同口径(本地时间, 便于肉眼对照) */
function stamp(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' +
    p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
}

/** 任务 id: job-<时间戳>-<4位随机> */
function newJobId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
    p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
  return 'job-' + s + '-' + Math.random().toString(36).slice(2, 6);
}

/** 链接 → 稳定短标识(日志里好认) */
function shortLink(u) {
  const s = String(u || '');
  const m = /\/dp\/([A-Z0-9]{10})/.exec(s) || /[?&]seller=([A-Z0-9]{8,})/.exec(s) || /[?&]me=([A-Z0-9]{8,})/.exec(s);
  if (m) return m[1];
  return s.replace(/^https?:\/\//, '').slice(0, 48);
}

/* ══════════════════════════════════════════════════════════════════
 * 一、纯函数 API（不碰磁盘, 可单测）
 * ══════════════════════════════════════════════════════════════════ */

/** 建任务: 内部调用 upsertLinks; batchSize/retry/delayMs 会 clamp 到合理区间 */
function newJob(urls, opts = {}, extra = {}, id) {
  const job = {
    id: id || newJobId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'pending',            // pending | running | done | partial | failed | stopped | paused | interrupted
    pauseReason: null,            // captcha | cdp-down | error
    elapsedSec: 0,
    round: 0,                     // 当前跑到第几批
    batchSize: Math.min(100, Math.max(1, Number(extra.batchSize) || DEFAULT_BATCH_SIZE)),
    retry: (() => { const v = Number(extra.retry == null ? DEFAULT_RETRY : extra.retry); return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : DEFAULT_RETRY })(),
    delayMs: (() => { const v = Number(extra.delayMs == null ? DEFAULT_DELAY_MS : extra.delayMs); return Number.isFinite(v) ? Math.max(0, Math.min(60000, v)) : DEFAULT_DELAY_MS })(),
    seq: 0,                       // 单元序号自增(给界面排序/展示用)
    opts: {
      shopPages: Number(opts.shopPages) || 1,
      brandPages: Number(opts.brandPages) || 1,
      maxShops: Number(opts.maxShops) || 0,
      maxItems: Number(opts.maxItems) || 0,
      collectBrands: opts.collectBrands !== false,
      zip: opts.zip || null,
      filter: opts.filter || {},
    },
    links: [],
    sellers: [],
    brands: [],
    batches: [],
    totals: { links: 0, sellers: 0, shopsDone: 0, brandsDone: 0, shopProducts: 0, brandProducts: 0, added: 0, brandAdded: 0, failed: 0 },
    log: [],
  };
  upsertLinks(job, urls || []);
  buildBatches(job);
  return job;
}

/** 合并链接: 已存在的 URL 保留原状态(续跑时不能把 done 重置成 pending) */
function upsertLinks(job, urls) {
  const seen = new Map(job.links.map((l) => [l.url, l]));
  for (const raw of (urls || [])) {
    const url = String(raw == null ? '' : raw).trim();
    if (!url) continue;
    if (seen.has(url)) continue;
    const row = { url, status: 'pending', kind: null, sellerId: null, asin: null, site: null, err: null, attempts: 0, at: null, key: shortLink(url) };
    job.links.push(row);
    seen.set(url, row);
  }
  job.totals.links = job.links.length;
  return job.links;
}

/** 登记店铺: 按 sellerId 去重; 已有名字/链接不被后到的覆盖 */
function upsertSeller(job, info) {
  if (!info || !info.sellerId) return null;
  const id = String(info.sellerId);
  let s = job.sellers.find((x) => x.sellerId === id);
  if (!s) {
    s = {
      seq: ++job.seq, sellerId: id, name: info.name || null, site: info.site || null,
      shopLink: info.shopLink || null, via: info.via || null, asin: info.asin || null,
      status: 'pending', err: null, attempts: 0, at: null,
      collected: 0, kept: 0, added: 0, addedAsins: [], landingUrl: null,
    };
    job.sellers.push(s);
  } else {
    if (!s.name && info.name) s.name = info.name;
    if (!s.shopLink && info.shopLink) s.shopLink = info.shopLink;
    if (!s.via && info.via) s.via = info.via;
    if (!s.site && info.site) s.site = info.site;
    if (!s.asin && info.asin) s.asin = info.asin;
  }
  job.totals.sellers = job.sellers.length;
  return s;
}

/** 登记品牌: 按品牌名去重; brandLink 不被覆盖 */
function upsertBrand(job, info) {
  if (!info || !info.brand) return null;
  const key = String(info.brand).trim();
  if (!key) return null;
  let b = job.brands.find((x) => x.brand === key);
  if (!b) {
    b = {
      seq: ++job.seq, brand: key, brandLink: info.brandLink || null, site: info.site || null,
      fromAsin: info.fromAsin || null, shopCount: 0,
      status: 'pending', err: null, attempts: 0, at: null, collected: 0, added: 0, mixed: 0, addedAsins: [],
    };
    job.brands.push(b);
  } else {
    if (!b.brandLink && info.brandLink) b.brandLink = info.brandLink;
    if (!b.site && info.site) b.site = info.site;
    if (!b.fromAsin && info.fromAsin) b.fromAsin = info.fromAsin;
  }
  return b;
}

/**
 * 打标记: 单元状态 + 字段补丁 + attempts 累计 + at 时间。
 * ★ attempts 是【累加】而不是赋值: withRetry 返回的是本次尝试次数,
 *   跨多次续跑要能看出「这个单元总共试过几次」(坑 34)。
 */
function mark(job, unit, status, patch = {}, attempts = 1) {
  const rows = unit === 'link' ? job.links : unit === 'seller' || unit === 'shop' ? job.sellers : job.brands;
  const key = unit === 'link' ? patch.url
    : unit === 'brand' ? patch.brand
      : patch.sellerId;
  const row = rows.find((r) => (unit === 'link' ? r.url === key : unit === 'brand' ? r.brand === key : r.sellerId === key));
  if (!row) return null;
  row.status = status;
  row.attempts = (row.attempts || 0) + Math.max(0, Number(attempts) || 0);
  row.at = new Date().toISOString();
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'url' || k === 'brand' || k === 'sellerId') continue;
    row[k] = v;
  }
  // 汇总(界面直接看 totals, 不用每次遍历)
  job.totals.shopsDone = job.sellers.filter((x) => x.status === 'done').length;
  job.totals.brandsDone = job.brands.filter((x) => x.status === 'done').length;
  job.totals.shopProducts = job.sellers.reduce((n, x) => n + (x.kept || 0), 0);
  job.totals.brandProducts = job.brands.reduce((n, x) => n + (x.collected || 0), 0);
  job.totals.added = job.sellers.reduce((n, x) => n + (x.added || 0), 0) + job.brands.reduce((n, x) => n + (x.added || 0), 0);
  job.totals.brandAdded = job.brands.reduce((n, x) => n + (x.added || 0), 0);
  job.totals.failed =
    job.links.filter((x) => x.status === 'failed').length +
    job.sellers.filter((x) => x.status === 'failed').length +
    job.brands.filter((x) => x.status === 'failed').length;
  job.updatedAt = new Date().toISOString();
  return row;
}

/**
 * 还剩多少活: 只统计 pending / failed (skipped 是"本轮明确不采", 不算待办)
 * ★ 也统计 skipped: 中途停止时没跑的单元会被静默标成 skipped(无日志无 err), 用户看到
 *   「1/15 店铺」会以为没跑完, 所以要让界面能显示"跳过 N 个"并提供「重跑跳过」。
 */
function remaining(job) {
  const cnt = (rows) => rows.filter((x) => x.status === 'pending').length;
  const bad = (rows) => rows.filter((x) => x.status === 'failed').length;
  const skp = (rows) => rows.filter((x) => x.status === 'skipped').length;
  return {
    links: cnt(job.links), sellers: cnt(job.sellers), brands: cnt(job.brands),
    linksFailed: bad(job.links), sellersFailed: bad(job.sellers), brandsFailed: bad(job.brands),
    linksSkipped: skp(job.links), sellersSkipped: skp(job.sellers), brandsSkipped: skp(job.brands),
    totalPending: cnt(job.links) + cnt(job.sellers) + cnt(job.brands),
    totalFailed: bad(job.links) + bad(job.sellers) + bad(job.brands),
    totalSkipped: skp(job.links) + skp(job.sellers) + skp(job.brands),
  };
}

/**
 * 失败/跳过 清单重跑: → pending 并清 err。
 * @param what 可选 'links'|'sellers'|'brands'
 * @param opts { skipped: true } 时把 skipped 也一起捞回 (面板「重跑跳过」用)
 * @param opts { since: '2026-09-25T03:32:00Z' } 时把该时刻之后完成的单元也捞回 ——
 *        用于"采集器自身有 bug 的那段窗口采出来的结果不算数, 必须重采"(2026-09-25 提前放行事故)
 */
function resetFailed(job, what, opts) {
  const alsoSkip = !!(opts && opts.skipped);
  const since = (opts && opts.since) ? String(opts.since) : null;
  const pick = (rows, on) => {
    if (!on) return 0;
    let n = 0;
    for (const r of rows) {
      const bad = r.status === 'failed' || (alsoSkip && r.status === 'skipped')
        || (since && r.status === 'done' && r.at && String(r.at) >= since);
      if (bad) { r.status = 'pending'; r.err = null; n++ }
    }
    return n;
  };
  const n = pick(job.links, !what || what === 'links')
    + pick(job.sellers, !what || what === 'sellers')
    + pick(job.brands, !what || what === 'brands');
  // 批次状态也要回退, 否则"已完成"的批次会被整批跳过
  if (alsoSkip || since) (job.batches || []).forEach((b) => { if (b.status === 'done') b.status = 'pending' });
  job.status = 'pending';
  job.pauseReason = null;
  job.updatedAt = new Date().toISOString();
  return n;
}

/**
 * 收尾定状态: 有失败或还有待办 → partial, 否则 done。
 * ★ 就算调用方显式给了 status='done', 只要还有待办/失败也强制降级成 partial ——
 *   否则「跑完但有失败」会被写成 done, 前端就看不到「重跑失败(N)」了(任务永远补不齐)。
 */
function finalize(job, patch = {}) {
  const rem = remaining(job);
  const hasWork = rem.totalPending > 0;
  const hasFail = rem.totalFailed > 0;
  const fallback = (hasWork || hasFail) ? 'partial' : 'done';
  // 只允许显式指定 paused/stopped/interrupted 这类"终止态"; done 必须由上面的判定说了算
  const explicit = patch.status && patch.status !== 'done' ? patch.status : null;
  job.status = explicit || fallback;
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  if (patch.elapsedSec != null) job.elapsedSec = patch.elapsedSec;
  return job;
}

/** 切批: 只重算还没跑完的部分, 已 done 的批保留(续跑时不能把历史批次冲掉) */
function buildBatches(job) {
  const size = Math.max(1, Number(job.batchSize) || DEFAULT_BATCH_SIZE);
  const old = job.batches || [];
  const out = [];
  for (let i = 0; i < job.links.length; i += size) {
    const from = i + 1;
    const to = Math.min(job.links.length, i + size);
    const index = out.length + 1;
    const allDone = job.links.slice(from - 1, to).every((l) => l.status === 'done' || l.status === 'skipped');
    const prev = old[index - 1];
    out.push({
      index, from, to,
      status: allDone ? 'done' : (prev && !allDone && prev.status !== 'done' ? prev.status : 'pending'),
      startedAt: prev ? prev.startedAt || null : null,
      finishedAt: prev ? prev.finishedAt || null : null,
    });
  }
  job.batches = out;
  return out;
}

/** 给前端的摘要(不含大数组, 直接能塞进列表接口) */
function summary(job) {
  const rem = remaining(job);
  const done = (rows) => rows.filter((x) => x.status === 'done').length;
  return {
    id: job.id, status: job.status, pauseReason: job.pauseReason || null,
    createdAt: job.createdAt, updatedAt: job.updatedAt, finishedAt: job.finishedAt || null,
    elapsedSec: job.elapsedSec || 0,
    round: job.round || 0,
    batchSize: job.batchSize, retry: job.retry, delayMs: job.delayMs,
    links: job.links.length, linksDone: done(job.links),
    linksPending: rem.links, linksFailed: rem.linksFailed,
    sellers: job.sellers.length, sellersDone: done(job.sellers),
    sellersPending: rem.sellers, sellersFailed: rem.sellersFailed, sellersSkipped: rem.sellersSkipped,
    brands: job.brands.length, brandsDone: done(job.brands),
    brandsPending: rem.brands, brandsFailed: rem.brandsFailed, brandsSkipped: rem.brandsSkipped,
    batches: (job.batches || []).length,
    batchesDone: (job.batches || []).filter((b) => b.status === 'done').length,
    added: job.totals.added || 0,
    shopProducts: job.totals.shopProducts || 0,
    brandProducts: job.totals.brandProducts || 0,
    failed: rem.totalFailed,
    pending: rem.totalPending,
    skipped: rem.totalSkipped,
    lastLog: job.log && job.log.length ? job.log[job.log.length - 1].msg : '',
  };
}

/** 追加一条任务日志(上限 LOG_MAX) */
function addLog(job, msg) {
  if (!job || !msg) return;
  if (!Array.isArray(job.log)) job.log = [];
  job.log.push({ t: stamp(), msg: String(msg).slice(0, 500) });
  if (job.log.length > LOG_MAX) job.log.splice(0, job.log.length - LOG_MAX);
}

/* ══════════════════════════════════════════════════════════════════
 * 二、JobStore（磁盘）
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 任务存储。
 *
 * 节流 1.2s + 原子替换: 一个 100 条链接的任务文件约 100~200 KB, 不节流的话
 * 「每条链接一次 checkpoint」会写几千次; rename 在 POSIX/Windows 都是原子的,
 * 断电不会留半个 JSON。
 */
class JobStore {
  /** @param dir 任务目录(通常 DATA/link-jobs) */
  constructor(dir) {
    this.dir = dir;
    this.timers = new Map();      // id → timeout
    this.pending = new Map();     // id → job (待写)
    this.lastWrite = new Map();   // id → ms
    this.writes = 0;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (e) { /* 忽略 */ }
  }

  file(id) { return path.join(this.dir, String(id) + '.json'); }

  /** 落盘: 写 .tmp 再 rename(原子) */
  writeNow(job) {
    const f = this.file(job.id);
    const tmp = f + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8');
      fs.renameSync(tmp, f);
      this.writes++;
      this.lastWrite.set(job.id, Date.now());
      this.pending.delete(job.id);
      return true;
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (e2) { /* 忽略 */ }
      return false;
    }
  }

  /**
   * 保存任务。
   * @param job 任务对象
   * @param force true = 立刻写(批次边界/收尾/暂停); false = 节流写(最多 1.2s 一次)
   */
  save(job, force = false) {
    if (!job || !job.id) return false;
    if (force) {
      const t = this.timers.get(job.id);
      if (t) { clearTimeout(t); this.timers.delete(job.id); }
      return this.writeNow(job);
    }
    this.pending.set(job.id, job);
    if (this.timers.has(job.id)) return true;
    const since = Date.now() - (this.lastWrite.get(job.id) || 0);
    const delay = Math.max(0, 1200 - since);
    const timer = setTimeout(() => {
      this.timers.delete(job.id);
      const j = this.pending.get(job.id);
      if (j) this.writeNow(j);
    }, delay);
    if (timer.unref) timer.unref();
    this.timers.set(job.id, timer);
    return true;
  }

  get(id) {
    try { return JSON.parse(fs.readFileSync(this.file(id), 'utf8')); }
    catch (e) { return null; }
  }

  /** 全部任务摘要, 按 updatedAt 倒序 */
  list(limit) {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^job-.*\.json$/.test(f)); } catch (e) { files = [] }
    const out = [];
    for (const f of files) {
      const j = this.get(f.replace(/\.json$/, ''));
      if (j) out.push(summary(j));
    }
    out.sort((a, b) => (String(a.updatedAt) < String(b.updatedAt) ? 1 : -1));
    return out.slice(0, Math.max(1, Number(limit) || 50));
  }

  /** 最近一个「还有待办或失败」的任务 → 前端的「继续上次任务」 */
  latestResumable() {
    const jobs = this.list(200);
    return jobs.find((x) => x.pending > 0 || x.failed > 0 || x.status === 'running' || x.status === 'paused' || x.status === 'stopped' || x.status === 'partial' || x.status === 'interrupted') || null;
  }

  remove(id) {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
    this.pending.delete(id);
    try { fs.unlinkSync(this.file(id)); return true } catch (e) { return false }
  }

  /** 清理: 保留最近 50 个 + 30 天内的; 还有待办/失败的任务绝不删 */
  prune(keep = 50, days = 30) {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^job-.*\.json$/.test(f)); } catch (e) { return 0 }
    const rows = files.map((f) => {
      const st = (() => { try { return fs.statSync(path.join(this.dir, f)) } catch (e) { return null } })();
      return { f, m: st ? st.mtimeMs : 0 };
    }).sort((a, b) => b.m - a.m);
    const cutoff = Date.now() - days * 86400000;
    let removed = 0;
    rows.forEach((row, i) => {
      if (i < keep) return;
      if (row.m >= cutoff) return;
      const id = row.f.replace(/\.json$/, '');
      const j = this.get(id);
      if (j) {
        const rem = remaining(j);
        if (rem.totalPending > 0 || rem.totalFailed > 0 || j.status === 'running') return;   // 有用的不删
      }
      if (this.remove(id)) removed++;
    });
    return removed;
  }

  /** 退出前强刷所有待写任务 */
  flushAll() {
    for (const [id, t] of this.timers) { clearTimeout(t); this.timers.delete(id); }
    let n = 0;
    for (const [, job] of this.pending) { if (this.writeNow(job)) n++; }
    this.pending.clear();
    return n;
  }
}

module.exports = {
  newJob, newJobId, upsertLinks, upsertSeller, upsertBrand, mark,
  remaining, resetFailed, finalize, summary, buildBatches, addLog, shortLink, stamp,
  JobStore,
  DEFAULT_BATCH_SIZE, DEFAULT_RETRY, DEFAULT_DELAY_MS,
};
