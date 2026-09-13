/* ============================================
   Отзывы — лента скриншотов + просмотр во весь экран.
   Подключён на главной и на страницах услуг. Разметку плиты
   и заголовок пишет сама страница, этот файл наполняет [data-reviews].

   ЧТОБЫ ДОБАВИТЬ ОТЗЫВ: положите картинку в /assets/reviews/
   и добавьте строку в LIST ниже. Порядок в списке = порядок в ленте.
   Файла нет — карточка молча пропускается, ошибок на странице не будет.
   Если не найдётся ни одного файла, вся секция скрывается целиком.
   ============================================ */
(() => {
  const BASE = '/assets/reviews/';
  /* Расширение файла подбирается само — кладите скриншот в любом из этих
     форматов, переименовывать не нужно. webp первым: он легче всего. */
  const EXT = ['webp', 'jpg', 'png', 'jpeg'];

  /* name — имя файла без расширения.
     alt — то, что прочитает голосовой доступ и поисковик: у скриншота
     это единственный текст, который вообще есть. */
  const LIST = [
    { name: 'review-01', alt: 'Отзыв клиента: «Наш бизнес не загнётся, пока в ней есть такие сильные командные игроки»' },
    { name: 'review-02', alt: 'Отзыв клиента: благодарность за современный сайт и работу с первой встречи' },
    { name: 'review-03', alt: 'Отзыв клиента на английском: благодарность за терпение и гибкость в работе над проектом' },
    { name: 'review-04', alt: 'Отзыв клиента: «Очень круто получилось, во многом благодаря твоим предложениям по анимации»' },
    { name: 'review-05', alt: 'Отзыв клиента: «Как я рад, что с тобой работать начал»' },
    { name: 'review-06', alt: 'Отзыв о лендинге на Tilda: «Чётко, оперативно и всегда на связи, рекомендую»' },
    { name: 'review-07', alt: 'Отзыв о дизайне лендинга: «Результат превзошёл все ожидания»' },
    { name: 'review-08', alt: 'Отзыв о веб-дизайне: «Оперативные ответы, всё чётко и по делу»' },
    { name: 'review-09', alt: 'Отзыв о дизайне мобильного приложения: «Качественное и своевременное выполнение заказа»' },
    { name: 'review-10', alt: 'Отзыв о редизайне сайта: «Профессионально и точно в срок, всегда на связи»' },
  ];

  const SPEED = 42;          // пикселей в секунду — спокойный темп чтения
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mounts = [...document.querySelectorAll('[data-reviews]')];
  if (!mounts.length || !LIST.length) return;

  /* ---------- Лента ---------- */
  /* Перебирает форматы по очереди и запоминает сработавший: тот же адрес
     потом откроется в полноэкранном просмотре, без второй загрузки. */
  const buildCard = (item, index, isClone, onDead) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rvw__card';
    btn.dataset.index = String(index);
    const img = document.createElement('img');
    let ext = 0;
    img.src = BASE + item.name + '.' + EXT[ext];
    img.addEventListener('error', () => {
      if (++ext < EXT.length) { img.src = BASE + item.name + '.' + EXT[ext]; return; }
      onDead(btn);           // формат не подошёл ни один — файла просто нет
    });
    img.addEventListener('load', () => { item.resolved = img.getAttribute('src'); }, { once: true });
    img.alt = isClone ? '' : (item.alt || 'Скриншот отзыва клиента');
    img.loading = 'lazy';
    img.decoding = 'async';
    btn.append(img);
    if (isClone) {
      /* Второй проход ленты — та же картинка. Для клавиатуры и озвучки
         его не существует, иначе каждый отзыв читался бы дважды. */
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;
    } else {
      btn.setAttribute('aria-label', (item.alt || 'Скриншот отзыва клиента') + ' — открыть');
    }
    return btn;
  };

  const setup = (mount) => {
    const track = document.createElement('div');
    track.className = 'rvw__track';

    /* half — ширина одного прохода ленты (она задублирована дважды).
       Понадобится и для оборота автоскролла, и для оборота при драге. */
    let half = 0;
    const measure = () => { half = track.scrollWidth / 2; };

    let alive = LIST.length;
    const onDead = (card) => {
      /* Обе копии карточки спотыкаются об один и тот же отсутствующий файл,
         поэтому половины ленты остаются равной длины и стык не разъезжается. */
      card.remove();
      alive -= 0.5;
      if (alive > 0) { measure(); return; }
      mount.closest('section')?.setAttribute('hidden', '');
      /* Секция уже посчитана в ScrollTrigger — без пересчёта скролл-эффекты
         соседних плит останутся привязаны к высоте, которой больше нет. */
      window.ScrollTrigger?.refresh();
    };

    /* Два одинаковых прохода подряд: когда первый уезжает, второй уже на его месте. */
    LIST.forEach((item, i) => track.append(buildCard(item, i, false, onDead)));
    LIST.forEach((item, i) => track.append(buildCard(item, i, true, onDead)));
    mount.append(track);

    measure();
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    addEventListener('load', measure, { once: true });
    let resizeTimer;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 200); });

    /* dragDistance живёт снаружи pointer-обработчиков, чтобы click,
       который браузер шлёт следом за pointerup, мог его увидеть и понять,
       что это был драг, а не тап по карточке. */
    let dragDistance = 0;

    if (!REDUCE) {
      /* ---------- Автоскролл + перетаскивание ----------
         CSS-анимация не оставляет способа руками сдвинуть трек — transform
         одновременно не может идти и от @keyframes, и от жеста. Поэтому
         лента едет через rAF: pos — сдвиг в пикселях по X, оборачивается на
         половине трека. Драг мышью/пальцем на время жеста берёт pos под
         ручное управление, отпустили — автоскролл едет дальше с той же точки. */
      let pos = 0;
      let dragging = false;
      let paused = false;
      let dragStartX = 0;
      let dragStartPos = 0;
      let lastT = 0;

      const apply = () => { track.style.transform = `translate3d(${(-pos).toFixed(2)}px,0,0)`; };
      const wrap = () => { if (half > 0) pos = ((pos % half) + half) % half; };

      const step = (t) => {
        if (lastT && !dragging && !paused) {
          pos += SPEED * ((t - lastT) / 1000);
          wrap();
          apply();
        }
        lastT = t;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);

      mount.addEventListener('mouseenter', () => { paused = true; });
      mount.addEventListener('mouseleave', () => { paused = false; });
      mount.addEventListener('focusin', () => { paused = true; });
      mount.addEventListener('focusout', () => { paused = false; });

      mount.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        dragDistance = 0;
        dragStartX = e.clientX;
        dragStartPos = pos;
        mount.classList.add('is-dragging');
        mount.setPointerCapture?.(e.pointerId);
      });
      mount.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - dragStartX;
        dragDistance = Math.abs(dx);
        pos = dragStartPos - dx;
        wrap();
        apply();
      });
      const endDrag = () => { dragging = false; mount.classList.remove('is-dragging'); };
      mount.addEventListener('pointerup', endDrag);
      mount.addEventListener('pointercancel', endDrag);
    }

    track.addEventListener('click', (e) => {
      /* Больше 6px — это был драг ленты, а не тап по карточке: открывать
         полноэкранный просмотр не нужно, иначе перетаскивание бесило бы. */
      if (dragDistance > 6) { dragDistance = 0; return; }
      const card = e.target.closest('.rvw__card');
      if (!card) return;
      /* Листаем только по тем отзывам, что реально доехали: если часть файлов
         не залита, стрелки не должны упираться в пустые кадры. */
      const ids = [...new Set([...track.querySelectorAll('.rvw__card')].map((c) => Number(c.dataset.index)))]
        .sort((a, b) => a - b);
      open(Number(card.dataset.index), card, ids);
    });
  };

  /* ---------- Просмотр во весь экран ---------- */
  let view = null;

  const lockScroll = (on) => {
    document.body.style.overflow = on ? 'hidden' : '';
    /* Одного overflow мало: Lenis скроллит программно и его игнорирует. */
    if (window.lenis && typeof window.lenis.stop === 'function') on ? window.lenis.stop() : window.lenis.start();
  };

  const open = (index, source, ids) => {
    if (view) return;

    const layer = document.createElement('div');
    layer.className = 'rvw-pop';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Отзыв клиента');
    layer.tabIndex = -1;
    layer.innerHTML =
      '<div class="rvw-pop__bd"></div>' +
      '<button class="rvw-pop__btn rvw-pop__prev" type="button" aria-label="Предыдущий отзыв">&lsaquo;</button>' +
      '<img class="rvw-pop__img" alt="">' +
      '<button class="rvw-pop__btn rvw-pop__next" type="button" aria-label="Следующий отзыв">&rsaquo;</button>' +
      '<button class="rvw-pop__btn rvw-pop__close" type="button" aria-label="Закрыть">&times;</button>' +
      '<p class="rvw-pop__count" aria-live="polite"></p>';
    document.body.append(layer);
    lockScroll(true);

    const img = layer.querySelector('.rvw-pop__img');
    const count = layer.querySelector('.rvw-pop__count');
    const prev = layer.querySelector('.rvw-pop__prev');
    const next = layer.querySelector('.rvw-pop__next');
    const single = ids.length < 2;
    prev.hidden = next.hidden = single;
    view = { layer, pos: 0 };

    const show = (p) => {
      const pos = (p + ids.length) % ids.length;
      view.pos = pos;
      const item = LIST[ids[pos]];
      /* Тот же адрес, что уже загрузился в ленте — картинка откроется мгновенно,
         из кэша, без повторного перебора форматов. */
      img.src = item.resolved || (BASE + item.name + '.' + EXT[0]);
      img.alt = item.alt || 'Скриншот отзыва клиента';
      count.textContent = `${pos + 1} / ${ids.length}`;
    };
    const step = (d) => { if (!single) show(view.pos + d); };
    show(Math.max(0, ids.indexOf(index)));

    /* Переход открываем принудительным reflow, а не rAF: в неактивной
       вкладке кадр может не наступить и диалог останется прозрачным. */
    void layer.offsetWidth;
    layer.classList.add('is-open');

    const close = () => {
      layer.remove();
      view = null;
      lockScroll(false);
      removeEventListener('keydown', onKey);
      source?.focus?.();          // возвращаем фокус туда, откуда открыли
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    addEventListener('keydown', onKey);

    prev.onclick = (e) => { e.stopPropagation(); step(-1); };
    next.onclick = (e) => { e.stopPropagation(); step(1); };
    layer.querySelector('.rvw-pop__close').onclick = (e) => { e.stopPropagation(); close(); };
    layer.addEventListener('click', (e) => {
      if (e.target === layer || e.target.classList.contains('rvw-pop__bd')) close();
    });

    /* Свайп пальцем и мышью — как в галерее кейса. */
    let startX = 0, dragging = false;
    img.addEventListener('pointerdown', (e) => { dragging = true; startX = e.clientX; img.setPointerCapture?.(e.pointerId); });
    img.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    });

    requestAnimationFrame(() => layer.focus());
  };

  mounts.forEach(setup);
})();
