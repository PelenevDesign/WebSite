<?php
declare(strict_types=1);

/* API админки для обычного PHP-хостинга Beget. */
require __DIR__ . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params([
  'path' => '/',
  'httponly' => true,
  'secure' => isHttps(),
  'samesite' => 'Lax',
]);
session_start();

/* Ошибка PHP до формирования JSON раньше превращалась для админки в пустой
   ответ: редактор услуг мог показать лишь «Не удалось сохранить». Для
   авторизованного администратора возвращаем контролируемое сообщение, а для
   публичных запросов не раскрываем детали сервера. */
function apiUnexpectedError(Throwable $error): void {
  error_log($error->__toString());
  $details = !empty($_SESSION['cms_authorized']) ? ' ' . $error->getMessage() : '';
  response(500, ['error' => 'Ошибка сервера при обработке запроса.' . $details]);
}
set_exception_handler('apiUnexpectedError');

$uploadsDir = __DIR__ . '/uploads';

function response(int $status, array $data = []): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('Pragma: no-cache');
  header('Expires: 0');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function databaseErrorMessage(Throwable $error): string {
  if ($error instanceof RuntimeException) return $error->getMessage();
  if ($error instanceof PDOException) return 'Не удаётся подключиться к MySQL. Проверьте host, имя базы, логин и пароль в config.php.';
  return 'Ошибка базы данных. Проверьте настройку MySQL в config.php и повторите установку через install.php.';
}

function requestData(): array {
  $data = json_decode(file_get_contents('php://input'), true);
  return is_array($data) ? $data : [];
}

function authorized(): bool {
  return !empty($_SESSION['cms_authorized']);
}

function csrfToken(): string {
  if (empty($_SESSION['csrf_token'])) $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  return $_SESSION['csrf_token'];
}

function requireCsrf(): void {
  $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (!is_string($provided) || !hash_equals(csrfToken(), $provided)) response(419, ['error' => 'Сессия устарела. Обновите страницу.']);
}

/* Защита от перебора пароля: не больше 5 попыток за 15 минут с одного IP.
   Файл лежит в корне под именем .ht* — Apache такие файлы наружу не отдаёт. */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW = 900;
function throttleFile(): string { return __DIR__ . '/.htlogin-attempts.json'; }
function throttleKey(): string { return substr(hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'cli')), 0, 16); }
function throttleRead(): array {
  $raw = @file_get_contents(throttleFile());
  $data = $raw === false ? [] : json_decode($raw, true);
  if (!is_array($data)) $data = [];
  $now = time();
  return array_filter($data, fn($entry) => is_array($entry) && ($entry['until'] ?? 0) > $now);
}
function throttleRemaining(): int {
  $entry = throttleRead()[throttleKey()] ?? null;
  if (!$entry || ($entry['count'] ?? 0) < LOGIN_MAX_ATTEMPTS) return 0;
  return max(1, (int)ceil((($entry['until'] ?? 0) - time()) / 60));
}
function throttleRegisterFailure(): void {
  $data = throttleRead(); $key = throttleKey();
  $data[$key] = ['count' => (int)(($data[$key]['count'] ?? 0)) + 1, 'until' => time() + LOGIN_WINDOW];
  @file_put_contents(throttleFile(), json_encode($data), LOCK_EX);
}
function throttleReset(): void {
  $data = throttleRead(); unset($data[throttleKey()]);
  @file_put_contents(throttleFile(), json_encode($data), LOCK_EX);
}

/* Антиспам для формы: не больше 5 заявок в час с одного IP. */
const LEAD_MAX = 5;
const LEAD_WINDOW = 3600;
function leadFile(): string { return __DIR__ . '/.htlead-attempts.json'; }
function leadRead(): array {
  $raw = @file_get_contents(leadFile());
  $data = $raw === false ? [] : json_decode($raw, true);
  if (!is_array($data)) $data = [];
  $now = time();
  return array_filter($data, fn($e) => is_array($e) && ($e['until'] ?? 0) > $now);
}
function leadThrottle(): int {
  $entry = leadRead()[throttleKey()] ?? null;
  if (!$entry || ($entry['count'] ?? 0) < LEAD_MAX) return 0;
  return max(1, (int)ceil(((($entry['until'] ?? 0) - time())) / 60));
}
function leadThrottleRegister(): void {
  $data = leadRead(); $key = throttleKey();
  $data[$key] = ['count' => (int)($data[$key]['count'] ?? 0) + 1, 'until' => ($data[$key]['until'] ?? 0) > time() ? $data[$key]['until'] : time() + LEAD_WINDOW];
  @file_put_contents(leadFile(), json_encode($data), LOCK_EX);
}

