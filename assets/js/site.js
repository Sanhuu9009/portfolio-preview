// assets/js/site.js — 前台渲染入口
// 每个页面的 <body data-page="home|works|work"> 决定渲染哪个视图。
// 数据来源：content/site.json；带 ?preview 参数时改读后台写入 localStorage 的草稿（cms:draft）。
// 动效与交互在 fx.js，⌘K 搜索在 palette.js。

import {
  TYPES, SOCIALS, esc, safeUrl, assetUrl, isPdf, fmtDate, fmtRange, normalize, collectHonors,
  biliEmbed, laurelSVG, awardBadge, plainText, countChars,
} from './core.js';
import { md } from './md.js';
import * as fx from './fx.js';
import { initPalette } from './palette.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');
const PAGE = document.body.dataset.page || 'home';
const app = $('#app');
let draftShown = false;
let particles = null;
let palette = null;

// WebKit/Safari 识别：桌面 Safari、iOS 上所有浏览器（Chrome/Firefox 在 iOS 也是 WebKit）
// 只用来在 Safari 上做降级，别的浏览器行为完全不变。
const UA = navigator.userAgent;
const IS_IOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_SAFARI = IS_IOS || (/Safari\//.test(UA) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\//.test(UA));
if (IS_SAFARI) document.documentElement.classList.add('is-safari');

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg>',
  playBig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowUp: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  arrowUR: I('<path d="M7 17 17 7M8 7h9v9"/>'),
  back: I('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  sun: I('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  moon: I('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  menu: I('<path d="M4 8h16M4 16h16"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  left: I('<path d="M15 6l-6 6 6 6"/>'),
  right: I('<path d="M9 6l6 6-6 6"/>'),
  grid: I('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  list: I('<path d="M4 6h16M4 12h16M4 18h16"/>'),
};

function href(url) {
  if (!PREVIEW) return url;
  const [path, hash] = url.split('#');
  return `${path}${path.includes('?') ? '&' : '?'}preview=1${hash ? `#${hash}` : ''}`;
}
const workHref = (id) => href(`work.html?id=${encodeURIComponent(id)}`);
const visibleAwards = (w) => w.awards.filter((a) => a.showTag && (a.name || a.level));
const CURSOR = { video: '播放', article: '查看', text: '阅读' };

/* ---------------- 数据 ---------------- */

async function loadData() {
  if (PREVIEW) {
    try {
      const d = JSON.parse(localStorage.getItem('cms:draft') || 'null');
      if (d && d.data) { draftShown = true; return normalize(d.data); }
    } catch { /* 草稿损坏时退回正式数据 */ }
  }
  const res = await fetch('content/site.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`读取 content/site.json 失败（HTTP ${res.status}）`);
  return normalize(await res.json());
}

/* ---------------- 主题 ---------------- */

const theme = () => document.documentElement.dataset.theme || 'dark';
function setThemeBtn() {
  const b = $('#theme-btn');
  if (!b) return;
  const dark = theme() === 'dark';
  b.innerHTML = dark ? ICON.sun : ICON.moon;
  b.setAttribute('aria-label', dark ? '切换到浅色' : '切换到深色');
}
function toggleTheme() {
  const next = theme() === 'dark' ? 'light' : 'dark';
  const swap = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* 隐私模式 */ }
    setThemeBtn();
    document.dispatchEvent(new Event('themechange'));
  };
  if (document.startViewTransition && !fx.REDUCED) document.startViewTransition(swap); else swap();
}

function applySite(data) {
  const { site } = data;
  document.documentElement.style.setProperty('--accent', site.accent);
  if (site.favicon) {
    const icon = /[./]/.test(site.favicon)
      ? assetUrl(site.favicon)
      : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">${site.favicon}</text></svg>`)}`;
    let link = $('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); }
    link.href = icon;
  }
}

/* ---------------- 页眉 ---------------- */

function renderHeader(data) {
  const p = data.profile;
  const s = data.site.sections;
  const name = p.name || data.site.title;
  const onHome = PAGE === 'home';
  const sec = (id) => (onHome ? `#${id}` : href(`index.html#${id}`));
  const links = [
    [sec('about'), '关于', s.about, 'about'],
    [href('works.html'), '作品', s.works, 'works'],
    [sec('honors'), '荣誉', s.honors, 'honors'],
    [sec('experience'), '经历', s.experience, 'experience'],
    [sec('contact'), '联系', s.contact, 'contact'],
  ].filter((l) => l[2]);
  const hd = $('#site-header');
  hd.className = 'hd';
  hd.innerHTML = `
    <div class="wrap hd__in">
      <a class="brand" href="${href('index.html')}" data-wipe="${esc(name)}" data-magnetic="0.2" aria-label="${esc(name)}${p.nameEn ? ` · ${esc(p.nameEn)}` : ''} · 首页"><img class="brand__logo brand__logo--white" src="${esc(assetUrl('assets/img/logo-on-dark.svg'))}" alt="" aria-hidden="true"><img class="brand__logo brand__logo--black" src="${esc(assetUrl('assets/img/logo-on-light.svg'))}" alt="" aria-hidden="true"><span class="sr-only">${esc(name)}${p.nameEn ? ` · ${esc(p.nameEn)}` : ''}</span></a>
      <nav class="nav" id="nav" aria-label="主导航">
        <span class="nav__pill" aria-hidden="true"></span>
        ${links.map(([u, t, , key], i) => `<a href="${u}" data-key="${key}" data-wipe="${t}" data-scramble style="--i:${i}"${key === 'works' && PAGE !== 'home' ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
      </nav>
      <div class="hd__tools">
        <button class="kbtn" id="search-btn" type="button" aria-label="搜索（⌘K）">${ICON.search}<span>搜索</span><kbd>${/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd></button>
        <button class="icon-btn" id="theme-btn" type="button"></button>
        <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="nav">${ICON.menu}</button>
      </div>
    </div>
    <div class="progress" aria-hidden="true"><span></span></div>`;
  setThemeBtn();
  $('#theme-btn').addEventListener('click', toggleTheme);
  $('#search-btn').addEventListener('click', () => palette?.open());

  const nav = $('#nav');
  const tgl = $('#nav-toggle');
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    tgl.setAttribute('aria-expanded', String(open));
    tgl.innerHTML = open ? ICON.close : ICON.menu;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  tgl.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });

  // 悬停时滑块跟随
  const pill = $('.nav__pill', nav);
  const pillTo = (a) => {
    if (!a) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.width = `${a.offsetWidth}px`;
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  const current = () => $('a[aria-current]', nav);
  nav.addEventListener('pointerover', (e) => { const a = e.target.closest('a'); if (a) pillTo(a); });
  nav.addEventListener('pointerleave', () => pillTo(current()));
  requestAnimationFrame(() => pillTo(current()));

  // 滚动：顶栏变实、向下滚隐藏、阅读进度条
  let lastY = scrollY;
  const bar = $('.progress span', hd);
  fx.onScroll(() => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    hd.classList.toggle('is-scrolled', y > 12);
    // 触屏设备不自动隐藏顶栏：手机上来回滑动会反复触发「隐藏→显示」，
    // 作品页工具栏为了避让顶栏会在 padding 上做补偿，一隐藏一显示搜索框就会上下抽动。
    if (fx.FINE && !nav.classList.contains('open')) hd.classList.toggle('is-hidden', y > 240 && y > lastY + 2);
    if (y < lastY - 2) hd.classList.remove('is-hidden');
    lastY = y;
    bar.style.setProperty('--sp', max > 0 ? (y / max).toFixed(4) : 0);
  });

  // 首页：当前所在版块高亮
  if (onHome && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        $$('a', nav).forEach((a) => a.removeAttribute('aria-current'));
        const a = $(`a[data-key="${en.target.id}"]`, nav);
        if (a) a.setAttribute('aria-current', 'true');
        if (!nav.matches(':hover')) pillTo(a);
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    setTimeout(() => ['about', 'works', 'honors', 'experience', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); }), 0);
  }
}

function renderFooter(data) {
  const p = data.profile;
  const name = p.name || data.site.title;
  const ft = $('#site-footer');
  ft.className = 'ft';
  ft.innerHTML = `<div class="wrap">
    <div class="ft__big" aria-hidden="true">${esc(p.nameEn || name)}</div>
    <div class="ft__row">
      <span>${esc(data.site.footer || `© ${new Date().getFullYear()} ${name}`)}</span>
      ${data.updatedAt ? `<span class="mono">最近更新 ${fmtDate(data.updatedAt.slice(0, 10))}</span>` : ''}
      <button class="totop" type="button" data-magnetic="0.3">${ICON.arrowUp}回到顶部</button>
    </div>
  </div>`;
  $('.totop', ft).addEventListener('click', () => scrollTo({ top: 0, behavior: fx.REDUCED ? 'auto' : 'smooth' }));
}

/* ---------------- 卡片与公共片段 ---------------- */

function mediaInner(w, lazy = true) {
  let m;
  if (w.cover) m = `<img src="${esc(assetUrl(w.cover))}" alt=""${lazy ? ' loading="lazy"' : ''}>`;
  else if (w.type === 'text') m = `<div class="tcover"><q>${esc(plainText(w.body).replace(/\s+/g, ' ').slice(0, 120))}</q></div>`;
  else m = `<div class="pcover">${esc(w.title)}</div>`;
  const aw = visibleAwards(w).length;
  return `${m}
    <span class="badge-type">${w.type === 'video' ? ICON.play : ''}${TYPES[w.type].label}</span>
    ${aw ? `<span class="badge-award">${laurelSVG()}获奖${laurelSVG()}</span>` : ''}
    ${w.type === 'video' ? `<span class="play">${ICON.playBig}</span>` : ''}
    <span class="glare"></span>`;
}

function awardLine(w, cls) {
  const awards = visibleAwards(w);
  if (!awards.length) return '';
  return `<div class="${cls}">${awardBadge(awards[0], 'sm')}${awards.length > 1 ? `<span class="more-n">等 ${awards.length} 项</span>` : ''}</div>`;
}

function certTrigger(a, group) {
  const url = assetUrl(a.certificate);
  const cap = [a.level, a.name].filter(Boolean).join(' ');
  if (isPdf(url)) return `<a class="pill-btn" href="${esc(url)}" target="_blank" rel="noopener">证书 PDF</a>`;
  return `<button class="pill-btn" type="button" data-lightbox="${group}" data-lightbox-src="${esc(url)}" data-caption="${esc(cap)}" data-cursor="放大">查看证书</button>`;
}

/* ---------------- 首页 ---------------- */

function heroSec(data) {
  const p = data.profile;
  const name = p.name || data.site.title;
  const roles = p.roles.length ? p.roles : [p.major || '创作者'];
  const kicker = [p.school, p.major, p.grade].filter(Boolean);
  const s = data.site.sections;
  const ring = 'SCROLL ✦ 向下滚动 ✦ SCROLL ✦ 向下滚动 ✦ ';
  return `<section class="hero" id="top">
    <div class="wrap hero__stage">
      ${kicker.length || p.location ? `<p class="hero__kicker" data-reveal>${p.location ? `<span class="live">${esc(p.location)}</span>` : ''}${kicker.map((k) => `<span>${esc(k)}</span>`).join('<span aria-hidden="true">/</span>')}</p>` : ''}
      <h1 class="sr-only">${esc(name)}${p.nameEn ? ` ${esc(p.nameEn)}` : ''}</h1>
      <div class="hero__name" aria-hidden="true">
        <canvas class="hero__canvas"></canvas>
        <span class="hero__fallback">${esc(name)}</span>
      </div>
      ${p.nameEn ? `<div class="hero__en" aria-hidden="true"><span class="prox">${esc(p.nameEn)}</span></div>` : ''}
      <div class="hero__row" data-reveal style="--d:.15s">
        <p class="hero__role">我是 <span class="role-rot">${esc(roles[0])}</span></p>
        ${p.tagline ? `<p class="hero__tagline">${esc(p.tagline)}</p>` : ''}
      </div>
      <div class="hero__cta" data-reveal style="--d:.3s">
        ${s.works ? `<a class="btn btn--glow" href="${href('works.html')}" data-magnetic="0.25" data-wipe="作品">浏览作品${ICON.arrow}</a>` : ''}
        ${s.contact && (p.email || p.socials.length) ? '<a class="btn" href="#contact" data-magnetic="0.25">联系我</a>' : ''}
        ${p.resume ? `<a class="btn" href="${esc(assetUrl(p.resume))}" target="_blank" rel="noopener" data-magnetic="0.25">查看简历</a>` : ''}
      </div>
    </div>
    <a class="scroll-ring" href="${s.about ? '#about' : '#works'}" data-cursor="向下" aria-label="向下滚动">
      <svg class="scroll-ring__txt" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="ringpath" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text><textPath href="#ringpath" textLength="500">${ring}</textPath></text></svg>
      <span class="scroll-ring__arrow">${ICON.arrowDown}</span>
    </a>
  </section>`;
}

function marqueeSec(p) {
  const words = [...p.roles.map((t) => [t, false]), ...p.skills.map((t) => [t, true])];
  if (words.length < 2) return '';
  const row = (list) => `<div class="marquee__track">${list.map(([t, o]) => `<span class="mq${o ? ' mq--outline' : ''}">${esc(t)}</span><span class="mq-star" aria-hidden="true">✦</span>`).join('')}</div>`;
  const half = Math.ceil(words.length / 2);
  return `<section class="marquee" aria-label="身份与技能">
    <div class="marquee__row" data-dir="1">${row(words)}</div>
    <div class="marquee__row" data-dir="-1">${row([...words.slice(half), ...words.slice(0, half)])}</div>
  </section>`;
}

function aboutSec(data) {
  const p = data.profile;
  const name = p.name || data.site.title;
  const edu = p.education.filter((e) => e.school);
  const facts = [['学校', p.school], ['专业', p.major], ['年级', p.grade], ['所在地', p.location]].filter((f) => f[1]);
  const stats = [
    [data.works.filter((w) => !w.hidden).length, '件作品'],
    [collectHonors(data).length, '项荣誉'],
    [data.experiences.filter((e) => !e.hidden).length, '段经历'],
  ].filter((x) => x[0]);
  const canContact = data.site.sections.contact && (p.email || p.socials.length);
  return `<section class="sec" id="about">
    <div class="wrap">
      <header class="sec__hd"><h2 class="h2" data-split>关于我</h2></header>
      <div class="bento">
        <article class="tile tile--bio" data-reveal><div class="bio">${md(p.bio)}</div></article>
        ${p.avatar ? `<figure class="tile tile--photo" data-reveal style="--d:.08s">
          <img src="${esc(assetUrl(p.avatar))}" alt="${esc(name)}的照片" loading="lazy">
          <figcaption><b>${esc(name)}</b>${p.nameEn ? `<span>${esc(p.nameEn)}</span>` : ''}</figcaption>
        </figure>` : ''}
        ${stats.length ? `<div class="tile tile--stats" data-reveal style="--d:.16s">${stats.map(([n, t]) => `<div><b data-count="${n}">${n}</b><span>${t}</span></div>`).join('')}</div>` : ''}
        ${canContact ? `<a class="tile tile--cta" href="#contact" data-reveal style="--d:.24s" data-cursor="联系">
          <span>想合作、约稿或聊聊实习？</span><b>联系我${ICON.arrowUR}</b>
        </a>` : ''}
        ${p.skills.length ? `<div class="tile tile--skills" data-reveal><h3>技能</h3><ul class="chips">${p.skills.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${facts.length || edu.length ? `<div class="tile tile--edu" data-reveal style="--d:.08s">
          ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
          ${edu.length ? `<ol class="edu">${edu.map((e) => `<li><b>${esc(e.school)}</b><span>${esc([e.major, e.degree].filter(Boolean).join('，'))}${e.start || e.end ? `　<span class="mono">${fmtRange(e.start, e.end)}</span>` : ''}</span>${e.note ? `<span>${esc(e.note)}</span>` : ''}</li>`).join('')}</ol>` : ''}
        </div>` : ''}
      </div>
    </div>
  </section>`;
}

function reelSec(featured, total) {
  const cards = featured.map((w, i) => `<a class="rcard" href="${workHref(w.id)}" data-cursor="${CURSOR[w.type]}" data-wipe="${esc(w.title)}">
      <div class="rcard__media" data-tilt="7" data-reveal-img>${mediaInner(w)}</div>
      <div class="rcard__info">
        <span class="rcard__no">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(w.title || '未命名作品')}</h3>
        <p class="rcard__meta">${[TYPES[w.type].label, w.category, fmtDate(w.date)].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</p>
        ${awardLine(w, 'rcard__award')}
      </div>
    </a>`).join('');
  return `<section class="reel" id="works">
    <div class="reel__sticky">
      <header class="wrap reel__hd">
        <h2 class="h2" data-split>精选作品</h2>
        <span class="reel__count">${String(featured.length).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
        <a class="link-arrow" href="${href('works.html')}" data-wipe="作品">全部作品${ICON.arrow}</a>
      </header>
      <div class="reel__track">
        ${cards || '<p class="empty">还没有作品。</p>'}
        ${total ? `<div class="rcard rcard--end"><a class="endlink" href="${href('works.html')}" data-wipe="作品" data-cursor="进入"><b>查看全部</b><span>共 ${total} 件作品</span></a></div>` : ''}
      </div>
      <div class="wrap reel__bar" aria-hidden="true"><div><span></span></div></div>
    </div>
  </section>`;
}

function honorsSec(list, works) {
  const LIMIT = 6;
  const byId = Object.fromEntries(works.map((w) => [w.id, w]));
  const national = list.filter((h) => ['国际级', '国家级'].includes(h.rank)).length;
  const golds = list.filter((h) => h.tier === 'gold').length;
  const stats = [[list.length, '项荣誉与奖项', false], [national, '国家级及以上', true], [golds, '金奖 / 一等奖', true]].filter((x, i) => i === 0 || x[0] > 0);
  const items = list.map((h, i) => {
    const hasCert = h.certificate && h.showCertificate;
    const work = h.workId && byId[h.workId] && !byId[h.workId].hidden ? byId[h.workId] : null;
    const certUrl = hasCert ? assetUrl(h.certificate) : '';
    const flip = hasCert && !isPdf(certUrl); // 有图片证书的卡片可以翻面
    const cap = [h.level, h.name].filter(Boolean).join(' ');
    return `<li class="hcard tier-${h.tier}${flip ? ' has-back' : ''}"${i >= LIMIT ? ' hidden data-extra' : ''}>
      <div class="hcard__flip">
        <div class="hcard__in">
          ${awardBadge(h, 'md')}
          <p class="hcard__meta">${h.rank ? `<span class="hcard__rank">${esc(h.rank)}</span>` : ''}${h.date ? `<span class="mono">${fmtDate(h.date)}</span>` : ''}${h.issuer ? `<span>${esc(h.issuer)}</span>` : ''}</p>
          ${h.description ? `<p class="hcard__desc">${esc(h.description)}</p>` : ''}
          ${hasCert || work ? `<div class="hcard__acts">
            ${flip ? '<button class="pill-btn" type="button" data-flip>翻面看证书</button>' : hasCert ? certTrigger(h, 'honor-certs') : ''}
            ${work ? `<a class="pill-btn" href="${workHref(work.id)}" data-wipe="${esc(work.title)}" title="${esc(work.title)}"><span>《${esc(work.title)}》</span></a>` : ''}
          </div>` : ''}
        </div>
        ${flip ? `<div class="hcard__back">
          <img src="${esc(certUrl)}" alt="${esc(cap)}证书" loading="lazy" data-lightbox="honor-certs" data-caption="${esc(cap)}" data-cursor="放大">
          <div class="hcard__acts"><button class="pill-btn" type="button" data-flip>翻回正面</button></div>
        </div>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<section class="sec" id="honors">
    <div class="wrap">
      <header class="sec__hd">
        <h2 class="h2" data-split>荣誉奖项</h2>
        <dl class="stats">${stats.map(([n, t, g]) => `<div><dt>${t}</dt><dd data-count="${n}"${g ? ' class="is-gold"' : ''}>${n}</dd></div>`).join('')}</dl>
      </header>
      <ul class="hgrid">${items}</ul>
      ${list.length > LIMIT ? `<div class="more-row"><button class="btn btn--sm" id="honors-more" type="button" data-magnetic="0.3">展开其余 ${list.length - LIMIT} 项</button></div>` : ''}
    </div>
  </section>`;
}

function expSec(list) {
  const n = { campus: list.filter((e) => e.scope === 'campus').length, external: list.filter((e) => e.scope === 'external').length };
  const tabs = n.campus && n.external ? `<div class="seg" role="group" aria-label="筛选经历">
      <button type="button" aria-pressed="true" data-scope="all">全部<span>${list.length}</span></button>
      <button type="button" aria-pressed="false" data-scope="campus">校内<span>${n.campus}</span></button>
      <button type="button" aria-pressed="false" data-scope="external">校外<span>${n.external}</span></button>
    </div>` : '';
  const items = list.map((e) => `<li class="tl__item" data-scope="${e.scope}">
      <div class="tl__when"><span class="mono">${fmtRange(e.start, e.end)}</span><span class="scope scope--${e.scope}">${e.scope === 'campus' ? '校内' : '校外'}</span></div>
      <div class="tl__card">
        <h3>${esc(e.role || e.org)}</h3>
        ${e.role && e.org ? `<span class="tl__org">${e.link ? `<a href="${esc(safeUrl(e.link))}" target="_blank" rel="noopener">${esc(e.org)}</a>` : esc(e.org)}${e.location ? `　${esc(e.location)}` : ''}</span>` : ''}
        ${e.summary ? `<div class="prose">${md(e.summary)}</div>` : ''}
        ${e.highlights.length ? `<ul class="tl__hl">${e.highlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
    </li>`).join('');
  return `<section class="sec" id="experience">
    <div class="wrap">
      <header class="sec__hd"><h2 class="h2" data-split>实践经历</h2>${tabs}</header>
      <ol class="tl"><span class="tl__line" aria-hidden="true"><span></span></span>${items}</ol>
    </div>
  </section>`;
}

function contactSec(p) {
  const socials = p.socials.filter((s) => s.url || s.label);
  return `<section class="sec contact" id="contact">
    <div class="wrap">
      <h2 class="h2" data-split>联系我</h2>
      <p class="contact__note" data-reveal>欢迎来信交流合作、实习或作品。</p>
      ${p.email ? `<button class="mail" type="button" data-copy="${esc(p.email)}" data-cursor="复制" aria-label="复制邮箱 ${esc(p.email)}">${esc(p.email)}</button>
      <div class="contact__acts"><a class="btn btn--glow" href="mailto:${esc(p.email)}" data-magnetic="0.25">发送邮件${ICON.arrow}</a>${p.resume ? `<a class="btn" href="${esc(assetUrl(p.resume))}" target="_blank" rel="noopener" data-magnetic="0.25">查看简历</a>` : ''}</div>` : ''}
      ${socials.length ? `<ul class="socials">${socials.map((s) => {
        const inner = `<b>${esc(SOCIALS[s.platform] || '链接')}</b><span>${esc(s.label || s.url.replace(/^https?:\/\//, ''))}</span>${s.url ? ICON.arrowUR : '<i></i>'}`;
        return `<li>${s.url ? `<a class="soc" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" data-cursor="打开">${inner}</a>` : `<div class="soc">${inner}</div>`}</li>`;
      }).join('')}</ul>` : ''}
    </div>
  </section>`;
}

function renderHome(data) {
  const { site, profile: p } = data;
  const s = site.sections;
  const works = data.works.filter((w) => !w.hidden);
  let featured = works.filter((w) => w.featured);
  if (!featured.length) featured = works;
  featured = featured.slice(0, site.featuredLimit);
  const honors = collectHonors(data);
  const exps = data.experiences.filter((e) => !e.hidden);

  let html = heroSec(data) + marqueeSec(p);
  if (s.about && (p.bio || p.skills.length || p.education.length)) html += aboutSec(data);
  if (s.works) html += reelSec(featured, works.length);
  if (s.honors && honors.length) html += honorsSec(honors, data.works);
  if (s.experience && exps.length) html += expSec(exps);
  if (s.contact && (p.email || p.socials.length)) html += contactSec(p);
  app.innerHTML = html;

  const roles = p.roles.length ? p.roles : [p.major || '创作者'];
  fx.rotate($('.role-rot'), roles);
  fx.proximity($('.prox'));
  const hero = $('.hero');
  if (hero && !fx.REDUCED) { // 向下滚动时首屏内容上移、淡出，名字放大
    fx.onScroll(() => hero.style.setProperty('--hp', fx.clamp(scrollY / (innerHeight * 0.9), 0, 1).toFixed(3)));
  }
  $('.hgrid')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-flip]');
    if (!b) return;
    const card = b.closest('.hcard');
    const on = card.classList.toggle('is-flipped');
    card.querySelector(on ? '.hcard__back [data-flip]' : '.hcard__in [data-flip]')?.focus({ preventScroll: true });
  });
  const mq = $('.marquee');
  if (mq) fx.marquee(mq);
  const bio = $('.bio');
  if (bio) fx.scrub(bio);
  const reel = $('.reel');
  if (reel) fx.reel(reel);
  const grid = $('.hgrid');
  if (grid) fx.glowGrid(grid);
  const tl = $('.tl');
  if (tl) fx.timeline(tl);
  fx.countUp(app);

  $('#honors-more')?.addEventListener('click', (e) => {
    $$('.hcard[data-extra]').forEach((li) => { li.hidden = false; });
    fx.reveal(app);
    e.currentTarget.parentElement.remove();
  });
  const seg = $('#experience .seg');
  if (seg) {
    const place = fx.segPill(seg);
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      place();
      $$('#experience .tl__item').forEach((li) => { li.hidden = b.dataset.scope !== 'all' && li.dataset.scope !== b.dataset.scope; });
      dispatchEvent(new Event('scroll'));
    }));
  }
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); fx.toast('邮箱已复制'); } catch { location.href = `mailto:${b.dataset.copy}`; }
  });
}

