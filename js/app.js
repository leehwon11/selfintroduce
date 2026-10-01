import { guessRepo, loadCfg, saveCfg, clearCfg, readData, writeData, uploadImage, checkAccess } from './github.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const bar = document.getElementById('editbar');

let data = null;
let editing = false;
let dirty = false;
let cfg = null;
const blobs = {}; // 방금 올린 이미지 미리보기 (배포 전)

// ───────── 유틸 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const get = (path) => path.split('.').reduce((o, k) => o?.[k], data);
function set(path, val) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], data);
  obj[last] = val;
}
let tt;
function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), ms);
}
const imgSrc = (p) => (p ? blobs[p] || p : '');

// 편집 가능한 글자: T(경로, 클래스, 태그, 여러줄/굵게)
function T(path, cls = '', tag = 'span', multi = false) {
  const raw = get(path) ?? '';
  const html = editing ? esc(raw) : multi ? md(raw) : esc(raw);
  return `<${tag} class="${cls}" data-path="${path}" ${multi ? 'data-multi' : ''} aria-label="${editing ? '편집 가능한 글자' : ''}">${html}</${tag}>`;
}
const del = (listPath, i, label = '삭제') => `<button type="button" class="ed ed-del" data-del="${listPath}" data-i="${i}" aria-label="${label}">✕</button>`;
const add = (listPath, label) => `<button type="button" class="ed ed-add" data-add="${listPath}">+ ${label}</button>`;
const TEMPLATES = {
  'home.badges': () => ({ text: '새 뱃지', hot: false }),
  'info.rows': () => ({ label: '항목', text: '내용' }),
  'genre.list': () => '새 장르',
  'genre.favs': () => ({ genre: '장르', char: '최애 캐릭터', cp: '캐릭터 × 캐릭터' }),
  'dream.pairs': () => ({ image: '', genre: '장르', char: '드림캐', me: '드림주', pairname: '페어명', tags: '키워드' }),
  'ng.hard': () => '극지뢰 항목',
  'ng.soft': () => '지뢰 항목',
  'list.rows': () => ({ genre: '장르', chars: '캐릭터' }),
};

// ───────── 섹션 ─────────
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>',
  genre: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h10"/>',
  dream: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/>',
  ng: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  list: '<path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/>',
};
const PAGES = [['home', 'HOME'], ['info', 'INFO'], ['genre', 'GENRE'], ['dream', 'DREAM'], ['ng', 'NG'], ['list', 'LIST']];

const head = (label, title, sub = '') => `<header class="head"><div class="label">${label}</div><h1>${title}</h1>${sub}</header>`;

