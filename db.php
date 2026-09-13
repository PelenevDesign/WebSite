<?php
declare(strict_types=1);

/* Полифилы функций PHP 8.0 — чтобы сайт работал и на PHP 7.4 (частая версия на хостинге).
   Без них str_contains/str_starts_with роняют каждую PHP-страницу в белый экран. */
if (!function_exists('str_contains')) {
  function str_contains(string $haystack, string $needle): bool { return $needle === '' || strpos($haystack, $needle) !== false; }
}
if (!function_exists('str_starts_with')) {
  function str_starts_with(string $haystack, string $needle): bool { return strncmp($haystack, $needle, strlen($needle)) === 0; }
}
if (!function_exists('str_ends_with')) {
  function str_ends_with(string $haystack, string $needle): bool { return $needle === '' || substr($haystack, -strlen($needle)) === $needle; }
}

function config(): array { static $config; return $config ??= require __DIR__ . '/config.php'; }
/* На Beget PHP стоит за прокси: сам $_SERVER['HTTPS'] может быть пустым. */
function isHttps(): bool {
  if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return true;
  foreach (['HTTP_X_FORWARDED_PROTO', 'HTTP_X_FORWARDED_SCHEME'] as $header) {
    if (!empty($_SERVER[$header]) && str_contains(strtolower((string)$_SERVER[$header]), 'https')) return true;
  }
  return !empty($_SERVER['HTTP_X_FORWARDED_SSL']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_SSL']) === 'on';
}
/* Пароль админки: приоритет у хэша, plain-текст оставлен для обратной совместимости. */
function verifyAdminPassword(string $provided): bool {
  $config = config();
  $hash = (string)($config['admin_password_hash'] ?? '');
  if ($hash !== '') return password_verify($provided, $hash);
  return hash_equals((string)($config['admin_password'] ?? ''), $provided);
}
function db(): PDO {
  static $pdo;
  if ($pdo) return $pdo;
  $c = config()['db'];
  if (str_starts_with($c['name'], 'DATABASE_') || str_starts_with($c['user'], 'DATABASE_')) throw new RuntimeException('Заполните доступы к MySQL в config.php.');
  return $pdo = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}", $c['user'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
}
function allContent(): array {
  $rows = db()->query('SELECT content_key, content_value FROM cms_content')->fetchAll();
  $stored = array_column($rows, 'content_value', 'content_key');
  $defaults = is_file(__DIR__ . '/cms-defaults.php') ? (require __DIR__ . '/cms-defaults.php') : [];
  return array_merge(is_array($defaults) ? $defaults : [], $stored);
}
function saveContent(array $values): void {
  $pdo = db(); $sql = 'INSERT INTO cms_content (content_key, content_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), updated_at = CURRENT_TIMESTAMP';
  $statement = $pdo->prepare($sql); $pdo->beginTransaction();
  try { foreach ($values as $key => $value) if (is_string($key) && is_string($value) && preg_match('/^[a-z0-9-]{1,100}$/', $key)) $statement->execute([$key, $value]); $pdo->commit(); }
  catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}
/* Подставляет отредактированные в CMS SEO-title и SEO-description прямо в HTML
   (server-side, поэтому попадают в исходный код страницы и видны поисковикам).
   Если поле в CMS пустое — остаётся статичное значение из шаблона. */
function applySeo(string $html, array $content, string $prefix): string {
  $title = trim((string)($content["seo-$prefix-title"] ?? ''));
  $desc  = trim((string)($content["seo-$prefix-description"] ?? ''));
  if ($title !== '') {
    $t = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $html = preg_replace_callback('#<title>.*?</title>#s', fn() => "<title>$t</title>", $html, 1) ?? $html;
    $html = preg_replace_callback('#(<meta property="og:title" content=")[^"]*(">)#', fn($m) => $m[1] . $t . $m[2], $html, 1) ?? $html;
  }
  if ($desc !== '') {
    $d = htmlspecialchars($desc, ENT_QUOTES, 'UTF-8');
    $html = preg_replace_callback('#(<meta name="description" content=")[^"]*(">)#', fn($m) => $m[1] . $d . $m[2], $html, 1) ?? $html;
    $html = preg_replace_callback('#(<meta property="og:description" content=")[^"]*(">)#', fn($m) => $m[1] . $d . $m[2], $html, 1) ?? $html;
  }
  return $html;
}
/* $all = true — для админки (черновики и скрытые тоже); публичные страницы видят только published.
   COALESCE прикрывает базу до апгрейда, где колонки status ещё нет — но SELECT * упадёт раньше,
   поэтому колонку добавляет install.php; здесь только логика. */
function projectRows(bool $all = false): array {
  $rows = db()->query('SELECT * FROM cms_projects ORDER BY sort_order ASC, id ASC')->fetchAll();
  /* База, залитая до появления блочного редактора, колонки blocks не имеет.
     Добавляем её на лету — ALTER ADD COLUMN только дописывает столбец,
     существующие кейсы, фото и порядок не затрагивает. */
  /* Обе проверки должны выполниться до перезапроса, поэтому результаты
     считаем заранее — в условии && второй вызов бы не состоялся. */
  $addedBlocks = $rows && !array_key_exists('blocks', $rows[0]) && ensureProjectsBlocksColumn();
  $addedStats  = $rows && !array_key_exists('stats', $rows[0]) && ensureProjectsStatsColumn();
  $addedSlug   = $rows && !array_key_exists('slug', $rows[0]) && ensureProjectsSlugColumn();
  if ($addedBlocks || $addedStats || $addedSlug) {
    $rows = db()->query('SELECT * FROM cms_projects ORDER BY sort_order ASC, id ASC')->fetchAll();
  }
  foreach ($rows as &$row) {
    $row['categories'] = json_decode($row['categories'] ?: '[]', true) ?: [];
    $row['gallery'] = json_decode($row['gallery'] ?: '[]', true) ?: [];
    $row['blocks'] = json_decode($row['blocks'] ?? '[]' ?: '[]', true) ?: [];
    $row['stats'] = json_decode($row['stats'] ?? '[]' ?: '[]', true) ?: [];
    $row['status'] = $row['status'] ?? 'published';
  }
  unset($row);
  return $all ? $rows : array_values(array_filter($rows, fn($r) => $r['status'] === 'published'));
}

/* Идемпотентно: если колонки нет — создаёт, если есть — молча выходит.
   MySQL не поддерживает ADD COLUMN IF NOT EXISTS, поэтому проверяем через
   information_schema и глушим гонку двух параллельных запросов. */
