// admin/js/adapters.js — 后台的三种存储方式，接口完全一致：
//
//   mode: 'github' | 'local' | 'offline'
//   label: 显示在侧边栏的说明
//   canUpload: 是否能写入二进制文件（上传图片/PDF）
//   connect(): 校验权限，失败时抛出带中文说明的 Error
//   readText(path) -> string           path 相对仓库根目录，如 'content/site.json'
//   writeText(path, text, message?)    message 只对 GitHub 有意义（提交说明）
//   writeFile(path, blob, message?)
//   previewUrl?(path) -> string|null   给后台缩略图用的可访问地址
//
// 新增一种存储（例如 Gitee）只需实现同样的接口，然后在 app.js 的连接界面里加入口。

const enc = encodeURIComponent;
const encPath = (p) => p.split('/').map(enc).join('/');

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function base64ToText(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghError(status, msg, path = '') {
  const m = {
    401: 'Token 无效或已过期，请重新生成。',
    403: '没有权限，或请求太频繁被 GitHub 限制了。请确认 Token 对这个仓库有 Contents 读写权限。',
    404: `找不到${path ? ` ${path}` : '仓库或分支'}。请检查用户名、仓库名、分支名，以及 Token 是否授权了这个仓库。`,
    409: '线上文件已被其他地方修改。请到「连接与数据」重新载入线上内容后再发布（未保存的修改可以先导出备份）。',
    422: '线上文件已被其他地方修改，或文件太大。请重新载入线上内容后再试。',
  }[status];
  const e = new Error(m || `GitHub 返回错误 ${status}：${msg}`);
  e.status = status;
  return e;
}

export class GitHubAdapter {
  constructor({ owner, repo, branch, token }) {
    this.mode = 'github';
    this.canUpload = true;
    this.owner = owner.trim();
    this.repo = repo.trim();
    this.branch = (branch || 'main').trim();
    this.token = token.trim();
    this.shas = {};
  }

  get label() { return `GitHub：${this.owner}/${this.repo}（${this.branch}）`; }

  async req(path, opt = {}, filePath = '') {
    const res = await fetch(`https://api.github.com/repos/${enc(this.owner)}/${enc(this.repo)}${path}`, {
      ...opt,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opt.headers || {}),
      },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch { /* 非 JSON */ }
      throw ghError(res.status, msg, filePath);
    }
    return res;
  }

  async connect() {
    const repo = await (await this.req('')).json();
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error('这个 Token 只能读、不能写。创建 Token 时请把 Contents 权限设为 Read and write。');
    }
    await this.req(`/branches/${enc(this.branch)}`, {}, `分支 ${this.branch}`);
    this.isPrivate = !!repo.private;
  }

  async readText(path) {
    const url = `/contents/${encPath(path)}?ref=${enc(this.branch)}`;
    const j = await (await this.req(url, {}, path)).json();
    this.shas[path] = j.sha;
    if (j.encoding === 'base64' && j.content) return base64ToText(j.content);
    // 大于 1MB 的文件 contents 接口不返回内容，改用 raw 读取
    return (await this.req(url, { headers: { Accept: 'application/vnd.github.raw+json' } }, path)).text();
  }

  async put(path, b64, message) {
    const body = { message, content: b64, branch: this.branch };
    if (this.shas[path]) body.sha = this.shas[path];
    const res = await this.req(`/contents/${encPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, path);
    const j = await res.json();
    if (j.content && j.content.sha) this.shas[path] = j.content.sha;
    return j;
  }

  async writeText(path, text, message) {
    return this.put(path, await blobToBase64(new Blob([text], { type: 'text/plain' })), message || `cms: 更新 ${path}`);
  }

  async writeFile(path, blob, message) {
    return this.put(path, await blobToBase64(blob), message || `cms: 上传 ${path}`);
  }

  // 公开仓库可以直接从 raw.githubusercontent.com 预览刚上传、还没部署的图片
  fallbackUrl(path) {
    return this.isPrivate ? null : `https://raw.githubusercontent.com/${enc(this.owner)}/${enc(this.repo)}/${enc(this.branch)}/${encPath(path)}`;
  }
}

export class LocalAdapter {
  constructor(dirHandle) {
    this.mode = 'local';
    this.canUpload = true;
    this.dir = dirHandle;
  }

  get label() { return `本地文件夹：${this.dir.name}`; }

  async connect() {
    if (this.dir.requestPermission) {
      const p = await this.dir.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') throw new Error('没有获得文件夹的读写权限。');
    }
    try {
      await this.handle('content/site.json');
    } catch {
      throw new Error(`「${this.dir.name}」里没有 content/site.json。请选择作品集项目的根文件夹（index.html 所在的那一层）。`);
    }
  }

  async handle(path, create = false) {
    const parts = path.split('/');
    let d = this.dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
    return d.getFileHandle(parts[parts.length - 1], { create });
  }

  async readText(path) {
    return (await (await this.handle(path)).getFile()).text();
  }

  async writeText(path, text) {
    const w = await (await this.handle(path, true)).createWritable();
    await w.write(text);
    await w.close();
  }

  async writeFile(path, blob) {
    const w = await (await this.handle(path, true)).createWritable();
    await w.write(blob);
    await w.close();
  }

  async previewUrl(path) {
    try { return URL.createObjectURL(await (await this.handle(path)).getFile()); } catch { return null; }
  }
}

export class OfflineAdapter {
  constructor() {
    this.mode = 'offline';
    this.canUpload = false;
    this.label = '仅浏览器（只能导出文件）';
  }

  async connect() {}

  async readText(path) {
    const res = await fetch(`../${path}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`读取 ${path} 失败（HTTP ${res.status}）`);
    return res.text();
  }

  async writeText(path, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async writeFile() {
    throw new Error('仅浏览器模式不能上传文件。请把文件放进 uploads/ 文件夹后手动填写路径。');
  }
}
