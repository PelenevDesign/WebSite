/* ============================================
   PELENEV.DESIGN
   ============================================ */

gsap.registerPlugin(ScrollTrigger);

/* ---------- Утилиты ---------- */
// перезагрузка всегда с начала страницы: восстановление скролла заставляет
// once-триггеры самоубиваться во время начального refresh — краш ScrollTrigger 3.12.5
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Lenis + ScrollTrigger ---------- */
const lenis = new Lenis({
  lerp: 0.1,
  wheelMultiplier: 1,
});

/* Lenis скроллит программно, поэтому overflow:hidden его не останавливает —
   оверлеям (лид-магнит) нужен доступ к инстансу, чтобы блокировать фон. */
window.lenis = lenis;

lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

/* ---------- Хедер: полноэкранное меню ---------- */
const topbar = document.getElementById('topbar');
const burger = document.getElementById('burger');
const menu = document.getElementById('menu-overlay');

// под топбаром светлая секция → тёмный цвет; при открытом меню всегда светлый
let topbarLightTriggers = [];
function updateTopbarContrast() {
  if (!topbar) return;
  if (menuOpen) {
    topbar.classList.remove('is-dark');
    return;
  }
  topbar.classList.toggle('is-dark', topbarLightTriggers.some((t) => t.isActive));
}
const menuReveals = menu.querySelectorAll('.menu__reveal');
const menuGiant = menu.querySelector('.menu__giant');
const burgerLines = burger.querySelectorAll('.burger__line');

// длительность с учётом reduced motion
const dur = (d) => (prefersReducedMotion ? 0 : d);

let menuOpen = false;
let menuAnimating = false;

function openMenu() {
  if (menuAnimating) return;
  menuAnimating = true;
  menuOpen = true;
  updateTopbarContrast(); // поверх тёмного оверлея — всегда светлый
  lenis.stop();
  menu.setAttribute('aria-hidden', 'false');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Close menu');

  gsap.timeline({ onComplete: () => { menuAnimating = false; } })
    .set(menu, { visibility: 'visible', clipPath: 'inset(0% 0% 100% 0%)' })
    .to(menu, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: dur(0.7),
      ease: 'power3.inOut',
    })
    .fromTo(menuReveals,
      { yPercent: 110, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: dur(0.7), ease: 'power3.out', stagger: dur(0.05) },
      dur(0.15))
    .fromTo(menuGiant,
      { yPercent: 60, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: dur(0.9), ease: 'power3.out' },
      dur(0.3));

  // бургер → «×»
  gsap.to(burgerLines[0], { y: 4.5, rotate: 45, duration: dur(0.4), ease: 'power2.inOut' });
  gsap.to(burgerLines[1], { y: -4.5, rotate: -45, duration: dur(0.4), ease: 'power2.inOut' });
}

function closeMenu() {
  if (menuAnimating) return;
  menuAnimating = true;
  menuOpen = false;
  menu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Open menu');

  gsap.timeline({
    onComplete: () => {
      gsap.set(menu, { visibility: 'hidden', clipPath: 'inset(0% 0% 100% 0%)' });
      menuAnimating = false;
      updateTopbarContrast(); // вернуть цвет по секции под топбаром
      lenis.start();
    },
  })
    .to(menuReveals, { opacity: 0, duration: dur(0.3), ease: 'power2.in' })
    .to(menu, {
      clipPath: 'inset(100% 0% 0% 0%)',
      duration: dur(0.6),
      ease: 'power3.inOut',
    }, dur(0.1));

  gsap.to(burgerLines, { y: 0, rotate: 0, duration: dur(0.4), ease: 'power2.inOut' });
}

burger.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOpen) closeMenu();
});

// клик по ссылке меню — закрыть и плавно доскроллить до секции (Lenis не дружит с нативными якорями)
menu.querySelectorAll('.menu__link, .pill').forEach((link) => {
  link.addEventListener('click', (e) => {
    if (link.hasAttribute('data-contact')) return; // откроет модалку в initContact
    const href = link.getAttribute('href') || '';
    const target = href.startsWith('#') && href.length > 1 ? document.querySelector(href) : null;
    if (target) {
      e.preventDefault();
      if (menuOpen) closeMenu();
      // «Главная» ведёт к самому верху: у первой секции скролл-эффекты сдвигают геометрию
      const to = target === document.querySelector('main > section') ? 0 : target;
      lenis.scrollTo(to, { offset: 0, duration: 1.1, force: true });
    } else if (menuOpen) {
      closeMenu();
    }
  });
});

/* ---------- Hero: load-in + скролл-поведение ---------- */
function initHero() {
  if (!document.getElementById('hero')) return;
  const bg = document.querySelector('.hero__bg');
  const subLines = document.querySelectorAll('.hero__sub-line');
  const services = document.querySelectorAll('.hero__service');
  const lead = document.querySelector('.hero__lead');
  const cta = document.querySelector('.hero__cta');
  const giantWord = document.querySelector('.hero__giant-word');
  const giantDot = document.querySelector('.hero__giant-dot');
  const giant = document.querySelector('.hero__giant');

  // как только первая секция полностью накрыла вьюпорт — прячем контент hero,
  // чтобы он не просвечивал в зазорах scale-переходов ниже по странице
  ScrollTrigger.create({
    trigger: '#about',
    start: 'top top',
    onEnter: () => gsap.set([bg, '.hero__content'], { autoAlpha: 0 }),
    onLeaveBack: () => gsap.set([bg, '.hero__content'], { autoAlpha: 1 }),
  });

  if (!prefersReducedMotion) {
    // load-in
    gsap.timeline()
      .fromTo(bg, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0)
      .fromTo(bg, { scale: 1.12 }, { scale: 1, duration: 1.6, ease: 'power2.out' }, 0)
      .fromTo(subLines,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08 }, 0.2)
      .fromTo(services,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.06 }, 0.4)
      .fromTo(lead,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.42)
      .fromTo(cta,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.5)
      .fromTo(giantWord,
        { yPercent: 100 },
        { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.35)
      .fromTo(giantDot,
        { scale: 0 },
        { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 0.45);

    // гигант уезжает вниз и пропадает под наезжающей секцией (y: 0→280 как в оригинале)
    gsap.to(giant, {
      y: 280,
      ease: 'none',
      scrollTrigger: {
        trigger: '#about',
        start: 'top bottom',
        end: 'top top',
        scrub: true,
      },
    });

    gsap.to(bg, {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: {
        trigger: '#about',
        start: 'top bottom',
        end: 'top top',
        scrub: true,
      },
    });
  }
}

initHero();

/* ---------- По-словный reveal из-под маски (заголовок About) ---------- */
// оборачивает каждое слово (и инлайн-иконку) в маску для подъёма
function splitWords(el) {
  const frag = document.createDocumentFragment();
  const wrap = (content) => {
    const mask = document.createElement('span');
    mask.className = 'wmask';
    const word = document.createElement('span');
    word.className = 'word';
    if (typeof content === 'string') word.textContent = content;
    else word.appendChild(content);
    mask.appendChild(word);
    frag.appendChild(mask);
    frag.appendChild(document.createTextNode(' '));
  };
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent.split(/\s+/).filter(Boolean).forEach(wrap);
    } else {
      wrap(node);
    }
  });
  el.textContent = '';
  el.appendChild(frag);
  return el.querySelectorAll('.word');
}

