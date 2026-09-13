(() => {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
     Модель данных (v2)
     clients: {id, name, contact, note, color, createdAt}
     tasks:   {id, title, clientId, status, urgent, price, paid, due, time, note}
     vietnam: {title, tagline, target, deadline, entries:[{id,type,amount,date,note}]}
     ────────────────────────────────────────────────────────────── */

  const KEY = 'pelenev.crm.workspace.v2';
  const LEGACY_KEY = 'pelenev.crm.workspace.v1';
  const THEME_KEY = 'pelenev.crm.theme';

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
  const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
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
  const initials = (name) => String(name || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';
  const pickColor = (seed) => COLORS[Math.abs([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];

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
  const emptyState = () => ({
    v: 2,
    clients: [],
    tasks: [],
    vietnam: { title: 'Вьетнам', tagline: 'Место для следующей главы. Коплю спокойно, двигаюсь системно.', target: 500000, deadline: '', entries: [] }
  });

  const seed = () => {
    const state = emptyState();
    const c1 = { id: uid('c'), name: 'Авито Сервис', contact: 'hello@avito.example', note: 'Сайт под ключ', color: 'orange', createdAt: today() };
    const c2 = { id: uid('c'), name: 'Студия «Север»', contact: 'hello@sever.example', note: 'Айдентика', color: 'blue', createdAt: today() };
    state.clients = [c1, c2];
    state.tasks = [
      { id: uid('t'), title: 'Отправить КП', clientId: c1.id, status: 'progress', urgent: true, price: 65000, paid: 30000, due: today(), time: '10:00', note: '' },
      { id: uid('t'), title: 'Собрать референсы для главного экрана', clientId: c2.id, status: 'new', urgent: false, price: 94000, paid: 0, due: iso(new Date(Date.now() + 3 * 86400000)), time: '', note: '' }
    ];
    state.vietnam.entries = [{ id: uid('v'), type: 'deposit', amount: 40000, date: today(), note: 'Первое пополнение' }];
    return state;
  };

  /* Перенос данных со старой версии CRM */
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

    if (old.goal && typeof old.goal === 'object') {
      state.vietnam.target = Math.max(1, num(old.goal.target) || 500000);
      const saved = num(old.goal.saved);
      if (saved > 0) state.vietnam.entries.push({ id: uid('v'), type: 'deposit', amount: saved, date: today(), note: 'Перенос из прошлой версии' });
    }
    return state;
  };

  const normalize = (incoming) => {
    if (!incoming || typeof incoming !== 'object') return seed();
    if (incoming.v !== 2 && (Array.isArray(incoming.deals) || Array.isArray(incoming.finance))) return migrate(incoming);

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

    const vn = incoming.vietnam && typeof incoming.vietnam === 'object' ? incoming.vietnam : {};
    state.vietnam.title = String(vn.title || 'Вьетнам').slice(0, 60);
    state.vietnam.tagline = String(vn.tagline || state.vietnam.tagline).slice(0, 200);
    state.vietnam.target = Math.max(1, num(vn.target) || 500000);
    state.vietnam.deadline = fromIso(vn.deadline) ? vn.deadline : '';
    state.vietnam.entries = (Array.isArray(vn.entries) ? vn.entries : [])
      .filter((e) => e && typeof e === 'object' && num(e.amount) > 0)
      .map((e) => ({
        id: String(e.id || uid('v')),
        type: e.type === 'expense' ? 'expense' : 'deposit',
        amount: num(e.amount),
        date: fromIso(e.date) ? e.date : today(),
        note: String(e.note || '').slice(0, 200)
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return state;
  };

  let data;
  let serverMode = false;
  let savePending = false;

  let migratedFromLegacy = false;
  try {
    const current = localStorage.getItem(KEY);
    const legacy = current ? null : localStorage.getItem(LEGACY_KEY);
    data = current || legacy ? normalize(JSON.parse(current || legacy)) : seed();
    migratedFromLegacy = Boolean(legacy);
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
        const wasLegacy = result.state.v !== 2;
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
  const vnSaved = () => data.vietnam.entries.reduce((sum, e) => sum + (e.type === 'deposit' ? e.amount : -e.amount), 0);
  const vnPercent = () => Math.max(0, Math.min(100, Math.round(vnSaved() / data.vietnam.target * 100)));

  /* ── Режим 1: Работа ──────────────────────────────────────── */
  let taskQuery = '';
  let clientQuery = '';
  let statusFilter = 'all';

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
        <button class="task__check" data-toggle-task="${esc(task.id)}" aria-label="${task.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненной'}"></button>
        <div class="task__main" data-edit-task="${esc(task.id)}">
          <b>${esc(task.title)}</b>
          <div class="task__meta">
            ${client ? `<span class="tag tag--${client.color}">${esc(client.name)}</span>` : '<span class="tag tag--empty">без клиента</span>'}
            <span class="task__due${overdue ? ' is-overdue' : ''}">${esc(task.due ? fmtDateRelative(task.due) : 'без даты')}${task.time ? ` · ${esc(task.time)}` : ''}</span>
            ${task.urgent ? '<span class="flag">срочно</span>' : ''}
          </div>
        </div>
        <div class="task__money">
          ${task.price > 0 ? `
            <b>${money(task.paid)} <i>из ${money(task.price)}</i></b>
            <div class="bar"><span style="width:${Math.min(100, payPercent)}%"></span></div>
            <small>${left > 0 ? `осталось ${money(left)}` : 'оплачено полностью'}</small>
          ` : '<b class="task__money-empty">без стоимости</b>'}
        </div>
        <div class="task__controls">
          <select class="status-select status-select--${task.status}" data-task-status="${esc(task.id)}" aria-label="Статус задачи">
            ${STATUSES.map((s) => `<option value="${s.id}"${s.id === task.status ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select>
          ${left > 0 ? `<button class="mini-btn" data-pay-task="${esc(task.id)}" title="Внести оплату">+ ₽</button>` : ''}
          <button class="mini-btn" data-edit-task="${esc(task.id)}" title="Редактировать" aria-label="Редактировать">↗</button>
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

    const sort = (list) => list.slice().sort((a, b) => {
      if (!a.due && b.due) return 1;
      if (a.due && !b.due) return -1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return 0;
    });

    const urgent = sort(visible.filter((t) => t.urgent && t.status !== 'done'));
    const normal = sort(visible.filter((t) => !t.urgent && t.status !== 'done'));
    const done = sort(visible.filter((t) => t.status === 'done')).reverse();

    const group = (title, kicker, items, modifier) => {
      if (!items.length) return '';
      const sum = items.reduce((s, t) => s + taskLeft(t), 0);
      return `
        <section class="task-group${modifier ? ` task-group--${modifier}` : ''}">
          <div class="task-group__head">
            <div><span class="panel-kicker">${esc(kicker)}</span><h2>${esc(title)} <em>${items.length}</em></h2></div>
            ${sum > 0 ? `<span class="period-label">к получению ${money(sum)}</span>` : ''}
          </div>
          <div class="task-list">${items.map(taskCard).join('')}</div>
        </section>`;
    };

    const html = [
      group('Срочные', 'Горит', urgent, 'urgent'),
      group('Не срочные', 'Спокойно', normal, ''),
      group('Готово', 'Закрыто', done, 'done')
    ].join('');

    byId('task-groups').innerHTML = html || `
      <div class="empty">
        <b>${query || statusFilter !== 'all' ? 'Ничего не нашлось' : 'Задач пока нет'}</b>
        <p>${query || statusFilter !== 'all' ? 'Попробуй изменить запрос или фильтр.' : 'Добавь первую — у неё сразу будут срок, клиент и стоимость.'}</p>
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

  /* ── Режим 2: Календарь ───────────────────────────────────── */
  let calCursor = new Date();
  let calSelected = today();

  const renderCalendar = () => {
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    byId('cal-title').textContent = `${MONTHS_NOM[month]} ${year}`;
    byId('cal-week-head').innerHTML = WEEKDAYS.map((d) => `<span>${d}</span>`).join('');

    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = iso(date);
      const tasks = data.tasks.filter((t) => t.due === key);
      const outside = date.getMonth() !== month;
      const dots = tasks.slice(0, 4).map((t) => `<i class="dot dot--${t.status === 'done' ? 'done' : t.urgent ? 'urgent' : 'normal'}"></i>`).join('');
      const money_ = tasks.reduce((s, t) => s + taskLeft(t), 0);
      cells.push(`
        <button class="cal-cell${outside ? ' is-outside' : ''}${key === today() ? ' is-today' : ''}${key === calSelected ? ' is-selected' : ''}" data-cal-day="${key}">
          <span class="cal-cell__num">${date.getDate()}</span>
          ${tasks.length ? `<span class="cal-cell__dots">${dots}${tasks.length > 4 ? `<em>+${tasks.length - 4}</em>` : ''}</span>` : ''}
          ${money_ > 0 ? `<span class="cal-cell__money">${moneyShort(money_)}</span>` : ''}
        </button>`);
    }
    byId('cal-grid').innerHTML = cells.join('');
    renderCalendarDay();
  };

  const calTaskRow = (task) => {
    const client = clientById(task.clientId);
    return `
      <div class="cal-task${task.status === 'done' ? ' is-done' : ''}" data-edit-task="${esc(task.id)}">
        <i class="dot dot--${task.status === 'done' ? 'done' : task.urgent ? 'urgent' : 'normal'}"></i>
        <span>
          <b>${esc(task.title)}</b>
          <small>${esc(client ? client.name : 'без клиента')}${task.time ? ` · ${esc(task.time)}` : ''} · ${esc(STATUS_LABEL[task.status])}</small>
        </span>
        ${taskLeft(task) > 0 ? `<strong>${moneyShort(taskLeft(task))}</strong>` : ''}
      </div>`;
  };

  const renderCalendarDay = () => {
    const d = fromIso(calSelected);
    byId('cal-day-title').textContent = d
      ? `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[(d.getDay() + 6) % 7].toLowerCase()}`
      : '—';
    const tasks = data.tasks.filter((t) => t.due === calSelected)
      .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
    byId('cal-day-list').innerHTML = tasks.map(calTaskRow).join('')
      || '<p class="cal-empty">В этот день ничего не запланировано.</p>';

    const undated = data.tasks.filter((t) => !t.due && t.status !== 'done');
    byId('cal-undated-count').textContent = `${undated.length} ${plural(undated.length, 'задача', 'задачи', 'задач')}`;
    byId('cal-undated-list').innerHTML = undated.map(calTaskRow).join('')
      || '<p class="cal-empty">Все задачи привязаны к датам.</p>';
  };

  /* ── Режим 3: Вьетнам ─────────────────────────────────────── */
  const renderVietnam = () => {
    const vn = data.vietnam;
    const saved = vnSaved();
    const left = Math.max(0, vn.target - saved);
    const percent = vnPercent();

    byId('vn-title').textContent = vn.title;
    byId('vn-tagline').textContent = vn.tagline;
    byId('vn-percent').textContent = `${percent}%`;

    const ring = byId('vn-ring');
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(circumference * (1 - percent / 100));

    /* Темп: сколько в среднем откладывается в месяц за последние 90 дней */
    const windowStart = iso(new Date(Date.now() - 90 * 86400000));
    const recent = vn.entries.filter((e) => e.date >= windowStart);
    const recentNet = recent.reduce((s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount), 0);
    const spanDays = recent.length ? Math.max(30, Math.abs(daysBetween(recent[recent.length - 1].date, today())) || 30) : 0;
    const perMonth = spanDays ? Math.round(recentNet / spanDays * 30) : 0;
    const monthsLeft = perMonth > 0 ? left / perMonth : null;
    const forecast = monthsLeft !== null
      ? new Date(Date.now() + monthsLeft * 30 * 86400000)
      : null;

    byId('vn-metrics').innerHTML = [
      metricCard('Накоплено', money(saved), saved < 0 ? 'расходы превысили пополнения' : `цель ${money(vn.target)}`, saved < 0 ? 'urgent' : 'ok'),
      metricCard('Осталось', money(left), left ? `${percent}% пути пройдено` : 'цель достигнута', left ? '' : 'ok'),
      metricCard('Темп', perMonth > 0 ? `${money(perMonth)}/мес` : '—', perMonth > 0 ? 'за последние 3 месяца' : 'пополнений пока мало'),
      metricCard('Прогноз', forecast ? `${MONTHS_NOM[forecast.getMonth()]} ${forecast.getFullYear()}` : '—',
        vn.deadline ? `дедлайн ${fmtDate(vn.deadline)}` : (forecast ? 'при текущем темпе' : 'нужен темп для расчёта'),
        vn.deadline && forecast && iso(forecast) > vn.deadline ? 'warn' : '')
    ].join('');

    renderVietnamChart();
    renderVietnamHabit();

    byId('vn-entries').innerHTML = vn.entries.map((entry) => `
      <div class="vn-entry" data-edit-entry="${esc(entry.id)}">
        <span class="vn-entry__icon ${entry.type === 'deposit' ? 'is-in' : 'is-out'}">${entry.type === 'deposit' ? '↓' : '↑'}</span>
        <span class="vn-entry__body">
          <b>${esc(entry.note || (entry.type === 'deposit' ? 'Пополнение' : 'Расход'))}</b>
          <small>${esc(fmtDate(entry.date))}</small>
        </span>
        <strong class="${entry.type === 'deposit' ? 'positive' : 'negative'}">${entry.type === 'deposit' ? '+' : '−'} ${money(entry.amount)}</strong>
      </div>`).join('') || '<p class="cal-empty">Операций пока нет. Отложи первую сумму — с этого всё и начинается.</p>';
  };

  const renderVietnamChart = () => {
    const entries = data.vietnam.entries.slice().reverse();
    const host = byId('vn-chart');
    if (entries.length < 2) {
      host.innerHTML = '<p class="cal-empty">График появится после двух операций.</p>';
      byId('vn-chart-range').textContent = '—';
      return;
    }
    let running = 0;
    const points = entries.map((e) => {
      running += e.type === 'deposit' ? e.amount : -e.amount;
      return { date: e.date, value: running };
    });
    const target = data.vietnam.target;
    const peak = Math.max(1, ...points.map((p) => p.value));
    /* Пока накоплено мало, растягиваем шкалу по факту — иначе линия лежит на дне */
    const max = peak * 1.35 >= target ? target : peak * 1.35;
    const showTarget = max === target;
    /* Если расходы увели баланс в минус, опускаем низ шкалы — иначе линия уедет за кадр */
    const floor = Math.min(0, ...points.map((p) => p.value));
    const span = Math.max(1, max - floor);
    const w = 640;
    const h = 180;
    const x = (i) => (points.length === 1 ? w : (i / (points.length - 1)) * w);
    const y = (v) => h - ((v - floor) / span) * (h - 12);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const fill = `${line} L${w},${h} L0,${h} Z`;
    const targetY = y(target).toFixed(1);

    host.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Рост накоплений">
        ${showTarget ? `<line class="chart-target" x1="0" y1="${targetY}" x2="${w}" y2="${targetY}"></line>` : ''}
        <path class="chart-fill" d="${fill}"></path>
        <path class="chart-line" d="${line}"></path>
      </svg>
      <div class="vn-chart__axis"><span>${esc(fmtDate(points[0].date))}</span><span>${showTarget ? `цель ${moneyShort(target)}` : `пик ${moneyShort(peak)}`}</span><span>${esc(fmtDate(points[points.length - 1].date))}</span></div>`;
    byId('vn-chart-range').textContent = `${fmtDate(points[0].date)} — ${fmtDate(points[points.length - 1].date)}`;
  };

  const renderVietnamHabit = () => {
    const entries = data.vietnam.entries.filter((e) => e.type === 'deposit');
    const now = new Date();
    const cells = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const sum = entries.filter((e) => e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0);
      cells.push({ label: MONTHS_NOM[d.getMonth()].slice(0, 3), sum });
    }
    const max = Math.max(1, ...cells.map((c) => c.sum));
    const streak = (() => {
      let count = 0;
      for (let i = cells.length - 1; i >= 0; i -= 1) { if (cells[i].sum > 0) count += 1; else break; }
      return count;
    })();
    const lastDeposit = entries[0];

    byId('vn-habit').innerHTML = `
      <div class="habit__bars">
        ${cells.map((c) => `<div class="habit__bar" title="${esc(c.label)} — ${esc(money(c.sum))}"><span class="habit__track"><i style="height:${c.sum > 0 ? Math.max(6, Math.round(c.sum / max * 100)) : 0}%"></i></span><small>${esc(c.label)}</small></div>`).join('')}
      </div>
      <div class="habit__facts">
        <div><small>Месяцев подряд</small><b>${streak}</b></div>
        <div><small>Последнее пополнение</small><b>${lastDeposit ? esc(fmtDateRelative(lastDeposit.date)) : '—'}</b></div>
        <div><small>Отложено в этом месяце</small><b>${money(cells[cells.length - 1].sum)}</b></div>
      </div>`;
  };

  /* ── Общий рендер ─────────────────────────────────────────── */
  const render = () => {
    renderWorkMetrics();
    renderStatusFilter();
    renderTasks();
    renderClients();
    renderCalendar();
    renderVietnam();
  };

  /* ── Навигация ────────────────────────────────────────────── */
  const VIEW_TITLES = { work: 'Работа', calendar: 'Календарь', vietnam: 'Вьетнам' };
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
    entry: {
      kicker: 'Вьетнам',
      title: (edit) => (edit ? 'Редактировать операцию' : 'Новая операция'),
      fields: [
        { key: 'type', label: 'Тип', type: 'select', options: () => [{ value: 'deposit', label: 'Отложить' }, { value: 'expense', label: 'Расход' }] },
        { key: 'amount', label: 'Сумма, ₽', type: 'number', required: true },
        { key: 'date', label: 'Дата', type: 'date' },
        { key: 'note', label: 'Комментарий', type: 'text' }
      ]
    },
    goal: {
      kicker: 'Вьетнам',
      title: () => 'Настроить цель',
      fields: [
        { key: 'title', label: 'Название цели', type: 'text', required: true },
        { key: 'tagline', label: 'Подпись под заголовком', type: 'text' },
        { key: 'target', label: 'Сколько нужно накопить, ₽', type: 'number', required: true },
        { key: 'deadline', label: 'Желаемая дата', type: 'date' }
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
    deleteBtn.hidden = !(modal.id && (formName === 'task' || formName === 'client' || formName === 'entry'));
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

    if (modal.form === 'entry') {
      if (num(raw.amount) <= 0) { toast('Сумма должна быть больше нуля'); return; }
      const entry = modal.id ? data.vietnam.entries.find((e) => e.id === modal.id) : { id: uid('v') };
      if (!entry) { closeModal(); return; }
      Object.assign(entry, {
        type: raw.type === 'expense' ? 'expense' : 'deposit',
        amount: num(raw.amount),
        date: fromIso(raw.date) ? raw.date : today(),
        note: String(raw.note || '').trim()
      });
      if (!modal.id) data.vietnam.entries.unshift(entry);
      data.vietnam.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }

    if (modal.form === 'goal') {
      data.vietnam.title = String(raw.title || 'Вьетнам').trim() || 'Вьетнам';
      data.vietnam.tagline = String(raw.tagline || '').trim() || data.vietnam.tagline;
      data.vietnam.target = Math.max(1, num(raw.target) || data.vietnam.target);
      data.vietnam.deadline = fromIso(raw.deadline) ? raw.deadline : '';
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
    } else if (modal.form === 'entry') {
      data.vietnam.entries = data.vietnam.entries.filter((e) => e.id !== modal.id);
    }
    persist(); closeModal(); render(); toast('Удалено');
  };

  /* ── Резервные копии ──────────────────────────────────────── */
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), state: data }, null, 2)], { type: 'application/json' });
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
  const openAction = (action, source) => {
    if (action === 'new-task') { openModal('task', { status: 'new', due: calSelected }); return true; }
    if (action === 'new-client') { openModal('client'); return true; }
    if (action === 'new-deposit') { openModal('entry', { type: 'deposit', date: today() }); return true; }
    if (action === 'new-expense') { openModal('entry', { type: 'expense', date: today() }); return true; }
    if (action === 'edit-goal') { openModal('goal', data.vietnam); return true; }
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

    const editEntry = target.closest('[data-edit-entry]');
    if (editEntry) {
      const entry = data.vietnam.entries.find((e) => e.id === editEntry.dataset.editEntry);
      if (entry) openModal('entry', entry);
      return;
    }

    const calDay = target.closest('[data-cal-day]');
    if (calDay) {
      calSelected = calDay.dataset.calDay;
      const d = fromIso(calSelected);
      if (d.getMonth() !== calCursor.getMonth() || d.getFullYear() !== calCursor.getFullYear()) calCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
      return;
    }

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
    vietnam: {
      title: data.vietnam.title,
      target: data.vietnam.target,
      saved: vnSaved(),
      deadline: data.vietnam.deadline || null,
      entries: data.vietnam.entries.slice(0, 12).map((e) => ({ id: e.id, type: e.type, amount: e.amount, date: e.date, note: e.note }))
    },
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
        if (op.op === 'vietnam.deposit' || op.op === 'vietnam.expense') {
          const amount = num(op.amount);
          if (amount <= 0) return;
          const type = op.op === 'vietnam.deposit' ? 'deposit' : 'expense';
          data.vietnam.entries.unshift({ id: uid('v'), type, amount, date: fromIso(op.date) ? op.date : today(), note: String(op.note || '').trim() });
          data.vietnam.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          done.push(`${type === 'deposit' ? 'Отложено' : 'Расход'} ${money(amount)}`);
          return;
        }
        if (op.op === 'vietnam.delete') {
          const entry = data.vietnam.entries.find((e) => e.id === op.id);
          if (!entry) return;
          data.vietnam.entries = data.vietnam.entries.filter((e) => e.id !== op.id);
          done.push(`Удалена операция ${money(entry.amount)}`);
          return;
        }
        if (op.op === 'goal.update') {
          if (op.title !== undefined && String(op.title).trim()) data.vietnam.title = String(op.title).trim();
          if (op.tagline !== undefined && String(op.tagline).trim()) data.vietnam.tagline = String(op.tagline).trim();
          if (op.target !== undefined && num(op.target) > 0) data.vietnam.target = num(op.target);
          if (op.deadline !== undefined) data.vietnam.deadline = fromIso(op.deadline) ? op.deadline : '';
          done.push('Цель обновлена');
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
        agentBubble('bot', 'Напиши обычным текстом, что записать или изменить. Например: «оплатили 30 тысяч по КП для Авито» или «отложи 20к во Вьетнам».');
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

  byId('cal-prev').addEventListener('click', () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderCalendar(); });
  byId('cal-next').addEventListener('click', () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); renderCalendar(); });
  byId('cal-today').addEventListener('click', () => { calCursor = new Date(); calSelected = today(); renderCalendar(); });
  byId('cal-day-add').addEventListener('click', () => openModal('task', { status: 'new', due: calSelected }));

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
    try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.removeItem(LEGACY_KEY); } catch (_) {}
    toast('Данные перенесены в новый формат');
  }
  loadServerState();
})();
