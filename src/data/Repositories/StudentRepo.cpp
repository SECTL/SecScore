#include "StudentRepo.h"
#include<QDebug>

StudentRepo::StudentRepo(QObject *parent)
    : QObject(parent)
{
}

bool StudentRepo::create(const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(data);
    return false;
}

bool StudentRepo::update(int id, const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    Q_UNUSED(data);
    return false;
}

bool StudentRepo::remove(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return false;
}

QVariantMap StudentRepo::getById(int id)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    return QVariantMap();
}

QVariantList StudentRepo::getAll()
{
    // TODO: Implement in step 3
    return QVariantList();
}

QVariantList StudentRepo::query(const QString &whereClause)
{
    // TODO: Implement in step 3
    Q_UNUSED(whereClause);
    return QVariantList();
}

int StudentRepo::createWithId(int id, const QVariantMap &data)
{
    // TODO: Implement in step 3
    Q_UNUSED(id);
    Q_UNUSED(data);
    return -1;
}
