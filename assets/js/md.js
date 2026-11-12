// assets/js/md.js — 无依赖的精简 Markdown 渲染器（前台与后台预览共用）
//
// 支持：# 标题、段落（单个换行 = 换行，适合诗歌/文案）、**粗体**、*斜体*、~~删除线~~、
// `代码`、```代码块```、> 引用、- 无序列表、1. 有序列表、--- 分隔线、[链接](url)、
// ![说明](图片路径)（独占一行时渲染为带说明的大图）、
// @[bilibili](BV号或链接)（独占一行，嵌入 B 站播放器）。
// 所有原始 HTML 都会被转义，不会执行。

import { esc, safeUrl, assetUrl, biliEmbed, parseBili } from './core.js';

const RE = {
  fence: /^```/,
  heading: /^(#{1,6})\s+(.*)$/,
  hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
  bili: /^@\[bilibili\]\(([^)]+)\)\s*$/i,
  figure: /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/,
  quote: /^>\s?/,
  ul: /^\s*[-*+]\s+/,
  ol: /^\s*\d+[.)]\s+/,
};
const isBlockStart = (l) => RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.bili.test(l)
  || RE.figure.test(l) || RE.quote.test(l) || RE.ul.test(l) || RE.ol.test(l);

export function md(src, opts = {}) {
  const base = opts.base || '';
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if (RE.fence.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    if ((m = line.match(RE.heading))) {
      const n = Math.min(m[1].length + 1, 6); // 正文里的 # 从 h2 开始，页面标题才是 h1
      out += `<h${n}>${inline(m[2], base)}</h${n}>`;
      i++; continue;
    }
    if (RE.hr.test(line)) { out += '<hr>'; i++; continue; }
    if ((m = line.match(RE.bili))) { out += biliEmbed(parseBili(m[1])); i++; continue; }
    if ((m = line.match(RE.figure))) {
      const alt = esc(m[1]);
      const srcUrl = esc(assetUrl(safeUrl(m[2]), base));
      out += `<figure><img src="${srcUrl}" alt="${alt}" loading="lazy" data-lightbox="body" data-caption="${alt}">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
      i++; continue;
    }
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].replace(RE.quote, ''));
      out += `<blockquote>${md(buf.join('\n'), opts)}</blockquote>`;
      continue;
    }
    if (RE.ul.test(line) || RE.ol.test(line)) {
      const ordered = RE.ol.test(line);
      const re = ordered ? RE.ol : RE.ul;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let t = lines[i++].replace(re, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) t += '\n' + lines[i++].trim();
        items.push(t);
      }
      const tag = ordered ? 'ol' : 'ul';
      out += `<${tag}>${items.map((t) => `<li>${t.split('\n').map((x) => inline(x, base)).join('<br>')}</li>`).join('')}</${tag}>`;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && (buf.length === 0 || !isBlockStart(lines[i]))) buf.push(lines[i++]);
    out += `<p>${buf.map((x) => inline(x, base)).join('<br>')}</p>`;
  }
  return out;
}

function emphasis(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

export function inline(s, base = '') {
  const tokens = [];
  const keep = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  s = String(s).replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    keep(`<img src="${assetUrl(safeUrl(src), base)}" alt="${alt}" loading="lazy" data-lightbox="body" data-caption="${alt}">`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url);
    const ext = /^(https?:)?\/\//i.test(href);
    return keep(`<a href="${ext ? href : assetUrl(href, base)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${emphasis(label)}</a>`);
  });
  s = emphasis(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[n]);
}
