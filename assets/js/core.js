// assets/js/core.js
// 前台（site.js）、后台（admin/）、校验脚本（tools/check.mjs）共用的纯函数。
// 约束：本文件不能访问 DOM / window，保证在 Node 里也能 import。

export const TYPES = {
  video:   { label: '视频' },
  article: { label: '图文' },
  text:    { label: '文本' },
};

// 麦穗颜色
export const TIERS = {
  gold:   '金色（一等奖 / 金奖 / 特等奖）',
  silver: '银色（二等奖 / 银奖）',
  bronze: '铜色（三等奖 / 铜奖）',
  merit:  '主题色（优秀奖 / 入围 / 荣誉称号）',
};

export const RANKS = ['国际级', '国家级', '省部级', '市级', '校级', '院级', '其他'];

export const SCOPES = { campus: '校内', external: '校外' };

export const SOCIALS = {
  bilibili: '哔哩哔哩', xiaohongshu: '小红书', weibo: '微博', douyin: '抖音',
  wechat: '微信公众号', zhihu: '知乎', github: 'GitHub', linkedin: 'LinkedIn',
  behance: 'Behance', email: '邮箱', website: '个人网站', other: '其他',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function safeUrl(u) {
  u = String(u ?? '').trim();
  return /^(javascript|vbscript|data:text\/html)/i.test(u.replace(/\s/g, '')) ? '#' : u;
}

export const isExternal = (p) => /^(https?:)?\/\//i.test(p || '') || /^(data|blob|mailto|tel):/i.test(p || '');

// 内容里的路径一律相对站点根目录（如 uploads/2025/06/a.jpg）。
// base 用于在子目录页面（如 admin/）里拼接 '../'。
export function assetUrl(p, base = '') {
  if (!p) return '';
  if (isExternal(p) || String(p).startsWith('#')) return p;
  return base + String(p).replace(/^\.?\//, '');
}

export const isPdf = (p) => /\.pdf(\?|#|$)/i.test(p || '');

// '2025-06' -> '2025.06'；'2025-06-12' -> '2025.06.12'
export function fmtDate(s) {
  if (!s) return '';
  return String(s).replace(/-/g, '.');
}

export function fmtRange(start, end) {
  if (!start && !end) return '';
  return `${fmtDate(start) || '?'} – ${end ? fmtDate(end) : '至今'}`;
}

export function uid(prefix = 'x') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ---------------- 数据规范化：保证旧数据 / 手写 JSON 也能安全渲染 ---------------- */

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v));

export function normalizeAward(a = {}) {
  return {
    name: str(a.name), level: str(a.level),
    tier: TIERS[a.tier] ? a.tier : 'gold',
    rank: str(a.rank), issuer: str(a.issuer), date: str(a.date),
    certificate: str(a.certificate),
    showTag: bool(a.showTag, true),
    showCertificate: bool(a.showCertificate, true),
  };
}

export function normalizeWork(w = {}) {
  return {
    id: str(w.id) || uid('w'),
    title: str(w.title), type: TYPES[w.type] ? w.type : 'article',
    category: str(w.category), date: str(w.date), summary: str(w.summary),
    cover: str(w.cover), tags: arr(w.tags).map(str).filter(Boolean),
    featured: bool(w.featured, false), hidden: bool(w.hidden, false),
    video: w.video && typeof w.video === 'object' ? { ...w.video } : {},
    body: str(w.body),
    gallery: arr(w.gallery).map((g) => ({ src: str(g?.src), caption: str(g?.caption) })),
    role: str(w.role), collaborators: str(w.collaborators), platform: str(w.platform),
    links: arr(w.links).map((l) => ({ label: str(l?.label), url: str(l?.url) })),
    awards: arr(w.awards).map(normalizeAward),
  };
}

export function normalizeHonor(h = {}) {
  return {
    id: str(h.id) || uid('h'),
    ...normalizeAward(h),
    description: str(h.description), workId: str(h.workId),
    hidden: bool(h.hidden, false),
  };
}

export function normalizeExperience(e = {}) {
  return {
    id: str(e.id) || uid('e'),
    scope: SCOPES[e.scope] ? e.scope : 'campus',
    org: str(e.org), role: str(e.role), start: str(e.start), end: str(e.end),
    location: str(e.location), summary: str(e.summary),
    highlights: arr(e.highlights).map(str).filter(Boolean),
    link: str(e.link), hidden: bool(e.hidden, false),
  };
}

export function normalize(d = {}) {
  const site = d.site || {};
  const p = d.profile || {};
  const sec = site.sections || {};
  return {
    version: 1,
    updatedAt: str(d.updatedAt),
    site: {
      title: str(site.title) || '我的作品集',
      description: str(site.description),
      favicon: str(site.favicon),
      accent: /^#[0-9a-f]{6}$/i.test(site.accent || '') ? site.accent : '#3ad6c5',
      footer: str(site.footer),
      sections: {
        about: bool(sec.about, true), works: bool(sec.works, true),
        honors: bool(sec.honors, true), experience: bool(sec.experience, true),
        contact: bool(sec.contact, true),
      },
      featuredLimit: Number(site.featuredLimit) > 0 ? Number(site.featuredLimit) : 6,
      mergeWorkAwards: bool(site.mergeWorkAwards, true),
      honorsOrder: ['date', 'tier', 'manual'].includes(site.honorsOrder) ? site.honorsOrder : 'date',
      effects: {
        intro: bool(site.effects?.intro, true),         // 首次进入时的胶片倒计时
        particles: bool(site.effects?.particles, true), // 首屏粒子姓名
        cursor: bool(site.effects?.cursor, true),       // 自定义光标
        shader: bool(site.effects?.shader, true),       // WebGL 流光背景
        smooth: bool(site.effects?.smooth, true),       // 鼠标滚轮惯性平滑滚动
      },
    },
    profile: {
      name: str(p.name), nameEn: str(p.nameEn), avatar: str(p.avatar),
      tagline: str(p.tagline), roles: arr(p.roles).map(str).filter(Boolean),
      school: str(p.school), major: str(p.major), grade: str(p.grade),
      location: str(p.location), email: str(p.email),
      bio: str(p.bio), skills: arr(p.skills).map(str).filter(Boolean),
      education: arr(p.education).map((e) => ({
        school: str(e?.school), major: str(e?.major), degree: str(e?.degree),
        start: str(e?.start), end: str(e?.end), note: str(e?.note),
      })),
      socials: arr(p.socials).map((s) => ({
        platform: SOCIALS[s?.platform] ? s.platform : 'other', label: str(s?.label), url: str(s?.url),
      })),
      resume: str(p.resume),
    },
    works: arr(d.works).map(normalizeWork),
    honors: arr(d.honors).map(normalizeHonor),
    experiences: arr(d.experiences).map(normalizeExperience),
  };
}

/* ---------------- 荣誉墙：独立荣誉 + （可选）作品获奖 ---------------- */

const TIER_RANK = { gold: 0, silver: 1, bronze: 2, merit: 3 };

export function collectHonors(data) {
  const list = data.honors.filter((h) => !h.hidden).map((h) => ({ ...h, source: 'honor' }));
  if (data.site.mergeWorkAwards) {
    for (const w of data.works) {
      if (w.hidden) continue;
      w.awards.forEach((a, i) => {
        if (!a.showTag) return;
        list.push({ ...a, id: `${w.id}#${i}`, workId: w.id, workTitle: w.title, description: '', source: 'work' });
      });
    }
  }
  const order = data.site.honorsOrder;
  const byDate = (a, b) => String(b.date).localeCompare(String(a.date));
  if (order === 'date') list.sort(byDate);
  if (order === 'tier') list.sort((a, b) => (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || byDate(a, b));
  return list;
}

/* ---------------- 哔哩哔哩 ---------------- */

// 接受：视频页链接 / BV 号 / av 号 / 嵌入代码 <iframe ...> / player.bilibili.com 链接
export function parseBili(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const out = { bvid: '', aid: '', cid: '', page: 1 };
  const bv = s.match(/BV[0-9A-Za-z]{10}/);
  if (bv) out.bvid = bv[0];
  const aid = s.match(/[?&](?:amp;)?aid=(\d+)/) || s.match(/(?:^|\/)av(\d+)/i);
  if (aid) out.aid = aid[1];
  const cid = s.match(/[?&](?:amp;)?cid=(\d+)/);
  if (cid) out.cid = cid[1];
  const p = s.match(/[?&](?:amp;)?(?:p|page)=(\d+)/);
  if (p) out.page = Number(p[1]) || 1;
  return out.bvid || out.aid ? out : null;
}

export function biliSrc(v) {
  if (!v || (!v.bvid && !v.aid)) return '';
  const q = new URLSearchParams({ isOutside: 'true' });
  if (v.bvid) q.set('bvid', v.bvid); else q.set('aid', v.aid);
  if (v.cid) q.set('cid', v.cid);
  q.set('p', String(v.page || 1));
  q.set('autoplay', '0');
  q.set('danmaku', '0');
  q.set('high_quality', '1');
  return `https://player.bilibili.com/player.html?${q}`;
}

export function biliEmbed(v, title = '') {
  const src = biliSrc(v);
  if (!src) return '';
  return `<div class="bili"><iframe src="${esc(src)}" title="${esc(title || '哔哩哔哩视频')}" loading="lazy" scrolling="no" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
}

/* ---------------- 麦穗 ---------------- */

let laurelInner = '';
function buildLaurel() {
  // 左侧麦穗：一条二次贝塞尔曲线做穗杆，沿杆生成成对的叶片；右侧用 CSS 镜像（.laurel--r）。
  // 所有图形都落在 viewBox 0 0 24 48 之内。
  // 每片叶子包在 <g transform> 里，叶片 path 自身以叶柄为原点，CSS 可以对它做 scale 生长动画（--n 为生长顺序）。
  // 穗杆 pathLength="1"，CSS 可用 stroke-dashoffset 做「描边生长」。
  const P0 = [20, 46], P1 = [0, 26], P2 = [14, 4];
  const B = (t, i) => (1 - t) ** 2 * P0[i] + 2 * (1 - t) * t * P1[i] + t * t * P2[i];
  const D = (t, i) => 2 * (1 - t) * (P1[i] - P0[i]) + 2 * t * (P2[i] - P1[i]);
  const f = (n) => n.toFixed(2);
  const deg = (t) => (Math.atan2(D(t, 1), D(t, 0)) * 180) / Math.PI;
  let n = 0;
  const leaf = (x, y, a, l, w) =>
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${a.toFixed(1)})"><path class="leaf" style="--n:${n++}" d="M0 0Q${f(l / 2)} ${f(-w)} ${f(l)} 0Q${f(l / 2)} ${f(w)} 0 0Z"/></g>`;
  let g = '';
  for (let i = 0; i < 6; i++) {
    const t = 0.08 + i * 0.15;
    const l = 9 - i * 0.6, w = 3.4 - i * 0.2;
    g += leaf(B(t, 0), B(t, 1), deg(t) - 34, l, w) + leaf(B(t, 0), B(t, 1), deg(t) + 46, l * 0.72, w * 0.72);
  }
  g += leaf(B(0.97, 0), B(0.97, 1), deg(0.97), 5, 1.65);
  return `<path class="stem" pathLength="1" d="M${P0} Q${P1} ${P2}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><g fill="currentColor">${g}</g>`;
}

export function laurelSVG(cls = 'laurel') {
  if (!laurelInner) laurelInner = buildLaurel();
  return `<svg class="${cls}" viewBox="0 0 24 48" aria-hidden="true" focusable="false">${laurelInner}</svg>`;
}

// size: 'sm'（卡片单行）| 'md'（荣誉墙）| 'lg'（作品详情页）
export function awardBadge(a, size = 'md') {
  if (!a || (!a.name && !a.level)) return '';
  const tier = TIERS[a.tier] ? a.tier : 'gold';
  const label = [a.level, a.name].filter(Boolean).join(' ');
  return `<span class="award award--${size} tier-${tier}" title="${esc(label)}">${laurelSVG('laurel laurel--l')}<span class="award__txt">${a.level ? `<b class="award__level">${esc(a.level)}</b>` : ''}${a.name ? `<span class="award__name">${esc(a.name)}</span>` : ''}</span>${laurelSVG('laurel laurel--r')}</span>`;
}

/* ---------------- 文本工具 ---------------- */

export function plainText(mdSrc) {
  return String(mdSrc || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/@\[bilibili\]\([^)]*\)/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, '')
    .trim();
}

export function countChars(mdSrc) {
  return plainText(mdSrc).replace(/\s/g, '').length;
}
