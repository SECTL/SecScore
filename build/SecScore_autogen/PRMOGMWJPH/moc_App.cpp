/****************************************************************************
** Meta object code from reading C++ file 'App.h'
**
** Created by: The Qt Meta Object Compiler version 69 (Qt 6.10.1)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../../../src/core/App.h"
#include <QtCore/qmetatype.h>

#include <QtCore/qtmochelpers.h>

#include <memory>


#include <QtCore/qxptype_traits.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'App.h' doesn't include <QObject>."
#elif Q_MOC_OUTPUT_REVISION != 69
#error "This file was generated using the moc from 6.10.1. It"
#error "cannot be used with the include files from this version of Qt."
#error "(The moc has changed too much.)"
#endif

#ifndef Q_CONSTINIT
#define Q_CONSTINIT
#endif

QT_WARNING_PUSH
QT_WARNING_DISABLE_DEPRECATED
QT_WARNING_DISABLE_GCC("-Wuseless-cast")
namespace {
struct qt_meta_tag_ZN3AppE_t {};
} // unnamed namespace

template <> constexpr inline auto App::qt_create_metaobjectdata<qt_meta_tag_ZN3AppE_t>()
{
    namespace QMC = QtMocConstants;
    QtMocHelpers::StringRefStorage qt_stringData {
        "App",
        "initializedChanged",
        "",
        "runModeChanged",
        "wsUrlChanged",
        "themeChanged",
        "themePath",
        "colorsChanged",
        "radiusChanged",
        "spacingChanged",
        "fontsChanged",
        "onThemeChanged",
        "setRunMode",
        "mode",
        "setWsUrl",
        "url",
        "loadSettings",
        "QVariantMap",
        "saveSettings",
        "settings",
        "isFirstRun",
        "completeFirstRun",
        "appVersion",
        "dataPath",
        "isInitialized",
        "runMode",
        "wsUrl",
        "colors",
        "radius",
        "spacing",
        "fonts"
    };

    QtMocHelpers::UintData qt_methods {
        // Signal 'initializedChanged'
        QtMocHelpers::SignalData<void()>(1, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'runModeChanged'
        QtMocHelpers::SignalData<void()>(3, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'wsUrlChanged'
        QtMocHelpers::SignalData<void()>(4, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'themeChanged'
        QtMocHelpers::SignalData<void(const QString &)>(5, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 6 },
        }}),
        // Signal 'colorsChanged'
        QtMocHelpers::SignalData<void()>(7, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'radiusChanged'
        QtMocHelpers::SignalData<void()>(8, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'spacingChanged'
        QtMocHelpers::SignalData<void()>(9, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'fontsChanged'
        QtMocHelpers::SignalData<void()>(10, 2, QMC::AccessPublic, QMetaType::Void),
        // Slot 'onThemeChanged'
        QtMocHelpers::SlotData<void(const QString &)>(11, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 6 },
        }}),
        // Method 'setRunMode'
        QtMocHelpers::MethodData<void(const QString &)>(12, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 13 },
        }}),
        // Method 'setWsUrl'
        QtMocHelpers::MethodData<void(const QString &)>(14, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 15 },
        }}),
        // Method 'loadSettings'
        QtMocHelpers::MethodData<QVariantMap()>(16, 2, QMC::AccessPublic, 0x80000000 | 17),
        // Method 'saveSettings'
        QtMocHelpers::MethodData<void(const QVariantMap &)>(18, 2, QMC::AccessPublic, QMetaType::Void, {{
            { 0x80000000 | 17, 19 },
        }}),
        // Method 'isFirstRun'
        QtMocHelpers::MethodData<bool()>(20, 2, QMC::AccessPublic, QMetaType::Bool),
        // Method 'completeFirstRun'
        QtMocHelpers::MethodData<void()>(21, 2, QMC::AccessPublic, QMetaType::Void),
    };
    QtMocHelpers::UintData qt_properties {
        // property 'appVersion'
        QtMocHelpers::PropertyData<QString>(22, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Constant),
        // property 'dataPath'
        QtMocHelpers::PropertyData<QString>(23, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Constant),
        // property 'isInitialized'
        QtMocHelpers::PropertyData<bool>(24, QMetaType::Bool, QMC::DefaultPropertyFlags, 0),
        // property 'runMode'
        QtMocHelpers::PropertyData<QString>(25, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Writable | QMC::StdCppSet, 1),
        // property 'wsUrl'
        QtMocHelpers::PropertyData<QString>(26, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Writable | QMC::StdCppSet, 2),
        // property 'colors'
        QtMocHelpers::PropertyData<QVariantMap>(27, 0x80000000 | 17, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 4),
        // property 'radius'
        QtMocHelpers::PropertyData<QVariantMap>(28, 0x80000000 | 17, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 5),
        // property 'spacing'
        QtMocHelpers::PropertyData<QVariantMap>(29, 0x80000000 | 17, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 6),
        // property 'fonts'
        QtMocHelpers::PropertyData<QVariantMap>(30, 0x80000000 | 17, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 7),
    };
    QtMocHelpers::UintData qt_enums {
    };
    return QtMocHelpers::metaObjectData<App, qt_meta_tag_ZN3AppE_t>(QMC::MetaObjectFlag{}, qt_stringData,
            qt_methods, qt_properties, qt_enums);
}
Q_CONSTINIT const QMetaObject App::staticMetaObject = { {
    QMetaObject::SuperData::link<QObject::staticMetaObject>(),
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN3AppE_t>.stringdata,
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN3AppE_t>.data,
    qt_static_metacall,
    nullptr,
    qt_staticMetaObjectRelocatingContent<qt_meta_tag_ZN3AppE_t>.metaTypes,
    nullptr
} };

void App::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    auto *_t = static_cast<App *>(_o);
    if (_c == QMetaObject::InvokeMetaMethod) {
        switch (_id) {
        case 0: _t->initializedChanged(); break;
        case 1: _t->runModeChanged(); break;
        case 2: _t->wsUrlChanged(); break;
        case 3: _t->themeChanged((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 4: _t->colorsChanged(); break;
        case 5: _t->radiusChanged(); break;
        case 6: _t->spacingChanged(); break;
        case 7: _t->fontsChanged(); break;
        case 8: _t->onThemeChanged((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 9: _t->setRunMode((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 10: _t->setWsUrl((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 11: { QVariantMap _r = _t->loadSettings();
            if (_a[0]) *reinterpret_cast<QVariantMap*>(_a[0]) = std::move(_r); }  break;
        case 12: _t->saveSettings((*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[1]))); break;
        case 13: { bool _r = _t->isFirstRun();
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        case 14: _t->completeFirstRun(); break;
        default: ;
        }
    }
    if (_c == QMetaObject::IndexOfMethod) {
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::initializedChanged, 0))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::runModeChanged, 1))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::wsUrlChanged, 2))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)(const QString & )>(_a, &App::themeChanged, 3))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::colorsChanged, 4))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::radiusChanged, 5))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::spacingChanged, 6))
            return;
        if (QtMocHelpers::indexOfMethod<void (App::*)()>(_a, &App::fontsChanged, 7))
            return;
    }
    if (_c == QMetaObject::ReadProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 0: *reinterpret_cast<QString*>(_v) = _t->appVersion(); break;
        case 1: *reinterpret_cast<QString*>(_v) = _t->dataPath(); break;
        case 2: *reinterpret_cast<bool*>(_v) = _t->isInitialized(); break;
        case 3: *reinterpret_cast<QString*>(_v) = _t->runMode(); break;
        case 4: *reinterpret_cast<QString*>(_v) = _t->wsUrl(); break;
        case 5: *reinterpret_cast<QVariantMap*>(_v) = _t->colors(); break;
        case 6: *reinterpret_cast<QVariantMap*>(_v) = _t->radius(); break;
        case 7: *reinterpret_cast<QVariantMap*>(_v) = _t->spacing(); break;
        case 8: *reinterpret_cast<QVariantMap*>(_v) = _t->fonts(); break;
        default: break;
        }
    }
    if (_c == QMetaObject::WriteProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 3: _t->setRunMode(*reinterpret_cast<QString*>(_v)); break;
        case 4: _t->setWsUrl(*reinterpret_cast<QString*>(_v)); break;
        default: break;
        }
    }
}

const QMetaObject *App::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *App::qt_metacast(const char *_clname)
{
    if (!_clname) return nullptr;
    if (!strcmp(_clname, qt_staticMetaObjectStaticContent<qt_meta_tag_ZN3AppE_t>.strings))
        return static_cast<void*>(this);
    return QObject::qt_metacast(_clname);
}

int App::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 15)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 15;
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 15)
            *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType();
        _id -= 15;
    }
    if (_c == QMetaObject::ReadProperty || _c == QMetaObject::WriteProperty
            || _c == QMetaObject::ResetProperty || _c == QMetaObject::BindableProperty
            || _c == QMetaObject::RegisterPropertyMetaType) {
        qt_static_metacall(this, _c, _id, _a);
        _id -= 9;
    }
    return _id;
}

// SIGNAL 0
void App::initializedChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 0, nullptr);
}

// SIGNAL 1
void App::runModeChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 1, nullptr);
}

// SIGNAL 2
void App::wsUrlChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 2, nullptr);
}

// SIGNAL 3
void App::themeChanged(const QString & _t1)
{
    QMetaObject::activate<void>(this, &staticMetaObject, 3, nullptr, _t1);
}

// SIGNAL 4
void App::colorsChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 4, nullptr);
}

// SIGNAL 5
void App::radiusChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 5, nullptr);
}

// SIGNAL 6
void App::spacingChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 6, nullptr);
}

// SIGNAL 7
void App::fontsChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 7, nullptr);
}
QT_WARNING_POP
