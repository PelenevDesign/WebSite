CREATE TABLE IF NOT EXISTS cloud_folders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY cloud_folder_name (parent_id, name),
  KEY cloud_folder_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cloud_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  folder_id BIGINT UNSIGNED NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name CHAR(36) NOT NULL,
  mime_type VARCHAR(190) NOT NULL DEFAULT 'application/octet-stream',
  extension VARCHAR(32) NOT NULL DEFAULT '',
  size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  UNIQUE KEY cloud_storage_name (storage_name),
  KEY cloud_file_folder (folder_id),
  KEY cloud_file_name (original_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cloud_uploads (
  id CHAR(36) NOT NULL PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  storage_name CHAR(36) NOT NULL,
  mime_type VARCHAR(190) NOT NULL,
  extension VARCHAR(32) NOT NULL,
  total_size BIGINT UNSIGNED NOT NULL,
  chunk_size INT UNSIGNED NOT NULL,
  received_chunks INT UNSIGNED NOT NULL DEFAULT 0,
  folder_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  status ENUM('uploading','complete','cancelled') NOT NULL DEFAULT 'uploading',
  KEY cloud_upload_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
