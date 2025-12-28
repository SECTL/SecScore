#pragma once

#include <QObject>
#include <QWebSocket>
#include <QJsonObject>
#include <QMap>
#include <QVariantMap>
#include <QUuid>
#include <QTimer>

class WsClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(QString connectionState READ connectionState NOTIFY connectionStateChanged)

public:
    explicit WsClient(QObject *parent = nullptr);
    ~WsClient();

    bool connected() const { return m_connected; }
    QString connectionState() const { return m_connectionState; }

    Q_INVOKABLE void connectToServer(const QString &url);
    Q_INVOKABLE void disconnect();
    Q_INVOKABLE QString sendRequest(const QString &category, const QString &action, const QVariantMap &payload);

signals:
    void connectedChanged();
    void connectionStateChanged();
    void responseReceived(const QString &seq, const QVariantMap &response);
    void errorOccurred(const QString &message);

private slots:
    void onConnected();
    void onDisconnected();
    void onTextMessageReceived(const QString &message);
    void onError(QAbstractSocket::SocketError error);
    void onTimeout();

private:
    QString generateSeq();
    void handleResponse(const QJsonObject &json);

    QWebSocket *m_socket;
    bool m_connected = false;
    QString m_connectionState = "disconnected";

    struct PendingRequest {
        QString seq;
        qint64 timestamp;
        int retries;
    };
    QMap<QString, PendingRequest> m_pendingRequests;
    QTimer *m_timeoutTimer;
    static const qint64 REQUEST_TIMEOUT = 30000; // 30 seconds
};