/* ---------- Projects: поток scroll-card поверх закреплённого фона ---------- */
// intro «дышит» scale .9→1→.9 как scroll-card — нужно и на главной без проектов

function initProjects() {
  let allProjects = gsap.utils.toArray('.project');
  if (!allProjects.length) return; // секции кейсов нет на этой странице
  const bgImgs = gsap.utils.toArray('.projects-bg__img');
  const tabs = gsap.utils.toArray('.wtab');
  allProjects.forEach((p, i) => { p.dataset.idx = i; });

  // кроссфейд фона на фото активного проекта (по его исходному индексу)
  const setBg = (proj) => {
    const idx = proj ? +proj.dataset.idx : 0;
    bgImgs.forEach((img, j) => {
      gsap.to(img, { opacity: j === idx ? 1 : 0, duration: prefersReducedMotion ? 0 : 0.6, ease: 'power2.out', overwrite: true });
    });
  };

  // созданные триггеры/твины текущего фильтра — чистим при смене категории
  let items = [];
  const clearItems = () => { items.forEach((x) => x && x.kill && x.kill()); items = []; };

  function build() {
    const visible = allProjects.filter((p) => p.style.display !== 'none');
    setBg(visible[0]);

    // фон = фото активного проекта
    visible.forEach((proj) => {
      items.push(ScrollTrigger.create({
        trigger: proj, start: 'top 85%', end: 'bottom 85%',
        onEnter: () => setBg(proj), onEnterBack: () => setBg(proj),
      }));
    });

    if (prefersReducedMotion) return;

    visible.forEach((proj) => {
      const texts = proj.querySelector('.ptexts');
      const card = proj.querySelector('.pcard');

      // вход текстов
      items.push(gsap.fromTo(texts.querySelector('.ptexts__word'), { yPercent: 110 },
        { yPercent: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: texts, start: 'top 82%', once: true } }));
      items.push(gsap.fromTo(texts.querySelectorAll('.ptexts__meta-row'), { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.06, scrollTrigger: { trigger: texts, start: 'top 82%', once: true } }));

      // тексты гаснут под накрывающей карточкой
      items.push(gsap.fromTo(texts, { autoAlpha: 1 }, {
        autoAlpha: 0, ease: 'none', immediateRender: false,
        scrollTrigger: { trigger: card, start: 'top 10%', end: 'top top', scrub: true },
      }));

      // «дыхание» карточки .9→1→.9
      items.push(gsap.fromTo(card, { scale: 0.9 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom bottom', scrub: true },
      }));
      items.push(gsap.fromTo(card, { scale: 1 }, {
        scale: 0.9, ease: 'none', immediateRender: false,
        scrollTrigger: { trigger: card, start: 'bottom bottom', end: 'bottom top', scrub: true },
      }));
    });
  }

  function applyFilter(cat, scroll) {
    clearItems();
    allProjects.forEach((p) => {
      p.style.display = cat === 'all' || (p.dataset.cat || '').split(/\s+/).includes(cat) ? '' : 'none';
      p.classList.remove('project--lead');
      gsap.set([p.querySelector('.pcard'), p.querySelector('.ptexts'), p.querySelector('.ptexts__word'), ...p.querySelectorAll('.ptexts__meta-row')], { clearProps: 'all' });
    });
    const visible = allProjects.filter((p) => p.style.display !== 'none');
    if (visible[0]) visible[0].classList.add('project--lead');
    visible.forEach((p, i) => { const n = p.querySelector('.pcard__num'); if (n) n.textContent = String(i + 1).padStart(2, '0'); });
    build();
    const footer = document.getElementById('footer');
    if (footer) { footer.hidden = false; footer.style.removeProperty('display'); }
    if (scroll) {
      ScrollTrigger.refresh();
      lenis.scrollTo('#projects', { offset: -120, duration: 0.8, force: true });
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('is-active')) return;
      tabs.forEach((t) => { const on = t === tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
      applyFilter(tab.dataset.cat, true);
    });
  });

  const active = tabs.find((t) => t.classList.contains('is-active')) || tabs[0];
  applyFilter(active ? active.dataset.cat : 'site', false);
  window.__projectsRefresh = () => {
    allProjects = gsap.utils.toArray('.project');
    allProjects.forEach((p, i) => { p.dataset.idx = i; });
    const current = tabs.find((tab) => tab.classList.contains('is-active')) || tabs[0];
    applyFilter(current ? current.dataset.cat : 'all', false);
    ScrollTrigger.refresh();
  };
}

// заголовок страницы кейсов (work.html)
function initWorkHero() {
  if (prefersReducedMotion || !document.querySelector('.workhero')) return;
  gsap.fromTo('.workhero__word', { yPercent: 110 }, {
    yPercent: 0, duration: 1, ease: 'power3.out', delay: 0.1,
  });
  gsap.fromTo('.workhero__sub', { y: 16, opacity: 0 }, {
    y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', delay: 0.25,
  });
}

initWorkHero();
initProjects();

window.addEventListener('load', () => ScrollTrigger.refresh());

/* ---------- About: reveal + live-время + счётчики ---------- */
function initAbout() {
  if (!document.getElementById('about')) return;

  // live-время: работает только если блок с часами присутствует
  const localEl = document.getElementById('local-time');
  const yourEl = document.getElementById('your-time');
  if (localEl && yourEl) {
    const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmt = (tz, zoneStyle) => {
      const d = new Date();
      const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
      }).format(d);
      const zone = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: zoneStyle })
        .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
      return `${time} ${zone}`;
    };
    const tick = () => {
      localEl.textContent = fmt('Europe/Belgrade', 'short');
      yourEl.textContent = fmt(userZone, 'shortOffset');
    };
    tick();
    setInterval(tick, 1000);
  }

  if (prefersReducedMotion) return;

  // scroll-card: scale .9→1 на входе, 1→.9 на выходе
  gsap.fromTo('#about', { scale: 0.9 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: '#about', start: 'top bottom', end: 'top top', scrub: true },
  });
  gsap.fromTo('#about', { scale: 1 }, {
    scale: 0.9, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#about', start: 'bottom bottom', end: 'bottom top', scrub: true },
  });

  // H2-параграф: по-словный подъём из-под маски
  const words = splitWords(document.querySelector('.about__title'));
  gsap.fromTo(words,
    { yPercent: 110 },
    {
      yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.02,
      scrollTrigger: { trigger: '.about__title', start: 'top 75%', once: true },
    });

  gsap.fromTo('.about__body',
    { y: 20, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: '.about__body', start: 'top 85%', once: true },
    });

  // теги: стаггер fade+y
  gsap.fromTo('.tag',
    { y: 16, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.05,
      scrollTrigger: { trigger: '.about__tags', start: 'top 85%', once: true },
    });

  // фото дуэта: scale 1.08→1 + fade
  gsap.fromTo('.about__img',
    { scale: 1.08, opacity: 0 },
    {
      scale: 1, opacity: 1, duration: 1.2, ease: 'power2.out',
      scrollTrigger: { trigger: '.about__photo', start: 'top 80%', once: true },
    });

  // строки инфо: лёгкий построчный fade
  gsap.fromTo('.about__info-row',
    { opacity: 0, y: 12 },
    {
      opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06,
      scrollTrigger: { trigger: '.about__info', start: 'top 85%', once: true },
    });

  // стат-карточки: стаггер появления + счётчики 0→target
  const stats = gsap.utils.toArray('.stat');
  gsap.fromTo(stats,
    { y: 30, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: '.about__stats', start: 'top 85%', once: true },
    });

  stats.forEach((stat) => {
    const numEl = stat.querySelector('.stat__num');
    const target = +numEl.dataset.count;
    const suffix = numEl.dataset.suffix || '';
    const counter = { val: 0 };
    gsap.to(counter, {
      val: target, duration: 1.4, ease: 'power2.out',
      onUpdate: () => { numEl.textContent = Math.round(counter.val) + suffix; },
      scrollTrigger: { trigger: '.about__stats', start: 'top 85%', once: true },
    });
  });
}

