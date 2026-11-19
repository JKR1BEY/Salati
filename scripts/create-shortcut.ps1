param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
$sm = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$arabicFolder = Join-Path $sm 'صلاتي'
New-Item -ItemType Directory -Path $arabicFolder -Force | Out-Null
# WScript.Shell cannot save a .lnk to a Unicode path directly, so create it in
# an ASCII temp path first, then move it into the Arabic-named folder.
$tempLnk = Join-Path $env:TEMP 'Salati.lnk'
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($tempLnk)
$sc.TargetPath = (Join-Path $InstallDir 'Salati.exe')
$sc.IconLocation = ((Join-Path $InstallDir 'Salati.exe') + ',0')
$sc.Description = 'صلاتي - مواقيت الصلاة'
$sc.WorkingDirectory = $InstallDir
$sc.Save()
Move-Item $tempLnk (Join-Path $arabicFolder 'Salati.lnk') -Force
# English-named shortcut at the top level (for "Salati" search).
Copy-Item (Join-Path $arabicFolder 'Salati.lnk') (Join-Path $sm 'Salati.lnk') -Force
# Desktop shortcut (English name).
$desktopLnk = Join-Path $env:USERPROFILE 'Desktop\Salati.lnk'
$sc2 = $ws.CreateShortcut($desktopLnk)
$sc2.TargetPath = (Join-Path $InstallDir 'Salati.exe')
$sc2.IconLocation = ((Join-Path $InstallDir 'Salati.exe') + ',0')
$sc2.Description = 'صلاتي - مواقيت الصلاة'
$sc2.WorkingDirectory = $InstallDir
$sc2.Save()