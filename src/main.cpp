#include<QGuiApplication>
#include<QQmlApplicationEngine>
#include<QQmlContext>
#include<QDir>
#include<QStandardPaths>
#include<QDebug>
#include "core/App.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    app.setOrganizationName("SecScore");
    app.setOrganizationDomain("secscore.app");
    app.setApplicationName("SecScore");

    // Initialize App (main entry point)
    App appInstance;
    if (!appInstance.initialize()) {
        qCritical() << "Failed to initialize application";
        return -1;
    }

    // QML Engine
    QQmlApplicationEngine engine;

    // Register App instance as QML context property
    engine.rootContext()->setContextProperty("app", &appInstance);

    // Load main QML file
    const QUrl url(QStringLiteral("qrc:/qt/qml/SecScore/qml/App.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl) {
            QCoreApplication::exit(-1);
        }
    }, Qt::QueuedConnection);

    engine.load(url);

    if (engine.rootObjects().isEmpty()) {
        qCritical() << "Failed to load QML file";
        return -1;
    }

    return app.exec();
}
