// admin/js/fields.js — 根据 schema.js 生成表单。
// 每个控件直接修改传入的对象（obj[key] = value），然后调用 ctx.onChange()。
//
// ctx 需要提供：
//   data, onChange(field, obj), rerender(), toast(msg, kind)
//   canUpload(), upload(file) -> Promise<path>, preview(path) -> Promise<url>, previewFallback(path) -> url|null
//   validateSlug(value, obj) -> 错误文字|null, onSlugChange(old, next)

import { esc, parseBili, biliSrc, isPdf } from '../../assets/js/core.js';
import { md } from '../../assets/js/md.js';

export const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
export function set(o, k, v) {
  const ps = k.split('.');
  let a = o;
  for (const p of ps.slice(0, -1)) a = a[p] ?? (a[p] = {});
  a[ps[ps.length - 1]] = v;
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const OPEN = new WeakMap(); // 列表项的展开状态
let seq = 0;

export function renderForm(schema, obj, ctx) {
  const form = h('div', { class: 'form' });
  for (const f of schema) {
    if (f.when && !f.when(obj, ctx)) continue;
    if (f.type === 'section') { form.append(h('h3', { class: 'form__sec' }, f.label)); continue; }
    form.append(field(f, obj, ctx));
  }
  return form;
}

function field(f, obj, ctx) {
  const id = `f${++seq}`;
  const label = typeof f.label === 'function' ? f.label(obj) : f.label;
  const help = typeof f.help === 'function' ? f.help(obj) : f.help;
  const commit = (v) => {
    set(obj, f.key, v);
    ctx.onChange(f, obj);
    if (f.rerender) ctx.rerender();
  };
  const make = CONTROLS[f.type] || CONTROLS.text;
  const control = make({ f, id, val: get(obj, f.key), obj, ctx, commit, label });
  const wrap = h('div', { class: `field field--${f.type}${f.wide ? ' is-wide' : ''}` });
  if (f.type === 'toggle') wrap.append(control);
  else if (f.type === 'list') wrap.append(h('div', { class: 'field__label' }, label), control);
  else wrap.append(h('label', { class: 'field__label', for: id }, label), control);
  if (help) wrap.append(h('p', { class: 'field__help', html: help }));
  return wrap;
}

const btn = (text, title, onclick, cls = 'btn btn--sm') => h('button', { type: 'button', class: cls, title, 'aria-label': title, onclick }, text);

/* ---------------- 媒体（图片 / 文件） ---------------- */

function mediaField({ f, id, val, ctx, commit }, kind) {
  const accept = f.accept || (kind === 'image' ? 'image/*' : '*/*');
  const thumb = h('div', { class: 'media__thumb' });
  const status = h('span', { class: 'media__status' });
  const input = h('input', {
    id, class: 'input input--mono', value: val || '', placeholder: 'uploads/… 或 https://…',
    onchange: (e) => { commit(e.target.value.trim()); paint(); },
  });
  const fileIn = h('input', { type: 'file', accept, hidden: true, onchange: (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) doUpload(file); } });
  const upBtn = btn(kind === 'image' ? '上传图片' : '上传文件', '从电脑选择文件', () => fileIn.click());
  upBtn.disabled = !ctx.canUpload();
  const clrBtn = btn('移除', '清空这个字段', () => { input.value = ''; commit(''); paint(); }, 'btn btn--sm btn--ghost');
  const wrap = h('div', { class: 'media' }, thumb, h('div', { class: 'media__side' }, input, h('div', { class: 'row' }, upBtn, clrBtn, status), fileIn));

  async function doUpload(file) {
    status.textContent = '上传中…';
    upBtn.disabled = true;
    wrap.classList.add('is-busy');
    try {
      const path = await ctx.upload(file);
      input.value = path;
      status.textContent = '已上传';
      commit(path);
      paint();
    } catch (err) {
      status.textContent = '';
      ctx.toast(err.message, 'error');
    } finally {
      upBtn.disabled = !ctx.canUpload();
      wrap.classList.remove('is-busy');
    }
  }

  async function paint() {
    const p = input.value.trim();
    thumb.replaceChildren();
    if (!p) { thumb.append(h('span', { class: 'muted' }, '空')); return; }
    if (isPdf(p)) { thumb.append(h('span', { class: 'media__doc' }, 'PDF')); return; }
    if (kind === 'file' && !/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(p)) { thumb.append(h('span', { class: 'media__doc' }, '文件')); return; }
    const img = h('img', { alt: '' });
    let triedFallback = false;
    img.onerror = () => {
      const alt = !triedFallback && ctx.previewFallback(p);
      triedFallback = true;
      if (alt) img.src = alt;
      else thumb.replaceChildren(h('span', { class: 'muted', title: '文件可能还没部署，或路径有误' }, '无法预览'));
    };
    thumb.append(img);
    img.src = await ctx.preview(p);
  }

  wrap.addEventListener('dragover', (e) => { if (ctx.canUpload()) { e.preventDefault(); wrap.classList.add('is-drop'); } });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('is-drop'));
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('is-drop');
    const file = e.dataTransfer.files[0];
    if (file && ctx.canUpload()) doUpload(file);
  });
  wrap.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files || [])][0];
    if (file && ctx.canUpload()) { e.preventDefault(); doUpload(file); }
  });
  if (!ctx.canUpload()) status.textContent = '当前连接方式不能上传，请手动填写路径';
  paint();
  return wrap;
}

