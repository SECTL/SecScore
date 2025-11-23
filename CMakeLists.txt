cmake_minimum_required(VERSION 3.16)
project(SecScore LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.5 COMPONENTS Core Gui Qml Quick REQUIRED)

qt_add_executable(SecScore
    src/main.cpp
    src/domain/ScoreService.cpp
    src/domain/ScoreService.h
)

qt_add_qml_module(SecScore
    URI SecScore
    VERSION 1.0
    QML_FILES
        qml/Main.qml
)

target_link_libraries(SecScore
    PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Qml
        Qt6::Quick
)

