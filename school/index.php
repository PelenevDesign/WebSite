<?php
require __DIR__ . '/lib.php';
schoolSession();
schoolNoIndexHeaders();
header('X-Frame-Options: DENY', true);
$name = 'Школа фотографии';
try { schoolSchema(); $name = schoolSetting('school_name') ?: $name; } catch (Throwable $e) { error_log('School page: ' . $e->getMessage()); }
$h = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="theme-color" content="#0A0A0A">
  <title>Личный кабинет — <?= $h($name) ?></title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/school/school.css?v=1">
</head>
<body class="sc">
  <header class="sc-top">
    <a class="sc-brand" href="#/"><?= $h($name) ?><i>.</i></a>
    <nav class="sc-top__nav" id="top-nav" hidden>
      <a href="#/">Мои курсы</a>
      <a href="#/profile" id="top-user">Профиль</a>
    </nav>
  </header>
  <main class="sc-main" id="app" aria-live="polite"><div class="sc-loading">Загрузка…</div></main>
  <div class="sc-shield" id="page-shield" hidden><p>Просмотр приостановлен.<br><small>Вернитесь в окно, чтобы продолжить.</small></p></div>
  <script src="/school/guard.js?v=1"></script>
  <script src="/school/app.js?v=1"></script>
</body>
</html>
