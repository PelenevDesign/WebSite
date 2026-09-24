/* Защита кабинета от копирования. Браузер не даёт полностью запретить
   скриншоты и запись экрана — поэтому здесь три слоя:
   1) закрываем очевидные пути (сохранение, контекстное меню, горячие клавиши скриншота);
   2) при уходе фокуса (ножницы Windows, запись экрана, смена окна) видео ставится на паузу и закрывается;
   3) поверх видео — персональный водяной знак ученика: любая утечка указывает на того, кто её сделал. */
(function () {
  'use strict';
  var shield = document.getElementById('page-shield');
  var players = [];
  var lastSignal = {};

  function signal(kind, detail) {
    var now = Date.now();
    if (lastSignal[kind] && now - lastSignal[kind] < 10000) return;
    lastSignal[kind] = now;
    try {
      fetch('/school/api.php?action=signal', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-School': '1' }, body: JSON.stringify({ kind: kind, detail: detail || '' }) });
    } catch (e) {}
  }
  function pauseAll() { players.forEach(function (p) { try { p.pause(); } catch (e) {} }); }
  function hideFor(ms) {
    if (!players.length) return;
    pauseAll();
    shield.hidden = false;
    clearTimeout(hideFor.t);
    if (ms) hideFor.t = setTimeout(function () { if (document.hasFocus()) shield.hidden = true; }, ms);
  }
  function unhide() { if (document.visibilityState === 'visible' && document.hasFocus()) shield.hidden = true; }

  function isField(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
  document.addEventListener('contextmenu', function (e) { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', function (e) { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', function (e) { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('copy', function (e) { if (!isField(e.target)) e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    /* PrintScreen в Windows — пустой буфер вместо кадра. */
    if (k === 'printscreen') { hideFor(1500); try { navigator.clipboard.writeText(''); } catch (_) {} signal('screenshot', 'PrintScreen'); return; }
    /* macOS: Cmd+Shift(+3/4/5) — прячем видео ещё до нажатия цифры. */
    if (e.metaKey && e.shiftKey) { hideFor(2500); if (['3', '4', '5', '6'].indexOf(k) > -1) signal('screenshot', 'Cmd+Shift+' + k); }
    /* Windows: Win+Shift+S (ножницы). */
    if (e.shiftKey && k === 's' && e.metaKey) signal('screenshot', 'Win+Shift+S');
    if (mod && ['s', 'p', 'u'].indexOf(k) > -1) { e.preventDefault(); }
    if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c'].indexOf(k) > -1) || (e.metaKey && e.altKey && ['i', 'j', 'c'].indexOf(k) > -1)) { e.preventDefault(); signal('devtools', k); }
  }, true);
  document.addEventListener('keyup', function (e) {
    if ((e.key || '').toLowerCase() === 'printscreen') { try { navigator.clipboard.writeText(''); } catch (_) {} }
  }, true);

  /* Потеря фокуса = ножницы, запись экрана, переключение окна. Клик внутрь iframe Kinescope — не в счёт. */
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (a && a.tagName === 'IFRAME') return;
      hideFor(0);
    }, 0);
  });
  window.addEventListener('focus', unhide);
  document.addEventListener('visibilitychange', function () { if (document.hidden) hideFor(0); else unhide(); });
  shield.addEventListener('click', unhide);
  window.addEventListener('beforeprint', function () { hideFor(0); signal('screenshot', 'print'); });

  /* Водяной знак: крупная «блуждающая» подпись + еле заметная сетка по всему кадру. */
  function Watermark(wrap, text) {
    var c = document.createElement('canvas');
    c.className = 'player__wm';
    c.setAttribute('aria-hidden', 'true');
    wrap.appendChild(c);
    var ctx = c.getContext('2d');
    var pos = { x: .2, y: .3 };
    function draw() {
      var r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      var size = Math.max(11, Math.min(22, r.width / 48));
      ctx.font = '500 ' + size + 'px "Inter Tight", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.save();
      ctx.rotate(-0.35);
      var step = size * 16;
      for (var y = -r.height; y < r.height * 2; y += size * 7) for (var x = -r.width; x < r.width * 2; x += step) ctx.fillText(text, x + (y / 3 % step), y);
      ctx.restore();
      ctx.font = '600 ' + (size * 1.05) + 'px "Inter Tight", system-ui, sans-serif';
      var w = ctx.measureText(text).width;
      var px = pos.x * Math.max(0, r.width - w - 20) + 10, py = pos.y * Math.max(0, r.height - 60) + 30;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.strokeText(text, px, py);
      ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.fillText(text, px, py);
    }
    function move() { pos = { x: Math.random(), y: Math.random() }; draw(); }
    draw();
    var t1 = setInterval(move, 7000);
    window.addEventListener('resize', draw);
    document.addEventListener('fullscreenchange', function () { setTimeout(draw, 60); });
    this.canvas = c;
    this.destroy = function () { clearInterval(t1); window.removeEventListener('resize', draw); c.remove(); };
  }

  /* Проверка, что знак не удалили и не спрятали через инструменты разработчика. */
  function intact(wrap, wm) {
    if (!wm.canvas.isConnected || wm.canvas.parentNode !== wrap) return false;
    var s = getComputedStyle(wm.canvas);
    if (s.display === 'none' || s.visibility !== 'visible' || parseFloat(s.opacity) < .9) return false;
    var a = wm.canvas.getBoundingClientRect(), b = wrap.getBoundingClientRect();
    return a.width >= b.width - 2 && a.height >= b.height - 2;
  }

  window.SchoolGuard = {
    signal: signal,
    /* pausable — объект с методом pause(); возвращает функцию отключения. */
    protect: function (wrap, pausable, text) {
      var wm = new Watermark(wrap, text);
      players.push(pausable);
      var timer = setInterval(function () {
        if (!wrap.isConnected) return;
        if (!intact(wrap, wm)) {
          try { pausable.pause(); } catch (e) {}
          wrap.innerHTML = '<div class="player__shield"><p>Воспроизведение остановлено.<br><small>Обновите страницу.</small></p></div>';
          signal('watermark', 'removed');
          clearInterval(timer);
        }
      }, 1000);
      return function () { clearInterval(timer); wm.destroy(); players = players.filter(function (p) { return p !== pausable; }); };
    }
  };
})();
