-- Add role column to users table for proper authorization
-- Default: 'user', reserved for admin: 'admin'
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Set existing admin user (by username) to admin role
UPDATE users SET role = 'admin' WHERE username = 'admin';

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
