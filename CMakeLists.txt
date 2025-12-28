cmake_minimum_required(VERSION 3.24)
project(SecScore VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

# Qt6 dependencies
find_package(Qt6 REQUIRED COMPONENTS
    Core
    Quick
    QuickControls2
    Qml
    Sql
    Network
    WebSockets
)

set(SOURCES
    src/main.cpp
    src/core/App.cpp
    src/core/ThemeService.cpp
    src/data/Database.cpp
    src/data/Repositories/StudentRepo.cpp
    src/data/Repositories/EventRepo.cpp
    src/data/Repositories/ReasonRepo.cpp
    src/network/WsClient.cpp
    src/sync/SyncEngine.cpp
)

set(HEADERS
    src/core/App.h
    src/core/ThemeService.h
    src/data/Database.h
    src/data/Repositories/StudentRepo.h
    src/data/Repositories/EventRepo.h
    src/data/Repositories/ReasonRepo.h
    src/network/WsClient.h
    src/sync/SyncEngine.h
)

qt_add_executable(SecScore
    ${SOURCES}
    ${HEADERS}
)

qt_add_qml_module(SecScore
    URI SecScore
    VERSION 1.0
    QML_FILES
        qml/App.qml
    RESOURCES
        resources/qml.qrc
)

target_link_libraries(SecScore PRIVATE
    Qt6::Core
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Qml
    Qt6::Sql
    Qt6::Network
    Qt6::WebSockets
)

# Output directory
set_target_properties(SecScore PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Install rules
install(TARGETS SecScore
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

# Deploy Qt dependencies on Windows
if(WIN32)
    install(SCRIPT ${CMAKE_CURRENT_LIST_DIR}/cmake/DeployQt.cmake)
endif()
