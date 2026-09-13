<?php
require dirname(__DIR__) . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
session_start();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
  $p = session_get_cookie_params();
  setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
header('Location: /crm/login.php', true, 302);
