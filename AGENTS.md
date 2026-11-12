# AGENTS.md

给在这个仓库里工作的 AI Agent（Claude Code、Codex、Cursor 等）的说明。人类用户的使用说明见 `README.md`。

## 一句话概括

纯静态的个人作品集网站，部署在 GitHub Pages。视觉方向是深色「放映厅 / 颁奖礼」，背景是 WebGL 青金色流光雾（取自英文名 Aetheris / 以太），交互较多（粒子姓名、光标点亮的英文名、横向滚动作品带、翻面证书卡、惯性滚动、自定义光标、⌘K 搜索、页面转场等）。**所有内容都在 `content/site.json`**，页面由浏览器端 JS 在运行时渲染。`/admin/` 是浏览器端 CMS，通过 GitHub REST API 直接把修改提交回仓库。没有构建步骤、没有 npm 依赖、没有框架。

## 硬性约束（修改前必读）

1. **不要引入构建工具或依赖**（npm 包、打包器、TypeScript、框架）。仓库推上去就必须能直接运行。
2. **不要引用外部 CDN 或网络字体**（包括 Google Fonts、jsDelivr、unpkg）。网站主要面向中国大陆访客，这些资源会加载失败或很慢。字体只用 CSS 里写好的系统字体栈。
3. **所有路径都相对于站点根目录，且不以 `/` 开头**，例如 `uploads/2025/06/a.webp`、`assets/css/style.css`。GitHub Pages 的项目站点部署在 `/<仓库名>/` 子路径下，绝对路径会全部失效。
4. **`assets/js/core.js` 不能访问 DOM 或 `window`**。
5. **动效必须是增强**：关闭 JS 效果、系统开启「减少动态效果」或在触屏设备上时，内容必须完整可用。新增持续动画要在离开视口 / 标签页隐藏时暂停，滚动相关逻辑统一注册到 `fx.onScroll()`，不要另开 scroll 监听或 rAF 循环。它同时被前台、后台和 Node 校验脚本 import。
6. **内容默认不信任**：渲染用户文本一律经过 `esc()`；Markdown 渲染器会转义原始 HTML。不要加入 `innerHTML = 用户内容` 的捷径。
7. **不要删除 `index.html` 里的 `<!-- cms:meta:start -->` 和 `<!-- cms:meta:end -->` 标记**，后台发布时靠它们同步网站标题和描述（供微信分享卡片、搜索引擎读取）。
8. **不要删除 HTML 外壳里的 `.aether`、`.spot`、`.wipe`、`.grain` 元素和 `<head>` 里的内联脚本**（主题与转场靠它们在首帧生效）。
9. 修改 `content/site.json` 之后，**必须运行 `node tools/check.mjs`**，确认退出码为 0。

## 目录

```
index.html            首页（自我介绍、精选作品、荣誉墙、实践经历、联系方式）  <body data-page="home">
works.html            全部作品，可按形式 / 是否获奖 / 关键词筛选            <body data-page="works">
work.html?id=<id>     作品详情                                            <body data-page="work">
404.html              GitHub Pages 的 404 页
content/site.json     ★ 唯一的数据源
uploads/              上传的图片、证书、PDF。后台按 uploads/YYYY/MM/<名字>-<随机>.<扩展名> 存放
uploads/demo/         示例图片（用户替换内容后可以删掉）
assets/js/core.js     共享纯函数：常量、normalize*()、B 站解析、麦穗 SVG、awardBadge()
assets/js/md.js       无依赖的精简 Markdown 渲染器（前后台共用）
assets/js/site.js     前台渲染入口：读取数据 → 按 data-page 渲染对应页面 → 挂载动效
assets/js/fx.js       全部动效与交互（无依赖），见下文「视觉与交互」
assets/js/palette.js  ⌘K / Ctrl+K / 「/」搜索面板
assets/css/style.css  前台样式（颜色全部是变量；默认深色，[data-theme="light"] 为浅色）
assets/css/award.css  麦穗获奖徽章样式（前后台共用）
admin/index.html      后台外壳
admin/admin.css       后台样式
admin/js/app.js       后台主程序：连接、视图、发布、草稿、上传压缩
admin/js/adapters.js  三种存储方式：GitHubAdapter / LocalAdapter / OfflineAdapter
admin/js/schema.js    ★ 后台表单定义（声明式）
admin/js/fields.js    根据 schema 渲染表单控件
tools/check.mjs       内容校验脚本（Node 18+，无依赖）
.nojekyll             让 GitHub Pages 原样发布文件，不经过 Jekyll
```

