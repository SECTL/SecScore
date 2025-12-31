@echo off
echo 正在清理构建文件...

REM 删除构建目录
if exist build-release rmdir /s /q build-release
if exist build-mingw rmdir /s /q build-mingw
if exist build-local rmdir /s /q build-local
if exist build rmdir /s /q build

REM 删除 dist 目录
if exist dist rmdir /s /q dist

echo 清理完成！