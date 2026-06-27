-- ================================================================
-- Migración: Nuevas columnas para firma digital y configuración
-- Ejecutar una sola vez sobre la BD ventas_crm
-- ================================================================

-- 1. Columnas de firma digital en cotizaciones
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accept_token VARCHAR(36) UNIQUE,
  ADD COLUMN IF NOT EXISTS signer_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS signer_ip    VARCHAR(45),
  ADD COLUMN IF NOT EXISTS signed_at    DATETIME,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- Generar tokens para cotizaciones existentes que no tengan uno
UPDATE quotes SET accept_token = UUID() WHERE accept_token IS NULL;

-- 2. Tabla de configuración por tenant
CREATE TABLE IF NOT EXISTS tenant_settings (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NOT NULL UNIQUE,
  company_name     VARCHAR(200),
  company_email    VARCHAR(200),
  company_phone    VARCHAR(50),
  company_address  TEXT,
  company_website  VARCHAR(200),
  company_ruc      VARCHAR(20),
  smtp_host        VARCHAR(200),
  smtp_port        VARCHAR(10) DEFAULT '587',
  smtp_secure      TINYINT(1) DEFAULT 0,
  smtp_user        VARCHAR(200),
  smtp_pass        VARCHAR(200),
  smtp_from        VARCHAR(200),
  currency         VARCHAR(10) DEFAULT 'PEN',
  currency_symbol  VARCHAR(5)  DEFAULT 'S/',
  quote_footer     TEXT,
  logo_url         TEXT,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Soporte de descuentos por volumen en listas de precios
ALTER TABLE price_list_items
  ADD COLUMN IF NOT EXISTS volume_tiers JSON COMMENT 
    'Array de escalones: [{"min_qty":10,"discount_pct":5},{"min_qty":50,"discount_pct":10}]';
