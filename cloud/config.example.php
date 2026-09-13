<?php
declare(strict_types=1);

/* Скопируйте в cloud/config.php (без .example) и подставьте реальные
   значения. cloud/config.php никогда не попадает в git. */
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'DATABASE_NAME',
    'user' => 'DATABASE_USER',
    'password' => 'DATABASE_PASSWORD',
    'charset' => 'utf8mb4',
  ],
  'password_hash' => '',
  'storage_path' => dirname(__DIR__, 2) . '/cloud-storage',
  'storage_limit' => 8 * 1024 * 1024 * 1024,
  'session_name' => 'pelenew_cloud',
  'chunk_size' => 10 * 1024 * 1024,
  'debug' => false,
];
