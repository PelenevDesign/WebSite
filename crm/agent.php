<?php
declare(strict_types=1);
/* Прокси к LLM. Ключ живёт только здесь — в браузер он не уходит. */
require dirname(__DIR__) . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
header('Cache-Control: no-store, private', true);

function aiJson(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

if (empty($_SESSION['cms_authorized'])) aiJson(401, ['error' => 'Требуется авторизация.']);

$cfg = config()['ai'] ?? [];
$provider = (string)($cfg['provider'] ?? 'groq');
$key = trim((string)($cfg['key'] ?? ''));
$model = trim((string)($cfg['model'] ?? ''));
$baseUrl = trim((string)($cfg['base_url'] ?? ''));

/* Проверка настройки — отдаём понятную подсказку, а не «что-то пошло не так» */
if (($_GET['action'] ?? '') === 'status') {
  aiJson(200, ['ready' => $key !== '' || $provider === 'custom', 'provider' => $provider]);
}
if ($key === '' && $provider !== 'custom') {
  aiJson(503, ['error' => 'Ассистент не настроен: добавьте ключ в config.php → ai.key']);
}

/* Простое ограничение частоты: 20 запросов в минуту на сессию */
$now = time();
$_SESSION['ai_hits'] = array_values(array_filter((array)($_SESSION['ai_hits'] ?? []), fn($t) => $t > $now - 60));
if (count($_SESSION['ai_hits']) >= 20) aiJson(429, ['error' => 'Слишком часто. Подожди минуту.']);
$_SESSION['ai_hits'][] = $now;

$body = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($body)) aiJson(422, ['error' => 'Некорректный запрос.']);
$message = trim((string)($body['message'] ?? ''));
$snapshot = $body['snapshot'] ?? null;
$history = is_array($body['history'] ?? null) ? array_slice($body['history'], -8) : [];
if ($message === '') aiJson(422, ['error' => 'Пустое сообщение.']);
if (mb_strlen($message) > 2000) aiJson(422, ['error' => 'Слишком длинное сообщение.']);

$WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
$today = date('Y-m-d');
$weekday = $WEEKDAYS[(int)date('w')];

$system = <<<PROMPT
Ты — ассистент личной CRM. Пользователь пишет по-русски, что нужно записать или изменить.
Ты НЕ меняешь данные сам — ты возвращаешь список операций, которые применит приложение.

Сегодня: {$today} ({$weekday}). Все даты — строго в формате YYYY-MM-DD.
Деньги — целые числа в рублях, без пробелов и знака валюты.

Отвечай ТОЛЬКО валидным JSON-объектом такой формы:
{"reply": "короткий ответ по-русски", "ops": [ ... ]}

Допустимые операции (поле "op" обязательно, остальные — по смыслу):
- {"op":"task.create","title":"...","client":"имя или id клиента","urgent":true|false,"status":"new|progress|review|done","due":"YYYY-MM-DD","time":"HH:MM","price":0,"paid":0,"note":"..."}
- {"op":"task.update","id":"<id задачи>", ...любые поля из task.create...}
- {"op":"task.pay","id":"<id задачи>","amount":0}
- {"op":"task.delete","id":"<id задачи>"}
- {"op":"client.create","name":"...","contact":"...","note":"..."}
- {"op":"client.update","id":"<id клиента>","name":"...","contact":"...","note":"..."}
- {"op":"client.delete","id":"<id клиента>"}
- {"op":"vietnam.deposit","amount":0,"date":"YYYY-MM-DD","note":"..."}
- {"op":"vietnam.expense","amount":0,"date":"YYYY-MM-DD","note":"..."}
- {"op":"vietnam.delete","id":"<id операции>"}
- {"op":"goal.update","title":"...","target":0,"deadline":"YYYY-MM-DD","tagline":"..."}

Правила:
1. Ссылайся только на id, которые есть в снимке данных ниже. Не выдумывай id.
2. В task.create поле "client" может быть именем нового клиента — он будет создан автоматически.
3. Статусы только из списка: new, progress, review, done. "Срочно" — это urgent:true, а не статус.
4. Если запрос неоднозначный (непонятно, о какой задаче речь, или не хватает суммы) — верни "ops": [] и задай уточняющий вопрос в "reply".
5. Если пользователь просто спрашивает о данных ("сколько я заработал?") — верни "ops": [] и ответь по снимку.
6. Не удаляй ничего, если об этом не попросили явно.
7. В "reply" пиши по-человечески и коротко, без markdown и без JSON.

Снимок текущих данных CRM:
PROMPT;

$system .= "\n" . json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);

