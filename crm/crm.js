(() => {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
     Модель данных (v3)
     clients: {id, name, contact, note, color, createdAt}
     tasks:   {id, title, clientId, status, urgent, price, paid, due, time, note}
     notes:   {id, body (санитизированный HTML, первая строка = заголовок),
               pinned, deletedAt, createdAt, updatedAt}
     ────────────────────────────────────────────────────────────── */

  const KEY = 'pelenev.crm.workspace.v3';
  const LEGACY_KEY_V2 = 'pelenev.crm.workspace.v2';
  const LEGACY_KEY_V1 = 'pelenev.crm.workspace.v1';
  const THEME_KEY = 'pelenev.crm.theme';
  const METRICS_KEY = 'pelenev.crm.metricsOpen';

  const STATUSES = [
    { id: 'new',      label: 'Новая' },
    { id: 'progress', label: 'В работе' },
    { id: 'review',   label: 'На согласовании' },
    { id: 'done',     label: 'Готово' }
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
  const COLORS = ['orange', 'blue', 'green', 'violet'];

  /* ── Даты ─────────────────────────────────────────────────── */
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  const iso = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = () => iso(new Date());
  const fromIso = (value) => {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };
  const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
  const fmtDate = (value) => {
    const d = fromIso(value);
    if (!d) return 'без даты';
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };
  const fmtDateRelative = (value) => {
    const diff = daysBetween(today(), value);
    if (diff === null || Number.isNaN(diff)) return 'без даты';
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'завтра';
    if (diff === -1) return 'вчера';
    if (diff < 0) return `${fmtDate(value)} · просрочено`;
    if (diff <= 6) return `через ${diff} ${plural(diff, 'день', 'дня', 'дней')}`;
    return fmtDate(value);
  };
  /* Проверяем не форму, а диапазон: «25:99» формально подходит под \d\d:\d\d */
  const validTime = (value) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return '';
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return '';
    return `${String(h).padStart(2, '0')}:${match[2]}`;
  };
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  /* Метка времени заметки: «только что» / «5 минут назад» / «сегодня, 14:32» / дата */
  const fmtNoteStamp = (isoString) => {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} ${plural(diffMin, 'минуту', 'минуты', 'минут')} назад`;
    if (d.toDateString() === now.toDateString()) return `сегодня, ${time}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `вчера, ${time}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
  };

  /* ── Утилиты ──────────────────────────────────────────────── */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `₽ ${Math.round(Number(n) || 0).toLocaleString('ru-RU')}`;
  const moneyShort = (n) => {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 1000000) return `₽ ${(v / 1000000).toFixed(1).replace('.0', '')} млн`;
    if (Math.abs(v) >= 10000) return `₽ ${Math.round(v / 1000)}к`;
    return money(v);
  };
  const byId = (id) => document.getElementById(id);
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pickColor = (seed) => COLORS[Math.abs([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];

  /* Заметки хранятся как ограниченный HTML — только то, что реально создаётся
     тулбаром редактора. Всё остальное (вставка из буфера, чужой мусор) вырезаем,
     чтобы в контенте не оказалось ничего исполняемого. */
  const NOTE_ALLOWED_TAGS = new Set(['DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI']);
  const sanitizeNoteHtml = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) { child.remove(); return; }
        if (!NOTE_ALLOWED_TAGS.has(child.tagName)) {
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        [...child.attributes].forEach((attr) => {
          const isChecklist = child.tagName === 'DIV' && child.classList.contains('cl-line');
          const keep = isChecklist && (attr.name === 'class' || attr.name === 'data-checked');
          if (!keep) child.removeAttribute(attr.name);
        });
        walk(child);
      });
    };
    walk(tmp);
    return tmp.innerHTML;
  };
  /* Построчный текст заметки — для заголовка, превью и поиска */
  const noteLines = (html) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    const lines = [];
    tmp.childNodes.forEach((node) => {
      if (node.nodeType !== 1 && node.nodeType !== 3) return;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      lines.push({ text, checklist: node.nodeType === 1 && node.classList && node.classList.contains('cl-line'), checked: node.nodeType === 1 && node.dataset && node.dataset.checked === '1' });
    });
    return lines;
  };
  const noteTitle = (note) => {
    const lines = noteLines(note.body);
    return lines.length ? lines[0].text.slice(0, 140) : 'Новая заметка';
  };
  const notePreview = (note) => {
    const rest = noteLines(note.body).slice(1);
    if (!rest.length) return 'Нет дополнительного текста';
    return rest.map((l) => (l.checklist ? `${l.checked ? '☑' : '☐'} ${l.text}` : l.text)).join(' · ').slice(0, 160);
  };
  const noteSearchText = (note) => noteLines(note.body).map((l) => l.text).join(' ').toLowerCase();

  let toastTimer = null;
  const toast = (message) => {
    const el = byId('toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  };

  /* ── Тема ─────────────────────────────────────────────────── */
  const THEME_COLOR = { dark: '#050505', light: '#E9E9E6' };
  const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
  const readTheme = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch (_) { return null; } };

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = byId('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
    const button = byId('theme-toggle');
    if (button) button.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLOR[theme];
  };

  applyTheme(readTheme() || (lightQuery.matches ? 'light' : 'dark'));

  /* Пока выбор не сделан вручную — следуем за системой */
  lightQuery.addEventListener('change', (event) => {
    if (!readTheme()) applyTheme(event.matches ? 'light' : 'dark');
  });

  /* ── Состояние ────────────────────────────────────────────── */
  const emptyState = () => ({ v: 3, clients: [], tasks: [], notes: [] });

  const seed = () => {
    const state = emptyState();
    const c1 = { id: uid('c'), name: 'Авито Сервис', contact: 'hello@avito.example', note: 'Сайт под ключ', color: 'orange', createdAt: today() };
    state.clients = [c1];
    state.tasks = [
      { id: uid('t'), title: 'Отправить КП', clientId: c1.id, status: 'progress', urgent: true, price: 65000, paid: 30000, due: today(), time: '10:00', note: '' },
      { id: uid('t'), title: 'Собрать референсы для главного экрана', clientId: '', status: 'new', urgent: false, price: 0, paid: 0, due: '', time: '', note: '' }
    ];
    const now = new Date().toISOString();
    state.notes = [{
      id: uid('n'),
      body: '<div>Добро пожаловать в заметки</div><div>Пиши как обычно, форматируй жирным/курсивом, собирай списки.</div><div class="cl-line" data-checked="0">Попробовать чек-лист</div><div class="cl-line" data-checked="1">Прочитать эту заметку</div>',
      pinned: true, deletedAt: '', createdAt: now, updatedAt: now
    }];
    return state;
  };

  /* Перенос данных со старой (веб-архивной) версии CRM, ещё до сделок/задач v2 */
  const migrate = (old) => {
    const state = emptyState();
    const byName = new Map();
    const ensureClient = (name) => {
      const key = String(name || '').trim();
      if (!key) return '';
      if (byName.has(key)) return byName.get(key);
      const client = { id: uid('c'), name: key, contact: '', note: '', color: pickColor(key), createdAt: today() };
      state.clients.push(client);
      byName.set(key, client.id);
      return client.id;
    };

    (Array.isArray(old.clients) ? old.clients : []).forEach((c) => {
      const client = { id: c.id || uid('c'), name: c.name || 'Без имени', contact: c.email || '', note: c.type || '', color: c.color || pickColor(c.name), createdAt: today() };
      state.clients.push(client);
      byName.set(client.name, client.id);
    });

    const statusMap = { 'Новая заявка': 'new', 'Созвон': 'new', 'В работе': 'progress', 'Согласование': 'review', 'Оплата': 'review', 'Завершено': 'done' };
    (Array.isArray(old.deals) ? old.deals : []).forEach((d) => {
      const status = statusMap[d.status] || 'progress';
      state.tasks.push({
        id: d.id || uid('t'),
        title: d.name || 'Без названия',
        clientId: ensureClient(d.client),
        status,
        urgent: d.priority === 'high',
        price: num(d.value),
        paid: status === 'done' ? num(d.value) : 0,
        due: '', time: '', note: ''
      });
    });
    (Array.isArray(old.tasks) ? old.tasks : []).forEach((t) => {
      state.tasks.push({
        id: t.id || uid('t'),
        title: t.title || 'Без названия',
        clientId: ensureClient(t.project),
        status: t.done ? 'done' : 'progress',
        urgent: false,
        price: 0, paid: 0,
        due: today(), time: t.time || '', note: ''
      });
    });
    return state;
  };

  const normalize = (incoming) => {
    if (!incoming || typeof incoming !== 'object') return seed();
    if (incoming.v !== 2 && incoming.v !== 3 && (Array.isArray(incoming.deals) || Array.isArray(incoming.finance))) return migrate(incoming);

    const state = emptyState();
    const clientIds = new Set();

    (Array.isArray(incoming.clients) ? incoming.clients : []).forEach((c) => {
      if (!c || typeof c !== 'object') return;
      const id = String(c.id || uid('c'));
      clientIds.add(id);
      state.clients.push({
        id,
        name: String(c.name || 'Без имени').slice(0, 120),
        contact: String(c.contact || '').slice(0, 160),
        note: String(c.note || '').slice(0, 400),
        color: COLORS.includes(c.color) ? c.color : pickColor(c.name),
        createdAt: c.createdAt || today()
      });
    });

    (Array.isArray(incoming.tasks) ? incoming.tasks : []).forEach((t) => {
      if (!t || typeof t !== 'object') return;
      const price = num(t.price);
      state.tasks.push({
        id: String(t.id || uid('t')),
        title: String(t.title || 'Без названия').slice(0, 200),
        clientId: clientIds.has(t.clientId) ? t.clientId : '',
        status: STATUS_LABEL[t.status] ? t.status : 'new',
        urgent: Boolean(t.urgent),
        price,
        paid: Math.min(price, num(t.paid)),
        due: fromIso(t.due) ? t.due : '',
        time: validTime(t.time),
        note: String(t.note || '').slice(0, 800)
      });
    });

    (Array.isArray(incoming.notes) ? incoming.notes : []).forEach((n) => {
      if (!n || typeof n !== 'object') return;
      const stamp = new Date().toISOString();
      state.notes.push({
        id: String(n.id || uid('n')),
        body: sanitizeNoteHtml(String(n.body || '')).slice(0, 20000),
        pinned: Boolean(n.pinned),
        deletedAt: typeof n.deletedAt === 'string' && n.deletedAt ? n.deletedAt : '',
        createdAt: typeof n.createdAt === 'string' && n.createdAt ? n.createdAt : stamp,
        updatedAt: typeof n.updatedAt === 'string' && n.updatedAt ? n.updatedAt : stamp
      });
    });

    return state;
  };

  let data;
  let serverMode = false;
  let savePending = false;

  let migratedFromLegacy = false;
  try {
    const current = localStorage.getItem(KEY);
    const legacyV2 = current ? null : localStorage.getItem(LEGACY_KEY_V2);
    const legacyV1 = current || legacyV2 ? null : localStorage.getItem(LEGACY_KEY_V1);
    const source = current || legacyV2 || legacyV1;
    data = source ? normalize(JSON.parse(source)) : seed();
    migratedFromLegacy = Boolean(legacyV2 || legacyV1);
  } catch (_) {
    data = seed();
  }

  const setSyncState = (label, tone) => {
    const el = byId('sync-state');
    el.textContent = label;
    el.className = `sync sync--${tone}`;
  };

  const persist = () => {
    const payload = JSON.stringify(data);
    try { localStorage.setItem(KEY, payload); } catch (_) {}
    if (!serverMode) { setSyncState('Локально', 'local'); return; }
    if (savePending) return;
    savePending = true;
    setSyncState('Сохраняю…', 'busy');
    fetch('/crm/api.php?action=state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: data }),
      credentials: 'same-origin'
    })
      .then((r) => { if (!r.ok) throw new Error('storage'); setSyncState('Синхронизировано', 'ok'); })
      .catch(() => { setSyncState('Только локально', 'warn'); toast('Сервер недоступен — сохранено на этом устройстве'); })
      .finally(() => { savePending = false; });
  };

  const loadServerState = async () => {
    try {
      const response = await fetch('/crm/api.php?action=state', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      serverMode = true;
      if (result.state && typeof result.state === 'object') {
        const wasLegacy = result.state.v !== 3;
        data = normalize(result.state);
        setSyncState('Синхронизировано', 'ok');
        render();
        /* Серверная копия ещё в старом формате — сразу перезаписываем новой */
        if (wasLegacy) persist();
      } else {
        persist();
      }
    } catch (_) {
      serverMode = false;
      setSyncState('Локально', 'local');
    }
  };

  /* ── Производные величины ─────────────────────────────────── */
  const clientById = (id) => data.clients.find((c) => c.id === id) || null;
  const clientName = (id) => (clientById(id) || {}).name || '';
  const taskLeft = (task) => Math.max(0, task.price - task.paid);
  const earned = () => data.tasks.reduce((sum, t) => sum + t.paid, 0);
  const awaiting = () => data.tasks.reduce((sum, t) => sum + taskLeft(t), 0);

  /* ── Режим 1: Работа ──────────────────────────────────────── */
  let taskQuery = '';
  let clientQuery = '';
  let statusFilter = 'all';
  let metricsOpen = false;
  try { metricsOpen = localStorage.getItem(METRICS_KEY) === '1'; } catch (_) {}

  const metricCard = (label, value, hint, tone) => `
    <article class="metric${tone ? ` metric--${tone}` : ''}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      ${hint ? `<small>${esc(hint)}</small>` : ''}
    </article>`;

  const renderWorkMetrics = () => {
    const open = data.tasks.filter((t) => t.status !== 'done');
    const urgent = open.filter((t) => t.urgent);
    const overdue = open.filter((t) => t.due && daysBetween(today(), t.due) < 0);
    byId('work-metrics').innerHTML = [
      metricCard('Заработано', money(earned()), `по ${data.tasks.length} ${plural(data.tasks.length, 'задаче', 'задачам', 'задачам')}`),
      metricCard('Ждёт оплаты', money(awaiting()), awaiting() ? 'выставлено, но не получено' : 'всё оплачено', awaiting() ? 'warn' : 'ok'),
      metricCard('Срочные', String(urgent.length), overdue.length ? `${overdue.length} ${plural(overdue.length, 'просрочена', 'просрочены', 'просрочено')}` : 'всё в срок', urgent.length ? 'urgent' : ''),
      metricCard('В работе', String(open.length), `${data.clients.length} ${plural(data.clients.length, 'клиент', 'клиента', 'клиентов')}`)
    ].join('');
    byId('metrics-summary-text').textContent = `${money(earned())} заработано · ${urgent.length} ${plural(urgent.length, 'срочная', 'срочные', 'срочных')} · ${open.length} в работе`;
    byId('metrics-toggle').setAttribute('aria-expanded', String(metricsOpen));
    byId('work-metrics').hidden = !metricsOpen;
    byId('work-subtitle').textContent = open.length
      ? `${open.length} ${plural(open.length, 'открытая задача', 'открытые задачи', 'открытых задач')} · ${urgent.length} ${plural(urgent.length, 'срочная', 'срочные', 'срочных')}`
      : 'Открытых задач нет — можно выдохнуть.';
    byId('tab-count-tasks').textContent = data.tasks.length;
    byId('tab-count-clients').textContent = data.clients.length;
  };

  const renderStatusFilter = () => {
    const options = [{ id: 'all', label: 'Все' }, ...STATUSES];
    byId('status-filter').innerHTML = options.map((option) => {
      const count = option.id === 'all' ? data.tasks.length : data.tasks.filter((t) => t.status === option.id).length;
      return `<button class="chip${statusFilter === option.id ? ' is-active' : ''}" data-status-filter="${option.id}">${esc(option.label)} <em>${count}</em></button>`;
    }).join('');
  };

  const taskCard = (task) => {
    const client = clientById(task.clientId);
    const left = taskLeft(task);
    const payPercent = task.price > 0 ? Math.round(task.paid / task.price * 100) : 0;
    const overdue = task.due && task.status !== 'done' && daysBetween(today(), task.due) < 0;
    return `
      <article class="task${task.status === 'done' ? ' is-done' : ''}${task.urgent ? ' is-urgent' : ''}" data-task="${esc(task.id)}">
        <div class="task__top">
          <button class="task__check" data-toggle-task="${esc(task.id)}" aria-label="${task.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненной'}"></button>
          <div class="task__main" data-edit-task="${esc(task.id)}">
            <b>${esc(task.title)}</b>
            <div class="task__meta">
              ${client ? `<span class="tag tag--${client.color}">${esc(client.name)}</span>` : ''}
              <span class="task__due${overdue ? ' is-overdue' : ''}">${esc(task.due ? fmtDateRelative(task.due) : 'без даты')}${task.time ? ` · ${esc(task.time)}` : ''}</span>
              ${task.urgent ? '<span class="flag">срочно</span>' : ''}
            </div>
          </div>
          <button class="mini-btn" data-edit-task="${esc(task.id)}" title="Редактировать" aria-label="Редактировать">↗</button>
        </div>
        ${task.price > 0 ? `
          <div class="task__money">
            <b>${money(task.paid)} <i>из ${money(task.price)}</i></b>
            <div class="bar"><span style="width:${Math.min(100, payPercent)}%"></span></div>
            <small>${left > 0 ? `осталось ${money(left)}` : 'оплачено полностью'}</small>
          </div>` : ''}
        <div class="task__controls">
          ${task.status === 'new' ? `<button class="primary-btn primary-btn--sm" data-take-task="${esc(task.id)}">Взять в работу</button>` : `
          <select class="status-select status-select--${task.status}" data-task-status="${esc(task.id)}" aria-label="Статус задачи">
            ${STATUSES.map((s) => `<option value="${s.id}"${s.id === task.status ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select>`}
          ${left > 0 ? `<button class="mini-btn" data-pay-task="${esc(task.id)}" title="Внести оплату">+ ₽</button>` : ''}
        </div>
      </article>`;
  };

  const renderTasks = () => {
    const query = taskQuery.trim().toLowerCase();
    const visible = data.tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (!query) return true;
      return `${task.title} ${clientName(task.clientId)} ${task.note}`.toLowerCase().includes(query);
    });

    const sorted = visible.slice().sort((a, b) => {
      if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (!a.due && b.due) return 1;
      if (a.due && !b.due) return -1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return 0;
    });

    byId('task-groups').innerHTML = sorted.length ? `<div class="task-list">${sorted.map(taskCard).join('')}</div>` : `
      <div class="empty">
        <b>${query || statusFilter !== 'all' ? 'Ничего не нашлось' : 'Задач пока нет'}</b>
        <p>${query || statusFilter !== 'all' ? 'Попробуй изменить запрос или фильтр.' : 'Добавь первую — статус и срочность видны сразу на карточке.'}</p>
        ${query || statusFilter !== 'all' ? '' : '<button class="primary-btn" data-action="new-task">+ Задача</button>'}
      </div>`;
  };

  const renderClients = () => {
    const query = clientQuery.trim().toLowerCase();
    const visible = data.clients.filter((c) => !query || `${c.name} ${c.contact} ${c.note}`.toLowerCase().includes(query));

    byId('client-grid').innerHTML = visible.map((client) => {
      const tasks = data.tasks.filter((t) => t.clientId === client.id);
      const total = tasks.reduce((s, t) => s + t.price, 0);
      const paid = tasks.reduce((s, t) => s + t.paid, 0);
      const open = tasks.filter((t) => t.status !== 'done').length;
      const percent = total > 0 ? Math.round(paid / total * 100) : 0;
      return `
        <article class="client-card" data-edit-client="${esc(client.id)}">
          <div class="client-card__top">
            <span class="avatar avatar--${client.color}">${esc(initials(client.name))}</span>
            <div><b>${esc(client.name)}</b><small>${esc(client.contact || client.note || 'без контакта')}</small></div>
            <button class="mini-btn" data-edit-client="${esc(client.id)}" aria-label="Редактировать">↗</button>
          </div>
          <div class="client-card__stats">
            <div><small>Задач</small><b>${tasks.length}</b></div>
            <div><small>Открыто</small><b>${open}</b></div>
            <div><small>Заработано</small><b>${moneyShort(paid)}</b></div>
          </div>
          ${total > 0 ? `<div class="bar"><span style="width:${Math.min(100, percent)}%"></span></div><small class="client-card__hint">${paid < total ? `осталось получить ${money(total - paid)}` : 'всё оплачено'}</small>` : '<small class="client-card__hint">задачи без стоимости</small>'}
          <button class="text-link" data-client-tasks="${esc(client.id)}">Показать задачи ↗</button>
        </article>`;
    }).join('') || `
      <div class="empty">
        <b>${query ? 'Никого не нашлось' : 'Клиентов пока нет'}</b>
        <p>${query ? 'Попробуй другой запрос.' : 'Добавь первого — задачи можно будет к нему привязать.'}</p>
        ${query ? '' : '<button class="primary-btn" data-action="new-client">+ Клиент</button>'}
      </div>`;
  };

  const initials = (name) => String(name || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

  /* ── Заметки ──────────────────────────────────────────────── */
  let selectedNoteId = '';
  let notesQuery = '';
  let notesTrash = false;
  let noteSaveTimer = null;

  const sortNotes = (list) => list.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  });
  const visibleNotesBase = () => data.notes.filter((n) => Boolean(n.deletedAt) === notesTrash);

  const renderNotesList = () => {
    const query = notesQuery.trim().toLowerCase();
    let list = visibleNotesBase();
    if (query) list = list.filter((n) => noteSearchText(n).includes(query));
    list = sortNotes(list);

    byId('notes-list').innerHTML = list.map((n) => `
      <button class="note-row${n.id === selectedNoteId ? ' is-active' : ''}" data-open-note="${esc(n.id)}">
        <b>${n.pinned ? '<span class="note-row__pin" aria-hidden="true">📌</span>' : ''}${esc(noteTitle(n))}</b>
        <small>${esc(fmtNoteStamp(n.updatedAt))} · ${esc(notePreview(n))}</small>
      </button>`).join('') || `
      <div class="empty empty--compact">
        <b>${notesTrash ? 'Корзина пуста' : (query ? 'Ничего не нашлось' : 'Заметок пока нет')}</b>
        ${notesTrash || query ? '' : '<p>Нажми «+», чтобы начать первую.</p>'}
      </div>`;
  };

  const currentEditableLine = () => {
    const body = byId('note-body');
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let node = sel.anchorNode;
    if (node === body) return null;
    while (node && node.parentNode !== body) node = node.parentNode;
    return node && node.nodeType === 1 ? node : null;
  };

  const setNoteEmptyState = () => {
    const body = byId('note-body');
    body.classList.toggle('is-empty', !body.textContent.trim());
  };

  const renderNoteEditor = () => {
    const note = data.notes.find((n) => n.id === selectedNoteId && Boolean(n.deletedAt) === notesTrash) || null;
    const panel = byId('notes-editor-panel');
    const empty = byId('notes-editor-empty');
    const body = byId('note-body');
    if (!note) {
      selectedNoteId = '';
      panel.hidden = true;
      empty.hidden = false;
      return;
    }
    panel.hidden = false;
    empty.hidden = true;
    if (body.dataset.noteId !== note.id) {
      body.innerHTML = note.body || '';
      body.dataset.noteId = note.id;
      setNoteEmptyState();
    }
    body.contentEditable = notesTrash ? 'false' : 'true';
    byId('note-meta').textContent = `Изменено: ${fmtNoteStamp(note.updatedAt)}`;
    byId('note-pin').classList.toggle('is-active', note.pinned);
    byId('note-pin').hidden = notesTrash;
    byId('note-delete').textContent = notesTrash ? 'Удалить навсегда' : 'Удалить';
    byId('note-restore').hidden = !notesTrash;
    byId('note-toolbar').hidden = notesTrash;
  };

  const openNote = (id) => {
    selectedNoteId = id;
    renderNotesList();
    renderNoteEditor();
    byId('notes-layout').classList.add('show-editor');
  };

  const closeNoteEditor = () => {
    selectedNoteId = '';
    byId('notes-layout').classList.remove('show-editor');
    renderNotesList();
    renderNoteEditor();
  };

  const createNote = () => {
    const now = new Date().toISOString();
    const note = { id: uid('n'), body: '', pinned: false, deletedAt: '', createdAt: now, updatedAt: now };
    data.notes.unshift(note);
    notesTrash = false;
    persist();
    openNote(note.id);
    setTimeout(() => byId('note-body').focus(), 30);
  };

  const scheduleNoteSave = () => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      const note = data.notes.find((n) => n.id === selectedNoteId);
      if (!note) return;
      note.body = sanitizeNoteHtml(byId('note-body').innerHTML);
      note.updatedAt = new Date().toISOString();
      persist();
      renderNotesList();
    }, 500);
  };

  const toggleChecklistLine = () => {
    let line = currentEditableLine();
    if (!line) {
      document.execCommand('formatBlock', false, 'div');
      line = currentEditableLine();
    }
    if (!line) return;
    if (line.classList.contains('cl-line')) {
      line.classList.remove('cl-line');
      line.removeAttribute('data-checked');
    } else {
      line.classList.add('cl-line');
      line.dataset.checked = '0';
    }
  };

  /* ── Общий рендер ─────────────────────────────────────────── */
  const render = () => {
    renderWorkMetrics();
    renderStatusFilter();
    renderTasks();
    renderClients();
    renderNotesList();
    renderNoteEditor();
  };

  /* ── Навигация ────────────────────────────────────────────── */
  const VIEW_TITLES = { work: 'Работа', notes: 'Заметки' };
  const setView = (name) => {
    if (!VIEW_TITLES[name]) return;
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('is-visible', el.dataset.screen === name));
    document.querySelectorAll('.mode').forEach((el) => el.classList.toggle('is-active', el.dataset.view === name));
    byId('crumb').textContent = VIEW_TITLES[name];
    byId('sidebar').classList.remove('is-open');
    document.querySelector('.main').scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setTab = (name) => {
    document.querySelectorAll('.tab').forEach((el) => {
      const active = el.dataset.tab === name;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tabpanel').forEach((el) => el.classList.toggle('is-visible', el.dataset.tabpanel === name));
  };

  /* ── Модалка ──────────────────────────────────────────────── */
  const FORMS = {
    task: {
      kicker: 'Задача',
      title: (edit) => (edit ? 'Редактировать задачу' : 'Новая задача'),
      fields: [
        { key: 'title', label: 'Что нужно сделать', type: 'text', required: true },
        { key: 'clientId', label: 'Клиент', type: 'client' },
        { key: 'urgent', label: 'Срочность', type: 'select', half: true, options: () => [{ value: '', label: 'Не срочно' }, { value: '1', label: 'Срочно' }] },
        { key: 'status', label: 'Статус', type: 'select', half: true, options: () => STATUSES.map((s) => ({ value: s.id, label: s.label })) },
        { key: 'due', label: 'Дата', type: 'date', half: true },
        { key: 'time', label: 'Время', type: 'time', half: true },
        { key: 'price', label: 'Стоимость, ₽', type: 'number', half: true },
        { key: 'paid', label: 'Уже оплачено, ₽', type: 'number', half: true },
        { key: 'note', label: 'Заметка', type: 'textarea' }
      ]
    },
    client: {
      kicker: 'Клиент',
      title: (edit) => (edit ? 'Редактировать клиента' : 'Новый клиент'),
      fields: [
        { key: 'name', label: 'Имя или компания', type: 'text', required: true },
        { key: 'contact', label: 'Контакт (почта, телеграм)', type: 'text' },
        { key: 'note', label: 'Заметка', type: 'textarea' }
      ]
    },
    payment: {
      kicker: 'Оплата',
      title: () => 'Внести оплату',
      fields: [
        { key: 'amount', label: 'Сколько пришло, ₽', type: 'number', required: true }
      ]
    }
  };

  let modal = { form: '', id: '' };
  let lastFocused = null;

  const fieldHtml = (field, value) => {
    const name = field.key;
    let control = '';
    if (field.type === 'textarea') {
      control = `<textarea name="${name}" rows="3">${esc(value)}</textarea>`;
    } else if (field.type === 'select') {
      control = `<select name="${name}">${field.options().map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (field.type === 'client') {
      control = `<select name="${name}"><option value="">— без клиента —</option>${data.clients.map((c) => `<option value="${esc(c.id)}"${c.id === value ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
    } else {
      const min = field.type === 'number' ? ' min="0" step="100"' : '';
      control = `<input name="${name}" type="${field.type}" value="${esc(value)}"${field.required ? ' required' : ''}${min}>`;
    }
    return `<div class="form-field${field.half ? ' form-field--half' : ''}"><label>${esc(field.label)}</label>${control}</div>`;
  };

  const openModal = (formName, item = {}) => {
    const config = FORMS[formName];
    if (!config) return;
    modal = { form: formName, id: item.id || '' };
    lastFocused = document.activeElement;
    byId('modal-kicker').textContent = config.kicker;
    byId('modal-title').textContent = config.title(Boolean(item.id));
    byId('modal-fields').innerHTML = config.fields.map((f) => {
      let value = item[f.key];
      if (f.key === 'urgent') value = item.urgent ? '1' : '';
      if (value === undefined || value === null) value = '';
      return fieldHtml(f, value);
    }).join('');
    const deleteBtn = byId('modal-delete');
    deleteBtn.hidden = !(modal.id && (formName === 'task' || formName === 'client'));
    byId('modal').hidden = false;
    setTimeout(() => byId('modal-fields').querySelector('input, select, textarea')?.focus(), 30);
  };

  const closeModal = () => {
    byId('modal').hidden = true;
    modal = { form: '', id: '' };
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  };

  const saveModal = (form) => {
    const raw = Object.fromEntries(new FormData(form));

    if (modal.form === 'task') {
      if (!String(raw.title || '').trim()) { toast('Нужно название задачи'); return; }
      const price = num(raw.price);
      const task = modal.id ? data.tasks.find((t) => t.id === modal.id) : { id: uid('t') };
      if (!task) { closeModal(); return; }
      Object.assign(task, {
        title: String(raw.title).trim(),
        clientId: String(raw.clientId || ''),
        urgent: raw.urgent === '1',
        status: STATUS_LABEL[raw.status] ? raw.status : 'new',
        due: fromIso(raw.due) ? raw.due : '',
        time: validTime(raw.time),
        price,
        paid: Math.min(price, num(raw.paid)),
        note: String(raw.note || '').trim()
      });
      if (!modal.id) data.tasks.unshift(task);
    }

    if (modal.form === 'client') {
      if (!String(raw.name || '').trim()) { toast('Нужно имя клиента'); return; }
      const client = modal.id ? data.clients.find((c) => c.id === modal.id) : { id: uid('c'), createdAt: today() };
      if (!client) { closeModal(); return; }
      Object.assign(client, {
        name: String(raw.name).trim(),
        contact: String(raw.contact || '').trim(),
        note: String(raw.note || '').trim(),
        color: client.color || pickColor(raw.name)
      });
      if (!modal.id) data.clients.unshift(client);
    }

    if (modal.form === 'payment') {
      const task = data.tasks.find((t) => t.id === modal.id);
      const amount = num(raw.amount);
      if (!task) { closeModal(); return; }
      if (amount <= 0) { toast('Сумма должна быть больше нуля'); return; }
      task.paid = Math.min(task.price, task.paid + amount);
      toast(taskLeft(task) > 0 ? `Записано. Осталось ${money(taskLeft(task))}` : 'Задача оплачена полностью');
      persist(); closeModal(); render();
      return;
    }

    persist(); closeModal(); render(); toast('Сохранено');
  };

  const deleteCurrent = () => {
    if (!modal.id) return;
    if (modal.form === 'task') {
      data.tasks = data.tasks.filter((t) => t.id !== modal.id);
    } else if (modal.form === 'client') {
      data.clients = data.clients.filter((c) => c.id !== modal.id);
      data.tasks.forEach((t) => { if (t.clientId === modal.id) t.clientId = ''; });
    }
    persist(); closeModal(); render(); toast('Удалено');
  };

  /* ── Резервные копии ──────────────────────────────────────── */
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), state: data }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `workspace-${today()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Резервная копия скачана');
  };

  byId('backup-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.state || parsed;
      const looksValid = incoming && typeof incoming === 'object' && (Array.isArray(incoming.tasks) || Array.isArray(incoming.deals));
      if (!looksValid) throw new Error('Файл не похож на резервную копию');
      data = normalize(incoming);
      persist(); render(); toast('Резервная копия восстановлена');
    } catch (error) {
      toast(error.message || 'Не удалось импортировать файл');
    }
    event.target.value = '';
  });

  /* ── События ──────────────────────────────────────────────── */
  const openAction = (action) => {
    if (action === 'new-task') { openModal('task', { status: 'new', due: today() }); return true; }
    if (action === 'new-client') { openModal('client'); return true; }
    if (action === 'new-note') { setView('notes'); notesTrash = false; createNote(); return true; }
    if (action === 'export') { exportBackup(); return true; }
    if (action === 'import') { byId('backup-file').click(); return true; }
    return false;
  };

  document.addEventListener('click', (event) => {
    const target = event.target;

    const modeBtn = target.closest('[data-view]');
    if (modeBtn) { setView(modeBtn.dataset.view); return; }

    const tabBtn = target.closest('.tab');
    if (tabBtn) { setTab(tabBtn.dataset.tab); return; }

    const actionBtn = target.closest('[data-action]');
    if (actionBtn && openAction(actionBtn.dataset.action)) {
      byId('add-sheet').hidden = true;
      byId('profile-menu').hidden = true;
      byId('profile-btn').setAttribute('aria-expanded', 'false');
      return;
    }

    const statusChip = target.closest('[data-status-filter]');
    if (statusChip) { statusFilter = statusChip.dataset.statusFilter; renderStatusFilter(); renderTasks(); return; }

    const toggleBtn = target.closest('[data-toggle-task]');
    if (toggleBtn) {
      const task = data.tasks.find((t) => t.id === toggleBtn.dataset.toggleTask);
      if (task) { task.status = task.status === 'done' ? 'progress' : 'done'; persist(); render(); }
      return;
    }

    const takeBtn = target.closest('[data-take-task]');
    if (takeBtn) {
      const task = data.tasks.find((t) => t.id === takeBtn.dataset.takeTask);
      if (task) { task.status = 'progress'; persist(); render(); toast('Взято в работу'); }
      return;
    }

    const payBtn = target.closest('[data-pay-task]');
    if (payBtn) {
      const task = data.tasks.find((t) => t.id === payBtn.dataset.payTask);
      if (task) openModal('payment', { id: task.id, amount: taskLeft(task) });
      return;
    }

    const editTask = target.closest('[data-edit-task]');
    if (editTask) {
      const task = data.tasks.find((t) => t.id === editTask.dataset.editTask);
      if (task) openModal('task', task);
      return;
    }

    const clientTasks = target.closest('[data-client-tasks]');
    if (clientTasks) {
      event.stopPropagation();
      const client = clientById(clientTasks.dataset.clientTasks);
      if (client) { taskQuery = client.name; byId('task-search').value = client.name; statusFilter = 'all'; setTab('tasks'); renderStatusFilter(); renderTasks(); }
      return;
    }

    const editClient = target.closest('[data-edit-client]');
    if (editClient) {
      const client = clientById(editClient.dataset.editClient);
      if (client) openModal('client', client);
      return;
    }

    const openNoteBtn = target.closest('[data-open-note]');
    if (openNoteBtn) { openNote(openNoteBtn.dataset.openNote); return; }

    if (target.closest('[data-modal-close]')) { closeModal(); return; }
    if (target.closest('#modal-delete')) { deleteCurrent(); return; }
    if (target.closest('[data-sheet-close]')) { byId('add-sheet').hidden = true; return; }

    if (!target.closest('#profile')) {
      byId('profile-menu').hidden = true;
      byId('profile-btn').setAttribute('aria-expanded', 'false');
    }
    if (!target.closest('#sidebar') && !target.closest('#burger')) byId('sidebar').classList.remove('is-open');
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest('[data-task-status]');
    if (!select) return;
    const task = data.tasks.find((t) => t.id === select.dataset.taskStatus);
    if (!task) return;
    task.status = select.value;
    persist(); render();
  });

  /* ── Метрики: сворачиваемая сводка ────────────────────────── */
  byId('metrics-toggle').addEventListener('click', () => {
    metricsOpen = !metricsOpen;
    try { localStorage.setItem(METRICS_KEY, metricsOpen ? '1' : '0'); } catch (_) {}
    byId('work-metrics').hidden = !metricsOpen;
    byId('metrics-toggle').setAttribute('aria-expanded', String(metricsOpen));
  });

  /* ── Заметки: события ─────────────────────────────────────── */
  byId('notes-new').addEventListener('click', createNote);
  byId('notes-back').addEventListener('click', closeNoteEditor);
  byId('note-search').addEventListener('input', (event) => { notesQuery = event.target.value; renderNotesList(); });
  byId('notes-trash-toggle').addEventListener('click', () => {
    notesTrash = !notesTrash;
    byId('notes-trash-toggle').classList.toggle('is-active', notesTrash);
    selectedNoteId = '';
    byId('notes-layout').classList.remove('show-editor');
    renderNotesList();
    renderNoteEditor();
  });
  byId('note-pin').addEventListener('click', () => {
    const note = data.notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    note.pinned = !note.pinned;
    persist(); renderNotesList(); renderNoteEditor();
  });
  byId('note-delete').addEventListener('click', () => {
    const note = data.notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    if (notesTrash) {
      if (!window.confirm('Удалить заметку навсегда? Это нельзя отменить.')) return;
      data.notes = data.notes.filter((n) => n.id !== note.id);
      toast('Удалено навсегда');
    } else {
      note.deletedAt = new Date().toISOString();
      toast('Перемещено в корзину');
    }
    closeNoteEditor();
    persist(); render();
  });
  byId('note-restore').addEventListener('click', () => {
    const note = data.notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    note.deletedAt = '';
    notesTrash = false;
    byId('notes-trash-toggle').classList.remove('is-active');
    persist();
    openNote(note.id);
    toast('Восстановлено');
  });
  byId('note-toolbar').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cmd]');
    if (!btn) return;
    event.preventDefault();
    const body = byId('note-body');
    body.focus();
    if (btn.dataset.cmd === 'checklist') toggleChecklistLine();
    else document.execCommand(btn.dataset.cmd, false, null);
    scheduleNoteSave();
  });
  const noteBody = byId('note-body');
  noteBody.addEventListener('input', () => { setNoteEmptyState(); scheduleNoteSave(); });
  noteBody.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  noteBody.addEventListener('mousedown', (event) => {
    const line = event.target.closest('.cl-line');
    if (!line) return;
    const rect = line.getBoundingClientRect();
    if (event.clientX - rect.left > 26) return;
    event.preventDefault();
    line.dataset.checked = line.dataset.checked === '1' ? '0' : '1';
    scheduleNoteSave();
  });
  /* Разбиваем строку сами, а не полагаемся на дефолтное поведение браузера —
     оно у разных браузеров/движков отличается (где-то <div>, где-то только <br>),
     а построчная модель (заголовок = первая строка, чек-листы) должна быть предсказуемой. */
  noteBody.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let line = currentEditableLine();
    if (!line) {
      document.execCommand('formatBlock', false, 'div');
      line = currentEditableLine();
    }
    if (!line) return;
    const wasChecklist = line.classList.contains('cl-line');
    if (wasChecklist && !line.textContent.trim()) {
      line.classList.remove('cl-line');
      line.removeAttribute('data-checked');
      return;
    }
    const tailRange = sel.getRangeAt(0).cloneRange();
    tailRange.setEnd(line, line.childNodes.length);
    const tail = tailRange.extractContents();
    const next = document.createElement('div');
    if (wasChecklist) { next.className = 'cl-line'; next.dataset.checked = '0'; }
    next.appendChild(tail);
    if (!next.textContent && !next.querySelector('br')) next.appendChild(document.createElement('br'));
    line.after(next);
    if (!line.textContent.trim() && !line.querySelector('br')) line.innerHTML = '<br>';
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    scheduleNoteSave();
  });

  /* ── AI-ассистент ─────────────────────────────────────────── */
  const agentHistory = [];
  let agentBusy = false;
  let agentLastUndo = null;

  /* Компактный снимок: модели нужны id и суть, а не всё подряд */
  const agentSnapshot = () => ({
    today: today(),
    clients: data.clients.slice(0, 60).map((c) => ({ id: c.id, name: c.name, contact: c.contact })),
    tasks: data.tasks.slice(0, 80).map((t) => ({
      id: t.id, title: t.title, client: clientName(t.clientId) || null,
      status: t.status, urgent: t.urgent, price: t.price, paid: t.paid, due: t.due || null, time: t.time || null
    })),
    totals: { earned: earned(), awaiting: awaiting() }
  });

  const findClientByNameOrId = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return data.clients.find((c) => c.id === raw)
      || data.clients.find((c) => c.name.toLowerCase() === raw.toLowerCase())
      || null;
  };

  /* Поля задачи из операции — общий разбор для create и update */
  const taskFieldsFrom = (op, task) => {
    const patch = {};
    if (op.title !== undefined && String(op.title).trim()) patch.title = String(op.title).trim();
    if (op.status !== undefined && STATUS_LABEL[op.status]) patch.status = op.status;
    if (op.urgent !== undefined) patch.urgent = Boolean(op.urgent);
    if (op.due !== undefined) patch.due = fromIso(op.due) ? op.due : '';
    if (op.time !== undefined) patch.time = validTime(op.time);
    if (op.note !== undefined) patch.note = String(op.note).trim();
    if (op.client !== undefined) {
      const existing = findClientByNameOrId(op.client);
      if (existing) patch.clientId = existing.id;
      else if (String(op.client).trim()) {
        const created = { id: uid('c'), name: String(op.client).trim(), contact: '', note: '', color: pickColor(op.client), createdAt: today() };
        data.clients.unshift(created);
        patch.clientId = created.id;
      } else patch.clientId = '';
    }
    const price = op.price !== undefined ? num(op.price) : (task ? task.price : 0);
    if (op.price !== undefined) patch.price = price;
    if (op.paid !== undefined) patch.paid = Math.min(price, num(op.paid));
    return patch;
  };

  const applyOps = (ops) => {
    const done = [];
    ops.forEach((op) => {
      try {
        if (op.op === 'task.create') {
          const task = { id: uid('t'), title: 'Без названия', clientId: '', status: 'new', urgent: false, price: 0, paid: 0, due: '', time: '', note: '' };
          Object.assign(task, taskFieldsFrom(op, task));
          data.tasks.unshift(task);
          done.push(`Задача «${task.title}»`);
          return;
        }
        if (op.op === 'task.update') {
          const task = data.tasks.find((t) => t.id === op.id);
          if (!task) return;
          Object.assign(task, taskFieldsFrom(op, task));
          task.paid = Math.min(task.price, task.paid);
          done.push(`Изменена «${task.title}»`);
          return;
        }
        if (op.op === 'task.pay') {
          const task = data.tasks.find((t) => t.id === op.id);
          if (!task || num(op.amount) <= 0) return;
          task.paid = Math.min(task.price, task.paid + num(op.amount));
          done.push(`Оплата ${money(num(op.amount))} → «${task.title}»`);
          return;
        }
        if (op.op === 'task.delete') {
          const task = data.tasks.find((t) => t.id === op.id);
          if (!task) return;
          data.tasks = data.tasks.filter((t) => t.id !== op.id);
          done.push(`Удалена «${task.title}»`);
          return;
        }
        if (op.op === 'client.create') {
          const name = String(op.name || '').trim();
          if (!name || findClientByNameOrId(name)) return;
          data.clients.unshift({ id: uid('c'), name, contact: String(op.contact || '').trim(), note: String(op.note || '').trim(), color: pickColor(name), createdAt: today() });
          done.push(`Клиент «${name}»`);
          return;
        }
        if (op.op === 'client.update') {
          const client = data.clients.find((c) => c.id === op.id);
          if (!client) return;
          if (op.name !== undefined && String(op.name).trim()) client.name = String(op.name).trim();
          if (op.contact !== undefined) client.contact = String(op.contact).trim();
          if (op.note !== undefined) client.note = String(op.note).trim();
          done.push(`Изменён клиент «${client.name}»`);
          return;
        }
        if (op.op === 'client.delete') {
          const client = data.clients.find((c) => c.id === op.id);
          if (!client) return;
          data.clients = data.clients.filter((c) => c.id !== op.id);
          data.tasks.forEach((t) => { if (t.clientId === op.id) t.clientId = ''; });
          done.push(`Удалён клиент «${client.name}»`);
          return;
        }
      } catch (_) { /* одна кривая операция не должна ронять остальные */ }
    });
    return done;
  };

  const agentBubble = (role, text, extra) => {
    const log = byId('agent-log');
    const wrap = document.createElement('div');
    wrap.className = `agent-msg agent-msg--${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'agent-msg__body';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    if (extra) wrap.appendChild(extra);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  };

  const agentSend = async (message) => {
    if (agentBusy) return;
    agentBusy = true;
    byId('agent-send').disabled = true;
    agentBubble('user', message);
    agentHistory.push({ role: 'user', text: message });
    const thinking = agentBubble('bot', 'Думаю…');
    thinking.classList.add('is-thinking');

    try {
      const response = await fetch('/crm/agent.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message, snapshot: agentSnapshot(), history: agentHistory.slice(0, -1) })
      });
      const result = await response.json().catch(() => ({}));
      thinking.remove();
      if (!response.ok) {
        agentBubble('bot', result.error || 'Не получилось связаться с ассистентом.');
        return;
      }

      const ops = Array.isArray(result.ops) ? result.ops : [];
      let card = null;
      if (ops.length) {
        const before = JSON.stringify(data);
        const changes = applyOps(ops);
        if (changes.length) {
          persist();
          render();
          card = document.createElement('div');
          card.className = 'agent-ops';
          card.innerHTML = `<ul>${changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
          /* Откат живёт только у последнего действия — иначе клик по старой
             кнопке молча затрёт всё, что сделано после неё */
          if (agentLastUndo) { agentLastUndo.disabled = true; agentLastUndo.textContent = 'Применено'; }
          const undo = document.createElement('button');
          undo.className = 'text-link';
          undo.textContent = 'Отменить';
          undo.addEventListener('click', () => {
            data = normalize(JSON.parse(before));
            persist(); render();
            undo.disabled = true;
            undo.textContent = 'Отменено';
            agentLastUndo = null;
            toast('Изменения отменены');
          }, { once: true });
          card.appendChild(undo);
          agentLastUndo = undo;
        }
      }
      const reply = result.reply || (card ? 'Готово.' : 'Не понял, что нужно сделать.');
      agentBubble('bot', reply, card);
      agentHistory.push({ role: 'assistant', text: reply });
      if (agentHistory.length > 16) agentHistory.splice(0, agentHistory.length - 16);
    } catch (_) {
      thinking.remove();
      agentBubble('bot', 'Сеть недоступна. Попробуй ещё раз.');
    } finally {
      agentBusy = false;
      byId('agent-send').disabled = false;
      byId('agent-input').focus();
    }
  };

  const agentPanel = byId('agent');
  const agentToggle = (open) => {
    agentPanel.hidden = !open;
    byId('agent-fab').setAttribute('aria-expanded', open ? 'true' : 'false');
    byId('agent-fab').classList.toggle('is-open', open);
    if (open) {
      byId('agent-input').focus();
      if (!byId('agent-log').children.length) {
        agentBubble('bot', 'Напиши обычным текстом, что записать или изменить. Например: «оплатили 30 тысяч по КП для Авито».');
        fetch('/crm/agent.php?action=status', { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((s) => { if (!s.ready) agentBubble('bot', 'Ассистент пока не настроен: добавь бесплатный API-ключ в config.php → ai.key. Как получить — написано в комментарии рядом.'); })
          .catch(() => {});
      }
    }
  };

  byId('agent-fab').addEventListener('click', () => agentToggle(agentPanel.hidden));
  byId('agent-close').addEventListener('click', () => agentToggle(false));
  byId('agent-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = byId('agent-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    agentSend(text);
  });
  byId('agent-input').addEventListener('input', (event) => {
    event.target.style.height = 'auto';
    event.target.style.height = Math.min(120, event.target.scrollHeight) + 'px';
  });
  byId('agent-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); byId('agent-form').requestSubmit(); }
  });

  byId('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    toast(next === 'dark' ? 'Тёмная тема' : 'Светлая тема');
  });
  byId('quick-add').addEventListener('click', () => { byId('add-sheet').hidden = !byId('add-sheet').hidden; });
  byId('burger').addEventListener('click', () => byId('sidebar').classList.toggle('is-open'));
  byId('profile-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = byId('profile-menu');
    menu.hidden = !menu.hidden;
    byId('profile-btn').setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  });

  byId('modal-form').addEventListener('submit', (event) => { event.preventDefault(); saveModal(event.currentTarget); });
  byId('task-search').addEventListener('input', (event) => { taskQuery = event.target.value; renderTasks(); });
  byId('client-search').addEventListener('input', (event) => { clientQuery = event.target.value; renderClients(); });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!byId('modal').hidden) { closeModal(); return; }
    if (!byId('add-sheet').hidden) { byId('add-sheet').hidden = true; return; }
    if (!byId('agent').hidden) { agentToggle(false); return; }
    byId('sidebar').classList.remove('is-open');
  });

  /* Фокус-трап модалки */
  byId('modal').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = byId('modal').querySelectorAll('button, input, select, textarea, a[href]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  render();
  setSyncState('Проверяю…', 'busy');
  if (migratedFromLegacy) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.removeItem(LEGACY_KEY_V2);
      localStorage.removeItem(LEGACY_KEY_V1);
    } catch (_) {}
    toast('Данные перенесены в новый формат');
  }
  loadServerState();
})();
