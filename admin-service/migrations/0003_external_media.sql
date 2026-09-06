ALTER TABLE publications ADD COLUMN media_status TEXT NOT NULL DEFAULT 'unchecked'
  CHECK (media_status IN ('unchecked', 'available', 'unavailable'));
ALTER TABLE publications ADD COLUMN media_checked_at TEXT;
ALTER TABLE publications ADD COLUMN source_video_content_type TEXT;
ALTER TABLE publications ADD COLUMN source_video_content_length INTEGER CHECK (source_video_content_length IS NULL OR source_video_content_length >= 0);
ALTER TABLE publications ADD COLUMN source_video_etag TEXT;
ALTER TABLE publications ADD COLUMN source_cover_content_type TEXT;
ALTER TABLE publications ADD COLUMN source_cover_content_length INTEGER CHECK (source_cover_content_length IS NULL OR source_cover_content_length >= 0);
ALTER TABLE publications ADD COLUMN source_cover_etag TEXT;

CREATE INDEX IF NOT EXISTS publications_media_status_idx ON publications(media_status, media_checked_at DESC);

PRAGMA optimize;
