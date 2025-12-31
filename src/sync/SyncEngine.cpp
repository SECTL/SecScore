#include "SyncEngine.h"
#include "network/WsClient.h"
#include "data/Database.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <QDateTime>

SyncEngine::SyncEngine(WsClient *wsClient, Database *database, QObject *parent)
    : QObject{parent}
    , m_wsClient(wsClient)
    , m_database(database)
{
    if (m_wsClient) {
        connect(m_wsClient, &WsClient::responseReceived, this, &SyncEngine::onWsResponse);
        connect(m_wsClient, &WsClient::errorOccurred, this, &SyncEngine::onWsError);
    }
}

SyncEngine::~SyncEngine()
{
}

void SyncEngine::start()
{
    if (m_isSyncing) return;
    
    m_isSyncing = true;
    m_syncStatus = "syncing";
    emit syncingChanged();
    emit syncStatusChanged();

    // Initial sync: process outbox then pull changes
    processOutbox();
}

void SyncEngine::stop()
{
    if (!m_isSyncing) return;
    
    m_isSyncing = false;
    m_syncStatus = "stopped";
    emit syncingChanged();
    emit syncStatusChanged();
}

void SyncEngine::queueOutgoing(const QString &seq, const QVariantMap &payload)
{
    QSqlQuery query;
    query.prepare("INSERT INTO sync_outbox (seq, payload_json, retries, last_error) VALUES (:seq, :payload_json, 0, '')");
    query.bindValue(":seq", seq);
    query.bindValue(":payload_json", QJsonDocument::fromVariant(payload).toJson(QJsonDocument::Compact));
    
    if (!query.exec()) {
        qWarning() << "Failed to queue outgoing message:" << query.lastError().text();
    } else {
        m_pendingOutbox++;
        emit outboxChanged();
        if (m_isSyncing) {
            processOutbox();
        }
    }
}

void SyncEngine::pullChanges()
{
    if (!m_wsClient || !m_wsClient->connected()) return;

    m_syncStatus = "pulling";
    emit syncStatusChanged();

    // Get last sync timestamp from sync_state
    QSqlQuery query;
    query.prepare("SELECT value FROM sync_state WHERE key = 'lastSyncTime'");
    QString lastSyncTime;
    if (query.exec() && query.next()) {
        lastSyncTime = query.value(0).toString();
    }

    // Pull events since last sync
    QVariantMap payload;
    if (!lastSyncTime.isEmpty()) {
        payload["since"] = lastSyncTime;
    }
    payload["limit"] = 100; // Limit to 100 events per pull
    
    m_wsClient->sendRequest("event", "query", payload);
}

void SyncEngine::processOutbox()
{
    if (!m_wsClient || !m_wsClient->connected() || !m_isSyncing) return;

    // Get next item from outbox with retry limit
    QSqlQuery query;
    query.prepare("SELECT seq, payload_json, retries FROM sync_outbox WHERE retries < 3 ORDER BY created_at ASC LIMIT 1");
    if (query.exec() && query.next()) {
        QString seq = query.value(0).toString();
        QString payloadJson = query.value(1).toString();
        int retries = query.value(2).toInt();
        
        QJsonObject payload = QJsonDocument::fromJson(payloadJson.toUtf8()).object();
        
        // Extract category and action from payload
        QString category = payload.value("category").toString();
        QString action = payload.value("action").toString();
        QVariantMap innerPayload = payload.value("payload").toVariant().toMap();
        
        if (category.isEmpty() || action.isEmpty()) {
            qWarning() << "Invalid outbox payload - missing category or action";
            // Remove invalid entry
            QSqlQuery deleteQuery;
            deleteQuery.prepare("DELETE FROM sync_outbox WHERE seq = :seq");
            deleteQuery.bindValue(":seq", seq);
            deleteQuery.exec();
            m_pendingOutbox--;
            emit outboxChanged();
            processOutbox(); // Continue with next item
            return;
        }
        
        m_wsClient->sendRequest(category, action, innerPayload);
        
        m_syncStatus = "sending " + category + "." + action;
        emit syncStatusChanged();
    } else {
        m_syncStatus = "idle";
        m_pendingOutbox = 0;
        emit outboxChanged();
        emit syncStatusChanged();
        
        // After outbox is clear, pull changes
        pullChanges();
    }
}

