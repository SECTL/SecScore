#include "Database.h"
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QSqlError>
#include <QDebug>
#include <QDir>

Database::Database(QObject *parent)
    : QObject{parent}
{
}

Database::~Database()
{
    cleanup();
}

bool Database::initialize(const QString &dbPath)
{
    m_db = QSqlDatabase::addDatabase("QSQLITE");
    m_db.setDatabaseName(dbPath);

    if (!m_db.open()) {
        qCritical() << "Failed to open database:" << m_db.lastError().text();
        return false;
    }

    if (!createTables()) {
        qCritical() << "Failed to create database tables";
        return false;
    }

    return true;
}

void Database::cleanup()
{
    if (m_db.isOpen()) {
        m_db.close();
    }
}

bool Database::createTables()
{
    QSqlQuery query;
    
    // Students table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            score REAL DEFAULT 0,
            extra_json TEXT DEFAULT '{}'
        )
    )")) {
        qCritical() << "Failed to create students table:" << query.lastError().text();
        return false;
    }

    // Groups table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data_json TEXT DEFAULT '{}'
        )
    )")) {
        qCritical() << "Failed to create groups table:" << query.lastError().text();
        return false;
    }

    // Events table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type INTEGER NOT NULL, -- 1=Student, 2=Group
            ref_id INTEGER NOT NULL,
            desc TEXT NOT NULL,
            val_prev REAL,
            val_curr REAL,
            erased INTEGER DEFAULT 0,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            remote_id INTEGER,
            sync_state TEXT DEFAULT 'local'
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
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            sync_state TEXT DEFAULT 'local'
        )
    )")) {
        qCritical() << "Failed to create reasons table:" << query.lastError().text();
        return false;
    }

    // Sync outbox table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS sync_outbox (
            seq TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            retries INTEGER DEFAULT 0,
            last_error TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    )")) {
        qCritical() << "Failed to create sync_outbox table:" << query.lastError().text();
        return false;
    }

    // Sync state table
    if (!query.exec(R"(
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    )")) {
        qCritical() << "Failed to create sync_state table:" << query.lastError().text();
        return false;
    }

    // Insert default reasons
    if (!query.exec(R"(
        INSERT OR IGNORE INTO reasons (name, sort, enabled) VALUES 
        ('课堂表现', 1, 1),
        ('作业完成', 2, 1),
        ('小组合作', 3, 1),
        ('创新思维', 4, 1),
        ('纪律遵守', 5, 1)
    )")) {
        qWarning() << "Failed to insert default reasons:" << query.lastError().text();
    }

    return true;
}

QSqlDatabase Database::database() const
{
    return m_db;
}