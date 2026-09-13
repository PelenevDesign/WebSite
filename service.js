/* Страница услуги: плавный скролл + «наезд» плит, как на главной.
   Отдельный файл, а не main.js: там инициализация завязана на герой,
   меню-оверлей, проекты и док — на этой странице их нет. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Видеофон хиро ----------
     Загружаем и на телефоне; muted + playsinline обязательны для iOS Safari.
     Живёт до проверки GSAP — видео не должно зависеть от CDN анимаций. */
  const loadVideo = (v) => {
    if (v.dataset.loaded || reduce) return;
    v.dataset.loaded = '1';
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
    v.playsInline = true;
    const source = document.createElement('source');
    source.src = v.dataset.video;
    source.type = 'video/mp4';
    v.appendChild(source);
    v.load();
    const play = () => v.play().catch(() => {});
    v.addEventListener('canplay', play, { once: true });
    play();
  };
  const videos = () => document.querySelectorAll('video[data-video]');
  videos().forEach(loadVideo);

  /* ---------- Калькулятор стоимости ----------
     Работает без GSAP: цена — не декорация, она обязана считаться всегда. */
  const calc = document.querySelector('.calc');
  if (calc) {
    const totalEl = calc.querySelector('[data-total]');
    const noteEl = calc.querySelector('[data-note]');
    const fromEl = calc.querySelector('[data-from-label]');
    const inputs = [...calc.querySelectorAll('.calc__input')];
    const types = [...calc.querySelectorAll('.calc__input--type')];
    const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
    const pickedType = () => types.find((t) => t.checked) || types[0];

    let raf = 0;
    let shown = +(pickedType() ? pickedType().dataset.price : 0);
    const render = (target) => {
      if (reduce) { totalEl.textContent = fmt(target); shown = target; return; }
      cancelAnimationFrame(raf);
      const from = shown;
      const start = performance.now();
      const dur = 520;
      const ease = (t) => 1 - Math.pow(1 - t, 3);          // easeOutCubic
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        shown = from + (target - from) * ease(t);
        totalEl.textContent = fmt(shown);
        if (t < 1) raf = requestAnimationFrame(step);
        else { shown = target; totalEl.textContent = fmt(target); }
      };
      raf = requestAnimationFrame(step);
    };

    /* Опции, входящие в пакет определённого типа сайта. Пока это админпанель
       для варианта на чистом коде: включена, к сумме не прибавляется и снять
       её нельзя — она часть пакета, а не выбор пользователя. */
    const freeOpts = [...calc.querySelectorAll('[data-free-with]')];
    const memo = new WeakMap();          // выбор пользователя до блокировки

    const update = () => {
      const type = pickedType();
      const typeId = type ? type.dataset.type : '';
      let sum = type ? +type.dataset.price : 0;
      /* «от» в итоге — если хотя бы одна выбранная позиция сама «от»:
         такой пакет нельзя назвать точной ценой. */
      let isFrom = !!(type && type.hasAttribute('data-from'));
      let note = false;

      freeOpts.forEach((opt) => {
        const input = opt.querySelector('.calc__input');
        const label = opt.querySelector('[data-price-label]');
        const free = opt.dataset.freeWith === typeId;
        opt.classList.toggle('is-included', free);
        if (free) {
          if (!input.disabled) memo.set(input, input.checked);
          input.checked = true;
          input.disabled = true;
          if (label) label.textContent = label.dataset.priceIncluded;
        } else if (input.disabled) {
          input.disabled = false;
          input.checked = memo.get(input) || false;
          if (label) label.textContent = label.dataset.priceDefault;
        }
      });

      inputs.forEach((input) => {
        const opt = input.closest('.calc__opt');
        opt.classList.toggle('is-on', input.checked);
        if (!input.checked || input.classList.contains('calc__input--type')) return;
        if (opt.dataset.freeWith === typeId) return;      // входит в пакет — не считаем
        if (input.dataset.add) sum += +input.dataset.add;
        if (input.hasAttribute('data-from')) isFrom = true;
        if (input.hasAttribute('data-note-toggle')) note = true;
      });

      noteEl.hidden = !note;
      if (fromEl) fromEl.hidden = !isFrom;
      render(sum);
    };

    inputs.forEach((input) => input.addEventListener('change', update));
    update();
  }

  const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (!hasGsap) return;                       // без CDN страница остаётся статичной и читаемой

  gsap.registerPlugin(ScrollTrigger);

  /* Та же причина, что в main.js: перезагрузка из середины страницы ломала
     once-триггеры во время начального refresh. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ---------- Lenis ---------- */
  if (typeof Lenis !== 'undefined' && !reduce) {
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    window.lenis = lenis; /* нужен оверлеям для блокировки фона — см. main.js */
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    /* Якорь #brief внутри страницы — нативный переход конфликтует с Lenis. */
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const id = link.getAttribute('href').slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { force: true });
      });
    });
  }

  if (reduce) return;                          // дальше только декоративные скролл-эффекты

  /* ---------- Наезд плит ----------
     Вход .9→1, выход 1→.9 — как у секций главной. Но там секции ВЫШЕ экрана,
     и границы идут по порядку: top-V < top < top+H-V < top+H.
     Здесь плиты НИЖЕ экрана, и порядок ломается: top+H-V оказывается раньше top,
     то есть выход стартует, не дождавшись конца входа. В зоне нахлёста оба
     скраб-твина пишут scale в один элемент, значения расходятся — и блок
     дёргается на несколько пикселей. Поэтому границы считаем от высоты плиты:
       высокая (H >= V): вход  top bottom → top top,      выход bottom bottom → bottom top
       низкая  (H <  V): вход  top bottom → bottom bottom, выход top top      → bottom top
     В обоих случаях диапазоны идут встык и не пересекаются. */
  const cards = [...document.querySelectorAll('[data-card]')];
  let cardTweens = [];

  const buildCards = () => {
    cardTweens.forEach((tl) => { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); });
    cardTweens = cards.map((card) => {
      const H = card.offsetHeight;
      const V = window.innerHeight;
      /* Весь путь плиты — от «верх на нижней кромке экрана» до «низ на верхней»,
         это H + V пикселей. Внутри три фазы, длины в тех же пикселях:
           разгон и уход — min(H, V), между ними покой — |V − H|.
         Для высокой плиты это даёт поведение секций главной, для низкой —
         аккуратный отдых на scale 1 вместо конфликта фаз. */
      const grow = Math.min(H, V);
      const rest = Math.abs(V - H);

      const tl = gsap.timeline({
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
      });
      tl.fromTo(card, { scale: 0.9 }, { scale: 1, ease: 'none', duration: grow })
        .to(card, { scale: 1, duration: rest })
        .to(card, { scale: 0.9, ease: 'none', duration: grow });
      return tl;
    });
  };

  buildCards();

  /* ---------- Кейсы: проявление по мере скролла ----------
     Раньше плита пиннилась (pin) на весь проход сетки, и при 6 кейсах
     это давало длинный участок, где заголовок уже стоит на месте, а
     карточки ещё не показались. Теперь без пина: каждая карточка сама
     всплывает, когда доезжает до нижней трети экрана — короткая (0.7s),
     без искусственно растянутого шага, и не ломает обычный скролл. */
  function buildCasesReveal() {
    const items = [...document.querySelectorAll('.svc-cases-plate .svc__case')];
    if (!items.length) return;
    gsap.set(items, { opacity: 0, y: 36 });
    items.forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }),
      });
    });
  }
  buildCasesReveal();

  /* Пропорции фаз зависят от высоты экрана — на ресайзе пересобираем. */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { buildCards(); ScrollTrigger.refresh(); }, 200);
  });

  ScrollTrigger.refresh();

  /* ---------- Мягкое появление содержимого ---------- */
  const reveal = document.querySelectorAll('[data-reveal]');
  if (reveal.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const items = entry.target.children.length ? [...entry.target.children] : [entry.target];
        items.forEach((el, i) => {
          el.animate(
            [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
            { duration: 640, delay: i * 90, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
          );
        });
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveal.forEach((el) => io.observe(el));
  }
})();