void SyncEngine::onWsResponse(const QString &seq, const QVariantMap &response)
{
    qDebug() << "SyncEngine received response for" << seq;

    // Check if this was an outbox response
    QSqlQuery query;
    query.prepare("DELETE FROM sync_outbox WHERE seq = :seq");
    query.bindValue(":seq", seq);
    if (query.exec() && query.numRowsAffected() > 0) {
        m_pendingOutbox--;
        emit outboxChanged();
        
        // Update sync state with current timestamp
        QSqlQuery updateQuery;
        updateQuery.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('lastSyncTime', :time)");
        updateQuery.bindValue(":time", QDateTime::currentDateTime().toString(Qt::ISODate));
        updateQuery.exec();
        
        processOutbox(); // Continue with next item
        return;
    }

    // Handle pull response (event query)
    QString category = response.value("category").toString();
    QString action = response.value("action").toString();
    
    if (category == "event" && action == "query") {
        QVariantList events = response.value("events").toList();
        qDebug() << "Received" << events.size() << "events from server";
        
        // Process events (deduplicate by remote_id, write back)
        for (const QVariant &eventVar : events) {
            QVariantMap event = eventVar.toMap();
            processRemoteEvent(event);
        }
        
        m_syncStatus = "synced";
        emit syncStatusChanged();
        emit syncCompleted(true);
        
        // Update last sync time
        QSqlQuery updateQuery;
        updateQuery.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('lastSyncTime', :time)");
        updateQuery.bindValue(":time", QDateTime::currentDateTime().toString(Qt::ISODate));
        updateQuery.exec();
    }
}

void SyncEngine::processRemoteEvent(const QVariantMap &event)
{
    QString remoteId = event.value("remote_id").toString();
    if (remoteId.isEmpty()) {
        // Fallback: use 'id' as remote_id if remote_id is missing (standard convention)
        remoteId = event.value("id").toString();
    }
    
    if (remoteId.isEmpty()) {
        qWarning() << "Remote event missing remote_id (and id), skipping";
        return;
    }
    
    // Check if we already have this event
    QSqlQuery checkQuery;
    checkQuery.prepare("SELECT id FROM events WHERE remote_id = :remote_id");
    checkQuery.bindValue(":remote_id", remoteId);
    if (checkQuery.exec() && checkQuery.next()) {
        qDebug() << "Event" << remoteId << "already exists, skipping";
        return;
    }
    
    // Insert the remote event with synced state
    // Note: We DO NOT insert 'id' (local ID), we let it auto-increment.
    QSqlQuery insertQuery;
    insertQuery.prepare("INSERT INTO events (type, ref_id, desc, val_prev, val_curr, reason, timestamp, erased, remote_id, sync_state) "
                       "VALUES (:type, :ref_id, :desc, :val_prev, :val_curr, :reason, :timestamp, :erased, :remote_id, 'synced')");
    
    insertQuery.bindValue(":type", event.value("type"));
    insertQuery.bindValue(":ref_id", event.value("ref_id"));
    insertQuery.bindValue(":desc", event.value("desc"));
    insertQuery.bindValue(":val_prev", event.value("val_prev"));
    insertQuery.bindValue(":val_curr", event.value("val_curr"));
    insertQuery.bindValue(":reason", event.value("reason"));
    insertQuery.bindValue(":timestamp", event.value("timestamp"));
    insertQuery.bindValue(":erased", event.value("erased", 0));
    insertQuery.bindValue(":remote_id", remoteId);
    
    if (!insertQuery.exec()) {
        qWarning() << "Failed to insert remote event:" << insertQuery.lastError().text();
    }
}

void SyncEngine::onWsError(const QString &message)
{
    qWarning() << "SyncEngine WS error:" << message;
    
    // Increment retry count for failed requests
    QSqlQuery query;
    query.prepare("UPDATE sync_outbox SET retries = retries + 1, last_error = :error WHERE seq IN (SELECT seq FROM sync_outbox ORDER BY created_at ASC LIMIT 1)");
    query.bindValue(":error", message);
    query.exec();
    
    m_syncStatus = "error: " + message;
    emit syncStatusChanged();
    emit syncError(message);
    
    // Retry after delay
    QTimer::singleShot(10000, this, [this]() {
        if (m_isSyncing) {
            processOutbox();
        }
    });
}