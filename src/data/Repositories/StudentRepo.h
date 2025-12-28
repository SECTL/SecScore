#pragma once

#include<QObject>
#include<QVariantList>
#include<QVariantMap>

class StudentRepo : public QObject
{
    Q_OBJECT

public:
    explicit StudentRepo(QObject *parent = nullptr);

    Q_INVOKABLE bool create(const QVariantMap &data);
    Q_INVOKABLE bool update(int id, const QVariantMap &data);
    Q_INVOKABLE bool remove(int id);
    Q_INVOKABLE QVariantMap getById(int id);
    Q_INVOKABLE QVariantList getAll();
    Q_INVOKABLE QVariantList query(const QString &whereClause = QString());

    Q_INVOKABLE int createWithId(int id, const QVariantMap &data);
};
