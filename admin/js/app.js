// admin/js/app.js — 后台主程序
//
// 流程：连接（GitHub / 本地文件夹 / 仅浏览器）→ 读取 content/site.json → 在内存里编辑 state.data
//      → 每次修改都写入 localStorage 的 cms:draft（防丢失，也供前台 ?preview 预览）
//      → 点「发布」时把整个 JSON 写回 content/site.json。

import { normalize, esc, fmtDate, fmtRange, TYPES, SCOPES, assetUrl } from '../../assets/js/core.js';
import { GitHubAdapter, LocalAdapter, OfflineAdapter } from './adapters.js';
import { WORK, HONOR, EXPERIENCE, PROFILE, SITE, blank } from './schema.js';
import { renderForm, h } from './fields.js';

const $ = (s, r = document) => r.querySelector(s);
const LS = { conn: 'cms:conn', token: 'cms:token', draft: 'cms:draft' };
const store = {
  get(k, session = false) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  set(k, v, session = false) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch { /* 存储已满或被禁用 */ } },
  del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* 同上 */ } },
};

const state = {
  adapter: null,
  data: null,
  dirty: false,
  saving: false,
  view: 'works',
  sel: {},
  q: {},
  loadedMeta: null,
  blobs: {},
};

const SAVE_TEXT = { github: '发布到网站', local: '保存到文件夹', offline: '下载 site.json' };
const SAVED_MSG = {
  github: '已发布。GitHub Pages 一般 1 分钟左右更新，之后刷新网站就能看到。',
  local: '已保存到本地文件夹。用 Git 提交并推送后，网站才会更新。',
  offline: '已下载 site.json。用它替换仓库里的 content/site.json，再推送到 GitHub。',
};

/* ---------------- 通用 ---------------- */

