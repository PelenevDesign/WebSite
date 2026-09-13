<?php
/* Единая точка входа для услуг, созданных в админке.
   Включается правилом в .htaccess:
     RewriteRule ^services/([a-z0-9-]+)/?$ /services/_router.php?slug=$1 [L,QSA]
   С ним новая услуга из админки открывается сразу, без создания каталога. */
$slug = preg_replace('/[^a-z0-9-]/', '', (string)($_GET['slug'] ?? ''));
require __DIR__ . '/_template.php';