## 数据模型（`content/site.json`）

以 TypeScript 写出，仅作说明，仓库里没有 TS。所有字段都可以省略，`core.js` 里的 `normalize()` 会补默认值。

```ts
type Month = string;            // 'YYYY-MM'，也接受 'YYYY' 或 'YYYY-MM-DD'；显示为 2025.06
type Path = string;             // 相对站点根目录的路径，如 'uploads/2025/06/a.webp'，或 https:// 外链
type Markdown = string;         // 见下文「Markdown 语法」

interface SiteData {
  version: 1;
  updatedAt: string;            // ISO 时间，后台发布时自动写入
  site: Site;
  profile: Profile;
  works: Work[];                // 数组顺序 = 网站显示顺序
  honors: Honor[];              // 不属于某件作品的荣誉（奖学金、荣誉称号等）
  experiences: Experience[];    // 数组顺序 = 网站显示顺序
}

interface Site {
  title: string;                // 浏览器标题；发布时同步写入 index.html
  description: string;
  favicon: string;              // 一个 emoji，或图片 Path；空 = assets/img/favicon.svg
  accent: string;               // '#rrggbb'，强调色（按钮、链接、光标标签、粒子渐变一端），默认 '#3ad6c5'
  footer: string;
  sections: { about: boolean; works: boolean; honors: boolean; experience: boolean; contact: boolean };
  featuredLimit: number;        // 首页最多展示几件作品，默认 6
  mergeWorkAwards: boolean;     // 荣誉墙是否自动汇总作品的获奖（只汇总 showTag=true 的），默认 true
  honorsOrder: 'date' | 'tier' | 'manual';
  effects: {                    // 均默认 true；系统「减少动态效果」时全部自动失效
    intro: boolean;             // 首页胶片倒计时片头（每个会话一次，预览模式不播）
    particles: boolean;         // 首屏粒子姓名
    cursor: boolean;            // 自定义光标（仅鼠标设备）
    shader: boolean;            // WebGL 流光背景；关闭或不支持时退回 .spot 光斑
    smooth: boolean;            // 鼠标滚轮惯性平滑滚动（仅鼠标设备）
  };
}

interface Profile {
  name: string;                 // 首页用粒子拼出名字（2～4 个字最佳）
  nameEn: string;               // 首屏大号描边字（.prox），光标靠近的字母被点亮；页脚巨字；片头副标题
  avatar: Path;                 // 竖图 4:5
  tagline: string;
  roles: string[];              // 身份标签
  school: string; major: string; grade: string; location: string;
  email: string;
  bio: Markdown;
  skills: string[];
  education: { school: string; major: string; degree: string; start: Month; end: Month; note: string }[];
  socials: { platform: SocialKey; label: string; url: string }[];   // url 可空（如公众号），只显示文字
  resume: Path;                 // PDF，非空时首页出现「查看简历」
}
type SocialKey = 'bilibili' | 'xiaohongshu' | 'weibo' | 'douyin' | 'wechat' | 'zhihu'
  | 'github' | 'linkedin' | 'behance' | 'email' | 'website' | 'other';

interface Work {
  id: string;                   // 网址 work.html?id=<id>；/^[a-z0-9][a-z0-9-]*$/，全局唯一
  title: string;
  type: 'video' | 'article' | 'text';   // 视频（B站嵌入）/ 图文 / 文本
  category: string;             // 自由文本，如「纪录短片」
  date: Month;
  summary: string;
  cover: Path;                  // 可空：文本作品自动摘录正文作封面，其余显示标题占位；详情页用它做背景氛围光
  tags: string[];
  featured: boolean;            // 首页展示；全部为 false 时按顺序取前 featuredLimit 件
  hidden: boolean;              // 草稿，网站不显示（?preview 预览模式下可见）
  video: { input?: string; bvid?: string; aid?: string; cid?: string; page?: number };  // 仅 type=video
  body: Markdown;
  gallery: { src: Path; caption: string }[];   // 正文下方的图片组（text 类型不显示）
  role: string; collaborators: string; platform: string;
  links: { label: string; url: string }[];
  awards: Award[];
}

interface Award {
  name: string;                 // 奖项或赛事名称
  level: string;                // 获奖等级，麦穗中间的大字，如「一等奖」
  tier: 'gold' | 'silver' | 'bronze' | 'merit';   // 麦穗颜色；merit = 主题色
  rank: string;                 // '国际级' | '国家级' | '省部级' | '市级' | '校级' | '院级' | '其他' | ''
  issuer: string;
  date: Month;
  certificate: Path;            // 图片或 PDF
  showTag: boolean;             // 是否显示「获奖」标签和麦穗徽章（卡片 + 详情页 + 荣誉墙汇总），默认 true
  showCertificate: boolean;     // 是否在详情页 / 荣誉墙展示证书，默认 true
}

interface Honor extends Award {
  id: string;
  description: string;
  workId: string;               // 可选，关联作品的 id
  hidden: boolean;
}

interface Experience {
  id: string;
  scope: 'campus' | 'external'; // 校内 / 校外，首页可按此筛选
  org: string; role: string;
  start: Month; end: Month;     // end 为空 = 至今
  location: string;
  summary: Markdown;
  highlights: string[];
  link: string;
  hidden: boolean;
}
```

