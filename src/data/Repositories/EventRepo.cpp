#include "EventRepo.h"
#include<QDebug>

EventRepo::EventRepo(QObject *parent)
    : QObject(parent)
{
}

QVariantMap EventRepo::create(const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(data);
    return QVariantMap();
}

bool EventRepo::update(int id, const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    Q_UNUSED(data);
    return false;
}

bool EventRepo::remove(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return false;
}

QVariantMap EventRepo::getById(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return QVariantMap();
}

QVariantList EventRepo::getAll()
{
    // TODO: Implement in step 3
    return QVariantList();
}

QVariantList EventRepo::getByRefId(int type, int refId)
{
    // TODO: Implement in step 3
    Q_UNUSED(type);
    Q_UNUSED(refId);
    return QVariantList();
}

QVariantList EventRepo::getRecent(int limit)
{
    // TODO: Implement in step 3
    Q_UNUSED(limit);
    return QVariantList();
}

int EventRepo::createWithId(int id, const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    Q_UNUSED(data);
    return -1;
}
