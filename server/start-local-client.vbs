Dim WinScriptHost
Set WinScriptHost = CreateObject("WScript.Shell")
WinScriptHost.Run Chr(34) & "C:\projects\filmpje\server\start-local-client.bat" & Chr(34), 0
Set WinScriptHost = Nothing