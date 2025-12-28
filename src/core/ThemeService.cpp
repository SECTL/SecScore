#include "ThemeService.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QFileInfo>
#include <QDebug>

ThemeService::ThemeService(QObject *parent)
    : QObject(parent)
    , m_watcher(new QFileSystemWatcher(this))
{
}

bool ThemeService::loadTheme(const QString &themePath)
{
    QFile file(themePath);
    if (!file.open(QIODevice::ReadOnly)) {
        qWarning() << "Failed to open theme file:" << themePath;
        return false;
    }

    QJsonParseError parseError;
    QJsonDocument doc = QJsonDocument::fromJson(file.readAll(), &parseError);
    file.close();

    if (parseError.error != QJsonParseError::NoError) {
        qWarning() << "Failed to parse theme JSON:" << parseError.errorString();
        return false;
    }

    QJsonObject root = doc.object();

    m_colors = root["colors"].toObject().toVariantMap();
    m_radius = root["radius"].toObject().toVariantMap();
    m_spacing = root["spacing"].toObject().toVariantMap();
    m_fonts = root["fonts"].toObject().toVariantMap();

    m_currentTheme = themePath;

    setupWatcher(themePath);

    emit themeChanged();
    qDebug() << "Theme loaded:" << themePath;
    return true;
}

void ThemeService::setupWatcher(const QString &themePath)
{
    QFileInfo fileInfo(themePath);
    QString dirPath = fileInfo.absolutePath();

    QStringList watchedFiles = m_watcher->files();
    if (!watchedFiles.contains(themePath)) {
        m_watcher->addPath(themePath);
    }

    disconnect(m_watcher, &QFileSystemWatcher::fileChanged, this, nullptr);
    connect(m_watcher, &QFileSystemWatcher::fileChanged, this, [this, themePath]() {
        qDebug() << "Theme file changed, reloading:" << themePath;
        loadTheme(themePath);
    });
}
