#pragma once

#include <QObject>
#include <QVariantMap>
#include <QFileSystemWatcher>

class ThemeService : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap colors READ colors NOTIFY themeChanged)
    Q_PROPERTY(QVariantMap radius READ radius NOTIFY themeChanged)
    Q_PROPERTY(QVariantMap spacing READ spacing NOTIFY themeChanged)
    Q_PROPERTY(QVariantMap fonts READ fonts NOTIFY themeChanged)
    Q_PROPERTY(QString currentTheme READ currentTheme NOTIFY themeChanged)
    Q_PROPERTY(QStringList availableThemes READ availableThemes NOTIFY availableThemesChanged)

public:
    explicit ThemeService(QObject *parent = nullptr);
    QVariantMap colors() const { return m_colors; }
    QVariantMap radius() const { return m_radius; }
    QVariantMap spacing() const { return m_spacing; }
    QVariantMap fonts() const { return m_fonts; }
    QString currentTheme() const { return m_currentTheme; }
    QStringList availableThemes() const { return m_availableThemes; }

    Q_INVOKABLE bool loadTheme(const QString &themePath);
    Q_INVOKABLE bool loadThemeByName(const QString &themeName);
    Q_INVOKABLE void scanThemesDirectory(const QString &directory);
    Q_INVOKABLE QString getThemeName(const QString &themePath) const;

signals:
    void themeChanged();
    void availableThemesChanged();

private:
    QVariantMap m_colors;
    QVariantMap m_radius;
    QVariantMap m_spacing;
    QVariantMap m_fonts;
    QFileSystemWatcher *m_watcher;
    QString m_currentTheme;
    QStringList m_availableThemes;

    void setupWatcher(const QString &themePath);
};
