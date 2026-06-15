-- User Groups
CREATE TABLE IF NOT EXISTS forum_user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group membership
CREATE TABLE IF NOT EXISTS forum_user_group_members (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES forum_user_groups(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, group_id)
);

-- Permission definitions
CREATE TABLE IF NOT EXISTS forum_permissions (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    default_value VARCHAR(10) DEFAULT 'deny'
);

-- Group-level permissions
CREATE TABLE IF NOT EXISTS forum_group_permissions (
    group_id UUID REFERENCES forum_user_groups(id) ON DELETE CASCADE,
    permission_id VARCHAR(50) REFERENCES forum_permissions(id),
    value VARCHAR(10) NOT NULL,
    PRIMARY KEY (group_id, permission_id)
);

-- Per-category permission overrides
CREATE TABLE IF NOT EXISTS forum_category_permissions (
    category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
    group_id UUID REFERENCES forum_user_groups(id) ON DELETE CASCADE,
    permission_id VARCHAR(50) REFERENCES forum_permissions(id),
    value VARCHAR(10) NOT NULL DEFAULT 'inherit',
    PRIMARY KEY (category_id, group_id, permission_id)
);

-- Seed permission definitions
INSERT INTO forum_permissions (id, name, default_value) VALUES
    ('view_forum', 'View forum', 'allow'),
    ('create_thread', 'Create threads', 'allow'),
    ('reply_post', 'Reply to posts', 'allow'),
    ('upload_attachment', 'Upload attachments', 'allow'),
    ('edit_own_post', 'Edit own posts', 'allow'),
    ('delete_own_post', 'Delete own posts', 'allow'),
    ('edit_any_post', 'Edit any post', 'deny'),
    ('delete_any_post', 'Delete any post', 'deny'),
    ('pin_thread', 'Pin threads', 'deny'),
    ('lock_thread', 'Lock threads', 'deny'),
    ('move_thread', 'Move threads', 'deny'),
    ('view_reports', 'View reports', 'deny'),
    ('ban_users', 'Ban users', 'deny'),
    ('warn_users', 'Warn users', 'deny')
ON CONFLICT (id) DO NOTHING;

-- Seed default groups
INSERT INTO forum_user_groups (name, display_order, is_banned) VALUES
    ('Administrator', 1, FALSE),
    ('Moderator', 2, FALSE),
    ('Registered', 3, FALSE),
    ('Banned', 4, TRUE)
ON CONFLICT DO NOTHING;

-- Seed admin group permissions (all allowed)
INSERT INTO forum_group_permissions (group_id, permission_id, value)
SELECT g.id, p.id, 'allow'
FROM forum_user_groups g, forum_permissions p
WHERE g.name = 'Administrator'
ON CONFLICT DO NOTHING;

-- Seed registered user basic permissions
INSERT INTO forum_group_permissions (group_id, permission_id, value)
SELECT g.id, p.id, 'allow'
FROM forum_user_groups g, forum_permissions p
WHERE g.name = 'Registered' AND p.id IN ('view_forum', 'create_thread', 'reply_post', 'edit_own_post', 'delete_own_post')
ON CONFLICT DO NOTHING;

-- Assign all existing users to Registered group
INSERT INTO forum_user_group_members (user_id, group_id, is_primary)
SELECT u.id, g.id, TRUE
FROM users u, forum_user_groups g
WHERE g.name = 'Registered'
ON CONFLICT DO NOTHING;

-- Assign admin user to Admin group
INSERT INTO forum_user_group_members (user_id, group_id, is_primary)
SELECT u.id, g.id, TRUE
FROM users u, forum_user_groups g
WHERE u.role = 'admin' AND g.name = 'Administrator'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_forum_group_members_user ON forum_user_group_members(user_id);
