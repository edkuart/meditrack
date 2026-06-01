-- Enable trigram similarity and unaccent for fuzzy patient name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN index for fast trigram similarity on patient names (unaccented, lowercase)
CREATE INDEX IF NOT EXISTS patients_name_trgm
  ON patients USING GIN (
    unaccent(lower(first_name || ' ' || last_name)) gin_trgm_ops
  );
