@echo off
title Google Sheets SQL Sync Server
:: Navigate to your project directory (Change the path below to your actual folder)
cd /d "C:\Users\ganon\Documents\Pedimonte_Intern\ReactJS\bcvr-server"

echo 🚀 Starting the Sync Server...
:: Check if node_modules exists, if not, try to install
if not exist node_modules (
    echo 📦 Installing dependencies...
    npm install
)

:: Run the server
node IBS-PRDserver.js

pause