<?php
declare(strict_types=1);
require dirname(__DIR__) . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
header('Cache-Control: no-store, private', true);

function crmJson(int $status, array $payload = []): void { http_response_code($status); echo json_encode($payload, JSON_UNESCAPED_UNICODE); exit; }
function crmBody(): array { $raw = file_get_contents('php://input'); $value = json_decode($raw ?: '{}', true); return is_array($value) ? $value : []; }
function crmEnsureTable(): void {
  db()->exec("CREATE TABLE IF NOT EXISTS crm_workspace_state (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
try {
  if (empty($_SESSION['cms_authorized'])) crmJson(401, ['error' => 'Требуется авторизация.']);
  crmEnsureTable();
  $action = (string)($_GET['action'] ?? 'state');
  if ($action === 'state' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $row = db()->query('SELECT payload, updated_at FROM crm_workspace_state WHERE id=1')->fetch();
    if (!$row) crmJson(200, ['state' => null, 'updated_at' => null]);
    $state = json_decode((string)$row['payload'], true);
    crmJson(200, ['state' => is_array($state) ? $state : null, 'updated_at' => $row['updated_at']]);
  }
  if ($action === 'state' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = crmBody();
    $state = $data['state'] ?? null;
    if (!is_array($state)) crmJson(422, ['error' => 'Некорректное состояние CRM.']);
    foreach (['tasks','notes'] as $key) if (!isset($state[$key]) || !is_array($state[$key])) crmJson(422, ['error' => 'Некорректная структура CRM.']);
    $payload = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($payload) || strlen($payload) > 2 * 1024 * 1024) crmJson(422, ['error' => 'Состояние CRM слишком большое.']);
    $statement = db()->prepare('INSERT INTO crm_workspace_state (id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)');
    $statement->execute([$payload]);
    crmJson(200, ['ok' => true]);
  }
  crmJson(404, ['error' => 'CRM endpoint не найден.']);
} catch (Throwable $error) {
  error_log('CRM API: ' . $error->__toString());
  crmJson(500, ['error' => 'Не удалось подключить хранилище CRM.']);
}
