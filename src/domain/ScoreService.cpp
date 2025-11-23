#include "ScoreService.h"

ScoreService::ScoreService(QObject* parent) : QObject(parent) {}

int ScoreService::createMember(const QString& name) {
    const int id = nextId_++;
    names_[id] = name;
    points_[id] = 0;
    emit pointsChanged(id, 0);
    return id;
}

int ScoreService::pointsFor(int memberId) const {
    auto it = points_.find(memberId);
    if (it == points_.end()) return -1;
    return it->second;
}

bool ScoreService::addPoints(int memberId, int amount) {
    if (amount <= 0) return false;
    auto it = points_.find(memberId);
    if (it == points_.end()) return false;
    it->second += amount;
    emit pointsChanged(memberId, it->second);
    return true;
}

bool ScoreService::deductPoints(int memberId, int amount) {
    if (amount <= 0) return false;
    auto it = points_.find(memberId);
    if (it == points_.end()) return false;
    if (it->second < amount) return false;
    it->second -= amount;
    emit pointsChanged(memberId, it->second);
    return true;
}

