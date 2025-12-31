#pragma once

#include <QObject>
#include <QVariantMap>
#include <QFileSystemWatcher>

class ThemeService : public QObject
{
    Q_OBJECT

    Q_PROPERTY(QStringList availableThemes READ availableThemes NOTIFY availableThemesChanged)
    Q_PROPERTY(QString currentThemeName READ currentThemeName NOTIFY themeChanged)

public:
    explicit ThemeService(QObject *parent = nullptr);
    ~ThemeService();

    Q_INVOKABLE void setThemesPath(const QString &path);
    Q_INVOKABLE bool loadTheme(const QString &themePath);
    Q_INVOKABLE bool loadThemeByName(const QString &name);
    
    QVariantMap colors() const;
    QVariantMap radius() const;
    QVariantMap spacing() const;
    QVariantMap fonts() const;
    
    QStringList availableThemes() const;
    QString currentThemeName() const;

signals:
    void themeChanged(const QString &themePath);
    void availableThemesChanged();

private slots:
    void onThemeFileChanged(const QString &path);

private:
    QString m_themesPath;
    QString m_currentThemePath;
    QVariantMap m_colors;
    QVariantMap m_radius;
    QVariantMap m_spacing;
    QVariantMap m_fonts;
    QFileSystemWatcher *m_fileWatcher;
};