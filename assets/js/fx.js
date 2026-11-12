// assets/js/fx.js — 交互与动效（无依赖）
//
// 设计原则：
//   1. 所有效果都是「增强」：JS 失败或关闭时，内容仍然完整可读。
//   2. 尊重系统「减少动态效果」设置（REDUCED），触屏设备不启用依赖鼠标的效果（FINE）。
//   3. 只用一个滚动 rAF 循环（onScroll），粒子 / 跑马灯等持续动画在离开视口时暂停。

import { esc } from './core.js';

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
export function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------------- 统一的滚动循环 ---------------- */

const scrollFns = new Set();
let ticking = false;
function flush() { ticking = false; for (const f of scrollFns) f(); }
function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(flush); } }
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
export function onScroll(fn) { scrollFns.add(fn); fn(); return () => scrollFns.delete(fn); }

function whenVisible(el, cb, margin = '100px') {
  if (!('IntersectionObserver' in window)) { cb(true); return; }
  new IntersectionObserver(([e]) => cb(e.isIntersecting), { rootMargin: margin }).observe(el);
}

/* ---------------- 追光：光斑跟随指针 ---------------- */

export function spotlight(el) {
  if (!el || REDUCED || !FINE) return;
  let x = innerWidth * 0.7, y = innerHeight * 0.18, tx = x, ty = y, raf = 0;
  const step = () => {
    x = lerp(x, tx, 0.1);
    y = lerp(y, ty, 0.1);
    el.style.setProperty('--mx', `${x.toFixed(1)}px`);
    el.style.setProperty('--my', `${y.toFixed(1)}px`);
    raf = Math.abs(x - tx) + Math.abs(y - ty) > 0.5 ? requestAnimationFrame(step) : 0;
  };
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
}

/* ---------------- 自定义光标 ---------------- */
// 元素加 data-cursor="播放" 时，光标会放大并显示文字。