initAbout();

/* ---------- Services: строки-раскрытия ---------- */
function initServices() {
  if (prefersReducedMotion || !document.getElementById('services')) return;

  // заголовок секции
  gsap.fromTo('.services__h2-word',
    { yPercent: 110 },
    {
      yPercent: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: '.services__head', start: 'top 80%', once: true },
    });
  gsap.fromTo('.services__intro',
    { y: 16, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: '.services__head', start: 'top 80%', once: true },
    });

  // пунктирные разделители: прочерчивание слева направо
  gsap.utils.toArray('.srow-sep').forEach((sep) => {
    gsap.fromTo(sep, { scaleX: 0 }, {
      scaleX: 1, duration: 0.8, ease: 'power2.out',
      scrollTrigger: { trigger: sep, start: 'top 88%', once: true },
    });
  });

  // строки: подпункты, картинки, крупное название
  gsap.utils.toArray('.srow').forEach((row) => {
    const items = row.querySelectorAll('.srow__desc, .srow__cta');
    const imgs = row.querySelectorAll('.srow__imgwrap');
    const word = row.querySelector('.srow__title-word');
    const num = row.querySelector('.srow__num');

    gsap.timeline({
      scrollTrigger: { trigger: row, start: 'top 82%', once: true },
      onComplete: () => gsap.set([...items, ...imgs, num], { clearProps: 'transform,opacity' }),
    })
      .fromTo(num, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
      .fromTo(word,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.9, ease: 'power3.out' }, 0)
      .fromTo(items,
        { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.07 }, 0.1)
      .fromTo(imgs,
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, 0.25);
  });
}

initServices();

