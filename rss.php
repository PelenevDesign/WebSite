<?php
declare(strict_types=1);
/* RSS-лента журнала: последние 20 опубликованных статей.
   Отдаётся по адресу /rss.xml (см. правило в .htaccess). */
require __DIR__ . '/db.php';
header('Content-Type: application/rss+xml; charset=utf-8');
header('Cache-Control: max-age=1800');

$base = rtrim((string)(config()['site_url'] ?? 'https://pelenevdesign.ru'), '/');
$esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_XML1, 'UTF-8');

$items = [];
try { $items = articleQuery(['limit' => 20], false)['items']; } catch (Throwable $e) { /* журнал ещё пуст — отдаём пустую ленту */ }

$updated = $items ? date('r', strtotime((string)($items[0]['updated_at'] ?? 'now'))) : date('r');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PELENEV.DESIGN — Гайды</title>
    <link><?= $esc($base . '/journal') ?></link>
    <description>Разборы, гайды и заметки о веб-дизайне, разработке сайтов и AI-инструментах.</description>
    <language>ru</language>
    <lastBuildDate><?= $esc($updated) ?></lastBuildDate>
    <atom:link href="<?= $esc($base . '/rss.xml') ?>" rel="self" type="application/rss+xml"/>
<?php foreach ($items as $a): $link = $base . '/journal/' . $a['slug']; ?>
    <item>
      <title><?= $esc($a['title']) ?></title>
      <link><?= $esc($link) ?></link>
      <guid isPermaLink="true"><?= $esc($link) ?></guid>
      <description><?= $esc($a['excerpt']) ?></description>
      <pubDate><?= $esc(date('r', strtotime((string)($a['published_at'] ?: $a['created_at'])))) ?></pubDate>
<?php foreach (categoriesByIds($a['category_ids']) as $c): ?>
      <category><?= $esc($c['name']) ?></category>
<?php endforeach; ?>
    </item>
<?php endforeach; ?>
  </channel>
</rss>
