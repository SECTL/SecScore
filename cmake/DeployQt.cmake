cmake_minimum_required(VERSION 3.24)

# Deploy Qt libraries
execute_process(COMMAND "${CMAKE_COMMAND}" -E env
    PATH="${_qt_bin_dir}"
    windeployqt "${CMAKE_INSTALL_PREFIX}/$<TARGET_FILE_NAME:SecScore>.exe"
)
