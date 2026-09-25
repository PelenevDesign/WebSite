<?php
/* Универсальный шаблон страницы услуги. Сам по себе не вызывается —
   его подключает services/<slug>/index.php, задав $slug.
   Контент лежит в services/_data.php, разметка здесь ничего не знает
   про конкретную услугу. Новая услуга = запись в _data.php + каталог. */
require __DIR__ . '/../db.php';

/* Контент берём из админки, а пока таблица пуста — из services/_data.php.
   Откат обязателен: без него страницы легли бы до первого сохранения. */
$fromDb = null;
try { $fromDb = serviceBySlug($slug, false); } catch (Throwable $e) { $fromDb = null; }

if ($fromDb) {
  /* Пары из БД приходят как ['title'=>..,'text'=>..], а шаблон исторически
     ждёт [0=>..,1=>..]. Приводим здесь, чтобы разметка не знала про источник. */
  $pairs = function (array $rows): array {
    $out = [];
    foreach ($rows as $r) $out[] = [(string)($r['title'] ?? ''), (string)($r['text'] ?? '')];
    return $out;
  };
  $s = [
    'badge' => $fromDb['badge'],
    'h1' => $fromDb['h1'],
    'lead' => $fromDb['lead'],
    'seo_title' => $fromDb['seo_title'] !== '' ? $fromDb['seo_title'] : $fromDb['h1'] . ' | PELENEV.DESIGN',
    'seo_description' => $fromDb['seo_description'],
    'service_type' => $fromDb['service_type'] !== '' ? $fromDb['service_type'] : $fromDb['h1'],
    'cases_cat' => $fromDb['cases_cat'],
    'cta_title' => $fromDb['cta_title'],
    'cta_text' => $fromDb['cta_text'],
    'facts' => $pairs($fromDb['facts']),
    'works' => $pairs($fromDb['works']),
    'steps' => $pairs($fromDb['steps']),
    'faq' => $fromDb['faq'],
    'benefits' => $fromDb['benefits'],
    'reviews' => $fromDb['reviews'],
    'calc' => $fromDb['calc'],
    'hero_image' => $fromDb['hero_image'],
    'hero_video' => $fromDb['hero_video'],
    'og_image' => $fromDb['og_image'],
    'meta_robots' => $fromDb['meta_robots'],
    'intro_title' => $fromDb['intro_title'],
    'intro_text' => $fromDb['intro_text'],
    'steps_title' => $fromDb['steps_title'],
    'steps_text' => $fromDb['steps_text'],
    'cases_title' => $fromDb['cases_title'],
    'cta_primary_label' => $fromDb['cta_primary_label'],
    'cta_primary_href' => $fromDb['cta_primary_href'],
    'cta_secondary_label' => $fromDb['cta_secondary_label'],
    'cta_secondary_href' => $fromDb['cta_secondary_href'],
    'hero_primary_label' => $fromDb['hero_primary_label'],
    'hero_secondary_label' => $fromDb['hero_secondary_label'],
  ];
} else {
  $services = require __DIR__ . '/_data.php';
  if (!isset($services[$slug])) { http_response_code(404); readfile(__DIR__ . '/../404.html'); exit; }
  $s = $services[$slug];
}

/* Значения по умолчанию — чтобы шаблон не проверял isset на каждом шагу. */
$s += [
  'faq' => [], 'benefits' => [], 'reviews' => [], 'hero_image' => '', 'hero_video' => '',
  'og_image' => '', 'meta_robots' => 'index,follow',
  'intro_title' => 'Что входит в работу', 'intro_text' => 'Полный цикл под ключ: вы не собираете подрядчиков по частям и не доплачиваете за то, что должно быть в базе.',
  'steps_title' => 'Как идёт работа', 'steps_text' => 'Четыре этапа с понятным результатом на каждом — вы всегда знаете, на какой стадии проект.',
  'cases_title' => 'Кейсы по услуге',
  'cta_primary_label' => 'Обсудить проект', 'cta_primary_href' => '/#write',
  'cta_secondary_label' => 'Написать в Telegram', 'cta_secondary_href' => 'https://t.me/dmitrypelenev',
  'hero_primary_label' => 'Обсудить проект', 'hero_secondary_label' => 'Смотреть кейсы',
];

