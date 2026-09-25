<?php
require __DIR__ . '/db.php';
try { $siteContent = allContent(); } catch (Throwable $e) { $siteContent = []; }
$integrationsHtml = '';
foreach (['integration-metrika', 'integration-ga', 'integration-gtm'] as $k) { $v = trim((string)($siteContent[$k] ?? '')); if ($v !== '') $integrationsHtml .= "\n" . $v; }

$base = rtrim((string)(config()['site_url'] ?? 'https://pelenevdesign.ru'), '/');
$esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');

$categories = categoryRows();
$catNames = array_column($categories, 'name', 'id');

/* Избранная — та, что отмечена в админке; если такой нет, витрина просто без неё. */
$featured = null;
try {
  $stmt = db()->prepare("SELECT * FROM cms_articles WHERE is_featured = 1 AND (status = 'published' OR (status = 'scheduled' AND published_at <= NOW())) LIMIT 1");
  $stmt->execute();
  $row = $stmt->fetch();
  if ($row) { hydrateArticleRow($row); $featured = $row; }
} catch (Throwable $ex) { $featured = null; }

$page = articleQuery(['limit' => 9, 'exclude' => $featured['id'] ?? 0], false);
$articles = $page['items'];
$total = $page['total'] - ($featured ? 1 : 0);
$hasMore = $total > count($articles);

$title = 'Гайды — экспертные статьи о дизайне и сайтах | PELENEV.DESIGN';
$description = 'Гайды PELENEV.DESIGN: разборы, инструкции и заметки о веб-дизайне, разработке сайтов и AI-инструментах для бизнеса.';
$journalHeroTitle = trim((string)($siteContent['journal-title'] ?? '')) ?: 'Гайды';
$journalHeroDescription = trim((string)($siteContent['journal-description'] ?? '')) ?: 'Разборы, гайды и заметки о веб-дизайне, разработке сайтов и AI-инструментах — то, что помогает принимать решения, а не просто читать.';
$canonical = $base . '/journal';

$jsonLd = json_encode([
  '@context' => 'https://schema.org',
  '@graph' => [
    [
      '@type' => 'CollectionPage',
      '@id' => $canonical . '#page',
      'url' => $canonical,
      'name' => 'Гайды PELENEV.DESIGN',
      'description' => $description,
      'inLanguage' => 'ru-RU',
      'isPartOf' => ['@id' => $base . '/#website'],
    ],
    [
      '@type' => 'BreadcrumbList',
      'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Главная', 'item' => $base . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Гайды', 'item' => $canonical],
      ],
    ],
  ],
], JSON_UNESCAPED_UNICODE);

/* Карточка статьи — переиспользуется и для сетки, и (тем же HTML-шаблоном
   на стороне JS) при подгрузке следующих страниц кнопкой «Загрузить ещё». */
function articleCardHTML(array $a, array $catNames, callable $esc): string {
  $cats = array_values(array_filter(array_map(fn($id) => $catNames[$id] ?? null, $a['category_ids'])));
  $date = !empty($a['published_at']) ? date('d.m.Y', strtotime((string)$a['published_at'])) : '';
  return '<article class="jcard">'
    . '<a class="jcard__media" href="/article.php?slug=' . rawurlencode($a['slug']) . '">'
    . ($a['cover'] ? coverMediaTag((string)$a['cover'], (string)$a['title']) : '<span class="jcard__media-empty" aria-hidden="true"></span>')
    . '</a>'
    . '<div class="jcard__body">'
    . ($cats ? '<span class="jcard__cat">' . $esc($cats[0]) . '</span>' : '')
    . '<h3 class="jcard__title"><a href="/article.php?slug=' . rawurlencode($a['slug']) . '">' . $esc($a['title']) . '</a></h3>'
    . ($a['excerpt'] ? '<p class="jcard__excerpt">' . $esc($a['excerpt']) . '</p>' : '')
    . '<div class="jcard__meta">'
    . '<span>' . $esc($a['author_name'] ?: 'PELENEV.DESIGN') . '</span>'
    . ($date ? '<span>' . $esc($date) . '</span>' : '')
    . '<span>' . (int)$a['reading_time_min'] . ' мин чтения</span>'
    . '</div></div></article>';
}
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= $esc($title) ?></title>
  <meta name="description" content="<?= $esc($description) ?>">
  <link rel="canonical" href="<?= $esc($canonical) ?>">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#FFFFFF">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PELENEV.DESIGN">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="<?= $esc($canonical) ?>">
  <meta property="og:title" content="<?= $esc($title) ?>">
  <meta property="og:description" content="<?= $esc($description) ?>">
  <meta property="og:image" content="<?= $esc($base . '/assets/og-preview.jpg') ?>">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" type="application/rss+xml" title="PELENEV.DESIGN — Гайды" href="/rss.xml">
  <script type="application/ld+json"><?= $jsonLd ?></script>
  <link rel="stylesheet" href="/styles.css?v=109">
  <link rel="stylesheet" href="/journal.css?v=9">
<?= $integrationsHtml ?>
  <script src="/metrika.js?v=1" defer></script>