function toast(msg, kind = 'info', ms = 4200) {
  const t = h('div', { class: `toast toast--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms);
}

let draftTimer = 0;
function writeDraft() {
  clearTimeout(draftTimer);
  if (!state.data) return;
  store.set(LS.draft, JSON.stringify({ data: state.data, savedAt: Date.now(), dirty: state.dirty, base: state.baseVersion }));
}
const scheduleDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(writeDraft, 350); };

let listTimer = 0;
function markDirty() {
  state.dirty = true;
  updateBar();
  scheduleDraft();
  clearTimeout(listTimer);
  listTimer = setTimeout(() => state.repaintList?.(), 250);
}

function updateBar() {
  const s = $('#dirty-state');
  s.textContent = state.dirty ? '有未发布的修改' : '所有修改都已发布';
  s.classList.toggle('is-dirty', state.dirty);
  const b = $('#save-btn');
  b.textContent = state.saving ? '处理中…' : SAVE_TEXT[state.adapter?.mode] || '发布';
  b.disabled = state.saving;
}

function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------- 上传与预览 ---------------- */

function slugify(name) {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'file';
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };

// 大图压缩：长边不超过 2400px；能编码 WebP 就用 WebP（支持透明），否则用 JPEG
async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !('createImageBitmap' in window)) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900 * 1024) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  const toBlob = (type, q) => new Promise((r) => c.toBlob(r, type, q));
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let out = await toBlob('image/webp', 0.86);
  if (!out || out.type !== 'image/webp') {
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    out = await toBlob('image/jpeg', 0.86);
  }
  return out && out.size < file.size ? out : file;
}

async function upload(file) {
  const a = state.adapter;
  if (!a || !a.canUpload) throw new Error('当前连接方式不能上传。请把文件放进 uploads/ 文件夹后手动填写路径。');
  const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
  if (blob.size > 25 * 1024 * 1024) throw new Error('文件超过 25MB。视频请上传到 B 站，大文件请先压缩。');
  const ext = EXT[blob.type] || (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'bin').toLowerCase();
  const d = new Date();
  const path = `uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${slugify(file.name)}-${Date.now().toString(36)}.${ext}`;
  await a.writeFile(path, blob, `cms: 上传 ${path}`);
  state.blobs[path] = URL.createObjectURL(blob);
  toast(`已上传 ${file.name}`, 'ok', 2500);
  return path;
}

async function preview(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path) || path.startsWith('//')) return path;
  if (state.blobs[path]) return state.blobs[path];
  if (state.adapter?.previewUrl) {
    const u = await state.adapter.previewUrl(path);
    if (u) return (state.blobs[path] = u);
  }
  return assetUrl(path, '../');
}
const previewFallback = (path) => state.adapter?.fallbackUrl?.(path) || null;

/* ---------------- 表单上下文 ---------------- */

function makeCtx(redraw) {
  return {
    data: state.data,
    onChange: markDirty,
    rerender: redraw,
    toast,
    canUpload: () => !!state.adapter?.canUpload,
    upload,
    preview,
    previewFallback,
    validateSlug: (v, obj) => (state.data.works.some((w) => w !== obj && w.id === v) ? '这个网址 ID 已被另一件作品使用。' : null),
    onSlugChange: (old, next) => {
      state.data.honors.forEach((x) => { if (x.workId === old) x.workId = next; });
      if (state.sel.works === old) state.sel.works = next;
    },
  };
}

/* ---------------- 视图：列表 + 编辑 ---------------- */

const COLLECTIONS = {
  works: {
    title: '作品',
    schema: WORK,
    label: (w) => w.title || '未命名作品',
    sub: (w) => [TYPES[w.type]?.label, w.category, fmtDate(w.date)].filter(Boolean).join(' · '),
    thumb: (w) => w.cover,
    flags: (w) => [
      w.awards.some((a) => a.showTag) && ['获奖', 'gold'],
      w.featured && ['首页', 'accent'],
      w.hidden && ['隐藏', 'muted'],
    ].filter(Boolean),
    create: [['video', '视频'], ['article', '图文'], ['text', '文本']],
    make: (t) => blank.work(t),
    dateKey: 'date',
    previewUrl: (w) => `../work.html?id=${encodeURIComponent(w.id)}&preview=1`,
    search: (w) => [w.title, w.category, ...w.tags].join(' '),
  },
  honors: {
    title: '荣誉奖项',
    schema: HONOR,
    note: '这里放奖学金、荣誉称号等不属于某件作品的荣誉。作品获得的奖项请在「作品」里填写，会自动汇总到网站的荣誉墙（可在「网站设置」里关闭）。',
    label: (x) => [x.level, x.name].filter(Boolean).join(' ') || '未命名荣誉',
    sub: (x) => [x.rank, fmtDate(x.date)].filter(Boolean).join(' · '),
    flags: (x) => [x.hidden && ['隐藏', 'muted']].filter(Boolean),
    create: [[null, '新增荣誉']],
    make: () => blank.honor(),
    dateKey: 'date',
    search: (x) => [x.name, x.level, x.issuer].join(' '),
  },
  experiences: {
    title: '实践经历',
    schema: EXPERIENCE,
    label: (e) => e.role || e.org || '未命名经历',
    sub: (e) => [SCOPES[e.scope], e.org, fmtRange(e.start, e.end)].filter(Boolean).join(' · '),
    flags: (e) => [e.hidden && ['隐藏', 'muted']].filter(Boolean),
    create: [[null, '新增经历']],
    make: () => blank.experience(),
    dateKey: 'start',
    search: (e) => [e.role, e.org, e.summary].join(' '),
  },
};

function drawCollection(key) {
  const cfg = COLLECTIONS[key];
  const items = state.data[key];
  const sel = items.find((x) => x.id === state.sel[key]) || null;
  const root = h('div', { class: `split${sel ? ' has-sel' : ''}` });

  const ul = h('ul', { class: 'items', role: 'list' });
  const paintList = () => {
    const q = (state.q[key] || '').trim().toLowerCase();
    ul.replaceChildren();
    items.forEach((it, i) => {
      if (q && !cfg.search(it).toLowerCase().includes(q)) return;
      const thumb = cfg.thumb ? h('span', { class: 'item__thumb' }) : null;
      if (thumb && cfg.thumb(it)) {
        const img = h('img', { alt: '' });
        img.onerror = () => { const alt = previewFallback(cfg.thumb(it)); if (alt && img.src !== alt) img.src = alt; else img.remove(); };
        preview(cfg.thumb(it)).then((u) => { img.src = u; });
        thumb.append(img);
      } else if (thumb) {
        thumb.textContent = TYPES[it.type]?.label || '';
      }
      const move = (d) => (e) => {
        e.stopPropagation();
        const j = i + d;
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        markDirty();
        paintList();
      };
      ul.append(h('li', { class: `item${it === sel ? ' is-sel' : ''}` },
        h('button', { type: 'button', class: 'item__main', onclick: () => { state.sel[key] = it.id; drawView(); } },
          thumb,
          h('span', { class: 'item__txt' },
            h('span', { class: 'item__title' }, cfg.label(it)),
            h('span', { class: 'item__sub' }, cfg.sub(it) || ' '),
            h('span', { class: 'item__flags' }, cfg.flags(it).map(([t, c]) => h('span', { class: `flag flag--${c}` }, t))))),
        h('span', { class: 'item__move' },
          Object.assign(h('button', { type: 'button', class: 'ib', title: '上移', 'aria-label': '上移', onclick: move(-1) }, '↑'), { disabled: i === 0 }),
          Object.assign(h('button', { type: 'button', class: 'ib', title: '下移', 'aria-label': '下移', onclick: move(1) }, '↓'), { disabled: i === items.length - 1 }))));
    });
    if (!ul.children.length) ul.append(h('li', { class: 'items__empty' }, items.length ? '没有匹配的条目' : '还没有内容，点上面的按钮新建一条。'));
  };
  state.repaintList = paintList;

  const listPane = h('section', { class: 'list', 'aria-label': `${cfg.title}列表` },
    h('div', { class: 'list__create' }, cfg.create.map(([t, l]) => h('button', {
      type: 'button', class: 'btn btn--sm',
      onclick: () => {
        const it = cfg.make(t);
        items.unshift(it);
        state.sel[key] = it.id;
        markDirty();
        drawView();
        setTimeout(() => $('.editor input')?.focus(), 0);
      },
    }, `+ ${l}`))),
    h('input', { class: 'input', type: 'search', placeholder: '搜索', 'aria-label': '搜索', value: state.q[key] || '',
      oninput: (e) => { state.q[key] = e.target.value; paintList(); } }),
    ul,
    items.length > 1 ? h('button', {
      type: 'button', class: 'btn btn--sm btn--ghost list__sort',
      onclick: () => {
        items.sort((a, b) => String(b[cfg.dateKey]).localeCompare(String(a[cfg.dateKey])));
        markDirty();
        paintList();
        toast('已按时间从新到旧排序，网站上的显示顺序也会随之改变。');
      },
    }, '按时间从新到旧排序') : null);
  paintList();

  const ed = h('section', { class: 'editor', 'aria-label': '编辑' });
  if (sel) {
    const titleEl = h('h2', {}, cfg.label(sel));
    const redraw = () => {
      const y = $('#view').scrollTop;
      drawView();
      $('#view').scrollTop = y;
    };
    const ctx = makeCtx(redraw);
    const baseChange = ctx.onChange;
    ctx.onChange = (f, o) => { baseChange(f, o); titleEl.textContent = cfg.label(sel); };
    ed.append(
      h('div', { class: 'editor__hd' },
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost editor__back', onclick: () => { state.sel[key] = null; drawView(); } }, '返回列表'),
        titleEl,
        h('div', { class: 'editor__acts' },
          cfg.previewUrl ? h('a', { class: 'btn btn--sm btn--ghost', href: cfg.previewUrl(sel), target: '_blank', rel: 'noopener', onclick: writeDraft }, '在网站上预览') : null,
          h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: () => {
            const copy = normalize({ [key]: [JSON.parse(JSON.stringify(sel))] })[key][0];
            copy.id = cfg.make(sel.type).id;
            if ('title' in copy) copy.title = `${copy.title}（副本）`;
            items.splice(items.indexOf(sel) + 1, 0, copy);
            state.sel[key] = copy.id;
            markDirty();
            drawView();
          } }, '复制'),
          h('button', { type: 'button', class: 'btn btn--sm btn--danger', onclick: () => {
            if (!confirm(`确定删除「${cfg.label(sel)}」？发布后网站上也会删除。`)) return;
            items.splice(items.indexOf(sel), 1);
            if (key === 'works') state.data.honors.forEach((x) => { if (x.workId === sel.id) x.workId = ''; });
            state.sel[key] = null;
            markDirty();
            drawView();
          } }, '删除'))),
      renderForm(cfg.schema, sel, ctx));
  } else {
    ed.append(h('div', { class: 'editor__empty' },
      cfg.note ? h('p', {}, cfg.note) : null,
      h('p', {}, items.length ? '在左侧选择一条进行编辑。' : '还没有内容。')));
  }
  root.append(listPane, ed);
  return root;
}

function drawSingle(schema, obj, intro) {
  const box = h('div', { class: 'single' });
  const redraw = () => { const y = $('#view').scrollTop; drawView(); $('#view').scrollTop = y; };
  if (intro) box.append(h('p', { class: 'single__intro' }, intro));
  box.append(renderForm(schema, obj, makeCtx(redraw)));
  return box;
}

function drawData() {
  const a = state.adapter;
  const json = JSON.stringify(state.data, null, 2);
  const raw = h('textarea', { class: 'input input--mono raw', rows: '18', spellcheck: 'false', value: json });
  const importIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      state.data = normalize(JSON.parse(await f.text()));
      markDirty();
      drawView();
      toast('已导入。检查无误后点「发布」才会写入网站。', 'ok');
    } catch (err) { toast(`导入失败：${err.message}`, 'error'); }
  } });
  return h('div', { class: 'single' },
    h('section', { class: 'panel' },
      h('h3', {}, '当前连接'),
      h('p', {}, a.label),
      a.mode === 'offline' ? h('p', { class: 'muted' }, '这种方式不能上传图片，也不能直接发布。推荐使用 GitHub 连接。') : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => showConnect() }, '更换连接方式'),
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: async () => {
          if (state.dirty && !confirm('重新载入会丢弃所有未发布的修改，确定继续？')) return;
          try { await openWith(a, { skipDraft: true }); toast('已载入线上内容。', 'ok'); } catch (err) { toast(err.message, 'error'); }
        } }, '重新载入线上内容'),
        a.mode === 'github' ? h('button', { type: 'button', class: 'btn btn--sm btn--danger', onclick: () => {
          store.del(LS.token);
          toast('已从这个浏览器清除 Token。');
          showConnect();
        } }, '退出并清除 Token') : null)),
    h('section', { class: 'panel' },
      h('h3', {}, '备份与迁移'),
      h('p', { class: 'muted' }, '导出的文件就是网站的全部文字内容（图片在 uploads/ 文件夹里）。'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => download(`site-${new Date().toISOString().slice(0, 10)}.json`, json) }, '导出 JSON'),
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => importIn.click() }, '导入 JSON'),
        h('button', { type: 'button', class: 'btn btn--sm btn--danger', onclick: () => {
          if (!confirm('清空全部作品、荣誉和经历？个人介绍和网站设置会保留。发布前都可以用「重新载入线上内容」撤销。')) return;
          Object.assign(state.data, { works: [], honors: [], experiences: [] });
          state.sel = {};
          markDirty();
          drawView();
        } }, '清空示例内容'),
        importIn)),
    h('section', { class: 'panel' },
      h('h3', {}, '直接编辑 JSON'),
      h('p', { class: 'muted' }, '适合批量修改。点「应用」后会检查格式，再点「发布」才会写入网站。'),
      raw,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--sm', onclick: () => {
        try {
          state.data = normalize(JSON.parse(raw.value));
          markDirty();
          drawView();
          toast('已应用。', 'ok');
        } catch (err) { toast(`JSON 格式有误：${err.message}`, 'error', 7000); }
      } }, '应用'))));
}

const VIEWS = {
  works: { title: '作品', draw: () => drawCollection('works') },
  honors: { title: '荣誉奖项', draw: () => drawCollection('honors') },
  experiences: { title: '实践经历', draw: () => drawCollection('experiences') },
  profile: { title: '个人介绍', draw: () => drawSingle(PROFILE, state.data.profile, '这些内容显示在首页顶部、「关于我」和「联系我」中。') },
  site: { title: '网站设置', draw: () => drawSingle(SITE, state.data.site) },
  data: { title: '连接与数据', draw: drawData },
};

function drawView() {
  const v = VIEWS[state.view] ? state.view : 'works';
  state.repaintList = null;
  document.querySelectorAll('#nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false'));
  $('#view-title').textContent = VIEWS[v].title;
  $('#view').replaceChildren(VIEWS[v].draw());
  $('#conn').textContent = state.adapter?.label || '';
  updateBar();
}

/* ---------------- 发布 ---------------- */

// 把网站标题与描述同步进 index.html，让微信 / 搜索引擎在不执行 JS 时也能拿到
async function syncStaticMeta() {
  const { title, description } = state.data.site;
  const m = state.loadedMeta || {};
  if (state.adapter.mode === 'offline' || (title === m.title && description === m.description)) return;
  try {
    const html = await state.adapter.readText('index.html');
    const block = `<!-- cms:meta:start -->
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <!-- cms:meta:end -->`;
    const next = html.replace(/<!-- cms:meta:start -->[\s\S]*?<!-- cms:meta:end -->/, block);
    if (next !== html) await state.adapter.writeText('index.html', next, 'cms: 同步首页标题与描述');
    state.loadedMeta = { title, description };
  } catch (err) {
    toast(`内容已发布，但同步 index.html 的标题失败：${err.message}`, 'warn', 7000);
  }
}

async function save() {
  if (!state.adapter || state.saving) return;
  state.saving = true;
  updateBar();
  try {
    const out = JSON.parse(JSON.stringify(state.data));
    out.updatedAt = new Date().toISOString();
    await state.adapter.writeText('content/site.json', `${JSON.stringify(out, null, 2)}\n`, 'cms: 更新网站内容');
    state.data.updatedAt = out.updatedAt;
    state.baseVersion = out.updatedAt;
    await syncStaticMeta();
    state.dirty = false;
    writeDraft();
    toast(SAVED_MSG[state.adapter.mode], 'ok', 6000);
  } catch (err) {
    toast(`没有发布成功：${err.message}`, 'error', 9000);
  } finally {
    state.saving = false;
    updateBar();
  }
}

/* ---------------- 连接 ---------------- */

function guessRepo() {
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return {};
  const owner = host.split('.')[0];
  const first = location.pathname.split('/').filter(Boolean)[0];
  return { owner, repo: first && first !== 'admin' ? first : `${owner}.github.io` };
}

async function openWith(adapter, { skipDraft = false } = {}) {
  await adapter.connect();
  const text = await adapter.readText('content/site.json');
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`content/site.json 不是有效的 JSON：${e.message}`); }
  state.adapter = adapter;
  state.data = normalize(raw);
  state.baseVersion = state.data.updatedAt;
  state.loadedMeta = { title: state.data.site.title, description: state.data.site.description };
  state.dirty = false;
  state.sel = {};

  if (!skipDraft) {
    let draft = null;
    try { draft = JSON.parse(store.get(LS.draft) || 'null'); } catch { /* 草稿损坏 */ }
    if (draft?.dirty && draft.data) {
      const when = new Date(draft.savedAt).toLocaleString('zh-CN');
      const stale = draft.base !== state.baseVersion;
      const msg = `发现 ${when} 未发布的修改，要恢复吗？${stale ? '\n\n注意：线上内容在那之后有过更新，恢复后发布会覆盖那些更新。' : ''}`;
      if (confirm(msg)) {
        state.data = normalize(draft.data);
        state.dirty = true;
      }
    }
  }
  writeDraft();
  $('#connect').hidden = true;
  $('#app').hidden = false;
  drawView();
}

function showConnect(error = '') {
  const conn = JSON.parse(store.get(LS.conn) || '{}');
  const g = { ...guessRepo(), ...conn.github };
  const box = $('#connect');
  const err = h('p', { class: 'connect__err', role: 'alert' }, error);
  const busy = (b, on, text) => { b.disabled = on; if (text) b.textContent = text; };

  const owner = h('input', { class: 'input', id: 'gh-owner', value: g.owner || '', placeholder: 'your-name', autocomplete: 'off' });
  const repo = h('input', { class: 'input', id: 'gh-repo', value: g.repo || '', placeholder: 'portfolio', autocomplete: 'off' });
  const branch = h('input', { class: 'input', id: 'gh-branch', value: g.branch || 'main', autocomplete: 'off' });
  const token = h('input', { class: 'input input--mono', id: 'gh-token', type: 'password', value: store.get(LS.token) || store.get(LS.token, true) || '', placeholder: 'github_pat_…', autocomplete: 'off' });
  const remember = h('input', { type: 'checkbox', id: 'gh-remember', checked: conn.remember !== false });
  const ghBtn = h('button', { type: 'submit', class: 'btn btn--primary' }, '连接 GitHub');

  const ghForm = h('form', { class: 'connect__card', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!owner.value.trim() || !repo.value.trim() || !token.value.trim()) { err.textContent = '请填写用户名、仓库名和 Token。'; return; }
    busy(ghBtn, true, '正在连接…');
    try {
      const info = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main' };
      await openWith(new GitHubAdapter({ ...info, token: token.value }));
      store.set(LS.conn, JSON.stringify({ mode: 'github', github: info, remember: remember.checked }));
      store.del(LS.token);
      store.set(LS.token, token.value.trim(), !remember.checked);
    } catch (ex) {
      err.textContent = ex.message;
    } finally { busy(ghBtn, false, '连接 GitHub'); }
  } },
    h('h2', {}, 'GitHub（推荐）'),
    h('p', { class: 'muted' }, '修改会直接提交到仓库，网站自动更新。可以在任何电脑上使用。'),
    h('div', { class: 'grid2' },
      h('label', { for: 'gh-owner' }, 'GitHub 用户名', owner),
      h('label', { for: 'gh-repo' }, '仓库名', repo)),
    h('label', { for: 'gh-branch' }, '分支', branch),
    h('label', { for: 'gh-token' }, '访问令牌（Token）', token),
    h('details', { class: 'howto' },
      h('summary', {}, '如何获取 Token'),
      h('ol', {},
        h('li', { html: '打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained token</a>。' }),
        h('li', {}, 'Repository access 选择 Only select repositories，只勾选这个作品集仓库。'),
        h('li', {}, 'Permissions 里把 Contents 设为 Read and write，其他保持默认。'),
        h('li', {}, '生成后复制以 github_pat_ 开头的字符串，粘贴到上面。'))),
    h('label', { class: 'check', for: 'gh-remember' }, remember, '在这台电脑上记住 Token（公用电脑请不要勾选）'),
    ghBtn);

  const canFS = 'showDirectoryPicker' in window;
  const localBtn = h('button', { type: 'button', class: 'btn', disabled: !canFS, onclick: async () => {
    err.textContent = '';
    try {
      const dir = await window.showDirectoryPicker({ id: 'portfolio', mode: 'readwrite' });
      busy(localBtn, true, '正在读取…');
      await openWith(new LocalAdapter(dir));
      store.set(LS.conn, JSON.stringify({ ...conn, mode: 'local' }));
    } catch (ex) {
      if (ex.name !== 'AbortError') err.textContent = ex.message;
    } finally { busy(localBtn, false, '选择项目文件夹'); }
  } }, '选择项目文件夹');

  const offBtn = h('button', { type: 'button', class: 'btn btn--ghost', onclick: async () => {
    err.textContent = '';
    try {
      await openWith(new OfflineAdapter());
      store.set(LS.conn, JSON.stringify({ ...conn, mode: 'offline' }));
    } catch (ex) { err.textContent = ex.message; }
  } }, '只在浏览器里编辑');

  box.replaceChildren(h('div', { class: 'connect__in' },
    h('header', { class: 'connect__hd' },
      h('h1', {}, '作品集后台'),
      h('p', { class: 'muted' }, '选择内容保存到哪里。')),
    err,
    h('div', { class: 'connect__cards' },
      ghForm,
      h('div', { class: 'connect__card' },
        h('h2', {}, '本地文件夹'),
        h('p', { class: 'muted' }, '直接读写电脑上的项目文件，改完用 Git 推送。适合在本地预览。'),
        h('p', { class: 'muted small' }, canFS ? '需要用 http://localhost 打开本页面。' : '当前浏览器不支持，请使用 Chrome 或 Edge。'),
        localBtn,
        h('hr'),
        h('h2', {}, '仅浏览器'),
        h('p', { class: 'muted' }, '不能上传图片，修改需要导出 site.json 后手动替换。'),
        offBtn))));
  $('#app').hidden = true;
  box.hidden = false;
}

/* ---------------- 启动 ---------------- */

async function boot() {
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    drawView();
    $('#view').scrollTop = 0;
  }));
  $('#save-btn').addEventListener('click', save);
  $('#preview-btn').addEventListener('click', writeDraft);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty && state.adapter?.mode !== 'offline') { writeDraft(); e.preventDefault(); e.returnValue = ''; }
  });

  const conn = JSON.parse(store.get(LS.conn) || '{}');
  const tok = store.get(LS.token) || store.get(LS.token, true);
  if (conn.mode === 'github' && conn.github && tok) {
    $('#connect').hidden = false;
    $('#connect').replaceChildren(h('p', { class: 'connect__loading' }, '正在连接 GitHub…'));
    try {
      await openWith(new GitHubAdapter({ ...conn.github, token: tok }));
      return;
    } catch (err) {
      showConnect(`自动连接失败：${err.message}`);
      return;
    }
  }
  if (conn.mode === 'offline') {
    try { await openWith(new OfflineAdapter()); return; } catch { /* 落到连接页 */ }
  }
  showConnect();
}

boot();