function ensureProjectsBlocksColumn(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $stmt->execute(['cms_projects', 'blocks']);
    if ((int)$stmt->fetchColumn() === 0) db()->exec('ALTER TABLE cms_projects ADD COLUMN blocks LONGTEXT NULL AFTER description');
    return $done = true;
  } catch (Throwable $e) { error_log($e->__toString()); return $done = false; }
}

/* Достижения кейса (три плитки на первом экране). Та же идемпотентная схема,
   что и у blocks: колонка создаётся при первом обращении. */
function ensureProjectsStatsColumn(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $stmt->execute(['cms_projects', 'stats']);
    if ((int)$stmt->fetchColumn() === 0) db()->exec('ALTER TABLE cms_projects ADD COLUMN stats LONGTEXT NULL AFTER blocks');
    return $done = true;
  } catch (Throwable $e) { error_log($e->__toString()); return $done = false; }
}

/* Slug кейсов для ЧПУ /case/<slug>/. При первом появлении колонки сразу же
   прописывает короткие человекочитаемые адреса уже опубликованным кейсам
   (не механическую транслитерацию заголовка-предложения) — см. seedProjectSlugs().
   Кейсы, заведённые позже, получают автослаг из заголовка при сохранении
   в админке (api.php), который там же можно вручную укоротить. */
function ensureProjectsSlugColumn(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $stmt->execute(['cms_projects', 'slug']);
    if ((int)$stmt->fetchColumn() === 0) {
      db()->exec('ALTER TABLE cms_projects ADD COLUMN slug VARCHAR(190) NOT NULL DEFAULT "" AFTER title');
      seedProjectSlugs();
      /* Уникальный индекс — отдельным шагом и без падения всей миграции,
         если вдруг где-то уже случайно оказался дубль. */
      try { db()->exec('ALTER TABLE cms_projects ADD UNIQUE KEY slug (slug)'); } catch (Throwable $e) { error_log($e->__toString()); }
    }
    return $done = true;
  } catch (Throwable $e) { error_log($e->__toString()); return $done = false; }
}

/* Разовый бэкафилл для кейсов, заведённых до появления slug — короткие
   ручные адреса вместо длинной транслитерации целого заголовка-предложения. */
function seedProjectSlugs(): void {
  $seed = [
    7  => 'landing-poselok-ozerny',
    8  => 'sayt-prilozheniya-meganots',
    9  => 'sayt-hudozhnitsy-ispaniya',
    10 => 'sayt-transportnoy-kompanii',
    11 => 'sayt-kursa-dlya-salonov-krasoty',
    12 => 'oformlenie-vk-shkoly-tantsev-permi',
    13 => 'upakovka-soobschestva-vk',
    14 => 'podborka-dizayn-rabot',
    15 => 'podborka-rabot-dlya-vdohnoveniya',
    16 => 'korporativny-sayt-i-cms',
    17 => 'podborka-ai-saytov',
    18 => 'ai-multserial-dlya-shkoly-angliyskogo',
    19 => 'ai-viktorina-dlya-shkoly-angliyskogo',
    20 => 'reklamny-rolik-dlya-fashion-brenda',
    21 => 'ai-kontent-dlya-nedvizhimosti',
  ];
  $upd = db()->prepare('UPDATE cms_projects SET slug = ? WHERE id = ? AND slug = ""');
  foreach ($seed as $id => $slug) $upd->execute([$slug, $id]);
  /* Страховка: кейс, оставшийся без slug (новый id вне списка выше — например,
     заведённый уже после подготовки этого списка), получает автослаг из title,
     чтобы страница в любом случае не осталась без адреса. */
  foreach (db()->query("SELECT id, title FROM cms_projects WHERE slug = ''")->fetchAll() as $row) {
    $auto = uniqueSlug('cms_projects', slugify((string)$row['title']));
    db()->prepare('UPDATE cms_projects SET slug = ? WHERE id = ?')->execute([$auto, $row['id']]);
  }
}

function projectBySlug(string $slug, bool $all = false): ?array {
  foreach (projectRows($all) as $row) if ((string)$row['slug'] === $slug) return $row;
  return null;
}

/* Описание кейса выросло до 8–10 строк. Если колонка осталась VARCHAR из ранней
   версии базы, длинный текст молча обрежется — расширяем до TEXT.
   Только из VARCHAR: TEXT/LONGTEXT не трогаем, чтобы случайно не сузить. */
function ensureProjectsDescriptionText(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    $stmt = db()->prepare('SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $stmt->execute(['cms_projects', 'description']);
    if (strtolower((string)$stmt->fetchColumn()) === 'varchar') db()->exec('ALTER TABLE cms_projects MODIFY description TEXT NULL');
    return $done = true;
  } catch (Throwable $e) { error_log($e->__toString()); return $done = false; }
}

/* Три плитки достижений: значение + заголовок + пояснение. */
function sanitizeProjectStats($raw): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $limit) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $limit);
  $out = [];
  foreach (array_slice($raw, 0, 3) as $item) {
    if (!is_array($item)) continue;
    $value = $str($item['value'] ?? '', 24);
    $title = $str($item['title'] ?? '', 60);
    $text  = $str($item['text'] ?? '', 140);
    /* Пустую плитку не сохраняем — иначе на странице будет дырка. */
    if ($value === '' && $title === '') continue;
    $out[] = ['value' => $value, 'title' => $title, 'text' => $text];
  }
  return $out;
}

/* Приводит присланные админкой блоки к белому списку типов и полей.
   Всё, что не описано здесь, в базу не попадает. Экранирование — на выводе. */
