<?php
declare(strict_types=1);
/* Отдаёт видео урока только плееру кабинета:
   - подписанный токен, привязанный к уроку, ученику и сессии;
   - активный вход именно с этого устройства;
   - запрос должен идти от <video> (Sec-Fetch-Dest), прямое открытие ссылки во вкладке не работает;
   - за один запрос отдаётся не больше 2 МБ — «скачать одной ссылкой» не выйдет. */
require __DIR__ . '/lib.php';
schoolSession();
schoolNoIndexHeaders();

function deny(int $code): void { http_response_code($code); header('Content-Type: text/plain; charset=utf-8'); echo 'Forbidden'; exit; }

try {
  schoolSchema();
  $t = schoolParseVideoToken((string)($_GET['t'] ?? ''));
  if (!$t) deny(403);
  $dest = (string)($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');
  $site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
  /* Старые Safari (до 16.4) заголовок не шлют — тогда пускаем только Range-запросы, как у <video>. */
  if ($dest === '' ? !isset($_SERVER['HTTP_RANGE']) : ($dest !== 'video' && $dest !== 'audio')) deny(403);
  if ($site !== '' && $site !== 'same-origin') deny(403);

  $lesson = schoolLesson($t['lesson_id']);
  if (!$lesson || $lesson['video_type'] !== 'file') deny(404);
  if ($t['student_id'] === 0) {
    if (!schoolIsAdmin()) deny(403);
  } else {
    $me = schoolCurrentStudent();
    if (!$me || (int)$me['id'] !== $t['student_id'] || !schoolStudentCanSee($me, $lesson)) deny(403);
  }
  session_write_close();

  $path = schoolStorage() . '/videos/' . basename((string)$lesson['video_ref']);
  if (!is_file($path)) deny(404);
  $size = (int)filesize($path);
  $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
  $mime = ['mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm'][$ext] ?? 'video/mp4';

  $maxChunk = 2 * 1024 * 1024;
  $start = 0;
  $end = min($size - 1, $maxChunk - 1);
  if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', (string)$_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] === '' && $m[2] !== '') { $start = max(0, $size - (int)$m[2]); $end = $size - 1; }
    else { $start = (int)$m[1]; $end = $m[2] !== '' ? min((int)$m[2], $size - 1) : $size - 1; }
    if ($start > $end || $start >= $size) { header("Content-Range: bytes */$size"); deny(416); }
    $end = min($end, $start + $maxChunk - 1);
  }
  $length = $end - $start + 1;

  @set_time_limit(0);
  while (ob_get_level()) ob_end_clean();
  http_response_code(206);
  header("Content-Type: $mime");
  header('Accept-Ranges: bytes');
  header("Content-Range: bytes $start-$end/$size");
  header("Content-Length: $length");
  header('Content-Disposition: inline; filename="stream"');
  header('X-Content-Type-Options: nosniff');
  header('Cross-Origin-Resource-Policy: same-origin');

  $fp = fopen($path, 'rb');
  fseek($fp, $start);
  $left = $length;
  while ($left > 0 && !feof($fp) && !connection_aborted()) {
    $buf = fread($fp, min(65536, $left));
    if ($buf === false) break;
    echo $buf;
    flush();
    $left -= strlen($buf);
  }
  fclose($fp);
} catch (Throwable $e) {
  error_log('School stream: ' . $e->__toString());
  deny(500);
}
