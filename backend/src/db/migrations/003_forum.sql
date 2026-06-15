-- Forum tables — categories, threads, and posts
-- Integrates with users table for authorship.

CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE NOT NULL,
    pinned BOOLEAN DEFAULT FALSE,
    locked BOOLEAN DEFAULT FALSE,
    views INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category
    ON forum_threads (category_id, pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread
    ON forum_posts (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_forum_categories_sort
    ON forum_categories (sort_order ASC);

-- Seed initial categories
INSERT INTO forum_categories (name, slug, description, sort_order)
VALUES
    ('General Discussion', 'general-discussion', 'Talk about anything related to the project', 1),
    ('Support', 'support', 'Get help with the client and services', 2),
    ('Feature Requests', 'feature-requests', 'Suggest new features and improvements', 3),
    ('Announcements', 'announcements', 'Official announcements from the team', 4)
ON CONFLICT (slug) DO NOTHING;