function sanitizeProjectBlocks($raw): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $limit) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $limit);
  $out = [];
  foreach (array_slice($raw, 0, 60) as $block) {
    if (!is_array($block)) continue;
    $type = (string)($block['type'] ?? '');
    if ($type === 'heading') { $t = $str($block['text'] ?? '', 160); if ($t !== '') $out[] = ['type' => 'heading', 'text' => $t]; }
    elseif ($type === 'text') { $t = $str($block['text'] ?? '', 4000); if ($t !== '') $out[] = ['type' => 'text', 'text' => $t]; }
    elseif ($type === 'quote') { $t = $str($block['text'] ?? '', 800); if ($t !== '') $out[] = ['type' => 'quote', 'text' => $t, 'author' => $str($block['author'] ?? '', 120)]; }
    elseif ($type === 'image') {
      $src = $str($block['src'] ?? '', 500); if ($src === '') continue;
      $size = in_array($block['size'] ?? '', ['inset', 'wide', 'full'], true) ? $block['size'] : 'wide';
      $out[] = ['type' => 'image', 'src' => $src, 'caption' => $str($block['caption'] ?? '', 240), 'size' => $size];
    }
    elseif ($type === 'duo') {
      $items = [];
      foreach (array_slice((array)($block['items'] ?? []), 0, 2) as $item) {
        $src = $str(is_array($item) ? ($item['src'] ?? '') : '', 500);
        if ($src !== '') $items[] = ['src' => $src, 'caption' => $str($item['caption'] ?? '', 240)];
      }
      if ($items) $out[] = ['type' => 'duo', 'items' => $items];
    }
    elseif ($type === 'stats') {
      $items = [];
      foreach (array_slice((array)($block['items'] ?? []), 0, 4) as $item) {
        $value = $str(is_array($item) ? ($item['value'] ?? '') : '', 24);
        if ($value !== '') $items[] = ['value' => $value, 'label' => $str($item['label'] ?? '', 80)];
      }
      if ($items) $out[] = ['type' => 'stats', 'items' => $items];
    }
  }
  return $out;
}
function projectRowsById(int $id, bool $all = false): ?array { foreach (projectRows($all) as $row) if ((int)$row['id'] === $id) return $row; return null; }

/* Журнал действий для дашборда. Не должен ронять основную операцию — всё в try. */
function logEvent(string $event, string $title = ''): void {
  try {
    db()->prepare('INSERT INTO cms_log (event, title) VALUES (?, ?)')->execute([mb_substr($event, 0, 40), mb_substr($title, 0, 255)]);
  } catch (Throwable $e) { /* таблицы может не быть до install — некритично */ }
}

/* Счётчики аналитики из админки (Метрика/GA/GTM). Вставляются как есть перед </head> —
   это код, который вводит только администратор, экранировать его нельзя. */
function applyIntegrations(string $html, array $content): string {
  $code = '';
  foreach (['integration-metrika', 'integration-ga', 'integration-gtm'] as $key) {
    $value = trim((string)($content[$key] ?? ''));
    if ($value !== '') $code .= "\n" . $value . "\n";
  }
  if ($code === '') return $html;
  $pos = stripos($html, '</head>');
  return $pos === false ? $html : substr_replace($html, $code, $pos, 0);
}

/* =======================================================================
   Журнал (блог): статьи, категории, теги.
   Три новые таблицы, создаются лениво при первом обращении — как cms_leads
   в api.php. category_ids/tag_ids хранятся JSON-массивом ID прямо на статье
   (тот же приём, что categories у cms_projects), а не через pivot-таблицы.
   ======================================================================= */
