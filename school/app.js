(function () {
  'use strict';
  var app = document.getElementById('app');
  var nav = document.getElementById('top-nav');
  var me = null;
  var cleanup = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* Текст из админки → абзацы, ссылки кликабельны. HTML не пропускаем. */
  function rich(text) {
    return esc(text).split(/\n{2,}/).map(function (p) {
      p = p.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec || 0)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); }
  function toast(text) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }

  function api(action, opts) {
    opts = opts || {};
    var init = { credentials: 'same-origin', headers: { 'X-School': '1' } };
    if (opts.body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    if (opts.keepalive) init.keepalive = true;
    return fetch('/school/api.php?action=' + action + (opts.query || ''), init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && action !== 'login') { me = null; renderLogin(d.error); throw new Error('auth'); }
        if (!r.ok) throw new Error(d.error || 'Ошибка сервера');
        return d;
      });
    });
  }

  /* ───── Вход ───── */
  function renderLogin(message) {
    if (cleanup) { cleanup(); cleanup = null; }
    nav.hidden = true;
    app.innerHTML = '<section class="sc-login"><form class="sc-card" id="login">' +
      '<h1>Вход в кабинет</h1><p>Данные для входа вы получили после оплаты курса.</p>' +
      '<label class="field">Почта<input name="email" type="email" autocomplete="username" required></label>' +
      '<label class="field">Пароль<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn btn--accent" style="width:100%" type="submit">Войти</button>' +
      '<p class="form-error" id="login-err" role="alert">' + esc(message && message !== 'Войдите в кабинет.' ? message : '') + '</p></form></section>';
    var f = document.getElementById('login');
    f.email.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = f.querySelector('button'); b.disabled = true;
      api('login', { body: { email: f.email.value, password: f.password.value } })
        .then(function () { return boot(); })
        .catch(function (err) { document.getElementById('login-err').textContent = err.message; b.disabled = false; });
    });
  }

  /* ───── Мои курсы ───── */
  function renderHome() {
    var list = me.courses;
    app.innerHTML = '<p class="sc-eyebrow">Здравствуйте, ' + esc(me.student.name) + '</p><h1 class="sc-h1">Мои курсы</h1>' +
      (me.access_until ? '<p class="sc-lead">Доступ открыт до ' + esc(me.access_until.split('-').reverse().join('.')) + '</p>' : '') +
      (list.length ? '<div class="sc-grid">' + list.map(function (c) {
        var pct = c.lessons ? Math.round(c.done / c.lessons * 100) : 0;
        return '<a class="course-card" href="#/course/' + c.id + '"><div class="course-card__cover"' + (c.cover ? ' style="background-image:url(\'' + esc(c.cover) + '\')"' : '') + '></div>' +
          '<div class="course-card__body"><h3>' + esc(c.title) + '</h3>' + (c.subtitle ? '<p>' + esc(c.subtitle) + '</p>' : '') +
          '<div class="meta"><span>' + plural(c.lessons, 'урок', 'урока', 'уроков') + '</span><span>' + pct + '%</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></div></a>';
      }).join('') + '</div>' : '<div class="empty">Курсы пока не подключены. ' + (me.support ? 'Напишите: ' + esc(me.support) : 'Напишите автору курса.') + '</div>');
  }

  /* ───── Курс ───── */
  function lessonItems(lessons, activeId) {
    return lessons.map(function (l, i) {
      return '<a class="lesson-item' + (l.id === activeId ? ' is-active' : '') + (l.completed ? ' is-done' : '') + '" href="#/lesson/' + l.id + '">' +
        '<span class="num">' + (l.completed ? '✓' : String(i + 1).padStart(2, '0')) + '</span><span>' + esc(l.title) + '</span><small>' + (l.duration ? fmt(l.duration) : '') + '</small></a>';
    }).join('');
  }
  function renderCourse(id) {
    return api('course', { query: '&id=' + id }).then(function (d) {
      var next = d.lessons.find(function (l) { return !l.completed; }) || d.lessons[0];
      var done = d.lessons.filter(function (l) { return l.completed; }).length;
      app.innerHTML = '<nav class="crumbs"><a href="#/">Мои курсы</a><span>/</span><span>' + esc(d.course.title) + '</span></nav>' +
        '<h1 class="sc-h1">' + esc(d.course.title) + '</h1>' + (d.course.description ? '<div class="prose">' + rich(d.course.description) + '</div>' : '') +
        '<div class="lesson-actions">' + (next ? '<a class="btn btn--accent" href="#/lesson/' + next.id + '">' + (done ? 'Продолжить' : 'Начать обучение') + '</a>' : '') +
        '<span class="meta">Пройдено ' + done + ' из ' + d.lessons.length + '</span></div>' +
        '<div class="course-lessons">' + (d.lessons.length ? lessonItems(d.lessons, 0) : '<div class="empty">Уроки скоро появятся.</div>') + '</div>';
    });
  }

  /* ───── Урок ───── */
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.9-2.9-1.4-1.4-2.9 2.9-2.9-2.9-1.4 1.4 2.9 2.9-2.9 2.9 1.4 1.4 2.9-2.9 2.9 2.9 1.4-1.4z"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 3v-3h2v5h-5v-2z"/></svg>'
  };
  function wmText() { return me.student.email + ' · ' + me.student.name + ' · ID ' + me.student.id; }

  function toggleFs(wrap) {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (wrap.classList.contains('is-pseudo-fs')) { wrap.classList.remove('is-pseudo-fs'); return; }
    var req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    /* iPhone не умеет полноэкранный режим для div — растягиваем через CSS, чтобы водяной знак остался. */
    if (!req) { wrap.classList.add('is-pseudo-fs'); return; }
    var r = req.call(wrap);
    if (r && r.catch) r.catch(function () { wrap.classList.add('is-pseudo-fs'); });
  }

  function mountFilePlayer(wrap, lesson) {
    wrap.innerHTML = '<video playsinline preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload noremoteplayback noplaybackrate"></video>' +
      '<button class="player__big" aria-label="Смотреть"><span></span></button>' +
      '<div class="player__bar"><button class="pbtn" data-a="play" aria-label="Воспроизвести">' + ICON.play + '</button>' +
      '<span class="ptime" data-t="cur">0:00</span><input class="pseek" type="range" min="0" max="1000" value="0" aria-label="Перемотка"><span class="ptime" data-t="dur">0:00</span>' +
      '<button class="pbtn" data-a="mute" aria-label="Звук">' + ICON.vol + '</button><button class="pbtn" data-a="speed" aria-label="Скорость">1×</button>' +
      '<button class="pbtn" data-a="fs" aria-label="Во весь экран">' + ICON.fs + '</button></div>';
    var v = wrap.querySelector('video'), seek = wrap.querySelector('.pseek');
    var bPlay = wrap.querySelector('[data-a="play"]'), bMute = wrap.querySelector('[data-a="mute"]'), bSpeed = wrap.querySelector('[data-a="speed"]');
    var cur = wrap.querySelector('[data-t="cur"]'), dur = wrap.querySelector('[data-t="dur"]');
    var speeds = [1, 1.25, 1.5, 2, .75], si = 0, seeking = false, lastSave = 0, completed = lesson.completed;
    v.src = lesson.video.src;

    function toggle() { if (v.paused) { v.play().catch(function () {}); } else v.pause(); }
    function save(extra) {
      if (!v.duration) return;
      var body = { lesson_id: lesson.id, position: Math.floor(v.currentTime), duration: Math.floor(v.duration) };
      if (!completed && v.currentTime / v.duration > .9) { completed = true; body.completed = true; markDoneUi(); }
      api('progress', { body: body, keepalive: !!extra }).catch(function () {});
    }
    v.addEventListener('loadedmetadata', function () {
      dur.textContent = fmt(v.duration);
      if (lesson.position > 5 && lesson.position < v.duration - 10) v.currentTime = lesson.position;
    });
    v.addEventListener('play', function () { wrap.classList.add('is-playing'); bPlay.innerHTML = ICON.pause; });
    v.addEventListener('pause', function () { wrap.classList.remove('is-playing'); bPlay.innerHTML = ICON.play; save(); });
    v.addEventListener('ended', function () { save(); });
    v.addEventListener('timeupdate', function () {
      cur.textContent = fmt(v.currentTime);
      if (!seeking && v.duration) seek.value = Math.round(v.currentTime / v.duration * 1000);
      if (Date.now() - lastSave > 10000) { lastSave = Date.now(); save(); }
    });
    var failed = false;
    v.addEventListener('error', function () {
      if (failed || !v.getAttribute('src')) return;
      failed = true;
      var box = document.createElement('div');
      box.className = 'player__shield player__error';
      box.innerHTML = '<p>Не удалось загрузить видео.<br><small>Проверяем причину…</small></p>';
      wrap.appendChild(box);
      api('video_check', { query: '&id=' + lesson.id }).then(function (d) {
        box.innerHTML = '<p>Не удалось загрузить видео.<br><small>' + esc(d.message) + '</small></p><button class="btn btn--sm" type="button">Повторить</button>';
        /* Новый токен и чистый плеер — без перезагрузки страницы. */
        box.querySelector('button').addEventListener('click', function () { route(); });
      }).catch(function () {});
    });
    seek.addEventListener('input', function () { seeking = true; if (v.duration) cur.textContent = fmt(seek.value / 1000 * v.duration); });
    seek.addEventListener('change', function () { if (v.duration) v.currentTime = seek.value / 1000 * v.duration; seeking = false; });
    wrap.querySelector('.player__big').addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    bPlay.addEventListener('click', toggle);
    bMute.addEventListener('click', function () { v.muted = !v.muted; bMute.innerHTML = v.muted ? ICON.mute : ICON.vol; });
    bSpeed.addEventListener('click', function () { si = (si + 1) % speeds.length; v.playbackRate = speeds[si]; bSpeed.textContent = speeds[si] + '×'; });
    wrap.querySelector('[data-a="fs"]').addEventListener('click', function () { toggleFs(wrap); });
    v.addEventListener('dblclick', function () { toggleFs(wrap); });

    var idle;
    function wake() { wrap.classList.remove('is-idle'); clearTimeout(idle); idle = setTimeout(function () { wrap.classList.add('is-idle'); }, 2500); }
    wrap.addEventListener('mousemove', wake); wrap.addEventListener('touchstart', wake, { passive: true });
    function keys(e) {
      if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement !== seek) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
      if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 5);
      if (e.key === 'f') toggleFs(wrap);
    }
    document.addEventListener('keydown', keys);
    function onHide() { save(true); }
    window.addEventListener('pagehide', onHide);

    var unprotect = window.SchoolGuard.protect(wrap, v, wmText());
    return function () { save(true); unprotect(); document.removeEventListener('keydown', keys); window.removeEventListener('pagehide', onHide); v.removeAttribute('src'); v.load(); };
  }

  function mountKinescope(wrap, lesson) {
    /* Без allow="fullscreen": полноэкранный режим делаем сами, иначе iframe уйдёт на весь экран без водяного знака. */
    wrap.innerHTML = '<iframe src="https://kinescope.io/embed/' + encodeURIComponent(lesson.video.id) + '" allow="autoplay; encrypted-media" referrerpolicy="origin" title="Видео урока"></iframe>' +
      '<div class="player__bar" style="background:none;justify-content:flex-end;padding:10px;left:auto;bottom:auto;top:0"><button class="pbtn" data-a="fs" aria-label="Во весь экран">' + ICON.fs + '</button></div>';
    wrap.querySelector('[data-a="fs"]').addEventListener('click', function () { toggleFs(wrap); });
    var frame = wrap.querySelector('iframe');
    var pausable = { pause: function () { try { frame.contentWindow.postMessage(JSON.stringify({ type: 'pause' }), '*'); } catch (e) {} } };
    var unprotect = window.SchoolGuard.protect(wrap, pausable, wmText());
    api('progress', { body: { lesson_id: lesson.id, position: 0 } }).catch(function () {});
    return unprotect;
  }

  var markDoneUi = function () {};
  function renderLesson(id) {
    return api('lesson', { query: '&id=' + id }).then(function (d) {
      var l = d.lesson;
      return api('course', { query: '&id=' + l.course_id }).then(function (c) {
        var idx = c.lessons.findIndex(function (x) { return x.id === l.id; });
        var prev = c.lessons[idx - 1], next = c.lessons[idx + 1];
        app.innerHTML = '<nav class="crumbs"><a href="#/">Мои курсы</a><span>/</span><a href="#/course/' + c.course.id + '">' + esc(c.course.title) + '</a><span>/</span><span>Урок ' + (idx + 1) + '</span></nav>' +
          '<div class="lesson-layout"><div>' +
          '<div class="player' + (l.video ? '' : ' player--empty') + '" id="player">' + (l.video ? '' : '<p>К этому уроку видео нет</p>') + '</div>' +
          '<h1 class="lesson-title">' + esc(l.title) + '</h1>' +
          (l.description ? '<div class="prose">' + rich(l.description) + '</div>' : '') +
          (l.materials ? '<div class="box"><h3>Материалы урока</h3><div class="prose">' + rich(l.materials) + '</div></div>' : '') +
          '<div class="lesson-actions">' + (prev ? '<a class="btn btn--ghost btn--sm" href="#/lesson/' + prev.id + '">← Назад</a>' : '') +
          '<button class="btn btn--ghost btn--sm" id="done-btn"></button><span class="spacer"></span>' +
          (next ? '<a class="btn btn--sm" href="#/lesson/' + next.id + '">Следующий урок →</a>' : '') + '</div></div>' +
          '<aside class="lesson-list"><h4>' + esc(c.course.title) + '</h4>' + lessonItems(c.lessons, l.id) + '</aside></div>';

        var doneBtn = document.getElementById('done-btn');
        var done = l.completed;
        markDoneUi = function () { done = true; paint(); var it = app.querySelector('.lesson-item.is-active'); if (it) { it.classList.add('is-done'); it.querySelector('.num').textContent = '✓'; } };
        function paint() { doneBtn.textContent = done ? '✓ Урок пройден' : 'Отметить пройденным'; }
        paint();
        doneBtn.addEventListener('click', function () {
          var body = done ? { lesson_id: l.id, position: 0, uncomplete: true } : { lesson_id: l.id, position: 0, completed: true };
          api('progress', { body: body }).then(function () {
            if (done) { done = false; paint(); var it = app.querySelector('.lesson-item.is-active'); if (it) { it.classList.remove('is-done'); it.querySelector('.num').textContent = String(idx + 1).padStart(2, '0'); } }
            else markDoneUi();
          });
        });

        var wrap = document.getElementById('player');
        if (l.video && l.video.type === 'file') cleanup = mountFilePlayer(wrap, l);
        if (l.video && l.video.type === 'kinescope') cleanup = mountKinescope(wrap, l);
      });
    });
  }

  /* ───── Профиль ───── */
  function renderProfile() {
    app.innerHTML = '<h1 class="sc-h1">Профиль</h1><p class="sc-lead">' + esc(me.student.name) + ' · ' + esc(me.student.email) + '</p>' +
      '<form class="sc-card" id="pw" style="margin-top:32px"><h1 style="font-size:1.4rem">Сменить пароль</h1><p></p>' +
      '<label class="field">Текущий пароль<input name="current" type="password" autocomplete="current-password" required></label>' +
      '<label class="field">Новый пароль<small>Минимум 8 символов</small><input name="new" type="password" autocomplete="new-password" minlength="8" required></label>' +
      '<button class="btn" type="submit">Сохранить</button><p class="form-error" id="pw-err"></p></form>' +
      '<div class="lesson-actions">' + (me.support ? '<span class="meta">Поддержка: ' + esc(me.support) + '</span><span class="spacer"></span>' : '') + '<button class="btn btn--ghost btn--sm" id="logout">Выйти</button></div>' +
      '<p class="sc-lead" style="font-size:14px">Вход возможен только с одного устройства: при входе на новом старое отключается. Видео защищены персональным водяным знаком.</p>';
    var f = document.getElementById('pw');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      api('password', { body: { current: f.current.value, new: f['new'].value } }).then(function () { f.reset(); toast('Пароль изменён'); })
        .catch(function (err) { document.getElementById('pw-err').textContent = err.message; });
    });
    document.getElementById('logout').addEventListener('click', function () { api('logout', { body: {} }).then(function () { location.hash = '#/'; renderLogin(); }); });
  }

  /* ───── Роутер ───── */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    markDoneUi = function () {};
    if (!me) return;
    var h = location.hash.replace(/^#\/?/, '').split('/');
    nav.querySelectorAll('a').forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#/' + (h[0] === 'profile' ? 'profile' : '')); });
    window.scrollTo(0, 0);
    var p;
    if (h[0] === 'course' && h[1]) p = renderCourse(+h[1]);
    else if (h[0] === 'lesson' && h[1]) p = renderLesson(+h[1]);
    else if (h[0] === 'profile') p = renderProfile();
    else p = renderHome();
    if (p && p.catch) p.catch(function (err) { if (err.message !== 'auth') app.innerHTML = '<div class="empty">' + esc(err.message) + ' <a href="#/">К курсам</a></div>'; });
  }
  function boot() {
    return api('me').then(function (d) {
      me = d;
      nav.hidden = false;
      document.getElementById('top-user').textContent = d.student.name.split(' ')[0] || 'Профиль';
      route();
    });
  }
  window.addEventListener('hashchange', route);
  boot().catch(function () {});
  /* Периодическая проверка: если зашли с другого устройства — этот сеанс закрывается сам. */
  setInterval(function () { if (me && !document.hidden) api('me').then(function (d) { me = d; }).catch(function () {}); }, 60000);
})();
