CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    sectl_user_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, id)
);

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    group_name TEXT,
    extra_json JSONB,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations (
    op_id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    device_id UUID NOT NULL,
    client_seq BIGINT NOT NULL,
    lamport BIGINT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    operation_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    client_created_at TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'applied',
    schema_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (account_id, device_id, client_seq)
);

CREATE TABLE IF NOT EXISTS account_changes (
    change_seq BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id),
    operation_id UUID NOT NULL UNIQUE REFERENCES operations(op_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES operations(op_id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    student_id UUID NOT NULL,
    score_delta INTEGER NOT NULL DEFAULT 0,
    reward_delta INTEGER NOT NULL DEFAULT 0,
    effective_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS student_balances (
    account_id UUID NOT NULL REFERENCES accounts(id),
    student_id UUID NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    reward_points INTEGER NOT NULL DEFAULT 0,
    projection_version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_operations_pull
    ON operations(account_id, op_id);
CREATE INDEX IF NOT EXISTS idx_changes_pull
    ON account_changes(account_id, change_seq);
CREATE INDEX IF NOT EXISTS idx_students_account
    ON students(account_id, deleted_at);

