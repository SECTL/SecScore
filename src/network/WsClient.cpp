#include "WsClient.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDebug>
#include <QUuid>
#include <QTimer>

WsClient::WsClient(QObject *parent)
    : QObject{parent}
    // , m_socket(nullptr)
{
}

WsClient::~WsClient()
{
    // if (m_socket) {
    //     m_socket->close();
    //     delete m_socket;
    // }
}

void WsClient::connectToServer(const QString &url)
{
    qDebug() << "Connecting to WebSocket server:" << url;
    m_wsUrl = url;
    
    // Temporarily simulate connection since QtWebSockets is missing
    m_connectionState = "connecting";
    emit connectionStateChanged();
    
    // Simulate successful connection after 1 second
    QTimer::singleShot(1000, this, [this]() {
        m_connected = true;
        m_connectionState = "connected";
        emit connectedChanged();
        emit connectionStateChanged();
        qDebug() << "WebSocket connected (simulated)";
    });
}

void WsClient::disconnect()
{
    qDebug() << "Disconnecting from WebSocket server";
    
    m_connected = false;
    m_connectionState = "disconnected";
    emit connectedChanged();
    emit connectionStateChanged();
    
    // Clear all pending requests
    for (auto it = m_pendingRequests.begin(); it != m_pendingRequests.end(); ++it) {
        if (it.value().timer) {
            it.value().timer->stop();
            delete it.value().timer;
        }
    }
    m_pendingRequests.clear();
}

QString WsClient::sendRequest(const QString &category, const QString &action, const QVariantMap &payload)
{
    QString seq = generateSeq();
    
    QJsonObject envelope;
    envelope["seq"] = seq;
    envelope["category"] = category;
    envelope["action"] = action;
    envelope["payload"] = QJsonObject::fromVariantMap(payload);

    QJsonDocument doc(envelope);
    QString message = doc.toJson(QJsonDocument::Compact);

    qDebug() << "WsClient sending:" << message;

    // Since socket is disabled, we simulate a response after 2 seconds
    QTimer *timer = new QTimer(this);
    timer->setSingleShot(true);
    
    connect(timer, &QTimer::timeout, this, [this, seq, category, action]() {
        simulateResponse(seq, category, action);
    });
    
    PendingRequest pr;
    pr.seq = seq;
    pr.timer = timer;
    m_pendingRequests[seq] = pr;
    
    // Start the timer (simulate network delay)
    timer->start(2000);
    
    return seq;
}

void WsClient::simulateResponse(const QString &seq, const QString &category, const QString &action)
{
    if (!m_pendingRequests.contains(seq)) {
        return;
    }
    
    // Simulate a successful response
    QJsonObject response;
    response["seq"] = seq;
    response["status"] = "success";
    response["code"] = 200;
    response["message"] = "OK";
    
    QJsonObject result;
    result["success"] = true;
    
    // Simulate different responses based on category/action
    if (category == "student" && action == "query") {
        QJsonArray students;
        QJsonObject student;
        student["id"] = 1;
        student["name"] = "张三";
        student["score"] = 100;
        students.append(student);
        result["students"] = students;
    } else if (category == "student" && action == "create") {
        result["studentId"] = QUuid::createUuid().toString();
    } else if (category == "student" && action == "update") {
        result["updated"] = true;
    } else if (category == "student" && action == "delete") {
        result["deleted"] = true;
    } else if (category == "event" && action == "create") {
        result["eventId"] = QUuid::createUuid().toString();
    } else if (category == "event" && action == "query") {
        QJsonArray events;
        QJsonObject event;
        event["id"] = 1;
        event["type"] = 1; // student event
        event["ref_id"] = 1;
        event["desc"] = "测试事件";
        event["val_prev"] = 0;
        event["val_curr"] = 10;
        event["reason"] = "表现良好";
        events.append(event);
        result["events"] = events;
    } else if (category == "sync" && action == "pull") {
        result["events"] = QJsonArray();
        result["lastSyncId"] = "12345";
    } else if (category == "sync" && action == "push") {
        result["synced"] = true;
    } else if (category == "reason" && action == "query") {
        QJsonArray reasons;
        QJsonObject reason1;
        reason1["id"] = 1;
        reason1["name"] = "表现良好";
        reason1["sort"] = 1;
        reason1["enabled"] = true;
        reasons.append(reason1);
        QJsonObject reason2;
        reason2["id"] = 2;
        reason2["name"] = "需要改进";
        reason2["sort"] = 2;
        reason2["enabled"] = true;
        reasons.append(reason2);
        result["reasons"] = reasons;
    }
    
    response["result"] = result;
    
    handleResponse(response);
    
    // Clean up the timer
    if (m_pendingRequests[seq].timer) {
        delete m_pendingRequests[seq].timer;
    }
    m_pendingRequests.remove(seq);
}

