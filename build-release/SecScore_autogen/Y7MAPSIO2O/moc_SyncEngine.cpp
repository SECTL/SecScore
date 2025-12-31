/****************************************************************************
** Meta object code from reading C++ file 'SyncEngine.h'
**
** Created by: The Qt Meta Object Compiler version 69 (Qt 6.10.1)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../../../src/sync/SyncEngine.h"
#include <QtCore/qmetatype.h>

#include <QtCore/qtmochelpers.h>

#include <memory>


#include <QtCore/qxptype_traits.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'SyncEngine.h' doesn't include <QObject>."
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
struct qt_meta_tag_ZN10SyncEngineE_t {};
} // unnamed namespace

template <> constexpr inline auto SyncEngine::qt_create_metaobjectdata<qt_meta_tag_ZN10SyncEngineE_t>()
{
    namespace QMC = QtMocConstants;
    QtMocHelpers::StringRefStorage qt_stringData {
        "SyncEngine",
        "syncingChanged",
        "",
        "syncStatusChanged",
        "outboxChanged",
        "syncCompleted",
        "success",
        "syncError",
        "message",
        "processOutbox",
        "onWsResponse",
        "seq",
        "QVariantMap",
        "response",
        "onWsError",
        "start",
        "stop",
        "queueOutgoing",
        "payload",
        "pullChanges",
        "isSyncing",
        "syncStatus",
        "pendingOutbox"
    };

    QtMocHelpers::UintData qt_methods {
        // Signal 'syncingChanged'
        QtMocHelpers::SignalData<void()>(1, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'syncStatusChanged'
        QtMocHelpers::SignalData<void()>(3, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'outboxChanged'
        QtMocHelpers::SignalData<void()>(4, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'syncCompleted'
        QtMocHelpers::SignalData<void(bool)>(5, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::Bool, 6 },
        }}),
        // Signal 'syncError'
        QtMocHelpers::SignalData<void(const QString &)>(7, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 8 },
        }}),
        // Slot 'processOutbox'
        QtMocHelpers::SlotData<void()>(9, 2, QMC::AccessPrivate, QMetaType::Void),
        // Slot 'onWsResponse'
        QtMocHelpers::SlotData<void(const QString &, const QVariantMap &)>(10, 2, QMC::AccessPrivate, QMetaType::Void, {{
            { QMetaType::QString, 11 }, { 0x80000000 | 12, 13 },
        }}),
        // Slot 'onWsError'
        QtMocHelpers::SlotData<void(const QString &)>(14, 2, QMC::AccessPrivate, QMetaType::Void, {{
            { QMetaType::QString, 8 },
        }}),
        // Method 'start'
        QtMocHelpers::MethodData<void()>(15, 2, QMC::AccessPublic, QMetaType::Void),
        // Method 'stop'
        QtMocHelpers::MethodData<void()>(16, 2, QMC::AccessPublic, QMetaType::Void),
        // Method 'queueOutgoing'
        QtMocHelpers::MethodData<void(const QString &, const QVariantMap &)>(17, 2, QMC::AccessPublic, QMetaType::Void, {{
            { QMetaType::QString, 11 }, { 0x80000000 | 12, 18 },
        }}),
        // Method 'pullChanges'
        QtMocHelpers::MethodData<void()>(19, 2, QMC::AccessPublic, QMetaType::Void),
    };
    QtMocHelpers::UintData qt_properties {
        // property 'isSyncing'
        QtMocHelpers::PropertyData<bool>(20, QMetaType::Bool, QMC::DefaultPropertyFlags, 0),
        // property 'syncStatus'
        QtMocHelpers::PropertyData<QString>(21, QMetaType::QString, QMC::DefaultPropertyFlags, 1),
        // property 'pendingOutbox'
        QtMocHelpers::PropertyData<int>(22, QMetaType::Int, QMC::DefaultPropertyFlags, 2),
    };
    QtMocHelpers::UintData qt_enums {
    };
    return QtMocHelpers::metaObjectData<SyncEngine, qt_meta_tag_ZN10SyncEngineE_t>(QMC::MetaObjectFlag{}, qt_stringData,
            qt_methods, qt_properties, qt_enums);
}
Q_CONSTINIT const QMetaObject SyncEngine::staticMetaObject = { {
    QMetaObject::SuperData::link<QObject::staticMetaObject>(),
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10SyncEngineE_t>.stringdata,
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10SyncEngineE_t>.data,
    qt_static_metacall,
    nullptr,
    qt_staticMetaObjectRelocatingContent<qt_meta_tag_ZN10SyncEngineE_t>.metaTypes,
    nullptr
} };

void SyncEngine::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    auto *_t = static_cast<SyncEngine *>(_o);
    if (_c == QMetaObject::InvokeMetaMethod) {
        switch (_id) {
        case 0: _t->syncingChanged(); break;
        case 1: _t->syncStatusChanged(); break;
        case 2: _t->outboxChanged(); break;
        case 3: _t->syncCompleted((*reinterpret_cast<std::add_pointer_t<bool>>(_a[1]))); break;
        case 4: _t->syncError((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 5: _t->processOutbox(); break;
        case 6: _t->onWsResponse((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1])),(*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[2]))); break;
        case 7: _t->onWsError((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1]))); break;
        case 8: _t->start(); break;
        case 9: _t->stop(); break;
        case 10: _t->queueOutgoing((*reinterpret_cast<std::add_pointer_t<QString>>(_a[1])),(*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[2]))); break;
        case 11: _t->pullChanges(); break;
        default: ;
        }
    }
    if (_c == QMetaObject::IndexOfMethod) {
        if (QtMocHelpers::indexOfMethod<void (SyncEngine::*)()>(_a, &SyncEngine::syncingChanged, 0))
            return;
        if (QtMocHelpers::indexOfMethod<void (SyncEngine::*)()>(_a, &SyncEngine::syncStatusChanged, 1))
            return;
        if (QtMocHelpers::indexOfMethod<void (SyncEngine::*)()>(_a, &SyncEngine::outboxChanged, 2))
            return;
        if (QtMocHelpers::indexOfMethod<void (SyncEngine::*)(bool )>(_a, &SyncEngine::syncCompleted, 3))
            return;
        if (QtMocHelpers::indexOfMethod<void (SyncEngine::*)(const QString & )>(_a, &SyncEngine::syncError, 4))
            return;
    }
    if (_c == QMetaObject::ReadProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 0: *reinterpret_cast<bool*>(_v) = _t->isSyncing(); break;
        case 1: *reinterpret_cast<QString*>(_v) = _t->syncStatus(); break;
        case 2: *reinterpret_cast<int*>(_v) = _t->pendingOutbox(); break;
        default: break;
        }
    }
}

const QMetaObject *SyncEngine::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *SyncEngine::qt_metacast(const char *_clname)
{
    if (!_clname) return nullptr;
    if (!strcmp(_clname, qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10SyncEngineE_t>.strings))
        return static_cast<void*>(this);
    return QObject::qt_metacast(_clname);
}

int SyncEngine::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 12)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 12;
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 12)
            *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType();
        _id -= 12;
    }
    if (_c == QMetaObject::ReadProperty || _c == QMetaObject::WriteProperty
            || _c == QMetaObject::ResetProperty || _c == QMetaObject::BindableProperty
            || _c == QMetaObject::RegisterPropertyMetaType) {
        qt_static_metacall(this, _c, _id, _a);
        _id -= 3;
    }
    return _id;
}

// SIGNAL 0
void SyncEngine::syncingChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 0, nullptr);
}

// SIGNAL 1
void SyncEngine::syncStatusChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 1, nullptr);
}

// SIGNAL 2
void SyncEngine::outboxChanged()
{
    QMetaObject::activate(this, &staticMetaObject, 2, nullptr);
}

// SIGNAL 3
void SyncEngine::syncCompleted(bool _t1)
{
    QMetaObject::activate<void>(this, &staticMetaObject, 3, nullptr, _t1);
}

// SIGNAL 4
void SyncEngine::syncError(const QString & _t1)
{
    QMetaObject::activate<void>(this, &staticMetaObject, 4, nullptr, _t1);
}
QT_WARNING_POP