const VIEWS = {
  home: () => `
    <section class="home">
      <div class="avatar-wrap"><div class="avatar">${data.home.avatar ? `<img src="${esc(imgSrc(data.home.avatar))}" alt="인장">` : '인장'}</div></div>
      <button type="button" class="ed ed-small" data-img="home.avatar">인장 바꾸기</button>
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
        ${T('home.nick', 'nick', 'h1')}
        ${T('home.handle', 'muted')}
      </div>
      <div class="chips" style="justify-content:center;gap:8px">
        ${data.home.badges.map((b, i) => `<span style="display:inline-flex;gap:4px;align-items:center">
          ${T(`home.badges.${i}.text`, 'badge' + (b.hot ? ' hot' : ''))}
          <button type="button" class="ed ed-small" data-toggle="home.badges.${i}.hot" aria-pressed="${!!b.hot}">${b.hot ? '강조 끄기' : '강조'}</button>
          ${del('home.badges', i, '뱃지 삭제')}</span>`).join('')}
        ${add('home.badges', '뱃지')}
      </div>
      <div class="ed box" style="flex-direction:column;align-items:stretch;text-align:left;width:100%">
        <div class="box-title">브라우저 탭 제목 · 링크 미리보기 설명</div>
        ${T('site.title', 'block')}
        ${T('site.description', 'block muted')}
      </div>
    </section>`,

  info: () => `
    ${head('INFO', '성향')}
    <div class="box">
      <div class="kv">${data.info.rows.map((r, i) => `
        ${T(`info.rows.${i}.label`, 'k')}
        <div style="display:flex;gap:6px;align-items:flex-start">${T(`info.rows.${i}.text`, 'text', 'div', true)}${del('info.rows', i)}</div>`).join('')}
      </div>
      ${add('info.rows', '항목')}
    </div>
    <div class="box">
      <span class="pill-red">필독</span>
      ${T('info.notice', 'text', 'div', true)}
    </div>`,

  genre: () => `
    ${head('GENRE', '장르')}
    <div class="box">
      <div class="box-title">주력 장르</div>
      <div class="chips">${data.genre.list.map((g, i) => `<span style="display:inline-flex;gap:4px;align-items:center">${T(`genre.list.${i}`, 'chip')}${del('genre.list', i)}</span>`).join('')}${add('genre.list', '장르')}</div>
    </div>
    <div class="box">
      <div class="box-title">최애 · 소비 CP</div>
      ${data.genre.favs.map((f, i) => `
        <div class="row-line fav" style="display:flex;gap:8px">
          <div style="flex:1;display:flex;flex-direction:column;gap:4px">
            ${T(`genre.favs.${i}.genre`, 'g', 'div')}
            <div style="font-size:13px"><span class="muted">최애</span> · ${T(`genre.favs.${i}.char`)}</div>
            <div style="font-size:13px"><span class="muted">CP</span> · ${T(`genre.favs.${i}.cp`, 'cp')}</div>
          </div>${del('genre.favs', i)}
        </div>`).join('')}
      ${add('genre.favs', '최애 추가')}
    </div>`,

  dream: () => `
    ${head('DREAM', '드림')}
    <div class="box">
      <div class="box-title">드림 성향</div>
      ${T('dream.intro', 'text', 'div', true)}
    </div>
    ${data.dream.pairs.map((p, i) => `
      <article class="box">
        <div class="dream-card">
          <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
            <div class="dream-img">${p.image ? `<img src="${esc(imgSrc(p.image))}" alt="${esc(p.char)} × ${esc(p.me)}">` : '이미지'}</div>
            <button type="button" class="ed ed-small" data-img="dream.pairs.${i}.image">사진</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1">
            <div style="display:flex;gap:6px;align-items:center">${T(`dream.pairs.${i}.genre`, 'tag')}<span style="flex:1"></span>${del('dream.pairs', i, '드림 삭제')}</div>
            <div class="names">${T(`dream.pairs.${i}.char`)} <span class="x">×</span> ${T(`dream.pairs.${i}.me`)}</div>
            ${T(`dream.pairs.${i}.pairname`, 'muted', 'div')}
            ${editing
              ? `<div><span class="muted" style="font-size:12px">키워드 (쉼표로 구분)</span>${T(`dream.pairs.${i}.tags`, 'block')}</div>`
              : `<div class="chips" style="gap:5px">${String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>`}
          </div>
        </div>
      </article>`).join('')}
    ${add('dream.pairs', '드림 추가')}`,

  ng: () => `
    ${head('NG', '지뢰')}
    <div class="box hard">
      <div style="display:flex;align-items:center;gap:8px"><span class="big">극지뢰</span><span class="hard-badge">수용 불가능</span></div>
      ${T('ng.hardNote', '', 'div')}
      ${data.ng.hard.map((x, i) => `<div class="row-line ng-item"><span class="mark" aria-hidden="true">✕</span>${T(`ng.hard.${i}`, '', 'span')}<span style="flex:1"></span>${del('ng.hard', i)}</div>`).join('')}
      <button type="button" class="ed ed-add" data-add="ng.hard" style="color:#fff;border-color:#fff">+ 극지뢰</button>
    </div>
    <div class="box">
      <span class="big">지뢰</span>
      ${T('ng.softNote', 'muted', 'div')}
      ${data.ng.soft.map((x, i) => `<div class="row-line ng-item"><span class="mark" aria-hidden="true">✕</span>${T(`ng.soft.${i}`)}<span style="flex:1"></span>${del('ng.soft', i)}</div>`).join('')}
      ${add('ng.soft', '지뢰')}
    </div>`,

  list: () => `
    ${head('LIST', '배려 리스트', T('list.intro', 'sub', 'div'))}
    <div class="box">
      <div class="tbl">
        <div class="th">장르</div><div class="th">캐릭터</div>
        ${data.list.rows.map((r, i) => `${T(`list.rows.${i}.genre`, 'muted', 'div')}<div style="display:flex;gap:6px;align-items:center;font-weight:700">${T(`list.rows.${i}.chars`)}<span style="flex:1"></span>${del('list.rows', i)}</div>`).join('')}
      </div>
      ${add('list.rows', '맞배려 추가')}
    </div>
    ${T('list.note', 'muted', 'div')}`,
};

// ───────── 렌더 ─────────
function current() {
  const h = location.hash.replace('#', '');
  return PAGES.some(([k]) => k === h) ? h : 'home';
}

function render() {
  const page = current();
  document.title = data.site?.title || '소개';
  document.querySelector('meta[name=description]').content = data.site?.description || '';
  app.innerHTML = `
    <button type="button" class="edit-toggle" data-edit aria-label="편집 모드">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>편집
    </button>
    ${VIEWS[page]()}`;
  nav.innerHTML = PAGES.map(([k, l]) => `
    <a href="#${k}" class="${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${l}</span>
    </a>`).join('');
  bind();
}