/* «Кейсы на странице» в админке для этого слага упорно возвращались к «Сайты»
   (после трёх правок через /admin страница всё ещё показывала сайтовые кейсы
   вместо дизайнерских) — жёстко фиксируем категорию здесь, чтобы не зависеть
   от поля в БД. Если позже понадобится снова управлять этим через админку,
   просто удалите эту строку. */
if ($slug === 'web-design') $s['cases_cat'] = 'graphic';

try { $siteContent = allContent(); } catch (Throwable $e) { $siteContent = []; }
$integrationsHtml = '';
foreach (['integration-metrika', 'integration-ga', 'integration-gtm'] as $k) {
  $v = trim((string)($siteContent[$k] ?? ''));
  if ($v !== '') $integrationsHtml .= "\n" . $v;
}

$base = rtrim((string)(config()['site_url'] ?? 'https://pelenevdesign.ru'), '/');
$esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$fmt = fn(int $n) => number_format($n, 0, ',', ' ');

$canonical = $base . '/services/' . $slug . '/';
$title = $s['seo_title'];
$description = $s['seo_description'];

/* Кейсы этой услуги: только своя категория. Чужими кейсами достраиваем сетку
   лишь когда своих совсем мало (меньше 3) — иначе на них показывать нечего,
   но 5-6 релевантных кейсов не должны разбавляться посторонним кейсом
   только чтобы дотянуть до круглого числа. Показываем до 6, чтобы масонри
   не разрасталось. */
$cases = [];
try {
  $primaryCases = [];
  $otherCases = [];
  foreach (projectRows(false) as $row) {
    if (in_array($s['cases_cat'], (array)$row['categories'], true)) $primaryCases[] = $row;
    else $otherCases[] = $row;
  }
  $cases = count($primaryCases) >= 3
    ? array_slice($primaryCases, 0, 6)
    : array_slice(array_merge($primaryCases, $otherCases), 0, 6);
} catch (Throwable $e) { $cases = []; }
$caseCatLabels = ['site' => 'Сайт', 'ai-site' => 'AI-сайт', 'ai-content' => 'AI-контент', 'graphic' => 'Дизайн'];

$jsonLd = json_encode([
  '@context' => 'https://schema.org',
  '@graph' => [
    [
      '@type' => 'Service',
      '@id' => $canonical . '#service',
      'name' => $s['h1'],
      'serviceType' => $s['service_type'],
      'url' => $canonical,
      'description' => $description,
      'areaServed' => ['@type' => 'Country', 'name' => 'Россия'],
      'provider' => ['@type' => 'Organization', 'name' => 'PELENEV.DESIGN', 'url' => $base . '/'],
    ],
    [
      '@type' => 'BreadcrumbList',
      'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Главная', 'item' => $base . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Услуги', 'item' => $base . '/#services'],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $s['h1'], 'item' => $canonical],
      ],
    ],
  ],
], JSON_UNESCAPED_UNICODE);

/* FAQ отдаём отдельным блоком микроразметки: он появляется только когда
   вопросы заполнены, иначе поисковик получит пустой FAQPage. */
$faqLd = '';
if (!empty($s['faq'])) {
  $faqLd = json_encode([
    '@context' => 'https://schema.org',
    '@type' => 'FAQPage',
    'mainEntity' => array_map(fn($q) => [
      '@type' => 'Question',
      'name' => $q['title'],
      'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q['text']],
    ], $s['faq']),
  ], JSON_UNESCAPED_UNICODE);
}

/* Чередование плит считаем на лету: секции FAQ/преимуществ/отзывов
   опциональны, и жёстко прописанные классы разъезжались бы при их отсутствии.
   Хиро всегда тёмное, дальше — через одну.
   Часть секций (утверждение, кейсы, отзывы, калькулятор, финальный CTA)
   принудительно светлые или тёмные — их внутренние компоненты рассчитаны
   только на один фон (см. комментарии у каждой). $forcePlate() не меняет
   их класс, а лишь запоминает, от какого цвета отталкиваться дальше —
   иначе следующая обычная секция могла совпасть по тону с предыдущей
   принудительной и чередование визуально пропадало бы. */
$lastDark = true; // хиро всегда тёмное
$plate = function () use (&$lastDark) { $lastDark = !$lastDark; return $lastDark ? ' svc-card--dark' : ''; };
$forcePlate = function (bool $dark) use (&$lastDark) { $lastDark = $dark; };

$works = $s['works'];
$steps = $s['steps'];
$calc = $s['calc'];
$calcTypes = $calc['types'];

