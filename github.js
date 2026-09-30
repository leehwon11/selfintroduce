// 편집 모드에서 GitHub 레포에 직접 커밋하는 모듈
// 토큰은 이 브라우저(localStorage)에만 저장되고 코드에는 들어가지 않아요.
const KEY = 'intro-gh';

export function guessRepo() {
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return { owner: '', repo: '' };
  const owner = host.replace('.github.io', '');
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { owner, repo: seg || host };
}
export function loadCfg() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function saveCfg(cfg) { localStorage.setItem(KEY, JSON.stringify(cfg)); }
export function clearCfg() { localStorage.removeItem(KEY); }

const api = (cfg, path) => `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
const headers = (cfg) => ({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' });

function b64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64FromText = (t) => b64FromBytes(new TextEncoder().encode(t));
const textFromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function call(cfg, path, opts = {}) {
  const r = await fetch(api(cfg, path) + (opts.method ? '' : `?ref=${cfg.branch}`), { ...opts, headers: { ...headers(cfg), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = r.status === 401 ? '토큰이 올바르지 않아요'
      : r.status === 403 ? '토큰에 이 레포 쓰기 권한(Contents: Read and write)이 없어요'
      : r.status === 404 ? '레포나 파일을 찾을 수 없어요 (아이디/레포 이름 확인)'
      : j.message || '요청 실패';
    const e = new Error(msg); e.status = r.status; throw e;
  }
  return j;
}

// 레포의 최신 data.json (배포 전 내용까지)
export async function readData(cfg) {
  const j = await call(cfg, 'data.json');
  return { data: JSON.parse(textFromB64(j.content)), sha: j.sha };
}

export async function writeData(cfg, data, message = '소개 페이지 수정') {
  let sha;
  try { sha = (await call(cfg, 'data.json')).sha; } catch (e) { if (e.status !== 404) throw e; }
  const body = { message, content: b64FromText(JSON.stringify(data, null, 2) + '\n'), branch: cfg.branch, ...(sha ? { sha } : {}) };
  return call(cfg, 'data.json', { method: 'PUT', body: JSON.stringify(body) });
}

export async function uploadImage(cfg, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `images/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await call(cfg, path, { method: 'PUT', body: JSON.stringify({ message: `이미지 추가 ${path}`, content: b64FromBytes(bytes), branch: cfg.branch }) });
  return path;
}

export async function checkAccess(cfg) {
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, { headers: headers(cfg) });
  if (r.status === 401) throw new Error('토큰이 올바르지 않아요');
  if (r.status === 404) throw new Error('레포를 찾을 수 없어요 (아이디/레포 이름·토큰 권한 확인)');
  const j = await r.json();
  if (!j.permissions?.push) throw new Error('이 토큰으로는 레포에 쓸 수 없어요');
  return j.default_branch;
}
