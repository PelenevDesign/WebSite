<?php
require __DIR__ . '/db.php';
$slug = (string)($_GET['slug'] ?? '');

/* Предпросмотр черновика/запланированной статьи — только с активной админ-сессией,
   и только если явно запрошен ?preview=1. Сессию не стартуем для обычных читателей. */
$isPreview = false;
if (isset($_GET['preview'])) {
  session_name('pelenew_admin');
  session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
  session_start();
  $isPreview = !empty($_SESSION['cms_authorized']);
}

$article = $slug !== '' ? articleBySlug($slug, $isPreview) : null;
if (!$article) { http_response_code(404); readfile(__DIR__ . '/404.html'); exit; }

try { $siteContent = allContent(); } catch (Throwable $e) { $siteContent = []; }
$integrationsHtml = '';
foreach (['integration-metrika', 'integration-ga', 'integration-gtm'] as $k) { $v = trim((string)($siteContent[$k] ?? '')); if ($v !== '') $integrationsHtml .= "\n" . $v; }

$base = rtrim((string)(config()['site_url'] ?? 'https://pelenevdesign.ru'), '/');
$esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$abs = fn($src) => preg_match('#^https?://#', (string)$src) ? (string)$src : $base . '/' . ltrim((string)$src, '/');

$title = $esc($article['title']);
$rawDesc = trim((string)$article['seo_description']) !== '' ? (string)$article['seo_description'] : (string)$article['excerpt'];
if ($rawDesc === '') $rawDesc = 'Статья из гайдов PELENEV.DESIGN.';
$description = $esc($rawDesc);
$seoTitle = trim((string)$article['seo_title']) !== '' ? (string)$article['seo_title'] : $article['title'] . ' — гайды PELENEV.DESIGN';
$canonical = articleCanonical($article, $base);
$coverRaw = $article['cover'] ?: '/assets/og-preview.jpg';
$ogImageRaw = ogImageFallback((string)($article['og_image'] ?: $coverRaw));
$metaRobots = $isPreview ? 'noindex,nofollow' : ($article['meta_robots'] ?: 'index,follow');

$categories = categoriesByIds($article['category_ids']);
$tags = tagsByIds($article['tag_ids']);
$blocks = is_array($article['blocks']) ? $article['blocks'] : [];

/* Оглавление и id для якорей собираются одним проходом — те же id
   переиспользуются ниже при рендере самих заголовков, без риска разойтись. */
$headingIds = [];
$toc = [];
$seenIds = [];
foreach ($blocks as $i => $b) {
  if (($b['type'] ?? '') !== 'heading') continue;
  $base_id = slugify((string)$b['text']);
  $id = $base_id; $n = 2;
  while (in_array($id, $seenIds, true)) { $id = $base_id . '-' . $n; $n++; }
  $seenIds[] = $id;
  $headingIds[$i] = $id;
  $toc[] = ['id' => $id, 'text' => $b['text'], 'level' => (int)$b['level']];
}

/* Соседние статьи по дате публикации (порядок ленты). */
$allPublished = articleQuery(['limit' => 500], false)['items'];
$pos = null;
foreach ($allPublished as $i => $row) if ($row['id'] === $article['id']) { $pos = $i; break; }
$prevArticle = ($pos !== null && $pos < count($allPublished) - 1) ? $allPublished[$pos + 1] : null; // старше
$nextArticle = ($pos !== null && $pos > 0) ? $allPublished[$pos - 1] : null; // новее

$faqItems = [];
foreach ($blocks as $b) if (($b['type'] ?? '') === 'faq') foreach ($b['items'] as $it) $faqItems[] = $it;

$graph = [
  [
    '@type' => 'Article',
    '@id' => $canonical . '#article',
    'headline' => mb_substr((string)$article['title'], 0, 110),
    'name' => $article['title'],
    'url' => $canonical,
    'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $canonical],
    'image' => [$abs(ogImageFallback($coverRaw))],
    'description' => $rawDesc,
    'inLanguage' => 'ru-RU',
    'timeRequired' => 'PT' . (int)$article['reading_time_min'] . 'M',
    'keywords' => implode(', ', array_column($tags, 'name')),
    'articleSection' => $categories ? $categories[0]['name'] : null,
    'datePublished' => !empty($article['published_at']) ? date('c', strtotime((string)$article['published_at'])) : date('c', strtotime((string)$article['created_at'])),
    'dateModified' => date('c', strtotime((string)$article['updated_at'])),
    'author' => ['@type' => 'Person', 'name' => $article['author_name'] ?: 'Дмитрий Пеленев', 'url' => $base . '/'],
    'publisher' => ['@type' => 'Organization', 'name' => 'PELENEV.DESIGN', 'url' => $base . '/'],
  ],
  [
    '@type' => 'BreadcrumbList',
    'itemListElement' => [
      ['@type' => 'ListItem', 'position' => 1, 'name' => 'Главная', 'item' => $base . '/'],
      ['@type' => 'ListItem', 'position' => 2, 'name' => 'Гайды', 'item' => $base . '/journal'],
      ['@type' => 'ListItem', 'position' => 3, 'name' => $article['title'], 'item' => $canonical],
    ],
  ],
];
$graph[0] = array_filter($graph[0], fn($v) => $v !== null && $v !== '');
if ($faqItems) {
  $graph[] = [
    '@type' => 'FAQPage',
    'mainEntity' => array_map(fn($it) => [
      '@type' => 'Question', 'name' => $it['q'],
      'acceptedAnswer' => ['@type' => 'Answer', 'text' => $it['a']],
    ], $faqItems),
  ];
}
$jsonLd = json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_UNICODE);

