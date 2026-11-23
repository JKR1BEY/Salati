param([string]$Message = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  $gitCandidates = @(
    "$env:LOCALAPPDATA\Programs\Git\cmd",
    "C:\Program Files\Git\cmd",
    "C:\Program Files (x86)\Git\cmd",
    "$env:USERPROFILE\.pi\agent\win-git-bash\cmd"
  )
  foreach ($candidate in $gitCandidates) {
    if (Test-Path (Join-Path $candidate "git.exe")) {
      $env:PATH = "$candidate;$env:PATH"
      break
    }
  }
}

function Assert-LastExit([string]$label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$version = $pkg.version
$owner = "JKR1BEY"
$repo = "Salati"
$branch = "main"
$tag = "v$version"

$token = $env:GH_TOKEN
if (-not $token) { $token = $env:GITHUB_TOKEN }
if (-not $token) {
  try { $token = (& gh auth token 2>$null).Trim() } catch { $token = $null }
}
if (-not $token) {
  throw "Set GH_TOKEN or GITHUB_TOKEN, or install gh and run 'gh auth login'."
}

Write-Output "== Shipping Salati $version =="

git add -A
Assert-LastExit "git add"

$staged = @(git diff --cached --name-only)
$unwanted = $staged | Where-Object {
  $_ -match '(?i)(gh-token|\.env$|\.pem$|\.key$|\.pfx$|\.p12$|release-id-|publish-)'
}
if ($unwanted) {
  git reset | Out-Null
  throw "Unwanted/staged files detected: $($unwanted -join ', ')"
}

$secretPattern = 'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?i)password\s*=|(?i)api[_-]?key\s*=|(?i)secret\s*=|Authorization:\s*Bearer\s+[A-Za-z0-9]'
$diffText = (git diff --cached | Out-String)
if ($diffText | Select-String -Pattern $secretPattern -Quiet) {
  git reset | Out-Null
  throw "Potential secret detected in staged diff; nothing committed."
}

if ($staged.Count -gt 0) {
  $commitMessage = if ($Message) { $Message } else { "chore: ship v$version" }
  git commit -m $commitMessage
  Assert-LastExit "git commit"
} else {
  Write-Output "No staged changes; using current HEAD."
}

$authRemote = "https://x-access-token:$token@github.com/$owner/$repo.git"
git push $authRemote $branch
Assert-LastExit "git push"
$commit = (git rev-parse HEAD).Trim()
Write-Output "Pushed $branch at $commit"

if (Test-Path "release") {
  Get-ChildItem "release" -Force | Remove-Item -Recurse -Force
}
npm.cmd run dist
Assert-LastExit "npm run dist"

$assets = @(
  @{ path = "release\Salati-Setup-$version.exe"; name = "Salati-Setup-$version.exe"; ct = "application/x-msdownload" },
  @{ path = "release\latest.yml"; name = "latest.yml"; ct = "text/yaml" },
  @{ path = "release\Salati-Setup-$version.exe.blockmap"; name = "Salati-Setup-$version.exe.blockmap"; ct = "application/octet-stream" }
)
foreach ($asset in $assets) {
  if (-not (Test-Path $asset.path)) { throw "Missing build artifact: $($asset.path)" }
}
$manifest = Get-Content "release\latest.yml" -Raw
if ($manifest -notmatch "version:\s*$([regex]::Escape($version))") {
  throw "latest.yml version does not match package.json ($version)."
}

$hdr = @{
  Authorization = "Bearer $token"
  "User-Agent" = "Salati/1.0"
  Accept = "application/vnd.github+json"
}
$releaseBody = @"
Salati $version

- Fixed the taskbar menu position control: the old pixel offsets were anchored at the left screen edge and then clamped, so most of the slider range did nothing. The single new slider now maps directly across the full usable width, so every step visibly moves the popup.
- Simplified Settings to one clean RTL slider ("موضع القائمة") plus a quick "إعادة الموضع الافتراضي" button. The old alignment selects and offset sliders were removed.
- Popup placement still keeps the menu above the taskbar when there is room, stays inside display bounds, and applies immediately while dragging with no added work on the click path.
- Legacy popup settings from v1.1.18 are migrated automatically to the new slider value on first launch.
- Existing click, Escape, outside-click and close behavior remains unchanged. The frosted-glass pre-adhan overlay, taskbar widget and all other features are preserved unchanged.
- Clean UTF-8 Arabic, RTL layout, no overflow or mojibake. Dark green remains the default.
"@
$releasePayload = @{
  tag_name = $tag
  target_commitish = $branch
  name = "Salati $version"
  body = $releaseBody
  draft = $false
  prerelease = $false
} | ConvertTo-Json -Depth 6
$releaseBytes = [System.Text.Encoding]::UTF8.GetBytes($releasePayload)

$existing = $null
try {
  $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $hdr -Method Get
} catch {}

if ($existing) {
  $release = $existing
  Write-Output "Updating existing release $tag"
} else {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" -Headers $hdr -Method Post -Body $releaseBytes -ContentType "application/json; charset=utf-8"
  Write-Output "Created release $tag"
}

$currentAssets = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/$($release.id)/assets" -Headers $hdr -Method Get
foreach ($asset in $assets) {
  $old = $currentAssets | Where-Object { $_.name -eq $asset.name }
  if ($old) {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($old.id)" -Headers $hdr -Method Delete | Out-Null
  }
  $uploadUrl = "https://uploads.github.com/repos/$owner/$repo/releases/$($release.id)/assets?name=" + [Uri]::EscapeDataString($asset.name)
  $uploaded = Invoke-RestMethod -Uri $uploadUrl -Headers @{ Authorization = "Bearer $token"; "User-Agent" = "Salati/1.0" } -Method Post -InFile $asset.path -ContentType $asset.ct
  Write-Output "Uploaded $($uploaded.name) ($($uploaded.size) bytes)"
}

foreach ($asset in $assets) {
  $url = "https://github.com/$owner/$repo/releases/download/$tag/$($asset.name)"
  try {
    $head = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 5 -UseBasicParsing
    Write-Output "Public $($asset.name): HTTP $($head.StatusCode)"
  } catch {
    throw "Public verification failed for $($asset.name): $($_.Exception.Message)"
  }
}

Write-Output "Commit: $commit $commitMessage"
Write-Output "Branch: $branch"
Write-Output "Release: $($release.html_url)"
