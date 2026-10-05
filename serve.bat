@echo off
cd /D %~dp0
python serve.py || pause || timeout -t 5