#pragma once

#include <QObject>
#include <QQmlApplicationEngine>
#include <QVariantMap>

class Database;
class ThemeService;
class WsClient;
class SyncEngine;

class App : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString appVersion READ appVersion CONSTANT)
    Q_PROPERTY(QString dataPath READ dataPath CONSTANT)
    Q_PROPERTY(bool isInitialized READ isInitialized NOTIFY initializedChanged)
    Q_PROPERTY(QString runMode READ runMode WRITE setRunMode NOTIFY runModeChanged)
    Q_PROPERTY(QString wsUrl READ wsUrl WRITE setWsUrl NOTIFY wsUrlChanged)
    Q_PROPERTY(QVariantMap colors READ colors NOTIFY colorsChanged)
    Q_PROPERTY(QVariantMap radius READ radius NOTIFY radiusChanged)
    Q_PROPERTY(QVariantMap spacing READ spacing NOTIFY spacingChanged)
    Q_PROPERTY(QVariantMap fonts READ fonts NOTIFY fontsChanged)
    Q_PROPERTY(double uiScale READ uiScale WRITE setUiScale NOTIFY uiScaleChanged)

    // Computed properties for UI
    Q_PROPERTY(int currentFontSize READ currentFontSize NOTIFY uiMetricsChanged)
    Q_PROPERTY(int currentSpacing READ currentSpacing NOTIFY uiMetricsChanged)
    Q_PROPERTY(int currentRadius READ currentRadius NOTIFY uiMetricsChanged)

public:
    explicit App(QObject *parent = nullptr);
    ~App();

    bool initialize();
    void cleanup();

    QString appVersion() const { return "1.0.0"; }
    QString dataPath() const { return m_dataPath; }
    bool isInitialized() const { return m_initialized; }
    QString runMode() const { return m_runMode; }
    QString wsUrl() const { return m_wsUrl; }
    QVariantMap colors() const;
    QVariantMap radius() const;
    QVariantMap spacing() const;
    QVariantMap fonts() const;
    double uiScale() const { return m_uiScale; }

    int currentFontSize() const;
    int currentSpacing() const;
    int currentRadius() const;

    Q_INVOKABLE void setRunMode(const QString &mode);
    Q_INVOKABLE void setWsUrl(const QString &url);
    Q_INVOKABLE QVariantMap loadSettings();
    Q_INVOKABLE void saveSettings(const QVariantMap &settings);
    Q_INVOKABLE bool isFirstRun();
    Q_INVOKABLE void completeFirstRun();
    Q_INVOKABLE QString readFile(const QString &path);
    Q_INVOKABLE void setUiScale(double scale);

    Database* database() const { return m_database; }
    ThemeService* themeService() const { return m_themeService; }
    WsClient* wsClient() const { return m_wsClient; }
    SyncEngine* syncEngine() const { return m_syncEngine; }

public slots:
    void onThemeChanged(const QString &themePath);

signals:
    void initializedChanged();
    void runModeChanged();
    void wsUrlChanged();
    void themeChanged(const QString &themePath);
    void colorsChanged();
    void radiusChanged();
    void spacingChanged();
    void fontsChanged();
    void uiScaleChanged();
    void uiMetricsChanged();

private:
    void setupDataPath();
    void loadSettingsInternal();
    void copyDefaultThemes(const QString &themesPath);

private:
    QString m_dataPath;
    bool m_initialized = false;
    QString m_runMode = "Local"; // "Local" or "Remote"
    QString m_wsUrl = "";
    double m_uiScale = 1.0;

    Database *m_database = nullptr;
    ThemeService *m_themeService = nullptr;
    WsClient *m_wsClient = nullptr;
    SyncEngine *m_syncEngine = nullptr;
};
