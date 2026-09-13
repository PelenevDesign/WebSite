/* Уведомление о cookie. Отдельный файл, потому что подключается и на privacy.html,
   где нет ни GSAP, ни Lenis, ни main.js. */
(() => {
  const box = document.getElementById('cookie');
  const ok = document.getElementById('cookie-ok');
  if (!box || !ok) return;

  // Баннер показывается при каждом новом открытии страницы: согласие не сохраняем.
  box.hidden = false;
  // два кадра: снимаем hidden, потом запускаем переход — иначе анимации не будет
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-visible')));

  ok.addEventListener('click', () => {
    box.classList.remove('is-visible');
    setTimeout(() => { box.hidden = true; }, 450);
  });
})();
