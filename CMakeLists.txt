cmake_minimum_required(VERSION 3.16)

project(SecScore VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 6.2 REQUIRED COMPONENTS Core Quick Sql Network)

qt_standard_project_setup()

# Set Qt policy to avoid warnings
qt_policy(SET QTP0001 NEW)
qt_policy(SET QTP0004 NEW)

# Source files
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

# Header files
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

# Resources
set(RESOURCES
    resources/qml.qrc
)

# Create executable
qt_add_executable(SecScore
    ${SOURCES}
    ${HEADERS}
    ${RESOURCES}
)

# Clear database before build
add_custom_command(TARGET SecScore PRE_BUILD
    COMMAND ${CMAKE_COMMAND} -E remove -f "$ENV{LOCALAPPDATA}/SecScore/SecScore/app.db"
    COMMAND ${CMAKE_COMMAND} -E remove -f "$ENV{LOCALAPPDATA}/SecScore/app.db"
    COMMENT "Clearing database file before build..."
)

# Link libraries
target_link_libraries(SecScore
    PRIVATE
    Qt6::Core
    Qt6::Quick
    Qt6::Sql
    Qt6::Network
)

# Include directories
target_include_directories(SecScore PRIVATE src)

# Copy QML sources next to the built executable for runtime fallback
add_custom_command(TARGET SecScore POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_SOURCE_DIR}/qml"
        "$<TARGET_FILE_DIR:SecScore>/qml"
    COMMAND ${CMAKE_COMMAND} -E copy
        "${CMAKE_SOURCE_DIR}/resources/ABOUT.md"
        "$<TARGET_FILE_DIR:SecScore>/ABOUT.md"
)

# Install target
install(TARGETS SecScore
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

# Install QML sources for runtime fallback
install(DIRECTORY qml/
    DESTINATION ${CMAKE_INSTALL_BINDIR}/qml
)
