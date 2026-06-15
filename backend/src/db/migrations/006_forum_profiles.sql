ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS post_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS forum_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    old_content TEXT NOT NULL,
    edited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_edit_history_post ON forum_edit_history(post_id, edited_at DESC);
