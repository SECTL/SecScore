/****************************************************************************
** Meta object code from reading C++ file 'ReasonRepo.h'
**
** Created by: The Qt Meta Object Compiler version 69 (Qt 6.10.1)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../../../src/data/Repositories/ReasonRepo.h"
#include <QtCore/qmetatype.h>

#include <QtCore/qtmochelpers.h>

#include <memory>


#include <QtCore/qxptype_traits.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'ReasonRepo.h' doesn't include <QObject>."
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
struct qt_meta_tag_ZN10ReasonRepoE_t {};
} // unnamed namespace

template <> constexpr inline auto ReasonRepo::qt_create_metaobjectdata<qt_meta_tag_ZN10ReasonRepoE_t>()
{
    namespace QMC = QtMocConstants;
    QtMocHelpers::StringRefStorage qt_stringData {
        "ReasonRepo",
        "create",
        "",
        "QVariantMap",
        "data",
        "update",
        "id",
        "remove",
        "getById",
        "getAll",
        "QVariantList",
        "createWithId"
    };

    QtMocHelpers::UintData qt_methods {
        // Method 'create'
        QtMocHelpers::MethodData<bool(const QVariantMap &)>(1, 2, QMC::AccessPublic, QMetaType::Bool, {{
            { 0x80000000 | 3, 4 },
        }}),
        // Method 'update'
        QtMocHelpers::MethodData<bool(int, const QVariantMap &)>(5, 2, QMC::AccessPublic, QMetaType::Bool, {{
            { QMetaType::Int, 6 }, { 0x80000000 | 3, 4 },
        }}),
        // Method 'remove'
        QtMocHelpers::MethodData<bool(int)>(7, 2, QMC::AccessPublic, QMetaType::Bool, {{
            { QMetaType::Int, 6 },
        }}),
        // Method 'getById'
        QtMocHelpers::MethodData<QVariantMap(int)>(8, 2, QMC::AccessPublic, 0x80000000 | 3, {{
            { QMetaType::Int, 6 },
        }}),
        // Method 'getAll'
        QtMocHelpers::MethodData<QVariantList()>(9, 2, QMC::AccessPublic, 0x80000000 | 10),
        // Method 'createWithId'
        QtMocHelpers::MethodData<int(int, const QVariantMap &)>(11, 2, QMC::AccessPublic, QMetaType::Int, {{
            { QMetaType::Int, 6 }, { 0x80000000 | 3, 4 },
        }}),
    };
    QtMocHelpers::UintData qt_properties {
    };
    QtMocHelpers::UintData qt_enums {
    };
    return QtMocHelpers::metaObjectData<ReasonRepo, qt_meta_tag_ZN10ReasonRepoE_t>(QMC::MetaObjectFlag{}, qt_stringData,
            qt_methods, qt_properties, qt_enums);
}
Q_CONSTINIT const QMetaObject ReasonRepo::staticMetaObject = { {
    QMetaObject::SuperData::link<QObject::staticMetaObject>(),
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10ReasonRepoE_t>.stringdata,
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10ReasonRepoE_t>.data,
    qt_static_metacall,
    nullptr,
    qt_staticMetaObjectRelocatingContent<qt_meta_tag_ZN10ReasonRepoE_t>.metaTypes,
    nullptr
} };

void ReasonRepo::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    auto *_t = static_cast<ReasonRepo *>(_o);
    if (_c == QMetaObject::InvokeMetaMethod) {
        switch (_id) {
        case 0: { bool _r = _t->create((*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[1])));
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        case 1: { bool _r = _t->update((*reinterpret_cast<std::add_pointer_t<int>>(_a[1])),(*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[2])));
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        case 2: { bool _r = _t->remove((*reinterpret_cast<std::add_pointer_t<int>>(_a[1])));
            if (_a[0]) *reinterpret_cast<bool*>(_a[0]) = std::move(_r); }  break;
        case 3: { QVariantMap _r = _t->getById((*reinterpret_cast<std::add_pointer_t<int>>(_a[1])));
            if (_a[0]) *reinterpret_cast<QVariantMap*>(_a[0]) = std::move(_r); }  break;
        case 4: { QVariantList _r = _t->getAll();
            if (_a[0]) *reinterpret_cast<QVariantList*>(_a[0]) = std::move(_r); }  break;
        case 5: { int _r = _t->createWithId((*reinterpret_cast<std::add_pointer_t<int>>(_a[1])),(*reinterpret_cast<std::add_pointer_t<QVariantMap>>(_a[2])));
            if (_a[0]) *reinterpret_cast<int*>(_a[0]) = std::move(_r); }  break;
        default: ;
        }
    }
}

const QMetaObject *ReasonRepo::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *ReasonRepo::qt_metacast(const char *_clname)
{
    if (!_clname) return nullptr;
    if (!strcmp(_clname, qt_staticMetaObjectStaticContent<qt_meta_tag_ZN10ReasonRepoE_t>.strings))
        return static_cast<void*>(this);
    return QObject::qt_metacast(_clname);
}

int ReasonRepo::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 6)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 6;
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 6)
            *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType();
        _id -= 6;
    }
    return _id;
}
QT_WARNING_POP
