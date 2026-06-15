-- Full-text search on forum_posts
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_forum_posts_search ON forum_posts USING GIN(search_vector);

CREATE OR REPLACE FUNCTION forum_posts_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('german', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forum_posts_search ON forum_posts;
CREATE TRIGGER trg_forum_posts_search
  BEFORE INSERT OR UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION forum_posts_search_update();

-- Full-text search on forum_threads (title)
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_forum_threads_search ON forum_threads USING GIN(search_vector);

CREATE OR REPLACE FUNCTION forum_threads_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('german', COALESCE(NEW.title, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forum_threads_search ON forum_threads;
CREATE TRIGGER trg_forum_threads_search
  BEFORE INSERT OR UPDATE ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION forum_threads_search_update();

-- Update existing rows
UPDATE forum_posts SET search_vector = to_tsvector('german', COALESCE(content, ''));
UPDATE forum_threads SET search_vector = to_tsvector('german', COALESCE(title, ''));
