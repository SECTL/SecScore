pub const TABLE_STUDENTS: &str = "students";
pub const TABLE_REASONS: &str = "reasons";
pub const TABLE_SCORE_EVENTS: &str = "score_events";
pub const TABLE_SETTLEMENTS: &str = "settlements";
pub const TABLE_SETTINGS: &str = "settings";
pub const TABLE_TAGS: &str = "tags";
pub const TABLE_STUDENT_TAGS: &str = "student_tags";
pub const TABLE_REWARD_SETTINGS: &str = "reward_settings";
pub const TABLE_REWARD_REDEMPTIONS: &str = "reward_redemptions";

pub mod students {
    pub const TABLE: &str = "students";
    pub const ID: &str = "id";
    pub const NAME: &str = "name";
    pub const TAGS: &str = "tags";
    pub const SCORE: &str = "score";
    pub const REWARD_POINTS: &str = "reward_points";
    pub const EXTRA_JSON: &str = "extra_json";
    pub const CREATED_AT: &str = "created_at";
    pub const UPDATED_AT: &str = "updated_at";
}

pub mod reasons {
    pub const TABLE: &str = "reasons";
    pub const ID: &str = "id";
    pub const CONTENT: &str = "content";
    pub const CATEGORY: &str = "category";
    pub const DELTA: &str = "delta";
    pub const IS_SYSTEM: &str = "is_system";
    pub const UPDATED_AT: &str = "updated_at";
}

pub mod score_events {
    pub const TABLE: &str = "score_events";
    pub const ID: &str = "id";
    pub const UUID: &str = "uuid";
    pub const STUDENT_NAME: &str = "student_name";
    pub const REASON_CONTENT: &str = "reason_content";
    pub const DELTA: &str = "delta";
    pub const VAL_PREV: &str = "val_prev";
    pub const VAL_CURR: &str = "val_curr";
    pub const EVENT_TIME: &str = "event_time";
    pub const SETTLEMENT_ID: &str = "settlement_id";
}

pub mod settlements {
    pub const TABLE: &str = "settlements";
    pub const ID: &str = "id";
    pub const START_TIME: &str = "start_time";
    pub const END_TIME: &str = "end_time";
    pub const CREATED_AT: &str = "created_at";
}

pub mod settings {
    pub const TABLE: &str = "settings";
    pub const KEY: &str = "key";
    pub const VALUE: &str = "value";
}

pub mod tags {
    pub const TABLE: &str = "tags";
    pub const ID: &str = "id";
    pub const NAME: &str = "name";
    pub const CREATED_AT: &str = "created_at";
    pub const UPDATED_AT: &str = "updated_at";
}

pub mod student_tags {
    pub const TABLE: &str = "student_tags";
    pub const ID: &str = "id";
    pub const STUDENT_ID: &str = "student_id";
    pub const TAG_ID: &str = "tag_id";
    pub const CREATED_AT: &str = "created_at";
}

pub mod reward_settings {
    pub const TABLE: &str = "reward_settings";
    pub const ID: &str = "id";
    pub const NAME: &str = "name";
    pub const COST_POINTS: &str = "cost_points";
    pub const CREATED_AT: &str = "created_at";
    pub const UPDATED_AT: &str = "updated_at";
}

pub mod reward_redemptions {
    pub const TABLE: &str = "reward_redemptions";
    pub const ID: &str = "id";
    pub const UUID: &str = "uuid";
    pub const STUDENT_NAME: &str = "student_name";
    pub const REWARD_ID: &str = "reward_id";
    pub const REWARD_NAME: &str = "reward_name";
    pub const COST_POINTS: &str = "cost_points";
    pub const REDEEMED_AT: &str = "redeemed_at";
}