function ensureBlogTables(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    $pdo = db();
    $pdo->exec('CREATE TABLE IF NOT EXISTS cms_categories (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL DEFAULT "",
      slug VARCHAR(80) NOT NULL DEFAULT "",
      parent_id INT UNSIGNED NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY slug (slug)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS cms_tags (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(60) NOT NULL DEFAULT "",
      slug VARCHAR(60) NOT NULL DEFAULT "",
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY slug (slug)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    /* category_ids/tag_ids — VARCHAR, не TEXT: TEXT/BLOB без DEFAULT падает
       на MySQL старше 8.0.13, а нам важно, чтобы CREATE TABLE не подвёл на
       произвольной версии сервера у хостинга. Пары десятков ID туда влезают
       с большим запасом. */
    $pdo->exec('CREATE TABLE IF NOT EXISTS cms_articles (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL DEFAULT "",
      slug VARCHAR(255) NOT NULL DEFAULT "",
      excerpt VARCHAR(500) NOT NULL DEFAULT "",
      cover VARCHAR(500) NOT NULL DEFAULT "",
      blocks LONGTEXT NULL,
      category_ids VARCHAR(500) NOT NULL DEFAULT "[]",
      tag_ids VARCHAR(500) NOT NULL DEFAULT "[]",
      author_name VARCHAR(120) NOT NULL DEFAULT "",
      author_avatar VARCHAR(500) NOT NULL DEFAULT "",
      author_bio VARCHAR(500) NOT NULL DEFAULT "",
      status VARCHAR(20) NOT NULL DEFAULT "draft",
      published_at DATETIME NULL,
      reading_time_min SMALLINT UNSIGNED NOT NULL DEFAULT 1,
      views INT UNSIGNED NOT NULL DEFAULT 0,
      is_featured TINYINT(1) NOT NULL DEFAULT 0,
      seo_title VARCHAR(70) NOT NULL DEFAULT "",
      seo_description VARCHAR(160) NOT NULL DEFAULT "",
      canonical VARCHAR(500) NOT NULL DEFAULT "",
      og_image VARCHAR(500) NOT NULL DEFAULT "",
      meta_robots VARCHAR(40) NOT NULL DEFAULT "index,follow",
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY slug (slug)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    return $done = true;
  } catch (Throwable $e) { error_log($e->__toString()); return $done = false; }
}

/* Транслитерация в ЧПУ-слаг: экспертный контент пишется по-русски,
   а в адресной строке нужна латиница без сюрпризов при копировании ссылки. */
function slugify(string $text): string {
  $map = ['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya'];
  $text = strtr(mb_strtolower($text), $map);
  $text = preg_replace('/[^a-z0-9]+/', '-', $text);
  $text = trim((string)$text, '-');
  return $text === '' ? 'item-' . substr(md5(microtime()), 0, 8) : $text;
}

/* Добавляет -2, -3… пока слаг не станет уникальным в таблице.
   $table — только из белого списка ниже, никогда не берётся из запроса. */
function uniqueSlug(string $table, string $slug, int $excludeId = 0): string {
  if (!in_array($table, ['cms_articles', 'cms_categories', 'cms_tags', 'cms_services', 'cms_projects'], true)) throw new InvalidArgumentException('Недопустимая таблица для uniqueSlug.');
  $base = $slug; $n = 1;
  while (true) {
    $stmt = db()->prepare("SELECT COUNT(*) FROM {$table} WHERE slug = ? AND id != ?");
    $stmt->execute([$slug, $excludeId]);
    if ((int)$stmt->fetchColumn() === 0) return $slug;
    $n++; $slug = $base . '-' . $n;
  }
}

function categoryRows(): array { ensureBlogTables(); return db()->query('SELECT * FROM cms_categories ORDER BY sort_order ASC, name ASC')->fetchAll(); }
function tagRows(): array { ensureBlogTables(); return db()->query('SELECT * FROM cms_tags ORDER BY name ASC')->fetchAll(); }
function categoriesByIds(array $ids): array {
  if (!$ids) return [];
  $map = array_column(categoryRows(), null, 'id');
  $out = []; foreach ($ids as $id) if (isset($map[$id])) $out[] = $map[$id];
  return $out;
}
function tagsByIds(array $ids): array {
  if (!$ids) return [];
  $map = array_column(tagRows(), null, 'id');
  $out = []; foreach ($ids as $id) if (isset($map[$id])) $out[] = $map[$id];
  return $out;
}

function hydrateArticleRow(array &$row): void {
  $row['blocks'] = json_decode($row['blocks'] ?? '[]' ?: '[]', true) ?: [];
  $row['category_ids'] = array_map('intval', json_decode($row['category_ids'] ?: '[]', true) ?: []);
  $row['tag_ids'] = array_map('intval', json_decode($row['tag_ids'] ?: '[]', true) ?: []);
}

/* «Опубликована» без cron: status='scheduled' с published_at в прошлом
   считается опубликованной прямо на чтении — БД физически не меняем. */
function articleIsVisible(array $row): bool {
  if (($row['status'] ?? '') === 'published') return true;
  if (($row['status'] ?? '') === 'scheduled' && !empty($row['published_at'])) return strtotime((string)$row['published_at']) <= time();
  return false;
}

function articleWhereSql(array $filters, bool $all): array {
  $where = []; $params = [];
  if (!$all) $where[] = "(status = 'published' OR (status = 'scheduled' AND published_at <= NOW()))";
  if (!empty($filters['category'])) { $where[] = 'JSON_CONTAINS(category_ids, ?)'; $params[] = json_encode((int)$filters['category']); }
  if (!empty($filters['tag'])) { $where[] = 'JSON_CONTAINS(tag_ids, ?)'; $params[] = json_encode((int)$filters['tag']); }
  if (!empty($filters['q'])) { $q = '%' . $filters['q'] . '%'; $where[] = '(title LIKE ? OR excerpt LIKE ?)'; $params[] = $q; $params[] = $q; }
  if (!empty($filters['exclude'])) { $where[] = 'id != ?'; $params[] = (int)$filters['exclude']; }
  return [$where ? ' WHERE ' . implode(' AND ', $where) : '', $params];
}

/* Публичная лента + список в админке — фильтры category/tag/q, лимит/офсет
   зажаты в безопасный диапазон и интерполируются как проверенные int
   (LIMIT/OFFSET через PDO-плейсхолдеры на некоторых сборках ведут себя
   нестабильно, поэтому здесь — валидированные целые прямо в SQL). */
function articleQuery(array $filters = [], bool $all = false): array {
  ensureBlogTables();
  [$whereSql, $params] = articleWhereSql($filters, $all);
  $countStmt = db()->prepare("SELECT COUNT(*) FROM cms_articles{$whereSql}");
  $countStmt->execute($params);
  $total = (int)$countStmt->fetchColumn();

  $order = ($filters['order'] ?? '') === 'views' ? 'views DESC, id DESC' : 'published_at DESC, id DESC';
  $limit = max(1, min(60, (int)($filters['limit'] ?? 12)));
  $offset = max(0, (int)($filters['offset'] ?? 0));
  $stmt = db()->prepare("SELECT * FROM cms_articles{$whereSql} ORDER BY {$order} LIMIT {$limit} OFFSET {$offset}");
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$row) hydrateArticleRow($row);
  unset($row);
  return ['items' => $rows, 'total' => $total];
}

function articleBySlug(string $slug, bool $all = false): ?array {
  ensureBlogTables();
  $stmt = db()->prepare('SELECT * FROM cms_articles WHERE slug = ?');
  $stmt->execute([$slug]);
  $row = $stmt->fetch();
  if (!$row) return null;
  if (!$all && !articleIsVisible($row)) return null;
  hydrateArticleRow($row);
  return $row;
}
function articleById(int $id): ?array {
  ensureBlogTables();
  $stmt = db()->prepare('SELECT * FROM cms_articles WHERE id = ?');
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if (!$row) return null;
  hydrateArticleRow($row);
  return $row;
}
function articleCanonical(array $row, string $base): string {
  $custom = trim((string)($row['canonical'] ?? ''));
  return $custom !== '' ? $custom : rtrim($base, '/') . '/journal/' . $row['slug'];
}
function incrementArticleViews(int $id): void {
  try { db()->prepare('UPDATE cms_articles SET views = views + 1 WHERE id = ?')->execute([$id]); } catch (Throwable $e) {}
}

/* Просмотры/популярное/последнее — всё агрегатами по cms_articles.views,
   без отдельной time-series таблицы (не запрашивалась динамика по дням).
   Точка расширения под Яндекс.Метрику: когда появится OAuth-токен API,
   totalViews/topArticles можно будет подменить данными из Metrika Reporting
   API, не трогая структуру ответа — вызывающий код (админка) не изменится. */
function articleAnalytics(): array {
  ensureBlogTables();
  $out = ['totalViews' => 0, 'topArticles' => [], 'topCategories' => [], 'recent' => []];
  try {
    $out['totalViews'] = (int)db()->query('SELECT COALESCE(SUM(views),0) FROM cms_articles')->fetchColumn();
    $out['topArticles'] = db()->query("SELECT id,title,slug,views,status FROM cms_articles WHERE status='published' ORDER BY views DESC LIMIT 5")->fetchAll();
    $out['recent'] = db()->query('SELECT id,title,slug,status,published_at FROM cms_articles ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5')->fetchAll();
    $catTotals = [];
    foreach (db()->query('SELECT category_ids, views FROM cms_articles')->fetchAll() as $r) {
      foreach (json_decode($r['category_ids'] ?: '[]', true) ?: [] as $id) $catTotals[(int)$id] = ($catTotals[(int)$id] ?? 0) + (int)$r['views'];
    }
    arsort($catTotals);
    $names = array_column(categoryRows(), 'name', 'id');
    foreach (array_slice($catTotals, 0, 5, true) as $id => $views) if (isset($names[$id])) $out['topCategories'][] = ['name' => $names[$id], 'views' => $views];
  } catch (Throwable $e) { error_log($e->__toString()); }
  return $out;
}

/* Время чтения — эвристика ~180 слов/мин на русском тексте, считается один
   раз при сохранении статьи и кешируется в reading_time_min (не на каждом
   чтении). preg_split с модификатором /u/, а не str_word_count — иначе
   кириллица считается неверно (str_word_count заточен под латиницу). */
function readingTimeMinutes(array $blocks): int {
  $words = 0;
  foreach ($blocks as $b) {
    $text = '';
    $type = $b['type'] ?? '';
    if (in_array($type, ['heading', 'quote', 'callout'], true)) $text = (string)($b['text'] ?? '');
    elseif ($type === 'text') $text = strip_tags((string)($b['html'] ?? ''));
    elseif ($type === 'list') $text = implode(' ', (array)($b['items'] ?? []));
    elseif ($type === 'faq') foreach (($b['items'] ?? []) as $it) $text .= ' ' . ($it['q'] ?? '') . ' ' . ($it['a'] ?? '');
    elseif ($type === 'table') { foreach (($b['headers'] ?? []) as $h) $text .= ' ' . $h; foreach (($b['rows'] ?? []) as $r) $text .= ' ' . implode(' ', (array)$r); }
    elseif ($type === 'cta') $text = ($b['title'] ?? '') . ' ' . ($b['text'] ?? '');
    if (trim($text) === '') continue;
    $parts = preg_split('/\s+/u', trim($text));
    $words += is_array($parts) ? count(array_filter($parts, fn($p) => $p !== '')) : 0;
  }
  return max(1, (int)ceil($words / 180));
}

/* Белый список схем для ссылок в блоках CTA/«Кнопка»: без него admin-панель
   позволила бы сохранить href="javascript:..." — тот же принцип, что уже
   применён к ссылкам внутри rich-текста в cleanInlineNode(). */
function safeHref(string $href): string {
  $href = trim($href);
  return preg_match('~^(https?://|mailto:|tel:|/|#)~i', $href) ? $href : '';
}

function youtubeId(string $input): string {
  $input = trim($input);
  if ($input === '') return '';
  if (preg_match('#^[A-Za-z0-9_-]{11}$#', $input)) return $input;
  if (preg_match('#(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]{11})#', $input, $m)) return $m[1];
  return '';
}

/* DOMDocument-фильтр для инлайн-форматирования текстового блока статьи:
   разрешены только strong/em/s/a/br, всё остальное разворачивается до текста
   (тег снимается, содержимое остаётся), атрибуты — только проверенный href.
   Никакой сторонней библиотеки очистки HTML — только встроенный DOMDocument. */
function sanitizeInlineHtml(string $html): string {
  $html = trim($html);
  if ($html === '') return '';
  $doc = new DOMDocument();
  libxml_use_internal_errors(true);
  $doc->loadHTML('<?xml encoding="utf-8"?><div>' . $html . '</div>', LIBXML_NOERROR | LIBXML_NOWARNING);
  libxml_clear_errors();
  $wrapper = $doc->getElementsByTagName('div')->item(0);
  return $wrapper ? trim(cleanInlineNode($wrapper)) : '';
}
function cleanInlineNode(DOMNode $node): string {
  $out = '';
  foreach (iterator_to_array($node->childNodes) as $child) {
    if ($child->nodeType === XML_TEXT_NODE) { $out .= htmlspecialchars($child->textContent, ENT_QUOTES, 'UTF-8'); continue; }
    if ($child->nodeType !== XML_ELEMENT_NODE) continue;
    $tag = strtolower($child->nodeName);
    $tag = $tag === 'b' ? 'strong' : ($tag === 'i' ? 'em' : ($tag === 'del' ? 's' : $tag));
    if ($tag === 'br') { $out .= '<br>'; continue; }
    if (!in_array($tag, ['strong', 'em', 's', 'a'], true)) { $out .= cleanInlineNode($child); continue; }
    $inner = cleanInlineNode($child);
    if ($tag === 'a') {
      $href = $child instanceof DOMElement ? $child->getAttribute('href') : '';
      if (!preg_match('~^(https?://|mailto:|/|#)~i', $href)) { $out .= $inner; continue; }
      $out .= '<a href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '" target="_blank" rel="noopener noreferrer">' . $inner . '</a>';
    } else {
      $out .= "<{$tag}>{$inner}</{$tag}>";
    }
  }
  return $out;
}

/* Тот же белый список, что sanitizeProjectBlocks, но палитра шире — под
   формат экспертной статьи, а не карточки кейса. */
function sanitizeArticleBlocks($raw): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $limit) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $limit);
  $out = [];
  foreach (array_slice($raw, 0, 80) as $block) {
    if (!is_array($block)) continue;
    $type = (string)($block['type'] ?? '');
    if ($type === 'heading') {
      $t = $str($block['text'] ?? '', 200); if ($t === '') continue;
      $level = (int)($block['level'] ?? 2); if ($level < 2 || $level > 6) $level = 2;
      $out[] = ['type' => 'heading', 'level' => $level, 'text' => $t];
    } elseif ($type === 'text') {
      $html = sanitizeInlineHtml((string)($block['html'] ?? ''));
      if ($html !== '') $out[] = ['type' => 'text', 'html' => mb_substr($html, 0, 4000)];
    } elseif ($type === 'quote') {
      $t = $str($block['text'] ?? '', 800); if ($t !== '') $out[] = ['type' => 'quote', 'text' => $t, 'author' => $str($block['author'] ?? '', 120)];
    } elseif ($type === 'image') {
      $src = $str($block['src'] ?? '', 500); if ($src === '') continue;
      $size = in_array($block['size'] ?? '', ['inset', 'wide', 'full'], true) ? $block['size'] : 'wide';
      $out[] = ['type' => 'image', 'src' => $src, 'caption' => $str($block['caption'] ?? '', 240), 'size' => $size];
    } elseif ($type === 'gallery') {
      $items = [];
      foreach (array_slice((array)($block['items'] ?? []), 0, 12) as $item) {
        $src = $str(is_array($item) ? ($item['src'] ?? '') : '', 500);
        if ($src !== '') $items[] = ['src' => $src, 'caption' => $str(is_array($item) ? ($item['caption'] ?? '') : '', 240)];
      }
      if ($items) $out[] = ['type' => 'gallery', 'items' => $items];
    } elseif ($type === 'video') {
      $src = $str($block['src'] ?? '', 500); if ($src === '') continue;
      $out[] = ['type' => 'video', 'src' => $src, 'poster' => $str($block['poster'] ?? '', 500)];
    } elseif ($type === 'youtube') {
      $id = youtubeId((string)($block['id'] ?? '')); if ($id === '') continue;
      $out[] = ['type' => 'youtube', 'id' => $id];
    } elseif ($type === 'list') {
      $items = [];
      foreach (array_slice((array)($block['items'] ?? []), 0, 30) as $item) { $t = $str($item, 300); if ($t !== '') $items[] = $t; }
      if ($items) $out[] = ['type' => 'list', 'ordered' => !empty($block['ordered']), 'items' => $items];
    } elseif ($type === 'table') {
      $headers = [];
      foreach (array_slice((array)($block['headers'] ?? []), 0, 8) as $h) $headers[] = $str($h, 100);
      $rows = [];
      foreach (array_slice((array)($block['rows'] ?? []), 0, 50) as $row) {
        $r = [];
        foreach (array_slice((array)$row, 0, 8) as $cell) $r[] = $str($cell, 300);
        if ($r) $rows[] = $r;
      }
      if ($headers || $rows) $out[] = ['type' => 'table', 'headers' => $headers, 'rows' => $rows];
    } elseif ($type === 'callout') {
      $t = $str($block['text'] ?? '', 600); if ($t === '') continue;
      $variant = in_array($block['variant'] ?? '', ['info', 'warning'], true) ? $block['variant'] : 'info';
      $out[] = ['type' => 'callout', 'variant' => $variant, 'text' => $t];
    } elseif ($type === 'faq') {
      $items = [];
      foreach (array_slice((array)($block['items'] ?? []), 0, 20) as $item) {
        $q = $str(is_array($item) ? ($item['q'] ?? '') : '', 200);
        $a = $str(is_array($item) ? ($item['a'] ?? '') : '', 1000);
        if ($q !== '' && $a !== '') $items[] = ['q' => $q, 'a' => $a];
      }
      if ($items) $out[] = ['type' => 'faq', 'items' => $items];
    } elseif ($type === 'cta') {
      $title = $str($block['title'] ?? '', 160); if ($title === '') continue;
      $out[] = ['type' => 'cta', 'title' => $title, 'text' => $str($block['text'] ?? '', 400), 'button_label' => $str($block['button_label'] ?? '', 60), 'button_href' => safeHref($str($block['button_href'] ?? '', 500))];
    } elseif ($type === 'button') {
      $label = $str($block['label'] ?? '', 60); $href = safeHref($str($block['href'] ?? '', 500));
      if ($label === '' || $href === '') continue;
      $style = in_array($block['style'] ?? '', ['dark', 'light', 'outline'], true) ? $block['style'] : 'dark';
      $out[] = ['type' => 'button', 'label' => $label, 'href' => $href, 'style' => $style];
    } elseif ($type === 'divider') {
      $out[] = ['type' => 'divider'];
    }
  }
  return $out;
}

