<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
/* PHP-сессия — только для админки; ученик авторизуется cookie устройства. */
if (strpos((string)($_GET['action'] ?? ''), 'admin') === 0) schoolSession();
header('Content-Type: application/json; charset=utf-8');
schoolNoIndexHeaders();

function out(int $status, array $payload = []): void { http_response_code($status); echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function body(): array { static $b; if ($b !== null) return $b; $v = json_decode(file_get_contents('php://input') ?: '{}', true); return $b = is_array($v) ? $v : []; }
function str(string $key, int $max = 255): string { return mb_substr(trim((string)(body()[$key] ?? '')), 0, $max); }
function int_(string $key): int { return (int)(body()[$key] ?? 0); }

function studentPublic(array $s): array {
  return ['id' => (int)$s['id'], 'name' => $s['name'], 'email' => $s['email']];
}
function lessonsOf(int $courseId, bool $all): array {
  $s = db()->prepare('SELECT * FROM school_lessons WHERE course_id=?' . ($all ? '' : ' AND is_published=1') . ' ORDER BY sort_order ASC, id ASC');
  $s->execute([$courseId]);
  return $s->fetchAll();
}
function progressMap(int $studentId): array {
  $s = db()->prepare('SELECT lesson_id, position, completed FROM school_progress WHERE student_id=?');
  $s->execute([$studentId]);
  $map = [];
  foreach ($s->fetchAll() as $r) $map[(int)$r['lesson_id']] = ['position' => (int)$r['position'], 'completed' => (bool)$r['completed']];
  return $map;
}
function genPassword(): string {
  $alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $p = '';
  for ($i = 0; $i < 10; $i++) $p .= $alphabet[random_int(0, strlen($alphabet) - 1)];
  return $p;
}
function saveCover(): string {
  if (empty($_FILES['cover']) || $_FILES['cover']['error'] !== UPLOAD_ERR_OK) return '';
  $f = $_FILES['cover'];
  $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
  if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true) || !@getimagesize($f['tmp_name'])) out(422, ['error' => 'Обложка должна быть JPG, PNG или WEBP.']);
  $dir = dirname(__DIR__) . '/uploads/school';
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $name = bin2hex(random_bytes(10)) . '.' . $ext;
  if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) out(500, ['error' => 'Не удалось сохранить обложку.']);
  return '/uploads/school/' . $name;
}
function deleteVideoFile(array $lesson): void {
  if ($lesson['video_type'] === 'file' && preg_match('/^[a-f0-9]{32}\.(mp4|webm|mov|m4v)$/', (string)$lesson['video_ref'])) {
    @unlink(schoolStorage() . '/videos/' . $lesson['video_ref']);
  }
}

/* Общая диагностика для ученика и превью в админке. $studentId = 0 — админ. */
function videoDiagnosis(array $l, int $studentId): string {
  if ($l['video_type'] !== 'file') return 'У урока нет загруженного видео.';
  $path = schoolVideoPath($l);
  if (!is_file($path) || (int)filesize($path) === 0) return 'Файл видео не найден на сервере — загрузите его в админке заново.';
  if ((int)filesize($path) !== (int)$l['video_size'] && (int)$l['video_size'] > 0) return 'Файл видео загрузился не полностью — загрузите его в админке заново.';
  $codec = (string)$l['video_codec'];
  if ($codec === '') { $codec = schoolProbeVideo($path)['codec']; if ($codec !== '') db()->prepare('UPDATE school_lessons SET video_codec=? WHERE id=?')->execute([$codec, $l['id']]); }
  if ($w = schoolCodecWarning($codec)) return $w;
  $s = db()->prepare("SELECT detail FROM school_log WHERE event='stream_deny' AND " . ($studentId ? 'student_id=?' : 'student_id IS NULL AND ip=?') . ' AND created_at > ? ORDER BY id DESC LIMIT 1');
  $s->execute([$studentId ?: schoolIp(), date('Y-m-d H:i:s', time() - 600)]);
  $reason = (string)$s->fetchColumn();
  $map = [
    'token_expired' => 'Ссылка на видео устарела — нажмите «Повторить».',
    'token_signature' => 'Ссылка на видео повреждена — нажмите «Повторить».',
    'token_format' => 'Ссылка на видео повреждена — нажмите «Повторить».',
    'not_logged_in' => 'Сеанс завершён — войдите в кабинет заново.',
    'bind_mismatch' => 'Сеанс изменился — нажмите «Повторить».',
    'no_access' => 'Нет доступа к этому курсу.',
    'admin_session' => 'Сеанс админки завершён — войдите заново.',
    'file_missing' => 'Файл видео не найден на сервере.',
  ];
  if ($reason !== '') {
    $key = explode(':', $reason)[0];
    if ($key === 'direct_open' || $key === 'cross_site') return 'Браузер заблокировал загрузку видео (' . $reason . '). Обновите браузер или откройте кабинет в Chrome, Safari или Firefox.';
    return $map[$key] ?? ('Сервер отклонил видео: ' . $reason);
  }
  return 'Браузер не смог воспроизвести файл. Скорее всего, неподдерживаемый формат — пересохраните видео в MP4 (H.264).';
}

