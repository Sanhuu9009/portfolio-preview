// admin/js/schema.js — 后台表单定义（schema 驱动，fields.js 负责渲染）
//
// 字段格式：{ key, label, type, ...options }
//   key       支持点路径，如 'sections.works'
//   label     字符串，或 (obj) => 字符串
//   type      text | textarea | markdown | select | toggle | month | number | color | image | file
//             | tags | lines | list | bilibili | slug | section（分组标题，无 key）
//   wide      占满两列
//   when      (obj, ctx) => boolean，为 false 时不显示
//   rerender  值改变后重绘整个表单（用于切换类型等）
//   help      说明文字（可含 HTML）
//   list 专用：fields（子表单）、itemLabel(item, i)、itemPreview(item) 返回 HTML、newItem()
//
// 新增字段时：同时修改 assets/js/core.js 的 normalize*()，以及前台渲染 assets/js/site.js。

import { TIERS, RANKS, SCOPES, SOCIALS, TYPES, awardBadge, normalizeAward, normalizeWork, normalizeHonor, normalizeExperience, uid } from '../../assets/js/core.js';

const opts = (obj) => Object.entries(obj);
const TIER_OPTIONS = opts(TIERS);
const RANK_OPTIONS = [['', '不填'], ...RANKS.map((r) => [r, r])];

export const AWARD_FIELDS = [
  { key: 'level', label: '获奖等级（麦穗中间的大字）', type: 'text', placeholder: '一等奖 / 金奖 / 最佳剪辑' },
  { key: 'tier', label: '麦穗颜色', type: 'select', options: TIER_OPTIONS },
  { key: 'name', label: '奖项或赛事名称', type: 'text', wide: true, placeholder: '第十二届全国大学生影像创作大赛' },
  { key: 'rank', label: '级别', type: 'select', options: RANK_OPTIONS },
  { key: 'date', label: '获奖时间', type: 'month' },
  { key: 'issuer', label: '颁发单位', type: 'text', wide: true },
  { key: 'certificate', label: '获奖证书', type: 'image', accept: 'image/*,application/pdf', wide: true, rerender: true, help: '图片或 PDF。图片会自动压缩。' },
];

export const WORK_AWARD_FIELDS = [
  ...AWARD_FIELDS,
  { key: 'showTag', label: '展示获奖标签和麦穗', type: 'toggle', help: '关闭后，卡片和详情页都不显示这个奖项，荣誉墙也不会汇总它。' },
  { key: 'showCertificate', label: '在作品页展示获奖证书', type: 'toggle', when: (a) => !!a.certificate },
];

export const WORK = [
  { type: 'section', label: '基本信息' },
  { key: 'title', label: '作品标题', type: 'text', wide: true },
  { key: 'type', label: '作品形式', type: 'select', options: opts(TYPES).map(([k, v]) => [k, v.label]), rerender: true },
  { key: 'id', label: '网址 ID', type: 'slug', help: '作品页地址是 work.html?id=这里的值。只能用小写字母、数字和短横线。' },
  { key: 'category', label: '类别', type: 'text', placeholder: '纪录短片 / 海报 / 散文' },
  { key: 'date', label: '完成时间', type: 'month' },
  { key: 'summary', label: '一句话简介', type: 'textarea', rows: 2, wide: true, help: '显示在作品卡片和详情页标题下方。' },
  { key: 'cover', label: '封面图', type: 'image', wide: true,
    help: (w) => (w.type === 'text' ? '文本作品可以不放封面，卡片会自动摘录开头的文字作为封面。' : '建议横图，比例约 16:10。详情页会用它生成背景氛围光。') },
  { key: 'tags', label: '标签', type: 'tags', wide: true, help: '回车添加。访客可以在作品页搜索这些标签。' },
  { key: 'featured', label: '在首页展示', type: 'toggle' },
  { key: 'hidden', label: '隐藏（存为草稿，网站上不显示）', type: 'toggle' },

  { type: 'section', label: '作品内容' },
  { key: 'video', label: 'B 站视频', type: 'bilibili', wide: true, when: (w) => w.type === 'video' },
  { key: 'body', type: 'markdown', wide: true, rows: 14,
    label: (w) => ({ video: '作品说明', article: '正文', text: '正文' }[w.type]),
    help: (w) => (w.type === 'text'
      ? '单个换行会保留，适合诗歌和文案。空一行分段。'
      : '支持 Markdown。用工具栏插入图片，或用 @[bilibili](BV号) 在正文里再嵌一个视频。') },
  { key: 'gallery', label: '图片组', type: 'list', wide: true, when: (w) => w.type !== 'text',
    help: '显示在正文下方，点击可放大。',
    fields: [
      { key: 'src', label: '图片', type: 'image', wide: true },
      { key: 'caption', label: '图片说明', type: 'text', wide: true },
    ],
    itemLabel: (g, i) => g.caption || `图片 ${i + 1}`,
    newItem: () => ({ src: '', caption: '' }) },

  { type: 'section', label: '创作信息' },
  { key: 'role', label: '我的角色', type: 'text', placeholder: '导演、剪辑' },
  { key: 'collaborators', label: '合作者', type: 'text' },
  { key: 'platform', label: '发布平台', type: 'text', wide: true, placeholder: '哔哩哔哩，播放量 12 万' },
  { key: 'links', label: '相关链接', type: 'list', wide: true,
    fields: [
      { key: 'label', label: '按钮文字', type: 'text', placeholder: '阅读原文' },
      { key: 'url', label: '网址', type: 'text', placeholder: 'https://' },
    ],
    itemLabel: (l, i) => l.label || l.url || `链接 ${i + 1}`,
    newItem: () => ({ label: '', url: '' }) },

  { type: 'section', label: '获奖' },
  { key: 'awards', label: '这件作品获得的奖项', type: 'list', wide: true, fields: WORK_AWARD_FIELDS,
    help: '每个奖项可以分别决定：是否显示获奖标签和麦穗、是否展示证书。',
    itemLabel: (a, i) => [a.level, a.name].filter(Boolean).join(' ') || `奖项 ${i + 1}`,
    itemPreview: (a) => (a.showTag ? awardBadge(a, 'sm') : '<span class="muted">已隐藏</span>'),
    newItem: () => normalizeAward({}) },
];

