#include "ReasonRepo.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QSqlRecord>
#include <QDebug>
#include <QDateTime>

ReasonRepo::ReasonRepo(QObject *parent)
    : QObject{parent}
{
}

bool ReasonRepo::create(const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare("INSERT INTO reasons (name, sort, enabled, updated_at, sync_state) VALUES (:name, :sort, :enabled, :updated_at, :sync_state)");
    query.bindValue(":name", data.value("name"));
    query.bindValue(":sort", data.value("sort", 0));
    query.bindValue(":enabled", data.value("enabled", 1));
    query.bindValue(":updated_at", QDateTime::currentSecsSinceEpoch());
    query.bindValue(":sync_state", data.value("sync_state", "local"));

    if (!query.exec()) {
        qWarning() << "Failed to create reason:" << query.lastError().text();
        return false;
    }
    return true;
}

bool ReasonRepo::update(int id, const QVariantMap &data)
{
    QStringList fields;
    for (auto it = data.begin(); it != data.end(); ++it) {
        fields << QString("%1 = :%1").arg(it.key());
    }
    fields << "updated_at = :updated_at";

    if (fields.isEmpty()) return false;

    QSqlQuery query;
    query.prepare(QString("UPDATE reasons SET %1 WHERE id = :id").arg(fields.join(", ")));
    for (auto it = data.begin(); it != data.end(); ++it) {
        query.bindValue(":" + it.key(), it.value());
    }
    query.bindValue(":updated_at", QDateTime::currentSecsSinceEpoch());
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to update reason:" << query.lastError().text();
        return false;
    }
    return true;
}

bool ReasonRepo::remove(int id)
{
    QSqlQuery query;
    query.prepare("DELETE FROM reasons WHERE id = :id");
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to remove reason:" << query.lastError().text();
        return false;
    }
    return true;
}

QVariantMap ReasonRepo::getById(int id)
{
    QSqlQuery query;
    query.prepare("SELECT * FROM reasons WHERE id = :id");
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

QVariantList ReasonRepo::getAll()
{
    QVariantList list;
    QSqlQuery q("SELECT * FROM reasons ORDER BY sort ASC, name ASC");
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

int ReasonRepo::createWithId(int id, const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare("INSERT INTO reasons (id, name, sort, enabled, updated_at, sync_state) VALUES (:id, :name, :sort, :enabled, :updated_at, :sync_state)");
    query.bindValue(":id", id);
    query.bindValue(":name", data.value("name"));
    query.bindValue(":sort", data.value("sort", 0));
    query.bindValue(":enabled", data.value("enabled", 1));
    query.bindValue(":updated_at", data.value("updated_at", QDateTime::currentSecsSinceEpoch()));
    query.bindValue(":sync_state", data.value("sync_state", "local"));

    if (!query.exec()) {
        qWarning() << "Failed to create reason with ID:" << query.lastError().text();
        return -1;
    }
    return id;
}
