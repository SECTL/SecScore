#include "EventRepo.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QSqlRecord>
#include <QDebug>
#include <QDateTime>

EventRepo::EventRepo(QObject *parent)
    : QObject{parent}
{
}

QVariantMap EventRepo::create(const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare(R"(
        INSERT INTO events (type, ref_id, desc, val_prev, val_curr, timestamp, erased, remote_id, sync_state)
        VALUES (:type, :ref_id, :desc, :val_prev, :val_curr, :timestamp, 0, :remote_id, :sync_state)
    )");
    
    query.bindValue(":type", data.value("type"));
    query.bindValue(":ref_id", data.value("ref_id"));
    query.bindValue(":desc", data.value("desc"));
    query.bindValue(":val_prev", data.value("val_prev"));
    query.bindValue(":val_curr", data.value("val_curr"));
    query.bindValue(":timestamp", data.value("timestamp", QDateTime::currentSecsSinceEpoch()));
    query.bindValue(":remote_id", data.value("remote_id", ""));
    query.bindValue(":sync_state", data.value("sync_state", "pending"));

    if (!query.exec()) {
        qWarning() << "Failed to create event:" << query.lastError().text();
        return QVariantMap();
    }
    
    int id = query.lastInsertId().toInt();
    return getById(id);
}

bool EventRepo::update(int id, const QVariantMap &data)
{
    QStringList fields;
    for (auto it = data.begin(); it != data.end(); ++it) {
        if (it.key() != "id") {
            fields << QString("%1 = :%1").arg(it.key());
        }
    }

    if (fields.isEmpty()) return false;

    QSqlQuery query;
    query.prepare(QString("UPDATE events SET %1 WHERE id = :id").arg(fields.join(", ")));
    for (auto it = data.begin(); it != data.end(); ++it) {
        if (it.key() != "id") {
            query.bindValue(":" + it.key(), it.value());
        }
    }
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to update event:" << query.lastError().text();
        return false;
    }
    return true;
}

bool EventRepo::remove(int id)
{
    QSqlQuery query;
    // Soft delete usually, but here we might do hard delete or soft delete. 
    // Requirement says "erased" field exists.
    query.prepare("UPDATE events SET erased = 1, sync_state = 'pending' WHERE id = :id");
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to remove event:" << query.lastError().text();
        return false;
    }
    return true;
}

QVariantMap EventRepo::getById(int id)
{
    QSqlQuery query;
    query.prepare("SELECT * FROM events WHERE id = :id");
    query.bindValue(":id", id);

    if (query.exec() && query.next()) {
        QSqlRecord rec = query.record();
        QVariantMap result;
        for (int i = 0; i < rec.count(); ++i) {
            result[rec.fieldName(i)] = query.value(i);
        }
        return result;
    }
    return QVariantMap();
}

QVariantList EventRepo::getAll()
{
    QVariantList list;
    QSqlQuery q("SELECT * FROM events WHERE erased = 0 ORDER BY timestamp DESC");
    while (q.next()) {
        QSqlRecord rec = q.record();
        QVariantMap item;
        for (int i = 0; i < rec.count(); ++i) {
            item[rec.fieldName(i)] = q.value(i);
        }
        list << item;
    }
    return list;
}

QVariantList EventRepo::getByRefId(int type, int refId)
{
    QVariantList list;
    QSqlQuery query;
    query.prepare("SELECT * FROM events WHERE type = :type AND ref_id = :ref_id AND erased = 0 ORDER BY timestamp DESC");
    query.bindValue(":type", type);
    query.bindValue(":ref_id", refId);
    
    if (query.exec()) {
        while (query.next()) {
            QSqlRecord rec = query.record();
            QVariantMap item;
            for (int i = 0; i < rec.count(); ++i) {
                item[rec.fieldName(i)] = query.value(i);
            }
            list << item;
        }
    }
    return list;
}

QVariantList EventRepo::getRecent(int limit)
{
    QVariantList list;
    QSqlQuery query;
    query.prepare("SELECT * FROM events WHERE erased = 0 ORDER BY timestamp DESC LIMIT :limit");
    query.bindValue(":limit", limit);
    
    if (query.exec()) {
        while (query.next()) {
            QSqlRecord rec = query.record();
            QVariantMap item;
            for (int i = 0; i < rec.count(); ++i) {
                item[rec.fieldName(i)] = query.value(i);
            }
            list << item;
        }
    }
    return list;
}

int EventRepo::createWithId(int id, const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare(R"(
        INSERT INTO events (id, type, ref_id, desc, val_prev, val_curr, timestamp, erased, remote_id, sync_state)
        VALUES (:id, :type, :ref_id, :desc, :val_prev, :val_curr, :timestamp, :erased, :remote_id, :sync_state)
    )");
    
    query.bindValue(":id", id);
    query.bindValue(":type", data.value("type"));
    query.bindValue(":ref_id", data.value("ref_id"));
    query.bindValue(":desc", data.value("desc"));
    query.bindValue(":val_prev", data.value("val_prev"));
    query.bindValue(":val_curr", data.value("val_curr"));
    query.bindValue(":timestamp", data.value("timestamp"));
    query.bindValue(":erased", data.value("erased", 0));
    query.bindValue(":remote_id", data.value("remote_id", ""));
    query.bindValue(":sync_state", data.value("sync_state", "synced"));
    
    if (!query.exec()) {
        qWarning() << "Failed to create event with ID:" << query.lastError().text();
        return -1;
    }
    return id;
}