function bind() {
  app.querySelector('[data-edit]').onclick = startEdit;
  if (!editing) return;
  app.querySelectorAll('[data-path]').forEach((el) => {
    try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.oninput = () => { set(el.dataset.path, el.innerText.replace(/\n$/, '')); dirty = true; };
    if (!el.hasAttribute('data-multi')) el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
    el.onpaste = (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); };
  });
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    get(b.dataset.del).splice(+b.dataset.i, 1); dirty = true; render();
  }));
  app.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    get(b.dataset.add).push(TEMPLATES[b.dataset.add]()); dirty = true; render();
    const items = app.querySelectorAll(`[data-path^="${b.dataset.add}."]`);
    items[items.length - 1]?.focus();
  }));
  app.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => {
    set(b.dataset.toggle, !get(b.dataset.toggle)); dirty = true; render();
  }));
  app.querySelectorAll('[data-img]').forEach((b) => (b.onclick = () => pickImage(b.dataset.img)));
}

// ───────── 편집 모드 ─────────
function modal(html) {
  const root = document.getElementById('modal-root');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  setTimeout(() => bg.querySelector('input,button')?.focus(), 30);
  return { el: bg.querySelector('.modal'), close };
}

function askToken() {
  return new Promise((resolve) => {
    const g = guessRepo();
    const m = modal(`
      <h2>편집 모드</h2>
      <p class="muted" style="margin:0;font-size:13px">GitHub 토큰은 이 브라우저에만 저장돼요. 처음 한 번만 넣으면 돼요.</p>
      <form style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label for="go">GitHub 아이디</label><input id="go" value="${esc(g.owner)}" required autocomplete="username"></div>
        <div class="field"><label for="gr">레포 이름</label><input id="gr" value="${esc(g.repo)}" required></div>
        <div class="field"><label for="gt">토큰</label><input id="gt" type="password" required autocomplete="current-password" placeholder="github_pat_…"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" data-x>취소</button><button class="btn primary">확인</button></div>
      </form>`);
    m.el.querySelector('[data-x]').onclick = () => { m.close(); resolve(null); };
    m.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const c = { owner: m.el.querySelector('#go').value.trim(), repo: m.el.querySelector('#gr').value.trim(), token: m.el.querySelector('#gt').value.trim() };
      const btn = e.submitter; btn.disabled = true; btn.textContent = '확인 중…';
      try {
        c.branch = await checkAccess(c);
        saveCfg(c); m.close(); resolve(c);
      } catch (err) { toast(err.message, 4000); btn.disabled = false; btn.textContent = '확인'; }
    };
  });
}

async function startEdit() {
  cfg = loadCfg() || (await askToken());
  if (!cfg) return;
  toast('최신 내용 불러오는 중…');
  try {
    data = (await readData(cfg)).data;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { clearCfg(); toast(e.message + ' — 다시 입력해주세요', 4000); return; }
    toast('불러오기 실패: ' + e.message, 4000); return;
  }
  editing = true; dirty = false;
  document.body.classList.add('editing');
  bar.hidden = false;
  bar.innerHTML = `
    <span class="grow">편집 중 · 점선 글자를 눌러 바로 고쳐요</span>
    <button type="button" class="quit" data-q>나가기</button>
    <button type="button" class="save" data-s>저장</button>`;
  bar.querySelector('[data-s]').onclick = save;
  bar.querySelector('[data-q]').onclick = quit;
  render();
  toast('편집 모드예요');
}

async function save() {
  const btn = bar.querySelector('[data-s]');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    await writeData(cfg, data);
    dirty = false;
    toast('저장했어요! 1~2분 뒤 사이트에 반영돼요', 3500);
  } catch (e) { toast('저장 실패: ' + e.message, 4500); }
  btn.disabled = false; btn.textContent = '저장';
}

function quit() {
  if (dirty && !confirm('저장하지 않은 수정이 있어요. 그래도 나갈까요?')) return;
  editing = false; dirty = false;
  document.body.classList.remove('editing');
  bar.hidden = true;
  render();
}

function pickImage(path) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('5MB 이하 이미지만 올릴 수 있어요'); return; }
    toast('이미지 올리는 중…');
    try {
      const p = await uploadImage(cfg, f);
      blobs[p] = URL.createObjectURL(f);
      set(path, p); dirty = true; render();
      toast('올렸어요. 저장을 눌러야 반영돼요');
    } catch (e) { toast('업로드 실패: ' + e.message, 4000); }
  };
  inp.click();
}

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ───────── 시작 ─────────
try {
  const r = await fetch('data.json?t=' + Date.now());
  if (!r.ok) throw new Error('data.json 을 찾을 수 없어요');
  data = await r.json();
  render();
} catch (e) {
  app.innerHTML = `<div class="box"><b>불러오지 못했어요</b><div class="muted">${esc(e.message)}</div></div>`;
}
