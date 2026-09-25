<?php
require __DIR__ . '/db.php';
$base = rtrim((string)(config()['site_url'] ?? 'https://pelenevdesign.ru'), '/');

$slugParam = trim((string)($_GET['slug'] ?? ''));
$legacyId  = (int)($_GET['id'] ?? 0);

if ($slugParam !== '') {
  /* черновики и скрытые кейсы для посетителей не существуют */
  $project = projectBySlug($slugParam, false);
  if (!$project) { http_response_code(404); readfile(__DIR__ . '/404.html'); exit; }
} elseif ($legacyId > 0) {
  /* старый адрес — ?id= (проиндексированная форма) или числовой /case/{id}/ —
     не рендерим повторно, а раз и навсегда уводим на актуальный slug-адрес. */
  $legacy = projectRowsById($legacyId, false);
  if (!$legacy || $legacy['slug'] === '') { http_response_code(404); readfile(__DIR__ . '/404.html'); exit; }
  header('Location: ' . $base . '/case/' . $legacy['slug'] . '/', true, 301);
  exit;
} else {
  http_response_code(404); readfile(__DIR__ . '/404.html'); exit;
}
$id = (int)$project['id'];
try { $siteContent = allContent(); } catch (Throwable $e) { $siteContent = []; }
$integrationsHtml = '';
foreach (['integration-metrika','integration-ga','integration-gtm'] as $k) { $v = trim((string)($siteContent[$k] ?? '')); if ($v !== '') $integrationsHtml .= "\n" . $v; }

$esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$title = $esc($project['title']);

/* Описание для мета: берём из кейса, а если пусто — собираем из его же полей. */
$rawDesc = trim((string)$project['description']);
if ($rawDesc === '') {
  $facts = array_filter([$project['industry'], $project['services'], $project['client']], fn($v) => trim((string)$v) !== '');
  $rawDesc = 'Кейс PELENEV.DESIGN' . ($facts ? ' — ' . implode(', ', $facts) : '') . '.';
}
$description = $esc($rawDesc);

$canonical = $base . '/case/' . $project['slug'];
$coverRaw = $project['cover'] ?: '/assets/og-preview.jpg';
$abs = fn($src) => preg_match('#^https?://#', (string)$src) ? (string)$src : $base . '/' . ltrim((string)$src, '/');
$cover = $abs(ogImageFallback($coverRaw));   /* видео в og:image не отдаём */

/* Соседние кейсы — навигация «предыдущий/следующий» и rel-ссылки для поисковика. */
$published = projectRows(false);
$pos = null;
foreach ($published as $i => $row) if ((int)$row['id'] === $id) { $pos = $i; break; }
$prev = ($pos !== null && $pos > 0) ? $published[$pos - 1] : null;
$next = ($pos !== null && $pos < count($published) - 1) ? $published[$pos + 1] : null;

$blocks = is_array($project['blocks'] ?? null) ? $project['blocks'] : [];

/* Фото, уже показанные в блоках, не дублируем в галерее внизу. */
$usedInBlocks = [];
foreach ($blocks as $b) {
  if (!empty($b['src'])) $usedInBlocks[] = $b['src'];
  foreach (($b['items'] ?? []) as $it) if (!empty($it['src'])) $usedInBlocks[] = $it['src'];
}
$gallery = array_values(array_diff(array_unique(array_filter((array)$project['gallery'])), $usedInBlocks, [$coverRaw]));

/* Описание кейса: пустая строка — новый абзац, строка с «—»/«-»/«•» — пункт списка.
   Идём построчно, чтобы список работал и без пустой строки перед ним. */