/* ---------- Pricing: тумблер + входные анимации ---------- */
function initPricing() {
  const toggle = document.getElementById('ptoggle');
  if (!toggle) return;

  // переключатель услуги: Сайт / AI-Контент / Продвижение — меняет цену и всю панель
  const opts = toggle.querySelectorAll('.ptoggle__opt');
  const priceVal = document.getElementById('price-val');
  const labelEl = document.querySelector('.pricing__label');
  const periodEl = document.querySelector('.pricing__period');
  const descEl = document.querySelector('.pricing__desc');
  const titleEl = document.querySelector('.pricing__panel-title');
  const listEl = document.querySelector('.pincl');
  const noteEl = document.querySelector('.pricing__quote-text');
  const factsEl = document.querySelector('.pricing__facts');

  // иконки-строки для пунктов панели (монохром, в стиле секции)
  const ic = {
    bulb: '<svg viewBox="0 0 24 24" fill="none"><path d="M9.5 18.5h5M10.5 21h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.6l.1.6h5.2l.1-.6c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="9.5" r="1.6" stroke="currentColor" stroke-width="1.7"/><path d="m4.5 17 4.5-4.5 3.5 3.5 3-2.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14 8 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="6" r="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="17" cy="18" r="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none"><path d="M14 4c3.5 1 5 2.5 6 6-3.5 3.5-6.5 6-9 7l-4-4c1-2.5 3.5-5.5 7-9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="14.5" cy="9.5" r="1.6" stroke="currentColor" stroke-width="1.7"/><path d="M7 17c-1.5.5-2.5 2-2.5 3.5C6 20.5 7.5 19.5 8 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chartUp: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m7 15 3.5-3.5 3 3L20 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 8h4v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m20 20-4.6-4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
    bars: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="12" width="4" height="8" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="10" y="8" width="4" height="12" rx="1" stroke="currentColor" stroke-width="1.7"/><rect x="16" y="4" width="4" height="16" rx="1" stroke="currentColor" stroke-width="1.7"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    cycle: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 8a8 8 0 0 1 13-1.5M19 5v3h-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 16a8 8 0 0 1-13 1.5M5 19v-3h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const item = (icon, title, text) =>
    `<li class="pincl__item"><span class="pincl__icon">${icon}</span><span class="pincl__text"><strong>${title}</strong><span>${text}</span></span></li>`;
  const factIcons = {
    clock: '<svg class="pfact__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l2.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    start: '<svg class="pfact__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  const facts = (rows) => rows.map(([head, value, icon]) => `<div class="pfact"><span class="pfact__head">${factIcons[icon]}${head}</span><span class="pfact__val">${value}</span></div>`).join('');

  // контент вкладки «Сайт» берём из статической разметки (дефолт)
  const plans = {
    site: {
      label: labelEl.textContent,
      price: '35 000',
      period: '',
      desc: descEl.textContent,
      title: titleEl.textContent,
      listHTML: listEl.innerHTML,
      note: noteEl.innerHTML,
      facts: [['Сроки', 'От 14 дней', 'clock'], ['Старт', 'Отвечаю на заявки в течение дня', 'start']],
    },
    ai: {
      label: 'Стоимость проекта',
      price: '6 000',
      period: '',
      desc: 'Каждый проект рассчитывается индивидуально в зависимости от задачи, формата контента и количества материалов.',
      title: 'Что вы получите',
      listHTML: [
        item(ic.bulb, 'Разработка идеи и сценария', 'Создаём концепцию, которая подходит именно вашему бизнесу.'),
        item(ic.image, 'Создание AI-визуала', 'Фотореалистичные изображения, рекламные креативы и графика.'),
        item(ic.video, 'Генерация AI-видео', 'Reels, рекламные ролики, презентации и анимации.'),
        item(ic.pen, 'Тексты и адаптация', 'Сценарии, посты, заголовки и описание контента.'),
        item(ic.share, 'Подготовка под соцсети', 'Instagram, Telegram, VK, YouTube Shorts, TikTok.'),
        item(ic.rocket, 'Передача готового проекта', 'Получаете полностью готовый контент для публикации.'),
      ].join(''),
      note: 'Создаю контент, который помогает привлекать внимание, выделяться среди конкурентов и экономить время на производстве.',
      facts: [['Сроки', 'От 3 дней', 'clock'], ['Старт', 'Отвечаю на заявки в течение дня', 'start']],
    },
    promo: {
      label: 'Стоимость ведения',
      price: '25 000',
      period: '/ мес.',
      desc: 'Помогаю не только создать сайт, но и сделать так, чтобы его находили потенциальные клиенты через поиск и рекламу.',
      title: 'Что входит в работу',
      listHTML: [
        item(ic.chartUp, 'SEO-аудит сайта', 'Проверяем техническое состояние сайта и устраняем ошибки.'),
        item(ic.search, 'Поисковая оптимизация', 'Настраиваем сайт для роста позиций в Яндекс и Google.'),
        item(ic.target, 'Контекстная реклама', 'Запуск и сопровождение рекламных кампаний в Яндекс Директ.'),
        item(ic.bars, 'Аналитика и отслеживание заявок', 'Подключаем Метрику, цели и анализируем эффективность.'),
        item(ic.bolt, 'Повышение конверсии', 'Постоянно улучшаем страницы, чтобы увеличивать количество обращений.'),
        item(ic.cycle, 'Ежемесячное сопровождение', 'Отчёты, рекомендации и развитие проекта.'),
      ].join(''),
      note: noteEl.innerHTML,
      facts: [['Сроки подготовки', 'От 7 дней', 'clock'], ['Старт', 'Отвечаю на заявки в течение дня', 'start']],
    },
  };

  const items = () => listEl.querySelectorAll('.pincl__item');
  const swapPanel = (p) => {
    labelEl.textContent = p.label;
    periodEl.textContent = p.period;
    descEl.textContent = p.desc;
    titleEl.textContent = p.title;
    noteEl.innerHTML = p.note;
    listEl.innerHTML = p.listHTML;
    factsEl.innerHTML = facts(p.facts);
  };

  opts.forEach((opt) => {
    opt.addEventListener('click', () => {
      if (opt.classList.contains('is-active')) return;
      opts.forEach((o) => {
        const on = o === opt;
        o.classList.toggle('is-active', on);
        o.setAttribute('aria-selected', on);
      });
      const p = plans[opt.dataset.plan];

      // цена: быстрый roll — уехала вверх, сменилась, приехала снизу
      gsap.killTweensOf(priceVal);
      gsap.timeline()
        .to(priceVal, { yPercent: -60, opacity: 0, duration: dur(0.18), ease: 'power2.in' })
        .add(() => { priceVal.textContent = p.price; })
        .fromTo(priceVal,
          { yPercent: 60, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: dur(0.25), ease: 'power2.out' });

      // панель: кроссфейд контента + стаггер пунктов
      if (prefersReducedMotion) { swapPanel(p); return; }
      const fade = [descEl, titleEl, noteEl, listEl];
      gsap.killTweensOf(fade);
      gsap.timeline()
        .to(fade, { opacity: 0, duration: dur(0.15), ease: 'power2.in' })
        .add(() => { swapPanel(p); })
        .set(items(), { opacity: 0, x: -12 })
        .to([descEl, titleEl, noteEl, listEl], { opacity: 1, duration: dur(0.22), ease: 'power3.out' })
        .to(items(), { opacity: 1, x: 0, duration: dur(0.4), stagger: 0.05, ease: 'power3.out' }, '<');
    });
  });

  if (prefersReducedMotion) return;

  // scroll-card: тёмная секция наезжает на белую
  gsap.fromTo('#pricing', { scale: 0.9 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: '#pricing', start: 'top bottom', end: 'top top', scrub: true },
  });
  gsap.fromTo('#pricing', { scale: 1 }, {
    scale: 0.9, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#pricing', start: 'bottom bottom', end: 'bottom top', scrub: true },
  });

  // карточки входят y:60→0 + fade
  gsap.fromTo(['.pricing__card', '.pricing__panel'],
    { y: 60, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.pricing__row', start: 'top 78%', once: true },
    });

  // пункты «Что входит в работу»: стаггер слева
  gsap.fromTo('.pincl__item',
    { x: -12, opacity: 0 },
    {
      x: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06,
      scrollTrigger: { trigger: '.pincl', start: 'top 80%', once: true },
    });
}

initPricing();

/* ---------- FAQ: аккордеон ---------- */
function initFaq() {
  const items = gsap.utils.toArray('.faq__item');
  if (!items.length) return;
  let openItem = null;

  // Раскрытие ведёт CSS (grid-template-rows), JS только переключает класс и aria.
  // ScrollTrigger.refresh() пересчитывает ВСЕ триггеры страницы — раньше он вызывался
  // на каждый клик прямо в конце анимации и давал рывок. Теперь — один раз, с отложкой
  // после завершения перехода, и с коалесингом быстрых кликов.
  let refreshTimer;
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 560);
  };

  const setOpen = (item, open) => {
    item.querySelector('.faq__q').setAttribute('aria-expanded', open);
    item.classList.toggle('is-open', open);
    scheduleRefresh();
  };

  items.forEach((item) => {
    item.querySelector('.faq__q').addEventListener('click', () => {
      const isOpen = openItem === item;
      if (openItem) setOpen(openItem, false);
      openItem = isOpen ? null : item;
      if (!isOpen) setOpen(item, true);
    });
  });

  if (prefersReducedMotion) return;

  // scroll-card: белая секция наезжает на тёмный Pricing и уходит под футер
  gsap.fromTo('#faq', { scale: 0.9 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: '#faq', start: 'top bottom', end: 'top top', scrub: true },
  });
  gsap.fromTo('#faq', { scale: 1 }, {
    scale: 0.9, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#faq', start: 'bottom bottom', end: 'bottom top', scrub: true },
  });

  // вход: заголовок, подпись, кнопка, строки
  gsap.fromTo('.faq__h2-word',
    { yPercent: 110 },
    {
      yPercent: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: '.faq__grid', start: 'top 80%', once: true },
    });
  gsap.fromTo(['.faq__sub', '.faq__left .pill'],
    { y: 16, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08,
      scrollTrigger: { trigger: '.faq__grid', start: 'top 80%', once: true },
    });
  gsap.fromTo(items,
    { y: 24, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.06,
      scrollTrigger: { trigger: '.faq__list', start: 'top 82%', once: true },
    });
}

initFaq();

/* ---------- Контакт: чат-форма ---------- */
/* Модалка «Напишите мне». Формы нет намеренно: человек пишет сам в удобный
   мессенджер, а выбор дня и времени складывается в готовый текст — сказать
   про удобное время может только он, отправлять это некуда. На телефоне
   модалка работает как шторка снизу: свайп по шапке её закрывает. */