try {
  schoolSchema();
  $action = (string)($_GET['action'] ?? '');
  $method = $_SERVER['REQUEST_METHOD'];
  /* Кастомный заголовок: кросс-доменный запрос с ним невозможен без CORS — это защита от CSRF. */
  if ($method !== 'GET' && ($_SERVER['HTTP_X_SCHOOL'] ?? '') !== '1') out(403, ['error' => 'Запрос отклонён.']);

  /* ─────────────── Ученик ─────────────── */

  if ($action === 'login' && $method === 'POST') {
    if (schoolTooManyAttempts('login_fail')) out(429, ['error' => 'Слишком много попыток. Попробуйте через 15 минут.']);
    $email = mb_strtolower(str('email', 190));
    $s = db()->prepare('SELECT * FROM school_students WHERE email=?');
    $s->execute([$email]);
    $st = $s->fetch();
    if (!$st || !password_verify(str('password', 200), (string)$st['password_hash'])) { schoolLog(null, 'login_fail', $email); out(403, ['error' => 'Неверная почта или пароль.']); }
    if (!(int)$st['is_active']) out(403, ['error' => 'Доступ приостановлен. Напишите автору курса.']);
    if ($st['access_until'] && $st['access_until'] < date('Y-m-d')) out(403, ['error' => 'Срок доступа истёк.']);
    $token = bin2hex(random_bytes(32));
    db()->prepare('UPDATE school_students SET session_token=?, last_login_at=?, last_ip=? WHERE id=?')->execute([$token, schoolNow(), schoolIp(), $st['id']]);
    schoolSetAuthCookie($st['id'] . '.' . $token);
    schoolLog((int)$st['id'], 'login');
    out(200, ['ok' => true]);
  }

  if ($action === 'logout' && $method === 'POST') {
    $me = schoolCurrentStudent();
    if ($me) db()->prepare('UPDATE school_students SET session_token=NULL WHERE id=?')->execute([$me['id']]);
    schoolSetAuthCookie('');
    out(200, ['ok' => true]);
  }

  if (strpos($action, 'admin') !== 0) {
    $me = schoolCurrentStudent();
    if (!$me) { $reason = schoolStudentDenyReason(); out(401, ['error' => $reason ?: 'Войдите в кабинет.', 'kicked' => $reason !== '']); }
    $sid = (int)$me['id'];

    if ($action === 'me') {
      $ids = schoolStudentCourseIds($sid);
      $progress = progressMap($sid);
      $courses = [];
      if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $s = db()->prepare("SELECT * FROM school_courses WHERE is_published=1 AND id IN ($in) ORDER BY sort_order ASC, id ASC");
        $s->execute($ids);
        foreach ($s->fetchAll() as $c) {
          $lessons = lessonsOf((int)$c['id'], false);
          $done = 0;
          foreach ($lessons as $l) if (!empty($progress[(int)$l['id']]['completed'])) $done++;
          $courses[] = ['id' => (int)$c['id'], 'title' => $c['title'], 'subtitle' => $c['subtitle'], 'description' => (string)$c['description'], 'cover' => $c['cover'], 'lessons' => count($lessons), 'done' => $done];
        }
      }
      out(200, ['student' => studentPublic($me), 'school' => schoolSetting('school_name'), 'support' => schoolSetting('support'), 'courses' => $courses, 'access_until' => $me['access_until']]);
    }

    if ($action === 'course') {
      $id = (int)($_GET['id'] ?? 0);
      $c = schoolCourse($id);
      if (!$c || !(int)$c['is_published'] || !in_array($id, schoolStudentCourseIds($sid), true)) out(404, ['error' => 'Курс не найден.']);
      $progress = progressMap($sid);
      $lessons = array_map(function ($l) use ($progress) {
        $p = $progress[(int)$l['id']] ?? ['position' => 0, 'completed' => false];
        return ['id' => (int)$l['id'], 'title' => $l['title'], 'duration' => (int)$l['duration'], 'has_video' => $l['video_type'] !== '', 'completed' => $p['completed'], 'position' => $p['position']];
      }, lessonsOf($id, false));
      out(200, ['course' => ['id' => (int)$c['id'], 'title' => $c['title'], 'subtitle' => $c['subtitle'], 'description' => (string)$c['description'], 'cover' => $c['cover']], 'lessons' => $lessons]);
    }

    if ($action === 'lesson') {
      $l = schoolLesson((int)($_GET['id'] ?? 0));
      if (!$l || !schoolStudentCanSee($me, $l)) out(404, ['error' => 'Урок не найден.']);
      $video = null;
      if ($l['video_type'] === 'file') $video = ['type' => 'file', 'src' => '/school/stream.php?t=' . schoolVideoToken((int)$l['id'], $sid)];
      if ($l['video_type'] === 'kinescope') $video = ['type' => 'kinescope', 'id' => $l['video_ref']];
      $p = progressMap($sid)[(int)$l['id']] ?? ['position' => 0, 'completed' => false];
      schoolLog($sid, 'lesson_open', (string)$l['id']);
      out(200, ['lesson' => ['id' => (int)$l['id'], 'course_id' => (int)$l['course_id'], 'title' => $l['title'], 'description' => (string)$l['description'], 'materials' => (string)$l['materials'], 'video' => $video, 'position' => $p['position'], 'completed' => $p['completed']]]);
    }

    /* Плеер не смог воспроизвести видео — выясняем причину и показываем её по-человечески. */
    if ($action === 'video_check') {
      $l = schoolLesson((int)($_GET['id'] ?? 0));
      if (!$l || !schoolStudentCanSee($me, $l)) out(200, ['message' => 'Урок недоступен.']);
      out(200, ['message' => videoDiagnosis($l, $sid)]);
    }

    if ($action === 'progress' && $method === 'POST') {
      $l = schoolLesson(int_('lesson_id'));
      if (!$l || !schoolStudentCanSee($me, $l)) out(404, ['error' => 'Урок не найден.']);
      $position = max(0, int_('position'));
      $completed = !empty(body()['completed']) ? 1 : 0;
      db()->prepare('INSERT INTO school_progress (student_id, lesson_id, position, completed, updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE position=VALUES(position), completed=GREATEST(completed, VALUES(completed)), updated_at=VALUES(updated_at)')
        ->execute([$sid, $l['id'], $position, $completed, schoolNow()]);
      if (!empty(body()['uncomplete'])) db()->prepare('UPDATE school_progress SET completed=0 WHERE student_id=? AND lesson_id=?')->execute([$sid, $l['id']]);
      if (!empty(body()['duration']) && (int)$l['duration'] === 0) db()->prepare('UPDATE school_lessons SET duration=? WHERE id=?')->execute([min(86400, int_('duration')), $l['id']]);
      out(200, ['ok' => true]);
    }

    /* Сигналы защиты с фронта: попытки скриншота, закрытый водяной знак и т.п. — видны в журнале автора. */
    if ($action === 'signal' && $method === 'POST') {
      $kind = preg_replace('/[^a-z_]/', '', str('kind', 32));
      if ($kind !== '') schoolLog($sid, 'guard_' . $kind, str('detail', 200));
      out(200, ['ok' => true]);
    }

    if ($action === 'password' && $method === 'POST') {
      if (!password_verify(str('current', 200), (string)$me['password_hash'])) out(403, ['error' => 'Текущий пароль неверный.']);
      $new = str('new', 200);
      if (mb_strlen($new) < 8) out(422, ['error' => 'Новый пароль — минимум 8 символов.']);
      db()->prepare('UPDATE school_students SET password_hash=? WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), $sid]);
      out(200, ['ok' => true]);
    }

    out(404, ['error' => 'Неизвестное действие.']);
  }

  /* ─────────────── Автор курса (админка) ─────────────── */

  if ($action === 'admin_login' && $method === 'POST') {
    if (schoolTooManyAttempts('admin_fail')) out(429, ['error' => 'Слишком много попыток. Попробуйте через 15 минут.']);
    if (!schoolAdminConfigured()) out(503, ['error' => 'Пароль админки не задан: добавьте school_admin_password в config.php на сервере.']);
    if (!schoolVerifyAdmin(str('password', 200))) { schoolLog(null, 'admin_fail'); out(403, ['error' => 'Неверный пароль.']); }
    session_regenerate_id(true);
    $_SESSION['school_admin'] = true;
    schoolLog(null, 'admin_login');
    out(200, ['ok' => true]);
  }
  if (!schoolIsAdmin()) out(401, ['error' => 'Войдите в админку.']);
  $db = db();

  if ($action === 'admin.logout' && $method === 'POST') { unset($_SESSION['school_admin']); out(200, ['ok' => true]); }

  if ($action === 'admin.dashboard') {
    $week = date('Y-m-d H:i:s', time() - 7 * 86400);
    $count = function (string $sql, array $p = []) use ($db): int { $s = $db->prepare($sql); $s->execute($p); return (int)$s->fetchColumn(); };
    $recent = $db->prepare("SELECT l.event, l.detail, l.ip, l.created_at, s.name, s.email FROM school_log l LEFT JOIN school_students s ON s.id=l.student_id WHERE l.event IN ('login','stream_deny','guard_screenshot','guard_devtools','guard_watermark') ORDER BY l.id DESC LIMIT 12");
    $recent->execute();
    /* Подозрительные: много разных IP за сутки — похоже на передачу аккаунта. */
    $sus = $db->prepare("SELECT s.id, s.name, s.email, COUNT(DISTINCT l.ip) ips FROM school_log l JOIN school_students s ON s.id=l.student_id WHERE l.event='login' AND l.created_at > ? GROUP BY s.id HAVING ips >= 3 ORDER BY ips DESC LIMIT 10");
    $sus->execute([date('Y-m-d H:i:s', time() - 86400)]);
    out(200, [
      'stats' => [
        'students' => $count('SELECT COUNT(*) FROM school_students'),
        'active' => $count('SELECT COUNT(DISTINCT student_id) FROM school_log WHERE event=? AND created_at > ?', ['lesson_open', $week]),
        'courses' => $count('SELECT COUNT(*) FROM school_courses'),
        'lessons' => $count('SELECT COUNT(*) FROM school_lessons'),
        'views' => $count('SELECT COUNT(*) FROM school_log WHERE event=? AND created_at > ?', ['lesson_open', $week]),
        'guards' => $count("SELECT COUNT(*) FROM school_log WHERE event LIKE 'guard\\_%' AND created_at > ?", [$week]),
      ],
      'recent' => $recent->fetchAll(),
      'suspicious' => $sus->fetchAll(),
      'storage' => schoolStorage(),
    ]);
  }

  /* Курсы */
  if ($action === 'admin.courses') {
    $rows = $db->query('SELECT c.*, (SELECT COUNT(*) FROM school_lessons l WHERE l.course_id=c.id) lessons, (SELECT COUNT(*) FROM school_access a WHERE a.course_id=c.id) students FROM school_courses c ORDER BY sort_order ASC, id ASC')->fetchAll();
    out(200, ['courses' => $rows]);
  }
  if ($action === 'admin.course_save' && $method === 'POST') {
    /* Приходит multipart — из-за обложки. */
    $id = (int)($_POST['id'] ?? 0);
    $title = mb_substr(trim((string)($_POST['title'] ?? '')), 0, 255);
    if ($title === '') out(422, ['error' => 'Укажите название курса.']);
    $subtitle = mb_substr(trim((string)($_POST['subtitle'] ?? '')), 0, 255);
    $desc = mb_substr(trim((string)($_POST['description'] ?? '')), 0, 20000);
    $pub = !empty($_POST['is_published']) ? 1 : 0;
    $cover = saveCover();
    if ($id > 0) {
      if (!schoolCourse($id)) out(404, ['error' => 'Курс не найден.']);
      $db->prepare('UPDATE school_courses SET title=?, subtitle=?, description=?, is_published=?' . ($cover ? ', cover=?' : '') . ' WHERE id=?')
        ->execute($cover ? [$title, $subtitle, $desc, $pub, $cover, $id] : [$title, $subtitle, $desc, $pub, $id]);
    } else {
      $order = (int)$db->query('SELECT COALESCE(MAX(sort_order),0)+1 FROM school_courses')->fetchColumn();
      $db->prepare('INSERT INTO school_courses (title, subtitle, description, cover, is_published, sort_order, created_at) VALUES (?,?,?,?,?,?,?)')->execute([$title, $subtitle, $desc, $cover, $pub, $order, schoolNow()]);
      $id = (int)$db->lastInsertId();
    }
    out(200, ['ok' => true, 'id' => $id]);
  }
  if ($action === 'admin.course_delete' && $method === 'POST') {
    $id = int_('id');
    foreach (lessonsOf($id, true) as $l) { deleteVideoFile($l); $db->prepare('DELETE FROM school_progress WHERE lesson_id=?')->execute([$l['id']]); }
    $db->prepare('DELETE FROM school_lessons WHERE course_id=?')->execute([$id]);
    $db->prepare('DELETE FROM school_access WHERE course_id=?')->execute([$id]);
    $db->prepare('DELETE FROM school_courses WHERE id=?')->execute([$id]);
    out(200, ['ok' => true]);
  }
  if ($action === 'admin.reorder' && $method === 'POST') {
    $table = str('table') === 'lessons' ? 'school_lessons' : 'school_courses';
    $st = $db->prepare("UPDATE $table SET sort_order=? WHERE id=?");
    foreach ((array)(body()['ids'] ?? []) as $i => $id) $st->execute([$i + 1, (int)$id]);
    out(200, ['ok' => true]);
  }

  /* Уроки */
  if ($action === 'admin.lessons') {
    $cid = (int)($_GET['course_id'] ?? 0);
    $c = schoolCourse($cid);
    if (!$c) out(404, ['error' => 'Курс не найден.']);
    $rows = lessonsOf($cid, true);
    /* Проблемы с видео видны сразу в списке, а не только когда ученик пожалуется. */
    foreach ($rows as &$r) {
      $r['warning'] = '';
      if ($r['video_type'] !== 'file') continue;
      $path = schoolVideoPath($r);
      if (!is_file($path) || (int)filesize($path) === 0) { $r['warning'] = 'Файл не найден на сервере — загрузите заново.'; continue; }
      if ((int)$r['video_size'] > 0 && (int)filesize($path) !== (int)$r['video_size']) { $r['warning'] = 'Файл загрузился не полностью — загрузите заново.'; continue; }
      if ($r['video_codec'] === '') { $r['video_codec'] = schoolProbeVideo($path)['codec']; if ($r['video_codec'] !== '') $db->prepare('UPDATE school_lessons SET video_codec=? WHERE id=?')->execute([$r['video_codec'], $r['id']]); }
      $r['warning'] = schoolCodecWarning((string)$r['video_codec']);
    }
    unset($r);
    out(200, ['course' => $c, 'lessons' => $rows]);
  }
  if ($action === 'admin.lesson_save' && $method === 'POST') {
    $id = int_('id');
    $cid = int_('course_id');
    if (!schoolCourse($cid)) out(404, ['error' => 'Курс не найден.']);
    $title = str('title');
    if ($title === '') out(422, ['error' => 'Укажите название урока.']);
    $desc = str('description', 50000);
    $materials = str('materials', 50000);
    $pub = !empty(body()['is_published']) ? 1 : 0;
    if ($id > 0) {
      $db->prepare('UPDATE school_lessons SET title=?, description=?, materials=?, is_published=? WHERE id=? AND course_id=?')->execute([$title, $desc, $materials, $pub, $id, $cid]);
    } else {
      $s = $db->prepare('SELECT COALESCE(MAX(sort_order),0)+1 FROM school_lessons WHERE course_id=?');
      $s->execute([$cid]);
      $db->prepare('INSERT INTO school_lessons (course_id, title, description, materials, is_published, sort_order, created_at) VALUES (?,?,?,?,?,?,?)')->execute([$cid, $title, $desc, $materials, $pub, (int)$s->fetchColumn(), schoolNow()]);
      $id = (int)$db->lastInsertId();
    }
    if (array_key_exists('kinescope', body())) {
      $kid = schoolKinescopeId(str('kinescope'));
      if (str('kinescope') !== '' && $kid === '') out(422, ['error' => 'Не удалось распознать ссылку Kinescope.']);
      if ($kid !== '') {
        $old = schoolLesson($id);
        if ($old) deleteVideoFile($old);
        $db->prepare("UPDATE school_lessons SET video_type='kinescope', video_ref=?, video_name='', video_size=0, video_codec='' WHERE id=?")->execute([$kid, $id]);
      }
    }
    out(200, ['ok' => true, 'id' => $id]);
  }
  if ($action === 'admin.lesson_delete' && $method === 'POST') {
    $l = schoolLesson(int_('id'));
    if ($l) { deleteVideoFile($l); $db->prepare('DELETE FROM school_progress WHERE lesson_id=?')->execute([$l['id']]); $db->prepare('DELETE FROM school_lessons WHERE id=?')->execute([$l['id']]); }
    out(200, ['ok' => true]);
  }
  if ($action === 'admin.video_remove' && $method === 'POST') {
    $l = schoolLesson(int_('id'));
    if (!$l) out(404, ['error' => 'Урок не найден.']);
    deleteVideoFile($l);
    $db->prepare("UPDATE school_lessons SET video_type='', video_ref='', video_name='', video_size=0, video_codec='', duration=0 WHERE id=?")->execute([$l['id']]);
    out(200, ['ok' => true]);
  }
  if ($action === 'admin.preview_token') {
    $l = schoolLesson((int)($_GET['id'] ?? 0));
    if (!$l || $l['video_type'] !== 'file') out(404, ['error' => 'Видео не найдено.']);
    out(200, ['src' => '/school/stream.php?t=' . schoolVideoToken((int)$l['id'], 0)]);
  }
  if ($action === 'admin.video_check') {
    $l = schoolLesson((int)($_GET['id'] ?? 0));
    if (!$l) out(404, ['error' => 'Урок не найден.']);
    out(200, ['message' => videoDiagnosis($l, 0)]);
  }
  if ($action === 'admin.upload_config') {
    out(200, ['chunk' => schoolChunkBytes()]);
  }

  /* Загрузка видео кусками (до 4 МБ, под лимит хостинга) — обходит upload_max_filesize.
     Каждый кусок сверяется по размеру: если хостинг обрезал запрос, загрузка
     останавливается с ошибкой, а не сохраняет битый файл. */
  if ($action === 'admin.upload_chunk' && $method === 'POST') {
    $l = schoolLesson((int)($_GET['lesson_id'] ?? 0));
    if (!$l) out(404, ['error' => 'Урок не найден.']);
    $uid = (string)($_GET['upload_id'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $uid)) out(422, ['error' => 'Некорректная загрузка.']);
    $index = (int)($_GET['index'] ?? -1);
    $total = (int)($_GET['total'] ?? 0);
    $name = mb_substr(basename((string)($_GET['name'] ?? 'video.mp4')), 0, 255);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp4', 'm4v', 'webm', 'mov'], true)) out(422, ['error' => 'Поддерживаются MP4, M4V, MOV и WEBM. Лучше всего — MP4 (H.264).']);
    $chunk = (int)($_GET['chunk'] ?? 0);
    $fileSize = (int)($_GET['size'] ?? 0);
    if ($index < 0 || $total < 1 || $index >= $total || $total > 200000) out(422, ['error' => 'Некорректный номер части.']);
    if ($chunk < 65536 || $chunk > SCHOOL_CHUNK_BYTES || $fileSize < 1 || (int)ceil($fileSize / $chunk) !== $total) out(422, ['error' => 'Некорректные параметры загрузки. Обновите страницу.']);
    $expected = min($chunk, $fileSize - $index * $chunk);
    $part = schoolStorage() . "/parts/$uid.part";
    if ($index === 0) @unlink($part);
    elseif (!is_file($part) || (int)filesize($part) !== $index * $chunk) out(409, ['error' => 'Загрузка прервалась, начните заново.']);
    $in = fopen('php://input', 'rb');
    $outF = fopen($part, 'ab');
    $bytes = stream_copy_to_stream($in, $outF, $expected + 1);
    fclose($in); fclose($outF);
    clearstatcache(true, $part);
    if ($bytes !== $expected) {
      @unlink($part);
      out(422, ['error' => 'Сервер получил часть файла не целиком (' . (int)$bytes . ' из ' . $expected . ' байт). Попробуйте ещё раз — если повторится, лимит хостинга post_max_size меньше ' . round($expected / 1048576, 1) . ' МБ.']);
    }
    if ($index < $total - 1) out(200, ['ok' => true, 'received' => $index + 1]);
    if ((int)filesize($part) !== $fileSize) { @unlink($part); out(422, ['error' => 'Итоговый размер файла не совпал — загрузите заново.']); }
    $probe = schoolProbeVideo($part);
    if ($probe['container'] === '') { @unlink($part); out(422, ['error' => 'Это не видеофайл MP4/MOV/WEBM или файл повреждён.']); }
    $target = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!rename($part, schoolStorage() . "/videos/$target")) { @unlink($part); out(500, ['error' => 'Не удалось сохранить видео.']); }
    deleteVideoFile($l);
    $db->prepare("UPDATE school_lessons SET video_type='file', video_ref=?, video_name=?, video_size=?, video_codec=?, duration=0 WHERE id=?")->execute([$target, $name, $fileSize, $probe['codec'], $l['id']]);
    out(200, ['ok' => true, 'done' => true, 'warning' => schoolCodecWarning($probe['codec'])]);
  }

  /* Ученики */
  if ($action === 'admin.students') {
    $rows = $db->query('SELECT id, name, email, note, is_active, access_until, last_login_at, last_ip, created_at FROM school_students ORDER BY id DESC')->fetchAll();
    $access = [];
    foreach ($db->query('SELECT student_id, course_id FROM school_access')->fetchAll() as $a) $access[(int)$a['student_id']][] = (int)$a['course_id'];
    $done = [];
    foreach ($db->query('SELECT student_id, COUNT(*) n FROM school_progress WHERE completed=1 GROUP BY student_id')->fetchAll() as $d) $done[(int)$d['student_id']] = (int)$d['n'];
    foreach ($rows as &$r) { $r['courses'] = $access[(int)$r['id']] ?? []; $r['completed'] = $done[(int)$r['id']] ?? 0; }
    unset($r);
    out(200, ['students' => $rows, 'courses' => $db->query('SELECT id, title FROM school_courses ORDER BY sort_order, id')->fetchAll()]);
  }
  if ($action === 'admin.student_save' && $method === 'POST') {
    $id = int_('id');
    $name = str('name', 190);
    $email = mb_strtolower(str('email', 190));
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) out(422, ['error' => 'Укажите имя и корректную почту.']);
    $until = str('access_until', 10);
    $until = preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) ? $until : null;
    $active = !empty(body()['is_active']) ? 1 : 0;
    $note = str('note', 500);
    $password = null;
    try {
      if ($id > 0) {
        $db->prepare('UPDATE school_students SET name=?, email=?, note=?, is_active=?, access_until=? WHERE id=?')->execute([$name, $email, $note, $active, $until, $id]);
        if (!$active) $db->prepare('UPDATE school_students SET session_token=NULL WHERE id=?')->execute([$id]);
      } else {
        $password = genPassword();
        $db->prepare('INSERT INTO school_students (name, email, password_hash, note, is_active, access_until, created_at) VALUES (?,?,?,?,?,?,?)')->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $note, $active, $until, schoolNow()]);
        $id = (int)$db->lastInsertId();
      }
    } catch (PDOException $e) {
      if ($e->getCode() === '23000') out(409, ['error' => 'Ученик с такой почтой уже есть.']);
      throw $e;
    }
    $db->prepare('DELETE FROM school_access WHERE student_id=?')->execute([$id]);
    $ins = $db->prepare('INSERT IGNORE INTO school_access (student_id, course_id) VALUES (?,?)');
    foreach ((array)(body()['courses'] ?? []) as $cid) if (schoolCourse((int)$cid)) $ins->execute([$id, (int)$cid]);
    out(200, ['ok' => true, 'id' => $id, 'password' => $password]);
  }
  if ($action === 'admin.student_reset' && $method === 'POST') {
    $password = genPassword();
    $db->prepare('UPDATE school_students SET password_hash=?, session_token=NULL WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), int_('id')]);
    out(200, ['ok' => true, 'password' => $password]);
  }
  if ($action === 'admin.student_kick' && $method === 'POST') {
    $db->prepare('UPDATE school_students SET session_token=NULL WHERE id=?')->execute([int_('id')]);
    out(200, ['ok' => true]);
  }
  if ($action === 'admin.student_delete' && $method === 'POST') {
    $id = int_('id');
    foreach (['school_access', 'school_progress'] as $t) $db->prepare("DELETE FROM $t WHERE student_id=?")->execute([$id]);
    $db->prepare('DELETE FROM school_students WHERE id=?')->execute([$id]);
    out(200, ['ok' => true]);
  }
  if ($action === 'admin.student_log') {
    $s = $db->prepare('SELECT event, detail, ip, ua, created_at FROM school_log WHERE student_id=? ORDER BY id DESC LIMIT 200');
    $s->execute([(int)($_GET['id'] ?? 0)]);
    out(200, ['log' => $s->fetchAll()]);
  }

  /* Журнал и настройки */
  if ($action === 'admin.log') {
    $filter = (string)($_GET['filter'] ?? '');
    $where = $filter === 'guard' ? "WHERE l.event LIKE 'guard\\_%'" : ($filter === 'login' ? "WHERE l.event IN ('login','login_fail','admin_login','admin_fail')" : ($filter === 'video' ? "WHERE l.event='stream_deny'" : ''));
    $rows = $db->query("SELECT l.*, s.name, s.email FROM school_log l LEFT JOIN school_students s ON s.id=l.student_id $where ORDER BY l.id DESC LIMIT 300")->fetchAll();
    out(200, ['log' => $rows]);
  }
  if ($action === 'admin.settings') {
    out(200, ['school_name' => schoolSetting('school_name'), 'support' => schoolSetting('support')]);
  }
  if ($action === 'admin.settings_save' && $method === 'POST') {
    schoolSetSetting('school_name', str('school_name', 120) ?: 'Школа фотографии');
    schoolSetSetting('support', str('support', 255));
    $new = str('new_password', 200);
    if ($new !== '') {
      if (!schoolVerifyAdmin(str('current_password', 200))) out(403, ['error' => 'Текущий пароль админки неверный.']);
      if (mb_strlen($new) < 6) out(422, ['error' => 'Новый пароль — минимум 6 символов.']);
      schoolSetSetting('admin_hash', password_hash($new, PASSWORD_DEFAULT));
    }
    out(200, ['ok' => true]);
  }

  out(404, ['error' => 'Неизвестное действие.']);
} catch (Throwable $e) {
  error_log('School API: ' . $e->__toString());
  out(500, ['error' => 'Ошибка сервера. Попробуйте ещё раз.']);
}