### Markdown 语法（`assets/js/md.js`）

- 支持：`#` 标题（渲染为 h2 起步）、`**粗体**`、`*斜体*`、`~~删除线~~`、`` `代码` ``、代码块、`>` 引用、`-` 和 `1.` 列表、`---` 分隔线、`[文字](url)`、`![说明](路径)`。
- 段落内的**单个换行会保留**（诗歌、文案需要），空一行才分段。
- 独占一行的 `![说明](路径)` 渲染为带图注的大图，点击可放大。
- 独占一行的 `@[bilibili](BV1xxxxxxxxx)` 嵌入 B 站播放器，也接受 `av123`、完整链接或 `BV…?p=2`。
- 不支持原始 HTML（会被转义显示）、表格、嵌套列表。

## 渲染流程

1. 每个 HTML 页面只有空的 `#site-header`、`#app`、`#site-footer`，加载 `assets/js/site.js`。
2. `site.js` 用 `fetch('content/site.json', { cache: 'no-cache' })` 读取数据，经 `normalize()` 后按 `document.body.dataset.page` 渲染。
3. URL 带 `?preview` 时，改为读取 `localStorage['cms:draft'].data`（后台写入的未发布草稿），顶部显示预览条，隐藏作品也可见。站内链接会自动带上 `preview=1`。
4. 直接双击打开 HTML（`file://`）会因为 fetch 失败而显示提示。本地预览用 `python3 -m http.server`。

## 视觉与交互

设计令牌在 `assets/css/style.css` 顶部：`:root`（深色，默认）和 `:root[data-theme="light"]`。核心是「青橙调色」：`--accent`（青，可在后台改）与 `--gold`（橙金，用于获奖）。`--accent-ink` 是用于文字的强调色（浅色主题下自动加深）。字体只用系统字体栈：`--display`（标题，含鸿蒙 / MiSans / 苹方）、`--sans`（正文）、`--serif`（文本类作品阅读）、`--mono`（日期等数字）。

`fx.js` 导出的效果与挂载位置：