function initContact() {
  const chat = document.getElementById('chat');
  if (!chat) return;

  const modal = document.getElementById('contact-modal');
  const mDialog = modal.querySelector('.modal__dialog');
  const mBackdrop = modal.querySelector('.modal__backdrop');
  const mClose = document.getElementById('contact-close');
  const daysBox = document.getElementById('c-days');
  const timesBox = document.getElementById('c-times');
  const msgBox = document.getElementById('c-msg');
  const copyBtn = document.getElementById('c-copy');
  const copyLabel = document.getElementById('c-copy-label');
  const emailWay = document.getElementById('c-email');

  const EMAIL = 'dmitrypelenev@gmail.com';
  const SUBJECT = 'Вопрос по проекту — pelenevdesign.ru';
  const MSG_EMPTY = 'Удобно связаться…';   // пока день и время не выбраны — подсказка, а не текст
  const TIME_WHEN = { 'Утро': 'утром', 'День': 'днём', 'Вечер': 'вечером' };
  const isSheet = () => matchMedia('(max-width: 640px)').matches;

  /* Дни считаем от текущей даты, а не списком в коде — вкладка может
     провисеть открытой до завтра. После 17:00 сегодня уже не предлагаем. */
  function callDays() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    const first = now.getHours() < 17 ? 0 : 1;
    const out = [];
    for (let i = first; i < first + 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const date = fmt.format(d);
      const short = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : date;
      out.push({ short, full: i < 2 ? `${short}, ${date}` : date, soon: i < 2 });
    }
    return out;
  }

  let days = [];
  let day = null;
  let time = '';

  /* «завтра вечером», но «вс, 27 сент., вечером» — без даты фраза живее. */
  function whenPhrase() {
    if (day && time) return day.soon ? `${day.short.toLowerCase()} ${TIME_WHEN[time]}` : `${day.full}, ${TIME_WHEN[time]}`;
    if (day) return day.soon ? day.short.toLowerCase() : day.full;
    if (time) return TIME_WHEN[time];
    return '';
  }
  const message = () => {
    const when = whenPhrase();
    return when ? `Удобно связаться ${when}.` : '';
  };
  function syncMessage(animate) {
    const text = message();
    /* Без выбора копировать нечего: показываем подсказку и гасим кнопку,
       иначе в буфер уехало бы многоточие. */
    msgBox.textContent = text || MSG_EMPTY;
    msgBox.classList.toggle('is-placeholder', !text);
    copyBtn.disabled = !text;
    /* В письме тему и текст можно подставить сразу — в мессенджерах нельзя,
       поэтому там и нужна кнопка «Скопировать». */
    emailWay.setAttribute('href', `mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}`
      + (text ? `&body=${encodeURIComponent(text)}` : ''));
    /* Текст меняется от нажатия «таблетки» — без подхвата подмена выглядит
       как глюк: строка молча стала другой. */
    if (animate && !prefersReducedMotion) {
      gsap.fromTo(msgBox, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'transform,opacity' });
    }
  }

  const pickOne = (group, el) => {
    group.querySelectorAll('.chat__opt').forEach((b) => b.classList.toggle('is-selected', b === el));
  };
  function renderDays() {
    day = null;
    days = callDays();
    daysBox.innerHTML = '';
    days.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__opt chat__opt--chip';
      b.textContent = d.short;
      b.addEventListener('click', () => { day = days[i]; pickOne(daysBox, b); syncMessage(true); });
      daysBox.appendChild(b);
    });
  }
  timesBox.querySelectorAll('[data-time]').forEach((b) => {
    b.addEventListener('click', () => { time = b.dataset.time; pickOne(timesBox, b); syncMessage(true); });
  });

  /* Копирование: clipboard API есть не везде (http, старые webview) —
     на отказ подставляем скрытое поле и старый execCommand. */
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return legacyCopy(text); }
  }
  /* Подпись кнопки на пару секунд меняется на результат и возвращается назад. */
  function flash(el, text, back, cls) {
    clearTimeout(el._flash);
    el.textContent = text;
    if (cls) cls.el.classList.toggle('is-done', cls.on);
    el._flash = setTimeout(() => {
      el.textContent = back;
      if (cls) cls.el.classList.remove('is-done');
    }, 2200);
  }

  copyBtn.addEventListener('click', async () => {
    const text = message();
    if (!text) return;
    const ok = await copyText(text);
    if (ok && !prefersReducedMotion) gsap.fromTo(copyBtn, { scale: 0.94 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
    flash(copyLabel, ok ? 'Скопировано' : 'Не вышло — выделите текст', 'Скопировать', { el: copyBtn, on: ok });
  });

  /* MAX: ссылки на диалог по номеру у мессенджера нет (аналога wa.me), а
     профильная ссылка выдаётся только внутри приложения. Поэтому строка
     копирует номер — по нему меня находят поиском в самом MAX. */
  const maxBtn = document.getElementById('c-max');
  const maxNote = document.getElementById('c-max-note');
  if (maxBtn) {
    const MAX_NOTE = maxNote.textContent;
    maxBtn.addEventListener('click', async () => {
      const ok = await copyText(maxBtn.dataset.phone);
      flash(maxNote, ok ? 'Номер скопирован — найдите меня в MAX' : 'Не вышло — скопируйте номер вручную', MAX_NOTE, { el: maxBtn, on: ok });
    });
  }

  /* Клики по каналам считаем отдельно — иначе не видно, чем реально пользуются. */
  chat.querySelectorAll('[data-way]').forEach((a) => {
    a.addEventListener('click', () => ym(111032105, 'reachGoal', 'messenger_click'));
  });

  // Клавиатура на телефоне меняет видимую высоту окна — модалка считает её отсюда.
  const viewport = window.visualViewport;
  const syncVisualViewport = () => {
    document.documentElement.style.setProperty('--vvh', `${Math.round(viewport ? viewport.height : window.innerHeight)}px`);
    document.documentElement.style.setProperty('--vv-top', `${Math.round(viewport ? viewport.offsetTop : 0)}px`);
  };
  syncVisualViewport();
  (viewport || window).addEventListener('resize', syncVisualViewport, { passive: true });
  if (viewport) viewport.addEventListener('scroll', syncVisualViewport, { passive: true });

  let modalOpen = false;

  function openModal() {
    if (modalOpen) return;
    modalOpen = true;
    modal.setAttribute('aria-hidden', 'false');
    lenis.stop();
    renderDays();
    time = '';
    timesBox.querySelectorAll('.chat__opt').forEach((b) => b.classList.remove('is-selected'));
    syncMessage();
    gsap.killTweensOf([mBackdrop, mDialog]);
    gsap.set(mDialog, { clearProps: 'y,yPercent' });
    if (prefersReducedMotion) {
      gsap.set(mBackdrop, { opacity: 1 });
      gsap.set(mDialog, { opacity: 1, y: 0, yPercent: 0 });
      return;
    }
    gsap.fromTo(mBackdrop, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    if (isSheet()) {
      // Шторка выезжает снизу, без размытия: так двигаются панели в приложениях.
      gsap.fromTo(mDialog, { yPercent: 100, opacity: 1 }, { yPercent: 0, duration: 0.5, ease: 'power3.out' });
    } else {
      gsap.fromTo(mDialog, { y: 60, opacity: 0, filter: 'blur(14px)' },
        { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', onComplete: () => gsap.set(mDialog, { clearProps: 'filter' }) });
      /* Содержимое всплывает по очереди: на десктопе окно большое, и разом
         проявившийся блок читается как статичная картинка. */
      const items = chat.querySelectorAll('.chat__head, .chat__way, .chat__or, .chat__when, .chat__msgbox');
      gsap.fromTo(items, { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power3.out', delay: 0.1, clearProps: 'transform,opacity' });
    }
  }

  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false;
    lenis.start();
    const done = () => { modal.setAttribute('aria-hidden', 'true'); gsap.set(mDialog, { clearProps: 'y,yPercent' }); };
    if (prefersReducedMotion) { gsap.set([mBackdrop, mDialog], { opacity: 0 }); done(); return; }
    gsap.killTweensOf([mBackdrop, mDialog]);
    gsap.to(mBackdrop, { opacity: 0, duration: 0.3, ease: 'power2.in' });
    if (isSheet()) gsap.to(mDialog, { yPercent: 100, duration: 0.35, ease: 'power2.in', onComplete: done });
    else gsap.to(mDialog, { y: 40, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: done });
  }

  /* Свайп вниз закрывает шторку — привычный жест. Тянем за «ручку» всегда,
     а за заголовок только когда содержимое не прокручено: иначе жест
     перехватывал бы обычный скролл списка. */
  const chatBody = chat.querySelector('.chat__body');
  const grip = [chat.querySelector('.chat__grab'), chat.querySelector('.chat__head')].filter(Boolean);
  let dragging = false;
  let startY = 0;
  let dragY = 0;
  grip.forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (!isSheet() || e.pointerType === 'mouse' || !modalOpen) return;
      if (el !== grip[0] && chatBody && chatBody.scrollTop > 0) return;
      dragging = true; startY = e.clientY; dragY = 0;
      gsap.killTweensOf(mDialog);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* не поддержано */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dragY = Math.max(0, e.clientY - startY);
      gsap.set(mDialog, { y: dragY });
      gsap.set(mBackdrop, { opacity: Math.max(0, 1 - dragY / 420) });
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (dragY > 110) { closeModal(); dragY = 0; return; }
      gsap.to(mDialog, { y: 0, duration: 0.35, ease: 'power3.out' });
      gsap.to(mBackdrop, { opacity: 1, duration: 0.25 });
      dragY = 0;
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  });

  document.querySelectorAll('[data-contact]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      ym(111032105, 'reachGoal', 'concept_click');
      if (typeof menuOpen !== 'undefined' && menuOpen) { closeMenu(); gsap.delayedCall(prefersReducedMotion ? 0 : 0.35, openModal); }
      else openModal();
    });
  });
  mClose.addEventListener('click', closeModal);
  mBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOpen) closeModal(); });
  if (!prefersReducedMotion) {
    mClose.addEventListener('pointerenter', () => gsap.to(mClose, { scale: 1.1, duration: 0.3, ease: 'power3.out' }));
    mClose.addEventListener('pointerleave', () => gsap.to(mClose, { scale: 1, duration: 0.35, ease: 'power3.out' }));
  }

  // авто-открытие при переходе с work.html (ссылка index.html#write)
  if (location.hash === '#write') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    gsap.delayedCall(prefersReducedMotion ? 0 : 0.35, openModal);
  }
}