function imgSize(string $src): string {
  if ($src === '' || preg_match('#^https?://#', $src)) return '';
  $path = __DIR__ . '/' . ltrim(parse_url($src, PHP_URL_PATH) ?: '', '/');
  if (!is_file($path)) return '';
  $size = @getimagesize($path);
  return $size ? ' width="' . (int)$size[0] . '" height="' . (int)$size[1] . '"' : '';
}
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= $esc($seoTitle) ?></title>
  <meta name="description" content="<?= $description ?>">
  <meta name="robots" content="<?= $esc($metaRobots) ?>">
  <link rel="canonical" href="<?= $esc($canonical) ?>">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#FFFFFF">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="PELENEV.DESIGN">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="<?= $esc($canonical) ?>">
  <meta property="og:title" content="<?= $esc($seoTitle) ?>">
  <meta property="og:description" content="<?= $description ?>">
  <meta property="og:image" content="<?= $esc($abs($ogImageRaw)) ?>">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="<?= $esc($abs($ogImageRaw)) ?>">
<?php if ($prevArticle): ?>  <link rel="prev" href="<?= $esc($base . '/journal/' . $prevArticle['slug']) ?>">
<?php endif; ?><?php if ($nextArticle): ?>  <link rel="next" href="<?= $esc($base . '/journal/' . $nextArticle['slug']) ?>">
<?php endif; ?>
  <link rel="alternate" type="application/rss+xml" title="PELENEV.DESIGN — Гайды" href="/rss.xml">
  <script type="application/ld+json"><?= $jsonLd ?></script>
<?php /* Предзагружаем только картинку: видео грузится своим чередом. */ ?>
<?php if (!isVideoSrc($coverRaw)): ?>  <link rel="preload" as="image" href="<?= $esc($coverRaw) ?>" fetchpriority="high">
<?php endif; ?>
  <link rel="stylesheet" href="/styles.css?v=99">
  <link rel="stylesheet" href="/journal.css?v=9">
  <link rel="stylesheet" href="/article.css?v=5">
<?= $integrationsHtml ?>
  <script src="/metrika.js?v=1" defer></script>
</head>
<body class="page-article">
  <noscript><div><img src="https://mc.yandex.ru/watch/111032105" style="position:absolute;left:-9999px" alt=""></div></noscript>
<?php if ($isPreview): ?>
  <div class="art-preview-bar">Предпросмотр · статус: <?= $esc($article['status']) ?><?php if ($article['status'] !== 'published'): ?> · не виден обычным читателям<?php endif; ?></div>