export function cursor() {
  if (!FINE || REDUCED) return;
  const el = document.createElement('div');
  el.className = 'cursor is-hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="cursor__dot"></span><span class="cursor__ring"><span class="cursor__label"></span></span>';
  document.body.append(el);
  document.documentElement.classList.add('has-cursor');
  const dot = el.children[0];
  const ring = el.children[1];
  const label = ring.firstChild;
  let mx = -100, my = -100, rx = mx, ry = my, raf = 0, seen = false, down = false;
  const paint = () => {
    // 缩放必须写进 transform：单独的 scale 属性会把它前面的 translate 一起缩放，导致点击时圆环往左上漂移。
    const s = down ? 0.85 : 1;
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0) scale(${s})`;
  };
  const loop = () => {
    rx = lerp(rx, mx, 0.2);
    ry = lerp(ry, my, 0.2);
    paint();
    raf = Math.abs(rx - mx) + Math.abs(ry - my) > 0.1 ? requestAnimationFrame(loop) : 0;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) { rx = mx; ry = my; seen = true; el.classList.remove('is-hidden'); }
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-cursor], a, button, label, input, textarea, select, iframe, [role="button"]');
    const lab = t?.closest('[data-cursor]')?.dataset.cursor || '';
    const tag = t?.tagName || '';
    label.textContent = lab;
    el.classList.toggle('is-label', !!lab);
    el.classList.toggle('is-link', !lab && !!t && !/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(tag));
    el.classList.toggle('is-hidden', !seen || /^(IFRAME|INPUT|TEXTAREA)$/.test(tag));
  });
  document.documentElement.addEventListener('mouseleave', () => el.classList.add('is-hidden'));
  document.documentElement.addEventListener('mouseenter', () => { if (seen) el.classList.remove('is-hidden'); });
  addEventListener('pointerdown', () => {
    if (down) return;
    down = true; el.classList.add('is-down');
    if (!raf) raf = requestAnimationFrame(loop); else paint();
  });
  addEventListener('pointerup', () => {
    if (!down) return;
    down = false; el.classList.remove('is-down');
    if (!raf) raf = requestAnimationFrame(loop); else paint();
  });
}

/* ---------------- 磁吸按钮 data-magnetic="0.3" ---------------- */

export function magnetic(root = document) {
  if (!FINE || REDUCED) return;
  for (const el of $$('[data-magnetic]', root)) {
    if (el._mag) continue;
    el._mag = true;
    const k = Number(el.dataset.magnetic) || 0.3;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * k).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * k).toFixed(1)}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }
}

/* ---------------- 3D 倾斜 + 光泽 data-tilt="8" ---------------- */

export function tilt(root = document) {
  if (!FINE || REDUCED) return;
  for (const el of $$('[data-tilt]', root)) {
    if (el._tilt) continue;
    el._tilt = true;
    const max = Number(el.dataset.tilt) || 8;
    let raf = 0, ev = null;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const px = clamp((ev.clientX - r.left) / r.width, 0, 1);
      const py = clamp((ev.clientY - r.top) / r.height, 0, 1);
      el.style.transform = `perspective(1000px) rotateX(${((0.5 - py) * max).toFixed(2)}deg) rotateY(${((px - 0.5) * max).toFixed(2)}deg) scale(1.015)`;
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    };
    el.addEventListener('pointermove', (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; el.style.transform = ''; });
  }
}

/* ---------------- 标题逐字揭示 & 进入视口揭示 ---------------- */

export function splitText(el) {
  if (el.dataset.splitDone) return;
  el.dataset.splitDone = '1';
  const text = el.textContent.trim();
  let i = 0;
  el.setAttribute('aria-label', text);
  // 英文单词保持整体，中文逐字
  el.innerHTML = (text.match(/[\x21-\x7e]+|\s+|[^\s]/gu) || [])
    .map((t) => (/^\s+$/.test(t) ? ' ' : `<span class="ln" aria-hidden="true"><span class="ch" style="--i:${i++}">${esc(t)}</span></span>`))
    .join('');
  el.classList.add('split');
}

let revealIO = null;
const revealMap = new WeakMap(); // 被观察元素 → 要揭示的元素
export function reveal(root = document) {
  $$('[data-split]', root).forEach(splitText);
  const els = $$('[data-reveal], [data-reveal-img], .split, .award--md, .award--lg', root).filter((e) => !e._rv);
  els.forEach((e) => { e._rv = true; });
  const show = (e) => { e.classList.add('is-in'); if (e.classList.contains('award')) e.classList.add('is-grow'); };
  if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(show); return; }
  revealIO ??= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      show(revealMap.get(en.target) || en.target);
      revealIO.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
  for (const e of els) {
    // 带 clip-path 的元素自身的可见面积为 0，IntersectionObserver 永远不会触发，所以改为观察它的父元素
    const watch = e.hasAttribute('data-reveal-img') ? e.parentElement : e;
    revealMap.set(watch, e);
    revealIO.observe(watch);
  }
}

/* ---------------- 乱码切换文字 ---------------- */

const GLYPHS = [...'影像光声帧镜色调剪辑叙事采访片场城市夜晚纪录文字故事#%&*+=<>/'];
export function scrambleTo(el, text, dur = 650) {
  const target = [...text];
  if (REDUCED) { el.textContent = text; return Promise.resolve(); }
  const len = Math.max([...el.textContent].length, target.length);
  const start = performance.now();
  return new Promise((done) => {
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      let out = '';
      for (let i = 0; i < len; i++) {
        const settle = 0.25 + (i / len) * 0.75;
        if (p >= settle) out += target[i] || '';
        else if (i < target.length || p < settle * 0.6) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(step); else { el.textContent = text; done(); }
    };
    requestAnimationFrame(step);
  });
}

export function rotate(el, items, every = 2600) {
  if (!el || items.length < 2) return;
  let i = 0, vis = true;
  whenVisible(el, (v) => { vis = v; });
  setInterval(() => {
    if (!vis || document.hidden) return;
    i = (i + 1) % items.length;
    scrambleTo(el, items[i]);
  }, every);
}

/* ---------------- 数字滚动 data-count="12" ---------------- */

export function countUp(root = document) {
  for (const el of $$('[data-count]', root)) {
    const n = Number(el.dataset.count) || 0;
    if (REDUCED) { el.textContent = n; continue; }
    el.textContent = '0';
    let started = false;
    whenVisible(el, (v) => {
      if (!v || started) return;
      started = true;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 1300);
        el.textContent = Math.round(n * (1 - (1 - p) ** 3));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, '0px');
  }
}

/* ---------------- 跑马灯：速度随滚动变化，向上滚动时反向 ---------------- */

export function marquee(section) {
  const rows = $$('.marquee__row', section);
  const state = rows.map((row) => {
    const track = row.querySelector('.marquee__track');
    let guard = 0;
    while (track.offsetWidth < innerWidth * 1.2 && guard++ < 6) track.innerHTML += track.innerHTML;
    row.append(track.cloneNode(true));
    row.lastElementChild.setAttribute('aria-hidden', 'true');
    return { row, track, x: 0, dir: Number(row.dataset.dir) || 1, w: track.offsetWidth };
  });
  if (REDUCED) return;
  addEventListener('resize', debounce(() => state.forEach((s) => { s.w = s.track.offsetWidth; })));
  let lastY = scrollY, vel = 0, raf = 0, vis = false;
  const loop = () => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    vel = lerp(vel, dy, 0.08);
    const speed = 0.7 + vel * 0.45;
    for (const s of state) {
      s.x -= speed * s.dir;
      if (s.x <= -s.w) s.x += s.w;
      if (s.x > 0) s.x -= s.w;
      s.row.style.transform = `translate3d(${s.x.toFixed(2)}px,0,0) skewX(${clamp(-vel * 0.35, -10, 10).toFixed(2)}deg)`;
    }
    raf = vis ? requestAnimationFrame(loop) : 0;
  };
  whenVisible(section, (v) => { vis = v; if (v && !raf) raf = requestAnimationFrame(loop); });
}

/* ---------------- 首屏：粒子组成的名字，被指针推开后弹回 ---------------- */

export function particleName(canvas, text, { autoplay = true } = {}) {
  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement;
  let W = 0, H = 0, n = 0, size = 2, raf = 0, vis = true, playing = autoplay, fill = '#fff';
  let P = new Float32Array(0); // 每个粒子 6 个数：x y vx vy tx ty
  const mouse = { x: -1e4, y: -1e4, on: false };

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const g = ctx.createLinearGradient(0, 0, W, H * 0.4);
    g.addColorStop(0, cs.getPropertyValue('--gold').trim() || '#f0b24a');
    g.addColorStop(0.5, cs.getPropertyValue('--ink').trim() || '#fff');
    g.addColorStop(1, cs.getPropertyValue('--accent').trim() || '#3ad6c5');
    fill = g;
  }

  function build() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    W = r.width; H = r.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const off = document.createElement('canvas');
    off.width = Math.ceil(W); off.height = Math.ceil(H);
    const o = off.getContext('2d', { willReadFrequently: true });
    const family = getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif';
    let fs = H * 0.9;
    o.font = `900 ${fs}px ${family}`;
    const tw = o.measureText(text).width;
    if (tw > W * 0.98) fs *= (W * 0.98) / tw;
    o.font = `900 ${fs}px ${family}`;
    o.textBaseline = 'middle';
    o.fillStyle = '#fff';
    o.fillText(text, 0, H / 2 + fs * 0.03);
    const data = o.getImageData(0, 0, off.width, off.height).data;
    let gap = W < 640 ? 3 : 4, pts;
    for (;;) {
      pts = [];
      for (let y = 0; y < off.height; y += gap) for (let x = 0; x < off.width; x += gap) if (data[(y * off.width + x) * 4 + 3] > 130) pts.push(x, y);
      if (pts.length / 2 <= 7000 || gap >= 9) break;
      gap++;
    }
    size = Math.max(1.5, gap * 0.58);
    const old = P, oldN = n;
    n = pts.length / 2;
    P = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const k = i * 6;
      P[k + 4] = pts[i * 2];
      P[k + 5] = pts[i * 2 + 1];
      if (i < oldN) { P[k] = old[k]; P[k + 1] = old[k + 1]; }
      else { // 首次：从四周散开的位置飞入
        const a = Math.random() * Math.PI * 2, d = (0.4 + Math.random() * 0.8) * W;
        P[k] = P[k + 4] + Math.cos(a) * d;
        P[k + 1] = P[k + 5] + Math.sin(a) * d * 0.5;
      }
    }
    colors();
    return true;
  }

  function tick() {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = fill;
    ctx.beginPath();
    const R = Math.max(80, H * 0.42), R2 = R * R;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 6;
      let x = P[k], y = P[k + 1], vx = P[k + 2], vy = P[k + 3];
      if (mouse.on) {
        const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 5; vx += (dx / d) * f; vy += (dy / d) * f; }
      }
      vx = (vx + (P[k + 4] - x) * 0.05) * 0.84;
      vy = (vy + (P[k + 5] - y) * 0.05) * 0.84;
      x += vx; y += vy;
      P[k] = x; P[k + 1] = y; P[k + 2] = vx; P[k + 3] = vy;
      energy += vx * vx + vy * vy;
      ctx.rect(x, y, size, size);
    }
    ctx.fill();
    if (vis && playing && (mouse.on || energy > n * 0.0004)) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && vis && playing) raf = requestAnimationFrame(tick); };

  if (!build()) return null;
  if (!playing) { // 片头期间先画出静止的名字，避免空白
    for (let i = 0; i < n; i++) { P[i * 6] = P[i * 6 + 4]; P[i * 6 + 1] = P[i * 6 + 5]; }
  }
  const move = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.on = true;
    kick();
  };
  host.addEventListener('pointermove', move, { passive: true });
  host.addEventListener('pointerdown', move, { passive: true });
  host.addEventListener('pointerleave', () => { mouse.on = false; kick(); });
  host.addEventListener('pointercancel', () => { mouse.on = false; kick(); });
  whenVisible(canvas, (v) => { vis = v; kick(); }, '0px');
  addEventListener('resize', debounce(() => { if (build()) kick(); }, 200));
  document.addEventListener('themechange', () => { colors(); tick(); });
  if (playing) kick(); else tick();
  return {
    play() {
      if (playing) return;
      playing = true;
      for (let i = 0; i < n; i++) { // 片头结束：炸开再聚拢
        const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 26;
        P[i * 6 + 2] = Math.cos(a) * s; P[i * 6 + 3] = Math.sin(a) * s;
      }
      kick();
    },
  };
}

/* ---------------- 横向滚动的作品胶片带 ---------------- */

export function reel(section) {
  const track = section.querySelector('.reel__track');
  const mq = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
  let dist = 0;
  const setup = () => {
    const pin = mq.matches && !REDUCED;
    section.classList.toggle('is-pinned', pin);
    track.style.transform = '';
    if (!pin) { section.style.height = ''; return; }
    dist = Math.max(0, track.scrollWidth - innerWidth);
    section.style.height = `${innerHeight + dist}px`;
  };
  const update = () => {
    if (!section.classList.contains('is-pinned')) return;
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - innerHeight;
    const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
    track.style.transform = `translate3d(${(-p * dist).toFixed(1)}px,0,0)`;
    section.style.setProperty('--rp', p.toFixed(4));
  };
  // 键盘 Tab 到画面外的卡片时，把页面滚到对应位置
  track.addEventListener('focusin', (e) => {
    if (!section.classList.contains('is-pinned')) return;
    const card = e.target.closest('.rcard');
    if (!card) return;
    const total = section.offsetHeight - innerHeight;
    const p = clamp((card.offsetLeft - innerWidth * 0.2) / dist, 0, 1);
    scrollTo({ top: section.offsetTop + p * total, behavior: REDUCED ? 'auto' : 'smooth' });
  });
  setup();
  onScroll(update);
  addEventListener('resize', debounce(() => { setup(); update(); }, 150));
  mq.addEventListener?.('change', () => { setup(); update(); });
  return { setup };
}

/* ---------------- 关于我：随滚动逐字点亮 ---------------- */

export function scrub(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const total = nodes.reduce((a, t) => a + [...t.data].length, 0) || 1;
  let i = 0;
  for (const t of nodes) {
    const frag = document.createDocumentFragment();
    for (const c of t.data) {
      if (/\s/.test(c)) { frag.append(c); i++; continue; }
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--i', (i++ / total).toFixed(4));
      s.textContent = c;
      frag.append(s);
    }
    t.replaceWith(frag);
  }
  if (REDUCED) { el.style.setProperty('--p', '2'); return; }
  onScroll(() => {
    const r = el.getBoundingClientRect();
    const p = (innerHeight * 0.88 - r.top) / (r.height + innerHeight * 0.3);
    el.style.setProperty('--p', clamp(p, 0, 1.2).toFixed(3));
  });
}

/* ---------------- 时间线：随滚动描线、节点点亮 ---------------- */

export function timeline(ol) {
  const items = $$('.tl__item', ol);
  onScroll(() => {
    const r = ol.getBoundingClientRect();
    const mid = innerHeight * 0.62;
    ol.style.setProperty('--tp', clamp((mid - r.top) / r.height, 0, 1).toFixed(4));
    for (const it of items) if (!it.hidden) it.classList.toggle('is-past', it.getBoundingClientRect().top + 34 < mid);
  });
}

/* ---------------- 边框追光（荣誉卡片） ---------------- */

export function glowGrid(grid) {
  if (!FINE) return;
  let raf = 0, ev = null;
  const apply = () => {
    raf = 0;
    for (const c of grid.children) {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--hx', `${(ev.clientX - r.left).toFixed(0)}px`);
      c.style.setProperty('--hy', `${(ev.clientY - r.top).toFixed(0)}px`);
    }
  };
  grid.addEventListener('pointermove', (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); });
}

/* ---------------- 分段控件的滑块 ---------------- */

export function segPill(seg) {
  let pill = seg.querySelector('.seg__pill');
  if (!pill) { pill = document.createElement('span'); pill.className = 'seg__pill'; seg.prepend(pill); }
  const place = () => {
    const on = seg.querySelector('[aria-pressed="true"]');
    if (!on) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  place();
  addEventListener('resize', debounce(place));
  return place;
}

/* ---------------- 提示条 ---------------- */

let toastEl = null, toastT = 0;
export function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('is-on'));
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}

/* ---------------- 片头：胶片倒计时 3-2-1 ---------------- */

export function intro(title = '') {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'leader';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="leader__dial"><i class="leader__x"></i><i class="leader__y"></i><span class="leader__n">3</span></div>${title ? `<span class="leader__title">${esc(title)}</span>` : ''}<span class="leader__skip">点击任意处跳过</span>`;
    document.body.append(el);
    const num = el.querySelector('.leader__n');
    const dial = el.querySelector('.leader__dial');
    const per = 430, t0 = performance.now();
    let done = false, raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 850);
      resolve();
    };
    const step = (now) => {
      const t = now - t0;
      if (t >= per * 3) { finish(); return; }
      num.textContent = String(3 - Math.floor(t / per));
      dial.style.setProperty('--sweep', `${((t % per) / per) * 360}deg`);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    el.addEventListener('click', finish);
    addEventListener('keydown', finish, { once: true });
  });
}

