Set WshShell = CreateObject("WScript.Shell")

' Get the exact directory of this script so we run in the RepoTracker folder
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Run the Python Agent Backend completely invisibly (0 means hidden window)
WshShell.Run "cmd /c agent\venv\Scripts\python.exe agent\main.py", 0, False

' Run the Next.js Frontend completely invisibly
WshShell.Run "cmd /c npm run dev", 0, False
