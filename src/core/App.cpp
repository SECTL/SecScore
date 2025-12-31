#include "App.h"
#include "data/Database.h"
#include "ThemeService.h"
#include "network/WsClient.h"
#include "sync/SyncEngine.h"
#include <QDir>
#include <QStandardPaths>
#include <QSettings>
#include <QJsonDocument>
#include <QJsonObject>
#include <QFile>
#include <QDebug>

App::App(QObject *parent)
    : QObject{parent}
    , m_database(nullptr)
    , m_themeService(nullptr)
    , m_wsClient(nullptr)
    , m_syncEngine(nullptr)
{
}

App::~App()
{
    cleanup();
}

bool App::initialize()
{
    setupDataPath();
    loadSettingsInternal();

    // Initialize database
    m_database = new Database(this);
    if (!m_database->initialize(QDir(m_dataPath).filePath("app.db"))) {
        qCritical() << "Failed to initialize database";
        return false;
    }

    // Initialize theme service
    m_themeService = new ThemeService(this);
    connect(m_themeService, &ThemeService::themeChanged,
            this, &App::onThemeChanged);

    QString themesPath = QDir(m_dataPath).filePath("themes");
    copyDefaultThemes(themesPath);
    m_themeService->setThemesPath(themesPath);

    // Load default theme
    QString defaultTheme = QDir(themesPath).filePath("default.json");
    if (QFile::exists(defaultTheme)) {
        m_themeService->loadTheme(defaultTheme);
    }

    // Initialize Network and Sync
    m_wsClient = new WsClient(this);
    m_syncEngine = new SyncEngine(m_wsClient, m_database, this);

    if (m_runMode == "Remote" && !m_wsUrl.isEmpty()) {
        m_wsClient->connectToServer(m_wsUrl);
        m_syncEngine->start();
    }

    m_initialized = true;
    emit initializedChanged();
    return true;
}

void App::cleanup()
{
    if (m_database) {
        m_database->cleanup();
        m_database = nullptr;
    }
}

void App::setRunMode(const QString &mode)
{
    if (m_runMode != mode) {
        m_runMode = mode;
        emit runModeChanged();
        
        QSettings settings;
        settings.setValue("runMode", mode);

        if (m_syncEngine) {
            if (mode == "Remote") {
                if (!m_wsUrl.isEmpty()) {
                    m_wsClient->connectToServer(m_wsUrl);
                    m_syncEngine->start();
                }
            } else {
                m_syncEngine->stop();
                m_wsClient->disconnect();
            }
        }
    }
}

void App::setWsUrl(const QString &url)
{
    if (m_wsUrl != url) {
        m_wsUrl = url;
        emit wsUrlChanged();
        
        QSettings settings;
        settings.setValue("wsUrl", url);
    }
}

QVariantMap App::colors() const
{
    return m_themeService ? m_themeService->colors() : QVariantMap();
}

QVariantMap App::radius() const
{
    return m_themeService ? m_themeService->radius() : QVariantMap();
}

QVariantMap App::spacing() const
{
    return m_themeService ? m_themeService->spacing() : QVariantMap();
}

QVariantMap App::fonts() const
{
    return m_themeService ? m_themeService->fonts() : QVariantMap();
}

QVariantMap App::loadSettings()
{
    QSettings settings;
    QVariantMap result;
    result["runMode"] = settings.value("runMode", "Local").toString();
    result["wsUrl"] = settings.value("wsUrl", "").toString();
    result["theme"] = settings.value("theme", "default.json").toString();
    return result;
}

void App::saveSettings(const QVariantMap &settings)
{
    QSettings s;
    if (settings.contains("runMode"))
        s.setValue("runMode", settings["runMode"].toString());
    if (settings.contains("wsUrl"))
        s.setValue("wsUrl", settings["wsUrl"].toString());
    if (settings.contains("theme"))
        s.setValue("theme", settings["theme"].toString());
}

bool App::isFirstRun()
{
    QSettings settings;
    return !settings.contains("firstRunCompleted");
}