void WsClient::onConnected()
{
    qDebug() << "WebSocket connected";
    m_connected = true;
    m_connectionState = "connected";
    emit connectedChanged();
    emit connectionStateChanged();
}

void WsClient::onDisconnected()
{
    qDebug() << "WebSocket disconnected";
    m_connected = false;
    m_connectionState = "disconnected";
    emit connectedChanged();
    emit connectionStateChanged();
    
    // Handle reconnection logic
    QTimer::singleShot(5000, this, [this]() {
        if (!m_connected && !m_wsUrl.isEmpty()) {
            qDebug() << "Attempting to reconnect...";
            connectToServer(m_wsUrl);
        }
    });
}

void WsClient::onTextMessageReceived(const QString &message)
{
    qDebug() << "WebSocket message received:" << message;
    
    QJsonParseError error;
    QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8(), &error);
    
    if (error.error != QJsonParseError::NoError) {
        qWarning() << "Failed to parse JSON:" << error.errorString();
        emit errorOccurred("Invalid JSON response");
        return;
    }
    
    if (!doc.isObject()) {
        qWarning() << "Response is not a JSON object";
        emit errorOccurred("Invalid response format");
        return;
    }
    
    QJsonObject json = doc.object();
    handleResponse(json);
}

void WsClient::onTimeout()
{
    // This method is called when a specific request times out
    QTimer *timer = qobject_cast<QTimer*>(sender());
    if (!timer) return;
    
    // Find the request associated with this timer
    for (auto it = m_pendingRequests.begin(); it != m_pendingRequests.end(); ++it) {
        if (it.value().timer == timer) {
            QString seq = it.key();
            qWarning() << "Request timeout for seq:" << seq;
            
            // Clean up
            delete it.value().timer;
            m_pendingRequests.erase(it);
            
            emit errorOccurred("Request timeout");
            break;
        }
    }
}

QString WsClient::generateSeq()
{
    return QUuid::createUuid().toString();
}

void WsClient::handleResponse(const QJsonObject &json)
{
    if (!json.contains("seq")) {
        qWarning() << "Response missing seq field";
        return;
    }
    
    QString seq = json["seq"].toString();
    
    if (!m_pendingRequests.contains(seq)) {
        qWarning() << "Received response for unknown seq:" << seq;
        return;
    }
    
    // Stop the timeout timer for this request
    if (m_pendingRequests[seq].timer) {
        m_pendingRequests[seq].timer->stop();
        delete m_pendingRequests[seq].timer;
    }
    
    // Remove from pending requests
    m_pendingRequests.remove(seq);
    
    // Parse response status
    QString status = json.value("status").toString();
    int code = json.value("code").toInt();
    QString message = json.value("message").toString();
    
    if (status != "success" || code != 200) {
        qWarning() << "Server error:" << message << "(code:" << code << ")";
        emit errorOccurred(QString("Server error: %1").arg(message));
        return;
    }
    
    // Extract result
    QVariantMap result;
    if (json.contains("result")) {
        QJsonObject resultObj = json["result"].toObject();
        result = resultObj.toVariantMap();
    }
    
    qDebug() << "Emitting response for seq:" << seq;
    emit responseReceived(seq, result);
}