export const HONOR = [
  ...AWARD_FIELDS,
  { key: 'description', label: '补充说明', type: 'textarea', rows: 2, wide: true, placeholder: '全院共 2 人获得' },
  { key: 'showCertificate', label: '在荣誉墙提供「查看证书」', type: 'toggle', when: (h) => !!h.certificate },
  { key: 'workId', label: '关联作品', type: 'select', options: (ctx) => [['', '不关联'], ...ctx.data.works.map((w) => [w.id, w.title || w.id])],
    help: '作品自己的获奖请在「作品」里填写，这里用于奖学金、荣誉称号等不属于某件作品的荣誉。' },
  { key: 'hidden', label: '隐藏', type: 'toggle' },
];

export const EXPERIENCE = [
  { key: 'scope', label: '类型', type: 'select', options: opts(SCOPES) },
  { key: 'role', label: '职务或角色', type: 'text', placeholder: '视频部部长' },
  { key: 'org', label: '组织或单位', type: 'text', wide: true },
  { key: 'start', label: '开始时间', type: 'month' },
  { key: 'end', label: '结束时间', type: 'month', help: '留空表示至今。' },
  { key: 'location', label: '地点', type: 'text' },
  { key: 'link', label: '相关链接', type: 'text', placeholder: 'https://' },
  { key: 'summary', label: '描述', type: 'markdown', rows: 4, wide: true },
  { key: 'highlights', label: '要点', type: 'lines', wide: true, help: '每行一条，显示为列表。' },
  { key: 'hidden', label: '隐藏', type: 'toggle' },
];