void App::completeFirstRun()
{
    QSettings settings;
    settings.setValue("firstRunCompleted", true);
}

void App::onThemeChanged(const QString &themePath)
{
    emit colorsChanged();
    emit radiusChanged();
    emit spacingChanged();
    emit fontsChanged();
    
    QSettings settings;
    settings.setValue("theme", QFileInfo(themePath).fileName());
}

void App::setupDataPath()
{
    QString path = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir dir(path);
    if (!dir.exists()) {
        dir.mkpath(path);
    }
    m_dataPath = path;
}

void App::loadSettingsInternal()
{
    QSettings settings;
    m_runMode = settings.value("runMode", "Local").toString();
    if (m_runMode.compare("remote", Qt::CaseInsensitive) == 0) m_runMode = "Remote";
    if (m_runMode.compare("local", Qt::CaseInsensitive) == 0) m_runMode = "Local";
    m_wsUrl = settings.value("wsUrl", "").toString();
}

void App::copyDefaultThemes(const QString &themesPath)
{
    QDir dir(themesPath);
    if (!dir.exists()) {
        dir.mkpath(themesPath);
    }

    // Copy default themes from resources if they don't exist
    // Since we don't have resource files yet, we'll write them directly
    QString defaultThemePath = QDir(themesPath).filePath("default.json");
    if (!QFile::exists(defaultThemePath)) {
        QJsonObject colors;
        colors["primary"] = "#3498db";
        colors["secondary"] = "#2ecc71";
        colors["background"] = "#f5f6fa";
        colors["surface"] = "#ffffff";
        colors["text"] = "#2c3e50";
        colors["textSecondary"] = "#7f8c8d";
        colors["border"] = "#dcdde1";
        colors["success"] = "#27ae60";
        colors["warning"] = "#f39c12";
        colors["error"] = "#c0392b";

        QJsonObject radius;
        radius["small"] = 4;
        radius["medium"] = 8;
        radius["large"] = 12;

        QJsonObject spacing;
        spacing["small"] = 8;
        spacing["medium"] = 16;
        spacing["large"] = 24;

        QJsonObject fonts;
        fonts["small"] = 12;
        fonts["medium"] = 14;
        fonts["large"] = 18;
        fonts["xlarge"] = 24;

        QJsonObject theme;
        theme["colors"] = colors;
        theme["radius"] = radius;
        theme["spacing"] = spacing;
        theme["fonts"] = fonts;

        QFile file(defaultThemePath);
        if (file.open(QIODevice::WriteOnly)) {
            file.write(QJsonDocument(theme).toJson());
            file.close();
        }
    }

    QString darkThemePath = QDir(themesPath).filePath("dark.json");
    if (!QFile::exists(darkThemePath)) {
        QJsonObject colors;
        colors["primary"] = "#3498db";
        colors["secondary"] = "#2ecc71";
        colors["background"] = "#2c3e50";
        colors["surface"] = "#34495e";
        colors["text"] = "#ecf0f1";
        colors["textSecondary"] = "#bdc3c7";
        colors["border"] = "#7f8c8d";
        colors["success"] = "#2ecc71";
        colors["warning"] = "#f1c40f";
        colors["error"] = "#e74c3c";

        QJsonObject radius;
        radius["small"] = 4;
        radius["medium"] = 8;
        radius["large"] = 12;

        QJsonObject spacing;
        spacing["small"] = 8;
        spacing["medium"] = 16;
        spacing["large"] = 24;

        QJsonObject fonts;
        fonts["small"] = 12;
        fonts["medium"] = 14;
        fonts["large"] = 18;
        fonts["xlarge"] = 24;

        QJsonObject theme;
        theme["colors"] = colors;
        theme["radius"] = radius;
        theme["spacing"] = spacing;
        theme["fonts"] = fonts;

        QFile file(darkThemePath);
        if (file.open(QIODevice::WriteOnly)) {
            file.write(QJsonDocument(theme).toJson());
            file.close();
        }
    }
}
