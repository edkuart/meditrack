-- Migration: location Google Maps metadata

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS google_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS latitude real,
  ADD COLUMN IF NOT EXISTS longitude real,
  ADD COLUMN IF NOT EXISTS maps_url text;

CREATE INDEX IF NOT EXISTS locations_google_place_idx ON locations(google_place_id);
