-- ================================================================
-- Migración: Tablas para el Builder Visual de Workflows
-- ================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NOT NULL,
  name             VARCHAR(200) NOT NULL,
  trigger_type     VARCHAR(100) NOT NULL,
  nodes_json       JSON,
  edges_json       JSON,
  active           TINYINT(1) DEFAULT 1,
  created_by       INT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflow_jobs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NOT NULL,
  workflow_id      INT NOT NULL,
  record_type      VARCHAR(50),
  record_id        INT,
  current_node_id  VARCHAR(100),
  state_data       JSON,
  status           VARCHAR(20) DEFAULT 'pending', -- pending, sleeping, completed, failed
  execute_after    DATETIME,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