function renderCaseLead(string $raw, callable $esc): string {
  $html = '';
  $para = [];
  $list = [];
  $flushPara = function () use (&$para, &$html, $esc) {
    if (!$para) return;
    $html .= '<p class="case__lead-p">' . nl2br($esc(implode("\n", $para))) . '</p>';
    $para = [];
  };
  $flushList = function () use (&$list, &$html, $esc) {
    if (!$list) return;
    $html .= '<ul class="case__lead-list">';
    foreach ($list as $li) $html .= '<li>' . $esc($li) . '</li>';
    $html .= '</ul>';
    $list = [];
  };
  foreach (preg_split('/\r\n|\r|\n/', trim($raw)) as $line) {
    $trimmed = trim($line);
    if ($trimmed === '') { $flushList(); $flushPara(); continue; }
    if (preg_match('/^[—–•\-]\s*(.+)$/u', $trimmed, $m)) { $flushPara(); $list[] = trim($m[1]); continue; }
    $flushList();
    $para[] = $trimmed;
  }
  $flushList();
  $flushPara();
  return $html;
}

/* Ширина/высота в разметке убирают скачок вёрстки при загрузке (CLS в Core Web Vitals). */
function imgSize(string $src): string {
  if ($src === '' || preg_match('#^https?://#', $src)) return '';
  $path = __DIR__ . '/' . ltrim(parse_url($src, PHP_URL_PATH) ?: '', '/');
  if (!is_file($path)) return '';
  $size = @getimagesize($path);
  return $size ? ' width="' . (int)$size[0] . '" height="' . (int)$size[1] . '"' : '';
}

/* Все изображения кейса — в микроразметку, чтобы попали в поиск по картинкам. */
$allImages = array_values(array_filter(
  array_unique(array_filter(array_merge([$coverRaw], $usedInBlocks, $gallery))),
  fn($src) => !isVideoSrc((string)$src)   /* в schema.org image видео не место */
));
$jsonLd = json_encode([
  '@context' => 'https://schema.org',
  '@graph' => [
    [
      '@type' => 'Article',
      '@id' => $canonical . '#article',
      'headline' => mb_substr((string)$project['title'], 0, 110),
      'name' => $project['title'],
      'url' => $canonical,
      'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $canonical],
      'image' => array_map($abs, array_slice($allImages, 0, 12)),
      'description' => $rawDesc,
      'inLanguage' => 'ru-RU',
      'articleSection' => $project['industry'] ?: 'Веб-дизайн',
      'keywords' => implode(', ', array_filter([$project['services'], $project['industry']])),
      'datePublished' => date('c', strtotime((string)($project['created_at'] ?? 'now'))),
      'dateModified' => date('c', strtotime((string)($project['updated_at'] ?? 'now'))),
      'author' => ['@type' => 'Person', 'name' => 'Дмитрий Пеленев', 'url' => $base . '/'],
      'publisher' => ['@type' => 'Organization', 'name' => 'PELENEV.DESIGN', 'url' => $base . '/'],
    ],
    [
      '@type' => 'BreadcrumbList',
      'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Главная', 'item' => $base . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Кейсы', 'item' => $base . '/work'],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $project['title'], 'item' => $canonical],
      ],
    ],
  ],
], JSON_UNESCAPED_UNICODE);

$facts = array_filter([
  'Решение' => (string)$project['services'],
  'Сроки' => (string)$project['duration'],
], fn($v) => trim($v) !== '');

/* Плитки достижений. Заполнены не у всех кейсов — тогда показываем прежние факты. */
$wins = array_values(array_filter((array)($project['stats'] ?? []), function ($s) {
  return is_array($s) && (trim((string)($s['value'] ?? '')) !== '' || trim((string)($s['title'] ?? '')) !== '');
}));

$catNames = ['site' => 'Сайты', 'ai-site' => 'AI-сайты', 'ai-content' => 'AI-контент', 'graphic' => 'Дизайн'];
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= $title ?> — кейс | PELENEV.DESIGN</title>
  <meta name="description" content="<?= $description ?>">
  <link rel="canonical" href="<?= $esc($canonical) ?>">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#FFFFFF">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="PELENEV.DESIGN">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="<?= $esc($canonical) ?>">
  <meta property="og:title" content="<?= $title ?> — PELENEV.DESIGN">
  <meta property="og:description" content="<?= $description ?>">
  <meta property="og:image" content="<?= $esc($cover) ?>">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="<?= $esc($cover) ?>">