export const PROFILE = [
  { type: 'section', label: '基本信息' },
  { key: 'name', label: '姓名', type: 'text', help: '首页会用粒子拼出这个名字，2～4 个字效果最好。' },
  { key: 'nameEn', label: '英文名', type: 'text', help: '首屏会用大号描边字显示，光标靠近的字母会被点亮。' },
  { key: 'tagline', label: '一句话介绍', type: 'text', wide: true },
  { key: 'roles', label: '身份标签', type: 'tags', wide: true, placeholder: '纪录片导演' },
  { key: 'avatar', label: '照片', type: 'image', wide: true, help: '竖图，比例约 4:5。' },
  { key: 'school', label: '学校', type: 'text' },
  { key: 'major', label: '专业', type: 'text' },
  { key: 'grade', label: '年级', type: 'text', placeholder: '2022 级本科' },
  { key: 'location', label: '所在地', type: 'text' },
  { key: 'resume', label: '简历文件', type: 'file', accept: 'application/pdf', wide: true, help: '上传 PDF 后首页会出现「查看简历」按钮。' },

  { type: 'section', label: '自我介绍' },
  { key: 'bio', label: '自我介绍', type: 'markdown', rows: 10, wide: true },
  { key: 'skills', label: '技能', type: 'tags', wide: true },
  { key: 'education', label: '教育背景', type: 'list', wide: true,
    fields: [
      { key: 'school', label: '学校', type: 'text' },
      { key: 'degree', label: '学历', type: 'text', placeholder: '本科' },
      { key: 'major', label: '专业', type: 'text' },
      { key: 'note', label: '备注', type: 'text', placeholder: 'GPA、排名等' },
      { key: 'start', label: '入学', type: 'month' },
      { key: 'end', label: '毕业', type: 'month' },
    ],
    itemLabel: (e, i) => e.school || `教育经历 ${i + 1}`,
    newItem: () => ({ school: '', major: '', degree: '', start: '', end: '', note: '' }) },

  { type: 'section', label: '联系方式' },
  { key: 'email', label: '邮箱', type: 'text', wide: true },
  { key: 'socials', label: '社交平台', type: 'list', wide: true,
    fields: [
      { key: 'platform', label: '平台', type: 'select', options: opts(SOCIALS) },
      { key: 'label', label: '显示文字', type: 'text', placeholder: '@你的昵称' },
      { key: 'url', label: '主页网址', type: 'text', wide: true, help: '没有网址（如公众号）可以留空，只显示文字。' },
    ],
    itemLabel: (s, i) => `${SOCIALS[s.platform] || '平台'}${s.label ? `：${s.label}` : ''}` || `平台 ${i + 1}`,
    newItem: () => ({ platform: 'bilibili', label: '', url: '' }) },
];

export const SITE = [
  { type: 'section', label: '网站' },
  { key: 'title', label: '网站标题', type: 'text', wide: true, help: '显示在浏览器标签页和分享链接上。保存时会同步写进 index.html。' },
  { key: 'description', label: '网站描述', type: 'textarea', rows: 2, wide: true, help: '搜索引擎和微信分享卡片会用到。' },
  { key: 'accent', label: '强调色', type: 'color', help: '按钮、链接、光标标签和粒子渐变的一端。获奖麦穗固定为金银铜色，不受影响。默认 #3ad6c5。' },
  { key: 'favicon', label: '标签页图标', type: 'text', placeholder: '🎬', help: '填一个 emoji，或图片路径。留空使用默认图标。' },
  { key: 'footer', label: '页脚文字', type: 'text', wide: true },

  { type: 'section', label: '首页模块' },
  { key: 'sections.about', label: '关于我', type: 'toggle' },
  { key: 'sections.works', label: '作品', type: 'toggle' },
  { key: 'sections.honors', label: '荣誉奖项', type: 'toggle' },
  { key: 'sections.experience', label: '实践经历', type: 'toggle' },
  { key: 'sections.contact', label: '联系方式', type: 'toggle' },
  { key: 'featuredLimit', label: '首页最多展示几件作品', type: 'number', min: 1, max: 30, help: '只展示勾选了「在首页展示」的作品；一件都没勾时按顺序展示。' },

  { type: 'section', label: '动效' },
  { key: 'effects.intro', label: '首次打开时播放胶片倒计时片头', type: 'toggle', help: '每个访客每次打开浏览器只播放一次，可点击跳过。' },
  { key: 'effects.particles', label: '首屏姓名由粒子组成，可被光标拨动', type: 'toggle' },
  { key: 'effects.shader', label: 'WebGL 流光背景（青金色光雾，随光标流动）', type: 'toggle', help: '关闭后改用简单的光斑背景，更省电。' },
  { key: 'effects.smooth', label: '鼠标滚轮惯性平滑滚动', type: 'toggle' },
  { key: 'effects.cursor', label: '自定义光标（悬停作品时显示「播放」「阅读」等）', type: 'toggle', help: '光标与平滑滚动只在电脑上生效。访客开启了系统「减少动态效果」时，以上动效会自动关闭。' },

  { type: 'section', label: '荣誉墙' },
  { key: 'mergeWorkAwards', label: '把作品的获奖自动汇总到荣誉墙', type: 'toggle', help: '只汇总打开了「展示获奖标签和麦穗」的奖项。' },
  { key: 'honorsOrder', label: '荣誉墙排序', type: 'select',
    options: [['date', '按获奖时间，新的在前'], ['tier', '按麦穗颜色：金、银、铜、主题色'], ['manual', '按后台顺序（作品获奖排在后面）']] },
];

export const blank = {
  work: (type = 'video') => normalizeWork({ id: uid('w'), type, title: '' }),
  honor: () => normalizeHonor({ id: uid('h') }),
  experience: () => normalizeExperience({ id: uid('e') }),
};
