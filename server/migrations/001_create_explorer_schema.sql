BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  title text NOT NULL,
  source_type text NOT NULL,
  url text,
  local_path text,
  publisher text,
  published_at text,
  accessed_at text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

CREATE TABLE IF NOT EXISTS nodes (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('country', 'organization', 'system')),
  name text NOT NULL,
  country_code text CHECK (country_code IS NULL OR length(country_code) = 3),
  subtype text,
  url text,
  summary text,
  description text,
  record_depth text NOT NULL DEFAULT 'stub' CHECK (record_depth IN ('stub', 'thin', 'rich')),
  review_state text NOT NULL DEFAULT 'unreviewed' CHECK (review_state IN ('unreviewed', 'agent_researched', 'needs_human_review', 'human_reviewed', 'needs_revision')),
  review_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  properties_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_country_kind ON nodes(country_code, kind);
CREATE INDEX IF NOT EXISTS idx_nodes_record_depth ON nodes(record_depth);
CREATE INDEX IF NOT EXISTS idx_nodes_review_state ON nodes(review_state);

DROP TRIGGER IF EXISTS trg_nodes_updated_at ON nodes;
CREATE TRIGGER trg_nodes_updated_at
BEFORE UPDATE ON nodes
FOR EACH ROW
WHEN (NEW.updated_at = OLD.updated_at)
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS edges (
  id text PRIMARY KEY,
  source_node_id text NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id text NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('governs', 'operates', 'part_of', 'publishes_to', 'syncs_to')),
  note text,
  properties_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_node_id <> target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

DROP TRIGGER IF EXISTS trg_edges_updated_at ON edges;
CREATE TRIGGER trg_edges_updated_at
BEFORE UPDATE ON edges
FOR EACH ROW
WHEN (NEW.updated_at = OLD.updated_at)
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS ryu_routes (
  id text PRIMARY KEY,
  node_id text NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  status text NOT NULL,
  mode text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  target text,
  upstream text,
  format text,
  contract_ref text,
  caveat text,
  properties_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ryu_routes_node ON ryu_routes(node_id, priority);
CREATE INDEX IF NOT EXISTS idx_ryu_routes_status ON ryu_routes(status);
CREATE INDEX IF NOT EXISTS idx_ryu_routes_mode ON ryu_routes(mode);

DROP TRIGGER IF EXISTS trg_ryu_routes_updated_at ON ryu_routes;
CREATE TRIGGER trg_ryu_routes_updated_at
BEFORE UPDATE ON ryu_routes
FOR EACH ROW
WHEN (NEW.updated_at = OLD.updated_at)
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS saved_views (
  id text PRIMARY KEY,
  name text NOT NULL,
  scope text NOT NULL,
  filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  style_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS trg_saved_views_updated_at ON saved_views;
CREATE TRIGGER trg_saved_views_updated_at
BEFORE UPDATE ON saved_views
FOR EACH ROW
WHEN (NEW.updated_at = OLD.updated_at)
EXECUTE FUNCTION set_updated_at_timestamp();

DO $$
BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_read') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudsqlsuperuser') THEN
      REVOKE cloudsqlsuperuser FROM explorer_read;
    END IF;

    ALTER ROLE explorer_read NOCREATEDB NOCREATEROLE;

    GRANT CONNECT ON DATABASE explorer TO explorer_read;
    REVOKE CREATE ON DATABASE explorer FROM explorer_read;
    REVOKE CREATE ON SCHEMA public FROM explorer_read;
    GRANT USAGE ON SCHEMA public TO explorer_read;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO explorer_read;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO explorer_read;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_write') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudsqlsuperuser') THEN
      REVOKE cloudsqlsuperuser FROM explorer_write;
    END IF;

    ALTER ROLE explorer_write NOCREATEDB NOCREATEROLE;

    GRANT CONNECT ON DATABASE explorer TO explorer_write;
    REVOKE CREATE ON DATABASE explorer FROM explorer_write;
    REVOKE CREATE ON SCHEMA public FROM explorer_write;
    GRANT USAGE ON SCHEMA public TO explorer_write;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO explorer_write;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO explorer_write;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'explorer_migration') THEN
    GRANT CONNECT ON DATABASE explorer TO explorer_migration;
    GRANT USAGE, CREATE ON SCHEMA public TO explorer_migration;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO explorer_migration;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO explorer_migration;
  END IF;
END $$;

COMMIT;
