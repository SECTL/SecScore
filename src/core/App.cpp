#include "App.h"
#include "ThemeService.h"
#include "Database.h"
#include <QStandardPaths>
#include <QDir>
#include <QSettings>
#include <QFile>
#include <QJsonObject>
#include <QJsonDocument>
#include <QCoreApplication>
#include <QDebug>

App::App(QObject *parent)
    : QObject(parent)
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

    // Initialize ThemeService
    m_themeService = new ThemeService(this);
    connect(m_themeService, &ThemeService::themeChanged,
            this, &App::onThemeChanged);

    // Load theme from application directory
    QString appDirPath = QCoreApplication::applicationDirPath();
    QString initialTheme = appDirPath + "/themes/default.json";

    if (QFile::exists(initialTheme)) {
        m_themeService->loadTheme(initialTheme);
    } else {
        qWarning() << "Theme file not found:" << initialTheme;
    }

    // Initialize Database
    m_database = new Database(this);
    if (!m_database->initialize(m_dataPath + "/app.db")) {
        qCritical() << "Failed to initialize database";
        return false;
    }

    m_initialized = true;
    emit initializedChanged();

    qDebug() << "App initialized successfully";
    qDebug() << "Run mode:" << m_runMode;
    qDebug() << "Data path:" << m_dataPath;

    return true;
}

void App::cleanup()
{
    if (m_database) {
        delete m_database;
        m_database = nullptr;
    }
}

void App::setupDataPath()
{
    // Use AppDataLocation for data storage
    QString basePath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    m_dataPath = basePath;

    // Ensure directory exists
    QDir dir;
    if (!dir.exists(m_dataPath)) {
        if (dir.mkpath(m_dataPath)) {
            qDebug() << "Created data directory:" << m_dataPath;
        } else {
            qWarning() << "Failed to create data directory:" << m_dataPath;
        }
    }

    // Create themes directory
    QString themesPath = m_dataPath + "/themes";
    if (!dir.exists(themesPath)) {
        dir.mkpath(themesPath);
    }
}

void App::loadSettingsInternal()
{
    QSettings settings;
    m_runMode = settings.value("runMode", "local").toString();
    m_wsUrl = settings.value("wsUrl", "").toString();
}

void App::setRunMode(const QString &mode)
{
    if (m_runMode != mode) {
        m_runMode = mode;
        QSettings settings;
        settings.setValue("runMode", mode);
        emit runModeChanged();
        qDebug() << "Run mode changed to:" << mode;
    }
}

void App::setWsUrl(const QString &url)
{
    if (m_wsUrl != url) {
        m_wsUrl = url;
        QSettings settings;
        settings.setValue("wsUrl", url);
        emit wsUrlChanged();
        qDebug() << "WebSocket URL changed to:" << url;
    }
}

QVariantMap App::loadSettings()
{
    QSettings settings;
    QVariantMap result;
    result["runMode"] = settings.value("runMode", "local");
    result["wsUrl"] = settings.value("wsUrl", "");
    result["theme"] = settings.value("theme", "default");
    return result;
}

void App::saveSettings(const QVariantMap &settings)
{
    QSettings s;
    if (settings.contains("runMode")) {
        s.setValue("runMode", settings["runMode"]);
    }
    if (settings.contains("wsUrl")) {
        s.setValue("wsUrl", settings["wsUrl"]);
    }
    if (settings.contains("theme")) {
        s.setValue("theme", settings["theme"]);
    }
}

bool App::isFirstRun()
{
    QSettings settings;
    return !settings.contains("firstRunCompleted");
}

void App::onThemeChanged(const QString &themePath)
{
    qDebug() << "Theme changed to:" << themePath;
    emit themeChanged(themePath);
    emit colorsChanged();
    emit radiusChanged();
    emit spacingChanged();
    emit fontsChanged();
}

void App::copyDefaultThemes(const QString &themesPath)
{
    // For development, copy themes from project directory to data directory
    QDir themesDir(themesPath);

    QStringList themeFiles = {"default.json", "dark.json"};
    QString sourcePath = QCoreApplication::applicationDirPath() + "/../themes";

    for (const QString &file : themeFiles) {
        QString sourceFile = sourcePath + "/" + file;
        QString destFile = themesPath + "/" + file;

        if (!QFile::exists(destFile) && QFile::exists(sourceFile)) {
            if (QFile::copy(sourceFile, destFile)) {
                qDebug() << "Copied theme file:" << file;
            }
        }
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