function startHero(data, entering) {
  const hero = $('.hero');
  const canvas = $('.hero__canvas');
  if (!hero || !canvas) return;
  const name = (data.profile.name || data.site.title).replace(/\s+/g, ' ').trim();
  const fx_ = data.site.effects;
  const useIntro = fx_.intro && !entering && !PREVIEW && !fx.REDUCED && !sessionStorage.getItem('intro-seen');
  if (fx_.particles && !fx.REDUCED) {
    particles = fx.particleName(canvas, name, { autoplay: !useIntro });
    if (particles) hero.classList.add('has-canvas');
  }
  if (useIntro) {
    try { sessionStorage.setItem('intro-seen', '1'); } catch { /* 隐私模式 */ }
    fx.intro([data.profile.name, data.profile.nameEn].filter(Boolean).join('  ')).then(() => particles?.play());
  }
}

/* ---------------- 作品列表页 ---------------- */

function renderWorks(data) {
  const works = data.works.filter((w) => !w.hidden);
  const types = Object.keys(TYPES).filter((t) => works.some((w) => w.type === t));
  const initial = location.hash.slice(1);
  let saved = 'grid';
  try { saved = localStorage.getItem('works-view') || 'grid'; } catch { /* 隐私模式 */ }
  const st = { type: types.includes(initial) ? initial : 'all', award: initial === 'awarded', q: '', view: saved === 'list' ? 'list' : 'grid' };
  document.title = `作品 | ${data.site.title}`;
  const hasAward = works.some((w) => visibleAwards(w).length);

  app.innerHTML = `
    <header class="wrap page-hd">
      <h1 class="display" data-split>作品</h1>
      <p data-reveal>视频、图文与文字作品，共 ${works.length} 件。${fx.FINE ? `按 ${/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'} K 可以快速搜索。` : ''}</p>
    </header>
    <div class="wrap toolbar" id="toolbar">
      <div class="seg" role="group" aria-label="按形式筛选">
        <button type="button" data-type="all" aria-pressed="false">全部<span>${works.length}</span></button>
        ${types.map((t) => `<button type="button" data-type="${t}" aria-pressed="false">${TYPES[t].label}<span>${works.filter((w) => w.type === t).length}</span></button>`).join('')}
      </div>
      ${hasAward ? '<label class="switch"><input type="checkbox" id="award-only"> 只看获奖</label>' : ''}
      <div class="views" role="group" aria-label="显示方式">
        <button type="button" data-view="grid" aria-label="网格" aria-pressed="false">${ICON.grid}</button>
        <button type="button" data-view="list" aria-label="列表" aria-pressed="false">${ICON.list}</button>
      </div>
      <input class="search" id="q" type="search" placeholder="搜索标题、类别、标签" aria-label="搜索作品">
    </div>
    <div class="wrap">
      <div class="wgrid" id="grid">${works.map((w) => `<a class="wcard" href="${workHref(w.id)}" data-id="${esc(w.id)}" data-cursor="${CURSOR[w.type]}" data-wipe="${esc(w.title)}">
        <div class="wcard__media" data-tilt="6" data-reveal-img>${mediaInner(w)}</div>
        <div class="wcard__body">
          <h3>${esc(w.title || '未命名作品')}</h3>
          <p class="wcard__meta">${[w.category, fmtDate(w.date)].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</p>
          ${w.summary ? `<p class="wcard__sum">${esc(w.summary)}</p>` : ''}
          ${awardLine(w, 'wcard__award')}
        </div>
      </a>`).join('')}</div>
      <ol class="wlist" id="list">${works.map((w, i) => `<li data-id="${esc(w.id)}"><a class="wrow" href="${workHref(w.id)}" data-peek="${w.cover ? esc(assetUrl(w.cover)) : ''}" data-cursor="${CURSOR[w.type]}" data-wipe="${esc(w.title)}">
        <span class="wrow__no">${String(i + 1).padStart(2, '0')}</span>
        <span class="wrow__t">${esc(w.title || '未命名作品')}<small>${esc([w.category, w.summary].filter(Boolean).join('　'))}</small></span>
        <span class="wrow__tags">${visibleAwards(w).length ? `<span class="wrow__gold" title="获奖作品">${laurelSVG()}${laurelSVG()}</span>` : ''}<span class="wrow__type">${TYPES[w.type].label}</span></span>
        <span class="wrow__y">${esc(fmtDate(w.date).slice(0, 7))}</span>
      </a></li>`).join('')}</ol>
      <p class="empty" id="empty" hidden>没有符合条件的作品，换个筛选条件试试。</p>
    </div>`;

  const grid = $('#grid');
  const list = $('#list');
  const seg = $('.toolbar .seg');
  const awardBox = $('#award-only');
  if (awardBox) awardBox.checked = st.award;
  const placePill = fx.segPill(seg);
  const match = (w) => (st.type === 'all' || w.type === st.type)
    && (!st.award || visibleAwards(w).length)
    && (!st.q || [w.title, w.category, w.summary, ...w.tags].join(' ').toLowerCase().includes(st.q));

  // 筛选时卡片平滑移动到新位置（FLIP）
  function draw(animate = true) {
    $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === st.type)));
    $$('.views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
    placePill();
    grid.hidden = st.view !== 'grid';
    list.hidden = st.view !== 'list';
    const cards = $$('.wcard', grid);
    const before = new Map(cards.filter((c) => !c.hidden).map((c) => [c, c.getBoundingClientRect()]));
    let shown = 0;
    works.forEach((w) => {
      const ok = !!match(w);
      if (ok) shown++;
      const c = $(`.wcard[data-id="${CSS.escape(w.id)}"]`, grid);
      const r = $(`li[data-id="${CSS.escape(w.id)}"]`, list);
      if (c) c.hidden = !ok;
      if (r) r.hidden = !ok;
    });
    $('#empty').hidden = shown > 0;
    if (animate && !fx.REDUCED && st.view === 'grid') {
      for (const c of cards) {
        if (c.hidden) continue;
        const a = before.get(c);
        const b = c.getBoundingClientRect();
        if (a) {
          const dx = a.left - b.left, dy = a.top - b.top;
          if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
        } else {
          c.animate([{ opacity: 0, transform: 'scale(.92) translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
    }
    const hash = st.award ? 'awarded' : st.type === 'all' ? '' : st.type;
    history.replaceState(null, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  }
  $$('button', seg).forEach((b) => b.addEventListener('click', () => { st.type = b.dataset.type; draw(); }));
  awardBox?.addEventListener('change', () => { st.award = awardBox.checked; draw(); });
  $('#q').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); });
  $$('.views button').forEach((b) => b.addEventListener('click', () => {
    st.view = b.dataset.view;
    try { localStorage.setItem('works-view', st.view); } catch { /* 隐私模式 */ }
    draw(false);
  }));
  draw(false);

  // 工具栏吸顶时出现背景
  const tb = $('#toolbar');
  fx.onScroll(() => tb.classList.toggle('is-stuck', tb.getBoundingClientRect().top <= 1));

  // 列表视图：封面跟随鼠标浮现
  if (fx.FINE) {
    const peek = document.createElement('div');
    peek.className = 'peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.innerHTML = '<img alt="">';
    document.body.append(peek);
    const img = peek.firstChild;
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      peek.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${((tx - x) * 0.04).toFixed(2)}deg)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : 0;
    };
    list.addEventListener('pointermove', (e) => { tx = e.clientX + 40; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); });
    list.addEventListener('pointerover', (e) => {
      const a = e.target.closest('.wrow');
      const src = a?.dataset.peek;
      if (src) { if (img.getAttribute('src') !== src) img.src = src; peek.classList.add('is-on'); } else peek.classList.remove('is-on');
    });
    list.addEventListener('pointerleave', () => peek.classList.remove('is-on'));
  }
}

/* ---------------- 作品详情页 ---------------- */

function renderWork(data) {
  const id = params.get('id');
  const list = data.works.filter((w) => !w.hidden || PREVIEW);
  const idx = list.findIndex((w) => w.id === id);
  if (idx < 0) {
    app.innerHTML = `<div class="error-box"><h2>找不到这件作品</h2><p>它可能已被删除或隐藏。</p><p style="margin-top:24px"><a class="btn btn--sm" href="${href('works.html')}">返回作品列表</a></p></div>`;
    return;
  }
  const w = list[idx];
  document.title = `${w.title} | ${data.site.title}`;
  if (w.summary) $('meta[name="description"]')?.setAttribute('content', w.summary);

  const awards = visibleAwards(w);
  const certs = w.awards.filter((a) => a.showCertificate && a.certificate);
  const meta = [['完成时间', fmtDate(w.date)], ['我的角色', w.role], ['合作者', w.collaborators], ['发布平台', w.platform]].filter((m) => m[1]);
  const cover = w.cover ? assetUrl(w.cover) : '';
  const glow = cover ? `<div class="glowbg" aria-hidden="true"><img src="${esc(cover)}" alt=""></div>` : '';
  let media = '';
  const vid = w.type === 'video' ? biliEmbed(w.video, w.title) : '';
  if (vid) media = glow + vid;
  else if (cover && w.type !== 'text') media = `${glow}<figure class="work__cover"><img src="${esc(cover)}" alt="${esc(w.title)}" data-lightbox="cover" data-caption="${esc(w.title)}" data-cursor="放大"></figure>`;

  let body = '';
  if (w.body.trim()) {
    if (w.type === 'text') {
      const n = countChars(w.body);
      body = `<div class="reader-tools"><span>全文 ${n.toLocaleString('zh-CN')} 字　约 ${Math.max(1, Math.round(n / 400))} 分钟</span><button type="button" data-fs="-1" aria-label="缩小字号">A-</button><button type="button" data-fs="1" aria-label="放大字号">A+</button></div>
        <div class="prose prose--reading" id="reading">${md(w.body)}</div>`;
    } else body = `<div class="prose">${md(w.body)}</div>`;
  }
  const gallery = w.gallery.filter((g) => g.src);
  const next = list[(idx + 1) % list.length];

  app.innerHTML = `<article class="work">
    ${cover ? `<div class="ambient" aria-hidden="true"><img src="${esc(cover)}" alt=""></div>` : ''}
    <div class="wrap">
      <a class="back" href="${href('works.html')}" data-wipe="作品">${ICON.back}全部作品</a>
      <header class="work__head">
        <p class="work__kind" data-reveal><span class="tag">${TYPES[w.type].label}</span>${w.category ? `<span>${esc(w.category)}</span>` : ''}${w.date ? `<span class="mono">${fmtDate(w.date)}</span>` : ''}${w.hidden ? '<span>（已隐藏，仅预览可见）</span>' : ''}</p>
        <h1 class="display" data-split>${esc(w.title || '未命名作品')}</h1>
        ${w.summary ? `<p class="lede" data-reveal style="--d:.2s">${esc(w.summary)}</p>` : ''}
        ${awards.length ? `<div class="stage" aria-label="获奖">${awards.map((a) => awardBadge(a, 'lg')).join('')}</div>` : ''}
        ${meta.length ? `<dl class="work__meta" data-reveal>${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${w.tags.length ? `<ul class="chips work__tags">${w.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </header>
      ${media ? `<div class="work__media" data-reveal>${media}</div>` : ''}
      ${body ? `<div class="work__body">${body}</div>` : ''}
      ${gallery.length ? `<section class="blk"><h2 data-split>图片</h2><div class="gallery">${gallery.map((g) => `<figure data-reveal><img src="${esc(assetUrl(g.src))}" alt="${esc(g.caption)}" loading="lazy" data-lightbox="gallery" data-caption="${esc(g.caption)}" data-cursor="放大">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div></section>` : ''}
      ${certs.length ? `<section class="blk"><h2 data-split>获奖证书</h2><div class="certs">${certs.map((a) => {
        const url = assetUrl(a.certificate);
        const cap = [a.level, a.name].filter(Boolean).join(' ');
        return `<figure class="cert" data-tilt="6">${isPdf(url)
          ? `<a class="cert__pdf" href="${esc(url)}" target="_blank" rel="noopener">打开 PDF 证书</a>`
          : `<img src="${esc(url)}" alt="${esc(cap)}证书" loading="lazy" data-lightbox="certs" data-caption="${esc(cap)}" data-cursor="放大">`}<figcaption>${esc(cap)}</figcaption><span class="glare"></span></figure>`;
      }).join('')}</div></section>` : ''}
      ${w.links.some((l) => l.url) ? `<section class="blk"><h2 data-split>相关链接</h2><ul class="links">${w.links.filter((l) => l.url).map((l) => `<li><a class="btn btn--sm" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener" data-magnetic="0.25">${esc(l.label || l.url)}${ICON.arrowUR}</a></li>`).join('')}</ul></section>` : ''}
    </div>
    ${next && next !== w ? `<a class="next" href="${workHref(next.id)}" data-cursor="下一件" data-wipe="${esc(next.title)}">
      ${next.cover ? `<span class="next__bg" aria-hidden="true"><img src="${esc(assetUrl(next.cover))}" alt="" loading="lazy"></span>` : ''}
      <small>下一件作品</small><b>${esc(next.title)}</b>
    </a>` : ''}
  </article>`;

  const reading = $('#reading');
  if (reading) {
    let fs = 19;
    try { fs = Number(localStorage.getItem('reading-fs')) || 19; } catch { /* 隐私模式 */ }
    const apply = () => { reading.style.setProperty('--fs', `${fs}px`); try { localStorage.setItem('reading-fs', fs); } catch { /* 同上 */ } };
    apply();
    $$('[data-fs]').forEach((b) => b.addEventListener('click', () => { fs = fx.clamp(fs + Number(b.dataset.fs), 15, 26); apply(); }));
  }
}

/* ---------------- 灯箱 ---------------- */

function initLightbox() {
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.hidden = true;
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', '查看大图');
  lb.innerHTML = `<img alt=""><p class="lb__cap"></p><span class="lb__n mono"></span>
    <button class="lb__x" type="button" aria-label="关闭">${ICON.close}</button>
    <button class="lb__prev" type="button" aria-label="上一张">${ICON.left}</button>
    <button class="lb__next" type="button" aria-label="下一张">${ICON.right}</button>`;
  document.body.append(lb);
  const img = $('img', lb);
  const cap = $('.lb__cap', lb);
  const num = $('.lb__n', lb);
  let items = [], idx = 0, back = null, sx = null;
  const show = () => {
    const it = items[idx];
    img.src = it.src;
    img.alt = it.caption;
    cap.textContent = it.caption;
    num.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
    $('.lb__prev', lb).hidden = $('.lb__next', lb).hidden = items.length < 2;
  };
  const close = () => {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { lb.hidden = true; img.removeAttribute('src'); }, 300);
    back?.focus();
  };
  const step = (d) => { idx = (idx + d + items.length) % items.length; show(); };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lightbox]');
    if (!t || lb.contains(t)) return;
    e.preventDefault();
    const els = $$(`[data-lightbox="${t.dataset.lightbox}"]`).filter((el) => !el.closest('[hidden]'));
    items = els.map((el) => ({ src: el.dataset.lightboxSrc || el.currentSrc || el.src, caption: el.dataset.caption || el.alt || '' }));
    idx = Math.max(0, els.indexOf(t));
    back = t;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    show();
    requestAnimationFrame(() => lb.classList.add('is-open'));
    $('.lb__x', lb).focus();
  });
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.closest('.lb__x')) close();
    else if (e.target.closest('.lb__prev')) step(-1);
    else if (e.target.closest('.lb__next')) step(1);
  });
  img.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  img.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50 && items.length > 1) step(e.clientX < sx ? 1 : -1); sx = null; });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
}

