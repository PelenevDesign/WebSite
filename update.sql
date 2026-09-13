-- ============================================================
-- PELENEV.DESIGN — update.sql
-- Миграция схемы БД для релиза «Журнал + редизайн страницы кейса».
-- Только структура (CREATE/ALTER). Никаких пользовательских данных.
--
-- ВАЖНО: выполнять этот файл вручную НЕ ОБЯЗАТЕЛЬНО. Приложение само
-- идемпотентно создаёт недостающие таблицы/колонку при первом обращении
-- (db.php: ensureBlogTables(), ensureProjectsBlocksColumn()) — это просто
-- страховка на случай, если вы предпочитаете накатить схему заранее вручную
-- через phpMyAdmin, до первого захода посетителя на сайт после обновления.
--
-- Все операторы безопасны для повторного запуска:
--   CREATE TABLE IF NOT EXISTS — не потревожит существующие таблицы.
--   ALTER TABLE ADD COLUMN — если колонка уже есть (приложение могло
--   создать её раньше вас), MySQL вернёт ошибку "Duplicate column name" —
--   это ожидаемо, просто пропустите этот один оператор и выполните остальные.
-- ============================================================

-- Кейсы: поле для блочного редактора статьи кейса (уже могло быть создано
-- приложением автоматически — тогда этот оператор безопасно завершится ошибкой).
ALTER TABLE cms_projects ADD COLUMN blocks LONGTEXT NULL AFTER description;

-- Кейсы: три плитки «Достижения проекта» на первом экране (значение/заголовок/пояснение).
-- Тоже создаётся приложением само при первом сохранении кейса.
ALTER TABLE cms_projects ADD COLUMN stats LONGTEXT NULL AFTER blocks;

-- Кейсы: описание выросло до 8–10 строк. Выполняйте, ТОЛЬКО если description
-- сейчас VARCHAR — иначе оператор не нужен (TEXT/LONGTEXT уже достаточно).
-- Приложение делает эту проверку само при сохранении кейса.
-- ALTER TABLE cms_projects MODIFY description TEXT NULL;

-- Журнал: категории (с поддержкой подкатегорий через parent_id)
CREATE TABLE IF NOT EXISTS cms_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL DEFAULT "",
  slug VARCHAR(80) NOT NULL DEFAULT "",
  parent_id INT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY slug (slug)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Журнал: теги
CREATE TABLE IF NOT EXISTS cms_tags (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL DEFAULT "",
  slug VARCHAR(60) NOT NULL DEFAULT "",
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY slug (slug)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Журнал: сами статьи
CREATE TABLE IF NOT EXISTS cms_articles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT "",
  slug VARCHAR(255) NOT NULL DEFAULT "",
  excerpt VARCHAR(500) NOT NULL DEFAULT "",
  cover VARCHAR(500) NOT NULL DEFAULT "",
  blocks LONGTEXT NULL,
  category_ids VARCHAR(500) NOT NULL DEFAULT "[]",
  tag_ids VARCHAR(500) NOT NULL DEFAULT "[]",
  author_name VARCHAR(120) NOT NULL DEFAULT "",
  author_avatar VARCHAR(500) NOT NULL DEFAULT "",
  author_bio VARCHAR(500) NOT NULL DEFAULT "",
  status VARCHAR(20) NOT NULL DEFAULT "draft",
  published_at DATETIME NULL,
  reading_time_min SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  seo_title VARCHAR(70) NOT NULL DEFAULT "",
  seo_description VARCHAR(160) NOT NULL DEFAULT "",
  canonical VARCHAR(500) NOT NULL DEFAULT "",
  og_image VARCHAR(500) NOT NULL DEFAULT "",
  meta_robots VARCHAR(40) NOT NULL DEFAULT "index,follow",
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY slug (slug)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Услуги: страницы /services/<slug>/ с редактированием через админку.
-- Таблица создаётся приложением автоматически при первом заходе в раздел
-- «Услуги»; этот оператор нужен, только если хотите накатить схему заранее.
-- Имена колонок в обратных кавычках: `lead` — зарезервированное слово MySQL 8.
-- Длинные поля сделаны TEXT: при utf8mb4 набор длинных VARCHAR упирается
-- в лимит строки InnoDB (8126 байт) и CREATE TABLE падает.
CREATE TABLE IF NOT EXISTS cms_services (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      `slug` VARCHAR(190) NOT NULL DEFAULT "",
      `title` VARCHAR(190) NOT NULL DEFAULT "",
      `badge` VARCHAR(120) NOT NULL DEFAULT "",
      `h1` VARCHAR(190) NOT NULL DEFAULT "",
      `service_type` VARCHAR(120) NOT NULL DEFAULT "",
      `cases_cat` VARCHAR(40) NOT NULL DEFAULT "",
      `cta_primary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `cta_secondary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `hero_primary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `hero_secondary_label` VARCHAR(120) NOT NULL DEFAULT "",
      `seo_title` VARCHAR(190) NOT NULL DEFAULT "",
      `meta_robots` VARCHAR(40) NOT NULL DEFAULT "index,follow",
      `status` VARCHAR(20) NOT NULL DEFAULT "published",
      `lead` TEXT NULL,
      `hero_image` TEXT NULL,
      `hero_video` TEXT NULL,
      `intro_title` TEXT NULL,
      `intro_text` TEXT NULL,
      `steps_title` TEXT NULL,
      `steps_text` TEXT NULL,
      `cases_title` TEXT NULL,
      `cta_title` TEXT NULL,
      `cta_text` TEXT NULL,
      `cta_primary_href` TEXT NULL,
      `cta_secondary_href` TEXT NULL,
      `seo_description` TEXT NULL,
      `og_image` TEXT NULL,
      `facts` LONGTEXT NULL,
      `works` LONGTEXT NULL,
      `steps` LONGTEXT NULL,
      `faq` LONGTEXT NULL,
      `benefits` LONGTEXT NULL,
      `reviews` LONGTEXT NULL,
      `calc` LONGTEXT NULL,
      `sort_order` INT NOT NULL DEFAULT 0,
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY `slug` (`slug`)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
