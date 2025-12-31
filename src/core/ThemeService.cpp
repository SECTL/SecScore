#include "ThemeService.h"
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <QFileInfo>
#include <QDir>

ThemeService::ThemeService(QObject *parent)
    : QObject{parent}
    , m_fileWatcher(new QFileSystemWatcher(this))
{
    connect(m_fileWatcher, &QFileSystemWatcher::fileChanged,
            this, &ThemeService::onThemeFileChanged);
}

ThemeService::~ThemeService()
{
}

void ThemeService::setThemesPath(const QString &path)
{
    m_themesPath = path;
    emit availableThemesChanged();
}

bool ThemeService::loadTheme(const QString &themePath)
{
    QFile file(themePath);
    if (!file.open(QIODevice::ReadOnly)) {
        qWarning() << "Failed to open theme file:" << themePath;
        return false;
    }

    QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    if (doc.isNull() || !doc.isObject()) {
        qWarning() << "Invalid theme file:" << themePath;
        return false;
    }

    QJsonObject themeObj = doc.object();

    // Parse colors
    m_colors.clear();
    if (themeObj.contains("colors") && themeObj["colors"].isObject()) {
        QJsonObject colors = themeObj["colors"].toObject();
        for (auto it = colors.begin(); it != colors.end(); ++it) {
            m_colors[it.key()] = it.value().toString();
        }
    }

    // Parse radius
    m_radius.clear();
    if (themeObj.contains("radius") && themeObj["radius"].isObject()) {
        QJsonObject radius = themeObj["radius"].toObject();
        for (auto it = radius.begin(); it != radius.end(); ++it) {
            if (it.value().isDouble()) {
                m_radius[it.key()] = it.value().toInt();
            }
        }
    }

    // Parse spacing
    m_spacing.clear();
    if (themeObj.contains("spacing") && themeObj["spacing"].isObject()) {
        QJsonObject spacing = themeObj["spacing"].toObject();
        for (auto it = spacing.begin(); it != spacing.end(); ++it) {
            if (it.value().isDouble()) {
                m_spacing[it.key()] = it.value().toInt();
            }
        }
    }

    // Parse fonts
    m_fonts.clear();
    if (themeObj.contains("fonts") && themeObj["fonts"].isObject()) {
        QJsonObject fonts = themeObj["fonts"].toObject();
        for (auto it = fonts.begin(); it != fonts.end(); ++it) {
            if (it.value().isDouble()) {
                m_fonts[it.key()] = it.value().toInt();
            }
        }
    }

    if (m_currentThemePath != themePath) {
        if (!m_currentThemePath.isEmpty()) {
            m_fileWatcher->removePath(m_currentThemePath);
        }
        m_currentThemePath = themePath;
        if (m_fileWatcher) {
            m_fileWatcher->addPath(themePath);
        }
    }

    emit themeChanged(themePath);
    return true;
}

bool ThemeService::loadThemeByName(const QString &name)
{
    QString path = QDir(m_themesPath).filePath(name + ".json");
    return loadTheme(path);
}

QVariantMap ThemeService::colors() const
{
    return m_colors;
}

QVariantMap ThemeService::radius() const
{
    return m_radius;
}

QVariantMap ThemeService::spacing() const
{
    return m_spacing;
}

QVariantMap ThemeService::fonts() const
{
    return m_fonts;
}

QStringList ThemeService::availableThemes() const
{
    QDir dir(m_themesPath);
    QStringList themes = dir.entryList({"*.json"}, QDir::Files);
    QStringList names;
    for (const QString &theme : themes) {
        names << QFileInfo(theme).baseName();
    }
    return names;
}

QString ThemeService::currentThemeName() const
{
    if (m_currentThemePath.isEmpty()) {
        return "default";
    }
    return QFileInfo(m_currentThemePath).baseName();
}

void ThemeService::onThemeFileChanged(const QString &path)
{
    if (path == m_currentThemePath) {
        loadTheme(path);
    }
}
