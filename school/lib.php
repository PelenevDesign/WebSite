<?php
declare(strict_types=1);
/* Онлайн-школа: общий слой для кабинета ученика, админки и стрима видео.
   Таблицы создаются сами при первом запросе, отдельная установка не нужна. */
require dirname(__DIR__) . '/db.php';

const SCHOOL_TOKEN_TTL = 6 * 3600;
const SCHOOL_CHUNK_BYTES = 4 * 1024 * 1024;
const SCHOOL_AUTH_COOKIE = 'school_auth';
const SCHOOL_AUTH_TTL = 30 * 86400;

/* PHP-сессия нужна только админке. Живёт неделю: стандартные 24 минуты
   выбивали бы из админки посреди загрузки видео. */
function schoolSession(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  @ini_set('session.gc_maxlifetime', (string)(7 * 86400));
  session_name('school_sess');
  session_set_cookie_params(['lifetime' => 7 * 86400, 'path' => '/school', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
  session_start();
}

function schoolSchema(): void {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = db();
  $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  $db->exec("CREATE TABLE IF NOT EXISTS school_settings (k VARCHAR(64) NOT NULL PRIMARY KEY, v TEXT NOT NULL) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_courses (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, subtitle VARCHAR(255) NOT NULL DEFAULT '', description TEXT NULL, cover VARCHAR(255) NOT NULL DEFAULT '', is_published TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_lessons (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, course_id INT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL, description MEDIUMTEXT NULL, materials MEDIUMTEXT NULL, video_type VARCHAR(16) NOT NULL DEFAULT '', video_ref VARCHAR(255) NOT NULL DEFAULT '', video_name VARCHAR(255) NOT NULL DEFAULT '', video_size BIGINT UNSIGNED NOT NULL DEFAULT 0, video_codec VARCHAR(16) NOT NULL DEFAULT '', duration INT UNSIGNED NOT NULL DEFAULT 0, is_published TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, KEY school_lesson_course (course_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_students (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL, password_hash VARCHAR(255) NOT NULL, note VARCHAR(500) NOT NULL DEFAULT '', is_active TINYINT(1) NOT NULL DEFAULT 1, access_until DATE NULL, session_token CHAR(64) NULL, last_login_at DATETIME NULL, last_ip VARCHAR(45) NOT NULL DEFAULT '', created_at DATETIME NOT NULL, UNIQUE KEY school_student_email (email)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_access (student_id INT UNSIGNED NOT NULL, course_id INT UNSIGNED NOT NULL, PRIMARY KEY (student_id, course_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_progress (student_id INT UNSIGNED NOT NULL, lesson_id INT UNSIGNED NOT NULL, position INT UNSIGNED NOT NULL DEFAULT 0, completed TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (student_id, lesson_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_log (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, student_id INT UNSIGNED NULL, event VARCHAR(32) NOT NULL, detail VARCHAR(255) NOT NULL DEFAULT '', ip VARCHAR(45) NOT NULL DEFAULT '', ua VARCHAR(255) NOT NULL DEFAULT '', created_at DATETIME NOT NULL, KEY school_log_student (student_id), KEY school_log_event (event, created_at)) $e");
  /* Колонка video_codec появилась позже — дописываем в уже созданную таблицу. */
  if (schoolSetting('schema') !== '2') {
    $cols = array_column($db->query('SHOW COLUMNS FROM school_lessons')->fetchAll(), 'Field');
    if (!in_array('video_codec', $cols, true)) $db->exec("ALTER TABLE school_lessons ADD COLUMN video_codec VARCHAR(16) NOT NULL DEFAULT '' AFTER video_size");
    schoolSetSetting('schema', '2');
  }
  if (schoolSetting('secret') === '') schoolSetSetting('secret', bin2hex(random_bytes(32)));
  if (schoolSetting('school_name') === '') schoolSetSetting('school_name', 'Школа фотографии');
}

function schoolSetting(string $key): string {
  $s = db()->prepare('SELECT v FROM school_settings WHERE k=?');
  $s->execute([$key]);
  $v = $s->fetchColumn();
  return $v === false ? '' : (string)$v;
}
function schoolSetSetting(string $key, string $value): void {
  db()->prepare('INSERT INTO school_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute([$key, $value]);
}

function schoolNow(): string { return date('Y-m-d H:i:s'); }
function schoolIp(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
function schoolUa(): string { return mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255); }
function schoolLog(?int $studentId, string $event, string $detail = ''): void {
  db()->prepare('INSERT INTO school_log (student_id, event, detail, ip, ua, created_at) VALUES (?,?,?,?,?,?)')
    ->execute([$studentId, $event, mb_substr($detail, 0, 255), schoolIp(), schoolUa(), schoolNow()]);
}

/* Видео лежат вне public_html, если хостинг позволяет; иначе — в закрытой папке _storage. */
function schoolStorage(): string {
  static $path;
  if ($path) return $path;
  $candidates = [dirname(__DIR__, 2) . '/school-storage', __DIR__ . '/_storage'];
  foreach ($candidates as $dir) {
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) {
      if (strpos($dir, '_storage') !== false && !is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
      foreach (['videos', 'parts'] as $sub) if (!is_dir("$dir/$sub")) @mkdir("$dir/$sub", 0700, true);
      return $path = $dir;
    }
  }
  throw new RuntimeException('Нет папки для хранения видео с правом записи.');
}
function schoolVideoPath(array $lesson): string {
  return schoolStorage() . '/videos/' . basename((string)$lesson['video_ref']);
}

/* Вход ученика — долгоживущая cookie «id.токен», токен сверяется с базой.
   Не зависит от PHP-сессий (их хостинг чистит через 24 минуты — видео обрывалось бы).
   При каждом входе токен новый: старое устройство сразу отключается. */
function schoolAuthCookie(): array {
  $raw = (string)($_COOKIE[SCHOOL_AUTH_COOKIE] ?? '');
  if (!preg_match('/^(\d{1,10})\.([a-f0-9]{64})$/', $raw, $m)) return [0, ''];
  return [(int)$m[1], $m[2]];
}
function schoolSetAuthCookie(string $value): void {
  $expires = $value === '' ? time() - 3600 : time() + SCHOOL_AUTH_TTL;
  setcookie(SCHOOL_AUTH_COOKIE, $value, ['expires' => $expires, 'path' => '/school', 'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
}
function schoolCurrentStudent(): ?array {
  [$id, $token] = schoolAuthCookie();
  if ($id <= 0) return null;
  $s = db()->prepare('SELECT * FROM school_students WHERE id=?');
  $s->execute([$id]);
  $row = $s->fetch();
  if (!$row || !$row['session_token'] || !hash_equals((string)$row['session_token'], $token)) return null;
  if (!(int)$row['is_active']) return null;
  if ($row['access_until'] && $row['access_until'] < date('Y-m-d')) return null;
  return $row;
}
/* Почему ученик не авторизован — чтобы показать понятное сообщение, а не просто «войдите». */
function schoolStudentDenyReason(): string {
  [$id, $token] = schoolAuthCookie();
  if ($id <= 0) return '';
  $s = db()->prepare('SELECT session_token, is_active, access_until FROM school_students WHERE id=?');
  $s->execute([$id]);
  $row = $s->fetch();
  if (!$row) return '';
  if (!(int)$row['is_active']) return 'Доступ приостановлен. Напишите автору курса.';
  if ($row['access_until'] && $row['access_until'] < date('Y-m-d')) return 'Срок доступа истёк.';
  if ($row['session_token'] && !hash_equals((string)$row['session_token'], $token)) return 'Выполнен вход с другого устройства. Этот сеанс завершён.';
  return '';
}
function schoolIsAdmin(): bool { return !empty($_SESSION['school_admin']); }

/* Пароль админки школы. Стартовый задаётся только в config.php на сервере
   (school_admin_password_hash или school_admin_password) — в git его нет.
   После первого входа хранится хэшем в базе и меняется в «Настройках». */
function schoolAdminConfigured(): bool {
  $c = config();
  return schoolSetting('admin_hash') !== '' || !empty($c['school_admin_password_hash']) || (string)($c['school_admin_password'] ?? '') !== '';
}
function schoolVerifyAdmin(string $password): bool {
  $stored = schoolSetting('admin_hash');
  if ($stored !== '') return password_verify($password, $stored);
  $c = config();
  $ok = !empty($c['school_admin_password_hash'])
    ? password_verify($password, (string)$c['school_admin_password_hash'])
    : ((string)($c['school_admin_password'] ?? '') !== '' && hash_equals((string)$c['school_admin_password'], $password));
  if ($ok) schoolSetSetting('admin_hash', password_hash($password, PASSWORD_DEFAULT));
  return $ok;
}

function schoolStudentCourseIds(int $studentId): array {
  $s = db()->prepare('SELECT course_id FROM school_access WHERE student_id=?');
  $s->execute([$studentId]);
  return array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
}
function schoolLesson(int $id): ?array {
  $s = db()->prepare('SELECT * FROM school_lessons WHERE id=?');
  $s->execute([$id]);
  $r = $s->fetch();
  return $r ?: null;
}
function schoolCourse(int $id): ?array {
  $s = db()->prepare('SELECT * FROM school_courses WHERE id=?');
  $s->execute([$id]);
  $r = $s->fetch();
  return $r ?: null;
}
function schoolStudentCanSee(array $student, array $lesson): bool {
  if (!(int)$lesson['is_published']) return false;
  $course = schoolCourse((int)$lesson['course_id']);
  if (!$course || !(int)$course['is_published']) return false;
  return in_array((int)$lesson['course_id'], schoolStudentCourseIds((int)$student['id']), true);
}

/* Токен видео: урок + ученик + срок + отпечаток входа (токен устройства ученика
   или id сессии админа). Ссылка без cookie этого же входа бесполезна. */
function schoolB64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function schoolUnB64(string $s) {
  $s = strtr($s, '-_', '+/');
  return base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
}
function schoolBind(int $studentId): string {
  $src = $studentId > 0 ? schoolAuthCookie()[1] : session_id();
  return substr(hash('sha256', 'bind|' . $src), 0, 20);
}
function schoolVideoToken(int $lessonId, int $studentId): string {
  $payload = $lessonId . '.' . $studentId . '.' . (time() + SCHOOL_TOKEN_TTL) . '.' . schoolBind($studentId);
  return schoolB64($payload) . '.' . hash_hmac('sha256', $payload, schoolSetting('secret'));
}
/* Возвращает данные токена или строку-причину отказа. */
function schoolParseVideoToken(string $token) {
  $parts = explode('.', $token);
  if (count($parts) !== 2) return 'token_format';
  $payload = schoolUnB64($parts[0]);
  if ($payload === false) return 'token_format';
  if (!hash_equals(hash_hmac('sha256', $payload, schoolSetting('secret')), $parts[1])) return 'token_signature';
  $f = explode('.', $payload);
  if (count($f) !== 4) return 'token_format';
  [$lessonId, $studentId, $exp, $bind] = $f;
  if ((int)$exp < time()) return 'token_expired';
  return ['lesson_id' => (int)$lessonId, 'student_id' => (int)$studentId, 'bind' => $bind];
}

/* Распознаёт контейнер и видеокодек по заголовкам файла, без ffmpeg.
   Нужно, чтобы заранее предупредить о HEVC (H.265) — многие браузеры его не играют. */
function schoolProbeVideo(string $path): array {
  $size = is_file($path) ? (int)filesize($path) : 0;
  if ($size < 16) return ['container' => '', 'codec' => ''];
  $fp = fopen($path, 'rb');
  $head = fread($fp, (int)min($size, 8 * 1024 * 1024));
  $tail = '';
  if ($size > 8 * 1024 * 1024) { fseek($fp, -(int)min($size - 8 * 1024 * 1024, 8 * 1024 * 1024), SEEK_END); $tail = fread($fp, 8 * 1024 * 1024); }
  fclose($fp);
  $container = '';
  if (substr($head, 4, 4) === 'ftyp') $container = substr($head, 8, 4) === 'qt  ' ? 'mov' : 'mp4';
  elseif (substr($head, 0, 4) === "\x1A\x45\xDF\xA3") $container = 'webm';
  $codec = '';
  /* Блок ftyp пропускаем: в списке совместимых брендов бывает «avc1» и у файлов с другим кодеком. */
  $skip = $container === 'mp4' || $container === 'mov' ? (int)unpack('N', substr($head, 0, 4))[1] : 0;
  $blob = substr($head, max(0, min($skip, 1024))) . $tail;
  foreach (['avc1' => 'h264', 'avc3' => 'h264', 'hvc1' => 'hevc', 'hev1' => 'hevc', 'av01' => 'av1', 'vp09' => 'vp9', 'mp4v' => 'mpeg4', 'apch' => 'prores', 'apcn' => 'prores', 'apcs' => 'prores', 'ap4h' => 'prores'] as $tag => $name) {
    if (strpos($blob, $tag) !== false) { $codec = $name; break; }
  }
  if ($container === 'webm' && $codec === '') $codec = strpos($blob, 'V_VP9') !== false ? 'vp9' : (strpos($blob, 'V_VP8') !== false ? 'vp8' : '');
  return ['container' => $container, 'codec' => $codec];
}
function schoolCodecWarning(string $codec): string {
  if ($codec === 'hevc') return 'Видео в формате HEVC (H.265): в Chrome и Firefox на многих компьютерах оно не воспроизводится. Пересохраните в MP4 (H.264).';
  if ($codec === 'prores') return 'Видео в ProRes — браузеры его не воспроизводят. Пересохраните в MP4 (H.264).';
  if ($codec === 'mpeg4') return 'Устаревший кодек MPEG-4 Part 2 — браузеры его не воспроизводят. Пересохраните в MP4 (H.264).';
  return '';
}

/* Kinescope: принимаем и ID, и полную ссылку. */
function schoolKinescopeId(string $input): string {
  $input = trim($input);
  if (preg_match('#kinescope\.io/(?:embed/)?([A-Za-z0-9_-]+)#', $input, $m)) return $m[1];
  return preg_match('/^[A-Za-z0-9_-]{4,64}$/', $input) ? $input : '';
}

function schoolTooManyAttempts(string $event): bool {
  $s = db()->prepare('SELECT COUNT(*) FROM school_log WHERE event=? AND ip=? AND created_at > ?');
  $s->execute([$event, schoolIp(), date('Y-m-d H:i:s', time() - 900)]);
  return (int)$s->fetchColumn() >= 7;
}

/* Размер куска загрузки под лимиты хостинга (post_max_size бывает меньше 4 МБ). */
function schoolIniBytes(string $key): int {
  $v = trim((string)ini_get($key));
  if ($v === '' || $v === '0' || $v === '-1') return PHP_INT_MAX;
  $n = (int)$v;
  $u = strtolower(substr($v, -1));
  return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
}
function schoolChunkBytes(): int {
  $limit = schoolIniBytes('post_max_size') - 64 * 1024;
  return (int)max(256 * 1024, min(SCHOOL_CHUNK_BYTES, $limit));
}

function schoolNoIndexHeaders(): void {
  header('X-Robots-Tag: noindex, nofollow, noarchive', true);
  header('Cache-Control: no-store, private', true);
  header('Referrer-Policy: same-origin', true);
}