/* =======================================================================
   Услуги: SEO-страницы /services/<slug>/ с полностью редактируемым
   содержимым. Таблица создаётся лениво при первом обращении — как
   cms_articles. Пока таблица пуста, страницы берут контент из
   services/_data.php, поэтому сайт не ложится до первого сохранения.
   ======================================================================= */
function ensureServicesTable(): bool {
  static $done = null;
  if ($done !== null) return $done;
  try {
    /* Длинные тексты — TEXT, а не VARCHAR: при utf8mb4 каждый символ занимает
       4 байта, и десяток VARCHAR(255–500) переваливает лимит строки InnoDB
       (8126 байт) — CREATE TABLE падает с «Row size too large».
       В VARCHAR остаётся только то, что коротко и по чему нужен индекс. */
    db()->exec('CREATE TABLE IF NOT EXISTS cms_services (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      `slug` VARCHAR(190) NOT NULL DEFAULT "",
      `title` VARCHAR(190) NOT NULL DEFAULT "",
      `badge` VARCHAR(120) NOT NULL DEFAULT "",
      `h1` VARCHAR(190) NOT NULL DEFAULT "",
      `service_type` VARCHAR(120) NOT NULL DEFAULT "",
      `cases_cat` VARCHAR(40) NOT NULL DEFAULT "",
      `cta_primary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `cta_secondary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `hero_primary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `hero_secondary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `seo_title` VARCHAR(190) NOT NULL DEFAULT "",
      `meta_robots` VARCHAR(40) NOT NULL DEFAULT "index,follow",
      `status` VARCHAR(20) NOT NULL DEFAULT "published",
      `lead` TEXT NULL,
      `hero_image` TEXT NULL,
      `hero_video` TEXT NULL,
      `intro_title` TEXT NULL,
      `intro_text` TEXT NULL,
      `steps_title` TEXT NULL,
      `steps_text` TEXT NULL,
      `cases_title` TEXT NULL,
      `cta_title` TEXT NULL,
      `cta_text` TEXT NULL,
      `cta_primary_href` TEXT NULL,
      `cta_secondary_href` TEXT NULL,
      `seo_description` TEXT NULL,
      `og_image` TEXT NULL,
      `facts` LONGTEXT NULL,
      `works` LONGTEXT NULL,
      `steps` LONGTEXT NULL,
      `faq` LONGTEXT NULL,
      `benefits` LONGTEXT NULL,
      `reviews` LONGTEXT NULL,
      `calc` LONGTEXT NULL,
      `sort_order` INT NOT NULL DEFAULT 0,
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY `slug` (`slug`)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    /* CREATE TABLE IF NOT EXISTS не обновляет таблицу, которая уже была
       создана ранней версией CMS. В результате список услуг открывался, но
       сохранение падало на новых полях редактора (например hero_image).
       Дописываем только отсутствующие неключевые колонки: существующие
       записи, их URL и порядок при этом не меняются. */
    ensureServicesColumns();
    seedServicesFromFile();
    return $done = true;
  } catch (Throwable $e) {
    /* Текст ошибки сохраняем: без него админка показывала бы «не удалось»
       без единой подсказки, что именно не так с базой. */
    servicesTableError($e->getMessage());
    error_log($e->__toString());
    return $done = false;
  }
}

function ensureServicesColumns(): void {
  $present = [];
  foreach (db()->query('SHOW COLUMNS FROM `cms_services`')->fetchAll() as $column) {
    $present[(string)$column['Field']] = true;
  }

  /* Здесь перечислены только поля контента. Базовые id, slug и sort_order
     были в первой версии таблицы и не мигрируются автоматически, чтобы не
     маскировать повреждённую схему. */
  $columns = [
    'title' => "VARCHAR(190) NOT NULL DEFAULT ''",
    'badge' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'h1' => "VARCHAR(190) NOT NULL DEFAULT ''",
    'service_type' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'cases_cat' => "VARCHAR(40) NOT NULL DEFAULT ''",
    'cta_primary_label' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'cta_secondary_label' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'hero_primary_label' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'hero_secondary_label' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'seo_title' => "VARCHAR(190) NOT NULL DEFAULT ''",
    'meta_robots' => "VARCHAR(40) NOT NULL DEFAULT 'index,follow'",
    'status' => "VARCHAR(20) NOT NULL DEFAULT 'published'",
    'lead' => 'TEXT NULL',
    'hero_image' => 'TEXT NULL',
    'hero_video' => 'TEXT NULL',
    'intro_title' => 'TEXT NULL',
    'intro_text' => 'TEXT NULL',
    'steps_title' => 'TEXT NULL',
    'steps_text' => 'TEXT NULL',
    'cases_title' => 'TEXT NULL',
    'cta_title' => 'TEXT NULL',
    'cta_text' => 'TEXT NULL',
    'cta_primary_href' => 'TEXT NULL',
    'cta_secondary_href' => 'TEXT NULL',
    'seo_description' => 'TEXT NULL',
    'og_image' => 'TEXT NULL',
    'facts' => 'LONGTEXT NULL',
    'works' => 'LONGTEXT NULL',
    'steps' => 'LONGTEXT NULL',
    'faq' => 'LONGTEXT NULL',
    'benefits' => 'LONGTEXT NULL',
    'reviews' => 'LONGTEXT NULL',
    'calc' => 'LONGTEXT NULL',
  ];
  foreach ($columns as $name => $definition) {
    if (!isset($present[$name])) db()->exec("ALTER TABLE `cms_services` ADD COLUMN `{$name}` {$definition}");
  }
}

/* Последняя ошибка подготовки таблицы — чтобы API мог её показать. */
function servicesTableError(?string $set = null): string {
  static $msg = '';
  if ($set !== null) $msg = $set;
  return $msg;
}

/* Первое наполнение: переносим услуги из services/_data.php в базу.
   Заполняем ВСЕ поля, включая заголовки секций и подписи кнопок — иначе
   в админке они выглядели бы пустыми, хотя на сайте текст есть (он берётся
   из значений по умолчанию в шаблоне), и было бы непонятно, что где менять. */
function seedServicesFromFile(): void {
  try {
    if ((int)db()->query('SELECT COUNT(*) FROM cms_services')->fetchColumn() > 0) return;
    $file = __DIR__ . '/services/_data.php';
    if (!is_file($file)) return;
    $items = require $file;
    if (!is_array($items)) return;

    /* Те же значения, что подставляет шаблон, когда поле пустое. */
    $DEF = [
      'intro_title' => 'Что входит в работу',
      'intro_text'  => 'Полный цикл под ключ: вы не собираете подрядчиков по частям и не доплачиваете за то, что должно быть в базе.',
      'steps_title' => 'Как идёт работа',
      'steps_text'  => 'Четыре этапа с понятным результатом на каждом — вы всегда знаете, на какой стадии проект.',
      'cases_title' => 'Кейсы по услуге',
      'cta_primary_label'   => 'Обсудить проект',
      'cta_primary_href'    => '/#write',
      'cta_secondary_label' => 'Написать в Telegram',
      'cta_secondary_href'  => 'https://t.me/dmitrypelenev',
      'hero_primary_label'   => 'Обсудить проект',
      'hero_secondary_label' => 'Смотреть кейсы',
    ];
    $CALC_DEF = [
      'cta_label' => 'Обсудить проект',
      'cta_href' => '/#write',
      'hint' => 'Ни к чему не обязывает — обсудим задачу и уточним смету.',
      'total_label' => 'Стоимость проекта',
    ];

    $pairs = function (array $rows): string {
      $out = [];
      foreach ($rows as $r) $out[] = ['title' => (string)($r[0] ?? ''), 'text' => (string)($r[1] ?? '')];
      return json_encode($out, JSON_UNESCAPED_UNICODE);
    };

    $cols = ['`slug`','`title`','`badge`','`h1`','`lead`','`service_type`','`cases_cat`',
             '`intro_title`','`intro_text`','`steps_title`','`steps_text`','`cases_title`',
             '`cta_title`','`cta_text`','`cta_primary_label`','`cta_primary_href`',
             '`cta_secondary_label`','`cta_secondary_href`','`hero_primary_label`','`hero_secondary_label`',
             '`facts`','`works`','`steps`','`faq`','`benefits`','`reviews`','`calc`',
             '`seo_title`','`seo_description`','`status`','`sort_order`'];
    $stmt = db()->prepare('INSERT INTO cms_services (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')');

    $order = 0;
    foreach ($items as $slug => $x) {
      $calc = (array)($x['calc'] ?? []);
      $calc['enabled'] = true;
      foreach ($CALC_DEF as $k => $v) if (trim((string)($calc[$k] ?? '')) === '') $calc[$k] = $v;

      $stmt->execute([
        (string)$slug,
        (string)($x['h1'] ?? $slug),
        (string)($x['badge'] ?? ''),
        (string)($x['h1'] ?? ''),
        (string)($x['lead'] ?? ''),
        (string)($x['service_type'] ?? ''),
        (string)($x['cases_cat'] ?? ''),
        $DEF['intro_title'], $DEF['intro_text'],
        $DEF['steps_title'], $DEF['steps_text'],
        $DEF['cases_title'],
        (string)($x['cta_title'] ?? ''),
        (string)($x['cta_text'] ?? ''),
        $DEF['cta_primary_label'], $DEF['cta_primary_href'],
        $DEF['cta_secondary_label'], $DEF['cta_secondary_href'],
        $DEF['hero_primary_label'], $DEF['hero_secondary_label'],
        $pairs((array)($x['facts'] ?? [])),
        $pairs((array)($x['works'] ?? [])),
        $pairs((array)($x['steps'] ?? [])),
        json_encode([], JSON_UNESCAPED_UNICODE),
        json_encode([], JSON_UNESCAPED_UNICODE),
        json_encode([], JSON_UNESCAPED_UNICODE),
        json_encode($calc, JSON_UNESCAPED_UNICODE),
        (string)($x['seo_title'] ?? ''),
        (string)($x['seo_description'] ?? ''),
        'published',
        $order++,
      ]);
    }
    logEvent('services-seed', 'Перенос услуг из файла: ' . count($items));
  } catch (Throwable $e) { error_log($e->__toString()); }
}

/* JSON-поля разворачиваем один раз здесь, чтобы шаблон и админка
   получали готовые массивы и нигде не дублировали json_decode. */
function hydrateServiceRow(array &$row): void {
  foreach (['facts', 'works', 'steps', 'faq', 'benefits', 'reviews', 'calc'] as $key) {
    $decoded = json_decode((string)($row[$key] ?? ''), true);
    $row[$key] = is_array($decoded) ? $decoded : [];
  }
}

function serviceRows(bool $all = false): array {
  if (!ensureServicesTable()) return [];
  try {
    $rows = db()->query('SELECT * FROM cms_services ORDER BY sort_order ASC, id ASC')->fetchAll();
  } catch (Throwable $e) { error_log($e->__toString()); return []; }
  foreach ($rows as &$row) hydrateServiceRow($row);
  unset($row);
  return $all ? $rows : array_values(array_filter($rows, fn($r) => ($r['status'] ?? 'published') === 'published'));
}

function serviceBySlug(string $slug, bool $all = false): ?array {
  foreach (serviceRows($all) as $row) if ((string)$row['slug'] === $slug) return $row;
  return null;
}

function serviceById(int $id): ?array {
  foreach (serviceRows(true) as $row) if ((int)$row['id'] === $id) return $row;
  return null;
}

/* Пары «заголовок → текст»: факты, что входит, этапы, FAQ, преимущества. */
function sanitizeServicePairs($raw, int $limit = 12, int $aLen = 200, int $bLen = 600): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $n) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $n);
  $out = [];
  foreach (array_slice($raw, 0, $limit) as $item) {
    if (!is_array($item)) continue;
    $a = $str($item['title'] ?? ($item[0] ?? ''), $aLen);
    $b = $str($item['text'] ?? ($item[1] ?? ''), $bLen);
    if ($a === '' && $b === '') continue;
    $out[] = ['title' => $a, 'text' => $b];
  }
  return $out;
}

