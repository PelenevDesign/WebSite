<?php
declare(strict_types=1);
/* Динамический sitemap: статические страницы + все кейсы из БД.
   Новый кейс, созданный в админке, попадает сюда автоматически.
   Отдаётся по адресу /sitemap.xml (см. правило в .htaccess). */
require __DIR__ . '/db.php';
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: max-age=3600');

$base = rtrim((string)(config()['site_url'] ?? 'https://pelenev.design'), '/');
$today = date('Y-m-d');

$urls = [
  ['loc' => $base . '/',            'changefreq' => 'weekly',  'priority' => '1.0', 'lastmod' => $today],
  ['loc' => $base . '/work',        'changefreq' => 'weekly',  'priority' => '0.9', 'lastmod' => $today],
  /* SEO-страницы услуг. Новую услугу добавлять сюда же — каталог в /services/. */
  ['loc' => $base . '/services/websites/', 'changefreq' => 'monthly', 'priority' => '0.9', 'lastmod' => $today],
  ['loc' => $base . '/journal',     'changefreq' => 'daily',   'priority' => '0.9', 'lastmod' => $today],
  ['loc' => $base . '/privacy.html','changefreq' => 'yearly',  'priority' => '0.2', 'lastmod' => $today],
];

try {
  foreach (projectRows() as $project) {
    $lastmod = !empty($project['updated_at']) ? date('Y-m-d', strtotime((string)$project['updated_at'])) : $today;
    $urls[] = [
      'loc'        => $base . '/case/' . $project['slug'],
      'changefreq' => 'monthly',
      'priority'   => '0.8',
      'lastmod'    => $lastmod,
    ];
  }
} catch (Throwable $e) {
  /* БД недоступна — отдаём хотя бы статические страницы, чтобы sitemap не падал. */
}

try {
  foreach (articleQuery(['limit' => 500], false)['items'] as $article) {
    $lastmod = !empty($article['updated_at']) ? date('Y-m-d', strtotime((string)$article['updated_at'])) : $today;
    $urls[] = [
      'loc'        => $base . '/journal/' . $article['slug'],
      'changefreq' => 'monthly',
      'priority'   => '0.7',
      'lastmod'    => $lastmod,
    ];
  }
} catch (Throwable $e) {
  /* журнал ещё не наполнен или таблицы только создаются — sitemap не должен падать */
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $u) {
  echo '  <url>';
  echo '<loc>' . htmlspecialchars($u['loc'], ENT_QUOTES, 'UTF-8') . '</loc>';
  echo '<lastmod>' . $u['lastmod'] . '</lastmod>';
  echo '<changefreq>' . $u['changefreq'] . '</changefreq>';
  echo '<priority>' . $u['priority'] . '</priority>';
  echo '</url>' . "\n";
}
echo '</urlset>';
