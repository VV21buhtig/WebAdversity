@echo off
rem runweb - zapusk web-magazina (Vite dev + otkryt v brauzere)
rem Polozhenie: G:\projects\frontend\runweb.bat
chcp 65001 >nul
set PATH=G:\projects\cpp\tools\node-v22.18.0-win-x64;%PATH%
cd /d G:\projects\frontend
npm run dev -- --open --host
