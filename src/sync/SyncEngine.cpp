#include "SyncEngine.h"
#include "WsClient.h"
#include "Database.h"
#include <QTimer>
#include <QDebug>

SyncEngine::SyncEngine(QObject *parent)
    : QObject(parent)
    , m_syncTimer(new QTimer(this))
{
    connect(m_syncTimer, &QTimer::timeout, this, &SyncEngine::processOutbox);
}

SyncEngine::~SyncEngine()
{
    stopSync();
}

void SyncEngine::setWsClient(WsClient *client)
{
    if (m_wsClient) {
        disconnect(m_wsClient, nullptr, this, nullptr);
    }

    m_wsClient = client;

    if (m_wsClient) {
        connect(m_wsClient, &WsClient::responseReceived,
                this, &SyncEngine::onWsResponse);
        connect(m_wsClient, &WsClient::errorOccurred,
                this, &SyncEngine::onWsError);
    }
}

void SyncEngine::setDatabase(Database *db)
{
    m_database = db;
}

void SyncEngine::startSync()
{
    if (!m_wsClient || !m_database) {
        qWarning() << "Cannot start sync: wsClient or database not set";
        return;
    }

    m_isSyncing = true;
    m_syncStatus = "active";
    emit syncingChanged();
    emit syncStatusChanged();

    // Start periodic outbox processing (every 30 seconds)
    m_syncTimer->start(30000);

    // Initial sync
    processOutbox();
    pullRemote();

    qDebug() << "Sync engine started";
}

void SyncEngine::stopSync()
{
    m_isSyncing = false;
    m_syncStatus = "stopped";
    m_syncTimer->stop();

    emit syncingChanged();
    emit syncStatusChanged();

    qDebug() << "Sync engine stopped";
}

void SyncEngine::pushOutbox()
{
    // TODO: Implement in step 4
    qDebug() << "Pushing outbox to remote server";
}

void SyncEngine::pullRemote()
{
    // TODO: Implement in step 4
    qDebug() << "Pulling remote changes from server";
}

void SyncEngine::processOutbox()
{
    if (!m_isSyncing) {
        return;
    }

    qDebug() << "Processing outbox queue";
    pushOutbox();
}

void SyncEngine::onWsResponse(const QString &seq, const QVariantMap &response)
{
    qDebug() << "Received sync response for seq:" << seq;

    QString status = response.value("status", "").toString();
    if (status == "error") {
        QString message = response.value("message", "Unknown error").toString();
        qWarning() << "Sync error:" << message;
        emit syncError(message);
    }
}

void SyncEngine::onWsError(const QString &message)
{
    qWarning() << "WebSocket error during sync:" << message;
    emit syncError(message);
}
