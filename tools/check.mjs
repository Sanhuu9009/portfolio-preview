#!/usr/bin/env node
// tools/check.mjs — 校验 content/site.json
// 用法：在项目根目录运行  node tools/check.mjs
// 检查：JSON 能否解析、字段类型、枚举值、id 唯一、作品引用、B 站视频号、日期格式、本地文件是否存在。
// 有错误时退出码为 1；只有警告时为 0。无任何依赖（Node 18+）。

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TYPES, TIERS, SCOPES, SOCIALS } from '../assets/js/core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

let d;
try {
  d = JSON.parse(readFileSync(path.join(root, 'content/site.json'), 'utf8'));
} catch (e) {
  console.error(`✗ content/site.json 无法解析：${e.message}`);
  process.exit(1);
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isLocal = (p) => typeof p === 'string' && p && !/^(https?:)?\/\//i.test(p) && !/^(data|blob|mailto|tel):/i.test(p);
const DATE = /^\d{4}(-\d{2}){0,2}$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;

function file(p, where) {
  if (!p) return;
  if (typeof p !== 'string') return E(`${where}：应为字符串路径`);
  if (p.startsWith('/')) E(`${where}：路径不要以 / 开头（GitHub Pages 可能部署在子路径下）：${p}`);
  if (isLocal(p) && !existsSync(path.join(root, p.replace(/^\.?\//, '')))) E(`${where}：文件不存在 ${p}`);
}
function date(v, where) {
  if (v && !DATE.test(v)) E(`${where}：日期应为 YYYY-MM（或 YYYY / YYYY-MM-DD），实际为 "${v}"`);
}
function bool(v, where) {
  if (v !== undefined && typeof v !== 'boolean') E(`${where}：应为 true / false`);
}
function arr(v, where) {
  if (v !== undefined && !Array.isArray(v)) { E(`${where}：应为数组`); return []; }
  return v || [];
}
function award(a, where) {
  if (!isObj(a)) return E(`${where}：应为对象`);
  if (!a.name && !a.level) E(`${where}：name 和 level 至少填一个`);
  if (a.tier && !TIERS[a.tier]) E(`${where}.tier：只能是 ${Object.keys(TIERS).join(' / ')}`);
  date(a.date, `${where}.date`);
  file(a.certificate, `${where}.certificate`);
  bool(a.showTag, `${where}.showTag`);
  bool(a.showCertificate, `${where}.showCertificate`);
  if (a.showCertificate && a.showTag !== false && !a.certificate) W(`${where}：开启了展示证书但没有上传证书`);
}

for (const k of ['site', 'profile']) if (!isObj(d[k])) E(`缺少对象 ${k}`);
for (const k of ['works', 'honors', 'experiences']) if (!Array.isArray(d[k])) E(`缺少数组 ${k}`);

const site = d.site || {};
if (site.accent && !/^#[0-9a-f]{6}$/i.test(site.accent)) E('site.accent：应为 #rrggbb 格式');
if (site.honorsOrder && !['date', 'tier', 'manual'].includes(site.honorsOrder)) E('site.honorsOrder：只能是 date / tier / manual');
if (site.favicon && /[./]/.test(site.favicon)) file(site.favicon, 'site.favicon');
if (site.effects !== undefined) {
  if (!isObj(site.effects)) E('site.effects：应为对象 { intro, particles, cursor }');
  else for (const k of ['intro', 'particles', 'cursor']) bool(site.effects[k], `site.effects.${k}`);
}

const p = d.profile || {};
file(p.avatar, 'profile.avatar');
file(p.resume, 'profile.resume');
arr(p.socials, 'profile.socials').forEach((s, i) => {
  if (s.platform && !SOCIALS[s.platform]) E(`profile.socials[${i}].platform：未知平台 "${s.platform}"，可选 ${Object.keys(SOCIALS).join(' / ')}`);
});
arr(p.education, 'profile.education').forEach((e, i) => { date(e.start, `profile.education[${i}].start`); date(e.end, `profile.education[${i}].end`); });
if (!p.name) W('profile.name 为空，首页稿纸会显示网站标题');

const ids = new Set();
const works = arr(d.works, 'works');
works.forEach((w, i) => {
  const at = `works[${i}]（${w.title || w.id || '无标题'}）`;
  if (!w.id) E(`${at}：缺少 id`);
  else {
    if (!ID.test(w.id)) E(`${at}.id：只能用小写字母、数字和短横线，实际为 "${w.id}"`);
    if (ids.has(w.id)) E(`${at}.id：与其他作品重复 "${w.id}"`);
    ids.add(w.id);
  }
  if (!w.title) W(`${at}：没有标题`);
  if (!TYPES[w.type]) E(`${at}.type：只能是 ${Object.keys(TYPES).join(' / ')}`);
  date(w.date, `${at}.date`);
  file(w.cover, `${at}.cover`);
  bool(w.featured, `${at}.featured`);
  bool(w.hidden, `${at}.hidden`);
  arr(w.tags, `${at}.tags`);
  if (w.type === 'video') {
    const v = w.video || {};
    if (!v.bvid && !v.aid) E(`${at}：视频作品缺少 video.bvid（或 video.aid）`);
    if (v.bvid && !/^BV[0-9A-Za-z]{10}$/.test(v.bvid)) E(`${at}.video.bvid：格式不对 "${v.bvid}"`);
  }
  if (w.type !== 'video' && !w.body && !(w.gallery || []).length) W(`${at}：没有正文也没有图片`);
  arr(w.gallery, `${at}.gallery`).forEach((g, j) => file(g.src, `${at}.gallery[${j}].src`));
  for (const m of String(w.body || '').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) file(m[1], `${at}.body 中的图片`);
  arr(w.awards, `${at}.awards`).forEach((a, j) => award(a, `${at}.awards[${j}]`));
});

const hids = new Set();
arr(d.honors, 'honors').forEach((h, i) => {
  const at = `honors[${i}]（${h.level || h.name || '无名称'}）`;
  if (h.id) { if (hids.has(h.id)) E(`${at}.id：重复`); hids.add(h.id); }
  award(h, at);
  if (h.workId && !ids.has(h.workId)) E(`${at}.workId：找不到作品 "${h.workId}"`);
  bool(h.hidden, `${at}.hidden`);
});

arr(d.experiences, 'experiences').forEach((e, i) => {
  const at = `experiences[${i}]（${e.role || e.org || '无名称'}）`;
  if (!SCOPES[e.scope]) E(`${at}.scope：只能是 ${Object.keys(SCOPES).join(' / ')}`);
  if (!e.role && !e.org) W(`${at}：职务和组织都为空`);
  date(e.start, `${at}.start`);
  date(e.end, `${at}.end`);
  arr(e.highlights, `${at}.highlights`);
  bool(e.hidden, `${at}.hidden`);
});

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
if (!/<!-- cms:meta:start -->[\s\S]*<!-- cms:meta:end -->/.test(html)) E('index.html：缺少 <!-- cms:meta:start --> … <!-- cms:meta:end --> 标记，后台无法同步标题');

for (const w of warns) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(`\n${errors.length ? '✗' : '✓'} ${works.length} 件作品、${(d.honors || []).length} 项荣誉、${(d.experiences || []).length} 段经历；${errors.length} 个错误，${warns.length} 个警告`);
process.exit(errors.length ? 1 : 0);