/* ---------------- 控件 ---------------- */

const CONTROLS = {
  text: ({ f, id, val, commit }) => h('input', {
    id, class: 'input', type: 'text', value: val ?? '', placeholder: f.placeholder || '',
    oninput: (e) => commit(e.target.value),
  }),

  textarea: ({ f, id, val, commit }) => h('textarea', {
    id, class: 'input', rows: String(f.rows || 3), value: val ?? '', placeholder: f.placeholder || '',
    oninput: (e) => commit(e.target.value),
  }),

  number: ({ f, id, val, commit }) => h('input', {
    id, class: 'input input--narrow', type: 'number', value: val ?? '', min: f.min, max: f.max,
    oninput: (e) => commit(e.target.value === '' ? '' : Number(e.target.value)),
  }),

  month: ({ id, val, commit }) => h('input', {
    id, class: 'input', type: 'month', value: val || '', placeholder: 'YYYY-MM',
    onchange: (e) => commit(e.target.value.trim()),
  }),

  select: ({ f, id, val, ctx, commit }) => {
    const options = typeof f.options === 'function' ? f.options(ctx) : f.options;
    const sel = h('select', { id, class: 'input', onchange: (e) => commit(e.target.value) },
      options.map(([v, l]) => h('option', { value: v }, l)));
    sel.value = val ?? '';
    return sel;
  },

  toggle: ({ id, val, commit, label }) => h('label', { class: 'toggle', for: id },
    h('input', { id, type: 'checkbox', checked: !!val, onchange: (e) => commit(e.target.checked) }),
    h('span', { class: 'toggle__ui', 'aria-hidden': 'true' }),
    h('span', { class: 'toggle__label' }, label)),

  color: ({ id, val, commit }) => {
    const txt = h('input', { class: 'input input--mono input--narrow', value: val || '', 'aria-label': '色值',
      oninput: (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { pick.value = e.target.value; commit(e.target.value); } } });
    const pick = h('input', { id, type: 'color', class: 'color', value: val || '#2e6b55',
      oninput: (e) => { txt.value = e.target.value; commit(e.target.value); } });
    return h('div', { class: 'row' }, pick, txt);
  },

  slug: ({ id, val, obj, ctx, commit }) => {
    const err = h('p', { class: 'field__err' });
    const clean = (s) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const input = h('input', {
      id, class: 'input input--mono', value: val || '',
      onchange: (e) => {
        const old = obj.id;
        const v = clean(e.target.value);
        const msg = !v ? '网址 ID 不能为空，且只能包含小写字母、数字和短横线。' : ctx.validateSlug?.(v, obj);
        if (msg) { err.textContent = msg; e.target.value = old; return; }
        err.textContent = '';
        e.target.value = v;
        if (v !== old) { commit(v); ctx.onSlugChange?.(old, v); }
      },
    });
    return h('div', {}, input, err);
  },

  tags: ({ f, id, val, commit }) => {
    const list = Array.isArray(val) ? [...val] : [];
    const input = h('input', { id, class: 'tags__input', placeholder: f.placeholder || '输入后按回车' });
    const box = h('div', { class: 'tags', onclick: (e) => { if (e.target === box) input.focus(); } });
    const draw = () => {
      box.querySelectorAll('.tag').forEach((n) => n.remove());
      list.forEach((t, i) => box.insertBefore(h('span', { class: 'tag' }, t,
        h('button', { type: 'button', 'aria-label': `删除 ${t}`, onclick: () => { list.splice(i, 1); commit([...list]); draw(); } }, '×')), input));
    };
    const add = () => {
      const parts = input.value.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return;
      parts.forEach((p) => { if (!list.includes(p)) list.push(p); });
      input.value = '';
      commit([...list]);
      draw();
    };
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 中文输入法选词中
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); commit([...list]); draw(); }
    });
    input.addEventListener('blur', add);
    box.append(input);
    draw();
    return box;
  },

  lines: ({ id, val, commit }) => h('textarea', {
    id, class: 'input', rows: '4', value: (val || []).join('\n'),
    oninput: (e) => commit(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)),
  }),

  image: (a) => mediaField(a, 'image'),
  file: (a) => mediaField(a, 'file'),

  markdown: ({ f, id, val, ctx, commit }) => {
    const ta = h('textarea', { id, class: 'input input--md', rows: String(f.rows || 8), value: val || '' });
    const pv = h('div', { class: 'md-preview prose', hidden: true });
    const fire = () => ta.dispatchEvent(new Event('input'));
    const paintPv = () => {
      pv.innerHTML = md(ta.value, { base: '../' }) || '<p class="muted">还没有内容</p>';
      pv.querySelectorAll('img').forEach(async (img) => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('../')) {
          const path = src.slice(3);
          img.onerror = () => { const alt = ctx.previewFallback(path); if (alt && img.src !== alt) img.src = alt; };
          img.src = await ctx.preview(path);
        }
      });
    };
    ta.addEventListener('input', () => { commit(ta.value); if (!pv.hidden) paintPv(); });

    const wrapSel = (before, after, placeholder) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || placeholder;
      ta.setRangeText(before + sel + after, s, e, 'end');
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
      ta.focus();
      fire();
    };
    const linePrefix = (prefix) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      ta.setRangeText(value.slice(ls, e).split('\n').map((l) => prefix + l).join('\n'), ls, e, 'end');
      ta.focus();
      fire();
    };
    const insertBlock = (text) => {
      const { selectionStart: s, value } = ta;
      const before = value.slice(0, s);
      const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      ta.setRangeText(`${pre}${text}\n`, s, ta.selectionEnd, 'end');
      ta.focus();
      fire();
    };
    const fileIn = h('input', {
      type: 'file', accept: 'image/*', hidden: true,
      onchange: async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        ctx.toast('正在上传图片…');
        try { insertBlock(`![图片说明](${await ctx.upload(file)})`); } catch (err) { ctx.toast(err.message, 'error'); }
      },
    });
    const pvBtn = btn('预览', '切换编辑和预览', () => {
      const showPv = pv.hidden;
      pv.hidden = !showPv;
      ta.hidden = showPv;
      pvBtn.textContent = showPv ? '继续编辑' : '预览';
      pvBtn.classList.toggle('is-on', showPv);
      if (showPv) paintPv();
    }, 'btn btn--sm md-toolbar__pv');
    const tb = h('div', { class: 'md-toolbar' },
      btn(h('b', {}, 'B'), '粗体（Ctrl/⌘+B）', () => wrapSel('**', '**', '粗体文字'), 'tb'),
      btn(h('i', {}, 'I'), '斜体（Ctrl/⌘+I）', () => wrapSel('*', '*', '斜体文字'), 'tb'),
      btn('小标题', '插入小标题', () => linePrefix('## '), 'tb'),
      btn('引用', '引用', () => linePrefix('> '), 'tb'),
      btn('列表', '列表', () => linePrefix('- '), 'tb'),
      btn('链接', '插入链接', () => { const url = prompt('链接地址', 'https://'); if (url) wrapSel('[', `](${url})`, '链接文字'); }, 'tb'),
      btn('图片', '上传并插入图片', () => {
        if (ctx.canUpload()) fileIn.click();
        else { const p = prompt('图片路径（uploads/… 或 https://…）'); if (p) insertBlock(`![图片说明](${p.trim()})`); }
      }, 'tb'),
      btn('B站视频', '在正文中插入 B 站播放器', () => {
        const v = prompt('粘贴 B 站视频链接或 BV 号');
        if (!v) return;
        const p = parseBili(v);
        if (p) insertBlock(`@[bilibili](${p.bvid || `av${p.aid}`}${p.page > 1 ? `?p=${p.page}` : ''})`);
        else ctx.toast('没有识别出 BV 号或 av 号', 'error');
      }, 'tb'),
      h('span', { class: 'md-toolbar__sp' }),
      pvBtn, fileIn);
    ta.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'b') { e.preventDefault(); wrapSel('**', '**', '粗体文字'); }
      if (e.key === 'i') { e.preventDefault(); wrapSel('*', '*', '斜体文字'); }
    });
    return h('div', { class: 'md' }, tb, ta, pv);
  },

  bilibili: ({ f, id, val, obj, commit }) => {
    const v = val && typeof val === 'object' ? val : {};
    const status = h('p', { class: 'field__help' });
    const frame = h('div', { class: 'bili-pv' });
    const describe = (raw) => {
      const p = parseBili(raw);
      if (p) {
        status.className = 'field__help is-ok';
        status.innerHTML = `已识别视频 <b>${esc(p.bvid || `av${p.aid}`)}</b>${p.cid ? '（含嵌入代码里的 cid）' : ''}`;
      } else {
        status.className = `field__help${raw.trim() ? ' is-err' : ''}`;
        status.textContent = !raw.trim() ? '还没有填写视频。'
          : /b23\.tv/i.test(raw) ? 'b23.tv 短链接无法识别：请在浏览器里打开它，再复制地址栏中的完整链接。'
            : '没有找到 BV 号或 av 号。';
      }
      return p;
    };
    const input = h('textarea', {
      id, class: 'input input--mono', rows: '2', value: v.input || v.bvid || (v.aid ? `av${v.aid}` : ''),
      placeholder: '粘贴视频页链接、BV 号，或 B 站「分享 → 嵌入代码」里的整段 <iframe>',
      oninput: (e) => {
        const raw = e.target.value;
        const p = describe(raw);
        frame.replaceChildren();
        if (p) { page.value = p.page; commit({ input: raw.trim(), ...p }); } else commit({ input: raw.trim() });
      },
    });
    const page = h('input', {
      class: 'input input--narrow', type: 'number', min: '1', value: v.page || 1, 'aria-label': '分P',
      oninput: (e) => commit({ ...(get(obj, f.key) || {}), page: Number(e.target.value) || 1 }),
    });
    const pvBtn = btn('预览播放器', '加载 B 站播放器预览', () => {
      const src = biliSrc(get(obj, f.key));
      frame.innerHTML = src ? `<div class="bili"><iframe src="${esc(src)}" scrolling="no" frameborder="0" allow="fullscreen" allowfullscreen></iframe></div>` : '';
      if (!src) status.textContent = '先填写一个有效的视频地址。';
    });
    describe(input.value);
    return h('div', { class: 'bili-field' }, input,
      h('div', { class: 'row' }, h('label', { class: 'inline' }, '第', page, 'P'), pvBtn), status, frame);
  },

  list: ({ f, val, obj, ctx, commit }) => {
    const arr = Array.isArray(val) ? val : [];
    if (!Array.isArray(val)) set(obj, f.key, arr);
    const box = h('div', { class: 'glist' });
    const changed = () => { commit(arr); draw(); };
    function draw() {
      box.replaceChildren();
      arr.forEach((item, i) => {
        const open = OPEN.get(item) || false;
        const title = h('span', { class: 'glist__title' });
        const pv = h('span', { class: 'glist__pv' });
        const refresh = () => {
          title.textContent = f.itemLabel ? f.itemLabel(item, i) : `第 ${i + 1} 项`;
          if (f.itemPreview) pv.innerHTML = f.itemPreview(item);
        };
        refresh();
        const head = h('div', { class: 'glist__head' },
          h('button', { type: 'button', class: 'glist__toggle', 'aria-expanded': String(open), onclick: () => { OPEN.set(item, !open); draw(); } },
            h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'), title),
          pv,
          h('span', { class: 'glist__acts' },
            Object.assign(btn('↑', '上移', () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); }, 'ib'), { disabled: i === 0 }),
            Object.assign(btn('↓', '下移', () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); }, 'ib'), { disabled: i === arr.length - 1 }),
            btn('✕', '删除', () => { if (confirm(`确定删除「${title.textContent}」？`)) { arr.splice(i, 1); changed(); } }, 'ib ib--danger')));
        const body = open ? renderForm(f.fields, item, {
          ...ctx,
          onChange: (ff, o) => { ctx.onChange(ff, o); refresh(); },
          rerender: draw,
        }) : null;
        box.append(h('div', { class: `glist__item${open ? ' is-open' : ''}` }, head, body));
      });
      box.append(btn('+ 添加', '添加一项', () => {
        const it = f.newItem ? f.newItem() : {};
        arr.push(it);
        OPEN.set(it, true);
        changed();
      }, 'btn btn--sm btn--dashed'));
    }
    draw();
    return box;
  },
};
