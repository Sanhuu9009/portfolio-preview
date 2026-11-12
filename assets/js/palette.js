// assets/js/palette.js — ⌘K / Ctrl+K 搜索面板
// 可搜索：页面版块、全部作品（标题 / 类别 / 标签 / 简介）、荣誉奖项。
// 打开方式：⌘K、Ctrl+K、「/」键，或调用返回的 open()。

import { TYPES, esc, assetUrl, collectHonors, laurelSVG, fmtDate } from './core.js';

const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

export function initPalette(data, { href, workHref, onHome }) {
  const s = data.site.sections;
  const sec = (id) => (onHome ? `#${id}` : href(`index.html#${id}`));
  const items = [];
  [['about', '关于我', s.about], ['works', '精选作品', s.works], ['honors', '荣誉奖项', s.honors], ['experience', '实践经历', s.experience], ['contact', '联系方式', s.contact]]
    .filter((x) => x[2])
    .forEach(([id, t]) => items.push({ group: '页面', title: t, sub: '跳转到首页版块', url: sec(id), icon: '#', key: t }));
  if (s.works) items.push({ group: '页面', title: '全部作品', sub: '作品列表页', url: href('works.html'), icon: '▦', key: '全部作品 作品列表' });
  data.works.filter((w) => !w.hidden).forEach((w) => items.push({
    group: '作品',
    title: w.title || '未命名作品',
    sub: [TYPES[w.type].label, w.category, fmtDate(w.date)].filter(Boolean).join('　'),
    url: workHref(w.id),
    img: w.cover ? assetUrl(w.cover) : '',
    icon: TYPES[w.type].label,
    key: [w.title, w.category, w.summary, ...w.tags, TYPES[w.type].label].join(' '),
  }));
  collectHonors(data).forEach((h) => items.push({
    group: '荣誉',
    title: [h.level, h.name].filter(Boolean).join(' '),
    sub: [h.rank, fmtDate(h.date), h.issuer].filter(Boolean).join('　'),
    url: h.workId ? workHref(h.workId) : sec('honors'),
    gold: true,
    key: [h.level, h.name, h.issuer, h.rank].join(' '),
  }));

  const el = document.createElement('div');
  el.className = 'pal';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '搜索');
  el.innerHTML = `<div class="pal__box">
    <div class="pal__in">${ICON_SEARCH}<input type="text" placeholder="搜索作品、奖项或版块" aria-label="搜索" aria-controls="pal-list" autocomplete="off"><kbd>Esc</kbd></div>
    <ul class="pal__list" id="pal-list" role="listbox"></ul>
    <div class="pal__ft"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div>
  </div>`;
  document.body.append(el);
  const input = el.querySelector('input');
  const list = el.querySelector('.pal__list');
  let results = [], sel = 0, back = null;

  function draw() {
    const q = input.value.trim().toLowerCase();
    results = q
      ? items.filter((it) => q.split(/\s+/).every((t) => it.key.toLowerCase().includes(t)))
      : items.filter((it) => it.group !== '荣誉').slice(0, 12);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    if (!results.length) { list.innerHTML = '<li class="pal__empty">没有找到相关内容</li>'; return; }
    let last = '';
    list.innerHTML = results.map((it, i) => {
      const head = it.group !== last ? `<li class="pal__grp" role="presentation">${it.group}</li>` : '';
      last = it.group;
      const ic = it.img ? `<img src="${esc(it.img)}" alt="">` : it.gold ? laurelSVG() : esc(it.icon || '');
      return `${head}<li class="pal__item" role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === sel}">
        <span class="pal__ic${it.gold ? ' is-gold' : ''}">${ic}</span>
        <span class="pal__t"><b>${esc(it.title)}</b><span>${esc(it.sub || '')}</span></span><kbd>↵</kbd></li>`;
    }).join('');
    input.setAttribute('aria-activedescendant', `pal-${sel}`);
  }
  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    list.querySelectorAll('.pal__item').forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.i) === sel)));
    list.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `pal-${sel}`);
  }
  function go(i) {
    const it = results[i];
    if (!it) return;
    close();
    const a = document.createElement('a');
    a.href = it.url;
    a.dataset.wipe = it.title;
    document.body.append(a);
    a.click(); // 交给页面转场处理
    a.remove();
  }
  function open() {
    if (!el.hidden) return;
    back = document.activeElement;
    el.hidden = false;
    input.value = '';
    sel = 0;
    draw();
    requestAnimationFrame(() => el.classList.add('is-open'));
    input.focus();
    document.body.style.overflow = 'hidden';
  }
  function close() {
    el.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { el.hidden = true; }, 200);
    back?.focus?.();
  }
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('.pal__item'); if (li) go(Number(li.dataset.i)); });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('.pal__item');
    if (li && Number(li.dataset.i) !== sel) { sel = Number(li.dataset.i); move(0); }
  });
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el.hidden ? open() : close(); return; }
    if (e.key === '/' && el.hidden && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); open(); return; }
    if (e.key === 'Escape' && !el.hidden) close();
  });
  return { open };
}
