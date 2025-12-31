@echo off
echo 正在构建 SecScore 项目...

REM 创建构建目录
if not exist build-release mkdir build-release

REM 进入构建目录
cd build-release

REM 配置 CMake
echo 正在配置 CMake...
cmake -DCMAKE_BUILD_TYPE=Release ..
if errorlevel 1 (
    echo CMake 配置失败！
    exit /b 1
)

REM 构建项目
echo 正在构建项目...
cmake --build . --config Release
if errorlevel 1 (
    echo 构建失败！
    exit /b 1
)

REM 安装到 dist 目录
echo 正在安装到 dist 目录...
cmake --install . --config Release
if errorlevel 1 (
    echo 安装失败！
    exit /b 1
)

echo 构建完成！
echo 可执行文件位置: dist\bin\SecScore.exe
echo.
echo 按任意键运行程序...
pause > nul

REM 运行程序
cd ..\dist\bin
SecScore.exe