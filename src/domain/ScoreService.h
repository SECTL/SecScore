#pragma once

#include <QObject>
#include <QString>
#include <unordered_map>

class ScoreService : public QObject {
    Q_OBJECT

public:
    explicit ScoreService(QObject* parent = nullptr);

    Q_INVOKABLE int createMember(const QString& name);
    Q_INVOKABLE int pointsFor(int memberId) const;
    Q_INVOKABLE bool addPoints(int memberId, int amount);
    Q_INVOKABLE bool deductPoints(int memberId, int amount);

signals:
    void pointsChanged(int memberId, int newPoints);

private:
    int nextId_ = 1;
    std::unordered_map<int, int> points_;
    std::unordered_map<int, QString> names_;
};