/* Отзывы: имя, роль, текст, аватар. */
function sanitizeServiceReviews($raw): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $n) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $n);
  $out = [];
  foreach (array_slice($raw, 0, 8) as $item) {
    if (!is_array($item)) continue;
    $text = $str($item['text'] ?? '', 800);
    $name = $str($item['name'] ?? '', 120);
    if ($text === '' && $name === '') continue;
    $out[] = ['name' => $name, 'role' => $str($item['role'] ?? '', 160), 'text' => $text, 'avatar' => $str($item['avatar'] ?? '', 500)];
  }
  return $out;
}

/* Калькулятор. types — взаимоисключающий выбор, options — тумблеры.
   free_with ссылается на id типа: с ним опция включена и не снимается. */
function sanitizeServiceCalc($raw): array {
  if (!is_array($raw)) return [];
  $str = fn($v, $n) => mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $n);
  $types = [];
  foreach (array_slice((array)($raw['types'] ?? []), 0, 8) as $i => $t) {
    if (!is_array($t)) continue;
    $title = $str($t['title'] ?? '', 190);
    if ($title === '') continue;
    $id = $str($t['id'] ?? '', 40);
    if ($id === '' || !preg_match('/^[a-z0-9_-]+$/', $id)) $id = 'type-' . ($i + 1);
    $types[] = ['id' => $id, 'title' => $title, 'text' => $str($t['text'] ?? '', 400), 'price' => max(0, (int)($t['price'] ?? 0)), 'from' => !empty($t['from'])];
  }
  $options = [];
  foreach (array_slice((array)($raw['options'] ?? []), 0, 12) as $o) {
    if (!is_array($o)) continue;
    $title = $str($o['title'] ?? '', 190);
    if ($title === '') continue;
    $freeWith = $str($o['free_with'] ?? '', 40);
    /* free_with должен указывать на существующий тип, иначе опция никогда
       не станет бесплатной и в интерфейсе это выглядело бы как баг. */
    if ($freeWith !== '' && !in_array($freeWith, array_column($types, 'id'), true)) $freeWith = '';
    $options[] = [
      'title' => $title,
      'text' => $str($o['text'] ?? '', 400),
      'price' => max(0, (int)($o['price'] ?? 0)),
      'from' => !empty($o['from']),
      'free_with' => $freeWith,
      'note' => $str($o['note'] ?? '', 400),
    ];
  }
  return [
    'enabled' => !empty($raw['enabled']),
    'title' => $str($raw['title'] ?? '', 190),
    'intro' => $str($raw['intro'] ?? '', 400),
    'cta_label' => $str($raw['cta_label'] ?? '', 120),
    'cta_href' => safeHref($str($raw['cta_href'] ?? '', 500)),
    'hint' => $str($raw['hint'] ?? '', 200),
    'total_label' => $str($raw['total_label'] ?? '', 120),
    'types' => $types,
    'options' => $options,
  ];
}

