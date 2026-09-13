(() => {
  const root = document.querySelector('#projects');
  if (!root) return;
  const labels = { site: 'Сайты', 'ai-site': 'AI-сайты', 'ai-content': 'AI-контент', graphic: 'Дизайн' };
  const tabGroups = () => [...document.querySelectorAll('.wtabs')];
  let projects = [];
  /* Обложка может быть видео: тип определяем по расширению, как на сервере. */
  const isVideo = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(String(u || ''));
  const coverTag = (src, title) => isVideo(src)
    ? `<video src="${esc(src)}" muted loop playsinline autoplay preload="metadata" aria-label="${esc(title)}"></video>`
    : `<img src="${esc(src)}" alt="${esc(title)}">`;
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  /* «Смотреть кейс» ведёт на case.php обычной ссылкой — там своя masonry-галерея
     с полноэкранным просмотром. Раньше клик перехватывался и открывал урезанную
     инлайн-модалку (одно фото, без остальной галереи) — это и было причиной жалобы
     «галерея не открывается». Полноценной навигацией браузерный «назад» тоже работает
     сам по себе, без ручной обработки. */
  const nodeFor = (project, index, existing) => {
    const node = existing || document.createElement('div');
    node.className = 'project'; node.dataset.cat = (project.categories || []).join(' '); node.dataset.projectId = project.id;
    const cover = project.cover || (project.gallery || [])[0] || '';
    /* Мета-строку без значения не выводим — пустой «Сфера —» выглядел как баг. */
    const metaRow = (label, value) => {
      const v = String(value || '').trim();
      return v ? `<div class="ptexts__meta-row"><dt>${esc(label)}</dt><dd>${esc(v)}</dd></div>` : '';
    };
    const meta = metaRow('Сфера', project.industry) + metaRow('Сроки', project.duration) + metaRow('Услуги', project.services);
    /* Кейс открывается кликом по заголовку, фото и кнопке — не только по кнопке. */
    const href = `/case/${encodeURIComponent(project.slug)}/`;
    node.innerHTML = `<div class="ptexts"><h3 class="ptexts__title"><span class="mask"><span class="ptexts__word"><a class="ptexts__link" href="${href}">${esc(project.title)}</a></span></span></h3>${meta ? `<dl class="ptexts__meta">${meta}</dl>` : ''}</div><article class="pcard"><div class="pcard__content"><div class="pcard__body"><a class="pcard__media" href="${href}" aria-label="${esc(project.title)} — смотреть кейс">${coverTag(cover, project.title)}</a><div class="pcard__info"><h4 class="pcard__title"><a class="pcard__title-link" href="${href}">${esc(project.title)}</a></h4><p class="pcard__caption">${esc(project.description)}</p><a class="pill pill--dark" href="${href}">Смотреть кейс <span class="pill__arrow" aria-hidden="true">&#8599;</span></a></div></div><div class="pcard__foot"><span class="pcard__num">${String(index + 1).padStart(2, '0')}</span><span class="pcard__foot-line"></span></div></div></article>`;
    return node;
  };
  const applyFilter = (category) => {
    document.querySelectorAll('#projects > .project').forEach((node) => {
      node.style.display = category === 'all' || (node.dataset.cat || '').split(/\s+/).includes(category) ? '' : 'none';
    });
    const footer = document.querySelector('#footer');
    if (footer) { footer.hidden = false; footer.style.removeProperty('display'); }
  };
  /* Наборов табов два — в шапке и в плавающем доке. Обработчики получают оба,
     состояние между наборами синхронизирует syncTabs в main.js. */
  const setupTabs = () => {
    tabGroups().forEach((group) => {
      if (group.dataset.bound) return;
      group.dataset.bound = '1';
      group.querySelectorAll('.wtab').forEach((tab) => tab.addEventListener('click', () => applyFilter(tab.dataset.cat)));
    });
  };
  /* Категория из адреса (/work.php#site) — так работают ссылки «Смотреть кейсы»
     из блока услуг и теги на странице кейса. Раньше хэш игнорировался и всегда
     открывалась первая вкладка. */
  const hashCat = () => {
    const h = decodeURIComponent((location.hash || '').slice(1));
    return Object.prototype.hasOwnProperty.call(labels, h) ? h : null;
  };
  const setActiveTab = (category) => {
    document.querySelectorAll('.wtab').forEach((tab) => {
      const on = tab.dataset.cat === category;
      tab.classList.toggle('is-active', on);
      if (tab.hasAttribute('role')) tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  };
  const activeCat = () => hashCat() || document.querySelector('.wtab.is-active')?.dataset.cat || 'site';
  const render = () => {
    const existing = [...root.querySelectorAll('.project')];
    projects.forEach((project, i) => root.appendChild(nodeFor(project, i, existing[i])));
    existing.slice(projects.length).forEach((node) => node.remove());
    setupTabs();
    const cat = activeCat();
    setActiveTab(cat);
    applyFilter(cat);
    if (window.__projectsRefresh) window.__projectsRefresh();
    else if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };
  /* Переход по ссылке с другим хэшем на этой же странице перерисовки не вызывает —
     переключаем вкладку руками. */
  addEventListener('hashchange', () => {
    const cat = hashCat();
    if (!cat) return;
    setActiveTab(cat);
    applyFilter(cat);
  });

  fetch(`/api.php?action=projects&_=${Date.now()}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.projects) { projects = data.projects; render(); } }).catch(() => {});
})();