| 函数 | 作用 | 挂载在 |
| --- | --- | --- |
| `transitions()` | 站内链接点击后幕布升起再跳转，新页面渲染完收起；链接上的 `data-wipe` 是幕布上显示的文字 | 每页，`main()` 开头 |
| `intro()` | 3-2-1 胶片倒计时 | 首页，`startHero()` |
| `particleName(canvas, text)` | 粒子姓名，指针推开后弹回；返回 `{ play() }` | 首页 `.hero__canvas` |
| `aether(canvas)` | WebGL 片元着色器：域扭曲噪声光雾，颜色取 `--accent` / `--gold` / `--bg`，指针推开光雾，滚动使其漂移；半分辨率、触屏 30fps、标签页隐藏时暂停；失败返回 null | 每页 `canvas.aether`（`effects.shader`） |
| `spotlight(el)` | 光斑跟随指针（写 `--mx/--my` 到 `.spot`），`aether` 不可用时的降级 | 每页 |
| `smoothScroll()` | 只接管鼠标滚轮做惯性滚动，原生滚动位置不变（吸顶 / 钉住照常）；遇到可滚动子元素、Ctrl 缩放、弹窗时不接管 | 每页（`effects.smooth`） |
| `proximity(el)` | 把文字拆成字母，按与指针的距离写 `--t`（0~1），CSS 据此填色、浮起、发光；触屏改为自动波浪 | 首页 `.prox`（英文名） |
| `hoverScramble()` | `data-scramble` 元素悬停时乱码重排 | 导航链接 |
| `cursor()` | 自定义光标；元素加 `data-cursor="文字"` 显示标签 | 每页（`effects.cursor`） |
| `magnetic()` / `tilt()` | `data-magnetic="0.3"` 磁吸；`data-tilt="8"` 3D 倾斜 + `.glare` 光泽 | 每页 |
| `reveal()` | `data-split` 标题逐字升起；`data-reveal` 淡入；`data-reveal-img` 封面幕布揭开（观察父元素，因为自身有 clip-path）；`.award--md/lg` 麦穗生长 | 每页 |
| `rotate(el, items)` / `scrambleTo()` | 乱码切换文字（首屏「我是 ×××」） | 首页 |
| `marquee(section)` | 跑马灯，速度随滚动、向上滚时反向 | 首页 |
| `scrub(el)` | 段落随滚动逐字点亮 | 首页「关于我」 |
| `reel(section)` | 作品胶片带：桌面端钉住并横向滚动，触屏端原生横滑 | 首页 |
| `glowGrid(grid)` | 卡片边框追光 | 首页荣誉墙 |
| `timeline(ol)` | 时间线随滚动描线、节点点亮 | 首页经历 |
| `countUp()` / `segPill()` / `toast()` | 数字滚动 / 分段控件滑块 / 提示条 | 按需 |

`site.js` 里另有三处页面级交互：首屏随滚动上移淡出（写 `--hp` 到 `.hero`）、「关于我」便当格（`.bento` 用 grid-template-areas 排版）、荣誉卡翻面（有图片证书的 `.hcard.has-back`，点 `[data-flip]` 切换 `.is-flipped`，背面是证书）。

新增效果时：写成 `fx.js` 里的独立函数，开头判断 `REDUCED` / `FINE` 并提供降级，在 `site.js` 对应的 `render*()` 之后挂载。

## 获奖相关的显示规则

- **作品卡片**（首页胶片带、作品页网格）：存在任意 `showTag=true` 的奖项时，封面右上角显示金色「获奖」标签，标题下显示第一个奖项的单行麦穗徽章，多个时追加「等 N 项」。列表视图里显示一对小麦穗。
- **作品详情页**：标题下方的「领奖台」为每个 `showTag=true` 的奖项显示大号发光麦穗；`showCertificate=true` 且 `certificate` 非空的奖项进入「获奖证书」区块。PDF 显示为打开链接，图片可放大。
- **荣誉墙**：`collectHonors(data)` 合并未隐藏的 `honors` 与（`mergeWorkAwards` 时）作品里 `showTag=true` 的奖项，按 `honorsOrder` 排序，默认显示 6 项，其余折叠。
- **荣誉墙**卡片：有图片证书时显示「翻面看证书」，卡片 3D 翻转到背面展示证书，点击可放大；PDF 证书仍是外链按钮。
- **荣誉墙**顶部的数字统计：总数、国家级及以上（`rank` 为「国际级」「国家级」）、金色（`tier=gold`）。
- 麦穗本体由 `core.js` 的 `buildLaurel()` 用贝塞尔曲线生成，`viewBox="0 0 24 48"`，颜色走 `currentColor`；右侧用 CSS `scaleX(-1)` 镜像。叶片带 `class="leaf"` 和 `--n`（生长顺序），穗杆 `class="stem"` 且 `pathLength="1"`，`award.css` 用它们做生长动画。徽章 HTML 只能通过 `awardBadge(award, 'sm' | 'md' | 'lg')` 生成。

## 后台（`/admin/`）工作原理

- **连接方式**（`adapters.js`，三者接口相同：`connect / readText / writeText / writeFile / canUpload / label`）：
  - `GitHubAdapter`：Fine-grained PAT（只授权该仓库的 Contents 读写），调用 `GET/PUT /repos/{owner}/{repo}/contents/{path}`。每次写入带上读取时的 `sha`，远端被别处修改时返回 409，后台会提示重新载入，不会静默覆盖。Token 存在 `localStorage['cms:token']`（不勾选「记住」时存 sessionStorage）。
  - `LocalAdapter`：File System Access API（Chrome / Edge），直接读写本地项目文件夹，需要通过 `http://localhost` 打开后台。
  - `OfflineAdapter`：只读 `../content/site.json`，「发布」变成下载文件，不能上传。
