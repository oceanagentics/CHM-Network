PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

BEGIN;

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (
    kind IN ('country', 'organization', 'system')
  ),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  parent_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  country_code TEXT CHECK (country_code IS NULL OR LENGTH(country_code) = 3),
  institution_type TEXT,
  technology_family TEXT,
  treaty_role TEXT,
  operational_role TEXT,
  confidentiality_class TEXT NOT NULL DEFAULT 'public' CHECK (
    confidentiality_class IN ('public', 'restricted', 'confidential')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'planned', 'speculative', 'deprecated')
  ),
  maturity TEXT NOT NULL DEFAULT 'production' CHECK (
    maturity IN ('production', 'pilot', 'concept')
  ),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (
    confidence >= 0.0 AND confidence <= 1.0
  ),
  description TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json)),
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (
    type IN ('part_of', 'operates', 'publishes_to', 'syncs_to')
  ),
  interface_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (
    direction IN ('inbound', 'outbound', 'bidirectional')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'planned', 'speculative', 'deprecated')
  ),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (
    confidence >= 0.0 AND confidence <= 1.0
  ),
  access_modality TEXT CHECK (
    access_modality IN ('hosted', 'federated_query', 'metadata_link', 'derived_product')
  ),
  interoperability_mode TEXT CHECK (
    interoperability_mode IN ('link', 'harvest', 'api_federation')
  ),
  integration_tier TEXT CHECK (
    integration_tier IN ('tier_1', 'tier_2', 'tier_3')
  ),
  note TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json)),
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (source_entity_id <> target_entity_id)
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  local_path TEXT,
  publisher TEXT,
  published_at TEXT,
  accessed_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS entity_sources (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL,
  excerpt TEXT,
  confidence_override REAL CHECK (
    confidence_override IS NULL OR
    (confidence_override >= 0.0 AND confidence_override <= 1.0)
  ),
  PRIMARY KEY (entity_id, source_id, claim_type)
);

CREATE TABLE IF NOT EXISTS relationship_sources (
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL,
  excerpt TEXT,
  confidence_override REAL CHECK (
    confidence_override IS NULL OR
    (confidence_override >= 0.0 AND confidence_override <= 1.0)
  ),
  PRIMARY KEY (relationship_id, source_id, claim_type)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, tag_id)
);

CREATE TABLE IF NOT EXISTS relationship_tags (
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (relationship_id, tag_id)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(filter_json)),
  layout_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout_json)),
  style_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(style_json)),
  created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_country_kind ON entities(country_code, kind);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type_status ON relationships(type, status);
CREATE INDEX IF NOT EXISTS idx_relationships_interface ON relationships(interface_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_integration ON relationships(access_modality, interoperability_mode, integration_tier);

CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);

CREATE TRIGGER IF NOT EXISTS trg_entities_updated_at
AFTER UPDATE ON entities
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE entities
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_relationships_updated_at
AFTER UPDATE ON relationships
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE relationships
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_saved_views_updated_at
AFTER UPDATE ON saved_views
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE saved_views
  SET updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

COMMIT;
