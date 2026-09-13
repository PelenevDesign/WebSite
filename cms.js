(async () => {
  try {
    const response = window.CMS_SERVER_CONTENT ? null : await fetch(`/api.php?action=content&_=${Date.now()}`, { cache: 'no-store' });
    if (response && !response.ok) return;
    const values = window.CMS_SERVER_CONTENT || await response.json();
    const page = location.pathname.includes('work') ? 'work' : 'home';
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
        else if (id === 'hero-line-1' && window.matchMedia('(max-width: 768px)').matches && /\sдля\s/i.test(values[id])) {
          const parts = values[id].split(/\s+для\s+/i);
          element.textContent = '';
          element.append(document.createTextNode(parts[0].trim()), document.createElement('br'), document.createTextNode(`для ${parts.slice(1).join(' для ').trim()}`));
        } else element.textContent = values[id];
      });
    });
  } catch (_) {
    // Страница остаётся рабочей, если сервер CMS ещё не запущен.
  }
})();