<?php endif; ?>

  <div class="art-progress" aria-hidden="true"><span></span></div>

  <header class="j-top">
    <div class="j-top__inner">
      <div class="top-left">
        <a href="/journal.php" class="back-btn" data-back aria-label="Назад" title="Назад">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 6 11l6.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="/" class="wordmark j-top__mark" aria-label="PELENEV.DESIGN — на главную">
          <svg class="wordmark__logo" viewBox="0 0 249.08 176.4" fill="currentColor" aria-hidden="true"><path d="M201.77,0H0L47.83,47.84H182.34c12,0,19.43,26.9,0,32.88H106.05a77.76,77.76,0,0,0-75.63,95.67,77.53,77.53,0,0,1,67.1-55H98a20.61,20.61,0,0,0,3.42-.22h.12v-.06h100.2C268.53,119.58,261.06-1.48,201.77,0Z" transform="translate(0 0.01)"/></svg>
          <span class="wordmark__text">PELENEV<span class="wordmark__dot">.</span>DESIGN</span>
        </a>
      </div>
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

  <main>
    <article class="art" itemscope itemtype="https://schema.org/Article">
      <header class="art__hero">
        <div class="art__hero-inner">
          <nav class="art__crumbs" aria-label="Хлебные крошки">
            <a href="/">Главная</a><span aria-hidden="true">/</span><a href="/journal.php">Гайды</a><span aria-hidden="true">/</span><span aria-current="page"><?= $title ?></span>
          </nav>

          <?php if ($categories): ?>
          <ul class="art__tags">
            <?php foreach ($categories as $c): ?><li><a href="/journal?category=<?= (int)$c['id'] ?>"><?= $esc($c['name']) ?></a></li><?php endforeach; ?>
          </ul>
          <?php endif; ?>

          <h1 class="art__title" itemprop="headline"><?= $title ?></h1>
          <?php if ($article['excerpt']): ?><p class="art__lead" itemprop="description"><?= nl2br($esc($article['excerpt'])) ?></p><?php endif; ?>

          <div class="art__byline">
            <?php if ($article['author_avatar']): ?><img class="art__avatar" src="<?= $esc($article['author_avatar']) ?>" alt="<?= $esc($article['author_name']) ?>" width="44" height="44"><?php endif; ?>
            <div class="art__byline-text">
              <span class="art__author"><?= $esc($article['author_name'] ?: 'PELENEV.DESIGN') ?></span>
              <span class="art__meta">
                <?php if (!empty($article['published_at'])): ?><time datetime="<?= date('c', strtotime((string)$article['published_at'])) ?>"><?= date('d.m.Y', strtotime((string)$article['published_at'])) ?></time> · <?php endif; ?>
                <?= (int)$article['reading_time_min'] ?> мин чтения
              </span>
            </div>
          </div>
        </div>
      </header>

      <?php if ($coverRaw): ?>
      <figure class="art__cover">
        <?= coverMediaTag($coverRaw, (string)$article['title'], ['eager' => true, 'extra' => ' itemprop="image"']) ?>
      </figure>
      <?php endif; ?>

      <div class="art__layout">
        <?php if ($toc): ?>
        <aside class="art__toc-wrap">
          <nav class="art__toc" aria-label="Оглавление">
            <p class="art__toc-title">Содержание</p>
            <ul>
              <?php foreach ($toc as $t): ?><li class="art__toc-item art__toc-item--<?= (int)$t['level'] ?>"><a href="#<?= $esc($t['id']) ?>"><?= $esc($t['text']) ?></a></li><?php endforeach; ?>
            </ul>
          </nav>
        </aside>
        <?php endif; ?>

        <div class="art__content" itemprop="articleBody">
          <?php foreach ($blocks as $i => $block): $type = $block['type'] ?? ''; ?>

            <?php if ($type === 'heading'): $lvl = max(2, min(6, (int)$block['level'])); ?>
              <h<?= $lvl ?> class="art__h art__h<?= $lvl ?>" id="<?= $esc($headingIds[$i] ?? '') ?>"><?= $esc($block['text']) ?></h<?= $lvl ?>>

            <?php elseif ($type === 'text'): ?>
              <p class="art__p"><?= $block['html'] ?></p>

            <?php elseif ($type === 'quote'): ?>
              <figure class="art__quote">
                <blockquote><?= nl2br($esc($block['text'])) ?></blockquote>
                <?php if (trim((string)($block['author'] ?? '')) !== ''): ?><figcaption><?= $esc($block['author']) ?></figcaption><?php endif; ?>
              </figure>

            <?php elseif ($type === 'image'): ?>
              <figure class="art__fig art__fig--<?= $esc($block['size'] ?? 'wide') ?>">
                <img src="<?= $esc($block['src']) ?>" alt="<?= $esc(trim((string)($block['caption'] ?? '')) !== '' ? $block['caption'] : $article['title']) ?>"<?= imgSize((string)$block['src']) ?> loading="lazy" decoding="async" data-zoom>
                <?php if (trim((string)($block['caption'] ?? '')) !== ''): ?><figcaption><?= $esc($block['caption']) ?></figcaption><?php endif; ?>
              </figure>

            <?php elseif ($type === 'gallery'): ?>
              <div class="art__gallery">
                <?php foreach ($block['items'] as $item): ?>
                <figure class="art__gallery-item">
                  <img src="<?= $esc($item['src']) ?>" alt="<?= $esc(trim((string)($item['caption'] ?? '')) !== '' ? $item['caption'] : $article['title']) ?>"<?= imgSize((string)$item['src']) ?> loading="lazy" decoding="async" data-zoom>
                  <?php if (trim((string)($item['caption'] ?? '')) !== ''): ?><figcaption><?= $esc($item['caption']) ?></figcaption><?php endif; ?>
                </figure>
                <?php endforeach; ?>
              </div>

            <?php elseif ($type === 'video'): ?>
              <figure class="art__video">
                <video controls playsinline preload="metadata"<?= $block['poster'] ? ' poster="' . $esc($block['poster']) . '"' : '' ?>>
                  <source src="<?= $esc($block['src']) ?>" type="video/mp4">
                </video>
              </figure>

            <?php elseif ($type === 'youtube'): ?>
              <div class="art__youtube">
                <iframe src="https://www.youtube-nocookie.com/embed/<?= $esc($block['id']) ?>" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
              </div>

            <?php elseif ($type === 'list'): $tag = !empty($block['ordered']) ? 'ol' : 'ul'; ?>
              <<?= $tag ?> class="art__list">
                <?php foreach ($block['items'] as $item): ?><li><?= $esc($item) ?></li><?php endforeach; ?>
              </<?= $tag ?>>

            <?php elseif ($type === 'table'): ?>
              <div class="art__table-wrap">
                <table class="art__table">
                  <?php if ($block['headers']): ?><thead><tr><?php foreach ($block['headers'] as $h): ?><th><?= $esc($h) ?></th><?php endforeach; ?></tr></thead><?php endif; ?>
                  <tbody><?php foreach ($block['rows'] as $row): ?><tr><?php foreach ($row as $cell): ?><td><?= $esc($cell) ?></td><?php endforeach; ?></tr><?php endforeach; ?></tbody>
                </table>
              </div>

            <?php elseif ($type === 'callout'): ?>
              <div class="art__callout art__callout--<?= $esc($block['variant'] ?? 'info') ?>">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M10 6v5M10 13.5h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                <p><?= nl2br($esc($block['text'])) ?></p>
              </div>

            <?php elseif ($type === 'faq'): ?>
              <div class="faq__list art__faq">
                <?php foreach ($block['items'] as $fi => $item): ?>
                <div class="faq__item">
                  <button class="faq__q" type="button" aria-expanded="false">
                    <span class="faq__q-text"><?= $esc($item['q']) ?></span>
                    <svg class="faq__icon" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="10" stroke="currentColor" stroke-width="1.4"/><path d="M11 6.5v9M6.5 11h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                  </button>
                  <div class="faq__a"><div class="faq__a-inner"><p><?= nl2br($esc($item['a'])) ?></p></div></div>
                </div>
                <?php endforeach; ?>
              </div>

            <?php elseif ($type === 'cta'): ?>
              <div class="art__cta">
                <h3><?= $esc($block['title']) ?></h3>
                <?php if ($block['text']): ?><p><?= nl2br($esc($block['text'])) ?></p><?php endif; ?>
                <?php if ($block['button_label'] && $block['button_href']): ?><a class="pill pill--light" href="<?= $esc($block['button_href']) ?>" target="_blank" rel="noopener noreferrer"><?= $esc($block['button_label']) ?> <span class="pill__arrow" aria-hidden="true">&#8599;</span></a><?php endif; ?>
              </div>

            <?php elseif ($type === 'button'): $style = in_array($block['style'] ?? '', ['light', 'outline'], true) ? $block['style'] : 'dark'; ?>
              <p class="art__button"><a class="pill pill--<?= $esc($style) ?>" href="<?= $esc($block['href']) ?>"><?= $esc($block['label']) ?></a></p>

            <?php elseif ($type === 'divider'): ?>
              <hr class="art__divider">
            <?php endif; ?>
          <?php endforeach; ?>
        </div>
      </div>

      <?php if ($tags): ?>
      <div class="art__tagline">
        <?php foreach ($tags as $t): ?><span class="art__tag"><?= $esc($t['name']) ?></span><?php endforeach; ?>
      </div>
      <?php endif; ?>
    </article>

    <?php if ($prevArticle || $nextArticle): ?>
    <nav class="art-around" aria-label="Другие статьи">
      <?php foreach ([['prev', $prevArticle, 'Предыдущая статья'], ['next', $nextArticle, 'Следующая статья']] as [$dir, $row, $label]): if (!$row) continue; ?>
      <a class="art-around__card art-around__card--<?= $dir ?>" href="/article.php?slug=<?= rawurlencode($row['slug']) ?>">
        <span class="art-around__label"><?= $label ?></span>
        <span class="art-around__title"><?= $esc($row['title']) ?></span>
      </a>
      <?php endforeach; ?>
    </nav>
    <?php endif; ?>

    <section class="art-cta">
      <h2 class="art-cta__title">Нужна помощь с сайтом или контентом?</h2>
      <p class="art-cta__text">Расскажите про задачу — предложу решение и сроки в течение дня.</p>
      <div class="art-cta__actions">
        <a data-cms="link-telegram" class="pill pill--light" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
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

  <script src="/cms-schema.js?v=5"></script>
  <script src="/cms.js?v=6"></script>
  <script src="/article.js?v=2"></script>
  <script src="/cookie.js?v=1"></script>
<?php if (!$isPreview): ?>
  <script>fetch('/api.php?action=article-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: <?= (int)$article['id'] ?> }), keepalive: true }).catch(() => {});</script>
<?php endif; ?>
  <script src="/leadmagnet.js?v=22" defer></script>
</body>
</html>
