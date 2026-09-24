(function () {
  'use strict';
  var root = document.getElementById('root');
  var CHUNK = 4 * 1024 * 1024;
  var view = 'dashboard';
  var state = { courseId: 0 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function date(s) { if (!s) return '—'; var d = new Date(s.replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function size(b) { b = +b; return b > 1073741824 ? (b / 1073741824).toFixed(2) + ' ГБ' : (b / 1048576).toFixed(1) + ' МБ'; }
  function toast(t) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2600); }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  function api(action, opts) {
    opts = opts || {};
    var init = { credentials: 'same-origin', headers: { 'X-School': '1' } };
    if (opts.form) { init.method = 'POST'; init.body = opts.form; }
    else if (opts.raw) { init.method = 'POST'; init.headers['Content-Type'] = 'application/octet-stream'; init.body = opts.raw; }
    else if (opts.body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch('/school/api.php?action=' + action + (opts.query || ''), init).then(function (r) {
      return r.json().catch(function () { return { error: 'Сервер вернул ошибку (' + r.status + ')' }; }).then(function (d) {
        if (r.status === 401 && action !== 'admin_login') { renderLogin(); throw new Error('auth'); }
        if (!r.ok) throw new Error(d.error || 'Ошибка сервера');
        return d;
      });
    });
  }
  function fail(err) { if (err && err.message !== 'auth') toast(err.message); }

  function modal(html, onMount) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(m);
    function close() { m.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    m.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
    if (onMount) onMount(m, close);
    var first = m.querySelector('input,textarea'); if (first) first.focus();
    return close;
  }
  function confirmBox(text, okLabel) {
    return new Promise(function (resolve) {
      modal('<h2>' + esc(text) + '</h2><div class="modal__foot"><button class="btn btn--ghost" data-close>Отмена</button><button class="btn btn--danger" id="ok">' + esc(okLabel || 'Удалить') + '</button></div>', function (m, close) {
        $('#ok', m).addEventListener('click', function () { close(); resolve(true); });
      });
    });
  }

  /* ───── Вход ───── */
  function renderLogin() {
    root.innerHTML = '<main class="sc-main"><section class="sc-login"><form class="sc-card" id="login"><h1>Админка школы</h1><p>Вход для автора курсов.</p>' +
      '<label class="field">Пароль<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn btn--accent" style="width:100%" type="submit">Войти</button><p class="form-error" id="err" role="alert"></p></form></section></main>';
    var f = $('#login');
    f.password.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      api('admin_login', { body: { password: f.password.value } }).then(renderShell).catch(function (err) { $('#err').textContent = err.message; });
    });
  }

  /* ───── Каркас ───── */
  var NAV = [['dashboard', 'Обзор'], ['courses', 'Курсы'], ['students', 'Ученики'], ['log', 'Журнал'], ['settings', 'Настройки']];
  function renderShell() {
    root.innerHTML = '<div class="ad-shell"><aside class="ad-side"><span class="sc-brand">Школа<i>.</i> <small style="color:var(--muted);font-weight:500;font-size:13px">админка</small></span>' +
      NAV.map(function (n) { return '<button data-view="' + n[0] + '">' + n[1] + '</button>'; }).join('') +
      '<div class="foot"><a href="/school/" target="_blank" rel="noopener">Кабинет ученика ↗</a><a href="#" id="logout">Выйти</a></div></aside><main class="ad-main" id="main"></main></div>';
    root.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.view); }); });
    $('#logout').addEventListener('click', function (e) { e.preventDefault(); api('admin.logout', { body: {} }).then(renderLogin); });
    go(view);
  }
  function go(v, extra) {
    view = v;
    if (extra) Object.assign(state, extra);
    root.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === (v === 'lessons' ? 'courses' : v)); });
    var main = $('#main');
    main.innerHTML = '<div class="sc-loading">Загрузка…</div>';
    ({ dashboard: dashboard, courses: courses, lessons: lessons, students: students, log: log, settings: settings })[v](main);
  }

  /* ───── Обзор ───── */
  var EVENTS = { login: 'Вход ученика', login_fail: 'Неудачный вход', admin_login: 'Вход в админку', admin_fail: 'Неудачный вход в админку', lesson_open: 'Открыт урок', guard_screenshot: 'Попытка скриншота', guard_devtools: 'Инструменты разработчика', guard_watermark: 'Попытка убрать водяной знак' };
  function ev(e) { return EVENTS[e] || e; }
  function dashboard(main) {
    api('admin.dashboard').then(function (d) {
      var s = d.stats;
      main.innerHTML = '<div class="ad-head"><div><h1>Обзор</h1><p>Последние 7 дней</p></div></div>' +
        '<div class="stats">' +
        [[s.students, 'учеников'], [s.active, 'смотрели уроки'], [s.views, 'открытий уроков'], [s.courses, 'курсов'], [s.lessons, 'уроков'], [s.guards, 'срабатываний защиты', s.guards > 0]].map(function (x) {
          return '<div class="stat' + (x[2] ? ' warn' : '') + '"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
        }).join('') + '</div>' +
        (d.suspicious.length ? '<section class="ad-sec"><h2>Возможна передача аккаунта</h2><p class="muted" style="color:var(--muted);margin:-4px 0 12px;font-size:14px">Входы с 3+ разных IP за сутки.</p><div class="table-wrap"><table class="table"><tr><th>Ученик</th><th>IP за сутки</th></tr>' +
          d.suspicious.map(function (r) { return '<tr><td>' + esc(r.name) + ' <span class="muted">' + esc(r.email) + '</span></td><td>' + r.ips + '</td></tr>'; }).join('') + '</table></div></section>' : '') +
        '<section class="ad-sec"><h2>Последние события</h2>' + logTable(d.recent) + '</section>' +
        (s.courses === 0 ? '<section class="ad-sec"><div class="empty">Начните с создания курса: «Курсы» → «Новый курс», затем добавьте уроки и загрузите видео. После — заведите учеников.</div></section>' : '');
    }).catch(fail);
  }
  function logTable(rows) {
    if (!rows.length) return '<div class="empty">Событий пока нет.</div>';
    return '<div class="table-wrap"><table class="table"><tr><th>Когда</th><th>Событие</th><th>Ученик</th><th>Детали</th><th>IP</th></tr>' + rows.map(function (r) {
      return '<tr><td class="muted">' + date(r.created_at) + '</td><td>' + (r.event.indexOf('guard_') === 0 ? '<span class="pill off">' + esc(ev(r.event)) + '</span>' : esc(ev(r.event))) + '</td><td>' + (r.name ? esc(r.name) + '<br><span class="muted">' + esc(r.email) + '</span>' : '<span class="muted">—</span>') + '</td><td class="muted">' + esc(r.detail) + '</td><td class="muted">' + esc(r.ip) + '</td></tr>';
    }).join('') + '</table></div>';
  }

  /* ───── Курсы ───── */
  function courses(main) {
    api('admin.courses').then(function (d) {
      main.innerHTML = '<div class="ad-head"><div><h1>Курсы</h1><p>Порядок стрелками — так же курсы увидят ученики.</p></div><button class="btn btn--accent" id="add">Новый курс</button></div>' +
        (d.courses.length ? '<div class="ad-list">' + d.courses.map(function (c, i) {
          return '<div class="ad-item"><div class="order"><button data-up="' + i + '" aria-label="Выше">▲</button><button data-down="' + i + '" aria-label="Ниже">▼</button></div>' +
            '<div class="ad-item__thumb"' + (c.cover ? ' style="background-image:url(\'' + esc(c.cover) + '\')"' : '') + '></div>' +
            '<div><h3>' + esc(c.title) + ' ' + (+c.is_published ? '' : '<span class="pill">скрыт</span>') + '</h3><p>' + c.lessons + ' уроков · ' + c.students + ' учеников</p></div>' +
            '<div class="row-actions"><button class="btn btn--sm" data-open="' + c.id + '">Уроки</button><button class="btn btn--ghost btn--sm" data-edit="' + i + '">Изменить</button><button class="btn btn--danger btn--sm" data-del="' + c.id + '">Удалить</button></div></div>';
        }).join('') + '</div>' : '<div class="empty">Курсов пока нет.</div>');
      $('#add').addEventListener('click', function () { courseForm(null); });
      main.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { go('lessons', { courseId: +b.dataset.open }); }); });
      main.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { courseForm(d.courses[+b.dataset.edit]); }); });
      main.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () {
        confirmBox('Удалить курс со всеми уроками и видео?').then(function () { api('admin.course_delete', { body: { id: +b.dataset.del } }).then(function () { go('courses'); }).catch(fail); });
      }); });
      reorderButtons(main, d.courses, 'courses');
    }).catch(fail);
  }
  function reorderButtons(main, list, table) {
    function move(i, dir) {
      var j = i + dir; if (j < 0 || j >= list.length) return;
      var ids = list.map(function (x) { return +x.id; });
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      api('admin.reorder', { body: { table: table, ids: ids } }).then(function () { go(view); }).catch(fail);
    }
    main.querySelectorAll('[data-up]').forEach(function (b) { b.addEventListener('click', function () { move(+b.dataset.up, -1); }); });
    main.querySelectorAll('[data-down]').forEach(function (b) { b.addEventListener('click', function () { move(+b.dataset.down, 1); }); });
  }
  function courseForm(c) {
    c = c || { id: 0, title: '', subtitle: '', description: '', is_published: 1 };
    modal('<h2>' + (c.id ? 'Курс' : 'Новый курс') + '</h2><form id="f">' +
      '<label class="field">Название<input name="title" required value="' + esc(c.title) + '"></label>' +
      '<label class="field">Короткое описание<small>Показывается на карточке</small><input name="subtitle" value="' + esc(c.subtitle) + '"></label>' +
      '<label class="field">О курсе<textarea name="description">' + esc(c.description) + '</textarea></label>' +
      '<label class="field">Обложка<small>JPG, PNG или WEBP, горизонтальная 16:10' + (c.cover ? ' · сейчас загружена' : '') + '</small><input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
      '<label class="check"><input type="checkbox" name="is_published"' + (+c.is_published ? ' checked' : '') + '> Опубликован (виден ученикам с доступом)</label>' +
      '<p class="form-error" id="err"></p><div class="modal__foot"><button type="button" class="btn btn--ghost" data-close>Отмена</button><button class="btn btn--accent" type="submit">Сохранить</button></div></form>', function (m, close) {
      var f = $('#f', m);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(f);
        fd.append('id', c.id);
        fd.set('is_published', f.is_published.checked ? '1' : '');
        api('admin.course_save', { form: fd }).then(function () { close(); toast('Сохранено'); go('courses'); }).catch(function (err) { $('#err', m).textContent = err.message; });
      });
    });
  }

  /* ───── Уроки курса ───── */
  function lessons(main) {
    api('admin.lessons', { query: '&course_id=' + state.courseId }).then(function (d) {
      main.innerHTML = '<nav class="crumbs"><a href="#" id="back">Курсы</a><span>/</span><span>' + esc(d.course.title) + '</span></nav>' +
        '<div class="ad-head"><div><h1>' + esc(d.course.title) + '</h1><p>Уроки курса</p></div><button class="btn btn--accent" id="add">Новый урок</button></div>' +
        (d.lessons.length ? '<div class="ad-list">' + d.lessons.map(function (l, i) {
          var vid = l.video_type === 'file' ? 'видео ' + size(l.video_size) : l.video_type === 'kinescope' ? 'Kinescope' : '<span class="pill off">нет видео</span>';
          return '<div class="ad-item no-thumb"><div class="order"><button data-up="' + i + '">▲</button><button data-down="' + i + '">▼</button></div>' +
            '<div><h3>' + (i + 1) + '. ' + esc(l.title) + ' ' + (+l.is_published ? '' : '<span class="pill">черновик</span>') + '</h3><p>' + vid + '</p></div>' +
            '<div class="row-actions"><button class="btn btn--ghost btn--sm" data-edit="' + i + '">Изменить</button><button class="btn btn--danger btn--sm" data-del="' + l.id + '">Удалить</button></div></div>';
        }).join('') + '</div>' : '<div class="empty">Уроков пока нет.</div>');
      $('#back').addEventListener('click', function (e) { e.preventDefault(); go('courses'); });
      $('#add').addEventListener('click', function () { lessonForm(null); });
      main.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { lessonForm(d.lessons[+b.dataset.edit]); }); });
      main.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () {
        confirmBox('Удалить урок и его видео?').then(function () { api('admin.lesson_delete', { body: { id: +b.dataset.del } }).then(function () { go('lessons'); }).catch(fail); });
      }); });
      reorderButtons(main, d.lessons, 'lessons');
    }).catch(fail);
  }

  function uploadVideo(lessonId, file, onProgress) {
    var total = Math.max(1, Math.ceil(file.size / CHUNK));
    var uid = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    function send(i, attempt) {
      var q = '&lesson_id=' + lessonId + '&upload_id=' + uid + '&index=' + i + '&total=' + total + '&name=' + encodeURIComponent(file.name);
      return api('admin.upload_chunk', { query: q, raw: file.slice(i * CHUNK, (i + 1) * CHUNK) })
        .catch(function (err) { if (attempt < 3 && err.message !== 'auth') return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return send(i, attempt + 1); }); throw err; })
        .then(function () { onProgress((i + 1) / total); if (i + 1 < total) return send(i + 1, 0); });
    }
    /* Не даём закрыть вкладку, пока видео грузится. */
    function guard(e) { e.preventDefault(); e.returnValue = ''; }
    window.addEventListener('beforeunload', guard);
    return send(0, 0).finally(function () { window.removeEventListener('beforeunload', guard); });
  }

  function lessonForm(l) {
    var isNew = !l;
    l = l || { id: 0, title: '', description: '', materials: '', is_published: 1, video_type: '', video_ref: '' };
    var mode = l.video_type === 'kinescope' ? 'kinescope' : 'file';
    var current = l.video_type === 'file' ? '<div class="video-now"><span>Загружено: ' + esc(l.video_name || 'видео') + ' · ' + size(l.video_size) + '</span><span><button type="button" class="btn btn--ghost btn--sm" id="prev">Просмотр</button> <button type="button" class="btn btn--danger btn--sm" id="rm">Убрать</button></span></div>'
      : l.video_type === 'kinescope' ? '<div class="video-now"><span>Kinescope: ' + esc(l.video_ref) + '</span><button type="button" class="btn btn--danger btn--sm" id="rm">Убрать</button></div>' : '';
    modal('<h2>' + (isNew ? 'Новый урок' : 'Урок') + '</h2><form id="f">' +
      '<label class="field">Название<input name="title" required value="' + esc(l.title) + '"></label>' +
      '<label class="field">Описание урока<textarea name="description">' + esc(l.description) + '</textarea></label>' +
      '<label class="field">Материалы<small>Ссылки на пресеты, чек-листы, домашнее задание — ссылки станут кликабельными</small><textarea name="materials" style="min-height:90px">' + esc(l.materials) + '</textarea></label>' +
      '<div class="field">Видео</div>' + current + '<div id="pv"></div>' +
      '<div class="seg"><button type="button" data-mode="file">Загрузить файл</button><button type="button" data-mode="kinescope">Kinescope (DRM)</button></div>' +
      '<div data-pane="file"><label class="field"><small>MP4 (H.264) — лучший вариант. Любой размер: файл грузится частями.</small><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime,.m4v"></label><div class="upl" hidden><i></i></div></div>' +
      '<div data-pane="kinescope"><label class="field"><small>Ссылка или ID видео из Kinescope. Максимальная защита: DRM блокирует запись экрана в большинстве браузеров.</small><input name="kinescope" placeholder="https://kinescope.io/abc123" value="' + (l.video_type === 'kinescope' ? esc(l.video_ref) : '') + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="is_published"' + (+l.is_published ? ' checked' : '') + '> Опубликован</label>' +
      '<p class="form-error" id="err"></p><div class="modal__foot"><button type="button" class="btn btn--ghost" data-close>Отмена</button><button class="btn btn--accent" type="submit">Сохранить</button></div></form>', function (m, close) {
      var f = $('#f', m);
      function setMode(x) { mode = x; m.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.mode === x); }); m.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== x; }); }
      m.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });
      setMode(mode);
      var rm = $('#rm', m);
      if (rm) rm.addEventListener('click', function () { api('admin.video_remove', { body: { id: l.id } }).then(function () { close(); toast('Видео убрано'); go('lessons'); }).catch(fail); });
      var prev = $('#prev', m);
      if (prev) prev.addEventListener('click', function () {
        api('admin.preview_token', { query: '&id=' + l.id }).then(function (d) { $('#pv', m).innerHTML = '<video class="preview" controls playsinline controlslist="nodownload" src="' + esc(d.src) + '"></video>'; }).catch(fail);
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = f.querySelector('[type=submit]'); btn.disabled = true;
        var err = $('#err', m); err.textContent = '';
        var body = { id: l.id, course_id: state.courseId, title: f.title.value, description: f.description.value, materials: f.materials.value, is_published: f.is_published.checked };
        if (mode === 'kinescope') body.kinescope = f.kinescope.value;
        var file = mode === 'file' && f.video.files[0];
        api('admin.lesson_save', { body: body }).then(function (d) {
          if (!file) return;
          var bar = m.querySelector('.upl'); bar.hidden = false;
          btn.textContent = 'Загрузка 0%';
          return uploadVideo(d.id, file, function (p) { bar.firstChild.style.width = (p * 100) + '%'; btn.textContent = 'Загрузка ' + Math.round(p * 100) + '%'; });
        }).then(function () { close(); toast('Урок сохранён'); go('lessons'); })
          .catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Сохранить'; });
      });
    });
  }

  /* ───── Ученики ───── */
  var cache = { courses: [] };
  function students(main) {
    api('admin.students').then(function (d) {
      cache.courses = d.courses;
      var titles = {}; d.courses.forEach(function (c) { titles[c.id] = c.title; });
      var today = new Date().toISOString().slice(0, 10);
      main.innerHTML = '<div class="ad-head"><div><h1>Ученики</h1><p>' + d.students.length + ' всего. Один аккаунт — одно устройство.</p></div><button class="btn btn--accent" id="add">Добавить ученика</button></div>' +
        '<label class="field" style="max-width:360px"><input id="q" placeholder="Поиск по имени или почте"></label>' +
        (d.students.length ? '<div class="table-wrap"><table class="table" id="tbl"><tr><th>Ученик</th><th>Курсы</th><th>Пройдено</th><th>Последний вход</th><th>Статус</th><th></th></tr>' + d.students.map(function (s, i) {
          var expired = s.access_until && s.access_until < today;
          var status = !+s.is_active ? '<span class="pill off">отключён</span>' : expired ? '<span class="pill off">доступ истёк</span>' : '<span class="pill ok">активен</span>';
          return '<tr data-search="' + esc((s.name + ' ' + s.email).toLowerCase()) + '"><td><b>' + esc(s.name) + '</b><br><span class="muted">' + esc(s.email) + '</span>' + (s.note ? '<br><span class="muted">' + esc(s.note) + '</span>' : '') + '</td>' +
            '<td>' + (s.courses.map(function (id) { return esc(titles[id] || '—'); }).join('<br>') || '<span class="muted">нет</span>') + '</td>' +
            '<td>' + s.completed + ' ур.</td><td class="muted">' + date(s.last_login_at) + (s.last_ip ? '<br>' + esc(s.last_ip) : '') + '</td><td>' + status + (s.access_until ? '<br><span class="muted">до ' + esc(s.access_until.split('-').reverse().join('.')) + '</span>' : '') + '</td>' +
            '<td><div class="row-actions"><button class="btn btn--ghost btn--sm" data-edit="' + i + '">Изменить</button><button class="btn btn--ghost btn--sm" data-log="' + i + '">Журнал</button></div></td></tr>';
        }).join('') + '</table></div>' : '<div class="empty">Учеников пока нет. Добавьте первого — система сама создаст пароль.</div>');
      $('#add').addEventListener('click', function () { studentForm(null); });
      main.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { studentForm(d.students[+b.dataset.edit]); }); });
      main.querySelectorAll('[data-log]').forEach(function (b) { b.addEventListener('click', function () { studentLog(d.students[+b.dataset.log]); }); });
      $('#q').addEventListener('input', function () { var q = this.value.trim().toLowerCase(); main.querySelectorAll('tr[data-search]').forEach(function (tr) { tr.hidden = q && tr.dataset.search.indexOf(q) < 0; }); });
    }).catch(fail);
  }
  function credentials(s, password) {
    var text = 'Доступ к курсу\n\nКабинет: ' + location.origin + '/school/\nПочта: ' + s.email + '\nПароль: ' + password + '\n\nВход возможен только с одного устройства. Не передавайте данные третьим лицам — видео защищены персональным водяным знаком.';
    modal('<h2>Данные для входа</h2><p style="color:var(--muted);margin:-8px 0 16px">Пароль показывается один раз — скопируйте и отправьте ученику.</p><div class="cred" id="cred">' + esc(text) + '</div><div class="modal__foot"><button class="btn btn--ghost" data-close>Готово</button><button class="btn btn--accent" id="copy">Скопировать</button></div>', function (m) {
      $('#copy', m).addEventListener('click', function () { navigator.clipboard.writeText(text).then(function () { toast('Скопировано'); }); });
    });
  }
  function studentForm(s) {
    var isNew = !s;
    s = s || { id: 0, name: '', email: '', note: '', is_active: 1, access_until: '', courses: cache.courses.length === 1 ? [+cache.courses[0].id] : [] };
    modal('<h2>' + (isNew ? 'Новый ученик' : esc(s.name)) + '</h2><form id="f">' +
      '<label class="field">Имя<input name="name" required value="' + esc(s.name) + '"></label>' +
      '<label class="field">Почта<small>Это логин ученика</small><input name="email" type="email" required value="' + esc(s.email) + '"></label>' +
      '<div class="field">Доступ к курсам</div><div class="checks">' + (cache.courses.length ? cache.courses.map(function (c) { return '<label class="check"><input type="checkbox" name="c" value="' + c.id + '"' + (s.courses.indexOf(+c.id) > -1 ? ' checked' : '') + '> ' + esc(c.title) + '</label>'; }).join('') : '<span style="color:var(--muted)">Сначала создайте курс</span>') + '</div>' +
      '<label class="field">Доступ до<small>Пусто — бессрочно</small><input name="access_until" type="date" value="' + esc(s.access_until || '') + '"></label>' +
      '<label class="field">Заметка<small>Видна только вам: тариф, откуда пришёл, сумма</small><input name="note" value="' + esc(s.note) + '"></label>' +
      '<label class="check"><input type="checkbox" name="is_active"' + (+s.is_active ? ' checked' : '') + '> Доступ включён</label>' +
      '<p class="form-error" id="err"></p><div class="modal__foot">' +
      (isNew ? '' : '<button type="button" class="btn btn--danger btn--sm" id="del">Удалить</button><button type="button" class="btn btn--ghost btn--sm" id="kick">Завершить сеанс</button><button type="button" class="btn btn--ghost btn--sm" id="reset">Новый пароль</button>') +
      '<span style="flex:1"></span><button type="button" class="btn btn--ghost" data-close>Отмена</button><button class="btn btn--accent" type="submit">' + (isNew ? 'Создать' : 'Сохранить') + '</button></div></form>', function (m, close) {
      var f = $('#f', m);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ids = Array.from(f.querySelectorAll('[name=c]:checked')).map(function (x) { return +x.value; });
        api('admin.student_save', { body: { id: s.id, name: f.name.value, email: f.email.value, note: f.note.value, access_until: f.access_until.value, is_active: f.is_active.checked, courses: ids } })
          .then(function (d) { close(); go('students'); if (d.password) credentials({ email: f.email.value.trim().toLowerCase() }, d.password); else toast('Сохранено'); })
          .catch(function (err) { $('#err', m).textContent = err.message; });
      });
      if (isNew) return;
      $('#reset', m).addEventListener('click', function () { api('admin.student_reset', { body: { id: s.id } }).then(function (d) { close(); credentials(s, d.password); }).catch(fail); });
      $('#kick', m).addEventListener('click', function () { api('admin.student_kick', { body: { id: s.id } }).then(function () { toast('Сеанс завершён — ученику нужно войти заново'); }).catch(fail); });
      $('#del', m).addEventListener('click', function () { close(); confirmBox('Удалить ученика ' + s.name + '?').then(function () { api('admin.student_delete', { body: { id: s.id } }).then(function () { go('students'); }).catch(fail); }); });
    });
  }
  function studentLog(s) {
    api('admin.student_log', { query: '&id=' + s.id }).then(function (d) {
      var rows = d.log.map(function (r) { r.name = ''; return r; });
      modal('<h2>' + esc(s.name) + ' — журнал</h2>' + logTable(rows).replace(/<th>Ученик<\/th>/, '').replace(/<td><span class="muted">—<\/span><\/td>/g, '') + '<div class="modal__foot"><button class="btn btn--ghost" data-close>Закрыть</button></div>');
      document.querySelector('.modal__box').style.width = 'min(900px,100%)';
    }).catch(fail);
  }

  /* ───── Журнал ───── */
  function log(main, filter) {
    filter = filter || '';
    api('admin.log', { query: '&filter=' + filter }).then(function (d) {
      main.innerHTML = '<div class="ad-head"><div><h1>Журнал</h1><p>Входы, просмотры и срабатывания защиты. Последние 300 событий.</p></div></div>' +
        '<div class="seg">' + [['', 'Все'], ['login', 'Входы'], ['guard', 'Защита']].map(function (x) { return '<button data-f="' + x[0] + '" class="' + (x[0] === filter ? 'is-active' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' + logTable(d.log);
      main.querySelectorAll('[data-f]').forEach(function (b) { b.addEventListener('click', function () { log(main, b.dataset.f); }); });
    }).catch(fail);
  }

  /* ───── Настройки ───── */
  function settings(main) {
    api('admin.settings').then(function (d) {
      main.innerHTML = '<div class="ad-head"><div><h1>Настройки</h1></div></div><form class="sc-card" id="f" style="width:min(560px,100%)">' +
        '<label class="field">Название школы<input name="school_name" value="' + esc(d.school_name) + '"></label>' +
        '<label class="field">Контакт поддержки<small>Телеграм, почта или телефон — ученики увидят его в кабинете</small><input name="support" value="' + esc(d.support) + '"></label>' +
        '<div class="field" style="margin-top:12px">Сменить пароль админки</div>' +
        '<label class="field">Текущий пароль<input name="current_password" type="password" autocomplete="current-password"></label>' +
        '<label class="field">Новый пароль<input name="new_password" type="password" autocomplete="new-password"></label>' +
        '<button class="btn btn--accent" type="submit">Сохранить</button><p class="form-error" id="err"></p></form>';
      var f = $('#f');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        api('admin.settings_save', { body: { school_name: f.school_name.value, support: f.support.value, current_password: f.current_password.value, new_password: f.new_password.value } })
          .then(function () { toast('Сохранено'); f.current_password.value = ''; f.new_password.value = ''; $('#err').textContent = ''; })
          .catch(function (err) { $('#err').textContent = err.message; });
      });
    }).catch(fail);
  }

  api('admin.dashboard').then(renderShell).catch(function (err) {
    if (err.message !== 'auth') root.innerHTML = '<main class="sc-main"><div class="empty">' + esc(err.message) + '</div></main>';
  });
})();
