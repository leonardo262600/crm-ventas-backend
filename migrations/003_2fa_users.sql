-- ================================================================
-- Migración: Columnas para 2FA en usuarios
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tfa_secret VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tfa_enabled TINYINT(1) DEFAULT 0;
