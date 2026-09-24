<?php
declare(strict_types=1);

/* Скопируйте этот файл в config.php (без .example) и подставьте реальные
   значения. config.php никогда не попадает в git — он в .gitignore. */
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'DATABASE_NAME',
    'user' => 'DATABASE_USER',
    'password' => 'DATABASE_PASSWORD',
    'charset' => 'utf8mb4',
  ],

  'site_url' => 'https://pelenevdesign.ru',
  'lead_email' => 'you@example.com',

  'admin_password_hash' => '',
  'admin_password' => 'CHANGE_ME',

  /* Стартовый пароль админки онлайн-школы (/school/admin/). */
  'school_admin_password' => 'CHANGE_ME',
];
