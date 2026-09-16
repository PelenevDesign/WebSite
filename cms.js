(async () => {
  try {
    const response = window.CMS_SERVER_CONTENT ? null : await fetch(`/api.php?action=content&_=${Date.now()}`, { cache: 'no-store' });
    if (response && !response.ok) return;
    const values = window.CMS_SERVER_CONTENT || await response.json();
    const page = location.pathname.includes('work') ? 'work' : 'home';
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    /* На узких экранах браузер иногда переносит строку в неудачном месте:
       рвёт составное слово по дефису («AI-» остаётся в конце строки, а
       «Контент» уезжает на следующую) или оставляет короткое «которые»/
       «который» одно в конце строки, оторванным от слова, к которому оно
       относится. Меняем обычные дефис/пробел на неразрывные — видимо
       ничего не меняется, а перенос строки в этом месте браузер больше не
       делает. Правило общее, а не под конкретный текст — само сработает
       для любого будущего текста с той же проблемой. */
    const NB = '\u00A0'; /* явный escape: голый U+00A0 в коде не виден и легко теряется */
    const fixMobileWrap = (text) => String(text)
      .replace(/AI-(?=[А-Яа-яЁё])/g, 'AI‑') /* неразрывный дефис — не рвём «AI-Контент» на перенос */
      .replace(/\b(которые|который|которая|которое)[ \t]+/gi, `$1${NB}`);
    window.CMS_SCHEMA.forEach((group) => {
      if (group.page && group.page !== page) return;
      group.fields.forEach(([id, , type, selector, attribute]) => {
        if (!(id in values) || values[id] === '') return;
        /* href и attr применяются ко ВСЕМ совпадениям: соцссылки и кнопки
           дублируются в меню, футере и доке */
        if (type === 'href' || type === 'attr') {
          document.querySelectorAll(selector).forEach((el) => el.setAttribute(type === 'href' ? 'href' : attribute, values[id]));
          return;
        }
        const element = document.querySelector(selector);
        if (!element) return;
        if (type === 'image') element.setAttribute(attribute || 'src', values[id]);
        else if (id === 'hero-line-1' && isMobile && /\sдля\s/i.test(values[id])) {
          const parts = values[id].split(/\s+для\s+/i);
          element.textContent = '';
          element.append(document.createTextNode(parts[0].trim()), document.createElement('br'), document.createTextNode(`для ${parts.slice(1).join(' для ').trim()}`));
        } else element.textContent = isMobile ? fixMobileWrap(values[id]) : values[id];
      });
    });
  } catch (_) {
    // Страница остаётся рабочей, если сервер CMS ещё не запущен.
  }
})();
