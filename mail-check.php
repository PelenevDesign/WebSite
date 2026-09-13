<?php
declare(strict_types=1);
/* Разовая проверка отправки писем. Загрузить на хостинг, открыть
   /mail-check.php?key=СЕКРЕТ, посмотреть отчёт — и УДАЛИТЬ файл.

   Письмо уходит только на адрес из config()['lead_email'], произвольного
   получателя задать нельзя: скрипт не может стать открытым релеем. */

$KEY = 'pd-mail-check';           // поменяйте перед загрузкой
if (($_GET['key'] ?? '') !== $KEY) { http_response_code(404); exit('Not found'); }

require __DIR__ . '/db.php';
header('Content-Type: text/plain; charset=utf-8');

$to   = (string)(config()['lead_email'] ?? '');
$host = preg_replace('/[^A-Za-z0-9.\-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
$from = 'noreply@' . $host;

echo "Получатель (lead_email): " . ($to !== '' ? $to : '— НЕ ЗАДАН в config.php') . "\n";
echo "Отправитель (From):      {$from}\n";
echo "Функция mail():          " . (function_exists('mail') ? 'доступна' : 'ОТКЛЮЧЕНА на хостинге') . "\n";
echo "sendmail_path:           " . (ini_get('sendmail_path') ?: '— не задан') . "\n\n";

if ($to === '' || !function_exists('mail')) { echo "Отправка невозможна — см. выше.\n"; exit; }

$subject = '=?UTF-8?B?' . base64_encode('Проверка почты — PELENEV.DESIGN') . '?=';
$body    = "Если вы читаете это письмо, отправка с сайта работает.\n\nВремя: " . date('d.m.Y H:i') . "\nХост: {$host}\n";
$headers = ['From: PELENEV.DESIGN <' . $from . '>', 'Content-Type: text/plain; charset=utf-8', 'MIME-Version: 1.0'];

$sent = @mail($to, $subject, $body, implode("\r\n", $headers), '-f ' . $from);

echo $sent
  ? "Результат: mail() вернула УСПЕХ — письмо принято почтовым сервером.\n\n"
    . "Это НЕ гарантия доставки. Проверьте входящие и папку «Спам».\n"
    . "Если письма нет — почтовик отклонил его после приёма (чаще всего\n"
    . "из-за отсутствия SPF/DKIM для домена {$host}).\n"
  : "Результат: mail() вернула ОШИБКУ — письмо не принято.\n\n"
    . "Заявки при этом НЕ теряются: они сохраняются в базу и видны\n"
    . "в админке во вкладке «Заявки».\n";

echo "\nПосле проверки удалите этот файл с хостинга.\n";