<?php if ($prev): ?>  <link rel="prev" href="<?= $esc($base . '/case/' . $prev['slug']) ?>">
<?php endif; ?><?php if ($next): ?>  <link rel="next" href="<?= $esc($base . '/case/' . $next['slug']) ?>">
<?php endif; ?>
  <script type="application/ld+json"><?= $jsonLd ?></script>
<?php /* Обложка на странице не выводится — греем первое фото галереи, оно выше сгиба. */ ?>
<?php if ($gallery): ?>  <link rel="preload" as="image" href="<?= $esc($gallery[0]) ?>" fetchpriority="high">
<?php endif; ?>
  <link rel="stylesheet" href="/styles.css?v=110">
  <link rel="stylesheet" href="/case.css?v=13">
<?= $integrationsHtml ?>
  <script src="/metrika.js?v=1" defer></script>
</head>
<body class="case-page">
  <noscript><div><img src="https://mc.yandex.ru/watch/111032105" style="position:absolute;left:-9999px" alt=""></div></noscript>
  <div class="case-progress" aria-hidden="true"><span></span></div>

  <header class="case-top">
    <div class="case-top__inner">
      <div class="top-left">
        <a href="/work.php" class="back-btn" data-back aria-label="Назад" title="Назад">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 4.5 6 11l6.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="/" class="wordmark case-top__mark" aria-label="PELENEV.DESIGN — на главную">
          <svg class="wordmark__logo" viewBox="0 0 249.08 176.4" fill="currentColor" aria-hidden="true"><path d="M201.77,0H0L47.83,47.84H182.34c12,0,19.43,26.9,0,32.88H106.05a77.76,77.76,0,0,0-75.63,95.67,77.53,77.53,0,0,1,67.1-55H98a20.61,20.61,0,0,0,3.42-.22h.12v-.06h100.2C268.53,119.58,261.06-1.48,201.77,0Z" transform="translate(0 0.01)"/></svg>
          <span class="wordmark__text">PELENEV<span class="wordmark__dot">.</span>DESIGN</span>
        </a>
      </div>
      <?php /* Тот же набор пунктов, что в меню главной (без «Контактов»). */ ?>
      <nav class="case-top__nav" aria-label="Навигация по сайту">
        <a class="case-top__link" href="/#hero">Главная</a>
        <a class="case-top__link" href="/#services">Услуги</a>
        <a class="case-top__link" href="/work.php">Кейсы</a>
        <a class="case-top__link" href="/journal.php">Гайды</a>
        <a class="case-top__link" href="/#faq">FAQ</a>
        <a data-cms="link-telegram" class="pill pill--dark case-top__cta" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Обсудить проект</a>
      </nav>
    </div>
  </header>

  <main>
    <article class="case" itemscope itemtype="https://schema.org/Article">
      <header class="case__hero">
        <nav class="case__crumbs" aria-label="Хлебные крошки">
          <a href="/">Главная</a><span aria-hidden="true">/</span><a href="/work.php">Кейсы</a><span aria-hidden="true">/</span><span aria-current="page"><?= $title ?></span>
        </nav>
      </header>

      <?php /* Слева закреплённая текстовая карточка, справа лента фото:
                панель стоит на месте, пока справа не кончится галерея. */ ?>
      <div class="case__split<?= $gallery ? '' : ' case__split--solo' ?>">
        <aside class="case__aside">
          <div class="case__card">
            <?php $shownCats = array_values(array_filter((array)$project['categories'], fn($c) => isset($catNames[$c]))); ?>
            <?php if ($shownCats): ?>
            <ul class="case__tags case__tags--badge">
              <?php foreach ($shownCats as $cat): ?>
              <li><a href="/work.php#<?= $esc($cat) ?>"><?= $esc($catNames[$cat]) ?></a></li>
              <?php endforeach; ?>
            </ul>
            <?php else: ?>
            <p class="case__badge">Кейс</p>
            <?php endif; ?>

            <h1 class="case__title" itemprop="headline"><?= $title ?></h1>

            <?php if (trim((string)$project['description']) !== ''): ?>
            <div class="case__lead" itemprop="description"><?= renderCaseLead((string)$project['description'], $esc) ?></div>
            <?php endif; ?>

            <?php if ($wins): ?>
            <?php /* Значение дублируется в data-count: скрипт анимирует число от нуля,
                      а без JS в разметке уже стоит финальный текст. */ ?>
            <ul class="case__wins">
              <?php foreach ($wins as $i => $w): ?>
              <li class="case__win" style="--win-i: <?= (int)$i ?>">
                <p class="case__win-value" data-count="<?= $esc($w['value']) ?>"><?= $esc($w['value']) ?></p>
                <?php if (trim((string)($w['title'] ?? '')) !== ''): ?><p class="case__win-title"><?= $esc($w['title']) ?></p><?php endif; ?>
                <?php if (trim((string)($w['text'] ?? '')) !== ''): ?><p class="case__win-text"><?= $esc($w['text']) ?></p><?php endif; ?>
              </li>
              <?php endforeach; ?>
            </ul>
            <?php elseif ($facts): ?>
            <div class="case__card-foot">
              <dl class="case__facts">
                <?php foreach ($facts as $label => $value): ?>
                <div class="case__fact">
                  <dt><?= $esc($label) ?></dt>
                  <dd><?= $esc($value) ?></dd>
                </div>
                <?php endforeach; ?>
              </dl>
            </div>
            <?php endif; ?>

            <?php if (!empty($project['project_url']) && filter_var($project['project_url'], FILTER_VALIDATE_URL) && preg_match('~^https?://~i', $project['project_url'])): ?>
            <p class="case__visit"><a class="pill pill--dark" href="<?= $esc($project['project_url']) ?>" target="_blank" rel="noopener noreferrer">Открыть проект <span class="pill__arrow" aria-hidden="true">&#8599;</span></a></p>
            <?php endif; ?>
          </div>
        </aside>

        <?php if ($gallery): ?>
        <section class="case__shots" aria-label="Галерея проекта">
          <?php foreach ($gallery as $i => $src): ?>
          <?php if (isVideoSrc((string)$src)): ?>
          <?php /* Видео играет само, без звука. Звук и полный экран — по наведению. */ ?>
          <figure class="case__shot case__shot--video" data-video-shot>
            <video class="case__shot-video" src="<?= $esc($src) ?>" muted loop playsinline autoplay preload="metadata"<?= $i === 0 ? '' : ' data-lazy' ?>></video>
            <div class="case__vctl" aria-hidden="false">
              <button type="button" class="case__vbtn" data-vsound aria-label="Включить звук" title="Включить звук">
                <svg class="case__vicon case__vicon--off" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h3.5L12 19V5L7.5 9H4Z" fill="currentColor"/><path d="m16 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                <svg class="case__vicon case__vicon--on" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9v6h3.5L12 19V5L7.5 9H4Z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="case__vbtn" data-vfull aria-label="Развернуть на весь экран" title="На весь экран">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </figure>
          <?php else: ?>
          <figure class="case__shot">
            <img src="<?= $esc($src) ?>" alt="<?= $title ?> — изображение <?= $i + 1 ?>"<?= imgSize((string)$src) ?><?= $i === 0 ? ' fetchpriority="high"' : ' loading="lazy"' ?> decoding="async" data-zoom>
          </figure>
          <?php endif; ?>
          <?php endforeach; ?>
        </section>
        <?php endif; ?>
      </div>

      <?php if ($blocks): ?>
      <div class="case__body" itemprop="articleBody">
        <?php foreach ($blocks as $block): $type = $block['type'] ?? ''; ?>
          <?php if ($type === 'heading'): ?>
            <h2 class="case__h2"><?= $esc($block['text']) ?></h2>

          <?php elseif ($type === 'text'): ?>
            <?php foreach (preg_split('/\n\s*\n/', (string)$block['text']) as $para): if (trim($para) === '') continue; ?>
            <p class="case__p"><?= nl2br($esc(trim($para))) ?></p>
            <?php endforeach; ?>

          <?php elseif ($type === 'quote'): ?>
            <figure class="case__quote">
              <blockquote><?= nl2br($esc($block['text'])) ?></blockquote>
              <?php if (trim((string)($block['author'] ?? '')) !== ''): ?><figcaption><?= $esc($block['author']) ?></figcaption><?php endif; ?>
            </figure>

          <?php elseif ($type === 'image'): ?>
            <figure class="case__fig case__fig--<?= $esc($block['size'] ?? 'wide') ?>">
              <img src="<?= $esc($block['src']) ?>" alt="<?= $esc(trim((string)($block['caption'] ?? '')) !== '' ? $block['caption'] : $project['title']) ?>"<?= imgSize((string)$block['src']) ?> loading="lazy" decoding="async" data-zoom>
              <?php if (trim((string)($block['caption'] ?? '')) !== ''): ?><figcaption><?= $esc($block['caption']) ?></figcaption><?php endif; ?>
            </figure>

          <?php elseif ($type === 'duo'): ?>
            <div class="case__duo">
              <?php foreach ($block['items'] as $item): ?>
              <figure class="case__fig">
                <img src="<?= $esc($item['src']) ?>" alt="<?= $esc(trim((string)($item['caption'] ?? '')) !== '' ? $item['caption'] : $project['title']) ?>"<?= imgSize((string)$item['src']) ?> loading="lazy" decoding="async" data-zoom>
                <?php if (trim((string)($item['caption'] ?? '')) !== ''): ?><figcaption><?= $esc($item['caption']) ?></figcaption><?php endif; ?>
              </figure>
              <?php endforeach; ?>
            </div>

          <?php elseif ($type === 'stats'): ?>
            <dl class="case__stats">
              <?php foreach ($block['items'] as $item): ?>
              <div class="case__stat">
                <dt><?= $esc($item['value']) ?></dt>
                <dd><?= $esc($item['label'] ?? '') ?></dd>
              </div>
              <?php endforeach; ?>
            </dl>
          <?php endif; ?>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>

    </article>

    <?php if ($prev || $next): ?>
    <nav class="case-around" aria-label="Другие кейсы">
      <?php foreach ([['prev', $prev, 'Предыдущий кейс'], ['next', $next, 'Следующий кейс']] as [$dir, $row, $label]): if (!$row) continue; ?>
      <a class="case-around__card case-around__card--<?= $dir ?>" href="/case/<?= $esc($row['slug']) ?>/">
        <span class="case-around__label"><?= $label ?></span>
        <span class="case-around__title"><?= $esc($row['title']) ?></span>
        <?php if ($row['cover']): ?><?= coverMediaTag((string)$row['cover'], (string)$row['title'], ['class' => 'case-around__img']) ?><?php endif; ?>
      </a>
      <?php endforeach; ?>
    </nav>
    <?php endif; ?>

    <section class="case-cta">
      <h2 class="case-cta__title">Нужен такой же результат?</h2>
      <p class="case-cta__text">Расскажите про задачу — предложу решение и сроки в течение дня.</p>
      <div class="case-cta__actions">
        <a data-cms="link-telegram" class="pill pill--light" href="https://t.me/dmitrypelenev" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
        <a class="pill pill--outline" href="/work.php">Смотреть другие кейсы</a>
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
        <a data-cms="link-vk" href="https://vk.ru/pelenev_design" target="_blank" rel="noopener noreferrer">ВК</a>
      </nav>
      <p class="case-foot__legal">&copy; <?= date('Y') ?> PELENEV.DESIGN · <a href="/privacy.html">Политика конфиденциальности</a></p>
    </div>
  </footer>

  <script src="/cms-schema.js?v=7"></script>
  <script src="/cms.js?v=6"></script>
  <script src="/case.js?v=7"></script>
  <script src="/cookie.js?v=1"></script>
  <script src="/leadmagnet.js?v=24" defer></script>
</body>
</html>
