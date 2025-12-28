#pragma once

#include <QObject>
#include <QSqlDatabase>

class Database : public QObject
{
    Q_OBJECT

public:
    explicit Database(QObject *parent = nullptr);
    ~Database();

    bool initialize(const QString &dbPath);
    QSqlDatabase database() const { return m_db; }

private:
    bool createTables();
    bool runMigrations();

private:
    QSqlDatabase m_db;
    QString m_connectionName;
};