/* Заголовок-утверждение под «Что входит в работу»: текст свой на каждую
   услугу, но одинаковый по смыслу приём — не через CMS, чтобы не тащить
   ради четырёх фраз новое поле в БД и админку. Нет записи для slug —
   секция просто не рендерится (так у vibe-coding, для неё текста нет). */
$svcStatement = [
  'websites' => ['Вам не нужно разбираться в тонкостях создания сайтов', 'Вам достаточно объяснить задачу'],
  'web-design' => ['Вам не нужно продумывать оформление самому', 'Достаточно рассказать о бренде и задаче — я соберу дизайн сайта, который выглядит профессионально и приводит заявки.'],
  'ai-content' => ['Вам не нужна студия и модели', 'Достаточно показать продукт или описать идею — я сгенерирую визуал, который выглядит как настоящая съёмка.'],
  'graphic-design' => ['Вам не нужно объяснять, «как должно выглядеть»', 'Достаточно описать задачу — я предложу варианты, из которых останется просто выбрать.'],
][$slug] ?? null;
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= $esc($title) ?></title>
  <meta name="description" content="<?= $esc($description) ?>">
  <link rel="canonical" href="<?= $esc($canonical) ?>">
  <meta name="robots" content="<?= $esc($s['meta_robots']) ?>">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#0A0A0A">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PELENEV.DESIGN">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="<?= $esc($canonical) ?>">
  <meta property="og:title" content="<?= $esc($title) ?>">
  <meta property="og:description" content="<?= $esc($description) ?>">
  <?php $ogImage = $s['og_image'] !== '' ? $s['og_image'] : ($s['hero_image'] !== '' ? $s['hero_image'] : '/assets/og-preview.jpg');
        $ogAbs = preg_match('#^https?://#', $ogImage) ? $ogImage : $base . '/' . ltrim($ogImage, '/'); ?>
  <meta property="og:image" content="<?= $esc($ogAbs) ?>">
  <meta name="twitter:image" content="<?= $esc($ogAbs) ?>">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json"><?= $jsonLd ?></script>
<?php if ($faqLd !== ''): ?>  <script type="application/ld+json"><?= $faqLd ?></script>
<?php endif; ?>
  <link rel="preconnect" href="https://rsms.me/" crossorigin>
  <!-- Шрифт не должен задерживать первую отрисовку: грузим как preload,
       затем сами превращаем в stylesheet. Без JS работает noscript-ветка. -->
  <link rel="preload" as="style" href="https://rsms.me/inter/inter.css" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://rsms.me/inter/inter.css"></noscript>
  <link rel="stylesheet" href="/styles.css?v=106">
  <link rel="stylesheet" href="/case.css?v=13">
  <link rel="stylesheet" href="/service.css?v=21">
  <link rel="stylesheet" href="/reviews.css?v=2">
<?= $integrationsHtml ?>
  <script src="/metrika.js?v=1" defer></script>