- **数据流**：读取 → `normalize()` → 在内存里编辑 `state.data` → 每次修改都防抖写入 `localStorage['cms:draft']`（`{ data, savedAt, dirty, base }`）→ 发布时把整份 JSON 写回 `content/site.json`，然后同步 `index.html` 的 meta 标记区。
- **上传**：JPEG / PNG / WebP 长边大于 2400px 或体积大于 900KB 时用 canvas 压缩，优先编码为 WebP（保留透明），浏览器不支持时改用 JPEG。单文件上限 25MB。上传会立即单独提交一次。
- **表单是 schema 驱动的**：`admin/js/schema.js` 声明字段，`fields.js` 负责渲染。字段类型包括 `text textarea markdown select toggle month number color image file tags lines list bilibili slug section`，可用选项见 `schema.js` 顶部注释。
- 后台安全性完全依赖 Token：`/admin/` 页面本身是公开的，但没有可写 Token 的人无法修改任何东西。

## 常见任务

### 直接改内容

编辑 `content/site.json`，图片放进 `uploads/`，然后运行 `node tools/check.mjs`。不需要改任何代码。

### 给某类数据新增一个字段（例：作品增加「时长」）

1. `assets/js/core.js` → `normalizeWork()` 加 `duration: str(w.duration)`。
2. `admin/js/schema.js` → `WORK` 数组合适位置加 `{ key: 'duration', label: '时长', type: 'text', when: (w) => w.type === 'video' }`。
3. `assets/js/site.js` → 在 `renderWork()` 的 `meta` 数组里加 `['时长', w.duration]`；需要的话 `card()` 也加。
4. 本文件的数据模型同步更新；如有约束，在 `tools/check.mjs` 加校验。

### 新增一种作品形式（例：音频）

1. `core.js` → `TYPES` 加 `audio: { label: '音频' }`。
2. `schema.js` → 为它加内容字段（如 `{ key: 'audio', type: 'text', when: (w) => w.type === 'audio' }`），并在 `normalizeWork()` 里规范化。
3. `site.js` → `renderWork()` 里 `let media` 的分支加上播放器；`card()` 里需要的话为无封面情况加占位。
4. 只用 iframe 或原生 `<audio>`，不引入第三方脚本。

### 改配色或字体

只改 `assets/css/style.css` 顶部两组主题变量（`--bg --surface --ink --line --gold …`）。强调色由数据里的 `site.accent` 覆盖 `--accent`。不要引入网络字体（见硬性约束 2）。

### 新增首页模块

在 `site.js` 写一个返回 HTML 字符串的 `xxxSec(data)`，在 `renderHome()` 里按顺序拼接；在 `Site.sections` 加开关（`normalize()` + `schema.js` 的 `SITE`），导航链接在 `renderHeader()` 的 `links` 数组里加。

## 本地运行与验证

```bash
python3 -m http.server 8000       # 或 npx serve；然后打开 http://localhost:8000
node tools/check.mjs              # 改完内容必须通过
```

后台在 `http://localhost:8000/admin/`，可以选「本地文件夹」直接写文件。

改完代码后至少检查以下几项：首页（含片头：清空 sessionStorage 后刷新）、`works.html`（网格 / 列表 / 筛选）、三种类型各一个 `work.html?id=…`、⌘K 搜索、站内跳转的幕布转场、`/admin/` 能连接并编辑、浅色和深色主题、390px 宽度的手机布局、系统「减少动态效果」开启时页面仍完整，浏览器控制台没有报错。

## 不要做的事

- 不要把内容写死在 HTML 或 JS 里，一切内容都来自 `site.json`。
- 不要把 Token 或任何密钥写进仓库。
- 不要改变 `site.json` 的现有字段名或语义。确需迁移时同时更新 `normalize()`，让旧数据继续可用。
- 不要使用 `localStorage` 存放内容数据（`cms:draft` 只是后台草稿和预览用的副本）。
- 不要删除 `.nojekyll`。
