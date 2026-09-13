/* Лид-магнит: виджет в углу → пошаговый сценарий → заявка.
   Разметку строит скрипт, поэтому на страницу добавляются только
   подключения css/js — дублировать HTML по шаблонам не нужно.
   Ничего не редактируется через CMS: тексты живут здесь. */
(() => {
  'use strict';

  const KEY = 'pd-leadmagnet';               // 'closed' | 'sent' — на текущую сессию
  const DELAY = 7000;                        // 6–8 с после первого просмотра
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seen = () => { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } };
  const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch (e) { /* приватный режим */ } };
  if (seen()) return;

  /* Страницы, где виджет только мешает: там человек уже пишет заявку. */
  if (document.body.classList.contains('page-admin')) return;

  /* Стили подключаем скриптом, а не <link> в <head>: тот блокировал первый
     рендер страницы ради виджета, который всплывает лишь через 7 секунд.
     К моменту показа файл давно загружен. */
  if (!document.querySelector('link[data-lm-css]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/leadmagnet.css?v=19';
    css.dataset.lmCss = '';
    document.head.appendChild(css);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Компактная карточка пункта: номер + название + пояснение. Картинок нет
     намеренно — раньше сценарий тянул семь иконок ради двух экранов. */
  const li = (n, t, d) => `<li class="lm__card">
      <span class="lm__card-num">${esc(n)}</span>
      <span class="lm__card-title">${esc(t)}</span>
      <span class="lm__card-text">${esc(d)}</span>
    </li>`;

  const ARROW = '<svg class="lm__arrow" viewBox="0 0 18 12" width="18" height="12" fill="none" aria-hidden="true"><path d="M1 6h15m0 0-5-4.5M16 6l-5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- Виджет ---------- */
  const card = document.createElement('aside');
  card.className = 'lm-card';
  card.setAttribute('role', 'complementary');
  card.setAttribute('aria-label', 'Бесплатная концепция сайта');
  card.innerHTML = `
    <button type="button" class="lm-card__close" data-lm-dismiss aria-label="Закрыть">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <p class="lm-card__title"><span class="lm-card__mark" aria-hidden="true"></span>Бесплатная концепция сайта</p>
    <p class="lm-card__text">Хотите посмотреть, каким может быть ваш сайт? Подготовлю первый экран и покажу своё видение проекта.</p>
    <button type="button" class="lm-card__cta" data-lm-open>Получить концепцию ${ARROW}</button>`;

  /* ---------- Сценарий ---------- */
  const modal = document.createElement('div');
  modal.className = 'lm';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Концепция вашего будущего сайта');
  modal.innerHTML = `
    <div class="lm__bd" data-lm-close></div>
    <div class="lm__dialog" tabindex="-1">
      <div class="lm__head">
        <p class="lm__count" data-lm-count><b>01</b><span>/ 04</span></p>
        <span class="lm__track" aria-hidden="true"><span class="lm__bar" data-lm-bar></span></span>
        <button type="button" class="lm__close" data-lm-close aria-label="Закрыть">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>

      <div class="lm__body" data-lenis-prevent>
        <section class="lm__step" data-step="0">
          <h2 class="lm__title">Концепция вашего будущего сайта</h2>
          <p class="lm__text">Перед началом работы я подготовлю 1–2 варианта первого экрана специально под ваш проект.</p>
          <p class="lm__text">Так вы сможете заранее увидеть моё видение и понять, в каком направлении можно развивать сайт.</p>
          <div class="lm__actions"><button type="button" class="lm__btn lm__btn--primary" data-lm-next>Посмотреть, что получите ${ARROW}</button></div>
        </section>

        <section class="lm__step" data-step="1" hidden>
          <h2 class="lm__title">Что вы получите</h2>
          <ul class="lm__cards lm__cards--4">
            ${[['01', 'Первый экран', '1–2 варианта будущего сайта'],
               ['02', 'Структура', 'Как можно выстроить информацию на странице'],
               ['03', 'Визуал', 'Стиль и направление дизайна'],
               ['04', 'Рекомендации', 'Несколько идей для дальнейшей работы']].map((a) => li(...a)).join('')}
          </ul>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button>
            <button type="button" class="lm__btn lm__btn--primary" data-lm-next>Понятно, продолжаем ${ARROW}</button>
          </div>
        </section>

        <section class="lm__step" data-step="2" hidden>
          <h2 class="lm__title">Что потребуется от вас</h2>
          <ul class="lm__cards lm__cards--3">
            ${[['01', '15–20 минут', 'Короткое интервью'],
               ['02', 'Бриф', 'Несколько вопросов о проекте'],
               ['03', 'Ваш проект', 'Немного информации о задаче']].map((a) => li(...a)).join('')}
          </ul>
          <p class="lm__note">Я готовлю каждую концепцию индивидуально, поэтому сначала мне важно немного узнать о вашем проекте.</p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button>
            <button type="button" class="lm__btn lm__btn--primary" data-lm-next>Оставить заявку ${ARROW}</button>
          </div>
        </section>

        <section class="lm__step" data-step="3" hidden>
          <h2 class="lm__title">Оставьте заявку</h2>
          <form class="lm__form" novalidate>
            <div class="lm__row">
              <label class="lm__field"><span class="lm__label">Имя <em class="lm__opt">— по желанию</em></span><input class="lm__input" name="name" autocomplete="name"></label>
              <label class="lm__field"><span class="lm__label">Телефон <em class="lm__req">— обязательно</em></span><input class="lm__input" type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="+7 900 000-00-00" required aria-describedby="lm-err"></label>
            </div>
            <label class="lm__field"><span class="lm__label">Расскажите немного о проекте <em class="lm__opt">— по желанию</em></span><textarea class="lm__area" name="message" rows="3"></textarea></label>
            <input class="lm__trap" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
            <label class="lm__consent">
              <input type="checkbox" name="consent" required>
              <span class="lm__consent-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2 4.6 9 10 3.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              <!-- в «политикой конфиденциальности» намеренно обычный пробел:
                   неразрывный делает кусок в 28 символов, он не влезает в
                   строку узкой модалки и уезжает целиком, оставляя «с» висеть -->
              <span class="lm__consent-text">Соглашаюсь с <a href="/privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a> и обработкой персональных данных</span>
            </label>
            <div class="lm__actions">
              <button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button>
              <button type="submit" class="lm__btn lm__btn--primary" data-lm-submit>Получить концепцию</button>
            </div>
            <p class="lm__error" id="lm-err" data-lm-error role="alert" hidden></p>
          </form>
        </section>

        <section class="lm__step lm__done" data-step="4" hidden>
          <span class="lm__ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h2 class="lm__title">Спасибо! Заявка отправлена.</h2>
          <p class="lm__text">Я свяжусь с вами, чтобы немного обсудить проект.</p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--ghost" data-lm-close>Вернуться на сайт</button>
            <a class="lm__btn lm__btn--primary" href="/work.php">Посмотреть кейсы</a>
          </div>
        </section>
      </div>
    </div>`;

  /* ---------- Типографика ----------
     Короткие предлоги и союзы не должны висеть в конце строки, тире не
     отрывается от предыдущего слова, число не отрывается от единицы.
     Правим текстовые узлы уже собранной разметки — тогда правило само
     распространяется на любые будущие тексты, руками &nbsp; ставить не нужно. */
  const NB = '\u00A0'; /* явный escape: голый U+00A0 в коде не виден и легко теряется */
  /* Слова в 1–2 буквы в русском почти всегда служебные — клеим их скопом.
     Трёхбуквенные перечисляем поимённо: склеивать любое слово в три буквы
     нельзя, иначе «дом», «сад» и прочие существительные тоже прилипнут. */
  const GLUE3 = 'для|под|над|при|без|про|как|что|чем|или|ещё|уже';
  const typo = (s) => s
    .replace(/(^|[\s(«„"])([А-Яа-яЁё]{1,2})[ \t]+/g, `$1$2${NB}`)
    .replace(new RegExp(`(^|[\\s(«„"])(${GLUE3})[ \\t]+`, 'gi'), `$1$2${NB}`)
    .replace(/(\d[\d–—-]*)[ \t]+/g, `$1${NB}`)
    .replace(/[ \t]+([–—])/g, `${NB}$1`);

  const applyTypo = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const fixed = typo(n.nodeValue);
      if (fixed !== n.nodeValue) n.nodeValue = fixed;
    });
  };

  applyTypo(card);
  applyTypo(modal);

  /* В DOM ничего не кладём заранее. Виджет попадает туда в show(), модалка —
     в openModal(). Иначе поисковик видит на каждой странице пять посторонних
     <h2> из сценария и семь картинок, к содержанию страницы не относящихся. */

  const steps = [...modal.querySelectorAll('.lm__step')];
  const FORM_STEPS = steps.length - 1;          // последний экран — подтверждение, в прогрессе не участвует
  const countBox = modal.querySelector('[data-lm-count]');
  const bar = modal.querySelector('[data-lm-bar]');
  const form = modal.querySelector('.lm__form');
  const errorBox = modal.querySelector('[data-lm-error]');
  let current = 0;
  let lastFocus = null;
  let sending = false;

  /* Появление содержимого шага: элементы всплывают по очереди. */
  const revealStep = (el) => {
    if (reduce) return;
    const items = [...el.children];
    items.forEach((node, i) => {
      node.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, delay: i * 70, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
      );
    });
  };

  const go = (index) => {
    if (index < 0 || index >= steps.length) return;
    steps[current].hidden = true;
    current = index;
    steps[current].hidden = false;
    const done = current >= FORM_STEPS;
    countBox.hidden = done;
    if (!done) countBox.firstElementChild.textContent = String(current + 1).padStart(2, '0');
    bar.style.width = ((done ? FORM_STEPS : current + 1) / FORM_STEPS * 100) + '%';
    modal.querySelector('.lm__body').scrollTop = 0;
    revealStep(steps[current]);
    /* Фокус уводим на сам диалог, а не на первый элемент шага: скринридер
       объявляет окно, Tab дальше идёт внутри ловушки фокуса, а на телефоне
       не выскакивает клавиатура, закрывающая половину экрана. */
    modal.querySelector('.lm__dialog').focus({ preventScroll: true });
  };

  /* ---------- Открытие и закрытие ---------- */
  const lockScroll = (on) => {
    document.documentElement.style.overflow = on ? 'hidden' : '';
    /* Lenis перехватывает колесо — на время диалога его останавливаем. */
    if (window.lenis && typeof window.lenis.stop === 'function') on ? window.lenis.stop() : window.lenis.start();
  };

  const openModal = () => {
    lastFocus = document.activeElement;
    hideCard();
    if (!modal.isConnected) document.body.appendChild(modal);
    modal.hidden = false;
    lockScroll(true);
    /* Принудительный reflow фиксирует закрытое состояние, после чего класс
       запускает переход. Через rAF нельзя: в неактивной вкладке кадр может
       не наступить, и диалог останется с opacity: 0. */
    void modal.offsetWidth;
    modal.classList.add('is-open');
    go(0);
    document.addEventListener('keydown', onKey);
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    lockScroll(false);
    const done = current === steps.length - 1;
    setTimeout(() => { modal.hidden = true; }, reduce ? 0 : 420);
    remember(done ? 'sent' : 'closed');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    /* Фокус не должен уходить за пределы диалога. */
    /* Ловушку-приманку и всё с tabindex="-1" в обход не берём. */
    const nodes = [...modal.querySelectorAll('button, a[href], input, textarea')]
      .filter((n) => !n.disabled && n.offsetParent !== null && n.tabIndex >= 0);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const hideCard = () => { card.classList.remove('is-in'); card.classList.add('is-out'); };
  const dismiss = () => { hideCard(); remember('closed'); setTimeout(() => card.remove(), reduce ? 0 : 500); };

  /* ---------- Отправка ---------- */
  const send = async (e) => {
    e.preventDefault();
    if (sending) return;                       // страховка от двойного клика/двойного submit
    const btn = form.querySelector('[data-lm-submit]');
    const val = (n) => form.querySelector(`[name="${n}"]`).value.trim();

    /* Обязателен только телефон — имя и описание проекта по желанию. */
    form.querySelectorAll('.is-bad').forEach((n) => n.classList.remove('is-bad'));
    const phone = val('phone');
    const digits = phone.replace(/\D/g, '');
    /* Пропускаем только то, что похоже на реальный номер: 10–15 цифр и никаких
       посторонних символов, кроме принятых в записи номера. */
    const phoneOk = /^\+?[\d\s()\-]{10,25}$/.test(phone) && digits.length >= 10 && digits.length <= 15;
    if (!phoneOk) {
      const input = form.querySelector('[name="phone"]');
      input.classList.add('is-bad');
      errorBox.textContent = phone ? 'Проверьте номер телефона.' : 'Укажите номер телефона — по нему свяжусь с вами.';
      errorBox.hidden = false;
      input.focus();
      return;
    }
    /* 152-ФЗ: без отмеченного согласия заявка не уходит (см. AGENT.md 5.1). */
    const consent = form.querySelector('[name="consent"]');
    if (!consent.checked) {
      form.querySelector('.lm__consent').classList.add('is-bad');
      errorBox.textContent = 'Отметьте согласие с политикой конфиденциальности.';
      errorBox.hidden = false;
      consent.focus();
      return;
    }
    errorBox.hidden = true;

    /* Бэкенд требует name >= 2 и message >= 2 (api.php, action=lead) — за
       необязательные поля подставляем заглушки, иначе заявка вернёт 422.
       Первой строкой сообщения идёт источник: в письме и в админке сразу
       видно, что заявка пришла из виджета концепции, а не из формы контактов. */
    const name = val('name') || 'Без имени';
    const own = val('message');
    const message = 'Источник: виджет «Бесплатная концепция сайта» (lead-magnet-concept).'
      + (own ? `\n\nО проекте:\n${own}` : '\n\nОписание проекта не заполнено.');

    sending = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api.php?action=lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact: phone,
          message,
          type: 'phone',
          source: 'lead-magnet-concept',
          company: form.querySelector('[name="company"]').value,
          page: location.pathname + location.search,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* Ответ сервера показываем как есть — там осмысленный текст вроде
           «слишком много заявок». Сетевые сбои под этот текст не подходят,
           поэтому помечаем ошибку и различаем её в catch. */
        const e2 = new Error(d.error || 'Не удалось отправить заявку.');
        e2.fromServer = true;
        throw e2;
      }
      ym(111032105, 'reachGoal', 'form_submit');
      remember('sent');
      btn.textContent = label;
      go(steps.length - 1);
    } catch (err) {
      errorBox.textContent = (err && err.fromServer && err.message)
        || 'Не удалось отправить. Проверьте связь или напишите в Telegram — отвечу быстрее.';
      errorBox.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    } finally {
      sending = false;
    }
  };

  /* ---------- Слушатели ---------- */
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-lm-open]')) { ym(111032105, 'reachGoal', 'popup_open'); openModal(); }
    else if (e.target.closest('[data-lm-dismiss]')) dismiss();
  });
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-lm-close]')) closeModal();
    else if (e.target.closest('[data-lm-next]')) go(current + 1);
    else if (e.target.closest('[data-lm-prev]')) go(current - 1);
  });
  form.addEventListener('submit', send);
  form.querySelector('[name="phone"]').addEventListener('input', (e) => {
    if (!e.target.classList.contains('is-bad')) return;
    e.target.classList.remove('is-bad');
    errorBox.hidden = true;
  });
  form.querySelector('[name="consent"]').addEventListener('change', (e) => {
    if (e.target.checked) {
      form.querySelector('.lm__consent').classList.remove('is-bad');
      errorBox.hidden = true;
    }
  });

  /* ---------- Показ виджета ----------
     Ждём и загрузку страницы, и паузу: всплывать поверх недогруженного
     экрана — худшее первое впечатление. */
  const show = () => {
    if (seen()) return;
    document.body.appendChild(card);
    void card.offsetWidth; /* см. openModal — на rAF полагаться нельзя */
    card.classList.add('is-in');
  };
  const arm = () => setTimeout(show, DELAY);
  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm, { once: true });
})();
