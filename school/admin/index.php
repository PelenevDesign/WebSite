<?php
require dirname(__DIR__) . '/lib.php';
schoolSession();
schoolNoIndexHeaders();
header('X-Frame-Options: DENY', true);
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="theme-color" content="#0A0A0A">
  <title>Админка школы</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/school/school.css?v=1">
  <link rel="stylesheet" href="/school/admin/admin.css?v=1">
</head>
<body class="ad">
  <div id="root"><div class="sc-loading" style="padding:40px">Загрузка…</div></div>
  <script src="/school/admin/admin.js?v=1"></script>
</body>
</html>
