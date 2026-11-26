# Salati — reports the real Shell_TrayWnd state so the taskbar widget can hide
# and reposition in sync with the Windows taskbar (auto-hide, Show desktop,
# Explorer restarts). Samples the native state at 60 ms but emits a compact JSON
# line only when it actually changes, so a steady taskbar costs no IPC at all.
$ErrorActionPreference = 'SilentlyContinue'

$personalizeKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$systemLight = $false
$themeTicks = 0

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class SalatiTaskbar {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct APPBARDATA {
    public int cbSize;
    public IntPtr hWnd;
    public uint uCallbackMessage;
    public uint uEdge;
    public RECT rc;
    public IntPtr lParam;
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string className, string windowName);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("shell32.dll")]
  public static extern IntPtr SHAppBarMessage(uint message, ref APPBARDATA data);

  // ABM_GETSTATE (0x0004) returns ABS_AUTOHIDE (0x01) when auto-hide is on.
  public static int AutoHide(IntPtr hWnd) {
    APPBARDATA data = new APPBARDATA();
    data.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    data.hWnd = hWnd;
    IntPtr result = SHAppBarMessage(0x0004, ref data);
    return (int)(result.ToInt64() & 0x01);
  }

  // ABM_GETTASKBARPOS (0x0005) gives the docked, fully shown appbar rectangle.
  // Comparing the live rect with it distinguishes a shown bar from the thin
  // sliver that Windows leaves behind when auto-hide slides the bar away.
  public static bool TaskbarPos(IntPtr hWnd, out RECT rect, out uint edge) {
    APPBARDATA data = new APPBARDATA();
    data.cbSize = Marshal.SizeOf(typeof(APPBARDATA));
    data.hWnd = hWnd;
    IntPtr result = SHAppBarMessage(0x0005, ref data);
    rect = data.rc;
    edge = data.uEdge;
    return result != IntPtr.Zero;
  }
}
'@

$poll = 60
$rect = New-Object 'SalatiTaskbar+RECT'
$dockRect = New-Object 'SalatiTaskbar+RECT'
[uint32]$dockEdge = 0
$lastEmitted = ''

while ($true) {
  if ($themeTicks -le 0) {
    $themeValue = (Get-ItemProperty -Path $personalizeKey -Name 'SystemUsesLightTheme').SystemUsesLightTheme
    $systemLight = ($themeValue -eq 1)
    $themeTicks = 50
  }
  $themeTicks--

  $hwnd = [SalatiTaskbar]::FindWindow('Shell_TrayWnd', $null)
  $visible = $false
  $ok = $false
  $dockOk = $false

  if ($hwnd -ne [IntPtr]::Zero) {
    $ok = [SalatiTaskbar]::GetWindowRect($hwnd, [ref]$rect)
    $visible = [SalatiTaskbar]::IsWindowVisible($hwnd)
    $dockOk = [SalatiTaskbar]::TaskbarPos($hwnd, [ref]$dockRect, [ref]$dockEdge)
  }

  $autoHide = ([SalatiTaskbar]::AutoHide($hwnd) -eq 1)
  $okText = if ($ok) { 'true' } else { 'false' }
  $visibleText = if ($visible) { 'true' } else { 'false' }
  $autoText = if ($autoHide) { 'true' } else { 'false' }
  $lightText = if ($systemLight) { 'true' } else { 'false' }
  $dockOkText = if ($dockOk) { 'true' } else { 'false' }

  $json = '{"ok":' + $okText +
          ',"visible":' + $visibleText +
          ',"autoHide":' + $autoText +
          ',"systemLight":' + $lightText +
          ',"left":' + $rect.Left +
          ',"top":' + $rect.Top +
          ',"right":' + $rect.Right +
          ',"bottom":' + $rect.Bottom +
          ',"dockOk":' + $dockOkText +
          ',"dockEdge":' + $dockEdge +
          ',"dockLeft":' + $dockRect.Left +
          ',"dockTop":' + $dockRect.Top +
          ',"dockRight":' + $dockRect.Right +
          ',"dockBottom":' + $dockRect.Bottom + '}'

  if ($json -ne $lastEmitted) {
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
    $lastEmitted = $json
  }
  Start-Sleep -Milliseconds $poll
}
