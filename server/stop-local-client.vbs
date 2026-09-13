Dim WinScriptHost
Set WinScriptHost = CreateObject("WScript.Shell")
WinScriptHost.Run Chr(34) & "C:\projects\filmpje\server\stop-local-client.bat" & Chr(34), 0, True
Set WinScriptHost = Nothing
