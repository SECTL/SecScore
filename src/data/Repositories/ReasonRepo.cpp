#include "ReasonRepo.h"
#include<QDebug>

ReasonRepo::ReasonRepo(QObject *parent)
    : QObject(parent)
{
}

bool ReasonRepo::create(const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(data);
    return false;
}

bool ReasonRepo::update(int id, const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    Q_UNUSED(data);
    return false;
}

bool ReasonRepo::remove(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return false;
}

QVariantMap ReasonRepo::getById(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return QVariantMap();
}

QVariantList ReasonRepo::getAll()
{
    // TODO: Implement in step 3
    return QVariantList();
}

QVariantList ReasonRepo::getEnabled()
{
    // TODO: Implement in step 3
    return QVariantList();
}
