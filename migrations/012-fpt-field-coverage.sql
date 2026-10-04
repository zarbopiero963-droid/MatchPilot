CREATE TABLE IF NOT EXISTS fpt_field_coverage (
  dimension text NOT NULL CHECK (dimension IN ('global','dataset','league','season','period','team','normalized')),
  dimension_key text NOT NULL DEFAULT '',
  field_name text NOT NULL,
  rows_scoped bigint NOT NULL CHECK (rows_scoped >= 0),
  nonempty_rows bigint NOT NULL CHECK (nonempty_rows >= 0 AND nonempty_rows <= rows_scoped),
  coverage_ratio numeric(18,10),
  coverage_class text CHECK (coverage_class IS NULL OR coverage_class IN ('dense','sparse','always-empty')),
  coverage_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dimension, dimension_key, field_name)
);

CREATE INDEX IF NOT EXISTS fpt_field_coverage_field_idx
  ON fpt_field_coverage(dimension, field_name, coverage_ratio);

CREATE TABLE IF NOT EXISTS fpt_coverage_audit (
  audit_id integer PRIMARY KEY CHECK (audit_id = 1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  payload_mismatches integer NOT NULL,
  rollup_mismatches integer NOT NULL,
  class_mismatches integer NOT NULL,
  historical_team_unresolved integer NOT NULL,
  today_country_unresolved integer NOT NULL,
  class_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  tag_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
