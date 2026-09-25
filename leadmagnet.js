/* Виджет в углу («Сайт под ключ за 35 000 ₽») → по клику квиз из трёх
   вопросов → готовая рекомендация и форма телефона. Разметку строит скрипт,
   поэтому на страницу добавляются только подключения css/js. Ничего не
   редактируется через CMS: тексты живут здесь. */
(() => {
  'use strict';

  const KEY = 'pd-leadmagnet';               // 'closed' | 'sent' — на текущую сессию
  const DELAY = 10000;                       // условие 1: 10с на странице
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seen = () => { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } };
  const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch (e) { /* приватный режим */ } };
  if (seen()) return;

  /* Страницы, где виджет только мешает: там человек уже пишет заявку. */
  if (document.body.classList.contains('page-admin')) return;

  /* Стили подключаем скриптом, а не <link> в <head>: тот блокировал бы первый
     рендер страницы ради виджета, который всплывает не раньше чем через 10с. */
  if (!document.querySelector('link[data-lm-css]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/leadmagnet.css?v=24';
    css.dataset.lmCss = '';
    document.head.appendChild(css);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ARROW = '<svg class="lm__arrow" viewBox="0 0 18 12" width="18" height="12" fill="none" aria-hidden="true"><path d="M1 6h15m0 0-5-4.5M16 6l-5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- Виджет в углу ---------- */
  const card = document.createElement('aside');
  card.className = 'lm-card';
  card.setAttribute('role', 'complementary');
  card.setAttribute('aria-label', 'Сайт под ключ за 35 000 ₽');
  card.innerHTML = `
    <button type="button" class="lm-card__close" data-lm-dismiss aria-label="Закрыть">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <p class="lm-card__title"><span class="lm-card__mark" aria-hidden="true"></span>Сайт под ключ за 35 000 ₽</p>
    <p class="lm-card__text">Плюс админ-панель в подарок. Оставьте контакт и удобное время — обсудим ваш проект.</p>
    <button type="button" class="lm-card__cta" data-lm-open>Забронировать место ${ARROW}</button>`;

  /* ---------- Данные квиза ---------- */
  /* Телефона нет: связь только через интернет, поэтому сразу выбираем мессенджер. */
  const CHANNELS = [
    ['telegram', 'Telegram', 'Ник в Telegram', '@username или ссылка t.me/…'],
    ['vk', 'ВКонтакте', 'Профиль ВКонтакте', 'vk.com/… или ник'],
    ['max', 'MAX', 'Аккаунт в MAX', '+7 (900) 000-00-00 или ник'],
  ];
  const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map(([id, label, field, ph]) => [id, { label, field, ph }]));
  const TIMES = ['Утро', 'День', 'Вечер'];
  const TIME_WHEN = { 'Утро': 'утром', 'День': 'днём', 'Вечер': 'вечером' };
  /* «завтра утром», но «вс, 27 сент., утром» — без даты фраза читается живее. */
  const whenPhrase = () => (day.soon ? `${day.short.toLowerCase()} ${TIME_WHEN[time]}` : `${day.full}, ${TIME_WHEN[time]}`);
  const QUESTION_COUNT = 2;                  /* экран-оффер вопросом не считается */

  /* Проверка контакта: заявка без рабочего контакта бесполезна, поэтому
     ловим типовые ошибки (номер вместо ника, чужая ссылка) и заодно
     приводим введённое к единому виду. Правила те же, что в модалке. */
  const PHONEISH = /^\+?\d[\d\s()\-]{5,}$/;

  /* Маска +7 (999) 999-99-99 — см. подробный разбор в main.js. Лишние цифры
     не влезают; аккаунт всё ещё можно указать ником, маска включается только
     когда человек начал ввод с цифры или «+». */
  const subscriberDigits = (v) => {
    let t = String(v).trim();
    if (t.indexOf('+7') === 0) t = t.slice(2);
    else if (t.indexOf('+') === 0) t = t.slice(1);
    let d = t.replace(/\D/g, '');
    if (d.length > 10 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
    if (d.length === 1 && (d[0] === '7' || d[0] === '8')) d = '';
    return d.slice(0, 10);
  };
  const ruMask = (d) => {
    let out = '+7';
    if (d.length) out += ' (' + d.slice(0, 3);
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ' ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  };
  const CHECK = {
    telegram(v) {
      const t = v.trim();
      if (!t) return { ok: false, msg: 'Укажите ник в Telegram — по нему я вам напишу' };
      if (PHONEISH.test(t)) return { ok: false, msg: 'Нужен ник, а не номер: Telegram → Настройки → Имя пользователя' };
      const nick = t.replace(/^https?:\/\//i, '')
        .replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '')
        .replace(/[?#\/].*$/, '')
        .replace(/^@/, '');
      if (!/^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/.test(nick)) {
        return { ok: false, msg: 'Ник в Telegram: латиница, цифры и «_», 5–32 символа. Например @pelenev' };
      }
      return { ok: true, value: '@' + nick };
    },
    vk(v) {
      const t = v.trim();
      if (!t) return { ok: false, msg: 'Укажите ссылку на вашу страницу ВКонтакте' };
      if (PHONEISH.test(t)) return { ok: false, msg: 'Нужна страница, а не номер. Скопируйте адрес профиля: vk.com/…' };
      const id = t.replace(/^https?:\/\//i, '')
        .replace(/^(m\.|www\.)?(vk\.com|vk\.ru|vkontakte\.ru)\//i, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
        .replace(/^@/, '');
      if (!/^[A-Za-z0-9_.]{3,64}$/.test(id)) return { ok: false, msg: 'Ссылка вида vk.com/ваш_профиль или короткое имя страницы' };
      return { ok: true, value: 'vk.com/' + id };
    },
    max(v) {
      const t = v.trim();
      if (!t) return { ok: false, msg: 'Укажите номер или ник в MAX' };
      if (/^[+\d]/.test(t)) {
        const d = subscriberDigits(t);
        if (d.length !== 10) return { ok: false, msg: 'Номер из 10 цифр после +7. Например +7 (900) 000-00-00' };
        return { ok: true, value: ruMask(d) };
      }
      const nick = t.replace(/^@/, '');
      if (!/^[A-Za-z0-9_.]{3,64}$/.test(nick)) return { ok: false, msg: 'Номер в формате +7 (900) 000-00-00 или ник в MAX' };
      return { ok: true, value: '@' + nick };
    },
  };

  /* Дни считаем от текущей даты, а не списком в коде — виджет не устаревает.
     После 17:00 сегодняшний день уже не предлагаем: созвониться вряд ли успеем. */
  const callDays = () => {
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
  };

  const chipsHtml = (items, attr) => items
    .map(([value, label]) => `<button type="button" class="lm__option" data-${attr}="${esc(value)}">${esc(label)}</button>`)
    .join('');

  /* ---------- Сценарий ---------- */
  const modal = document.createElement('div');
  modal.className = 'lm';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Сайт под ключ за 35 000 ₽');
  modal.innerHTML = `
    <div class="lm__bd" data-lm-close></div>
    <div class="lm__dialog" tabindex="-1">
      <div class="lm__head">
        <p class="lm__count" data-lm-count><b>01</b><span>/ 0${QUESTION_COUNT}</span></p>
        <span class="lm__track" data-lm-track aria-hidden="true"><span class="lm__bar" data-lm-bar></span></span>
        <button type="button" class="lm__close" data-lm-close aria-label="Закрыть">
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>

      <form class="lm__body" data-lenis-prevent novalidate>

        <section class="lm__step" data-step="0">
          <h2 class="lm__title">Сайт под ключ с админ-панелью — 35 000 ₽</h2>
          <p class="lm__text">Лендинг или многостраничный сайт: дизайн, вёрстка, адаптив под телефон и панель управления текстами и картинками. Срок от 10 дней.</p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--primary" data-lm-next>Забронировать место ${ARROW}</button>
          </div>
        </section>

        <section class="lm__step" data-step="1" hidden>
          <h2 class="lm__title">Как с вами связаться?</h2>
          <div class="lm__options lm__options--chips" role="group" aria-label="Мессенджер">
            ${chipsHtml(CHANNELS.map(([id, label]) => [id, label]), 'lm-channel')}
          </div>
          <label class="lm__field">
            <span class="lm__label" data-lm-contact-label>Ник или ссылка</span>
            <input class="lm__input" type="text" name="contact" autocomplete="off" spellcheck="false" placeholder="Юзернейм, номер или ссылка">
          </label>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button>
            <button type="button" class="lm__btn lm__btn--primary" data-lm-next>Дальше ${ARROW}</button>
          </div>
          <p class="lm__error" data-lm-error1 role="alert" hidden></p>
        </section>

        <section class="lm__step" data-step="2" hidden>
          <h2 class="lm__title">Когда удобно созвониться?</h2>

          <p class="lm__sub">День</p>
          <div class="lm__options lm__options--chips" data-lm-days role="group" aria-label="День"></div>

          <p class="lm__sub">Время</p>
          <div class="lm__options lm__options--chips" role="group" aria-label="Время">
            ${chipsHtml(TIMES.map((t) => [t, t]), 'lm-time')}
          </div>

          <p class="lm__note">Это предпочтительное время — я подтвержу точный созвон в переписке</p>

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
            <button type="submit" class="lm__btn lm__btn--primary" data-lm-submit>Отправить</button>
          </div>
          <p class="lm__error" id="lm-err" data-lm-error role="alert" hidden></p>
        </section>

        <section class="lm__step lm__done" data-step="3" hidden>
          <span class="lm__ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h2 class="lm__title">Спасибо!</h2>
          <p class="lm__text" data-lm-thanks></p>
          <p class="lm__note">Это предпочтительное время, точный созвон подтвержу в переписке.</p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--primary" data-lm-close>Вернуться на сайт</button>
          </div>
        </section>
      </form>
    </div>`;

  /* ---------- Типографика ----------
     Короткие предлоги и союзы не должны висеть в конце строки, тире не
     отрывается от предыдущего слова, число не отрывается от единицы.
     Правим текстовые узлы уже собранной разметки — тогда правило само
     распространяется на любые будущие тексты, руками &nbsp; ставить не нужно. */
  const NB = ' '; /* явный escape: голый U+00A0 в коде не виден и легко теряется */
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

  /* В DOM ничего не кладём заранее — модалка попадает туда в openModal().
     Иначе поисковик видит на каждой странице посторонние <h2> из квиза,
     к содержанию страницы не относящиеся. */

  const steps = [...modal.querySelectorAll('.lm__step')];
  const CONTACT_STEP = 1;
  const TIME_STEP = 2;
  const DONE_STEP = 3;
  const countBox = modal.querySelector('[data-lm-count]');
  const track = modal.querySelector('[data-lm-track]');
  const bar = modal.querySelector('[data-lm-bar]');
  const form = modal.querySelector('.lm__body');
  const errorBox = modal.querySelector('[data-lm-error]');
  const contactInput = form.querySelector('[name="contact"]');
  const contactLabel = modal.querySelector('[data-lm-contact-label]');
  const daysBox = modal.querySelector('[data-lm-days]');
  const thanksBox = modal.querySelector('[data-lm-thanks]');
  const submitBtn = form.querySelector('[data-lm-submit]');

  /* Выбранное на шагах — уходит в текст заявки. */
  let channel = '';
  let day = null;
  let time = '';
  let current = 0;
  let lastFocus = null;
  let sending = false;

  const errorBox1 = modal.querySelector('[data-lm-error1]');
  const fail = (box, msg) => { box.textContent = msg; box.hidden = false; };

  /* Возвращает true, если шаг связи заполнен корректно; иначе показывает,
     что именно поправить, и подсвечивает поле. */
  const contactOk = (report) => {
    if (!channel) {
      if (report) fail(errorBox1, 'Выберите, куда вам написать');
      return false;
    }
    const r = CHECK[channel](contactInput.value);
    if (!r.ok) {
      if (report) { fail(errorBox1, r.msg); contactInput.classList.add('is-bad'); contactInput.focus(); }
      return false;
    }
    if (r.value !== contactInput.value) contactInput.value = r.value;
    errorBox1.hidden = true;
    return true;
  };

  const pickOne = (group, el) => {
    group.querySelectorAll('.lm__option').forEach((b) => b.classList.toggle('is-selected', b === el));
  };

  /* Список дней пересобираем на каждое открытие: виджет живёт на странице долго. */
  let days = [];
  const renderDays = () => {
    day = null;
    days = callDays();
    daysBox.innerHTML = days
      .map((d, i) => `<button type="button" class="lm__option" data-lm-day="${i}">${esc(d.short)}</button>`)
      .join('');
  };

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
    /* Счётчик и полоса — только на двух вопросах, оффер и «спасибо» их не показывают. */
    const isQuestion = current === CONTACT_STEP || current === TIME_STEP;
    countBox.hidden = !isQuestion;
    track.hidden = !isQuestion;
    if (isQuestion) {
      countBox.firstElementChild.textContent = String(current).padStart(2, '0');
      bar.style.width = (current / QUESTION_COUNT * 100) + '%';
    }
    form.scrollTop = 0;
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

  const hideCard = () => { card.classList.remove('is-in'); card.classList.add('is-out'); setTimeout(() => card.remove(), reduce ? 0 : 500); };
  const dismissCard = () => { hideCard(); remember('closed'); };

  const openModal = () => {
    lastFocus = document.activeElement;
    if (card.isConnected) hideCard();
    if (!modal.isConnected) document.body.appendChild(modal);
    modal.hidden = false;
    lockScroll(true);
    /* Принудительный reflow фиксирует закрытое состояние, после чего класс
       запускает переход. Через rAF нельзя: в неактивной вкладке кадр может
       не наступить, и диалог останется с opacity: 0. */
    void modal.offsetWidth;
    modal.classList.add('is-open');
    current = 0;
    steps.forEach((s, i) => { s.hidden = i !== 0; });
    countBox.hidden = true;
    track.hidden = true;
    renderDays();
    time = '';
    channel = '';
    contactInput.value = '';
    errorBox.hidden = true;
    errorBox1.hidden = true;
    document.addEventListener('keydown', onKey);
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    lockScroll(false);
    const done = current === DONE_STEP;
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

  /* ---------- Отправка ---------- */
  const send = async (e) => {
    e.preventDefault();
    if (sending) return;                       // страховка от двойного клика/двойного submit
    form.querySelectorAll('.is-bad').forEach((n) => n.classList.remove('is-bad'));
    /* Порядок проверок = порядок шагов: возвращаем ровно туда, где не так. */
    if (!contactOk(true)) { go(CONTACT_STEP); contactOk(true); return; }
    const contact = contactInput.value.trim();
    if (!day) { fail(errorBox, 'Выберите день созвона'); return; }
    if (!time) { fail(errorBox, 'Выберите время'); return; }
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

    /* Бэкенд требует name >= 2 и message >= 2 (api.php, action=lead), но у
       виджета нет поля имени — подставляем заглушку под первое и собираем
       понятный текст под второе. Мессенджер, день и время кладём в message
       читаемым текстом: своих полей под них на сервере нет. */
    const message = 'Заявка с виджета акции (сайт под ключ за 35 000 ₽).'
      + '\n\nИнтерес: Акция — сайт под ключ с админ-панелью за 35 000 ₽'
      + `\nСвязь: ${CHANNEL_BY_ID[channel].label} — ${contact}`
      + `\nСозвон: ${day.full}, ${time}`;

    sending = true;
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api.php?action=lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Без имени',
          contact,
          message,
          type: channel,
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
      submitBtn.textContent = label;
      thanksBox.textContent = `Свяжусь с вами ${whenPhrase()}, чтобы обсудить детали акции.`;
      go(DONE_STEP);
    } catch (err) {
      errorBox.textContent = (err && err.fromServer && err.message)
        || 'Не удалось отправить. Проверьте связь или напишите в Telegram — отвечу быстрее.';
      errorBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    } finally {
      sending = false;
    }
  };

  /* ---------- Слушатели ---------- */
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-lm-open]')) { ym(111032105, 'reachGoal', 'popup_open'); openModal(); }
    else if (e.target.closest('[data-lm-dismiss]')) dismissCard();
  });
  modal.addEventListener('click', (e) => {
    const chan = e.target.closest('[data-lm-channel]');
    if (chan) {
      channel = chan.dataset.lmChannel;
      pickOne(chan.parentElement, chan);
      const c = CHANNEL_BY_ID[channel];
      contactLabel.textContent = c.field;
      contactInput.placeholder = c.ph;
      contactInput.classList.remove('is-bad');
      errorBox1.hidden = true;
      phoneDigits = '';
      return;
    }
    const dayBtn = e.target.closest('[data-lm-day]');
    if (dayBtn) {
      day = days[+dayBtn.dataset.lmDay] || null;
      pickOne(daysBox, dayBtn);
      errorBox.hidden = true;
      return;
    }
    const timeBtn = e.target.closest('[data-lm-time]');
    if (timeBtn) {
      time = timeBtn.dataset.lmTime;
      pickOne(timeBtn.parentElement, timeBtn);
      errorBox.hidden = true;
      return;
    }
    if (e.target.closest('[data-lm-close]')) { closeModal(); return; }
    /* С шага связи дальше пускаем только с проверенным контактом. */
    if (e.target.closest('[data-lm-next]')) {
      if (current === CONTACT_STEP && !contactOk(true)) return;
      go(current + 1);
      return;
    }
    if (e.target.closest('[data-lm-prev]')) { go(current - 1); return; }
  });
  form.addEventListener('submit', send);
  let phoneDigits = '';
  const phoneMode = () => channel === 'max' && /^[+\d]/.test(contactInput.value.trim());
  contactInput.addEventListener('input', (e) => {
    if (phoneMode()) {
      const del = !!(e.inputType && e.inputType.indexOf('delete') === 0);
      let d = subscriberDigits(contactInput.value);
      /* Скобки и дефисы сами не стираются — за удалённый разделитель
         снимаем цифру, иначе Backspace упирается в маску. */
      if (del && d === phoneDigits) d = d.slice(0, -1);
      phoneDigits = d;
      contactInput.value = del && !d ? '' : ruMask(d);
      const end = contactInput.value.length;
      try { contactInput.setSelectionRange(end, end); } catch (err) { /* не текстовое поле */ }
    } else {
      phoneDigits = '';
    }
    contactInput.classList.remove('is-bad');
    errorBox1.hidden = true;
  });
  /* Нормализуем по уходу из поля: t.me/pelenev → @pelenev, 8 900… → +7900… */
  contactInput.addEventListener('blur', () => {
    if (!channel || !contactInput.value.trim()) return;
    const r = CHECK[channel](contactInput.value);
    if (r.ok) { contactInput.value = r.value; errorBox1.hidden = true; }
    else { contactInput.classList.add('is-bad'); fail(errorBox1, r.msg); }
  });
  form.querySelector('[name="consent"]').addEventListener('change', (e) => {
    if (e.target.checked) {
      form.querySelector('.lm__consent').classList.remove('is-bad');
      errorBox.hidden = true;
    }
  });

  /* ---------- Показ виджета ----------
     Оба условия работают одновременно, срабатывает то, что раньше:
     10 секунд на странице ИЛИ курсор уходит за верхнюю границу окна
     (exit-intent, только там, где есть мышь — на тачскрине этого жеста
     не бывает). После первого срабатывания оба слушателя снимаются —
     дальше виджет открывает квиз только по клику на его кнопку. */
  const showCard = () => {
    if (seen()) return;
    document.body.appendChild(card);
    void card.offsetWidth; /* см. openModal — на rAF полагаться нельзя */
    card.classList.add('is-in');
  };
  let shown = false;
  const trigger = () => {
    if (shown || seen()) return;
    shown = true;
    clearTimeout(timer);
    document.removeEventListener('mouseleave', onExitIntent);
    showCard();
  };
  const onExitIntent = (e) => { if (e.clientY <= 0) trigger(); };
  const timer = setTimeout(trigger, DELAY);
  if (matchMedia('(pointer: fine)').matches) {
    document.addEventListener('mouseleave', onExitIntent);
  }
})();
