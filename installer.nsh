; Custom NSIS hooks for Salati.
; Create Start Menu (English + Arabic folder) and Desktop shortcuts via a
; Unicode-safe PowerShell helper, then stamp the AppUserModelID for taskbar
; grouping using the WinShell plugin (ASCII paths only).

!macro customInstall
  ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\scripts\create-shortcut.ps1" "$INSTDIR"'
  WinShell::SetLnkAUMI "$SMPROGRAMS\Salati.lnk" "${APP_ID}"
  WinShell::SetLnkAUMI "$DESKTOP\Salati.lnk" "${APP_ID}"
  WinShell::SetLnkAUMI "$SMPROGRAMS\صلاتي\Salati.lnk" "${APP_ID}"
!macroend

!macro customUnInstall
  RMDir /r "$APPDATA\Microsoft\Windows\Start Menu\Programs\صلاتي"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Salati.lnk"
  Delete "$DESKTOP\Salati.lnk"
!macroend