function removeUnusedUploads(array $urls): void {
  global $uploadsDir;
  $pdo = db();
  ensureBlogTables(); // на случай, если раздел «Журнал» ещё ни разу не открывали — cms_articles должна существовать до запроса ниже
  foreach (array_unique($urls) as $url) {
    if (!is_string($url) || !str_starts_with($url, '/uploads/')) continue;
    $name = basename(parse_url($url, PHP_URL_PATH) ?: '');
    if ($name === '' || !preg_match('/^[A-Za-z0-9._-]+$/', $name)) continue;
    $stmt = $pdo->prepare('SELECT
        (SELECT COUNT(*) FROM cms_projects WHERE cover = ? OR gallery LIKE ? OR blocks LIKE ?)
      + (SELECT COUNT(*) FROM cms_articles WHERE cover = ? OR blocks LIKE ?)');
    $stmt->execute([$url, '%' . $name . '%', '%' . $name . '%', $url, '%' . $name . '%']);
    if ((int)$stmt->fetchColumn() === 0) @unlink($uploadsDir . '/' . $name);
  }
}

/* WebP/AVIF/миниатюры для загруженной картинки — best-effort через GD.
   Ничего не гарантирует: на хостинге без нужной сборки GD просто вернёт
   пустые значения, вызывающий код это игнорирует (аддитивный ответ). */
function buildImageDerivatives(string $absPath, string $binary, string $ext): array {
  $out = ['webp' => null, 'avif' => null, 'srcset' => null, 'width' => null, 'height' => null];
  if (!function_exists('imagecreatefromstring')) return $out;
  $img = @imagecreatefromstring($binary);
  if (!$img) return $out;
  try {
    $width = imagesx($img); $height = imagesy($img);
    $out['width'] = $width; $out['height'] = $height;
    if (function_exists('imagepalettetotruecolor')) imagepalettetotruecolor($img);
    imagealphablending($img, true);
    imagesavealpha($img, true);

    $base = substr($absPath, 0, -(strlen($ext) + 1)); // путь без расширения
    $baseUrl = '/uploads/' . basename($base);

    if (function_exists('imagewebp') && @imagewebp($img, $base . '.webp', 82)) $out['webp'] = $baseUrl . '.webp';
    if (function_exists('imageavif') && @imageavif($img, $base . '.avif', 60) && is_file($base . '.avif')) $out['avif'] = $baseUrl . '.avif';

    $srcset = [];
    if (function_exists('imagewebp')) {
      foreach ([800, 1600] as $w) {
        if ($width <= $w) continue; // не апскейлим маленькие оригиналы
        $h = max(1, (int)round($height * ($w / $width)));
        $resized = imagecreatetruecolor($w, $h);
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
        imagecopyresampled($resized, $img, 0, 0, 0, 0, $w, $h, $width, $height);
        if (@imagewebp($resized, $base . '-' . $w . 'w.webp', 82)) $srcset[] = $baseUrl . '-' . $w . 'w.webp ' . $w . 'w';
        imagedestroy($resized);
      }
    }
    if ($out['webp']) $srcset[] = $out['webp'] . ' ' . $width . 'w';
    if ($srcset) $out['srcset'] = implode(', ', $srcset);
  } finally {
    imagedestroy($img);
  }
  return $out;
}

$action = $_GET['action'] ?? '';

if ($action === 'projects' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  /* Публичный список — только опубликованные; авторизованная админка видит и черновики. */
  try { response(200, ['projects' => projectRows(authorized())]); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

if ($action === 'project' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $project = projectRowsById((int)($_GET['id'] ?? 0), authorized());
  if (!$project) response(404, ['error' => 'Кейс не найден']);
  response(200, ['project' => $project]);
}

/* Заявка с формы обратной связи. Публичный экшен: письмо + запись в БД про запас. */
if ($action === 'lead' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $data = requestData();

  // honeypot: поле скрыто от людей, боты его заполняют — отвечаем «ок» и молча выходим
  if (!empty($data['company'])) response(200, ['ok' => true]);

  $limit = leadThrottle();
  if ($limit > 0) response(429, ['error' => "Слишком много заявок. Повторите через {$limit} мин."]);

  $name    = trim((string)($data['name'] ?? ''));
  $contact = trim((string)($data['contact'] ?? ''));
  $message = trim((string)($data['message'] ?? ''));
  $type    = in_array($data['type'] ?? '', ['telegram', 'phone', 'email'], true) ? $data['type'] : 'контакт';

  if (mb_strlen($name) < 2 || mb_strlen($name) > 100
   || mb_strlen($contact) < 3 || mb_strlen($contact) > 150
   || mb_strlen($message) < 2 || mb_strlen($message) > 3000) {
    response(422, ['error' => 'Проверьте заполнение полей.']);
  }

  // сохраняем до отправки: даже если почта не уйдёт, заявка не потеряется
  try {
    db()->exec('CREATE TABLE IF NOT EXISTS cms_leads (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, contact VARCHAR(150) NOT NULL, contact_type VARCHAR(20) NOT NULL DEFAULT "", message TEXT NOT NULL, page VARCHAR(255) NOT NULL DEFAULT "", ip VARCHAR(45) NOT NULL DEFAULT "", status VARCHAR(20) NOT NULL DEFAULT "new", created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    db()->prepare('INSERT INTO cms_leads (name,contact,contact_type,message,page,ip) VALUES (?,?,?,?,?,?)')
        ->execute([$name, $contact, $type, $message, mb_substr((string)($data['page'] ?? ''), 0, 255), (string)($_SERVER['REMOTE_ADDR'] ?? '')]);
    logEvent('lead', $name . ' — ' . mb_substr($message, 0, 80));
  } catch (Throwable $e) { error_log('lead save: ' . $e->getMessage()); }

  $to = (string)(config()['lead_email'] ?? '');
  $sent = false;
  if ($to !== '') {
    $host = preg_replace('/[^A-Za-z0-9.\-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $subject = '=?UTF-8?B?' . base64_encode('Заявка с сайта — ' . $name) . '?=';
    $body = "Имя: {$name}\nКонтакт ({$type}): {$contact}\n\nСообщение:\n{$message}\n\n"
          . 'Страница: ' . (string)($data['page'] ?? '—') . "\n"
          . 'Время: ' . date('d.m.Y H:i') . "\n"
          . 'IP: ' . (string)($_SERVER['REMOTE_ADDR'] ?? '—') . "\n";
    $headers = [
      'From: PELENEV.DESIGN <noreply@' . $host . '>',
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
    ];
    // если клиент оставил email — можно ответить прямо из почтовика
    if (filter_var($contact, FILTER_VALIDATE_EMAIL)) $headers[] = 'Reply-To: ' . $contact;
    $sent = @mail($to, $subject, $body, implode("\r\n", $headers), '-f noreply@' . $host);
    if (!$sent) error_log('lead mail failed for ' . $to);
  }

  leadThrottleRegister();
  // заявка уже в базе, поэтому фронту отвечаем успехом даже при сбое почты
  response(200, ['ok' => true, 'mailed' => $sent]);
}

if ($action === 'session' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  response(200, ['authorized' => authorized(), 'csrf' => csrfToken()]);
}

if ($action === 'content' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try { response(200, allContent()); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

/* ---- Журнал: публичные экшены (лента статей + счётчик просмотров) ---- */
if ($action === 'journal-articles' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $filters = [
    'category' => (int)($_GET['category'] ?? 0),
    'tag' => (int)($_GET['tag'] ?? 0),
    'q' => trim((string)($_GET['q'] ?? '')),
    'limit' => (int)($_GET['limit'] ?? 12),
    'offset' => (int)($_GET['offset'] ?? 0),
    'exclude' => (int)($_GET['exclude'] ?? 0),
    'order' => (string)($_GET['order'] ?? ''),
  ];
  try { response(200, articleQuery($filters, authorized())); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

/* Счётчик просмотров: анонимный POST без CSRF (как заявка), с дедупом через
   куку — иначе обновление страницы читателем бесконечно накручивало бы views. */
if ($action === 'article-view' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $id = (int)(requestData()['id'] ?? 0);
  if ($id > 0) {
    $seen = array_filter(explode(',', (string)($_COOKIE['journal_seen'] ?? '')), fn($v) => $v !== '');
    if (!in_array((string)$id, $seen, true)) {
      incrementArticleViews($id);
      $seen[] = (string)$id;
      setcookie('journal_seen', implode(',', array_slice($seen, -50)), ['expires' => time() + 86400, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => isHttps()]);
    }
  }
  response(200, ['ok' => true]);
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $minutes = throttleRemaining();
  if ($minutes > 0) response(429, ['error' => "Слишком много попыток входа. Повторите через {$minutes} мин."]);
  $data = requestData();
  if (!isset($data['password']) || !is_string($data['password']) || !verifyAdminPassword($data['password'])) {
    throttleRegisterFailure();
    response(401, ['error' => 'Неверный пароль']);
  }
  throttleReset();
  session_regenerate_id(true);
  $_SESSION['cms_authorized'] = true;
  response(200, ['csrf' => csrfToken()]);
}

if (!authorized()) response(401, ['error' => 'Требуется авторизация']);
/* CSRF-токен обязателен только для изменяющих запросов: GET ничего не меняет,
   а клиент по стандарту токен на GET не отправляет (иначе дашборд/заявки/медиа получают 419). */
if ($_SERVER['REQUEST_METHOD'] !== 'GET') requireCsrf();

if ($action === 'project' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $data = requestData(); $id = (int)($data['id'] ?? 0); $allowedCategories = ['site', 'ai-site', 'ai-content', 'graphic']; $categories = array_values(array_intersect($allowedCategories, array_filter((array)($data['categories'] ?? []), 'is_string'))); $gallery = array_values(array_filter((array)($data['gallery'] ?? []), 'is_string'));
  $status = in_array($data['status'] ?? '', ['published', 'draft', 'hidden'], true) ? $data['status'] : 'published';
  $blocks = json_encode(sanitizeProjectBlocks($data['blocks'] ?? []), JSON_UNESCAPED_UNICODE);
  $stats = json_encode(sanitizeProjectStats($data['stats'] ?? []), JSON_UNESCAPED_UNICODE);
  $fields = [(string)($data['title'] ?? ''), json_encode($categories, JSON_UNESCAPED_UNICODE), (string)($data['client'] ?? ''), (string)($data['industry'] ?? ''), (string)($data['duration'] ?? ''), (string)($data['services'] ?? ''), (string)($data['project_url'] ?? ''), (string)($data['description'] ?? ''), $blocks, $stats, (string)($data['cover'] ?? ($gallery[0] ?? '')), json_encode($gallery, JSON_UNESCAPED_UNICODE), $status];
  if ($fields[0] === '') response(422, ['error' => 'Название проекта обязательно']);
  /* FILTER_VALIDATE_URL сам по себе пропускает javascript:alert(1) как «валидный URL» —
     схему проверяем отдельно, иначе ссылка «Открыть проект» могла бы стать XSS-вектором. */
  /* Индексы позиционные: при добавлении поля в $fields проверить номера здесь.
     10 — обложка (после вставки stats под индексом 9 она сдвинулась с 9-го). */
  if (strlen($fields[0]) > 255 || strlen($fields[2]) > 255 || strlen($fields[3]) > 255 || strlen($fields[4]) > 120 || strlen($fields[5]) > 255 || strlen($fields[6]) > 500 || strlen($fields[10]) > 500 || ($fields[6] !== '' && (!filter_var($fields[6], FILTER_VALIDATE_URL) || !preg_match('~^https?://~i', $fields[6])))) response(422, ['error' => 'Проверьте длину и формат полей кейса.']);
  ensureProjectsBlocksColumn();
  ensureProjectsStatsColumn();
  ensureProjectsDescriptionText();
  ensureProjectsSlugColumn();
  /* Slug — отдельным параметром в конце, а не в позиционном $fields: индексы
     выше и так хрупкие (см. комментарий про сдвиг обложки), лишний раз не трогаем. */
  $slugSource = trim((string)($data['slug'] ?? '')) !== '' ? (string)$data['slug'] : $fields[0];
  $slug = uniqueSlug('cms_projects', slugify($slugSource), $id);
  try { if ($id) { $stmt = db()->prepare('UPDATE cms_projects SET title=?,categories=?,client=?,industry=?,duration=?,services=?,project_url=?,description=?,blocks=?,stats=?,cover=?,gallery=?,status=?,slug=? WHERE id=?'); $stmt->execute([...$fields, $slug, $id]); } else { $order = (int)db()->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cms_projects')->fetchColumn(); $stmt = db()->prepare('INSERT INTO cms_projects (title,categories,client,industry,duration,services,project_url,description,blocks,stats,cover,gallery,status,slug,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'); $stmt->execute([...$fields, $slug, $order]); $id = (int)db()->lastInsertId(); } logEvent('project-save', $fields[0]); response(200, ['project' => projectRowsById($id, true)]); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось сохранить кейс.']); }
}
if ($action === 'project' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0); try { $project = projectRowsById($id, true); db()->prepare('DELETE FROM cms_projects WHERE id=?')->execute([$id]); if ($project) { $blockSrc = []; foreach (($project['blocks'] ?? []) as $b) { if (!empty($b['src'])) $blockSrc[] = $b['src']; foreach (($b['items'] ?? []) as $it) if (!empty($it['src'])) $blockSrc[] = $it['src']; } removeUnusedUploads(array_merge([$project['cover']], $project['gallery'], $blockSrc)); logEvent('project-delete', (string)$project['title']); } response(200); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось удалить кейс.']); }
}

/* ---- Журнал: статьи (только для админки) ---- */
if ($action === 'article' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $article = articleById((int)($_GET['id'] ?? 0));
  if (!$article) response(404, ['error' => 'Статья не найдена']);
  response(200, ['article' => $article]);
}

if ($action === 'article' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  ensureBlogTables(); // uniqueSlug() ниже трогает cms_articles раньше, чем это сделала бы categoryRows()/tagRows()
  $data = requestData();
  $id = (int)($data['id'] ?? 0);
  $title = mb_substr(trim((string)($data['title'] ?? '')), 0, 255);
  if ($title === '') response(422, ['error' => 'Заголовок статьи обязателен']);

  $slugSource = trim((string)($data['slug'] ?? '')) !== '' ? (string)$data['slug'] : $title;
  $slug = uniqueSlug('cms_articles', slugify($slugSource), $id);

  $status = in_array($data['status'] ?? '', ['draft', 'scheduled', 'published', 'hidden'], true) ? $data['status'] : 'draft';
  $publishedRaw = trim((string)($data['published_at'] ?? ''));
  $publishedTs = $publishedRaw !== '' ? strtotime($publishedRaw) : false;
  if ($status === 'scheduled') {
    if ($publishedTs === false) response(422, ['error' => 'Укажите корректные дату и время публикации.']);
    $publishedAt = date('Y-m-d H:i:s', $publishedTs);
  } elseif ($status === 'published') {
    $publishedAt = $publishedTs !== false ? date('Y-m-d H:i:s', $publishedTs) : date('Y-m-d H:i:s');
  } else {
    $publishedAt = $publishedTs !== false ? date('Y-m-d H:i:s', $publishedTs) : null;
  }

  $validCatIds = array_map('intval', array_column(categoryRows(), 'id'));
  $validTagIds = array_map('intval', array_column(tagRows(), 'id'));
  $categoryIds = array_values(array_intersect(array_map('intval', (array)($data['category_ids'] ?? [])), $validCatIds));
  $tagIds = array_values(array_intersect(array_map('intval', (array)($data['tag_ids'] ?? [])), $validTagIds));

  $blocks = sanitizeArticleBlocks($data['blocks'] ?? []);
  $readingTime = readingTimeMinutes($blocks);
  $metaRobots = in_array($data['meta_robots'] ?? '', ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'], true) ? $data['meta_robots'] : 'index,follow';
  $isFeatured = !empty($data['is_featured']) ? 1 : 0;

  $fields = [
    $title, $slug,
    mb_substr(trim((string)($data['excerpt'] ?? '')), 0, 500),
    mb_substr(trim((string)($data['cover'] ?? '')), 0, 500),
    json_encode($blocks, JSON_UNESCAPED_UNICODE),
    json_encode($categoryIds), json_encode($tagIds),
    mb_substr(trim((string)($data['author_name'] ?? '')), 0, 120),
    mb_substr(trim((string)($data['author_avatar'] ?? '')), 0, 500),
    mb_substr(trim((string)($data['author_bio'] ?? '')), 0, 500),
    $status, $publishedAt, $readingTime, $isFeatured,
    mb_substr(trim((string)($data['seo_title'] ?? '')), 0, 70),
    mb_substr(trim((string)($data['seo_description'] ?? '')), 0, 160),
    mb_substr(trim((string)($data['canonical'] ?? '')), 0, 500),
    mb_substr(trim((string)($data['og_image'] ?? '')), 0, 500),
    $metaRobots,
  ];

  try {
    /* избранная статья — только одна: если ставим флаг, сначала снимаем его у всех остальных */
    if ($isFeatured) db()->exec('UPDATE cms_articles SET is_featured = 0');
    if ($id) {
      $stmt = db()->prepare('UPDATE cms_articles SET title=?,slug=?,excerpt=?,cover=?,blocks=?,category_ids=?,tag_ids=?,author_name=?,author_avatar=?,author_bio=?,status=?,published_at=?,reading_time_min=?,is_featured=?,seo_title=?,seo_description=?,canonical=?,og_image=?,meta_robots=? WHERE id=?');
      $stmt->execute([...$fields, $id]);
    } else {
      $stmt = db()->prepare('INSERT INTO cms_articles (title,slug,excerpt,cover,blocks,category_ids,tag_ids,author_name,author_avatar,author_bio,status,published_at,reading_time_min,is_featured,seo_title,seo_description,canonical,og_image,meta_robots) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      $stmt->execute($fields);
      $id = (int)db()->lastInsertId();
    }
    logEvent('article-save', $title);
    response(200, ['article' => articleById($id)]);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось сохранить статью.']); }
}

if ($action === 'article' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  try {
    $article = articleById($id);
    db()->prepare('DELETE FROM cms_articles WHERE id=?')->execute([$id]);
    if ($article) {
      $blockSrc = [];
      foreach (($article['blocks'] ?? []) as $b) {
        if (!empty($b['src'])) $blockSrc[] = $b['src'];
        if (!empty($b['poster'])) $blockSrc[] = $b['poster'];
        foreach (($b['items'] ?? []) as $it) if (!empty($it['src'])) $blockSrc[] = $it['src'];
      }
      removeUnusedUploads(array_merge([$article['cover']], $blockSrc));
      logEvent('article-delete', (string)$article['title']);
    }
    response(200);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось удалить статью.']); }
}

if ($action === 'article-duplicate' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $article = articleById((int)(requestData()['id'] ?? 0));
  if (!$article) response(404, ['error' => 'Статья не найдена']);
  try {
    $slug = uniqueSlug('cms_articles', $article['slug'] . '-copy', 0);
    $stmt = db()->prepare('INSERT INTO cms_articles (title,slug,excerpt,cover,blocks,category_ids,tag_ids,author_name,author_avatar,author_bio,status,published_at,reading_time_min,is_featured,seo_title,seo_description,canonical,og_image,meta_robots) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
      $article['title'] . ' (копия)', $slug, $article['excerpt'], $article['cover'],
      json_encode($article['blocks'], JSON_UNESCAPED_UNICODE), json_encode($article['category_ids']), json_encode($article['tag_ids']),
      $article['author_name'], $article['author_avatar'], $article['author_bio'],
      'draft', null, $article['reading_time_min'], 0,
      $article['seo_title'], $article['seo_description'], $article['canonical'], $article['og_image'], $article['meta_robots'],
    ]);
    $newId = (int)db()->lastInsertId();
    logEvent('article-duplicate', $article['title']);
    response(200, ['article' => articleById($newId)]);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось дублировать статью.']); }
}

/* ---- Журнал: категории ---- */
if ($action === 'journal-categories' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try { response(200, ['categories' => categoryRows()]); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}
if ($action === 'journal-categories' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  ensureBlogTables(); // categoryRows() ниже не вызовется из-за короткого замыкания && при parentId=0 (частый случай)
  $data = requestData();
  $id = (int)($data['id'] ?? 0);
  $name = mb_substr(trim((string)($data['name'] ?? '')), 0, 80);
  if ($name === '') response(422, ['error' => 'Название категории обязательно']);
  $parentId = (int)($data['parent_id'] ?? 0);
  if ($id && $parentId === $id) $parentId = 0; // категория не может быть родителем самой себе
  $validParent = $parentId > 0 && in_array($parentId, array_map('intval', array_column(categoryRows(), 'id')), true);
  $slug = uniqueSlug('cms_categories', slugify((string)($data['slug'] ?? $name)), $id);
  try {
    if ($id) {
      db()->prepare('UPDATE cms_categories SET name=?,slug=?,parent_id=? WHERE id=?')->execute([$name, $slug, $validParent ? $parentId : null, $id]);
    } else {
      db()->prepare('INSERT INTO cms_categories (name,slug,parent_id) VALUES (?,?,?)')->execute([$name, $slug, $validParent ? $parentId : null]);
      $id = (int)db()->lastInsertId();
    }
    response(200, ['categories' => categoryRows(), 'id' => $id]);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось сохранить категорию.']); }
}
if ($action === 'journal-categories' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  ensureBlogTables();
  $id = (int)($_GET['id'] ?? 0);
  try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM cms_articles WHERE JSON_CONTAINS(category_ids, ?)');
    $stmt->execute([json_encode($id)]);
    if ((int)$stmt->fetchColumn() > 0) response(409, ['error' => 'Категория используется в статьях — сначала уберите её оттуда.']);
    db()->prepare('UPDATE cms_categories SET parent_id = NULL WHERE parent_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM cms_categories WHERE id=?')->execute([$id]);
    response(200);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось удалить категорию.']); }
}

/* ---- Журнал: теги ---- */
if ($action === 'journal-tags' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try { response(200, ['tags' => tagRows()]); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}
if ($action === 'journal-tags' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  ensureBlogTables();
  $data = requestData();
  $id = (int)($data['id'] ?? 0);
  $name = mb_substr(trim((string)($data['name'] ?? '')), 0, 60);
  if ($name === '') response(422, ['error' => 'Название тега обязательно']);
  $slug = uniqueSlug('cms_tags', slugify((string)($data['slug'] ?? $name)), $id);
  try {
    if ($id) { db()->prepare('UPDATE cms_tags SET name=?,slug=? WHERE id=?')->execute([$name, $slug, $id]); }
    else { db()->prepare('INSERT INTO cms_tags (name,slug) VALUES (?,?)')->execute([$name, $slug]); $id = (int)db()->lastInsertId(); }
    response(200, ['tags' => tagRows(), 'id' => $id]);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось сохранить тег.']); }
}
if ($action === 'journal-tags' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  ensureBlogTables();
  $id = (int)($_GET['id'] ?? 0);
  try {
    $stmt = db()->prepare('SELECT COUNT(*) FROM cms_articles WHERE JSON_CONTAINS(tag_ids, ?)');
    $stmt->execute([json_encode($id)]);
    if ((int)$stmt->fetchColumn() > 0) response(409, ['error' => 'Тег используется в статьях — сначала уберите его оттуда.']);
    db()->prepare('DELETE FROM cms_tags WHERE id=?')->execute([$id]);
    response(200);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось удалить тег.']); }
}

/* ---- Журнал: аналитика ---- */
if ($action === 'journal-analytics' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try { response(200, articleAnalytics()); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

/* ---- Заявки (только для админки) ---- */
if ($action === 'leads' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try {
    $rows = db()->query('SELECT id,name,contact,contact_type,message,page,status,created_at FROM cms_leads ORDER BY id DESC LIMIT 500')->fetchAll();
    response(200, ['leads' => $rows]);
  } catch (Throwable $e) { error_log($e->__toString()); response(200, ['leads' => []]); /* таблица появляется с первой заявкой */ }
}
if ($action === 'lead-status' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
  $data = requestData(); $id = (int)($data['id'] ?? 0);
  $status = in_array($data['status'] ?? '', ['new', 'work', 'done'], true) ? $data['status'] : null;
  if (!$id || !$status) response(422, ['error' => 'Некорректный статус.']);
  try { db()->prepare('UPDATE cms_leads SET status=? WHERE id=?')->execute([$status, $id]); response(200); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось обновить статус.']); }
}

/* ---- Медиатека: все файлы из /uploads с пометкой, где используются ---- */
if ($action === 'media' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $files = [];
  try {
    $used = '';
    ensureBlogTables();
    try { $used .= implode(' ', array_column(db()->query('SELECT CONCAT(cover, " ", gallery, " ", COALESCE(blocks, "")) AS u FROM cms_projects')->fetchAll(), 'u')); } catch (Throwable $e) {}
    try { $used .= ' ' . implode(' ', array_column(db()->query('SELECT CONCAT(cover, " ", COALESCE(blocks, "")) AS u FROM cms_articles')->fetchAll(), 'u')); } catch (Throwable $e) {}
    try { $used .= ' ' . implode(' ', array_column(db()->query('SELECT content_value FROM cms_content')->fetchAll(), 'content_value')); } catch (Throwable $e) {}
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsDir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
      if (!$file->isFile()) continue;
      $name = $file->getFilename();
      if (str_starts_with($name, '.')) continue;
      $rel = str_replace('\\', '/', substr($file->getPathname(), strlen($uploadsDir)));
      $url = '/uploads' . $rel;
      $files[] = ['url' => $url, 'name' => ltrim($rel, '/'), 'size' => $file->getSize(), 'mtime' => $file->getMTime(), 'used' => str_contains($used, $url) || str_contains($used, $name)];
    }
    usort($files, fn($a, $b) => $b['mtime'] <=> $a['mtime']);
  } catch (Throwable $e) { error_log($e->__toString()); }
  response(200, ['files' => $files]);
}
if ($action === 'media-delete' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  $name = (string)($_GET['name'] ?? '');
  /* только внутри uploads, без выхода из папки */
  if ($name === '' || str_contains($name, '..') || !preg_match('#^[A-Za-z0-9/._-]+$#', $name)) response(422, ['error' => 'Некорректное имя файла.']);
  $path = $uploadsDir . '/' . $name;
  if (!is_file($path)) response(404, ['error' => 'Файл не найден.']);
  try {
    ensureBlogTables();
    $used = implode(' ', array_column(db()->query('SELECT CONCAT(cover, " ", gallery, " ", COALESCE(blocks, "")) AS u FROM cms_projects')->fetchAll(), 'u'))
          . ' ' . implode(' ', array_column(db()->query('SELECT CONCAT(cover, " ", COALESCE(blocks, "")) AS u FROM cms_articles')->fetchAll(), 'u'))
          . ' ' . implode(' ', array_column(db()->query('SELECT content_value FROM cms_content')->fetchAll(), 'content_value'));
    if (str_contains($used, basename($name))) response(409, ['error' => 'Файл используется на сайте — сначала замените его в кейсе, статье или контенте.']);
  } catch (Throwable $e) { /* без БД проверить нельзя — удаляем на страх админа */ }
  @unlink($path) ? response(200) : response(500, ['error' => 'Не удалось удалить файл.']);
}

/* ---- Дашборд ---- */
if ($action === 'dashboard' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $out = ['leads' => ['new' => 0, 'today' => 0, 'week' => 0, 'month' => 0], 'recentLeads' => [], 'recentProjects' => [], 'log' => []];
  try {
    $out['leads']['new']   = (int)db()->query('SELECT COUNT(*) FROM cms_leads WHERE status = "new"')->fetchColumn();
    $out['leads']['today'] = (int)db()->query('SELECT COUNT(*) FROM cms_leads WHERE created_at >= CURDATE()')->fetchColumn();
    $out['leads']['week']  = (int)db()->query('SELECT COUNT(*) FROM cms_leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)')->fetchColumn();
    $out['leads']['month'] = (int)db()->query('SELECT COUNT(*) FROM cms_leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)')->fetchColumn();
    $out['recentLeads'] = db()->query('SELECT id,name,contact,status,created_at FROM cms_leads ORDER BY id DESC LIMIT 5')->fetchAll();
  } catch (Throwable $e) { /* заявок ещё не было */ }
  try { $out['recentProjects'] = db()->query('SELECT id,title,status,updated_at FROM cms_projects ORDER BY updated_at DESC LIMIT 5')->fetchAll(); } catch (Throwable $e) {}
  try { $out['log'] = db()->query('SELECT event,title,created_at FROM cms_log ORDER BY id DESC LIMIT 10')->fetchAll(); } catch (Throwable $e) {}
  response(200, $out);
}
if ($action === 'projects-order' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
  $ids = requestData()['ids'] ?? [];
  if (!is_array($ids)) response(422, ['error' => 'Некорректный список кейсов.']);
  $ids = array_values(array_filter(array_map('intval', array_filter($ids, fn($v) => is_int($v) || is_string($v))), fn($id) => $id > 0));
  if (!$ids || count($ids) !== count(array_unique($ids))) response(422, ['error' => 'Некорректный порядок кейсов.']);
  try { $stmt = db()->prepare('UPDATE cms_projects SET sort_order=? WHERE id=?'); foreach ($ids as $order => $id) $stmt->execute([$order, $id]); response(200); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось изменить порядок кейсов.']); }
}

if ($action === 'content' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
  $data = requestData();
  try { saveContent($data); logEvent('content-save', count($data) . ' полей'); response(200); } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

if ($action === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $data = requestData();
  $raw = isset($data['data']) && is_string($data['data']) ? $data['data'] : '';

  /* Картинки и видео идут одним эндпоинтом: в галерее кейса они лежат
     в одном списке, и админке проще не различать их при загрузке. */
  if (!preg_match('#^data:(image/(?:png|jpeg|webp|gif)|video/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/=]+)$#', $raw, $matches)) {
    response(400, ['error' => 'Поддерживаются PNG, JPG, WEBP, GIF, а также MP4 и WEBM.']);
  }
  $declared = $matches[1];
  $isVideo = str_starts_with($declared, 'video/');

  $binary = base64_decode($matches[2], true);
  if ($binary === false) response(400, ['error' => 'Файл повреждён.']);
  /* Видео тяжелее картинок, но выше лимита post_max_size на хостинге всё равно
     не пройдёт — держим планку заметно ниже типовых 64 МБ. */
  $limit = $isVideo ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
  if (strlen($binary) > $limit) response(400, ['error' => $isVideo ? 'Видео больше 25 МБ. Сожмите файл или загрузите его на хостинг вручную.' : 'Файл больше 10 МБ.']);

  $detected = (new finfo(FILEINFO_MIME_TYPE))->buffer($binary);
  $extensions = [
    'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif',
    'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mp4',
  ];
  if (!isset($extensions[$detected])) response(400, ['error' => 'Тип файла не распознан или не поддерживается.']);
  /* Проверяем именно то, что внутри файла, а не заявленный тип: иначе под
     видом mp4 можно было бы залить что угодно. */
  if (str_starts_with($detected, 'image/') && @getimagesizefromstring($binary) === false) {
    response(400, ['error' => 'Файл не является корректным изображением.']);
  }
  if ($isVideo !== str_starts_with($detected, 'video/')) {
    response(400, ['error' => 'Содержимое файла не совпадает с его типом.']);
  }

  if (!is_dir($uploadsDir) && !mkdir($uploadsDir, 0755, true)) response(500, ['error' => 'Не удалось создать папку uploads.']);
  $ext = $extensions[$detected];
  $filename = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
  $absPath = $uploadsDir . '/' . $filename;
  if (file_put_contents($absPath, $binary, LOCK_EX) === false) response(500, ['error' => 'Не удалось сохранить файл.']);

  $result = ['url' => '/uploads/' . $filename, 'kind' => $isVideo ? 'video' : 'image'];
  /* Производные форматы (webp/avif/srcset) — только для картинок. */
  if (!$isVideo) {
    try { $result += array_filter(buildImageDerivatives($absPath, $binary, $ext), fn($v) => $v !== null); }
    catch (Throwable $e) { error_log('image derivatives: ' . $e->getMessage()); }
  }

  response(200, $result);
}


/* ---------- Услуги ---------- */
if ($action === 'services' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  try {
    if (!ensureServicesTable()) {
      $why = servicesTableError();
      response(500, ['error' => 'Не удалось подготовить таблицу услуг.' . ($why !== '' ? ' MySQL: ' . $why : '')]);
    }
    response(200, ['services' => serviceRows(true)]); }
  catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => databaseErrorMessage($e)]); }
}

if ($action === 'service' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!ensureServicesTable()) {
    $why = servicesTableError();
    response(500, ['error' => 'Не удалось подготовить таблицу услуг.' . ($why !== '' ? ' MySQL: ' . $why : '')]);
  }
  $data = requestData();
  $id = (int)($data['id'] ?? 0);
  $str = fn($k, $n) => mb_substr(trim((string)($data[$k] ?? '')), 0, $n);

  $h1 = $str('h1', 255);
  if ($h1 === '') response(422, ['error' => 'Заголовок H1 обязателен']);

  /* Слаг задаётся вручную, но чистится и проверяется на уникальность:
     он превращается в адрес страницы, мусор туда попасть не должен. */
  $slug = slugify($str('slug', 190) !== '' ? $str('slug', 190) : $h1);
  $slug = uniqueSlug('cms_services', $slug, $id);

  $status = in_array($data['status'] ?? '', ['published', 'draft', 'hidden'], true) ? $data['status'] : 'published';
  $robots = in_array($data['meta_robots'] ?? '', ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'], true) ? $data['meta_robots'] : 'index,follow';

  $fields = [
    $slug,
    $str('title', 255) !== '' ? $str('title', 255) : $h1,
    $str('badge', 120),
    $h1,
    mb_substr(trim((string)($data['lead'] ?? '')), 0, 2000),
    $str('hero_image', 500),
    $str('hero_video', 500),
    $str('service_type', 190),
    $str('cases_cat', 60),
    $str('intro_title', 255),
    mb_substr(trim((string)($data['intro_text'] ?? '')), 0, 1000),
    $str('steps_title', 255),
    mb_substr(trim((string)($data['steps_text'] ?? '')), 0, 1000),
    $str('cases_title', 255),
    $str('cta_title', 255),
    mb_substr(trim((string)($data['cta_text'] ?? '')), 0, 1000),
    $str('cta_primary_label', 120),
    safeHref($str('cta_primary_href', 500)),
    $str('cta_secondary_label', 120),
    safeHref($str('cta_secondary_href', 500)),
    $str('hero_primary_label', 120),
    $str('hero_secondary_label', 120),
    json_encode(sanitizeServicePairs($data['facts'] ?? [], 8, 120, 190), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServicePairs($data['works'] ?? [], 12), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServicePairs($data['steps'] ?? [], 8), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServicePairs($data['faq'] ?? [], 12, 300, 2000), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServicePairs($data['benefits'] ?? [], 8), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServiceReviews($data['reviews'] ?? []), JSON_UNESCAPED_UNICODE),
    json_encode(sanitizeServiceCalc($data['calc'] ?? []), JSON_UNESCAPED_UNICODE),
    $str('seo_title', 255),
    $str('seo_description', 400),
    $str('og_image', 500),
    $robots,
    $status,
  ];

  $cols = '`slug`=?,`title`=?,`badge`=?,`h1`=?,`lead`=?,`hero_image`=?,`hero_video`=?,`service_type`=?,`cases_cat`=?,`intro_title`=?,`intro_text`=?,`steps_title`=?,`steps_text`=?,`cases_title`=?,`cta_title`=?,`cta_text`=?,`cta_primary_label`=?,`cta_primary_href`=?,`cta_secondary_label`=?,`cta_secondary_href`=?,`hero_primary_label`=?,`hero_secondary_label`=?,`facts`=?,`works`=?,`steps`=?,`faq`=?,`benefits`=?,`reviews`=?,`calc`=?,`seo_title`=?,`seo_description`=?,`og_image`=?,`meta_robots`=?,`status`=?';
  $names = '`slug`,`title`,`badge`,`h1`,`lead`,`hero_image`,`hero_video`,`service_type`,`cases_cat`,`intro_title`,`intro_text`,`steps_title`,`steps_text`,`cases_title`,`cta_title`,`cta_text`,`cta_primary_label`,`cta_primary_href`,`cta_secondary_label`,`cta_secondary_href`,`hero_primary_label`,`hero_secondary_label`,`facts`,`works`,`steps`,`faq`,`benefits`,`reviews`,`calc`,`seo_title`,`seo_description`,`og_image`,`meta_robots`,`status`';
  $marks = implode(',', array_fill(0, count($fields), '?'));

  try {
    if ($id) {
      db()->prepare("UPDATE cms_services SET {$cols} WHERE `id`=?")->execute([...$fields, $id]);
    } else {
      $order = (int)db()->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM cms_services')->fetchColumn();
      db()->prepare("INSERT INTO cms_services ({$names},`sort_order`) VALUES ({$marks},?)")->execute([...$fields, $order]);
      $id = (int)db()->lastInsertId();
    }
    logEvent('service-save', $h1);
    response(200, ['service' => serviceById($id)]);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось сохранить услугу.']); }
}

if ($action === 'service' && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
  $id = (int)($_GET['id'] ?? 0);
  try {
    $row = serviceById($id);
    db()->prepare('DELETE FROM cms_services WHERE `id`=?')->execute([$id]);
    if ($row) logEvent('service-delete', (string)$row['h1']);
    response(200);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось удалить услугу.']); }
}

if ($action === 'services-reorder' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $ids = array_map('intval', (array)(requestData()['ids'] ?? []));
  try {
    $stmt = db()->prepare('UPDATE cms_services SET `sort_order`=? WHERE `id`=?');
    foreach ($ids as $order => $sid) $stmt->execute([$order, $sid]);
    response(200);
  } catch (Throwable $e) { error_log($e->__toString()); response(500, ['error' => 'Не удалось изменить порядок услуг.']); }
}

response(404, ['error' => 'Неизвестный запрос']);
