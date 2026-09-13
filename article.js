/* Страница статьи: индикатор прочитанного, аккордеон FAQ, плавный переход
   по оглавлению, просмотрщик фото. Вся разметка приходит с сервера —
   скрипт только навешивает поведение, без него страница остаётся читаемой. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Кнопка «Назад»: если пришли с самого сайта — используем историю браузера
     (возвращает точно туда, откуда открыли), иначе (прямая ссылка/новая
     вкладка) — обычный переход по href на ленту гайдов. */
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
  const bar = document.querySelector('.art-progress span');
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

  /* ---------- FAQ-аккордеон (та же логика, что на главной, без ScrollTrigger) ---------- */
  document.querySelectorAll('.art__faq .faq__item').forEach((item) => {
    const q = item.querySelector('.faq__q');
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      item.closest('.art__faq').querySelectorAll('.faq__item.is-open').forEach((openItem) => {
        openItem.classList.remove('is-open');
        openItem.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) { item.classList.add('is-open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ---------- Оглавление: плавный переход + подсветка текущего раздела ---------- */
  const tocLinks = [...document.querySelectorAll('.art__toc-item a')];
  if (tocLinks.length) {
    tocLinks.forEach((link) => link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', link.getAttribute('href'));
    }));

    const headings = tocLinks.map((l) => document.getElementById(l.getAttribute('href').slice(1))).filter(Boolean);
    if (headings.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const link = tocLinks.find((l) => l.getAttribute('href') === '#' + entry.target.id);
          if (link) link.classList.toggle('is-current', entry.isIntersecting);
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      headings.forEach((h) => io.observe(h));
    }
  }

  /* ---------- Просмотрщик фото (идентично странице кейса) ---------- */
  const shots = [...document.querySelectorAll('[data-zoom]')];
  if (shots.length) {
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
      img.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(i); } });
    });
  }
})();
