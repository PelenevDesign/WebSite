/* Поля, доступные в админ-панели. Один источник правды для сайта и /admin. */
window.CMS_SCHEMA = [
  { section: 'Главный экран', fields: [
    ['hero-line-1', 'Заголовок — строка 1', 'text', '.hero__sub .mask:nth-child(1) .hero__sub-line'],
    ['hero-line-2', 'Заголовок — строка 2', 'text', '.hero__sub .mask:nth-child(2) .hero__sub-line'],
    ['hero-lead', 'Описание', 'text', '.hero__lead'],
    ['hero-image', 'Фоновое изображение', 'image', '.hero__media', 'poster']
  ]},
  { section: 'О студии', fields: [
    ['about-title', 'Заголовок', 'text', '.about__title'],
    ['about-text', 'Описание', 'text', '.about__body'],
    ['about-image', 'Фотография', 'image', '.about__img', 'src'],
    ['stat-1-number', 'Статистика 1 — число', 'text', '.stat:nth-child(1) .stat__num'],
    ['stat-1-label', 'Статистика 1 — подпись', 'text', '.stat:nth-child(1) .stat__label'],
    ['stat-2-number', 'Статистика 2 — число', 'text', '.stat:nth-child(2) .stat__num'],
    ['stat-2-label', 'Статистика 2 — подпись', 'text', '.stat:nth-child(2) .stat__label'],
    ['stat-3-number', 'Статистика 3 — число', 'text', '.stat:nth-child(3) .stat__num'],
    ['stat-3-label', 'Статистика 3 — подпись', 'text', '.stat:nth-child(3) .stat__label'],
    ['stat-4-number', 'Статистика 4 — число', 'text', '.stat:nth-child(4) .stat__num'],
    ['stat-4-label', 'Статистика 4 — подпись', 'text', '.stat:nth-child(4) .stat__label']
  ]},
  { section: 'Услуги', fields: [
    ['services-title', 'Заголовок секции', 'text', '.services__h2-word'],
    ['service-1-title', 'Услуга 1 — название', 'text', '.srow:nth-of-type(1) .srow__title-word'],
    ['service-1-text', 'Услуга 1 — описание', 'text', '.srow:nth-of-type(1) .srow__desc'],
    ['service-1-image-1', 'Услуга 1 — фото 1', 'image', '.srow:nth-of-type(1) .srow__imgwrap:nth-child(1) img', 'src'],
    ['service-1-image-2', 'Услуга 1 — фото 2', 'image', '.srow:nth-of-type(1) .srow__imgwrap:nth-child(2) img', 'src'],
    ['service-1-image-3', 'Услуга 1 — фото 3', 'image', '.srow:nth-of-type(1) .srow__imgwrap:nth-child(3) img', 'src'],
    ['service-1-image-4', 'Услуга 1 — фото 4', 'image', '.srow:nth-of-type(1) .srow__imgwrap:nth-child(4) img', 'src'],
    ['service-2-title', 'Услуга 2 — название', 'text', '.srow:nth-of-type(2) .srow__title-word'],
    ['service-2-text', 'Услуга 2 — описание', 'text', '.srow:nth-of-type(2) .srow__desc'],
    ['service-2-image-1', 'Услуга 2 — фото 1', 'image', '.srow:nth-of-type(2) .srow__imgwrap:nth-child(1) img', 'src'],
    ['service-2-image-2', 'Услуга 2 — фото 2', 'image', '.srow:nth-of-type(2) .srow__imgwrap:nth-child(2) img', 'src'],
    ['service-2-image-3', 'Услуга 2 — фото 3', 'image', '.srow:nth-of-type(2) .srow__imgwrap:nth-child(3) img', 'src'],
    ['service-2-image-4', 'Услуга 2 — фото 4', 'image', '.srow:nth-of-type(2) .srow__imgwrap:nth-child(4) img', 'src'],
    ['service-3-title', 'Услуга 3 — название', 'text', '.srow:nth-of-type(3) .srow__title-word'],
    ['service-3-text', 'Услуга 3 — описание', 'text', '.srow:nth-of-type(3) .srow__desc'],
    ['service-3-image-1', 'Услуга 3 — фото 1', 'image', '.srow:nth-of-type(3) .srow__imgwrap:nth-child(1) img', 'src'],
    ['service-3-image-2', 'Услуга 3 — фото 2', 'image', '.srow:nth-of-type(3) .srow__imgwrap:nth-child(2) img', 'src'],
    ['service-3-image-3', 'Услуга 3 — фото 3', 'image', '.srow:nth-of-type(3) .srow__imgwrap:nth-child(3) img', 'src'],
    ['service-3-image-4', 'Услуга 3 — фото 4', 'image', '.srow:nth-of-type(3) .srow__imgwrap:nth-child(4) img', 'src'],
    ['service-4-title', 'Услуга 4 — название', 'text', '.srow:nth-of-type(4) .srow__title-word'],
    ['service-4-text', 'Услуга 4 — описание', 'text', '.srow:nth-of-type(4) .srow__desc'],
    ['service-4-image-1', 'Услуга 4 — фото 1', 'image', '.srow:nth-of-type(4) .srow__imgwrap:nth-child(1) img', 'src'],
    ['service-4-image-2', 'Услуга 4 — фото 2', 'image', '.srow:nth-of-type(4) .srow__imgwrap:nth-child(2) img', 'src'],
    ['service-4-image-3', 'Услуга 4 — фото 3', 'image', '.srow:nth-of-type(4) .srow__imgwrap:nth-child(3) img', 'src'],
    ['service-4-image-4', 'Услуга 4 — фото 4', 'image', '.srow:nth-of-type(4) .srow__imgwrap:nth-child(4) img', 'src'],
    ['service-5-title', 'Услуга 5 — название', 'text', '.srow:nth-of-type(5) .srow__title-word'],
    ['service-5-text', 'Услуга 5 — описание', 'text', '.srow:nth-of-type(5) .srow__desc'],
    ['service-5-image-1', 'Услуга 5 — фото 1', 'image', '.srow:nth-of-type(5) .srow__imgwrap:nth-child(1) img', 'src'],
    ['service-5-image-2', 'Услуга 5 — фото 2', 'image', '.srow:nth-of-type(5) .srow__imgwrap:nth-child(2) img', 'src'],
    ['service-5-image-3', 'Услуга 5 — фото 3', 'image', '.srow:nth-of-type(5) .srow__imgwrap:nth-child(3) img', 'src'],
    ['service-5-image-4', 'Услуга 5 — фото 4', 'image', '.srow:nth-of-type(5) .srow__imgwrap:nth-child(4) img', 'src']
  ]},
  { section: 'Стоимость', fields: [
    ['pricing-label', 'Подпись над ценой', 'text', '.pricing__label'],
    ['pricing-text', 'Описание', 'text', '.pricing__desc'],
    ['pricing-quote', 'Цитата', 'text', '.pricing__quote-text']
  ]},
  { section: 'FAQ', fields: [
    ['faq-subtitle', 'Подзаголовок', 'text', '.faq__sub'],
    ['faq-q-1', 'Вопрос 1', 'text', '.faq__item:nth-child(1) .faq__q-text'],
    ['faq-a-1', 'Ответ 1', 'text', '.faq__item:nth-child(1) .faq__a p'],
    ['faq-q-2', 'Вопрос 2', 'text', '.faq__item:nth-child(2) .faq__q-text'],
    ['faq-a-2', 'Ответ 2', 'text', '.faq__item:nth-child(2) .faq__a p'],
    ['faq-q-3', 'Вопрос 3', 'text', '.faq__item:nth-child(3) .faq__q-text'],
    ['faq-a-3', 'Ответ 3', 'text', '.faq__item:nth-child(3) .faq__a p'],
    ['faq-q-4', 'Вопрос 4', 'text', '.faq__item:nth-child(4) .faq__q-text'],
    ['faq-a-4', 'Ответ 4', 'text', '.faq__item:nth-child(4) .faq__a p'],
    ['faq-q-5', 'Вопрос 5', 'text', '.faq__item:nth-child(5) .faq__q-text'],
    ['faq-a-5', 'Ответ 5', 'text', '.faq__item:nth-child(5) .faq__a p']
  ]},
  { section: 'Страница «Работы»', page: 'work', fields: [
    ['work-eyebrow', 'Надзаголовок', 'text', '.workhero__eyebrow'],
    ['work-title', 'Заголовок', 'text', '.workhero__word'],
    ['work-description', 'Описание', 'text', '.workhero__sub']
  ]},
  { section: 'Страница «Гайды»', fields: [
    ['journal-title', 'Главный заголовок', 'text', '.jhero__title'],
    ['journal-description', 'Подзаголовок', 'text', '.jhero__sub']
  ]},
  /* Ссылки применяются ко всем вхождениям (меню + футер + док) по data-cms-метке. */
  { section: 'Контакты и соцсети', fields: [
    ['link-telegram', 'Ссылка Telegram (и все кнопки «Написать в ТГ»)', 'href', '[data-cms="link-telegram"], .chat__tg'],
    ['link-behance', 'Ссылка Behance', 'href', '[data-cms="link-behance"]'],
    ['link-instagram', 'Ссылка Instagram', 'href', '[data-cms="link-instagram"]'],
    ['link-vk', 'Ссылка ВК', 'href', '[data-cms="link-vk"]']
  ]},
  { section: 'Кнопки и списки', fields: [
    ['btn-hero-cta', 'Кнопка на главном экране', 'text', '.hero__cta .btn-slide__label'],
    ['hero-service-1', 'Список услуг в шапке — 1', 'text', '.hero__services .hero__service:nth-child(1)'],
    ['hero-service-2', 'Список услуг в шапке — 2', 'text', '.hero__services .hero__service:nth-child(2)'],
    ['hero-service-3', 'Список услуг в шапке — 3', 'text', '.hero__services .hero__service:nth-child(3)'],
    ['hero-service-4', 'Список услуг в шапке — 4', 'text', '.hero__services .hero__service:nth-child(4)'],
    ['hero-service-5', 'Список услуг в шапке — 5', 'text', '.hero__services .hero__service:nth-child(5)']
  ]},
  { section: 'Видео', fields: [
    ['video-hero', 'Видео главного экрана (путь к mp4)', 'attr', '#hero video[data-video]', 'data-video'],
    ['video-work', 'Видеофон страницы кейсов (путь к mp4)', 'attr', '.sitebg video[data-video]', 'data-video']
  ]},
  { section: 'Футер', fields: [
    ['footer-chat-title', 'Заголовок блока «Напишите в чат»', 'text', '.footer__chat-title']
  ]},
  /* SEO. Селекторы намеренно ничего не находят на странице: значения подставляются
     в <title>/description на сервере (db.php → applySeo), а не через DOM. */
  { section: 'SEO — Главная', fields: [
    ['seo-home-title', 'SEO-заголовок (title, до 65 символов)', 'text', 'meta[data-seo="home-title"]'],
    ['seo-home-description', 'SEO-описание (description, до 160 символов)', 'text', 'meta[data-seo="home-description"]']
  ]},
  { section: 'SEO — Кейсы', page: 'work', fields: [
    ['seo-work-title', 'SEO-заголовок (title, до 65 символов)', 'text', 'meta[data-seo="work-title"]'],
    ['seo-work-description', 'SEO-описание (description, до 160 символов)', 'text', 'meta[data-seo="work-description"]']
  ]},
];
