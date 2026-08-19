@echo off
cd /d "C:\Users\Alysson\Documents\GitHub\List_IT"
echo Iniciando servidor Flask...
start /B python app.py
timeout /t 3 /nobreak >nul
echo Servidor iniciado! Executando CLI...
python cli.py %*