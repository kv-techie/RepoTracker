' Starts RepoTracker in the background at login.
'
' This launches scripts\start-repotracker.ps1, which runs the agent and a production
' web server, writes logs to the logs\ folder, and restarts the agent if it stops
' answering. Check logs\supervisor.log if something looks wrong.

Set WshShell = CreateObject("WScript.Shell")

scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & _
          scriptDir & "\scripts\start-repotracker.ps1"""

' 0 = no window, False = do not wait
WshShell.Run command, 0, False