/* ---------------- 页面转场：幕布擦除 ---------------- */
// 站内链接点击 → 幕布从下方升起 → 跳转；新页面渲染完成后调用 done() → 幕布向上收起。
// <head> 里的内联脚本会在 sessionStorage 有 'wipe' 标记时给 <html> 加 .is-entering，让幕布一开始就盖住页面。

export function transitions() {
  const root = document.documentElement;
  const wipe = document.querySelector('.wipe');
  const label = wipe?.querySelector('.wipe__label');
  let entering = root.classList.contains('is-entering');
  if (entering && label) { try { label.textContent = sessionStorage.getItem('wipe') || ''; } catch { /* 隐私模式 */ } }
  try { sessionStorage.removeItem('wipe'); } catch { /* 同上 */ }
  if (wipe && !REDUCED) {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/(\.html|\/)$/.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // 同页锚点
      e.preventDefault();
      const text = a.dataset.wipe || '';
      label.textContent = text;
      try { sessionStorage.setItem('wipe', text || ' '); } catch { /* 隐私模式 */ }
      wipe.classList.remove('is-out');
      wipe.classList.add('is-in');
      setTimeout(() => { location.href = url.href; }, 540);
    });
  }
  addEventListener('pageshow', (e) => {
    if (e.persisted && wipe) { wipe.classList.remove('is-in', 'is-out'); root.classList.remove('is-entering'); }
  });
  return {
    entering,
    done() {
      if (!entering || !wipe) return;
      entering = false;
      wipe.classList.add('is-out');
      setTimeout(() => { root.classList.remove('is-entering'); wipe.classList.remove('is-out'); label.textContent = ''; }, 760);
    },
  };
}