/* ── Вызов провайдера ─────────────────────────────────────── */
function httpPost(string $url, array $headers, array $payload): array {
  if (!function_exists('curl_init')) throw new RuntimeException('На сервере не включён PHP-модуль cURL.');
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
    CURLOPT_TIMEOUT => 45,
    CURLOPT_CONNECTTIMEOUT => 12,
  ]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  if ($raw === false) throw new RuntimeException('Сеть недоступна: ' . $err);
  $decoded = json_decode((string)$raw, true);
  if (!is_array($decoded)) throw new RuntimeException('Провайдер вернул не JSON (HTTP ' . $code . ').');
  if ($code >= 400) {
    $msg = $decoded['error']['message'] ?? ($decoded['message'] ?? 'HTTP ' . $code);
    throw new RuntimeException('Провайдер: ' . $msg);
  }
  return $decoded;
}

try {
  if ($provider === 'gemini') {
    $model = $model ?: 'gemini-2.0-flash';
    $contents = [];
    foreach ($history as $h) {
      $role = ($h['role'] ?? '') === 'assistant' ? 'model' : 'user';
      $contents[] = ['role' => $role, 'parts' => [['text' => (string)($h['text'] ?? '')]]];
    }
    $contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . urlencode($key);
    $result = httpPost($url, [], [
      'systemInstruction' => ['parts' => [['text' => $system]]],
      'contents' => $contents,
      'generationConfig' => ['temperature' => 0.2, 'responseMimeType' => 'application/json'],
    ]);
    $text = (string)($result['candidates'][0]['content']['parts'][0]['text'] ?? '');
  } else {
    /* OpenAI-совместимые: groq, openrouter, custom (Ollama, LM Studio, любой прокси) */
    $endpoints = [
      'groq' => ['https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile'],
      'openrouter' => ['https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3.3-70b-instruct:free'],
    ];
    if ($provider === 'custom') {
      if ($baseUrl === '') throw new RuntimeException('Для provider=custom заполни ai.base_url в config.php');
      $url = rtrim($baseUrl, '/') . '/chat/completions';
      $model = $model ?: 'llama3.1';
    } else {
      if (!isset($endpoints[$provider])) throw new RuntimeException('Неизвестный провайдер: ' . $provider);
      [$url, $default] = $endpoints[$provider];
      $model = $model ?: $default;
    }
    $messages = [['role' => 'system', 'content' => $system]];
    foreach ($history as $h) {
      $messages[] = ['role' => ($h['role'] ?? '') === 'assistant' ? 'assistant' : 'user', 'content' => (string)($h['text'] ?? '')];
    }
    $messages[] = ['role' => 'user', 'content' => $message];
    $headers = ['Authorization: Bearer ' . $key];
    if ($provider === 'openrouter') $headers[] = 'X-Title: PELENEV CRM';
    $payload = ['model' => $model, 'messages' => $messages, 'temperature' => 0.2];
    try {
      $result = httpPost($url, $headers, $payload + ['response_format' => ['type' => 'json_object']]);
    } catch (RuntimeException $e) {
      /* Часть моделей (особенно бесплатных на OpenRouter) не умеет json_object — повторяем без него */
      if (!str_contains(mb_strtolower($e->getMessage()), 'response_format') && !str_contains(mb_strtolower($e->getMessage()), 'json')) throw $e;
      $result = httpPost($url, $headers, $payload);
    }
    $text = (string)($result['choices'][0]['message']['content'] ?? '');
  }

  /* Модель иногда оборачивает JSON в ```json — вырезаем */
  $text = trim($text);
  if (str_starts_with($text, '```')) {
    $text = preg_replace('/^```[a-z]*\s*|\s*```$/i', '', $text) ?? $text;
  }
  $parsed = json_decode($text, true);
  if (!is_array($parsed)) {
    $start = strpos($text, '{');
    $end = strrpos($text, '}');
    if ($start !== false && $end !== false && $end > $start) $parsed = json_decode(substr($text, $start, $end - $start + 1), true);
  }
  if (!is_array($parsed)) aiJson(502, ['error' => 'Модель вернула не JSON. Попробуй переформулировать.']);

  $allowed = ['task.create','task.update','task.pay','task.delete','client.create','client.update','client.delete','vietnam.deposit','vietnam.expense','vietnam.delete','goal.update'];
  $ops = [];
  foreach ((array)($parsed['ops'] ?? []) as $op) {
    if (is_array($op) && in_array((string)($op['op'] ?? ''), $allowed, true)) $ops[] = $op;
  }
  aiJson(200, [
    'reply' => (string)($parsed['reply'] ?? 'Готово.'),
    'ops' => array_slice($ops, 0, 25),
  ]);
} catch (Throwable $error) {
  error_log('CRM agent: ' . $error->getMessage());
  aiJson(502, ['error' => $error->getMessage()]);
}
