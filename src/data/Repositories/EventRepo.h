#pragma once

#include<QObject>
#include<QVariantList>
#include<QVariantMap>

class EventRepo : public QObject
{
    Q_OBJECT

public:
    explicit EventRepo(QObject *parent = nullptr);

    Q_INVOKABLE QVariantMap create(const QVariantMap &data);
    Q_INVOKABLE bool update(int id, const QVariantMap &data);
    Q_INVOKABLE bool remove(int id);
    Q_INVOKABLE QVariantMap getById(int id);
    Q_INVOKABLE QVariantList getAll();
    Q_INVOKABLE QVariantList getByRefId(int type, int refId);
    Q_INVOKABLE QVariantList getRecent(int limit = 50);

    Q_INVOKABLE int createWithId(int id, const QVariantMap &data);
};