/* ---------------- 以太流光背景（WebGL 片元着色器） ---------------- */
// 全屏 fixed 画布，半分辨率渲染：域扭曲噪声形成缓慢流动的青 / 金光雾，指针会推开光雾并留下暖光，滚动让光雾漂移。
// 不支持 WebGL 时返回 null，页面保留 .spot 的 CSS 光斑作为降级。

const AETHER_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float t; uniform vec2 m; uniform float s;
uniform vec3 c1; uniform vec3 c2; uniform vec3 bg; uniform float k;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1., 0.)), u.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 R = mat2(.8, -.6, .6, .8);
  for (int i = 0; i < 5; i++) { v += a * n(p); p = R * p * 2.03; a *= .5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (gl_FragCoord.xy - .5 * r) / r.y;
  vec2 mm = (m - .5 * r) / r.y;
  vec2 dv = p - mm; float d = length(dv);
  vec2 q = vec2(fbm(p * 1.1 + vec2(0., t * .04 + s)), fbm(p * 1.1 + vec2(5.2, 1.3 - t * .03)));
  q += .35 * dv / (d + .06) * exp(-d * 3.);            // 指针把光雾推开
  float f = fbm(p * 1.05 + 2.6 * q + vec2(t * .015, s * .7));
  float a2 = smoothstep(.3, .76, f);                      // 大片青色雾
  float g = fbm(p * .9 - q * 1.6 + vec2(7.3 + t * .02, -t * .012));
  float a1 = smoothstep(.5, .7, g) * (.4 + .6 * a2);       // 金色亮部（独立噪声通道）
  float ridge = pow(1. - abs(f * 2. - 1.05), 7.);         // 极光般的细亮线
  vec3 col = mix(bg, c2, a2 * .48);
  col = mix(col, c1, a1 * .4);
  col = mix(col, mix(c2, c1, clamp(q.x, 0., 1.)), ridge * .4);
  col = mix(col, c1, exp(-d * 4.5) * .22);                // 指针处的暖光
  float vig = 1. - smoothstep(.45, 1.35, length((uv - .5) * vec2(1.3, 1.)));
  gl_FragColor = vec4(mix(bg, col, k * (.45 + .55 * vig)), 1.);
}`;

function hexRGB(v, fb) {
  const m = String(v || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return fb;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function aether(canvas) {
  if (!canvas || REDUCED) return null;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }');
  const fs = sh(gl.FRAGMENT_SHADER, AETHER_FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(['r', 't', 'm', 's', 'c1', 'c2', 'bg', 'k'].map((u) => [u, gl.getUniformLocation(prog, u)]));

  const scale = FINE ? 0.5 : 0.35;              // 半分辨率渲染，靠模糊的画面本身掩盖
  const minFrame = FINE ? 1000 / 60 : 1000 / 30; // 触屏设备限 30fps 省电
  let W = 0, H = 0, mx = 0.5, my = 0.6, tx = mx, ty = my, last = 0, raf = 0;
  const t0 = performance.now();
  const resize = () => {
    W = Math.max(1, Math.round(innerWidth * scale));
    H = Math.max(1, Math.round(innerHeight * scale));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(U.r, W, H);
  };
  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    const light = document.documentElement.dataset.theme === 'light';
    gl.uniform3fv(U.c1, hexRGB(cs.getPropertyValue('--gold'), [0.94, 0.7, 0.29]));
    gl.uniform3fv(U.c2, hexRGB(cs.getPropertyValue('--accent'), [0.23, 0.84, 0.77]));
    gl.uniform3fv(U.bg, hexRGB(cs.getPropertyValue('--bg'), [0.03, 0.035, 0.045]));
    gl.uniform1f(U.k, light ? 0.55 : 0.72);
  };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - last < minFrame) return;
    last = now;
    mx = lerp(mx, tx, 0.06); my = lerp(my, ty, 0.06);
    gl.uniform1f(U.t, (now - t0) / 1000);
    gl.uniform2f(U.m, mx * W, (1 - my) * H);
    gl.uniform1f(U.s, scrollY / innerHeight * 0.18);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  resize(); colors();
  addEventListener('resize', debounce(resize, 100));
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; }, { passive: true });
  document.addEventListener('themechange', colors);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(frame);
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.remove(); document.documentElement.classList.remove('has-aether'); });
  raf = requestAnimationFrame(frame);
  document.documentElement.classList.add('has-aether');
  return { colors };
}

/* ---------------- 惯性平滑滚动（只接管鼠标滚轮，原生滚动位置不变） ---------------- */
// 键盘、滚动条、触屏仍是原生滚动；吸顶 / 钉住效果照常工作。
// 遇到可滚动的子元素（搜索结果、代码块等）、按住 Ctrl 缩放、弹窗打开（body overflow:hidden）时不接管。

export function smoothScroll() {
  if (REDUCED || !FINE) return;
  let target = scrollY, cur = scrollY, raf = 0, active = false;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const go = (y) => scrollTo({ top: y, behavior: 'instant' });
  const loop = () => {
    cur = lerp(cur, target, 0.11);
    if (Math.abs(target - cur) < 0.4) { cur = target; active = false; }
    go(cur);
    raf = active ? requestAnimationFrame(loop) : 0;
  };
  const scrollable = (el) => {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
    }
    return false;
  };
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (document.body.style.overflow === 'hidden' || scrollable(e.target)) return;
    e.preventDefault();
    if (!active) target = cur = scrollY;
    const dy = e.deltaMode === 1 ? e.deltaY * 36 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    target = clamp(target + dy, 0, max());
    active = true;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: false });
  // 键盘 / 锚点 / 拖动滚动条时同步，防止下一次滚轮跳回旧位置
  addEventListener('scroll', () => { if (!active) target = cur = scrollY; }, { passive: true });
  addEventListener('keydown', () => { active = false; cancelAnimationFrame(raf); raf = 0; });
}

/* ---------------- 字母随指针靠近而点亮、浮起 ---------------- */
// 结构：<span class="prox"> 由本函数拆成 <span class="l">A</span>… ；CSS 用 --t（0~1）控制填色与位移。
// 触屏设备没有悬停，改为自动播放一道波浪。

export function proximity(el) {
  if (!el) return;
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((c, i) => `<span class="l" aria-hidden="true" style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  const letters = [...el.children];
  if (REDUCED) return;
  if (!FINE) { el.classList.add('is-wave'); return; }
  let ev = null, raf = 0, vis = true;
  whenVisible(el, (v) => { vis = v; });
  const apply = () => {
    raf = 0;
    const R = Math.max(160, el.offsetHeight * 1.6);
    for (const l of letters) {
      const b = l.getBoundingClientRect();
      const d = Math.hypot(ev.clientX - (b.left + b.width / 2), ev.clientY - (b.top + b.height / 2));
      l.style.setProperty('--t', Math.max(0, 1 - d / R).toFixed(3));
    }
  };
  addEventListener('pointermove', (e) => { if (!vis) return; ev = e; if (!raf) raf = requestAnimationFrame(apply); }, { passive: true });
}

/* ---------------- 悬停时文字乱码重排 ---------------- */

export function hoverScramble(root = document, sel = '[data-scramble]') {
  if (REDUCED || !FINE) return;
  for (const el of $$(sel, root)) {
    if (el._scr) continue;
    el._scr = true;
    const text = el.textContent;
    let busy = false;
    el.addEventListener('pointerenter', () => { if (busy) return; busy = true; scrambleTo(el, text, 380).then(() => { busy = false; }); });
  }
}
