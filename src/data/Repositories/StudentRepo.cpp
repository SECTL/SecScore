#include "StudentRepo.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QSqlRecord>
#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>

StudentRepo::StudentRepo(QObject *parent)
    : QObject(parent)
{
}

bool StudentRepo::create(const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare("INSERT INTO students (name, score, extra_json) VALUES (:name, :score, :extra_json)");
    query.bindValue(":name", data.value("name"));
    query.bindValue(":score", data.value("score", 0));
    
    QJsonObject extra = QJsonObject::fromVariantMap(data.value("extra_json").toMap());
    query.bindValue(":extra_json", QJsonDocument(extra).toJson(QJsonDocument::Compact));

    if (!query.exec()) {
        qWarning() << "Failed to create student:" << query.lastError().text();
        return false;
    }
    return true;
}

bool StudentRepo::update(int id, const QVariantMap &data)
{
    QStringList fields;
    if (data.contains("name")) fields << "name = :name";
    if (data.contains("score")) fields << "score = :score";
    if (data.contains("extra_json")) fields << "extra_json = :extra_json";

    if (fields.isEmpty()) return false;

    QSqlQuery query;
    query.prepare(QString("UPDATE students SET %1 WHERE id = :id").arg(fields.join(", ")));
    if (data.contains("name")) query.bindValue(":name", data.value("name"));
    if (data.contains("score")) query.bindValue(":score", data.value("score"));
    if (data.contains("extra_json")) {
        QJsonObject extra = QJsonObject::fromVariantMap(data.value("extra_json").toMap());
        query.bindValue(":extra_json", QJsonDocument(extra).toJson(QJsonDocument::Compact));
    }
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to update student:" << query.lastError().text();
        return false;
    }
    return true;
}

bool StudentRepo::remove(int id)
{
    QSqlQuery query;
    query.prepare("DELETE FROM students WHERE id = :id");
    query.bindValue(":id", id);

    if (!query.exec()) {
        qWarning() << "Failed to remove student:" << query.lastError().text();
        return false;
    }
    return true;
}

QVariantMap StudentRepo::getById(int id)
{
    QSqlQuery query;
    query.prepare("SELECT * FROM students WHERE id = :id");
    query.bindValue(":id", id);

    if (query.exec() && query.next()) {
        QSqlRecord rec = query.record();
        QVariantMap result;
        for (int i = 0; i < rec.count(); ++i) {
            if (rec.fieldName(i) == "extra_json") {
                result["extra_json"] = QJsonDocument::fromJson(query.value(i).toByteArray()).toVariant();
            } else {
                result[rec.fieldName(i)] = query.value(i);
            }
        }
        return result;
    }
    return QVariantMap();
}

QVariantList StudentRepo::getAll()
{
    return query();
}

QVariantList StudentRepo::query(const QString &whereClause)
{
    QVariantList list;
    QString sql = "SELECT * FROM students";
    if (!whereClause.isEmpty()) {
        sql += " WHERE " + whereClause;
    } else {
        sql += " ORDER BY name ASC";
    }

    QSqlQuery q(sql);
    while (q.next()) {
        QSqlRecord rec = q.record();
        QVariantMap item;
        for (int i = 0; i < rec.count(); ++i) {
            if (rec.fieldName(i) == "extra_json") {
                item["extra_json"] = QJsonDocument::fromJson(q.value(i).toByteArray()).toVariant();
            } else {
                item[rec.fieldName(i)] = q.value(i);
            }
        }
        list << item;
    }
    return list;
}

int StudentRepo::createWithId(int id, const QVariantMap &data)
{
    QSqlQuery query;
    query.prepare("INSERT INTO students (id, name, score, extra_json) VALUES (:id, :name, :score, :extra_json)");
    query.bindValue(":id", id);
    query.bindValue(":name", data.value("name"));
    query.bindValue(":score", data.value("score", 0));
    
    QJsonObject extra = QJsonObject::fromVariantMap(data.value("extra_json").toMap());
    query.bindValue(":extra_json", QJsonDocument(extra).toJson(QJsonDocument::Compact));

    if (!query.exec()) {
        qWarning() << "Failed to create student with ID:" << query.lastError().text();
        return -1;
    }
    return id;
}
