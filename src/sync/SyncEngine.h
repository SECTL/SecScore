#pragma once

#include <QObject>
#include <QVariantMap>
#include <QTimer>

class WsClient;
class Database;

class SyncEngine : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool isSyncing READ isSyncing NOTIFY syncingChanged)
    Q_PROPERTY(QString syncStatus READ syncStatus NOTIFY syncStatusChanged)
    Q_PROPERTY(int pendingOutbox READ pendingOutbox NOTIFY outboxChanged)

public:
    explicit SyncEngine(WsClient *wsClient, Database *database, QObject *parent = nullptr);
    ~SyncEngine();

    bool isSyncing() const { return m_isSyncing; }
    QString syncStatus() const { return m_syncStatus; }
    int pendingOutbox() const { return m_pendingOutbox; }

    Q_INVOKABLE void start();
    Q_INVOKABLE void stop();
    Q_INVOKABLE void queueOutgoing(const QString &seq, const QVariantMap &payload);
    Q_INVOKABLE void pullChanges();

signals:
    void syncingChanged();
    void syncStatusChanged();
    void outboxChanged();
    void syncCompleted(bool success);
    void syncError(const QString &message);

private slots:
    void processOutbox();
    void onWsResponse(const QString &seq, const QVariantMap &response);
    void onWsError(const QString &message);

private:
    void processRemoteEvent(const QVariantMap &event);

    bool m_isSyncing = false;
    QString m_syncStatus = "idle";
    int m_pendingOutbox = 0;

    WsClient *m_wsClient = nullptr;
    Database *m_database = nullptr;
};