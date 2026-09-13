/* ===== Админка PELENEV.DESIGN v2: дашборд, заявки, кейсы, медиа, контент, SEO, интеграции ===== */
(() => {
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let values = {};        // контент сайта (ключ → значение)
let csrfToken = '';
let sources = null;     // распарсенные index/work.html для значений по умолчанию

/* ---------- Сеть ---------- */
const apiFetch = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (csrfToken && (options.method || 'GET').toUpperCase() !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
};
window.cmsApiFetch = apiFetch; // нужен gallery-tools.js

const getSession = async () => {
  const r = await fetch(`/api.php?action=session&_=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  if (!r.ok) throw new Error('Сессия недоступна');
  const data = await r.json();
  csrfToken = data.csrf || '';
  return data;
};

/* ---------- Тосты ---------- */
const toast = (message, type = '') => {
  if (!message) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` toast--${type}` : '');
  el.textContent = message;
  $('#toasts').append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 300); }, 3600);
};
/* gallery-tools пишет статусы в #status — транслируем их в тосты */
const statusEl = $('#status');
new MutationObserver(() => { if (statusEl.textContent) { toast(statusEl.textContent); statusEl.textContent = ''; } })
  .observe(statusEl, { childList: true, characterData: true, subtree: true });

/* ---------- Роутер разделов ---------- */
const TITLES = { dashboard: 'Дашборд', leads: 'Заявки', projects: 'Кейсы', services: 'Услуги', journal: 'Гайды', media: 'Медиатека', content: 'Контент сайта', seo: 'SEO', integrations: 'Интеграции' };
const loaded = {};
const loaders = {}; // заполняются ниже

const show = (name) => {
  if ($('#panel').hidden) return;          // до входа разделы не грузим
  if (!TITLES[name]) name = 'dashboard';
  $$('.section').forEach((s) => { s.hidden = s.dataset.section !== name; });
  $$('.side__nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === name));
  $('#crumbs').innerHTML = `<a href="#dashboard">Панель</a><span>/</span><b>${TITLES[name]}</b>`;
  $('#topsearch').value = '';
  applySearch('');
  if (!loaded[name] && loaders[name]) {
    loaded[name] = true;
    // при ошибке сбрасываем флаг: повторный заход в раздел загрузит его заново
    loaders[name]().catch((e) => { loaded[name] = false; toast(e.message || 'Ошибка загрузки', 'err'); });
  }
};
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* Поиск в активном разделе: фильтрует строки заявок, карточки медиа/кейсов и поля контента */
const applySearch = (q) => {
  const query = q.trim().toLowerCase();
  const section = $('.section:not([hidden])');
  if (!section) return;
  const match = (el) => el.textContent.toLowerCase().includes(query) || $$('input,textarea', el).some((i) => (i.value || '').toLowerCase().includes(query));
  $$('#leads-root tbody tr, .mcard, .project-admin-card, #content-form fieldset, #seo-form fieldset', section)
    .forEach((el) => { el.style.display = !query || match(el) ? '' : 'none'; });
};
$('#topsearch').addEventListener('input', (e) => applySearch(e.target.value));

/* ---------- Вход ---------- */
async function openPanel() {
  $('#login').hidden = true;
  $('#panel').hidden = false;
  show(location.hash.slice(1) || 'dashboard');
}

$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  const err = $('#login-error'); err.textContent = '';
  try {
    const r = await fetch('/api.php?action=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
    if (r.status === 401 || r.status === 429) { const b = await r.json().catch(() => ({})); err.textContent = b.error || 'Неверный пароль'; return; }
    if (!r.ok) { err.textContent = 'Сервер PHP не запущен. Откройте сайт через хостинг, а не статичное превью.'; return; }
    const data = await r.json().catch(() => ({}));
    if (data.csrf) csrfToken = data.csrf;
    await openPanel();
  } catch (_) { err.textContent = 'Не удалось подключиться к серверу.'; }
};

getSession().then((d) => { if (d?.authorized) openPanel(); }).catch(() => {});

/* ---------- Контент: значения по умолчанию из статичных страниц ---------- */
async function loadSources() {
  if (sources) return sources;
  const [home, work] = await Promise.all(['/index.html', '/work.html'].map((u) => fetch(u).then((r) => r.text())));
  sources = { home: new DOMParser().parseFromString(home, 'text/html'), work: new DOMParser().parseFromString(work, 'text/html') };
  return sources;
}
function valueFor(field, doc) {
  const [id, , type, selector, attr] = field;
  if (id in values && values[id] !== '') return values[id];
  const el = doc.querySelector(selector);
  if (!el) return '';
  if (type === 'image') return el.getAttribute(attr || 'src') || '';
  if (type === 'href') return el.getAttribute('href') || '';
  if (type === 'attr') return el.getAttribute(attr) || '';
  return el.textContent.trim();
}

function fieldRow(field, doc) {
  const [id, label, type] = field;
  const row = document.createElement('div');
  row.className = 'field';
  const val = valueFor(field, doc);
  if (type === 'image') {
    row.innerHTML = `<label>${esc(label)}<span class="image-row"><input data-id="${id}" value="${esc(val)}" type="url" placeholder="Ссылка на изображение"><button type="button">Загрузить</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></span></label>`;
    const [urlInput, fileInput] = $$('input', row);
    $('button', row).onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0]; if (!file) return;
      try { urlInput.value = await uploadFile(file); urlInput.dispatchEvent(new Event('input')); toast('Файл загружен. Не забудьте сохранить.', 'ok'); }
      catch (err) { toast(err.message || 'Не удалось загрузить файл', 'err'); }
    };
  } else if (type === 'href' || type === 'attr') {
    row.innerHTML = `<label>${esc(label)}<input data-id="${id}" value="${esc(val)}" type="text" placeholder="Ссылка или путь"></label>`;
  } else {
    row.innerHTML = `<label>${esc(label)}<textarea data-id="${id}">${esc(val)}</textarea></label>`;
  }
  return row;
}

async function buildContentForms() {
  await getContent();
  await loadSources();
  const contentForm = $('#content-form');
  const seoForm = $('#seo-form');
  contentForm.innerHTML = ''; seoForm.innerHTML = '';
  window.CMS_SCHEMA.forEach((group) => {
    const target = group.section.startsWith('SEO') ? seoForm : contentForm;
    const fs = document.createElement('fieldset');
    fs.innerHTML = `<legend>${esc(group.section)}</legend>`;
    const doc = sources[group.page || 'home'];
    group.fields.forEach((f) => fs.append(fieldRow(f, doc)));
    target.append(fs);
  });
  /* интеграции: подставляем сохранённые коды */
  $$('#integrations-form [data-id]').forEach((t) => { t.value = values[t.dataset.id] || ''; });
  if (!contentForm.children.length) throw new Error('Форма CMS не построена');
}

async function getContent() {
  const r = await apiFetch(`/api.php?action=content&_=${Date.now()}`, { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Не удалось получить контент');
  values = data;
}

async function saveContent() {
  $$('[data-id]').forEach((el) => { values[el.dataset.id] = el.value; });
  const saved = { ...values };
  let session = await getSession();
  if (!session.authorized) throw new Error('Сессия закончилась. Войдите заново.');
  let r = await apiFetch('/api.php?action=content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) });
  if (r.status === 401 || r.status === 419) {
    session = await getSession();
    if (session.authorized) r = await apiFetch('/api.php?action=content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) });
  }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Ошибка сохранения (${r.status})`); }
  await getContent();
  const ok = Object.keys(saved).every((k) => (values[k] ?? '') === (saved[k] ?? ''));
  if (!ok) throw new Error('Сервер вернул старую версию — сохраните ещё раз.');
}
$$('[data-save]').forEach((btn) => btn.addEventListener('click', async () => {
  btn.disabled = true;
  try { await saveContent(); toast('Изменения опубликованы.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
  btn.disabled = false;
}));

/* Превью обложки: показывает, что именно выбрано — картинку или видео.
   Один помощник на кейсы и статьи, вешается на поле [name=cover]. */
function wireCoverPreview(editor) {
  const input = $('[name=cover]', editor);
  const box = $('[data-cover-preview]', editor);
  if (!input || !box) return;
  const isVideo = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(String(u || ''));
  const draw = () => {
    const v = input.value.trim();
    if (!v) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = isVideo(v)
      ? `<video src="${esc(v)}" muted loop playsinline autoplay preload="metadata"></video><span class="cover-preview__tag">видео</span>`
      : `<img src="${esc(v)}" alt="">`;
  };
  input.addEventListener('input', draw);
  input.addEventListener('change', draw);
  draw();
  return draw;
}

async function uploadFile(file) {
  const data = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(new Error('Не удалось прочитать файл')); r.readAsDataURL(file); });
  const r = await apiFetch('/api.php?action=upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data }) });
  const res = await r.json();
  if (!r.ok) throw new Error(res.error || 'Не удалось загрузить файл');
  return res.url;
}

loaders.content = buildContentForms;
loaders.seo = buildContentForms;
loaders.integrations = buildContentForms;

/* ---------- Дашборд ---------- */
loaders.dashboard = async () => {
  const r = await apiFetch(`/api.php?action=dashboard&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.leads) throw new Error(d.error || 'Не удалось загрузить дашборд. Проверьте, что на хостинге обновлён api.php.');
  const badge = $('#nav-leads-badge');
  if (d.leads.new > 0) { badge.hidden = false; badge.textContent = d.leads.new; } else badge.hidden = true;
  const fmtDate = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const logNames = { lead: 'Новая заявка', 'project-save': 'Кейс сохранён', 'project-delete': 'Кейс удалён', 'content-save': 'Контент обновлён' };
  $('#dashboard-root').innerHTML = `
    <div class="dstats">
      <div class="dstat is-hot"><b>${d.leads.new}</b><span>Новые заявки</span></div>
      <div class="dstat"><b>${d.leads.today}</b><span>Заявок сегодня</span></div>
      <div class="dstat"><b>${d.leads.week}</b><span>За 7 дней</span></div>
      <div class="dstat"><b>${d.leads.month}</b><span>За 30 дней</span></div>
    </div>
    <div class="dcols">
      <div class="card dlist"><h3>Последние заявки</h3>${
        d.recentLeads.length
          ? d.recentLeads.map((l) => `<div class="row"><a href="#leads">${esc(l.name)} — ${esc(l.contact)}</a><span>${fmtDate(l.created_at)}</span></div>`).join('')
          : '<p class="dnote">Заявок пока нет.</p>'
      }</div>
      <div class="card dlist"><h3>Последние кейсы</h3>${
        d.recentProjects.length
          ? d.recentProjects.map((p) => `<div class="row"><a href="#projects">${esc(p.title)}</a><span>${fmtDate(p.updated_at)}</span></div>`).join('')
          : '<p class="dnote">Кейсов пока нет.</p>'
      }</div>
    </div>
    <div class="card dlist"><h3>Последние действия</h3>${
      d.log.length
        ? d.log.map((e) => `<div class="row"><span style="flex:none">${logNames[e.event] || esc(e.event)}</span><a>${esc(e.title)}</a><span>${fmtDate(e.created_at)}</span></div>`).join('')
        : '<p class="dnote">Журнал пуст.</p>'
    }</div>
    <p class="dnote">Популярные страницы появятся после подключения Яндекс Метрики (раздел «Интеграции») — статистика смотрится в её кабинете.</p>`;
};

/* ---------- Заявки ---------- */
const LEAD_STATUSES = [['new', 'Новая'], ['work', 'В работе'], ['done', 'Завершена']];
let leadsCache = [];
let leadFilter = 'all';

loaders.leads = async () => {
  renderLeadFilters();
  await refreshLeads();
};
async function refreshLeads() {
  const r = await apiFetch(`/api.php?action=leads&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  // без проверки r.ok ошибка сервера выглядела бы как честное «заявок нет»
  if (!r.ok || !Array.isArray(d.leads)) throw new Error(d.error || 'Не удалось загрузить заявки.');
  leadsCache = d.leads;
  renderLeads();
}
function renderLeadFilters() {
  const box = $('#lead-filters');
  const chips = [['all', 'Все'], ...LEAD_STATUSES];
  box.innerHTML = chips.map(([v, l]) => `<button type="button" class="chip${leadFilter === v ? ' is-active' : ''}" data-f="${v}">${l}</button>`).join('');
  $$('.chip', box).forEach((c) => c.onclick = () => { leadFilter = c.dataset.f; renderLeadFilters(); renderLeads(); });
}
function renderLeads() {
  const root = $('#leads-root');
  const rows = leadsCache.filter((l) => leadFilter === 'all' || (l.status || 'new') === leadFilter);
  if (!rows.length) { root.innerHTML = '<p class="lempty">Заявок нет. Новые придут с формы на сайте и на почту.</p>'; return; }
  const fmt = (s) => new Date(s.replace(' ', 'T')).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  root.innerHTML = `<table class="ltable"><thead><tr><th>Дата</th><th>Имя</th><th>Контакт</th><th>Сообщение</th><th>Статус</th></tr></thead><tbody>${
    rows.map((l) => `<tr class="${(l.status || 'new') === 'new' ? 'is-new' : ''}">
      <td>${fmt(l.created_at)}</td>
      <td><b>${esc(l.name)}</b></td>
      <td>${esc(l.contact)}<br><small style="color:var(--muted)">${esc(l.contact_type)}</small></td>
      <td class="msg">${esc(l.message)}</td>
      <td><select class="lstatus" data-v="${esc(l.status || 'new')}" data-lead="${l.id}">${
        LEAD_STATUSES.map(([v, t]) => `<option value="${v}"${(l.status || 'new') === v ? ' selected' : ''}>${t}</option>`).join('')
      }</select></td></tr>`).join('')
  }</tbody></table>`;
  $$('.lstatus', root).forEach((sel) => sel.onchange = async () => {
    const r = await apiFetch('/api.php?action=lead-status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +sel.dataset.lead, status: sel.value }) });
    if (!r.ok) { toast('Не удалось обновить статус', 'err'); return; }
    sel.dataset.v = sel.value;
    const lead = leadsCache.find((l) => l.id == sel.dataset.lead);
    if (lead) lead.status = sel.value;
    toast('Статус обновлён', 'ok');
    loaded.dashboard = false; // обновим счётчики при следующем входе
  });
}

/* ---------- Кейсы ---------- */
const CATS = [['site', 'Сайты'], ['ai-site', 'AI-сайты'], ['ai-content', 'AI-контент'], ['graphic', 'Дизайн']];
const PSTATUSES = [['published', 'Опубликован'], ['draft', 'Черновик'], ['hidden', 'Скрыт']];
let projects = [];

loaders.projects = loadProjects;
async function loadProjects() {
  const r = await apiFetch(`/api.php?action=projects&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Не удалось загрузить кейсы');
  projects = d.projects || [];
  renderProjects();
}
function renderProjects() {
  const list = $('#project-list');
  const pl = (s) => PSTATUSES.find(([v]) => v === s)?.[1] || s;
  list.innerHTML = projects.map((p) => `
    <article class="project-admin-card" draggable="true" data-id="${p.id}">
      <img src="${esc(p.cover || (p.gallery || [])[0] || '')}" alt="">
      <div class="grow"><h3>${esc(p.title)}</h3>
        <p>${esc((p.categories || []).map((c) => CATS.find(([v]) => v === c)?.[1] || c).join(', ') || 'Без категории')}</p></div>
      <span class="pbadge" data-v="${esc(p.status || 'published')}">${pl(p.status || 'published')}</span>
      <div class="project-admin-actions">
        <button type="button" data-edit="${p.id}">Изменить</button>
        <button type="button" data-delete="${p.id}">Удалить</button>
      </div>
    </article>`).join('') || '<p class="lempty">Кейсов пока нет — создайте первый.</p>';

  $$('[data-edit]', list).forEach((b) => b.onclick = () => editProject(projects.find((p) => p.id == b.dataset.edit)));
  $$('[data-delete]', list).forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить этот кейс безвозвратно?')) return;
    const r = await apiFetch(`/api.php?action=project&id=${b.dataset.delete}`, { method: 'DELETE' });
    if (!r.ok) { toast('Не удалось удалить кейс', 'err'); return; }
    toast('Кейс удалён', 'ok');
    await loadProjects();
  });

  /* порядок drag & drop */
  let dragId = null;
  $$('.project-admin-card', list).forEach((card) => {
    card.ondragstart = () => { dragId = card.dataset.id; card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
    card.ondragover = (e) => e.preventDefault();
    card.ondrop = async () => {
      const ids = $$('.project-admin-card', list).map((x) => x.dataset.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(card.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      const r = await apiFetch('/api.php?action=projects-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (!r.ok) { toast('Не удалось изменить порядок', 'err'); return; }
      toast('Порядок сохранён', 'ok');
      await loadProjects();
    };
  });
}
$('#project-new').onclick = () => editProject();

function editProject(project = {}) {
  const editor = $('#project-editor');
  let gallery = [...(project.gallery || [])];
  editor.hidden = false;
  editor.dataset.projectId = project.id || '0';
  editor.innerHTML = `
    <h3>${project.id ? 'Редактировать кейс' : 'Новый кейс'}</h3>
    <div class="project-editor__grid">
      <label>Название<input name="title" value="${esc(project.title)}" required></label>
      <label>ЧПУ (слаг)<input name="slug" value="${esc(project.slug)}" placeholder="автоматически из заголовка"><span class="project-editor__hint">Итоговый адрес: /case/&lt;слаг&gt;/</span></label>
      <label>Статус<select name="status">${PSTATUSES.map(([v, t]) => `<option value="${v}"${(project.status || 'published') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="project-editor__wide">Категории<span class="project-editor__cats">${CATS.map(([id, label]) => `<label><input type="checkbox" name="categories" value="${id}"${(project.categories || []).includes(id) ? ' checked' : ''}>${label}</label>`).join('')}</span></label>
      <label>Клиент<input name="client" value="${esc(project.client)}"></label>
      <label>Сфера деятельности (для SEO, на странице кейса не показывается)<input name="industry" value="${esc(project.industry)}"></label>
      <label>Срок разработки<input name="duration" value="${esc(project.duration)}"></label>
      <label>Решение<input name="services" value="${esc(project.services)}" placeholder="Например: Веб-дизайн, разработка"></label>
      <label class="project-editor__wide">Ссылка на готовый проект<input name="project_url" type="url" value="${esc(project.project_url)}"></label>
      <label class="project-editor__wide">Описание кейса (первый экран, 8–10 строк)<textarea name="description" rows="8">${esc(project.description)}</textarea><span class="project-editor__hint">Пустая строка создаёт новый абзац. Начните строку с «—», «-» или «•», чтобы оформить пункт списка.</span></label>

      <div class="project-editor__wide">
        <label>Достижения проекта — три плитки на первом экране</label>
        <span class="project-editor__hint">Показываются слева под описанием. Порядок — слева направо, как заполнены. Числа анимируются при появлении. Оставьте плитку пустой, чтобы её не выводить; если не заполнить ни одной, на странице покажется прежняя таблица «Решение / Сроки».</span>
        <div class="pstats">
          ${[0, 1, 2].map((i) => {
            const s = (project.stats || [])[i] || {};
            return `<div class="pstats__card">
              <span class="pstats__num">${i + 1}</span>
              <label>Значение<input name="stat_value_${i}" value="${esc(s.value)}" placeholder="98/100, +320%, TOP 5" maxlength="24"></label>
              <label>Заголовок<input name="stat_title_${i}" value="${esc(s.title)}" placeholder="PageSpeed" maxlength="60"></label>
              <label>Пояснение<input name="stat_text_${i}" value="${esc(s.text)}" placeholder="необязательно" maxlength="140"></label>
            </div>`;
          }).join('')}
        </div>
      </div>
      <label class="project-editor__wide">Титульное фото или видео<span class="image-row"><input name="cover" value="${esc(project.cover)}" placeholder="URL файла или загрузите кнопкой справа"><input id="project-cover-file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden><button type="button" id="cover-upload">Загрузить</button></span><span class="cover-preview" data-cover-preview></span><span class="project-editor__hint">Можно загрузить видео (MP4/WEBM) — на сайте оно будет играть без звука, зациклено. Для соцсетей у видео возьмётся запасная картинка.</span></label>
      <div class="project-editor__wide">
        <label>Галерея (перетаскивайте для смены порядка)</label>
        <div class="project-gallery" id="project-gallery"></div>
        <div class="project-editor__drop">Перетащите фото или видео сюда либо нажмите, чтобы выбрать<input id="gallery-files" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple></div><span class="project-editor__hint">Фото и видео лежат в одной галерее и показываются в том же порядке. Видео на сайте играет без звука, звук и полный экран — по наведению. Ограничение: 10 МБ на фото, 25 МБ на видео.</span>
      </div>
      <div class="project-editor__wide">
        <label>Контент кейса — блоки статьи (перетаскивайте карточки для смены порядка)</label>
        <div class="cb-list" id="case-blocks"></div>
        <div class="cb-toolbar">
          <button type="button" data-add-block="heading">+ Подзаголовок</button>
          <button type="button" data-add-block="text">+ Текст</button>
          <button type="button" data-add-block="quote">+ Цитата</button>
          <button type="button" data-add-block="image">+ Фото</button>
          <button type="button" data-add-block="duo">+ Два фото</button>
          <button type="button" data-add-block="stats">+ Цифры</button>
        </div>
      </div>
    </div>
    <div class="project-editor__buttons">
      <button type="submit" class="btn btn--primary">Сохранить кейс</button>
      <button type="button" class="btn" id="project-cancel">Отмена</button>
    </div>`;

  const galleryEl = $('#project-gallery', editor);
  const renderGallery = () => {
    const isVid = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(String(u));
    galleryEl.innerHTML = gallery.map((src, i) => `<div class="project-gallery__item${isVid(src) ? ' is-video' : ''}" draggable="true" data-index="${i}">${
      isVid(src)
        ? `<video src="${esc(src)}" muted loop playsinline autoplay preload="metadata"></video><span class="project-gallery__tag">видео</span>`
        : `<img src="${esc(src)}" alt="">`
    }<button type="button" data-remove="${i}">×</button></div>`).join('');
    $$('[data-remove]', galleryEl).forEach((b) => b.onclick = () => { gallery.splice(+b.dataset.remove, 1); renderGallery(); });
    let drag = null;
    $$('.project-gallery__item', galleryEl).forEach((item) => {
      item.ondragstart = () => { drag = +item.dataset.index; };
      item.ondragover = (e) => e.preventDefault();
      item.ondrop = () => { const t = +item.dataset.index; gallery.splice(t, 0, gallery.splice(drag, 1)[0]); renderGallery(); };
    });
  };
  renderGallery();

  /* ---------- Блоки статьи ---------- */
  const BLOCK_LABELS = { heading: 'Подзаголовок', text: 'Текст', quote: 'Цитата', image: 'Фото', duo: 'Два фото', stats: 'Цифры' };
  const NEW_BLOCK = {
    heading: () => ({ type: 'heading', text: '' }),
    text: () => ({ type: 'text', text: '' }),
    quote: () => ({ type: 'quote', text: '', author: '' }),
    image: () => ({ type: 'image', src: '', caption: '', size: 'wide' }),
    duo: () => ({ type: 'duo', items: [{ src: '', caption: '' }, { src: '', caption: '' }] }),
    stats: () => ({ type: 'stats', items: [{ value: '', label: '' }] }),
  };
  // deep-клон: объект попадает сюда из общего кэша projects, править на месте нельзя —
  // испортит список карточек до сохранения (и вид при повторном открытии после «Отмена»).
  let blocks = JSON.parse(JSON.stringify(project.blocks || []));
  window.getCaseBlocksForSave = () => blocks; // читает gallery-tools.js при автосохранении порядка/замены фото

  const imageRowHTML = (i, j, src, uploadCls, fileCls) => `<span class="image-row">
      <input class="cb-input" type="url" data-i="${i}"${j != null ? ` data-j="${j}"` : ''} data-k="src" value="${esc(src)}" placeholder="URL изображения">
      <button type="button" class="${uploadCls}" data-i="${i}"${j != null ? ` data-j="${j}"` : ''}>Загрузить</button>
      <input type="file" class="${fileCls}" data-i="${i}"${j != null ? ` data-j="${j}"` : ''} accept="image/*" hidden>
    </span>`;

  const blockBodyHTML = (b, i) => {
    if (b.type === 'heading') return `<input class="cb-input" data-i="${i}" data-k="text" value="${esc(b.text)}" placeholder="Текст подзаголовка">`;
    if (b.type === 'text') return `<textarea class="cb-input" data-i="${i}" data-k="text" placeholder="Пустая строка между строками — новый абзац">${esc(b.text)}</textarea>`;
    if (b.type === 'quote') return `<textarea class="cb-input" data-i="${i}" data-k="text" placeholder="Текст цитаты">${esc(b.text)}</textarea><input class="cb-input" data-i="${i}" data-k="author" value="${esc(b.author)}" placeholder="Автор (необязательно)">`;
    if (b.type === 'image') return `${imageRowHTML(i, null, b.src, 'cb-upload', 'cb-file')}
      <select class="cb-input" data-i="${i}" data-k="size">
        <option value="inset"${b.size === 'inset' ? ' selected' : ''}>Уже колонки текста</option>
        <option value="wide"${b.size !== 'inset' && b.size !== 'full' ? ' selected' : ''}>Шире колонки текста</option>
        <option value="full"${b.size === 'full' ? ' selected' : ''}>Во всю ширину</option>
      </select>
      <input class="cb-input" data-i="${i}" data-k="caption" value="${esc(b.caption)}" placeholder="Подпись (необязательно)">`;
    if (b.type === 'duo') return `<div class="cb-duo">${(b.items || []).slice(0, 2).map((item, j) => `<div class="cb-duo-item">${imageRowHTML(i, j, item.src, 'cb-duo-upload', 'cb-duo-file')}<input class="cb-duo-input" data-i="${i}" data-j="${j}" data-k="caption" value="${esc(item.caption)}" placeholder="Подпись"></div>`).join('')}</div>`;
    if (b.type === 'stats') return `<div class="cb-stats">${(b.items || []).map((item, j) => `<div class="cb-stat-item">
        <input class="cb-stat-input" data-i="${i}" data-j="${j}" data-k="value" value="${esc(item.value)}" placeholder="+64%">
        <input class="cb-stat-input" data-i="${i}" data-j="${j}" data-k="label" value="${esc(item.label)}" placeholder="Подпись показателя">
        <button type="button" class="cb-stat-remove" data-i="${i}" data-j="${j}" aria-label="Удалить показатель">×</button>
      </div>`).join('')}<button type="button" class="cb-stat-add" data-i="${i}"${(b.items || []).length >= 4 ? ' disabled' : ''}>+ Показатель</button></div>`;
    return '';
  };

  const blocksEl = $('#case-blocks', editor);
  const renderBlocks = () => {
    blocksEl.innerHTML = blocks.map((b, i) => `<div class="cb-card" draggable="true" data-index="${i}">
      <div class="cb-head"><span class="cb-type">${BLOCK_LABELS[b.type] || b.type}</span><button type="button" class="cb-remove" data-i="${i}" aria-label="Удалить блок">×</button></div>
      <div class="cb-body">${blockBodyHTML(b, i)}</div>
    </div>`).join('');
    bindBlockEvents();
  };

  const bindBlockEvents = () => {
    $$('.cb-input', blocksEl).forEach((el) => el.addEventListener('input', () => {
      const { i, k } = el.dataset;
      if ('j' in el.dataset) { const j = +el.dataset.j; blocks[i].items[j][k] = el.value; }
      else blocks[i][k] = el.value;
    }));
    $$('.cb-duo-input, .cb-stat-input', blocksEl).forEach((el) => el.addEventListener('input', () => {
      blocks[el.dataset.i].items[el.dataset.j][el.dataset.k] = el.value;
    }));
    $$('.cb-remove', blocksEl).forEach((b) => b.onclick = () => { blocks.splice(+b.dataset.i, 1); renderBlocks(); });
    $$('.cb-stat-remove', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.splice(+b.dataset.j, 1); renderBlocks(); });
    $$('.cb-stat-add', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.push({ value: '', label: '' }); renderBlocks(); });
    const wireUpload = (btnSel, apply) => $$(btnSel, blocksEl).forEach((btn) => {
      const file = btn.nextElementSibling;
      btn.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        try { apply(btn.dataset, await uploadFile(f)); renderBlocks(); toast('Изображение загружено', 'ok'); }
        catch (err) { toast(err.message || 'Не удалось загрузить файл', 'err'); }
      };
    });
    wireUpload('.cb-upload', (d, url) => { blocks[d.i].src = url; });
    wireUpload('.cb-duo-upload', (d, url) => { blocks[d.i].items[d.j].src = url; });
    /* перетаскивание карточек — тот же паттерн, что у галереи фото и списка кейсов */
    let dragIndex = null;
    $$('.cb-card', blocksEl).forEach((card) => {
      card.ondragstart = () => { dragIndex = +card.dataset.index; card.classList.add('dragging'); };
      card.ondragend = () => card.classList.remove('dragging');
      card.ondragover = (e) => e.preventDefault();
      card.ondrop = () => { const to = +card.dataset.index; if (dragIndex === null || dragIndex === to) return; blocks.splice(to, 0, blocks.splice(dragIndex, 1)[0]); renderBlocks(); };
    });
  };
  renderBlocks();

  $$('[data-add-block]', editor).forEach((btn) => btn.onclick = () => {
    blocks.push(NEW_BLOCK[btn.dataset.addBlock]());
    renderBlocks();
    blocksEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  wireCoverPreview(editor);
  $('#cover-upload', editor).onclick = () => $('#project-cover-file', editor).click();
  $('#project-cover-file', editor).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { editor.querySelector('[name=cover]').value = await uploadFile(f); editor.querySelector('[name=cover]').dispatchEvent(new Event('input')); toast('Титульный файл загружен', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  };
  const addFiles = async (files) => {
    try { for (const f of files) gallery.push(await uploadFile(f)); renderGallery(); toast('Файлы добавлены', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#gallery-files', editor).onchange = (e) => addFiles(e.target.files);
  const drop = $('.project-editor__drop', editor);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-dragover'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-dragover'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  $('#project-cancel', editor).onclick = () => { editor.hidden = true; };
  editor.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(editor));
    data.id = project.id || 0;
    data.categories = $$('[name=categories]:checked', editor).map((x) => x.value);
    data.gallery = gallery;
    data.blocks = blocks;
    /* Плоские поля формы сворачиваем в массив и убираем из payload,
       иначе они уедут в API мусорными ключами. */
    data.stats = [0, 1, 2].map((i) => ({
      value: (data[`stat_value_${i}`] || '').trim(),
      title: (data[`stat_title_${i}`] || '').trim(),
      text: (data[`stat_text_${i}`] || '').trim(),
    }));
    [0, 1, 2].forEach((i) => { delete data[`stat_value_${i}`]; delete data[`stat_title_${i}`]; delete data[`stat_text_${i}`]; });
    try {
      const r = await apiFetch('/api.php?action=project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) { toast((await r.json()).error || 'Не удалось сохранить', 'err'); return; }
      editor.hidden = true;
      toast(data.status === 'draft' ? 'Черновик сохранён' : 'Кейс сохранён и опубликован', 'ok');
      await loadProjects();
    } catch (err) { toast(err.message || 'Не удалось сохранить', 'err'); }
  };
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Гайды ---------- */
const STATUS_LABELS = { draft: 'Черновик', scheduled: 'Запланирована', published: 'Опубликована', hidden: 'Скрыта' };
let jCategories = [];
let jTags = [];
let articlesCache = [];
let activeJTab = 'articles';

loaders.journal = async () => {
  setupJTabs();
  await loadTaxonomy();
  await loadArticles();
};

function setupJTabs() {
  $$('.jtabs [data-jtab]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.onclick = () => {
      activeJTab = btn.dataset.jtab;
      $$('.jtabs [data-jtab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('.jtab-panel').forEach((p) => { p.hidden = p.dataset.jtabPanel !== activeJTab; });
      if (activeJTab === 'analytics') loadJournalAnalytics();
    };
  });
}

/* ---- Категории и теги ---- */
async function loadTaxonomy() {
  const [catRes, tagRes] = await Promise.all([
    apiFetch(`/api.php?action=journal-categories&_=${Date.now()}`, { cache: 'no-store' }),
    apiFetch(`/api.php?action=journal-tags&_=${Date.now()}`, { cache: 'no-store' }),
  ]);
  jCategories = (await catRes.json().catch(() => ({}))).categories || [];
  jTags = (await tagRes.json().catch(() => ({}))).tags || [];
  renderTaxonomy();
}
function renderTaxonomy() {
  const catNames = Object.fromEntries(jCategories.map((c) => [c.id, c.name]));
  const catList = $('#category-list');
  catList.innerHTML = jCategories.length ? jCategories.map((c) => `
    <div class="jtax-row" data-id="${c.id}">
      <span>${esc(c.name)}${c.parent_id ? ` <small>— ${esc(catNames[c.parent_id] || '')}</small>` : ''}</span>
      <button type="button" data-del-cat="${c.id}">Удалить</button>
    </div>`).join('') : '<p class="lempty">Категорий пока нет.</p>';
  $$('[data-del-cat]', catList).forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить категорию?')) return;
    const r = await apiFetch(`/api.php?action=journal-categories&id=${b.dataset.delCat}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.error || 'Не удалось удалить категорию', 'err'); return; }
    toast('Категория удалена', 'ok');
    await loadTaxonomy();
  });
  const parentSelect = $('#category-form [name=parent_id]');
  parentSelect.innerHTML = '<option value="0">Без родителя</option>' + jCategories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  const tagList = $('#tag-list');
  tagList.innerHTML = jTags.length ? jTags.map((t) => `
    <div class="jtax-row" data-id="${t.id}">
      <span>${esc(t.name)}</span>
      <button type="button" data-del-tag="${t.id}">Удалить</button>
    </div>`).join('') : '<p class="lempty">Тегов пока нет.</p>';
  $$('[data-del-tag]', tagList).forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить тег?')) return;
    const r = await apiFetch(`/api.php?action=journal-tags&id=${b.dataset.delTag}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.error || 'Не удалось удалить тег', 'err'); return; }
    toast('Тег удалён', 'ok');
    await loadTaxonomy();
  });

  if (typeof window.__refreshArticleTaxonomyPicker === 'function') window.__refreshArticleTaxonomyPicker();
}
$('#category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  if (!name) return;
  const r = await apiFetch('/api.php?action=journal-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent_id: +form.parent_id.value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'Не удалось сохранить категорию', 'err'); return; }
  form.reset();
  toast('Категория добавлена', 'ok');
  await loadTaxonomy();
});
$('#tag-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  if (!name) return;
  const r = await apiFetch('/api.php?action=journal-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'Не удалось сохранить тег', 'err'); return; }
  form.reset();
  toast('Тег добавлен', 'ok');
  await loadTaxonomy();
});

/* ---- Аналитика ---- */
async function loadJournalAnalytics() {
  const root = $('#journal-analytics-root');
  const r = await apiFetch(`/api.php?action=journal-analytics&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'Не удалось загрузить аналитику', 'err'); return; }
  const fmtDate = (s) => s ? new Date(s.replace(' ', 'T')).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
  root.innerHTML = `
    <div class="dstats"><div class="dstat is-hot"><b>${d.totalViews || 0}</b><span>Просмотров всего</span></div></div>
    <div class="dcols">
      <div class="card dlist"><h3>Популярные статьи</h3>${
        (d.topArticles || []).length ? d.topArticles.map((a) => `<div class="row"><span>${esc(a.title)}</span><span>${a.views}</span></div>`).join('') : '<p class="dnote">Пока нет данных.</p>'
      }</div>
      <div class="card dlist"><h3>Читаемые категории</h3>${
        (d.topCategories || []).length ? d.topCategories.map((c) => `<div class="row"><span>${esc(c.name)}</span><span>${c.views}</span></div>`).join('') : '<p class="dnote">Пока нет данных.</p>'
      }</div>
    </div>
    <div class="card dlist"><h3>Последние публикации</h3>${
      (d.recent || []).length ? d.recent.map((a) => `<div class="row"><span>${esc(a.title)}</span><span>${fmtDate(a.published_at)}</span></div>`).join('') : '<p class="dnote">Пока нет статей.</p>'
    }</div>
    <p class="dnote">Просмотры считаются на сайте. Подключите Яндекс.Метрику в разделе «Интеграции», чтобы дополнительно видеть источники трафика.</p>`;
}

/* ---- Список статей ---- */
async function loadArticles() {
  const r = await apiFetch(`/api.php?action=journal-articles&limit=200&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'Не удалось загрузить статьи', 'err'); return; }
  articlesCache = d.items || [];
  renderArticles();
}
function renderArticles() {
  const list = $('#article-list');
  const catNames = Object.fromEntries(jCategories.map((c) => [c.id, c.name]));
  list.innerHTML = articlesCache.length ? articlesCache.map((a) => `
    <article class="project-admin-card" data-id="${a.id}">
      <img src="${esc(a.cover)}" alt="">
      <div class="grow"><h3>${esc(a.title)}</h3>
        <p>${esc((a.category_ids || []).map((id) => catNames[id]).filter(Boolean).join(', ') || 'Без категории')} · ${a.views} просм. · ${a.reading_time_min} мин чтения</p></div>
      <span class="pbadge" data-v="${a.status === 'published' ? 'published' : (a.status === 'draft' ? 'draft' : 'hidden')}">${STATUS_LABELS[a.status] || a.status}</span>
      <div class="project-admin-actions">
        <button type="button" data-edit-article="${a.id}">Изменить</button>
        <button type="button" data-dup-article="${a.id}">Дублировать</button>
        <button type="button" data-del-article="${a.id}">Удалить</button>
      </div>
    </article>`).join('') : '<p class="lempty">Статей пока нет — создайте первую.</p>';

  $$('[data-edit-article]', list).forEach((b) => b.onclick = () => editArticle(articlesCache.find((a) => a.id == b.dataset.editArticle)));
  $$('[data-dup-article]', list).forEach((b) => b.onclick = async () => {
    const r = await apiFetch('/api.php?action=article-duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.dupArticle }) });
    if (!r.ok) { toast('Не удалось дублировать статью', 'err'); return; }
    toast('Статья дублирована как черновик', 'ok');
    await loadArticles();
  });
  $$('[data-del-article]', list).forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить эту статью безвозвратно?')) return;
    const r = await apiFetch(`/api.php?action=article&id=${b.dataset.delArticle}`, { method: 'DELETE' });
    if (!r.ok) { toast('Не удалось удалить статью', 'err'); return; }
    toast('Статья удалена', 'ok');
    await loadArticles();
  });
}
$('#article-new').onclick = () => editArticle();

/* ---- Редактор статьи: 14 типов блоков ---- */
const ARTICLE_BLOCK_LABELS = { heading: 'Заголовок', text: 'Текст', quote: 'Цитата', image: 'Фото', gallery: 'Галерея', video: 'Видео', youtube: 'YouTube', list: 'Список', table: 'Таблица', callout: 'Примечание', faq: 'FAQ', cta: 'CTA', button: 'Кнопка', divider: 'Разделитель' };
const NEW_ARTICLE_BLOCK = {
  heading: () => ({ type: 'heading', level: 2, text: '' }),
  text: () => ({ type: 'text', html: '' }),
  quote: () => ({ type: 'quote', text: '', author: '' }),
  image: () => ({ type: 'image', src: '', caption: '', size: 'wide' }),
  gallery: () => ({ type: 'gallery', items: [{ src: '', caption: '' }] }),
  video: () => ({ type: 'video', src: '', poster: '' }),
  youtube: () => ({ type: 'youtube', id: '' }),
  list: () => ({ type: 'list', ordered: false, items: [''] }),
  table: () => ({ type: 'table', headers: ['', ''], rows: [['', '']] }),
  callout: () => ({ type: 'callout', variant: 'info', text: '' }),
  faq: () => ({ type: 'faq', items: [{ q: '', a: '' }] }),
  cta: () => ({ type: 'cta', title: '', text: '', button_label: '', button_href: '' }),
  button: () => ({ type: 'button', label: '', href: '', style: 'dark' }),
  divider: () => ({ type: 'divider' }),
};

function editArticle(article = {}) {
  const editor = $('#article-editor');
  editor.hidden = false;
  editor.dataset.articleId = article.id || '0';
  const isScheduled = article.status === 'scheduled';
  const toLocalInput = (s) => { if (!s) return ''; const d = new Date(s.replace(' ', 'T')); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  editor.innerHTML = `
    <h3>${article.id ? 'Редактировать статью' : 'Новая статья'}</h3>
    <div class="project-editor__grid">
      <label class="project-editor__wide">Заголовок<input name="title" value="${esc(article.title)}" required></label>
      <label>ЧПУ (слаг)<input name="slug" value="${esc(article.slug)}" placeholder="автоматически из заголовка"></label>
      <label>Статус<select name="status">${Object.entries(STATUS_LABELS).map(([v, t]) => `<option value="${v}"${(article.status || 'draft') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label id="article-schedule-row"${isScheduled ? '' : ' hidden'}>Дата и время публикации<input name="published_at" type="datetime-local" value="${toLocalInput(article.published_at)}"></label>
      <label class="project-editor__wide">Категории<span class="project-editor__cats" id="article-cats"></span></label>
      <label class="project-editor__wide">Теги<span class="project-editor__cats" id="article-tags"></span></label>
      <label class="project-editor__wide">Краткое описание (для карточки и запасного SEO-описания)<textarea name="excerpt">${esc(article.excerpt)}</textarea></label>
      <label class="project-editor__wide">Титульное фото или видео<span class="image-row"><input name="cover" value="${esc(article.cover)}" placeholder="URL файла или загрузите кнопкой справа"><input id="article-cover-file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden><button type="button" id="article-cover-upload">Загрузить</button></span><span class="cover-preview" data-cover-preview></span><span class="project-editor__hint">Можно загрузить видео (MP4/WEBM) — в ленте гайдов оно будет играть без звука.</span></label>
      <label>Автор — имя<input name="author_name" value="${esc(article.author_name || 'Дмитрий Пеленев')}"></label>
      <label>Автор — фото<span class="image-row"><input name="author_avatar" value="${esc(article.author_avatar)}" placeholder="URL фото"><input id="article-avatar-file" type="file" accept="image/*" hidden><button type="button" id="article-avatar-upload">Загрузить</button></span></label>
      <label class="project-editor__wide">Автор — о себе (коротко)<textarea name="author_bio">${esc(article.author_bio)}</textarea></label>
      <label class="jtax-form" style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="is_featured"${article.is_featured ? ' checked' : ''}> Избранная статья на странице «Гайды»</label>
    </div>

    <fieldset>
      <legend>SEO</legend>
      <div class="field"><label>SEO-заголовок<input name="seo_title" value="${esc(article.seo_title)}" maxlength="70"></label></div>
      <div class="field"><label>Meta description<textarea name="seo_description" maxlength="160">${esc(article.seo_description)}</textarea></label></div>
      <div class="field"><label>Canonical (по умолчанию — из ЧПУ)<input name="canonical" type="url" value="${esc(article.canonical)}"></label></div>
      <div class="field"><label>OG-изображение (по умолчанию — обложка)<input name="og_image" value="${esc(article.og_image)}"></label></div>
      <div class="field"><label>Индексация<select name="meta_robots">
        <option value="index,follow"${(article.meta_robots || 'index,follow') === 'index,follow' ? ' selected' : ''}>Индексировать (обычно)</option>
        <option value="noindex,follow"${article.meta_robots === 'noindex,follow' ? ' selected' : ''}>Не индексировать, ссылки учитывать</option>
        <option value="noindex,nofollow"${article.meta_robots === 'noindex,nofollow' ? ' selected' : ''}>Полностью скрыть от поиска</option>
      </select></label></div>
    </fieldset>

    <div class="project-editor__wide">
      <label>Контент статьи (перетаскивайте карточки для смены порядка)</label>
      <div class="cb-list" id="article-blocks"></div>
      <div class="cb-toolbar">
        ${Object.entries(ARTICLE_BLOCK_LABELS).map(([type, label]) => `<button type="button" data-add-ablock="${type}">+ ${label}</button>`).join('')}
      </div>
    </div>

    <div class="project-editor__buttons">
      <button type="button" class="btn" id="article-save-draft">Сохранить черновик</button>
      <button type="submit" class="btn btn--primary">Сохранить статью</button>
      <a class="btn" id="article-preview-link" href="/journal/${esc(article.slug || '')}?preview=1" target="_blank" rel="noopener"${article.slug ? '' : ' aria-disabled="true"'}>Предпросмотр</a>
      <button type="button" class="btn" id="article-cancel">Отмена</button>
    </div>`;

  /* Поле даты нужно только для «Запланирована» — при уходе с этого статуса
     стираем значение, иначе оно тихо всплывёт при следующей публикации. */
  $('[name=status]', editor).addEventListener('change', (e) => {
    const row = $('#article-schedule-row', editor);
    row.hidden = e.target.value !== 'scheduled';
    if (row.hidden) row.querySelector('input').value = '';
  });

  /* категории/теги — чекбоксы; список нужно уметь перерисовать, если добавили новую категорию во вкладке «Категории и теги» */
  const selectedCats = new Set(article.category_ids || []);
  const selectedTags = new Set(article.tag_ids || []);
  const renderPickers = () => {
    $('#article-cats', editor).innerHTML = jCategories.length
      ? jCategories.map((c) => `<label><input type="checkbox" name="category_ids" value="${c.id}"${selectedCats.has(c.id) ? ' checked' : ''}>${esc(c.name)}</label>`).join('')
      : '<span class="muted">Сначала добавьте категории во вкладке «Категории и теги».</span>';
    $('#article-tags', editor).innerHTML = jTags.length
      ? jTags.map((t) => `<label><input type="checkbox" name="tag_ids" value="${t.id}"${selectedTags.has(t.id) ? ' checked' : ''}>${esc(t.name)}</label>`).join('')
      : '<span class="muted">Сначала добавьте теги во вкладке «Категории и теги».</span>';
  };
  renderPickers();
  window.__refreshArticleTaxonomyPicker = () => { if (!editor.hidden) renderPickers(); };

  /* ---- Блоки ---- */
  const imageRowHTML = (i, j, key, src, uploadCls, fileCls) => `<span class="image-row">
      <input class="cb-input" type="url" data-i="${i}"${j != null ? ` data-j="${j}"` : ''} data-k="${key}" value="${esc(src)}" placeholder="URL изображения">
      <button type="button" class="${uploadCls}" data-i="${i}"${j != null ? ` data-j="${j}"` : ''}>Загрузить</button>
      <input type="file" class="${fileCls}" data-i="${i}"${j != null ? ` data-j="${j}"` : ''} accept="image/*" hidden>
    </span>`;

  let blocks = JSON.parse(JSON.stringify(article.blocks || []));
  window.getArticleBlocksForSave = () => blocks;

  const blockBodyHTML = (b, i) => {
    if (b.type === 'heading') return `<div class="cb-row"><select class="cb-input" data-i="${i}" data-k="level">${[2, 3, 4, 5, 6].map((lv) => `<option value="${lv}"${(b.level || 2) === lv ? ' selected' : ''}>H${lv}</option>`).join('')}</select><input class="cb-input" data-i="${i}" data-k="text" value="${esc(b.text)}" placeholder="Текст заголовка"></div>`;
    if (b.type === 'text') return `<div class="cb-rt"><div class="cb-rt-toolbar">
        <button type="button" class="cb-rt-btn" data-rt="bold" data-i="${i}" title="Жирный"><b>Ж</b></button>
        <button type="button" class="cb-rt-btn" data-rt="italic" data-i="${i}" title="Курсив"><i>К</i></button>
        <button type="button" class="cb-rt-btn" data-rt="strikeThrough" data-i="${i}" title="Зачёркнутый"><s>З</s></button>
        <button type="button" class="cb-rt-btn" data-rt="link" data-i="${i}" title="Ссылка">Ссылка</button>
      </div><div class="cb-rt-editor" contenteditable="true" data-i="${i}">${b.html || ''}</div></div>`;
    if (b.type === 'quote') return `<textarea class="cb-input" data-i="${i}" data-k="text" placeholder="Текст цитаты">${esc(b.text)}</textarea><input class="cb-input" data-i="${i}" data-k="author" value="${esc(b.author)}" placeholder="Автор (необязательно)">`;
    if (b.type === 'image') return `${imageRowHTML(i, null, 'src', b.src, 'cb-upload', 'cb-file')}
      <select class="cb-input" data-i="${i}" data-k="size">
        <option value="inset"${b.size === 'inset' ? ' selected' : ''}>Уже колонки текста</option>
        <option value="wide"${b.size !== 'inset' && b.size !== 'full' ? ' selected' : ''}>Шире колонки текста</option>
        <option value="full"${b.size === 'full' ? ' selected' : ''}>Во всю ширину</option>
      </select>
      <input class="cb-input" data-i="${i}" data-k="caption" value="${esc(b.caption)}" placeholder="Подпись (необязательно)">`;
    if (b.type === 'gallery') return `<div class="cb-gallery-grid">${(b.items || []).map((item, j) => `<div class="cb-duo-item">${imageRowHTML(i, j, 'src', item.src, 'cb-gal-upload', 'cb-gal-file')}<input class="cb-duo-input" data-i="${i}" data-j="${j}" data-k="caption" value="${esc(item.caption)}" placeholder="Подпись"><button type="button" class="cb-gal-remove" data-i="${i}" data-j="${j}">Удалить фото</button></div>`).join('')}</div>
      <button type="button" class="cb-gal-add" data-i="${i}"${(b.items || []).length >= 12 ? ' disabled' : ''}>+ Добавить фото</button>`;
    if (b.type === 'video') return `<input class="cb-input" data-i="${i}" data-k="src" value="${esc(b.src)}" placeholder="/uploads/video/clip.mp4 или полный URL">
      ${imageRowHTML(i, null, 'poster', b.poster, 'cb-poster-upload', 'cb-poster-file')}
      <p class="cb-hint">Постер (превью-кадр) необязателен.</p>`;
    if (b.type === 'youtube') return `<input class="cb-input" data-i="${i}" data-k="id" value="${esc(b.id)}" placeholder="Ссылка на YouTube или ID видео">`;
    if (b.type === 'list') return `<label class="cb-inline"><input type="checkbox" class="cb-input" data-i="${i}" data-k="ordered"${b.ordered ? ' checked' : ''}> Нумерованный список</label>
      <div class="cb-list-items">${(b.items || ['']).map((val, j) => `<div class="cb-list-item"><input class="cb-li-input" data-i="${i}" data-j="${j}" value="${esc(val)}" placeholder="Пункт списка"><button type="button" class="cb-li-remove" data-i="${i}" data-j="${j}">×</button></div>`).join('')}</div>
      <button type="button" class="cb-li-add" data-i="${i}"${(b.items || []).length >= 30 ? ' disabled' : ''}>+ Пункт</button>`;
    if (b.type === 'table') return `<div class="cb-table-headers">${(b.headers || []).map((h, j) => `<input class="cb-th-input" data-i="${i}" data-j="${j}" value="${esc(h)}" placeholder="Заголовок ${j + 1}">`).join('')}<button type="button" class="cb-th-add" data-i="${i}"${(b.headers || []).length >= 8 ? ' disabled' : ''}>+ Столбец</button></div>
      <div class="cb-table-rows">${(b.rows || []).map((row, ri) => `<div class="cb-table-row">${row.map((cell, ci) => `<input class="cb-td-input" data-i="${i}" data-ri="${ri}" data-ci="${ci}" value="${esc(cell)}">`).join('')}<button type="button" class="cb-tr-remove" data-i="${i}" data-ri="${ri}">×</button></div>`).join('')}</div>
      <button type="button" class="cb-tr-add" data-i="${i}"${(b.rows || []).length >= 50 ? ' disabled' : ''}>+ Строка</button>`;
    if (b.type === 'callout') return `<select class="cb-input" data-i="${i}" data-k="variant"><option value="info"${b.variant !== 'warning' ? ' selected' : ''}>Информация</option><option value="warning"${b.variant === 'warning' ? ' selected' : ''}>Важно</option></select>
      <textarea class="cb-input" data-i="${i}" data-k="text" placeholder="Текст примечания">${esc(b.text)}</textarea>`;
    if (b.type === 'faq') return `<div class="cb-faq-items">${(b.items || []).map((item, j) => `<div class="cb-faq-item">
        <input class="cb-faq-input" data-i="${i}" data-j="${j}" data-k="q" value="${esc(item.q)}" placeholder="Вопрос">
        <textarea class="cb-faq-input" data-i="${i}" data-j="${j}" data-k="a" placeholder="Ответ">${esc(item.a)}</textarea>
        <button type="button" class="cb-faq-remove" data-i="${i}" data-j="${j}">Удалить вопрос</button>
      </div>`).join('')}</div>
      <button type="button" class="cb-faq-add" data-i="${i}"${(b.items || []).length >= 20 ? ' disabled' : ''}>+ Вопрос</button>`;
    if (b.type === 'cta') return `<input class="cb-input" data-i="${i}" data-k="title" value="${esc(b.title)}" placeholder="Заголовок CTA">
      <textarea class="cb-input" data-i="${i}" data-k="text" placeholder="Текст">${esc(b.text)}</textarea>
      <input class="cb-input" data-i="${i}" data-k="button_label" value="${esc(b.button_label)}" placeholder="Текст кнопки">
      <input class="cb-input" data-i="${i}" data-k="button_href" value="${esc(b.button_href)}" placeholder="Ссылка кнопки">`;
    if (b.type === 'button') return `<input class="cb-input" data-i="${i}" data-k="label" value="${esc(b.label)}" placeholder="Текст кнопки">
      <input class="cb-input" data-i="${i}" data-k="href" value="${esc(b.href)}" placeholder="Ссылка">
      <select class="cb-input" data-i="${i}" data-k="style"><option value="dark"${b.style !== 'light' && b.style !== 'outline' ? ' selected' : ''}>Тёмная</option><option value="light"${b.style === 'light' ? ' selected' : ''}>Светлая</option><option value="outline"${b.style === 'outline' ? ' selected' : ''}>Контурная</option></select>`;
    if (b.type === 'divider') return `<p class="cb-hint">Разделитель — тонкая линия между блоками, настроек нет.</p>`;
    return '';
  };

  const blocksEl = $('#article-blocks', editor);
  const renderBlocks = () => {
    blocksEl.innerHTML = blocks.map((b, i) => `<div class="cb-card" draggable="true" data-index="${i}">
      <div class="cb-head"><span class="cb-type">${ARTICLE_BLOCK_LABELS[b.type] || b.type}</span><button type="button" class="cb-remove" data-i="${i}" aria-label="Удалить блок">×</button></div>
      <div class="cb-body">${blockBodyHTML(b, i)}</div>
    </div>`).join('');
    bindBlockEvents();
  };

  const bindBlockEvents = () => {
    $$('.cb-input', blocksEl).forEach((el) => {
      const ev = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => { blocks[el.dataset.i][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
    });
    $$('.cb-duo-input, .cb-faq-input', blocksEl).forEach((el) => el.addEventListener('input', () => { blocks[el.dataset.i].items[el.dataset.j][el.dataset.k] = el.value; }));
    $$('.cb-remove', blocksEl).forEach((b) => b.onclick = () => { blocks.splice(+b.dataset.i, 1); renderBlocks(); });

    /* rich text: жирный/курсив/зачёркнутый/ссылка через встроенный execCommand —
       устаревший API, но поддерживается всеми браузерами и не тянет сторонних библиотек */
    $$('.cb-rt-btn', blocksEl).forEach((btn) => btn.onclick = (e) => {
      e.preventDefault();
      const rtEditor = btn.closest('.cb-rt').querySelector('.cb-rt-editor');
      rtEditor.focus();
      if (btn.dataset.rt === 'link') { const url = prompt('Ссылка (https://...)'); if (url) document.execCommand('createLink', false, url); }
      else document.execCommand(btn.dataset.rt, false, null);
      blocks[rtEditor.dataset.i].html = rtEditor.innerHTML;
    });
    $$('.cb-rt-editor', blocksEl).forEach((el) => el.addEventListener('input', () => { blocks[el.dataset.i].html = el.innerHTML; }));

    const wireUpload = (btnSel, apply) => $$(btnSel, blocksEl).forEach((btn) => {
      const file = btn.nextElementSibling;
      btn.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        try { apply(btn.dataset, await uploadFile(f)); renderBlocks(); toast('Изображение загружено', 'ok'); }
        catch (err) { toast(err.message || 'Не удалось загрузить файл', 'err'); }
      };
    });
    wireUpload('.cb-upload', (d, url) => { blocks[d.i].src = url; });
    wireUpload('.cb-poster-upload', (d, url) => { blocks[d.i].poster = url; });
    wireUpload('.cb-gal-upload', (d, url) => { blocks[d.i].items[d.j].src = url; });

    /* галерея */
    $$('.cb-gal-remove', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.splice(+b.dataset.j, 1); renderBlocks(); });
    $$('.cb-gal-add', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.push({ src: '', caption: '' }); renderBlocks(); });

    /* список */
    $$('.cb-li-input', blocksEl).forEach((el) => el.addEventListener('input', () => { blocks[el.dataset.i].items[el.dataset.j] = el.value; }));
    $$('.cb-li-remove', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.splice(+b.dataset.j, 1); renderBlocks(); });
    $$('.cb-li-add', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.push(''); renderBlocks(); });

    /* таблица: добавление столбца дописывает пустую ячейку во все существующие строки */
    $$('.cb-th-input', blocksEl).forEach((el) => el.addEventListener('input', () => { blocks[el.dataset.i].headers[el.dataset.j] = el.value; }));
    $$('.cb-th-add', blocksEl).forEach((b) => b.onclick = () => {
      const blk = blocks[b.dataset.i];
      blk.headers.push('');
      blk.rows.forEach((row) => row.push(''));
      renderBlocks();
    });
    $$('.cb-td-input', blocksEl).forEach((el) => el.addEventListener('input', () => { blocks[el.dataset.i].rows[el.dataset.ri][el.dataset.ci] = el.value; }));
    $$('.cb-tr-add', blocksEl).forEach((b) => b.onclick = () => { const blk = blocks[b.dataset.i]; blk.rows.push(blk.headers.map(() => '')); renderBlocks(); });
    $$('.cb-tr-remove', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].rows.splice(+b.dataset.ri, 1); renderBlocks(); });

    /* FAQ */
    $$('.cb-faq-remove', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.splice(+b.dataset.j, 1); renderBlocks(); });
    $$('.cb-faq-add', blocksEl).forEach((b) => b.onclick = () => { blocks[b.dataset.i].items.push({ q: '', a: '' }); renderBlocks(); });

    /* перетаскивание карточек блоков */
    let dragIndex = null;
    $$('.cb-card', blocksEl).forEach((card) => {
      card.ondragstart = () => { dragIndex = +card.dataset.index; card.classList.add('dragging'); };
      card.ondragend = () => card.classList.remove('dragging');
      card.ondragover = (e) => e.preventDefault();
      card.ondrop = () => { const to = +card.dataset.index; if (dragIndex === null || dragIndex === to) return; blocks.splice(to, 0, blocks.splice(dragIndex, 1)[0]); renderBlocks(); };
    });
  };
  renderBlocks();

  $$('[data-add-ablock]', editor).forEach((btn) => btn.onclick = () => {
    blocks.push(NEW_ARTICLE_BLOCK[btn.dataset.addAblock]());
    renderBlocks();
    blocksEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---- Обложка/аватар — загрузка файлом ---- */
  wireCoverPreview(editor);
  $('#article-cover-upload', editor).onclick = () => $('#article-cover-file', editor).click();
  $('#article-cover-file', editor).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { editor.querySelector('[name=cover]').value = await uploadFile(f); toast('Обложка загружена', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#article-avatar-upload', editor).onclick = () => $('#article-avatar-file', editor).click();
  $('#article-avatar-file', editor).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { editor.querySelector('[name=author_avatar]').value = await uploadFile(f); toast('Фото автора загружено', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  };

  $('#article-cancel', editor).onclick = () => { editor.hidden = true; window.getArticleBlocksForSave = () => []; };

  /* Статус обычно берётся из select (draft/scheduled/published/hidden — как
     в редакторе кейса). «Сохранить черновик» — быстрый оверрайд для случая,
     когда просто хочется сохранить прогресс, не трогая выбранный статус. */
  const saveArticle = async (forceStatus) => {
    const data = Object.fromEntries(new FormData(editor));
    data.id = article.id || 0;
    if (forceStatus) data.status = forceStatus;
    data.category_ids = $$('[name=category_ids]:checked', editor).map((x) => +x.value);
    data.tag_ids = $$('[name=tag_ids]:checked', editor).map((x) => +x.value);
    data.is_featured = $('[name=is_featured]', editor).checked;
    data.blocks = blocks;
    try {
      const r = await apiFetch('/api.php?action=article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'Не удалось сохранить статью', 'err'); return; }
      editor.hidden = true;
      toast(data.status === 'published' ? 'Статья опубликована' : 'Статья сохранена', 'ok');
      await loadArticles();
    } catch (err) { toast(err.message || 'Не удалось сохранить', 'err'); }
  };
  editor.onsubmit = (e) => { e.preventDefault(); saveArticle(null); };
  $('#article-save-draft', editor).onclick = () => saveArticle('draft');

  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Медиатека ---------- */
loaders.media = loadMedia;
async function loadMedia() {
  const r = await apiFetch(`/api.php?action=media&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(d.files)) throw new Error(d.error || 'Не удалось загрузить медиатеку.');
  const files = d.files;
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ';
  $('#media-root').innerHTML = files.length ? files.map((f) => `
    <div class="mcard" data-name="${esc(f.name)}">
      <img src="${esc(f.url)}" alt="" loading="lazy">
      <div class="mcard__body">
        <div class="mcard__name">${esc(f.name)}</div>
        <div class="mcard__meta"><span>${kb(f.size)}</span>${f.used ? '<span class="mcard__used">на сайте</span>' : ''}</div>
        <div class="mcard__row">
          <button type="button" data-copy="${esc(f.url)}">Копировать URL</button>
          <button type="button" data-del="${esc(f.name)}" ${f.used ? 'disabled title="Файл используется на сайте"' : ''}>Удалить</button>
        </div>
      </div>
    </div>`).join('') : '<p class="lempty">Пока пусто — загрузите первые файлы.</p>';

  $$('#media-root [data-copy]').forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(location.origin + b.dataset.copy); toast('Ссылка скопирована', 'ok'); }
    catch (_) { toast(b.dataset.copy); }
  });
  $$('#media-root [data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm(`Удалить файл ${b.dataset.del}?`)) return;
    const r = await apiFetch(`/api.php?action=media-delete&name=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
    const d2 = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d2.error || 'Не удалось удалить', 'err'); return; }
    toast('Файл удалён', 'ok');
    await loadMedia();
  });
}
$('#media-upload').addEventListener('change', async (e) => {
  try {
    for (const f of e.target.files) await uploadFile(f);
    toast('Файлы загружены', 'ok');
    await loadMedia();
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});

/* ---------- Услуги ----------
   Страницы /services/<slug>/. Пока услуга не сохранена здесь, шаблон берёт
   контент из services/_data.php — поэтому сайт живой ещё до наполнения. */
let services = [];
const SSTATUSES = [['published', 'Опубликована'], ['draft', 'Черновик'], ['hidden', 'Скрыта']];
const SCATS = [['', 'Не показывать кейсы'], ['site', 'Сайты'], ['ai-site', 'AI-сайты'], ['ai-content', 'AI-контент'], ['graphic', 'Дизайн']];
const SROBOTS = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'];

loaders.services = loadServices;
async function loadServices() {
  const r = await apiFetch(`/api.php?action=services&_=${Date.now()}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Не удалось загрузить услуги');
  services = d.services || [];
  renderServices();
}

function renderServices() {
  const list = $('#service-list');
  if (!services.length) { list.innerHTML = '<p class="lempty">Услуг пока нет. Создайте первую — страница появится по адресу /services/&lt;адрес&gt;/.</p>'; return; }
  list.innerHTML = services.map((x) => `
    <article class="project-admin-card" data-id="${x.id}">
      <div class="grow">
        <h3>${esc(x.h1 || x.title)}</h3>
        <p class="muted">/services/${esc(x.slug)}/ · ${esc(SSTATUSES.find(([v]) => v === x.status)?.[1] || x.status)}</p>
      </div>
      <div class="pcard__actions">
        <a class="btn" href="/services/${encodeURIComponent(x.slug)}/" target="_blank" rel="noopener">Открыть</a>
        <button type="button" class="btn" data-edit-service="${x.id}">Редактировать</button>
        <button type="button" class="btn btn--danger" data-del-service="${x.id}">Удалить</button>
      </div>
    </article>`).join('');

  $$('[data-edit-service]', list).forEach((b) => b.onclick = () => editService(services.find((x) => String(x.id) === b.dataset.editService)));
  $$('[data-del-service]', list).forEach((b) => b.onclick = async () => {
    if (!confirm('Удалить услугу? Страница перестанет открываться.')) return;
    const r = await apiFetch(`/api.php?action=service&id=${b.dataset.delService}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.error || 'Не удалось удалить', 'err'); return; }
    toast('Услуга удалена', 'ok');
    await loadServices();
  });
}

$('#service-new').onclick = () => editService();

function editService(item = {}) {
  const editor = $('#service-editor');
  const calc = item.calc || {};
  editor.hidden = false;
  editor.innerHTML = `
    <h3>${item.id ? 'Редактировать услугу' : 'Новая услуга'}</h3>
    <div class="project-editor__grid">
      <label>Заголовок H1<input name="h1" value="${esc(item.h1)}" required></label>
      <label>Статус<select name="status">${SSTATUSES.map(([v, t]) => `<option value="${v}"${(item.status || 'published') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Адрес страницы (URL)<input name="slug" value="${esc(item.slug)}" placeholder="websites"><span class="project-editor__hint">Латиница и дефисы. Итоговый адрес: /services/&lt;адрес&gt;/</span></label>
      <label>Плашка над заголовком<input name="badge" value="${esc(item.badge)}" placeholder="Услуга 01"></label>
      <label class="project-editor__wide">Подзаголовок hero (лид)<textarea name="lead" rows="3">${esc(item.lead)}</textarea></label>

      <label class="project-editor__wide">Изображение hero<span class="image-row"><input name="hero_image" value="${esc(item.hero_image)}" placeholder="Оставьте пустым — будет видеофон"><input id="svc-hero-file" type="file" accept="image/*" hidden><button type="button" id="svc-hero-upload">Загрузить</button></span><span class="project-editor__hint">Если поле пустое, в шапке играет видео.</span></label>
      <label class="project-editor__wide">Видео hero (путь к mp4)<input name="hero_video" value="${esc(item.hero_video)}" placeholder="/assets/video/hero.mp4"></label>

      <label>Кнопка в hero — главная<input name="hero_primary_label" value="${esc(item.hero_primary_label)}" placeholder="Обсудить проект"></label>
      <label>Кнопка в hero — вторая<input name="hero_secondary_label" value="${esc(item.hero_secondary_label)}" placeholder="Смотреть кейсы"></label>

      <div class="project-editor__wide"><label>Факты в hero (справа на стекле)</label><div class="rep" data-rep="facts"></div><button type="button" class="btn" data-add-rep="facts">+ Факт</button></div>

      <label>Заголовок блока «Что входит»<input name="intro_title" value="${esc(item.intro_title)}" placeholder="Что входит в работу"></label>
      <label>Заголовок блока этапов<input name="steps_title" value="${esc(item.steps_title)}" placeholder="Как идёт работа"></label>
      <label class="project-editor__wide">Текст под заголовком «Что входит»<textarea name="intro_text" rows="2">${esc(item.intro_text)}</textarea></label>
      <label class="project-editor__wide">Текст под заголовком этапов<textarea name="steps_text" rows="2">${esc(item.steps_text)}</textarea></label>

      <div class="project-editor__wide"><label>Что входит в работу</label><div class="rep" data-rep="works"></div><button type="button" class="btn" data-add-rep="works">+ Пункт</button></div>
      <div class="project-editor__wide"><label>Этапы работы</label><div class="rep" data-rep="steps"></div><button type="button" class="btn" data-add-rep="steps">+ Этап</button></div>
      <div class="project-editor__wide"><label>Преимущества</label><div class="rep" data-rep="benefits"></div><button type="button" class="btn" data-add-rep="benefits">+ Преимущество</button></div>
      <div class="project-editor__wide"><label>FAQ</label><div class="rep" data-rep="faq"></div><button type="button" class="btn" data-add-rep="faq">+ Вопрос</button></div>
      <div class="project-editor__wide"><label>Отзывы</label><div class="rep" data-rep="reviews"></div><button type="button" class="btn" data-add-rep="reviews">+ Отзыв</button></div>

      <label>Кейсы на странице<select name="cases_cat">${SCATS.map(([v, t]) => `<option value="${v}"${(item.cases_cat || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Заголовок блока кейсов<input name="cases_title" value="${esc(item.cases_title)}" placeholder="Кейсы по услуге"></label>

      <div class="project-editor__wide">
        <label>Калькулятор стоимости</label>
        <label class="calc-toggle"><input type="checkbox" name="calc_enabled"${calc.enabled !== false ? ' checked' : ''}> Показывать калькулятор на странице</label>
        <div class="project-editor__grid" style="margin-top:10px">
          <label>Заголовок калькулятора<input name="calc_title" value="${esc(calc.title)}" placeholder="Рассчитайте стоимость"></label>
          <label>Подпись у итога<input name="calc_total_label" value="${esc(calc.total_label)}" placeholder="Стоимость проекта"></label>
          <label class="project-editor__wide">Текст под заголовком<textarea name="calc_intro" rows="2">${esc(calc.intro)}</textarea></label>
          <label>Текст кнопки в калькуляторе<input name="calc_cta_label" value="${esc(calc.cta_label)}" placeholder="Обсудить проект"></label>
          <label>Ссылка кнопки<input name="calc_cta_href" value="${esc(calc.cta_href)}" placeholder="/#write"></label>
          <label class="project-editor__wide">Подпись под кнопкой<input name="calc_hint" value="${esc(calc.hint)}" placeholder="Ни к чему не обязывает"></label>
        </div>
        <label style="margin-top:12px">Варианты (выбор один из списка)</label>
        <div class="rep" data-rep="ctypes"></div><button type="button" class="btn" data-add-rep="ctypes">+ Вариант</button>
        <label style="margin-top:12px">Дополнительные опции (галочки)</label>
        <div class="rep" data-rep="coptions"></div><button type="button" class="btn" data-add-rep="coptions">+ Опция</button>
      </div>

      <label class="project-editor__wide">SEO Title<input name="seo_title" value="${esc(item.seo_title)}" maxlength="255"><span class="project-editor__hint">Оптимально до 60–65 знаков. Пусто — подставится H1.</span></label>
      <label class="project-editor__wide">Meta Description<textarea name="seo_description" rows="2" maxlength="400">${esc(item.seo_description)}</textarea><span class="project-editor__hint">Оптимально 140–160 знаков.</span></label>
      <label>Индексация<select name="meta_robots">${SROBOTS.map((v) => `<option value="${v}"${(item.meta_robots || 'index,follow') === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Тип услуги для микроразметки<input name="service_type" value="${esc(item.service_type)}" placeholder="Разработка сайтов"></label>
      <label class="project-editor__wide">OG-картинка (для соцсетей)<span class="image-row"><input name="og_image" value="${esc(item.og_image)}" placeholder="Пусто — возьмётся изображение hero"><input id="svc-og-file" type="file" accept="image/*" hidden><button type="button" id="svc-og-upload">Загрузить</button></span></label>

      <label>Финальный блок — заголовок<input name="cta_title" value="${esc(item.cta_title)}" placeholder="Нужен сайт под ключ?"></label>
      <label>Финальный блок — текст кнопки<input name="cta_primary_label" value="${esc(item.cta_primary_label)}" placeholder="Обсудить проект"></label>
      <label class="project-editor__wide">Финальный блок — текст<textarea name="cta_text" rows="2">${esc(item.cta_text)}</textarea></label>
      <label>Ссылка главной кнопки<input name="cta_primary_href" value="${esc(item.cta_primary_href)}" placeholder="/#write"></label>
      <label>Вторая кнопка — текст<input name="cta_secondary_label" value="${esc(item.cta_secondary_label)}" placeholder="Написать в Telegram"></label>
      <label class="project-editor__wide">Вторая кнопка — ссылка<input name="cta_secondary_href" value="${esc(item.cta_secondary_href)}" placeholder="https://t.me/..."></label>
    </div>
    <div class="project-editor__buttons">
      <button type="submit" class="btn btn--primary">Сохранить услугу</button>
      <button type="button" class="btn" id="service-cancel">Отмена</button>
    </div>`;

  /* Повторяемые блоки. Одна функция на все списки: отличаются только полями. */
  const REP = {
    facts:    { fields: [['title', 'Название', 'Срок'], ['text', 'Значение', 'от 14 дней']] },
    works:    { fields: [['title', 'Заголовок', ''], ['text', 'Описание', '']] },
    steps:    { fields: [['title', 'Заголовок', ''], ['text', 'Описание', '']] },
    benefits: { fields: [['title', 'Заголовок', ''], ['text', 'Описание', '']] },
    faq:      { fields: [['title', 'Вопрос', ''], ['text', 'Ответ', '']] },
    reviews:  { fields: [['name', 'Имя', ''], ['role', 'Должность', ''], ['text', 'Текст отзыва', ''], ['avatar', 'Фото (URL)', '']] },
    ctypes:   { fields: [['title', 'Название', ''], ['text', 'Описание', ''], ['price', 'Цена, ₽', '0'], ['id', 'Код (латиницей)', 'base']], flags: [['from', 'Цена «от»']] },
    coptions: { fields: [['title', 'Название', ''], ['text', 'Описание', ''], ['price', 'Цена, ₽', '0'], ['free_with', 'Бесплатно с вариантом (код)', ''], ['note', 'Примечание под итогом', '']], flags: [['from', 'Цена «от»']] },
  };
  const state = {
    facts: (item.facts || []).slice(), works: (item.works || []).slice(), steps: (item.steps || []).slice(),
    benefits: (item.benefits || []).slice(), faq: (item.faq || []).slice(), reviews: (item.reviews || []).slice(),
    ctypes: (calc.types || []).slice(), coptions: (calc.options || []).slice(),
  };

  const drawRep = (key) => {
    const box = $(`[data-rep="${key}"]`, editor);
    const cfg = REP[key];
    box.innerHTML = state[key].map((row, i) => `
      <div class="rep__row" data-i="${i}">
        ${cfg.fields.map(([f, label, ph]) => `<label>${label}<input data-f="${f}" value="${esc(row[f] ?? '')}" placeholder="${esc(ph)}"></label>`).join('')}
        ${(cfg.flags || []).map(([f, label]) => `<label class="rep__flag"><input type="checkbox" data-f="${f}"${row[f] ? ' checked' : ''}> ${label}</label>`).join('')}
        <button type="button" class="btn btn--danger" data-rep-del>Удалить</button>
      </div>`).join('') || '<p class="lempty">Пусто</p>';
    $$('[data-f]', box).forEach((inp) => inp.oninput = inp.onchange = () => {
      const i = +inp.closest('.rep__row').dataset.i;
      state[key][i][inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value;
    });
    $$('[data-rep-del]', box).forEach((b) => b.onclick = () => {
      state[key].splice(+b.closest('.rep__row').dataset.i, 1);
      drawRep(key);
    });
  };
  Object.keys(REP).forEach(drawRep);
  $$('[data-add-rep]', editor).forEach((b) => b.onclick = () => {
    const key = b.dataset.addRep;
    state[key].push({});
    drawRep(key);
  });

  /* Загрузка картинок — тем же эндпоинтом, что и обложки кейсов. */
  const wireUpload = (btnId, fileId, inputName) => {
    const btn = $(`#${btnId}`, editor), file = $(`#${fileId}`, editor);
    if (!btn || !file) return;
    btn.onclick = () => file.click();
    file.onchange = async () => {
      if (!file.files[0]) return;
      const fd = new FormData(); fd.append('file', file.files[0]);
      const r = await apiFetch('/api.php?action=upload', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'Не удалось загрузить', 'err'); return; }
      $(`[name="${inputName}"]`, editor).value = d.url || d.src || '';
      toast('Изображение загружено', 'ok');
    };
  };
  wireUpload('svc-hero-upload', 'svc-hero-file', 'hero_image');
  wireUpload('svc-og-upload', 'svc-og-file', 'og_image');

  $('#service-cancel', editor).onclick = () => { editor.hidden = true; };

  editor.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(editor));
    data.id = item.id || 0;
    /* Списки собираем из состояния, а плоские поля калькулятора сворачиваем
       в объект — иначе они уедут в API мусорными ключами. */
    ['facts', 'works', 'steps', 'benefits', 'faq', 'reviews'].forEach((k) => { data[k] = state[k]; });
    data.calc = {
      enabled: !!data.calc_enabled,
      title: data.calc_title || '', intro: data.calc_intro || '',
      cta_label: data.calc_cta_label || '', cta_href: data.calc_cta_href || '',
      hint: data.calc_hint || '', total_label: data.calc_total_label || '',
      types: state.ctypes.map((t) => ({ ...t, price: +t.price || 0, from: !!t.from })),
      options: state.coptions.map((o) => ({ ...o, price: +o.price || 0, from: !!o.from })),
    };
    ['calc_enabled', 'calc_title', 'calc_intro', 'calc_cta_label', 'calc_cta_href', 'calc_hint', 'calc_total_label'].forEach((k) => delete data[k]);

    try {
      const r = await apiFetch('/api.php?action=service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || `Ошибка сохранения (${r.status})`, 'err'); return; }
      editor.hidden = true;
      toast('Услуга сохранена', 'ok');
      await loadServices();
    } catch (err) { toast(err.message || 'Не удалось сохранить', 'err'); }
  };
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
})();
