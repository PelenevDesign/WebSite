<?php
declare(strict_types=1);
/* Отдаёт видео урока только плееру кабинета:
   - подписанный токен, привязанный к уроку, ученику и его входу (cookie устройства);
   - запрос должен идти от <video> (Sec-Fetch-Dest), прямое открытие ссылки во вкладке не работает;
   - за один запрос отдаётся не больше 2 МБ — «скачать одной ссылкой» не выйдет.
   Каждый отказ пишется в журнал с причиной — плеер показывает её ученику. */
@ini_set('zlib.output_compression', '0');
require __DIR__ . '/lib.php';
schoolNoIndexHeaders();

$studentId = null;
function deny(int $code, string $reason): void {
  global $studentId;
  try {
    /* Не забиваем журнал: одна запись на причину в минуту. */
    $s = db()->prepare('SELECT COUNT(*) FROM school_log WHERE event=? AND detail=? AND ip=? AND created_at > ?');
    $s->execute(['stream_deny', $reason, schoolIp(), date('Y-m-d H:i:s', time() - 60)]);
    if (!(int)$s->fetchColumn()) schoolLog($studentId, 'stream_deny', $reason);
  } catch (Throwable $e) {}
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  header('X-School-Deny: ' . $reason);
  echo 'Forbidden';
  exit;
}

try {
  schoolSchema();
  $t = schoolParseVideoToken((string)($_GET['t'] ?? ''));
  if (!is_array($t)) deny(403, $t);
  $studentId = $t['student_id'] > 0 ? $t['student_id'] : null;

  $dest = (string)($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');
  $site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
  /* Старые Safari (до 16.4) заголовок не шлют — тогда пускаем только Range-запросы, как у <video>. */
  if ($dest === '' ? !isset($_SERVER['HTTP_RANGE']) : !in_array($dest, ['video', 'audio'], true)) deny(403, 'direct_open:' . $dest);
  if ($site !== '' && $site !== 'same-origin') deny(403, 'cross_site:' . $site);

  $lesson = schoolLesson($t['lesson_id']);
  if (!$lesson || $lesson['video_type'] !== 'file') deny(404, 'no_lesson_video');
  if ($t['student_id'] === 0) {
    schoolSession();
    if (!schoolIsAdmin()) deny(403, 'admin_session');
    if (!hash_equals(schoolBind(0), $t['bind'])) deny(403, 'bind_mismatch');
    session_write_close();
  } else {
    $me = schoolCurrentStudent();
    if (!$me || (int)$me['id'] !== $t['student_id']) deny(403, 'not_logged_in');
    if (!hash_equals(schoolBind($t['student_id']), $t['bind'])) deny(403, 'bind_mismatch');
    if (!schoolStudentCanSee($me, $lesson)) deny(403, 'no_access');
  }

  $path = schoolVideoPath($lesson);
  if (!is_file($path)) deny(404, 'file_missing');
  $size = (int)filesize($path);
  if ($size <= 0) deny(404, 'file_empty');
  $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
  /* MOV отдаём как mp4: Chrome не принимает video/quicktime, хотя сам контейнер читает. */
  $mime = $ext === 'webm' ? 'video/webm' : 'video/mp4';

  $maxChunk = 2 * 1024 * 1024;
  $start = 0;
  $end = min($size - 1, $maxChunk - 1);
  if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', (string)$_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] === '' && $m[2] !== '') { $start = max(0, $size - (int)$m[2]); $end = $size - 1; }
    else { $start = (int)$m[1]; $end = $m[2] !== '' ? min((int)$m[2], $size - 1) : $size - 1; }
    if ($start > $end || $start >= $size) { header("Content-Range: bytes */$size"); http_response_code(416); exit; }
    $end = min($end, $start + $maxChunk - 1);
  }
  $length = $end - $start + 1;

  @set_time_limit(0);
  /* Буферы, которые нельзя снять (сжатие хостинга), раньше вешали цикл навсегда. */
  while (ob_get_level() > 0) { if (!@ob_end_clean()) break; }
  http_response_code(206);
  header("Content-Type: $mime");
  header('Accept-Ranges: bytes');
  header("Content-Range: bytes $start-$end/$size");
  header("Content-Length: $length");
  header('Content-Encoding: identity');
  header('Content-Disposition: inline; filename="stream"');
  header('X-Content-Type-Options: nosniff');
  header('Cross-Origin-Resource-Policy: same-origin');

  $fp = fopen($path, 'rb');
  fseek($fp, $start);
  $left = $length;
  while ($left > 0 && !feof($fp) && !connection_aborted()) {
    $buf = fread($fp, (int)min(65536, $left));
    if ($buf === false || $buf === '') break;
    echo $buf;
    flush();
    $left -= strlen($buf);
  }
  fclose($fp);
} catch (Throwable $e) {
  error_log('School stream: ' . $e->__toString());
  deny(500, 'server_error');
}
