<?php
/* Временный диагностический файл. Откройте /_check.php в браузере, посмотрите вывод,
   затем УДАЛИТЕ этот файл с хостинга. Он не раскрывает паролей. */
header('Content-Type: text/plain; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "PHP версия: " . PHP_VERSION . "\n";
echo "PHP 8.0+: " . (PHP_VERSION_ID >= 80000 ? 'да' : 'НЕТ — нужна причина белого экрана') . "\n";
echo "str_contains: " . (function_exists('str_contains') ? 'есть' : 'НЕТ') . "\n";
echo "str_starts_with: " . (function_exists('str_starts_with') ? 'есть' : 'НЕТ') . "\n\n";

echo "--- config.php ---\n";
$config = @include __DIR__ . '/config.php';
if (!is_array($config)) { echo "ОШИБКА: config.php не читается или в нём опечатка.\n"; exit; }
echo "config.php читается: да\n";
echo "site_url: " . ($config['site_url'] ?? '(не задан)') . "\n";
$db = $config['db'] ?? [];
echo "db.name: " . ($db['name'] ?? '?') . (strpos((string)($db['name'] ?? ''), 'DATABASE_') === 0 ? '  <-- НЕ ЗАПОЛНЕНО!' : '') . "\n\n";

echo "--- Подключение к MySQL ---\n";
try {
  $pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset={$db['charset']}", $db['user'], $db['password']);
  echo "MySQL: подключение успешно\n";
  foreach (['cms_content', 'cms_projects', 'cms_leads'] as $t) {
    try { $n = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn(); echo "  таблица $t: $n записей\n"; }
    catch (Throwable $e) { echo "  таблица $t: НЕТ (запустите install.php)\n"; }
  }
} catch (Throwable $e) {
  echo "MySQL ОШИБКА: " . $e->getMessage() . "\n";
}
