CREATE TABLE IF NOT EXISTS account_snapshots (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