initContact();

/* ---------- Footer: marquee + гигант ---------- */
function initFooter() {
  const zone = document.getElementById('footer-line');
  if (!zone) return;
  // звуковая волна: настройка и статичная отрисовка (нужна и при reduced motion)
  const path = zone.querySelector('path');
  const SEGMENTS = 110;
  const IDLE_AMP = 3;
  const HOVER_AMP = 26;
  const wave = { energy: 0, mx: 0.5 }; // energy 0..1, mx — позиция курсора в долях ширины
  let mid = 40;
  let phase = 0;

  const render = () => {
    const w = zone.offsetWidth;
    let d = `M 0 ${mid.toFixed(1)}`;
    for (let i = 1; i <= SEGMENTS; i++) {
      const x = i / SEGMENTS;
      const falloff = Math.exp(-((x - wave.mx) ** 2) / 0.018); // всплеск вокруг курсора
      const amp = IDLE_AMP + HOVER_AMP * wave.energy * falloff;
      const y = mid
        + Math.sin(x * 16 + phase * 2.4) * amp * (0.55 + 0.45 * Math.sin(x * 5.7 + phase * 1.4));
      d += ` L ${(x * w).toFixed(1)} ${y.toFixed(2)}`;
    }
    path.setAttribute('d', d);
  };

  const setSize = () => {
    mid = zone.offsetHeight / 2;
    zone.querySelector('svg').setAttribute('viewBox', `0 0 ${zone.offsetWidth} ${zone.offsetHeight}`);
    render();
  };
  window.addEventListener('resize', setSize);
  setSize();

  if (prefersReducedMotion) return; // статичная волна, без анимаций

  // бесконечная лента: 4 одинаковых куска, сдвиг на половину трека
  const marquee = gsap.to('.footer__track', {
    xPercent: -50,
    duration: 22,
    ease: 'none',
    repeat: -1,
  });

  // скорость/направление ленты реагируют на скролл Lenis
  lenis.on('scroll', (e) => {
    const ts = gsap.utils.clamp(-3, 4, 1 + e.velocity / 25);
    gsap.to(marquee, { timeScale: ts, duration: 0.4, overwrite: true, ease: 'power2.out' });
  });

  // вход колонок меню
  gsap.fromTo('.footer__col, .footer__chat',
    { y: 30, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: '.footer__menu', start: 'top 80%', once: true },
    });

  // гигант: подъём из-под маски по входу футера
  gsap.fromTo('.footer__giant-word',
    { yPercent: 110 },
    {
      yPercent: 0, duration: 1.1, ease: 'power4.out',
      scrollTrigger: { trigger: '#footer', start: 'top 65%', once: true },
    });

  // волна оживает: фоновое колыхание + реакция на курсор
  gsap.ticker.add((time) => {
    phase = time;
    render();
  });

  zone.addEventListener('mousemove', (e) => {
    const r = zone.getBoundingClientRect();
    wave.mx = (e.clientX - r.left) / r.width;
    const swing = gsap.utils.clamp(0.5, 1, Math.abs(e.clientY - r.top - mid) / mid + 0.5);
    gsap.to(wave, { energy: swing, duration: 0.3, ease: 'power2.out', overwrite: true });
  });

  zone.addEventListener('mouseleave', () => {
    gsap.to(wave, { energy: 0, duration: 1.6, ease: 'elastic.out(1, .3)', overwrite: true });
  });
}

initFooter();

/* ---------- Топбар: цвет по секции под ним ---------- */
function initTopbarContrast() {
  if (!topbar) return;
  // светлые поверхности: белые секции главной + белые карточки кейсов
  const lights = gsap.utils.toArray('#intro, #services, #about, #faq, .pcard');
  const line = topbar.offsetHeight / 2; // середина топбара

  topbarLightTriggers = lights.map((el) => ScrollTrigger.create({
    trigger: el,
    start: `top ${line}px`,
    end: `bottom ${line}px`,
    onToggle: updateTopbarContrast,
  }));

  updateTopbarContrast();
}