pub fn get_create_students_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            score INTEGER DEFAULT 0,
            reward_points INTEGER DEFAULT 0,
            extra_json TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS students (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            score INTEGER DEFAULT 0,
            reward_points INTEGER DEFAULT 0,
            extra_json TEXT,
            created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_reward_settings_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS reward_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            cost_points INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS reward_settings (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            cost_points INTEGER NOT NULL,
            created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_reward_redemptions_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS reward_redemptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            student_name TEXT NOT NULL,
            reward_id INTEGER NOT NULL,
            reward_name TEXT NOT NULL,
            cost_points INTEGER NOT NULL,
            redeemed_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS reward_redemptions (
            id SERIAL PRIMARY KEY,
            uuid TEXT NOT NULL UNIQUE,
            student_name TEXT NOT NULL,
            reward_id INTEGER NOT NULL,
            reward_name TEXT NOT NULL,
            cost_points INTEGER NOT NULL,
            redeemed_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_reasons_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS reasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT '其他',
            delta INTEGER NOT NULL,
            is_system INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS reasons (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT '其他',
            delta INTEGER NOT NULL,
            is_system INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_score_events_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS score_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,
            student_name TEXT NOT NULL,
            reason_content TEXT NOT NULL,
            delta INTEGER NOT NULL,
            val_prev INTEGER NOT NULL,
            val_curr INTEGER NOT NULL,
            event_time TEXT DEFAULT (datetime('now', 'localtime')),
            settlement_id INTEGER
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS score_events (
            id SERIAL PRIMARY KEY,
            uuid TEXT NOT NULL UNIQUE,
            student_name TEXT NOT NULL,
            reason_content TEXT NOT NULL,
            delta INTEGER NOT NULL,
            val_prev INTEGER NOT NULL,
            val_curr INTEGER NOT NULL,
            event_time TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            settlement_id INTEGER
        )
        "#
        .to_string()
    }
}

pub fn get_create_settlements_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS settlements (
            id SERIAL PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_settings_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        "#
        .to_string()
    }
}

pub fn get_create_tags_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS tags (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
        )
        "#
        .to_string()
    }
}

pub fn get_create_student_tags_table_sql(sqlite: bool) -> String {
    if sqlite {
        r#"
        CREATE TABLE IF NOT EXISTS student_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE (student_id, tag_id)
        )
        "#
        .to_string()
    } else {
        r#"
        CREATE TABLE IF NOT EXISTS student_tags (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE (student_id, tag_id)
        )
        "#
        .to_string()
    }
}

pub fn get_create_index_reward_settings_name_sql(_sqlite: bool) -> String {
    "CREATE INDEX IF NOT EXISTS idx_reward_settings_name ON reward_settings(name)".to_string()
}

pub fn get_create_index_reward_redemptions_student_name_sql(_sqlite: bool) -> String {
    "CREATE INDEX IF NOT EXISTS idx_reward_redemptions_student_name ON reward_redemptions(student_name)"
        .to_string()
}

pub fn get_create_index_reward_redemptions_reward_id_sql(_sqlite: bool) -> String {
    "CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_id ON reward_redemptions(reward_id)"
        .to_string()
}

pub fn get_create_index_score_events_settlement_id_sql(sqlite: bool) -> String {
    if sqlite {
        "CREATE INDEX IF NOT EXISTS idx_score_events_settlement_id ON score_events(settlement_id)"
            .to_string()
    } else {
        "CREATE INDEX IF NOT EXISTS idx_score_events_settlement_id ON score_events(settlement_id)"
            .to_string()
    }
}

pub fn get_create_index_score_events_student_name_sql(sqlite: bool) -> String {
    if sqlite {
        "CREATE INDEX IF NOT EXISTS idx_score_events_student_name ON score_events(student_name)"
            .to_string()
    } else {
        "CREATE INDEX IF NOT EXISTS idx_score_events_student_name ON score_events(student_name)"
            .to_string()
    }
}

pub fn get_create_index_reasons_content_sql(sqlite: bool) -> String {
    if sqlite {
        "CREATE INDEX IF NOT EXISTS idx_reasons_content ON reasons(content)".to_string()
    } else {
        "CREATE INDEX IF NOT EXISTS idx_reasons_content ON reasons(content)".to_string()
    }
}
