<?php
declare(strict_types=1);
/* Онлайн-школа: общий слой для кабинета ученика, админки и стрима видео.
   Таблицы создаются сами при первом запросе, отдельная установка не нужна. */
require dirname(__DIR__) . '/db.php';

const SCHOOL_TOKEN_TTL = 6 * 3600;
const SCHOOL_CHUNK_BYTES = 4 * 1024 * 1024;

function schoolSession(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  session_name('school_sess');
  session_set_cookie_params(['path' => '/school', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Strict']);
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
  $db->exec("CREATE TABLE IF NOT EXISTS school_lessons (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, course_id INT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL, description MEDIUMTEXT NULL, materials MEDIUMTEXT NULL, video_type VARCHAR(16) NOT NULL DEFAULT '', video_ref VARCHAR(255) NOT NULL DEFAULT '', video_name VARCHAR(255) NOT NULL DEFAULT '', video_size BIGINT UNSIGNED NOT NULL DEFAULT 0, duration INT UNSIGNED NOT NULL DEFAULT 0, is_published TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, KEY school_lesson_course (course_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_students (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(190) NOT NULL, email VARCHAR(190) NOT NULL, password_hash VARCHAR(255) NOT NULL, note VARCHAR(500) NOT NULL DEFAULT '', is_active TINYINT(1) NOT NULL DEFAULT 1, access_until DATE NULL, session_token CHAR(64) NULL, last_login_at DATETIME NULL, last_ip VARCHAR(45) NOT NULL DEFAULT '', created_at DATETIME NOT NULL, UNIQUE KEY school_student_email (email)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_access (student_id INT UNSIGNED NOT NULL, course_id INT UNSIGNED NOT NULL, PRIMARY KEY (student_id, course_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_progress (student_id INT UNSIGNED NOT NULL, lesson_id INT UNSIGNED NOT NULL, position INT UNSIGNED NOT NULL DEFAULT 0, completed TINYINT(1) NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (student_id, lesson_id)) $e");
  $db->exec("CREATE TABLE IF NOT EXISTS school_log (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, student_id INT UNSIGNED NULL, event VARCHAR(32) NOT NULL, detail VARCHAR(255) NOT NULL DEFAULT '', ip VARCHAR(45) NOT NULL DEFAULT '', ua VARCHAR(255) NOT NULL DEFAULT '', created_at DATETIME NOT NULL, KEY school_log_student (student_id), KEY school_log_event (event, created_at)) $e");
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

/* Вход ученика: при каждом логине выдаётся новый токен устройства — старый вход
   на другом устройстве сразу перестаёт работать. Один аккаунт = одно устройство. */
function schoolCurrentStudent(): ?array {
  $id = (int)($_SESSION['student_id'] ?? 0);
  $token = (string)($_SESSION['student_token'] ?? '');
  if ($id <= 0 || $token === '') return null;
  $s = db()->prepare('SELECT * FROM school_students WHERE id=?');
  $s->execute([$id]);
  $row = $s->fetch();
  if (!$row || !hash_equals((string)$row['session_token'], $token)) return null;
  if (!(int)$row['is_active']) return null;
  if ($row['access_until'] && $row['access_until'] < date('Y-m-d')) return null;
  return $row;
}
function schoolStudentKicked(): bool {
  $id = (int)($_SESSION['student_id'] ?? 0);
  if ($id <= 0) return false;
  $s = db()->prepare('SELECT session_token FROM school_students WHERE id=?');
  $s->execute([$id]);
  $t = $s->fetchColumn();
  return $t !== false && !hash_equals((string)$t, (string)($_SESSION['student_token'] ?? ''));
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

/* Токен видео: привязан к уроку, ученику, текущей сессии и времени жизни.
   Без cookie этой же сессии ссылка бесполезна. */
function schoolB64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function schoolVideoToken(int $lessonId, int $studentId): string {
  $payload = $lessonId . '.' . $studentId . '.' . (time() + SCHOOL_TOKEN_TTL) . '.' . substr(hash('sha256', session_id()), 0, 16);
  $sig = hash_hmac('sha256', $payload, schoolSetting('secret'));
  return schoolB64($payload) . '.' . $sig;
}
function schoolParseVideoToken(string $token): ?array {
  $parts = explode('.', $token);
  if (count($parts) !== 2) return null;
  $payload = base64_decode(strtr($parts[0], '-_', '+/'), true);
  if ($payload === false) return null;
  if (!hash_equals(hash_hmac('sha256', $payload, schoolSetting('secret')), $parts[1])) return null;
  $f = explode('.', $payload);
  if (count($f) !== 4) return null;
  [$lessonId, $studentId, $exp, $sess] = $f;
  if ((int)$exp < time()) return null;
  if (!hash_equals(substr(hash('sha256', session_id()), 0, 16), $sess)) return null;
  return ['lesson_id' => (int)$lessonId, 'student_id' => (int)$studentId];
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

function schoolNoIndexHeaders(): void {
  header('X-Robots-Tag: noindex, nofollow, noarchive', true);
  header('Cache-Control: no-store, private', true);
  header('Referrer-Policy: same-origin', true);
}
