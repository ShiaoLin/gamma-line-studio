$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
Push-Location -LiteralPath $projectRoot
try {
    & node --test core.test.js clipboard.test.js
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    & node build.js
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    $releaseRoot = Join-Path $projectRoot 'dist'
    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    $stem = 'Gamma-Line-Studio-v' + $version
    $html = Join-Path $releaseRoot ($stem + '.html')
    $zip = Join-Path $releaseRoot ($stem + '.zip')
    # Resolve the built file without relying on the shell's source-file encoding.
    $app = Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.html' | Where-Object Name -ne 'shell.html'
    if (@($app).Count -ne 1) { throw 'Expected exactly one built standalone HTML.' }
    Copy-Item -LiteralPath $app.FullName -Destination $html -Force
    Compress-Archive -LiteralPath @($html, (Join-Path $projectRoot 'START-HERE.txt'), (Join-Path $projectRoot 'README.md')) -DestinationPath $zip -Force
    $hashes = @($html, $zip) | ForEach-Object {
        $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
        $hash.Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $_)
    }
    [System.IO.File]::WriteAllLines((Join-Path $releaseRoot 'SHA256SUMS.txt'), $hashes, [System.Text.UTF8Encoding]::new($false))
    Get-ChildItem -LiteralPath $releaseRoot | Select-Object Name, Length
} finally { Pop-Location }
