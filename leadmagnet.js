/* Квиз «Какой сайт нужен»: всплывает по таймеру/exit-intent, три вопроса,
   готовая рекомендация и форма телефона. Разметку строит скрипт, поэтому
   на страницу добавляются только подключения css/js. Ничего не редактируется
   через CMS: тексты живут здесь. */
(() => {
  'use strict';

  const KEY = 'pd-leadmagnet';               // 'closed' | 'sent' — на текущую сессию
  const DELAY = 25000;                       // условие 1: 25с на странице
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seen = () => { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } };
  const remember = (v) => { try { sessionStorage.setItem(KEY, v); } catch (e) { /* приватный режим */ } };
  if (seen()) return;

  /* Страницы, где виджет только мешает: там человек уже пишет заявку. */
  if (document.body.classList.contains('page-admin')) return;

  /* Стили подключаем скриптом, а не <link> в <head>: тот блокировал бы первый
     рендер страницы ради виджета, который всплывает не раньше чем через 25с. */
  if (!document.querySelector('link[data-lm-css]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/leadmagnet.css?v=20';
    css.dataset.lmCss = '';
    document.head.appendChild(css);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ARROW = '<svg class="lm__arrow" viewBox="0 0 18 12" width="18" height="12" fill="none" aria-hidden="true"><path d="M1 6h15m0 0-5-4.5M16 6l-5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- Данные квиза ---------- */
  const QUESTIONS = [
    { key: 'q1', title: 'Что для вас важнее?', options: [
      ['leads', 'Собрать заявки с одного предложения'],
      ['showcase', 'Показать все услуги и информацию о компании'],
      ['shop', 'Продавать товары онлайн'],
    ] },
    { key: 'q2', title: 'Сколько товаров или услуг нужно показать?', options: [
      ['lt5', 'До 5'],
      ['mid', 'От 5 до 20'],
      ['gt20', 'Больше 20 (каталог)'],
    ] },
    { key: 'q3', title: 'Когда нужен готовый сайт?', options: [
      ['asap', 'Как можно скорее'],
      ['2w', 'В течение 2 недель'],
      ['later', 'Не горит, могу подождать'],
    ] },
  ];
  const QUESTION_COUNT = QUESTIONS.length;

  const RESULTS = {
    leads: { title: 'Вам подойдёт лендинг', text: 'Одна продающая страница под конкретное предложение. От 35 000 ₽, срок от 10 дней.' },
    showcase: { title: 'Вам подойдёт многостраничный сайт', text: 'С разделами под каждую услугу и информацией о компании. От 40 000 ₽, срок от 14 дней.' },
    shop: { title: 'Вам подойдёт интернет-магазин', text: 'С каталогом, корзиной и оплатой. От 80 000 ₽, срок от 21 дня.' },
  };
  /* Человекочитаемые подписи ответов — для текста заявки, не для UI. */
  const ANSWER_LABELS = Object.fromEntries(QUESTIONS.map((q) => [q.key, Object.fromEntries(q.options)]));

  const optionsHtml = (q) => `
    <div class="lm__options" role="radiogroup" aria-label="${esc(q.title)}">
      ${q.options.map(([value, label]) => `<button type="button" class="lm__option" data-quiz-option data-q="${esc(q.key)}" data-value="${esc(value)}">${esc(label)}</button>`).join('')}
    </div>`;

  const questionStepHtml = (q, index) => `
    <section class="lm__step" data-step="${index}"${index ? ' hidden' : ''}>
      <h2 class="lm__title">${esc(q.title)}</h2>
      ${optionsHtml(q)}
      ${index ? `<div class="lm__actions"><button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button></div>` : ''}
    </section>`;

  /* ---------- Сценарий ---------- */
  const modal = document.createElement('div');
  modal.className = 'lm';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Какой сайт вам нужен');
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

      <div class="lm__body" data-lenis-prevent>
        ${QUESTIONS.map(questionStepHtml).join('')}

        <section class="lm__step" data-step="${QUESTION_COUNT}" hidden>
          <h2 class="lm__title" data-result-title></h2>
          <p class="lm__text" data-result-text></p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--ghost" data-lm-prev>Назад</button>
            <button type="button" class="lm__btn lm__btn--primary" data-lm-next>Узнать точные сроки и стоимость ${ARROW}</button>
          </div>
        </section>

        <section class="lm__step" data-step="${QUESTION_COUNT + 1}" hidden>
          <h2 class="lm__title">Чтобы точно сориентировать по срокам и стоимости под ваш проект — оставьте телефон, перезвоню в удобное для вас время</h2>
          <form class="lm__form" novalidate>
            <label class="lm__field"><span class="lm__label">Телефон</span><input class="lm__input" type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="+7 900 000-00-00" required aria-describedby="lm-err"></label>
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
              <button type="submit" class="lm__btn lm__btn--primary" data-lm-submit>Перезвоните мне</button>
            </div>
            <p class="lm__error" id="lm-err" data-lm-error role="alert" hidden></p>
          </form>
        </section>

        <section class="lm__step lm__done" data-step="${QUESTION_COUNT + 2}" hidden>
          <span class="lm__ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <h2 class="lm__title">Заявка отправлена!</h2>
          <p class="lm__text">Перезвоню в удобное время.</p>
          <div class="lm__actions">
            <button type="button" class="lm__btn lm__btn--primary" data-lm-close>Вернуться на сайт</button>
          </div>
        </section>
      </div>
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

  applyTypo(modal);

  /* В DOM ничего не кладём заранее — модалка попадает туда в openModal().
     Иначе поисковик видит на каждой странице посторонние <h2> из квиза,
     к содержанию страницы не относящиеся. */

  const steps = [...modal.querySelectorAll('.lm__step')];
  const RESULT_STEP = QUESTION_COUNT;
  const FORM_STEP = QUESTION_COUNT + 1;
  const DONE_STEP = QUESTION_COUNT + 2;
  const countBox = modal.querySelector('[data-lm-count]');
  const track = modal.querySelector('[data-lm-track]');
  const bar = modal.querySelector('[data-lm-bar]');
  const form = modal.querySelector('.lm__form');
  const errorBox = modal.querySelector('[data-lm-error]');
  const answers = {};
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

  /* На шаге результата — заголовок и текст по ответу на вопрос 1.
     На шагах вопросов — подсветить ранее выбранный вариант, если вернулись назад. */
  const onEnter = (index) => {
    if (index < QUESTION_COUNT) {
      const q = QUESTIONS[index];
      const picked = answers[q.key];
      steps[index].querySelectorAll('[data-quiz-option]').forEach((b) => {
        b.classList.toggle('is-selected', b.dataset.value === picked);
      });
    } else if (index === RESULT_STEP) {
      const r = RESULTS[answers.q1] || RESULTS.leads;
      steps[index].querySelector('[data-result-title]').textContent = r.title;
      steps[index].querySelector('[data-result-text]').textContent = r.text;
    }
  };

  const go = (index) => {
    if (index < 0 || index >= steps.length) return;
    steps[current].hidden = true;
    current = index;
    steps[current].hidden = false;
    const isQuestion = current < QUESTION_COUNT;
    countBox.hidden = !isQuestion;
    track.hidden = !isQuestion;
    if (isQuestion) {
      countBox.firstElementChild.textContent = String(current + 1).padStart(2, '0');
      bar.style.width = ((current + 1) / QUESTION_COUNT * 100) + '%';
    }
    onEnter(current);
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
    onEnter(0);
    countBox.firstElementChild.textContent = '01';
    bar.style.width = (1 / QUESTION_COUNT * 100) + '%';
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
    const btn = form.querySelector('[data-lm-submit]');
    const phone = form.querySelector('[name="phone"]').value.trim();

    form.querySelectorAll('.is-bad').forEach((n) => n.classList.remove('is-bad'));
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

    /* Бэкенд требует name >= 2 и message >= 2 (api.php, action=lead), но у
       квиза нет полей имени и сообщения — подставляем заглушку под первое и
       собираем понятный текст под второе. Источник и ответы на все три
       вопроса кладём в message читаемым текстом: своего поля под них на
       сервере нет (см. диагностику), а без этого в заявке не видно, что
       отвечал человек. */
    const message = 'Источник: квиз «Какой сайт нужен» (quiz-site-type).'
      + `\n\nВажнее: ${esc(ANSWER_LABELS.q1[answers.q1] || '—')}`
      + `\nОбъём: ${esc(ANSWER_LABELS.q2[answers.q2] || '—')}`
      + `\nСроки: ${esc(ANSWER_LABELS.q3[answers.q3] || '—')}`;

    sending = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api.php?action=lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Без имени',
          contact: phone,
          message,
          type: 'phone',
          source: 'quiz-site-type',
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
      go(DONE_STEP);
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
  modal.addEventListener('click', (e) => {
    const optBtn = e.target.closest('[data-quiz-option]');
    if (optBtn) {
      answers[optBtn.dataset.q] = optBtn.dataset.value;
      steps[current].querySelectorAll('[data-quiz-option]').forEach((b) => b.classList.remove('is-selected'));
      optBtn.classList.add('is-selected');
      /* Небольшая пауза, чтобы был виден отмеченный вариант перед переходом. */
      setTimeout(() => go(current + 1), reduce ? 0 : 220);
      return;
    }
    if (e.target.closest('[data-lm-close]')) { closeModal(); return; }
    if (e.target.closest('[data-lm-next]')) { go(current + 1); return; }
    if (e.target.closest('[data-lm-prev]')) { go(current - 1); return; }
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

  /* ---------- Триггер показа ----------
     Оба условия работают одновременно, срабатывает то, что раньше:
     25 секунд на странице ИЛИ курсор уходит за верхнюю границу окна
     (exit-intent, только там, где есть мышь — на тачскрине этого жеста
     не бывает). После первого срабатывания оба слушателя снимаются. */
  let shown = false;
  const trigger = () => {
    if (shown || seen()) return;
    shown = true;
    clearTimeout(timer);
    document.removeEventListener('mouseleave', onExitIntent);
    ym(111032105, 'reachGoal', 'popup_open');
    openModal();
  };
  const onExitIntent = (e) => { if (e.clientY <= 0) trigger(); };
  const timer = setTimeout(trigger, DELAY);
  if (matchMedia('(pointer: fine)').matches) {
    document.addEventListener('mouseleave', onExitIntent);
  }
})();
