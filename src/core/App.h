#pragma once

#include <QObject>
#include <QQmlApplicationEngine>
#include <QVariantMap>

class Database;
class ThemeService;

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

    Q_INVOKABLE void setRunMode(const QString &mode);
    Q_INVOKABLE void setWsUrl(const QString &url);
    Q_INVOKABLE QVariantMap loadSettings();
    Q_INVOKABLE void saveSettings(const QVariantMap &settings);
    Q_INVOKABLE bool isFirstRun();

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

private:
    void setupDataPath();
    void loadSettingsInternal();
    void copyDefaultThemes(const QString &themesPath);

private:
    QString m_dataPath;
    bool m_initialized = false;
    QString m_runMode = "local"; // "local" or "remote"
    QString m_wsUrl = "";

    Database *m_database = nullptr;
    ThemeService *m_themeService = nullptr;
};
