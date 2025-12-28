#include "Database.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QFile>
#include <QStandardPaths>
#include <QDebug>

Database::Database(QObject *parent)
    : QObject(parent)
    , m_connectionName("SecScoreDB")
{
}

Database::~Database()
{
    if (m_db.isOpen()) {
        m_db.close();
    }
}

bool Database::initialize(const QString &dbPath)
{
    // Check if database file exists
    bool dbExists = QFile::exists(dbPath);
    qDebug() << "Database path:" << dbPath;
    qDebug() << "Database exists:" << dbExists;

    m_db = QSqlDatabase::addDatabase("QSQLITE", m_connectionName);
    m_db.setDatabaseName(dbPath);

    if (!m_db.open()) {
        qCritical() << "Failed to open database:" << m_db.lastError().text();
        return false;
    }

    qDebug() << "Database opened successfully";

    if (!dbExists) {
        qDebug() << "Creating new database schema";
        if (!createTables()) {
            return false;
        }
    } else {
        qDebug() << "Running database migrations";
        if (!runMigrations()) {
            qWarning() << "Some migrations failed, continuing...";
        }
    }

    return true;
}

bool Database::createTables()
{
    QSqlQuery query(m_db);

    // Students table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score REAL DEFAULT 0.0,
            extra_json TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    )")) {
        qCritical() << "Failed to create students table:" << query.lastError().text();
        return false;
    }

    // Groups table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            score REAL DEFAULT 0.0,
            extra_json TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    )")) {
        qCritical() << "Failed to create groups table:" << query.lastError().text();
        return false;
    }

    // Events table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type INTEGER NOT NULL,
            ref_id INTEGER NOT NULL,
            description TEXT,
            val_prev REAL,
            val_curr REAL,
            erased INTEGER DEFAULT 0,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            remote_id INTEGER,
            sync_state TEXT DEFAULT 'pending'
        )
    )")) {
        qCritical() << "Failed to create events table:" << query.lastError().text();
        return false;
    }

    // Reasons table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS reasons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            sort INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            score_delta REAL DEFAULT 0,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            sync_state TEXT DEFAULT 'pending'
        )
    )")) {
        qCritical() << "Failed to create reasons table:" << query.lastError().text();
        return false;
    }

    // Sync outbox table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS sync_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seq TEXT NOT NULL UNIQUE,
            payload_json TEXT NOT NULL,
            retries INTEGER DEFAULT 0,
            last_error TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    )")) {
        qCritical() << "Failed to create sync_outbox table:" << query.lastError().text();
        return false;
    }

    // Sync state table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    )")) {
        qCritical() << "Failed to create sync_state table:" << query.lastError().text();
        return false;
    }

    qDebug() << "All tables created successfully";
    return true;
}

bool Database::runMigrations()
{
    // TODO: Implement migration logic in later steps
    // For now, we'll just check if all required tables exist
    QSqlQuery query(m_db);
    query.exec("SELECT name FROM sqlite_master WHERE type='table'");

    QStringList requiredTables = {"students", "groups", "events", "reasons", "sync_outbox", "sync_state"};
    QStringList existingTables;

    while (query.next()) {
        existingTables << query.value(0).toString();
    }

    for (const QString &table : requiredTables) {
        if (!existingTables.contains(table)) {
            qWarning() << "Missing required table:" << table;
            return false;
        }
    }

    return true;
}
