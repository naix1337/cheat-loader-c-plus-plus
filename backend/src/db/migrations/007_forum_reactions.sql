CREATE TABLE IF NOT EXISTS forum_reaction_types (
    id VARCHAR(20) PRIMARY KEY,
    display_order INT DEFAULT 0,
    icon VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(20) REFERENCES forum_reaction_types(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id, user_id)
);

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS reaction_score INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_forum_reactions_post ON forum_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_reactions_user ON forum_reactions(user_id);

-- Seed reaction types
INSERT INTO forum_reaction_types (id, display_order, icon) VALUES
    ('like', 1, '👍'),
    ('love', 2, '❤️'),
    ('haha', 3, '😂'),
    ('wow', 4, '😮'),
    ('sad', 5, '😢'),
    ('angry', 6, '😡')
ON CONFLICT (id) DO NOTHING;
