#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDir>
#include <QSettings>
#include "core/App.h"
#include "core/ThemeService.h"
#include "data/Database.h"
#include "data/Repositories/StudentRepo.h"
#include "data/Repositories/EventRepo.h"
#include "data/Repositories/ReasonRepo.h"
#include "network/WsClient.h"
#include "sync/SyncEngine.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);

    // Set application metadata
    app.setOrganizationName("SecScore");
    app.setApplicationName("SecScore");
    app.setApplicationDisplayName("SecScore - 教育场景个人积分管理软件");

    // Create main application service
    App mainApp;
    
    // Initialize application
    if (!mainApp.initialize()) {
        qCritical() << "Failed to initialize application";
        return -1;
    }

    // Register QML types
    qmlRegisterType<App>("SecScore.Core", 1, 0, "App");
    qmlRegisterType<StudentRepo>("SecScore", 1, 0, "StudentRepo");
    qmlRegisterType<EventRepo>("SecScore", 1, 0, "EventRepo");
    qmlRegisterType<ReasonRepo>("SecScore", 1, 0, "ReasonRepo");
    qmlRegisterType<WsClient>("SecScore.Network", 1, 0, "WsClient");
    qmlRegisterType<SyncEngine>("SecScore.Sync", 1, 0, "SyncEngine");

    // Set up QML engine
    QQmlApplicationEngine engine;
    
    // Set context properties
    engine.rootContext()->setContextProperty("mainApp", &mainApp);
    engine.rootContext()->setContextProperty("themeService", mainApp.themeService());
    engine.rootContext()->setContextProperty("wsClient", mainApp.wsClient());
    engine.rootContext()->setContextProperty("syncEngine", mainApp.syncEngine());

    const QUrl url(u"qrc:/qml/App.qml"_qs);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);
    
    engine.load(url);

    // Check if first run
    if (mainApp.isFirstRun()) {
        qDebug() << "First run detected - will show wizard";
    }

    int result = app.exec();
    
    // Cleanup
    mainApp.cleanup();
    
    return result;
}