initTopbarContrast();

/* ---------- Видео-фоны ---------- */
function initVideos() {
  if (prefersReducedMotion) return;
  /* Видео нужны и на телефоне: Safari воспроизводит их только при muted +
     playsinline, оба свойства дополнительно задаём перед загрузкой source. */

  const load = (v) => {
    if (v.dataset.loaded) return;
    v.dataset.loaded = '1';
    v.muted = true;
    v.defaultMuted = true;
    v.autoplay = true;
    v.playsInline = true;
    const s = document.createElement('source');
    s.src = v.dataset.video;
    s.type = 'video/mp4';
    v.appendChild(s);
    v.load();
    const play = () => v.play().catch(() => {});
    v.addEventListener('canplay', play, { once: true });
    play();
  };
  document.querySelectorAll('video[data-video]').forEach(load);
}

initVideos();

/* ---------- Кинематографичный видеофон страницы кейсов ---------- */
function initSiteBg() {
  const layer = document.querySelector('.sitebg__layer');
  if (!layer) return;                       // страницы без видеофона — тихо выходим
  const video = layer.querySelector('video');
  const vignette = document.querySelector('.sitebg__vignette');

  // Бесшовный цикл: перематываем чуть раньше нуля, чтобы не поймать пустой кадр.
  if (video) {
    video.addEventListener('timeupdate', () => {
      if (video.duration && video.currentTime > video.duration - 0.06) video.currentTime = 0.02;
    });
  }

  if (prefersReducedMotion) { layer.style.opacity = '1'; layer.style.transform = 'none'; return; }

  const SCALE_FROM = 1.18, SCALE_TO = 1.12, INTRO = 1800;
  const FLOAT_X = 8, FLOAT_Y = 5, ROT_Z = .3, ROT_X = .5;
  const PARALLAX = 10, LERP = .055;
  // approx cubic-bezier(.22,1,.36,1) — «дорогое» замедление в конце, как на страницах Apple
  const ease = (t) => 1 - Math.pow(1 - t, 5);

  let start = 0, frame = 0;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  // короткий кинематографичный толчок фона — дёргается доком при смене категории
  let impulse = 0;
  window.__siteBgImpulse = () => { impulse = 1; };

  const pointerFine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (pointerFine) {
    window.addEventListener('pointermove', (e) => {
      targetX = ((e.clientX / window.innerWidth) * 2 - 1) * PARALLAX;
      targetY = ((e.clientY / window.innerHeight) * 2 - 1) * (PARALLAX * .6);
    }, { passive: true });
  }

  const render = (now) => {
    frame = requestAnimationFrame(render);
    if (!start) start = now;
    const elapsed = now - start;

    const intro = ease(Math.min(elapsed / INTRO, 1));
    const scale = SCALE_FROM + (SCALE_TO - SCALE_FROM) * intro;

    // синусы с несовпадающими периодами (37/48/70/57 с) — движение не читается как цикл
    const fx = Math.sin(elapsed * 0.00017) * FLOAT_X;
    const fy = Math.sin(elapsed * 0.00013 + 1.7) * FLOAT_Y;
    const rz = Math.sin(elapsed * 0.00009 + 0.6) * ROT_Z;
    const rx = Math.sin(elapsed * 0.00011 + 2.4) * ROT_X;

    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;
    impulse *= 0.94;                                   // затухает примерно за 700 мс

    layer.style.opacity = intro;
    layer.style.transform =
      `translate3d(${(fx + currentX).toFixed(2)}px, ${(fy + currentY - impulse * 14).toFixed(2)}px, 0) ` +
      `rotateX(${rx.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${(scale + impulse * 0.012).toFixed(4)})`;

    if (vignette) vignette.style.opacity = (0.14 + Math.sin(elapsed * 0.000349) * 0.02).toFixed(3);
  };

  const play = () => { if (!frame) frame = requestAnimationFrame(render); };
  const pause = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };

  // фон закреплён и виден всегда — тормозим цикл только на скрытой вкладке
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  play();
}

initSiteBg();