</head>
<body class="page-journal">
  <noscript><div><img src="https://mc.yandex.ru/watch/111032105" style="position:absolute;left:-9999px" alt=""></div></noscript>

  <header class="j-top">
    <div class="j-top__inner">
      <a href="/" class="wordmark j-top__mark" aria-label="PELENEV.DESIGN — на главную">
        <svg class="wordmark__logo" viewBox="0 0 249.08 176.4" fill="currentColor" aria-hidden="true"><path d="M201.77,0H0L47.83,47.84H182.34c12,0,19.43,26.9,0,32.88H106.05a77.76,77.76,0,0,0-75.63,95.67,77.53,77.53,0,0,1,67.1-55H98a20.61,20.61,0,0,0,3.42-.22h.12v-.06h100.2C268.53,119.58,261.06-1.48,201.77,0Z" transform="translate(0 0.01)"/></svg>
        <span class="wordmark__text">PELENEV<span class="wordmark__dot">.</span>DESIGN</span>
      </a>
      <?php /* Тот же набор пунктов, что в меню главной (без «Контактов»). */ ?>
      <nav class="j-top__nav" aria-label="Навигация по сайту">
        <a class="j-top__link" href="/#hero">Главная</a>
        <a class="j-top__link" href="/#services">Услуги</a>
        <a class="j-top__link" href="/work.php">Кейсы</a>
        <a class="j-top__link" href="/journal.php">Гайды</a>
        <a class="j-top__link" href="/#faq">FAQ</a>
        <a data-cms="link-telegram" class="pill pill--dark j-top__cta" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Обсудить проект</a>
      </nav>
    </div>
  </header>

  <main class="journal">
    <header class="jhero">
      <div class="container">
        <p class="jhero__eyebrow">Экспертные гайды</p>
        <h1 class="jhero__title"><?= $esc($journalHeroTitle) ?></h1>
        <p class="jhero__sub"><?= $esc($journalHeroDescription) ?></p>
        <div class="jhero__search">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.6"/><path d="m17 17-4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input type="search" id="journal-search" placeholder="Поиск по статьям" aria-label="Поиск по статьям">
        </div>
      </div>
    </header>

    <?php if ($featured): ?>
    <section class="jfeatured-wrap">
      <div class="container">
        <a class="jfeatured" href="/article.php?slug=<?= rawurlencode($featured['slug']) ?>">
          <div class="jfeatured__media">
            <?php if ($featured['cover']): ?><?= coverMediaTag((string)$featured['cover'], (string)$featured['title'], ['eager' => true]) ?><?php endif; ?>
          </div>
          <div class="jfeatured__body">
            <span class="jfeatured__badge">Избранное</span>
            <?php $fcats = array_values(array_filter(array_map(fn($id) => $catNames[$id] ?? null, $featured['category_ids']))); if ($fcats): ?><span class="jcard__cat"><?= $esc($fcats[0]) ?></span><?php endif; ?>
            <h2 class="jfeatured__title"><?= $esc($featured['title']) ?></h2>
            <?php if ($featured['excerpt']): ?><p class="jfeatured__excerpt"><?= $esc($featured['excerpt']) ?></p><?php endif; ?>
            <div class="jcard__meta">
              <span><?= $esc($featured['author_name'] ?: 'PELENEV.DESIGN') ?></span>
              <?php if (!empty($featured['published_at'])): ?><span><?= date('d.m.Y', strtotime((string)$featured['published_at'])) ?></span><?php endif; ?>
              <span><?= (int)$featured['reading_time_min'] ?> мин чтения</span>
            </div>
          </div>
        </a>
      </div>
    </section>
    <?php endif; ?>

    <section class="jgrid-wrap">
      <div class="container">
        <?php if ($categories): ?>
        <div class="jcats" role="tablist" aria-label="Категории гайдов">
          <button type="button" class="jcat is-active" data-cat="0" role="tab" aria-selected="true">Все</button>
          <?php foreach ($categories as $c): if ($c['parent_id']) continue; ?>
          <button type="button" class="jcat" data-cat="<?= (int)$c['id'] ?>" role="tab" aria-selected="false"><?= $esc($c['name']) ?></button>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <div class="jgrid" id="journal-grid" data-total="<?= (int)$total ?>" data-loaded="<?= count($articles) ?>">
          <?php if (!$articles && !$featured): ?>
          <p class="jempty">Мы готовим первые материалы — загляните чуть позже.</p>
          <?php else: foreach ($articles as $a): ?>
          <?= articleCardHTML($a, $catNames, $esc) ?>
          <?php endforeach; endif; ?>
        </div>

        <?php if ($hasMore): ?>
        <div class="jgrid__more">
          <button type="button" class="pill pill--dark" id="journal-load-more">Загрузить ещё</button>
        </div>
        <?php endif; ?>
      </div>
    </section>
  </main>

  <footer class="j-foot">
    <div class="j-foot__inner">
      <nav class="j-foot__nav" aria-label="Навигация">
        <a href="/">Главная</a>
        <a href="/#services">Услуги</a>
        <a href="/work.php">Кейсы</a>
        <a href="/journal.php">Гайды</a>
        <a href="/#faq">FAQ</a>
      </nav>
      <nav class="j-foot__nav" aria-label="Соцсети">
        <a data-cms="link-telegram" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Telegram</a>
        <a data-cms="link-behance" href="https://www.behance.net/Pelenev-design" target="_blank" rel="noopener noreferrer">Behance</a>
        <a data-cms="link-vk" href="https://vk.ru/pelenev_design" target="_blank" rel="noopener noreferrer">ВК</a>
      </nav>
      <p class="j-foot__legal">&copy; <?= date('Y') ?> PELENEV.DESIGN · <a href="/privacy.html">Политика конфиденциальности</a></p>
    </div>
  </footer>

  <script src="/cms-schema.js?v=7"></script>
  <script src="/cms.js?v=6"></script>
  <script src="/journal.js?v=2"></script>
  <script src="/cookie.js?v=1"></script>
  <script src="/leadmagnet.js?v=24" defer></script>
</body>
</html>