</head>
<body class="case-page page-service">
  <noscript><div><img src="https://mc.yandex.ru/watch/111032105" style="position:absolute;left:-9999px" alt=""></div></noscript>

  <header class="case-top">
    <div class="case-top__inner">
      <div class="top-left">
        <a href="/#services" class="back-btn" aria-label="Назад к услугам" title="Назад к услугам">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 6 11l6.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="/" class="wordmark case-top__mark" aria-label="PELENEV.DESIGN — на главную">
          <svg class="wordmark__logo" viewBox="0 0 249.08 176.4" fill="currentColor" aria-hidden="true"><path d="M201.77,0H0L47.83,47.84H182.34c12,0,19.43,26.9,0,32.88H106.05a77.76,77.76,0,0,0-75.63,95.67,77.53,77.53,0,0,1,67.1-55H98a20.61,20.61,0,0,0,3.42-.22h.12v-.06h100.2C268.53,119.58,261.06-1.48,201.77,0Z" transform="translate(0 0.01)"/></svg>
          <span class="wordmark__text">PELENEV<span class="wordmark__dot">.</span>DESIGN</span>
        </a>
      </div>
      <nav class="case-top__nav" aria-label="Навигация по сайту">
        <a class="case-top__link" href="/#hero">Главная</a>
        <a class="case-top__link" href="/#services">Услуги</a>
        <a class="case-top__link" href="/work.php">Кейсы</a>
        <a class="case-top__link" href="/journal.php">Гайды</a>
        <a class="case-top__link" href="/#faq">FAQ</a>
        <a data-cms="link-telegram" class="pill pill--light case-top__cta" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Обсудить проект</a>
      </nav>
    </div>
  </header>

  <main class="svc">
    <!-- Плиты: тёмная → светлая → тёмная → светлая → тёмная, как ритм главной.
         data-card включает «наезд» со scale, data-reveal — появление содержимого. -->
    <section class="svc-card svc-card--dark svc-hero" data-card>
      <!-- Тот же видеофон, что в герое главной. Файл подключает service.js
           на всех устройствах; при reduced-motion остаётся постер. -->
      <div class="svc-hero__bg" aria-hidden="true">
        <?php /* Видеофон один на весь сайт: тот же ролик, что в герое главной
                 (ключ CMS video-hero). Персональные hero_image/hero_video услуги
                 намеренно игнорируем — заказчик просил единый фон. */ ?>
        <?php $heroVideo = trim((string)($siteContent['video-hero'] ?? '')) ?: 'assets/video/hero.mp4'; ?>
        <video class="svc-hero__media" data-video="/<?= $esc(ltrim($heroVideo, '/')) ?>" poster="/assets/hero-poster.svg" autoplay muted loop playsinline preload="metadata"></video>
      </div>
      <div class="svc-card__inner">
        <nav class="case__crumbs" aria-label="Хлебные крошки">
          <a href="/">Главная</a><span aria-hidden="true">/</span><a href="/#services">Услуги</a><span aria-hidden="true">/</span><span aria-current="page"><?= $esc($s['h1']) ?></span>
        </nav>
        <div class="svc__hero">
          <div class="svc__hero-main">
            <p class="svc__badge"><?= $esc($s['badge']) ?></p>
            <h1 class="svc__title"><?= $esc($s['h1']) ?></h1>
            <p class="svc__lead"><?= $esc($s['lead']) ?></p>
            <div class="svc__actions">
              <a class="pill pill--light" href="#brief"><?= $esc($s['hero_primary_label']) ?> <span class="pill__arrow" aria-hidden="true">&rarr;</span></a>
              <a class="pill pill--outline" href="/work.php#<?= $esc($s['cases_cat']) ?>"><?= $esc($s['hero_secondary_label']) ?></a>
            </div>
          </div>
          <dl class="svc__facts svc-glass">
            <?php foreach ($s['facts'] as [$fk, $fv]): ?>
            <div class="svc__fact"><dt><?= $esc($fk) ?></dt><dd><?= $esc($fv) ?></dd></div>
            <?php endforeach; ?>
          </dl>
        </div>
      </div>
    </section>

    

    <section class="svc-card<?= $plate() ?>" data-card aria-labelledby="svc-includes">
      <div class="svc-card__inner">
        <div class="svc__block-head">
          <div>
            <h2 class="svc__h2" id="svc-includes"><?= $esc($s['intro_title']) ?></h2>
            <p class="svc__intro"><?= $esc($s['intro_text']) ?></p>
          </div>
        </div>
        <ol class="svc__works" data-reveal>
          <?php foreach ($works as $i => [$name, $text]): ?>
          <li class="svc__work">
            <span class="svc__work-num"><?= str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
            <h3 class="svc__work-title"><?= $esc($name) ?></h3>
            <p class="svc__work-text"><?= $esc($text) ?></p>
          </li>
          <?php endforeach; ?>
        </ol>
      </div>
    </section>

    <?php if ($svcStatement): [$stTitle, $stText] = $svcStatement; $forcePlate(true); ?>
    <section class="svc-card svc-card--dark svc-statement" data-card aria-labelledby="svc-statement">
      <div class="svc-card__inner" data-reveal>
        <h2 class="svc__h2" id="svc-statement"><?= $esc($stTitle) ?></h2>
        <p class="svc-statement__text"><?= $esc($stText) ?></p>
      </div>
    </section>
    <?php endif; ?>

    <section class="svc-card<?= $plate() ?>" data-card aria-labelledby="svc-steps">
      <div class="svc-card__inner">
        <h2 class="svc__h2" id="svc-steps"><?= $esc($s['steps_title']) ?></h2>
        <p class="svc__intro"><?= $esc($s['steps_text']) ?></p>
        <ol class="svc__steps" data-reveal>
          <?php foreach ($steps as $i => [$name, $text]): ?>
          <li class="svc__step">
            <span class="svc__step-num"><?= str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
            <h3 class="svc__step-title"><?= $esc($name) ?></h3>
            <p class="svc__step-text"><?= $esc($text) ?></p>
          </li>
          <?php endforeach; ?>
        </ol>
      </div>
    </section>

    <?php if ($cases): ?>
    <?php
    /* Секция всегда тёмная — жёстко добавляем модификатор своим классом,
       $forcePlate(true) лишь двигает состояние чередования дальше. Из
       общего «наезда» плит (data-card в service.js) секция намеренно
       исключена — карточки проявляются по одной при попадании в кадр,
       собирается в buildCasesReveal() (service.js) по классу .svc-cases-plate. */
    $forcePlate(true);
    ?>
    <section class="svc-card svc-card--dark svc-cases-plate" aria-labelledby="svc-cases">
      <div class="svc-card__inner">
        <div class="svc__block-head">
          <h2 class="svc__h2" id="svc-cases"><?= $esc($s['cases_title']) ?></h2>
          <a class="svc__more" href="/work.php#<?= $esc($s['cases_cat']) ?>">Все кейсы &rarr;</a>
        </div>
        <ul class="svc__cases">
          <?php foreach ($cases as $c): ?>
          <li class="svc__case">
            <a href="/case/<?= $esc($c['slug']) ?>/">
              <span class="svc__case-media"><?php if (!empty($c['cover'])): ?><?= coverMediaTag((string)$c['cover'], (string)$c['title']) ?><?php endif; ?></span>
              <span class="svc__case-meta">
                <span class="svc__case-title"><?= $esc($c['title']) ?></span>
                <?php if ($c['categories']): ?>
                <span class="svc__case-tags">
                  <?php foreach ((array)$c['categories'] as $cat): ?>
                  <span class="svc__case-tag"><?= $esc($caseCatLabels[$cat] ?? $cat) ?></span>
                  <?php endforeach; ?>
                </span>
                <?php endif; ?>
              </span>
            </a>
          </li>
          <?php endforeach; ?>
        </ul>
        <a class="pill pill--outline svc__cases-more" href="/work.php#<?= $esc($s['cases_cat']) ?>">Все работы <span class="pill__arrow" aria-hidden="true">&rarr;</span></a>
      </div>
    </section>

    <?php if ($slug === 'websites'): $forcePlate(true); ?>
    <!-- Промо-акция: только на «Сайты под ключ», сразу после кейсов. -->
    <section class="svc-card svc-card--dark svc-promo" data-card aria-labelledby="svc-promo">
      <div class="svc-card__inner" data-reveal>
        <h2 class="svc__h2 svc-promo__title" id="svc-promo">Сайт под ключ за 35 000 ₽</h2>
        <p class="svc-promo__text">Плюс административная панель — в подарок, чтобы обновлять тексты, фото и кейсы самостоятельно, без моей помощи.</p>
        <ul class="svc-promo__perks">
          <li>Дизайн под ваш бренд — без шаблонов</li>
          <li>Админ-панель в подарок</li>
          <li>Фиксированная цена, без доплат</li>
        </ul>
        <a class="pill pill--light svc-promo__cta" href="#brief">Обсудить проект <span class="pill__arrow" aria-hidden="true">&rarr;</span></a>
      </div>
    </section>
    <?php endif; ?>

    <!-- Отзывы: та же лента, что на главной, и всегда на тёмной плите —
         как на главной (.section--dark). Наполняет reviews.js
         из /assets/reviews/; пока файлов нет — секция скрывается сама. -->
    <?php $forcePlate(true); ?>
    <section class="svc-card svc-card--dark rvw" data-card aria-labelledby="rvw-title">
      <div class="svc-card__inner">
        <div class="rvw__head">
          <p class="rvw__eyebrow" id="rvw-title">Мнения клиентов</p>
        </div>
        <div class="rvw__viewport" data-reviews></div>
      </div>
    </section>

    <?php /* Плита всегда светлая — панель итога (.calc__total) сама тёмная
             (background: var(--ink)) и рассчитана на контраст со светлой
             плитой вокруг; на тёмной плите она слилась бы в один цвет
             и стала не видна. */
    $forcePlate(false); ?>
    <section class="svc-card svc-calc-card" data-card aria-labelledby="calc-title">
      <div class="svc-card__inner">
        <div class="svc__block-head">
          <div>
            <h2 class="svc__h2" id="calc-title"><?= $esc($calc['title']) ?></h2>
            <p class="svc__intro"><?= $esc($calc['intro']) ?></p>
          </div>
        </div>

        <div class="calc">
          <div class="calc__options">
            <fieldset class="calc__group">
              <legend class="calc__legend">Тип сайта</legend>
              <?php foreach ($calcTypes as $i => $t): ?>
              <label class="calc__opt calc__opt--type<?= $i === 0 ? ' is-on' : '' ?>">
                <input type="radio" name="calc-type" class="calc__input calc__input--type"
                       data-type="<?= $esc($t['id']) ?>" data-price="<?= (int)$t['price'] ?>"<?= $t['from'] ? ' data-from' : '' ?><?= $i === 0 ? ' checked' : '' ?>>
                <span class="calc__radio" aria-hidden="true"></span>
                <span class="calc__opt-body">
                  <span class="calc__opt-title"><?= $esc($t['title']) ?></span>
                  <span class="calc__opt-text"><?= $esc($t['text']) ?></span>
                </span>
                <span class="calc__opt-price"><?= $t['from'] ? 'от ' : '' ?><?= $fmt((int)$t['price']) ?>&nbsp;&#8381;</span>
              </label>
              <?php endforeach; ?>
            </fieldset>

            <fieldset class="calc__group">
              <legend class="calc__legend">Дополнительно</legend>
              <?php foreach ($calc['options'] as $o): ?>
              <label class="calc__opt"<?= !empty($o['free_with']) ? ' data-free-with="' . $esc($o['free_with']) . '"' : '' ?>>
                <input type="checkbox" class="calc__input" data-add="<?= (int)$o['price'] ?>"<?= !empty($o['from']) ? ' data-from' : '' ?><?= !empty($o['note']) ? ' data-note-toggle' : '' ?>>
                <span class="calc__switch" aria-hidden="true"></span>
                <span class="calc__opt-body">
                  <span class="calc__opt-title"><?= $esc($o['title']) ?></span>
                  <span class="calc__opt-text"><?= $esc($o['text']) ?></span>
                </span>
                <span class="calc__opt-price"<?= !empty($o['free_with']) ? ' data-price-label data-price-default="' . ($o['from'] ? 'от ' : '') . '+' . $fmt((int)$o['price']) . '&nbsp;&#8381;" data-price-included="включено"' : '' ?>><?= !empty($o['from']) ? 'от ' : '' ?>+<?= $fmt((int)$o['price']) ?>&nbsp;&#8381;</span>
              </label>
              <?php endforeach; ?>
            </fieldset>
          </div>

          <aside class="calc__total">
            <p class="calc__total-label">Стоимость проекта</p>
            <p class="calc__total-value"><span class="calc__from" data-from-label hidden>от&nbsp;</span><span data-total><?= $fmt((int)$calcTypes[0]['price']) ?></span>&nbsp;&#8381;</p>
            <?php $noteText=''; foreach ($calc['options'] as $o) if (!empty($o['note'])) { $noteText=$o['note']; break; } ?>
            <?php if ($noteText !== ''): ?><p class="calc__note" data-note hidden><?= $esc($noteText) ?></p><?php endif; ?>
            <a class="pill pill--light calc__cta" href="/#write">Обсудить проект <span class="pill__arrow" aria-hidden="true">&rarr;</span></a>
            <p class="calc__hint">Ни к чему не обязывает — обсудим задачу и уточним смету.</p>
          </aside>
        </div>
      </div>
    </section>
    <?php endif; ?>

    <?php if ($s['benefits']): ?>
    <section class="svc-card<?= $plate() ?>" data-card aria-labelledby="svc-benefits">
      <div class="svc-card__inner">
        <h2 class="svc__h2" id="svc-benefits">Почему это работает</h2>
        <ul class="svc__works" data-reveal>
          <?php foreach ($s['benefits'] as $i => $b): ?>
          <li class="svc__work">
            <span class="svc__work-num"><?= str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
            <h3 class="svc__work-title"><?= $esc($b['title']) ?></h3>
            <p class="svc__work-text"><?= $esc($b['text']) ?></p>
          </li>
          <?php endforeach; ?>
        </ul>
      </div>
    </section>
    <?php endif; ?>

    <?php if ($s['reviews']): ?>
    <section class="svc-card<?= $plate() ?>" data-card aria-labelledby="svc-reviews">
      <div class="svc-card__inner">
        <h2 class="svc__h2" id="svc-reviews">Отзывы</h2>
        <ul class="svc__reviews" data-reveal>
          <?php foreach ($s['reviews'] as $r): ?>
          <li class="svc__review">
            <p class="svc__review-text"><?= nl2br($esc($r['text'])) ?></p>
            <div class="svc__review-who">
              <?php if (!empty($r['avatar'])): ?><img class="svc__review-ava" src="<?= $esc($r['avatar']) ?>" alt="" loading="lazy" decoding="async"><?php endif; ?>
              <span>
                <span class="svc__review-name"><?= $esc($r['name']) ?></span>
                <?php if (!empty($r['role'])): ?><span class="svc__review-role"><?= $esc($r['role']) ?></span><?php endif; ?>
              </span>
            </div>
          </li>
          <?php endforeach; ?>
        </ul>
      </div>
    </section>
    <?php endif; ?>

    <?php if ($s['faq']): ?>
    <section class="svc-card<?= $plate() ?>" data-card aria-labelledby="svc-faq">
      <div class="svc-card__inner">
        <h2 class="svc__h2" id="svc-faq">Частые вопросы</h2>
        <div class="svc__faq" data-reveal>
          <?php foreach ($s['faq'] as $q): ?>
          <details class="svc__faq-item">
            <summary><?= $esc($q['title']) ?><span class="svc__faq-sign" aria-hidden="true"></span></summary>
            <div class="svc__faq-answer"><?= nl2br($esc($q['text'])) ?></div>
          </details>
          <?php endforeach; ?>
        </div>
      </div>
    </section>
    <?php endif; ?>

    <?php /* Плита всегда светлая — кнопки ниже (pill--dark, pill--outline-dark)
             рассчитаны только на светлый фон, на тёмном текст/рамка становятся
             почти невидимыми. Раньше это отдавалось чередованию и один раз
             реально уехало на тёмную. */
    $forcePlate(false); ?>
    <section class="svc-card svc-final" id="brief" data-card>
      <div class="svc-card__inner" data-reveal>
        <h2 class="svc__h2"><?= $esc($s['cta_title']) ?></h2>
        <p class="svc-final__text"><?= $esc($s['cta_text']) ?></p>
        <?php /* Плита светлая, поэтому кнопки тёмные: pill--light на белом фоне
                 не виден. Главная — форма заявки, Telegram — запасной канал. */ ?>
        <div class="svc-final__actions">
          <a class="pill pill--dark pill--calc" href="<?= $esc($s['cta_primary_href']) ?>"><?= $esc($s['cta_primary_label']) ?> <span class="pill__arrow" aria-hidden="true">&rarr;</span></a>
          <a class="pill pill--outline-dark" href="<?= $esc($s['cta_secondary_href']) ?>" target="_blank" rel="noopener noreferrer"><?= $esc($s['cta_secondary_label']) ?></a>
        </div>
      </div>
    </section>
  </main>

  <footer class="case-foot">
    <div class="case-foot__inner">
      <nav class="case-foot__nav" aria-label="Навигация">
        <a href="/">Главная</a>
        <a href="/#services">Услуги</a>
        <a href="/work.php">Кейсы</a>
        <a href="/journal.php">Гайды</a>
        <a href="/#faq">FAQ</a>
      </nav>
      <nav class="case-foot__nav" aria-label="Соцсети">
        <a data-cms="link-telegram" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Telegram</a>
        <a data-cms="link-behance" href="https://www.behance.net/Pelenev-design" target="_blank" rel="noopener noreferrer">Behance</a>
        <a data-cms="link-vk" href="https://vk.ru/pelenev_design" target="_blank" rel="noopener noreferrer">&#1042;&#1050;</a>
      </nav>
      <p class="case-foot__legal">&copy; <?= date('Y') ?> PELENEV.DESIGN &middot; <a href="/privacy.html">Политика конфиденциальности</a></p>
    </div>
  </footer>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js" crossorigin="anonymous"></script>
  <script src="/cms-schema.js?v=6"></script>
  <script src="/cms.js?v=6"></script>
  <script src="/service.js?v=11"></script>
  <script src="/reviews.js?v=2" defer></script>
  <script src="/cookie.js?v=1"></script>
  <script src="/leadmagnet.js?v=24" defer></script>
</body>
</html>
