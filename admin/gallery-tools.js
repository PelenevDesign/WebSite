(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.adminBuildFallback = async () => {
    const form = document.querySelector('#content-form');
    const status = document.querySelector('#status');
    if (!form) return;
    const schema = Array.isArray(window.CMS_SCHEMA) ? window.CMS_SCHEMA : [];
    if (!schema.length) {
      form.innerHTML = '<p class="admin-load-error">Не удалось загрузить схему полей CMS. Проверьте, что файл cms-schema.js загружен на хостинг.</p>';
      if (status) status.textContent = 'Ошибка загрузки схемы CMS.';
      return;
    }
    let content = {};
    try {
      const response = await fetch(`/api.php?action=content&_=${Date.now()}`, {cache: 'no-store'});
      if (response.ok) content = await response.json();
    } catch (error) { console.error(error); }
    form.innerHTML = '';
    schema.forEach((group) => {
      const fieldset = document.createElement('fieldset');
      fieldset.innerHTML = `<legend>${esc(group.section)}</legend>`;
      (group.fields || []).forEach((field) => {
        const [id, label, type] = field;
        const row = document.createElement('div'); row.className = 'field';
        const value = content[id] ?? '';
        if (type === 'image') {
          row.innerHTML = `<label>${esc(label)}<span class="image-row"><input data-id="${esc(id)}" value="${esc(value)}" type="url" placeholder="Ссылка на изображение"><button type="button">Загрузить файл</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></span></label>`;
          const uploadInput = row.querySelector('input[type=url]');
          const fileInput = row.querySelector('input[type=file]');
          row.querySelector('button').onclick = () => fileInput.click();
          fileInput.onchange = async () => {
            const file = fileInput.files[0]; if (!file || !window.cmsApiFetch) return;
            try {
              if (status) status.textContent = 'Загружаю изображение…';
              const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
              const response = await window.cmsApiFetch('/api.php?action=upload', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:file.name, data})});
              const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Не удалось загрузить файл');
              uploadInput.value = result.url; if (status) status.textContent = 'Изображение добавлено. Не забудьте сохранить.';
            } catch (error) { if (status) status.textContent = error.message || 'Не удалось загрузить файл'; }
          };
        } else {
          row.innerHTML = `<label>${esc(label)}<textarea data-id="${esc(id)}">${esc(value)}</textarea></label>`;
        }
        fieldset.append(row);
      });
      form.append(fieldset);
    });
  };
  const editor = () => document.querySelector('#project-editor');
  const projectId = () => editor()?.dataset.projectId || '0';
  const projectData = () => {
    const root = editor(); if (!root) return null;
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value || '';
    return {
      id: Number(projectId()), title: value('title'), client: value('client'), industry: value('industry'), duration: value('duration'), services: value('services'), project_url: value('project_url'), description: value('description'), cover: value('cover'), status: value('status') || 'published', categories: [...root.querySelectorAll('[name="categories"]:checked')].map((input) => input.value), gallery: [...root.querySelectorAll('.project-gallery__item img')].map((image) => image.src.replace(location.origin, '')),
      // блоки статьи живут в состоянии admin.js, а не в DOM — без этого автосохранение
      // порядка/замены фото в галерее стирало бы весь текст кейса при каждом перетаскивании.
      blocks: typeof window.getCaseBlocksForSave === 'function' ? window.getCaseBlocksForSave() : [],
    };
  };
  const saveOrder = async () => {
    const data = projectData();
    if (!data || !data.id || !window.cmsApiFetch) return;
    const response = await window.cmsApiFetch('/api.php?action=project', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (!response.ok) throw new Error('Не удалось сохранить порядок галереи.');
  };
  const upload = async (file) => {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Не удалось прочитать файл.')); reader.readAsDataURL(file); });
    const response = await window.cmsApiFetch('/api.php?action=upload', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Не удалось загрузить изображение.'); return result.url;
  };
  const decorate = () => document.querySelectorAll('.project-gallery__item').forEach((item) => {
    if (item.querySelector('.replace-gallery-image')) return;
    const index = item.dataset.index;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'replace-gallery-image'; button.textContent = 'Заменить'; button.dataset.index = index;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.hidden = true; input.dataset.index = index;
    item.append(button, input);
  });
  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]'); if (edit && editor()) editor().dataset.projectId = edit.dataset.edit;
    if (event.target.id === 'project-new' && editor()) editor().dataset.projectId = '0';
    const button = event.target.closest('.replace-gallery-image'); if (button) button.parentElement.querySelector('input[type=file]')?.click();
    if (event.target.closest('.project-gallery__item [data-remove]')) setTimeout(() => saveOrder().catch(() => {}), 0);
  }, true);
  document.addEventListener('change', async (event) => {
    const input = event.target.closest('.project-gallery__item input[type=file]'); if (!input?.files[0]) return;
    try { const url = await upload(input.files[0]); const image = input.parentElement.querySelector('img'); if (image) image.src = url; await saveOrder(); const status = document.querySelector('#status'); if (status) status.textContent = 'Изображение заменено.'; } catch (error) { alert(error.message); }
  });
  document.addEventListener('drop', (event) => { if (!event.target.closest('.project-gallery__item')) return; setTimeout(() => saveOrder().catch((error) => { const status = document.querySelector('#status'); if (status) status.textContent = error.message; }), 0); }, true);
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true }); decorate();
})();
