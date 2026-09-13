/* Журнал: фильтр по категориям, поиск, «Загрузить ещё».
   Первая страница уже отрисована сервером (SEO) — это только клиентские
   дозагрузки/переключения после первого взгляда пользователя. */
(() => {
  const grid = document.getElementById('journal-grid');
  if (!grid) return;
  const catsBar = document.querySelector('.jcats');
  const searchInput = document.getElementById('journal-search');
  const loadMoreBtn = document.getElementById('journal-load-more');
  /* Обложка статьи может быть видео — как и в journal.php. */
  const isVideo = (u) => /\.(mp4|webm|mov)(\?|$)/i.test(String(u || ''));
  const coverTag = (src, title) => isVideo(src)
    ? `<video src="${esc(src)}" muted loop playsinline autoplay preload="metadata" aria-label="${esc(title)}"></video>`
    : `<img src="${esc(src)}" alt="${esc(title)}" loading="lazy" decoding="async">`;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const catNames = {};
  if (catsBar) catsBar.querySelectorAll('.jcat[data-cat]').forEach((b) => { if (b.dataset.cat !== '0') catNames[b.dataset.cat] = b.textContent.trim(); });

  let activeCat = 0;
  let query = '';
  let offset = parseInt(grid.dataset.loaded || '0', 10);
  let requestId = 0;

  const cardHTML = (a) => {
    const cat = catNames[String((a.category_ids || [])[0])];
    const date = a.published_at ? new Date(a.published_at.replace(' ', 'T')).toLocaleDateString('ru-RU') : '';
    return `<article class="jcard">
      <a class="jcard__media" href="/article.php?slug=${encodeURIComponent(a.slug)}">${a.cover ? coverTag(a.cover, a.title) : '<span class="jcard__media-empty" aria-hidden="true"></span>'}</a>
      <div class="jcard__body">
        ${cat ? `<span class="jcard__cat">${esc(cat)}</span>` : ''}
        <h3 class="jcard__title"><a href="/article.php?slug=${encodeURIComponent(a.slug)}">${esc(a.title)}</a></h3>
        ${a.excerpt ? `<p class="jcard__excerpt">${esc(a.excerpt)}</p>` : ''}
        <div class="jcard__meta"><span>${esc(a.author_name || 'PELENEV.DESIGN')}</span>${date ? `<span>${date}</span>` : ''}<span>${a.reading_time_min} мин чтения</span></div>
      </div>
    </article>`;
  };

  const fetchArticles = async (reset) => {
    const myRequest = ++requestId;
    const params = new URLSearchParams({ limit: '9', offset: reset ? '0' : String(offset) });
    if (activeCat) params.set('category', String(activeCat));
    if (query) params.set('q', query);
    let data;
    try {
      const r = await fetch(`/api.php?action=journal-articles&${params}`, { cache: 'no-store' });
      data = await r.json();
    } catch (_) { return; }
    if (myRequest !== requestId) return; // ответ устарел — пользователь уже переключился дальше

    if (reset) { grid.innerHTML = ''; offset = 0; }
    if (!data.items || !data.items.length) {
      if (reset) grid.innerHTML = '<p class="jempty">Ничего не найдено.</p>';
    } else {
      data.items.forEach((a) => grid.insertAdjacentHTML('beforeend', cardHTML(a)));
    }
    offset += (data.items || []).length;
    if (loadMoreBtn) loadMoreBtn.hidden = offset >= (data.total || 0);
  };

  if (catsBar) {
    catsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.jcat');
      if (!btn) return;
      catsBar.querySelectorAll('.jcat').forEach((b) => b.classList.toggle('is-active', b === btn));
      activeCat = +btn.dataset.cat || 0;
      fetchArticles(true);
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { query = searchInput.value.trim(); fetchArticles(true); }, 350);
    });
  }

  if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => fetchArticles(false));
})();