/* ---------------- 启动 ---------------- */

function renderError(err) {
  const local = location.protocol === 'file:';
  app.innerHTML = `<div class="error-box">
    <h2>${local ? '需要通过网址打开' : '内容加载失败'}</h2>
    <p>${local
      ? '浏览器不允许直接双击打开的页面读取数据文件。请在项目文件夹里运行 <code>python3 -m http.server 8000</code>，然后访问 <code>http://localhost:8000</code>。'
      : esc(err.message)}</p>
  </div>`;
}

const scrollKey = `scroll:${location.pathname}${location.search}`;
function restoreScroll() {
  const nav = performance.getEntriesByType?.('navigation')?.[0];
  if (nav?.type !== 'back_forward') return;
  try { const y = Number(sessionStorage.getItem(scrollKey)); if (y) scrollTo({ top: y, behavior: 'instant' }); } catch { /* 隐私模式 */ }
}

async function main() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  addEventListener('pagehide', () => { try { sessionStorage.setItem(scrollKey, String(scrollY)); } catch { /* 隐私模式 */ } });
  const tr = fx.transitions();
  initLightbox();
  let data;
  try {
    data = await loadData();
  } catch (err) {
    renderError(err);
    tr.done();
    return;
  }
  applySite(data);
  renderHeader(data);
  renderFooter(data);
  if (PAGE === 'works') renderWorks(data);
  else if (PAGE === 'work') renderWork(data);
  else renderHome(data);

  if (draftShown) document.body.insertAdjacentHTML('beforeend', '<div class="preview-bar" role="status">预览模式：显示的是后台里还没发布的修改</div>');
  palette = initPalette(data, { href, workHref, onHome: PAGE === 'home' });
  const ef = data.site.effects;
  // Safari / WebKit 专项降级：背景只画一帧、不做逐帧追光、不用滚轮惯性接管。
  // 其他浏览器走原来的逻辑，行为不变。
  if (!(ef.shader && fx.aether($('.aether'), { still: IS_SAFARI }))) {
    $('.aether')?.remove();
    if (!IS_SAFARI) fx.spotlight($('.spot'));
  }
  if (ef.smooth && !IS_SAFARI) fx.smoothScroll();
  if (ef.cursor) fx.cursor();
  fx.hoverScramble();
  fx.magnetic();
  fx.tilt();
  fx.reveal();
  if (PAGE === 'home') startHero(data, tr.entering);

  restoreScroll();
  if (PAGE === 'home' && location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
  requestAnimationFrame(() => tr.done());
}

main();
