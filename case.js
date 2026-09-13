/* Страница кейса: индикатор прочитанного + просмотрщик фото.
   Вся разметка приходит с сервера — скрипт только навешивает поведение,
   поэтому без него страница остаётся полностью читаемой. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Кнопка «Назад»: если пришли с самого сайта — используем историю браузера
     (возвращает точно туда, откуда открыли), иначе (прямая ссылка/новая
     вкладка) — обычный переход по href на список кейсов. */
  const backBtn = document.querySelector('[data-back]');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) {
        e.preventDefault();
        history.back();
      }
    });
  }

  /* ---------- Индикатор прочитанного ---------- */
  const bar = document.querySelector('.case-progress span');
  if (bar) {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (max > 0 ? Math.min(1, scrollY / max) : 0) * 100 + '%';
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- Достижения: счётчик + появление плиток ----------
     Значение приходит строкой («98/100», «+320%», «12 000+», «TOP 5»),
     поэтому анимируем только первое число, а всё вокруг оставляем как есть.
     Разделитель разрядов берём из самой строки, чтобы «12 000» не стало «12,000». */
  const wins = [...document.querySelectorAll('.case__win')];
  if (wins.length) {
    const parse = (raw) => {
      const m = String(raw).match(/(\d[\d\s  .,]*)/);
      if (!m) return null;
      const rawNum = m[1].replace(/[\s  .,]+$/, '');   // хвостовые разделители — часть текста, не числа
      const sep = (rawNum.match(/[\s  ]/) || [''])[0];
      const decMatch = rawNum.match(/[.,](\d+)$/);
      const decimals = decMatch ? decMatch[1].length : 0;
      const numeric = parseFloat(rawNum.replace(/[\s  ]/g, '').replace(',', '.'));
      if (!isFinite(numeric)) return null;
      const start = m.index;
      return { numeric, decimals, sep, prefix: String(raw).slice(0, start), suffix: String(raw).slice(start + rawNum.length) };
    };
    const format = (value, p) => {
      let s = p.decimals ? value.toFixed(p.decimals) : String(Math.round(value));
      if (p.sep) {
        const [int, dec] = s.split('.');
        s = int.replace(/\B(?=(\d{3})+(?!\d))/g, p.sep) + (dec ? '.' + dec : '');
      }
      if (p.decimals) s = s.replace('.', ',');
      return p.prefix + s + p.suffix;
    };

    const run = (el) => {
      const target = el.querySelector('[data-count]');
      const parsed = target && parse(target.dataset.count || '');
      if (!parsed || reduce) return;
      const from = performance.now();
      const dur = 1400;
      const ease = (t) => 1 - Math.pow(1 - t, 4);           // easeOutQuart
      const tick = (now) => {
        const t = Math.min(1, (now - from) / dur);
        if (t < 1) {
          target.textContent = format(parsed.numeric * ease(t), parsed);
          requestAnimationFrame(tick);
        } else {
          /* В конце возвращаем строку из CMS дословно — никакого переформатирования */
          target.textContent = target.dataset.count;
        }
      };
      target.textContent = format(0, parsed);
      requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          io.unobserve(el);
          const delay = wins.indexOf(el) * 120;
          if (!reduce) {
            el.animate(
              [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
              { duration: 620, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
            );
          }
          setTimeout(() => run(el), delay);
        });
      }, { rootMargin: '0px 0px -10% 0px' });
      wins.forEach((el) => io.observe(el));
    }
  }

  /* ---------- Видео в галерее ----------
     Играет без звука само. Звук и полный экран — кнопками по наведению.
     Автовоспроизведение со звуком браузеры блокируют, поэтому включение
     звука возможно только по клику пользователя — так и сделано. */
  const videoShots = [...document.querySelectorAll('[data-video-shot]')];
  videoShots.forEach((shot) => {
    const video = shot.querySelector('video');
    if (!video) return;

    const soundBtn = shot.querySelector('[data-vsound]');
    const fullBtn = shot.querySelector('[data-vfull]');

    /* Тихий старт: без него Safari иногда игнорирует autoplay. */
    video.muted = true;
    video.play().catch(() => {});

    if (soundBtn) soundBtn.addEventListener('click', (e) => {
      e.preventDefault();
      video.muted = !video.muted;
      shot.classList.toggle('is-unmuted', !video.muted);
      soundBtn.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
      soundBtn.title = soundBtn.getAttribute('aria-label');
      /* Со звуком воспроизведение могло быть приостановлено — возобновляем. */
      if (!video.muted) video.play().catch(() => {});
      /* Остальные ролики глушим: два источника звука разом — это шум. */
      if (!video.muted) videoShots.forEach((other) => {
        if (other === shot) return;
        const v = other.querySelector('video');
        if (v && !v.muted) { v.muted = true; other.classList.remove('is-unmuted'); }
      });
    });

    if (fullBtn) fullBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const go = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
      if (go) go.call(video).catch?.(() => {});
    });

    /* За кадром видео не крутим: экономим батарею и трафик. */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) video.play().catch(() => {});
          else if (video.muted) video.pause();   /* со звуком не прерываем — человек слушает */
        });
      }, { threshold: 0.15 });
      io.observe(video);
    }
  });

  /* ---------- Просмотрщик ---------- */
  const shots = [...document.querySelectorAll('[data-zoom]')];
  if (!shots.length) return;
  const sources = shots.map((img) => img.currentSrc || img.src);
  let view = null;

  const open = (index) => {
    if (view) return;
    const layer = document.createElement('div');
    layer.className = 'zoom';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Просмотр изображения');
    layer.tabIndex = -1;
    layer.innerHTML =
      '<div class="zoom__bd"></div>' +
      '<button class="zoom__btn zoom__prev" type="button" aria-label="Предыдущее изображение">&lsaquo;</button>' +
      '<img class="zoom__img" alt="">' +
      '<button class="zoom__btn zoom__next" type="button" aria-label="Следующее изображение">&rsaquo;</button>' +
      '<button class="zoom__btn zoom__close" type="button" aria-label="Закрыть">&times;</button>' +
      '<div class="zoom__count" aria-live="polite"></div>';
    document.body.append(layer);
    document.body.style.overflow = 'hidden';

    const img = layer.querySelector('.zoom__img');
    const count = layer.querySelector('.zoom__count');
    const prev = layer.querySelector('.zoom__prev');
    const next = layer.querySelector('.zoom__next');
    const single = sources.length < 2;
    prev.hidden = next.hidden = single;
    view = { layer, index };

    const show = (i) => {
      view.index = (i + sources.length) % sources.length;
      img.src = sources[view.index];
      img.alt = shots[view.index].alt || '';
      count.textContent = `${view.index + 1} / ${sources.length}`;
    };
    const step = (d) => { if (!single) show(view.index + d); };

    show(index);
    requestAnimationFrame(() => layer.classList.add('is-open'));

    const close = () => {
      layer.remove();
      view = null;
      document.body.style.removeProperty('overflow');
      removeEventListener('keydown', onKey);
      shots[index]?.focus?.();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
      else if (ev.key === 'ArrowLeft') step(-1);
      else if (ev.key === 'ArrowRight') step(1);
    };
    addEventListener('keydown', onKey);

    prev.onclick = (ev) => { ev.stopPropagation(); step(-1); };
    next.onclick = (ev) => { ev.stopPropagation(); step(1); };
    layer.querySelector('.zoom__close').onclick = (ev) => { ev.stopPropagation(); close(); };
    layer.addEventListener('click', (ev) => { if (ev.target === layer || ev.target.classList.contains('zoom__bd')) close(); });

    /* свайп пальцем и мышью */
    let startX = 0, dragging = false;
    img.addEventListener('pointerdown', (ev) => { dragging = true; startX = ev.clientX; img.setPointerCapture?.(ev.pointerId); });
    img.addEventListener('pointerup', (ev) => {
      if (!dragging) return;
      dragging = false;
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    });

    requestAnimationFrame(() => layer.focus());
  };

  shots.forEach((img, i) => {
    img.addEventListener('click', () => open(i));
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(i); }
    });
  });

  /* Мягкое появление фото по мере прокрутки — без сдвига вёрстки. */
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate(
          [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
        );
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.case__fig, .case__shot, .case__stats, .case__quote').forEach((el) => io.observe(el));
  }

})();
