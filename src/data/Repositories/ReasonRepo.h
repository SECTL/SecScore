#pragma once

#include<QObject>
#include<QVariantList>
#include<QVariantMap>

class ReasonRepo : public QObject
{
    Q_OBJECT

public:
    explicit ReasonRepo(QObject *parent = nullptr);

    Q_INVOKABLE bool create(const QVariantMap &data);
    Q_INVOKABLE bool update(int id, const QVariantMap &data);
    Q_INVOKABLE bool remove(int id);
    Q_INVOKABLE QVariantMap getById(int id);
    Q_INVOKABLE QVariantList getAll();
    Q_INVOKABLE QVariantList getEnabled();
};
