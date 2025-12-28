#include "WsClient.h"
#include <QJsonDocument>
#include <QDebug>

WsClient::WsClient(QObject *parent)
    : QObject(parent)
    , m_socket(new QWebSocket())
    , m_timeoutTimer(new QTimer(this))
{
    connect(m_socket, &QWebSocket::connected, this, &WsClient::onConnected);
    connect(m_socket, &QWebSocket::disconnected, this, &WsClient::onDisconnected);
    connect(m_socket, &QWebSocket::textMessageReceived, this, &WsClient::onTextMessageReceived);
    connect(m_socket, QOverload<QAbstractSocket::SocketError>::of(&QWebSocket::errorOccurred),
            this, &WsClient::onError);

    connect(m_timeoutTimer, &QTimer::timeout, this, &WsClient::onTimeout);
    m_timeoutTimer->start(5000); // Check every 5 seconds
}

WsClient::~WsClient()
{
    disconnect();
    delete m_socket;
}

void WsClient::connectToServer(const QString &url)
{
    if (m_socket->state() == QAbstractSocket::ConnectedState) {
        qWarning() << "Already connected";
        return;
    }

    m_connectionState = "connecting";
    emit connectionStateChanged();

    qDebug() << "Connecting to WebSocket server:" << url;
    m_socket->open(QUrl(url));
}

void WsClient::disconnect()
{
    if (m_socket->state() == QAbstractSocket::ConnectedState) {
        qDebug() << "Disconnecting from server";
        m_socket->close();
    }
}

QString WsClient::sendRequest(const QString &category, const QString &action, const QVariantMap &payload)
{
    if (!m_connected) {
        qWarning() << "Cannot send request: not connected";
        emit errorOccurred("Not connected to server");
        return QString();
    }

    QString seq = generateSeq();

    QJsonObject request;
    request["seq"] = seq;
    request["category"] = category;
    request["action"] = action;
    request["payload"] = QJsonObject::fromVariantMap(payload);

    QJsonDocument doc(request);
    QString message = doc.toJson(QJsonDocument::Compact);

    qDebug() << "Sending request:" << seq << category << action;
    m_socket->sendTextMessage(message);

    // Track pending request
    PendingRequest pending;
    pending.seq = seq;
    pending.timestamp = QDateTime::currentMSecsSinceEpoch();
    pending.retries = 0;
    m_pendingRequests[seq] = pending;

    return seq;
}

void WsClient::onConnected()
{
    m_connected = true;
    m_connectionState = "connected";
    emit connectedChanged();
    emit connectionStateChanged();

    qDebug() << "WebSocket connected";
}

void WsClient::onDisconnected()
{
    m_connected = false;
    m_connectionState = "disconnected";
    emit connectedChanged();
    emit connectionStateChanged();

    qDebug() << "WebSocket disconnected";
}

void WsClient::onTextMessageReceived(const QString &message)
{
    QJsonParseError parseError;
    QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8(), &parseError);

    if (parseError.error != QJsonParseError::NoError) {
        qWarning() << "Failed to parse WebSocket message:" << parseError.errorString();
        return;
    }

    QJsonObject json = doc.object();
    handleResponse(json);
}

void WsClient::onError(QAbstractSocket::SocketError error)
{
    qWarning() << "WebSocket error:" << error << m_socket->errorString();
    emit errorOccurred(m_socket->errorString());
}

void WsClient::onTimeout()
{
    qint64 now = QDateTime::currentMSecsSinceEpoch();
    QStringList timedOutSeqs;

    for (auto it = m_pendingRequests.begin(); it != m_pendingRequests.end(); ++it) {
        if (now - it.value().timestamp > REQUEST_TIMEOUT) {
            timedOutSeqs.append(it.key());
        }
    }

    for (const QString &seq : timedOutSeqs) {
        qWarning() << "Request timed out:" << seq;
        m_pendingRequests.remove(seq);
        emit errorOccurred("Request timed out: " + seq);
    }
}

void WsClient::handleResponse(const QJsonObject &json)
{
    if (!json.contains("seq")) {
        qWarning() << "Response missing seq field";
        return;
    }

    QString seq = json["seq"].toString();
    qDebug() << "Received response for:" << seq;

    // Remove from pending
    m_pendingRequests.remove(seq);

    // Convert to QVariantMap and emit
    QVariantMap response = json.toVariantMap();
    emit responseReceived(seq, response);
}

QString WsClient::generateSeq()
{
    return QUuid::createUuid().toString(QUuid::WithoutBraces);
}
