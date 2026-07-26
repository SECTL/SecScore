CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_members (
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    sectl_user_id TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, sectl_user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_members_user
    ON class_members(sectl_user_id);

CREATE INDEX IF NOT EXISTS idx_classes_join_code
    ON classes(join_code);
