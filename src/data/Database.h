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
    void cleanup();
    QSqlDatabase database() const;

private:
    bool createTables();

private:
    QSqlDatabase m_db;
};