CREATE TABLE IF NOT EXISTS forum_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content_type VARCHAR(30) NOT NULL,
    content_id UUID,
    action VARCHAR(30) NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_notifications_user ON forum_notifications(user_id, read, created_at DESC);