/* =======================================================================
   Обложки и медиа: и у кейсов, и у статей обложка — просто URL, поэтому
   тип определяем по расширению. Один помощник на все страницы, чтобы
   разметка видео не расползлась по шаблонам копиями.
   ======================================================================= */
function isVideoSrc(string $src): bool {
  $path = strtolower((string)(parse_url($src, PHP_URL_PATH) ?: $src));
  return (bool)preg_match('/\.(mp4|webm|mov)$/', $path);
}

/* Возвращает <img> или <video> с одинаковыми классом и alt.
   Видео в обложках — беззвучное и зациклённое: это витрина, а не плеер. */
function coverMediaTag(string $src, string $alt, array $opts = []): string {
  if ($src === '') return '';
  $esc = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
  $class = isset($opts['class']) ? ' class="' . $esc($opts['class']) . '"' : '';
  $extra = $opts['extra'] ?? '';
  if (isVideoSrc($src)) {
    return '<video' . $class . ' src="' . $esc($src) . '" muted loop playsinline autoplay preload="metadata" aria-label="' . $esc($alt) . '"' . $extra . '></video>';
  }
  $loading = ($opts['eager'] ?? false) ? ' fetchpriority="high"' : ' loading="lazy"';
  return '<img' . $class . ' src="' . $esc($src) . '" alt="' . $esc($alt) . '"' . $loading . ' decoding="async"' . $extra . '>';
}

/* Для og:image и schema.org видео не годится — подставляем запасную картинку. */
function ogImageFallback(string $src, string $fallback = '/assets/og-preview.jpg'): string {
  return ($src === '' || isVideoSrc($src)) ? $fallback : $src;
}