/* ---------- Плавающий док категорий (work.html) ---------- */
function initDock() {
  const dock = document.querySelector('.dock');
  if (!dock) return;                                  // страницы без дока — тихо выходим
  const shell = dock.querySelector('.dock__shell');
  const inner = dock.querySelector('.dock__inner');
  const list = dock.querySelector('.wtabs');
  const pill = dock.querySelector('.dock__pill');
  const tabs = () => [...list.querySelectorAll('.wtab')];

  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const MAGNET_RANGE = 120, MAGNET_MAX = 5;           // притяжение к курсору
  const SHOW_AFTER = 260;                             // ниже этого скролла дока нет

  // Док ужимается целиком, если не влезает в экран: так все категории видны
  // на любой ширине без горизонтальной прокрутки.
  const applyFit = () => {
    dock.style.setProperty('--dock-fit', '1');
    const natural = inner.getBoundingClientRect().width;
    const available = window.innerWidth - 24;
    dock.style.setProperty('--dock-fit', natural > available ? (available / natural).toFixed(4) : '1');
  };

  // Табы продублированы в шапке и в доке — держим их состояние согласованным.
  const syncTabs = (cat) => {
    if (!cat) return;                                 // в навигационном доке категорий нет
    document.querySelectorAll('.wtab').forEach((tab) => {
      const on = tab.dataset.cat === cat;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
  };
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.wtab');
    if (tab) syncTabs(tab.dataset.cat);
  });

  /* Навигационный вариант дока (главная): пункты меню + подсветка текущей секции. */
  if (dock.classList.contains('dock--nav')) {
    const links = [...list.querySelectorAll('.wtab')];
    const sections = links
      .map((link) => ({ link, el: link.dataset.section ? document.getElementById(link.dataset.section) : null }))
      .filter((item) => item.el);

    list.addEventListener('click', (e) => {
      const link = e.target.closest('.wtab');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      const target = href.startsWith('#') && href.length > 1 ? document.querySelector(href) : null;
      if (!target) return;                            // «Кейсы» ведут на другую страницу — не мешаем
      e.preventDefault();
      links.forEach((item) => item.classList.toggle('is-active', item === link));
      // «Главная» — это первая секция: у неё скролл-эффекты сдвигают геометрию,
      // поэтому едем к нулю страницы, а не к вычисленной позиции элемента.
      const to = target === document.querySelector('main > section') ? 0 : target;
      lenis.scrollTo(to, { offset: 0, duration: 1.1, force: true });
    });

    // подсветка по скроллу: активна последняя секция, верх которой прошёл 40% экрана
    const spy = () => {
      let current = sections[0];
      sections.forEach((item) => { if (item.el.getBoundingClientRect().top <= window.innerHeight * .4) current = item; });
      if (current && !current.link.classList.contains('is-active')) {
        links.forEach((item) => item.classList.toggle('is-active', item === current.link));
      }
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // Пилюля не анимируется через width→layout соседей: она вне потока внутри .wtabs.
  const movePill = (animate = true) => {
    const active = list.querySelector('.wtab.is-active') || tabs()[0];
    if (!active) { pill.style.opacity = '0'; return; }
    pill.style.transition = animate ? `transform .4s ${EASE}, width .4s ${EASE}, opacity .3s ease` : 'none';
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translate3d(${active.offsetLeft}px, 0, 0)`;
    pill.style.opacity = '1';
    if (!animate) requestAnimationFrame(() => { pill.style.transition = `transform .4s ${EASE}, width .4s ${EASE}, opacity .3s ease`; });
  };

  // Кто переключает категорию — не наше дело (initProjects и portfolio.js делают это сами),
  // поэтому просто следим за классом is-active и за добавлением вкладки «Все».
  // Сравнение с предыдущей активной кнопкой обязательно: rAF дёргает класс is-hovered,
  // и без этой проверки movePill() читал бы offsetWidth каждый кадр — форсированный layout.
  let lastActive = null;
  new MutationObserver(() => {
    const active = list.querySelector('.wtab.is-active');
    if (active === lastActive) return;
    lastActive = active;
    movePill();
  }).observe(list, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
  // «Все» добавляется в док позже (portfolio.js) — пересчитываем и вписывание, и пилюлю
  new MutationObserver(() => { applyFit(); movePill(false); }).observe(list, { childList: true });
  window.addEventListener('resize', () => { applyFit(); movePill(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { applyFit(); movePill(false); });
  applyFit();
  movePill(false);

  // Мягкий вход контента при смене категории: сначала прячем, затем отпускаем.
  list.addEventListener('click', (e) => {
    const tab = e.target.closest('.wtab');
    if (!tab || tab.classList.contains('is-active')) return;
    if (prefersReducedMotion) return;
    if (window.__siteBgImpulse) window.__siteBgImpulse();          // микро-параллакс фона
    const projects = [...document.querySelectorAll('#projects > .project')];
    projects.forEach((p) => p.classList.add('is-entering'));
    requestAnimationFrame(() => requestAnimationFrame(() => projects.forEach((p) => p.classList.remove('is-entering'))));
  }, true);

  // Видимость дока: появляется после короткой прокрутки и уходит у футера.
  let visTarget = 0;
  const updateVisibility = () => {
    const footer = document.getElementById('footer');
    const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
    visTarget = window.scrollY > SHOW_AFTER && footerTop > window.innerHeight * .75 ? 1 : 0;
  };
  window.addEventListener('scroll', updateVisibility, { passive: true });
  window.addEventListener('resize', updateVisibility);
  updateVisibility();

  if (prefersReducedMotion) {
    const applyStatic = () => {
      shell.style.opacity = String(visTarget);
      shell.style.transform = 'none';
      dock.style.pointerEvents = visTarget ? '' : 'none';
    };
    window.addEventListener('scroll', applyStatic, { passive: true });
    applyStatic();
    return;
  }

  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  let frame = 0, vis = 0;
  let magnetX = 0, magnetY = 0, magnetTargetX = 0, magnetTargetY = 0;
  let hoveredTab = null, pointerX = null;

  if (fine) {
    window.addEventListener('pointermove', (e) => {
      pointerX = e.clientX;
      const r = dock.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      // расстояние до прямоугольника дока, а не до центра — иначе широкий док «не ловит» курсор
      const gapX = Math.max(0, Math.abs(dx) - r.width / 2);
      const gapY = Math.max(0, Math.abs(dy) - r.height / 2);
      const distance = Math.hypot(gapX, gapY);
      const pull = distance > MAGNET_RANGE ? 0 : (1 - distance / MAGNET_RANGE) * MAGNET_MAX;
      const norm = Math.hypot(dx, dy) || 1;
      magnetTargetX = (dx / norm) * pull;
      magnetTargetY = (dy / norm) * pull;
    }, { passive: true });

    list.addEventListener('pointerleave', () => { hoveredTab = null; pointerX = null; });
    list.addEventListener('pointermove', (e) => { hoveredTab = e.target.closest('.wtab'); });
    inner.addEventListener('pointerenter', () => inner.classList.add('is-hovered'));
    inner.addEventListener('pointerleave', () => inner.classList.remove('is-hovered'));
  }

  const render = () => {
    frame = requestAnimationFrame(render);

    vis += (visTarget - vis) * .09;                    // ~500 мс на появление/уход
    magnetX += (magnetTargetX - magnetX) * .08;
    magnetY += (magnetTargetY - magnetY) * .08;

    const y = (1 - vis) * 40 + magnetY;
    const scale = .95 + .05 * vis;
    shell.style.opacity = vis.toFixed(3);
    shell.style.transform = `translate3d(${magnetX.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    dock.style.pointerEvents = vis > .5 ? '' : 'none';

    // магнификация по расстоянию от курсора до центра кнопки
    if (fine) {
      tabs().forEach((tab) => {
        let s = 1, ty = 0;
        if (pointerX !== null) {
          const r = tab.getBoundingClientRect();
          const d = Math.abs(pointerX - (r.left + r.width / 2));
          // радиус подобран так, чтобы соседняя кнопка попадала примерно на 1.05
          const falloff = Math.max(0, 1 - d / 260);
          s = 1 + .12 * Math.pow(falloff, 1.3);
          ty = tab === hoveredTab ? -3 : 0;
        }
        tab.style.transform = `translate3d(0, ${ty}px, 0) scale(${s.toFixed(4)})`;
        const hot = tab === hoveredTab;
        if (tab.classList.contains('is-hovered') !== hot) tab.classList.toggle('is-hovered', hot);
      });
    }
  };

  const play = () => { if (!frame) frame = requestAnimationFrame(render); };
  const pause = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  play();
}

initDock();

/* год в правовой строке футера */
document.querySelectorAll('.footer__year').forEach((el) => { el.textContent = new Date().getFullYear(); });

/* ---------- Reveal-хелпер (заполняется в следующих фазах) ---------- */

/* ---------- Переход по якорю с других страниц ----------
   Выше стоит scrollRestoration='manual' + scrollTo(0,0) (без них ScrollTrigger
   3.12.5 падает при перезагрузке из середины страницы), и они же гасят нативный
   переход по хэшу. Поэтому ссылки вида /#services со страниц кейса и гайдов
   доводим до секции вручную — после load, когда позиции уже посчитаны. */
function initHashJump() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || id === 'write') return; // #write открывает модалку, им занимается initContact
  const target = document.getElementById(id);
  if (!target) return;
  const go = () => lenis.scrollTo(target, { force: true, immediate: prefersReducedMotion });
  if (document.readyState === 'complete') gsap.delayedCall(0.15, go);
  else window.addEventListener('load', () => gsap.delayedCall(0.15, go));
}

initHashJump();

/* ---------- Метрика: клик по любой ссылке на Telegram ---------- */
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="t.me/dmitrypelenev"]');
  if (link) ym(111032105, 'reachGoal', 'tg_click');
});
