param(
  [Parameter(Mandatory = $true)][string]$MsixPath,
  [Parameter(Mandatory = $true)][string]$IdentityPath,
  [Parameter(Mandatory = $true)][string]$EvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedName,
  [Parameter(Mandatory = $true)][string]$ExpectedPublisher,
  [Parameter(Mandatory = $true)][string]$ExpectedPublisherDisplayName,
  [Parameter(Mandatory = $true)][string]$RepositoryRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($path in @($MsixPath, $IdentityPath, $EvidencePath, $RepositoryRoot)) {
  if (-not [System.IO.Path]::IsPathRooted($path)) {
    throw "All package, evidence, and repository paths must be absolute"
  }
}

$msix = (Resolve-Path -LiteralPath $MsixPath).Path
$identityFile = (Resolve-Path -LiteralPath $IdentityPath).Path
$repoRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if (Test-Path -LiteralPath $EvidencePath) {
  if ((Get-ChildItem -LiteralPath $EvidencePath -Force | Measure-Object).Count -ne 0) {
    throw 'Evidence directory must be empty'
  }
} else {
  New-Item -ItemType Directory -Path $EvidencePath | Out-Null
}
$evidence = (Resolve-Path -LiteralPath $EvidencePath).Path

$identity = Get-Content -LiteralPath $identityFile -Raw | ConvertFrom-Json
if ($identity.schemaVersion -ne 1 -or
    $identity.identity.name -cne $ExpectedName -or
    $identity.identity.publisher -cne $ExpectedPublisher -or
    $identity.identity.publisherDisplayName -cne $ExpectedPublisherDisplayName -or
    $identity.payloadSha256 -notmatch '^[0-9a-f]{64}$' -or
    $identity.signing.status -cne 'unsigned-store-submission' -or
    $identity.package.filename -cne [System.IO.Path]::GetFileName($msix)) {
  throw 'The MSIX identity metadata does not match the explicit CI test identity'
}

$packageHash = (Get-FileHash -LiteralPath $msix -Algorithm SHA256).Hash.ToLowerInvariant()
if ($packageHash -cne $identity.package.sha256) {
  throw 'The MSIX package digest does not match its build metadata'
}

$certSubject = $ExpectedPublisher
$cerPath = Join-Path $evidence 'ephemeral-ci-test.cer'
$signTool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction Stop |
  Sort-Object { [version]($_.Directory.Parent.Name -replace '[^0-9.].*$', '') } -Descending |
  Select-Object -First 1 -ExpandProperty FullName
$installedPackage = $null
$testCertificate = $null
$publicCertificate = $null

try {
  $testCertificate = New-SelfSignedCertificate -Type Custom -Subject $certSubject -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
  Export-Certificate -Cert $testCertificate -FilePath $cerPath | Out-Null
  $publicCertificate = Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'

  & $signTool sign /fd SHA256 /s My /sha1 $testCertificate.Thumbprint $msix 2>&1 |
    Tee-Object -FilePath (Join-Path $evidence 'sign.log')
  if ($LASTEXITCODE -ne 0) { throw "SignTool failed to sign the disposable CI test package ($LASTEXITCODE)" }
  & $signTool verify /pa /all /v $msix 2>&1 |
    Tee-Object -FilePath (Join-Path $evidence 'signature-verification.log')
  if ($LASTEXITCODE -ne 0) { throw "SignTool rejected the ephemeral CI test package ($LASTEXITCODE)" }

  Add-AppxPackage -Path $msix -ErrorAction Stop
  $installedPackage = Get-AppxPackage -Name $ExpectedName -ErrorAction Stop | Select-Object -First 1
  if (-not $installedPackage -or $installedPackage.Publisher -cne $ExpectedPublisher) {
    throw 'Windows did not register the expected package identity and publisher'
  }

  $startApp = $null
  for ($attempt = 0; $attempt -lt 30 -and -not $startApp; $attempt++) {
    $startApp = Get-StartApps | Where-Object { $_.AppID -like "$($installedPackage.PackageFamilyName)!*" } |
      Select-Object -First 1
    if (-not $startApp) { Start-Sleep -Seconds 1 }
  }
  if (-not $startApp) { throw 'The installed package does not appear in the Windows Start app registry' }

  [xml]$appxManifest = Get-AppxPackageManifest -Package $installedPackage.PackageFullName
  $application = @($appxManifest.Package.Applications.Application) |
    Where-Object { $_.Id -eq $startApp.AppID.Split('!')[-1] } |
    Select-Object -First 1
  if (-not $application -or $application.Executable -ne $identity.application.executable) {
    throw 'Start menu registration does not resolve to the expected packaged executable'
  }
  $executable = Join-Path $installedPackage.InstallLocation $application.Executable
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'The registered executable is missing from the installed package location'
  }

  $smokePath = Join-Path $env:TEMP "sec-hub-msix-smoke-$([Guid]::NewGuid().ToString('N'))"
  $smokeEvidencePath = Join-Path $evidence 'packaged-smoke'
  New-Item -ItemType Directory -Path $smokePath | Out-Null
  try {
    Push-Location $repoRoot
    try {
      & node desktop/smoke.mjs --executable $executable --out $smokePath 2>&1 |
        Tee-Object -FilePath (Join-Path $evidence 'packaged-smoke.log')
      if ($LASTEXITCODE -ne 0) { throw "The installed MSIX app failed its packaged scan and report smoke test ($LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
  } finally {
    New-Item -ItemType Directory -Path $smokeEvidencePath | Out-Null
    $smokeFiles = @('application-stdout.log', 'application-stderr.log', 'smoke-evidence.json', 'smoke-failure.json') |
      ForEach-Object { Join-Path $smokePath $_ }
    $smokeSummaries = Get-ChildItem -LiteralPath $smokePath -Directory -Filter 'private-smoke-*' -Attributes !ReparsePoint |
      ForEach-Object { Join-Path $_.FullName 'summary.json' }
    foreach ($source in @($smokeFiles) + @($smokeSummaries)) {
      $file = Get-Item -LiteralPath $source -ErrorAction SilentlyContinue
      if ($file -and -not $file.PSIsContainer -and -not ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        Copy-Item -LiteralPath $file.FullName -Destination $smokeEvidencePath
      }
    }
    Remove-Item -LiteralPath $smokePath -Recurse -Force -ErrorAction SilentlyContinue
  }

  $smokeFile = Join-Path $smokeEvidencePath 'smoke-evidence.json'
  $smoke = Get-Content -LiteralPath $smokeFile -Raw | ConvertFrom-Json
  $summary = $smoke.summary
  if ($smoke.status -ne 'passed' -or $summary.status -ne 'passed' -or
      $summary.runtime.platform -ne 'win32' -or $summary.runtime.arch -ne 'x64' -or
      $summary.nativeScan.tools.osv -ne 'completed' -or -not $summary.nativeScan.reportsReady -or
      -not $summary.nativeScan.recommendationVisible -or
      -not $summary.savedRecommendations.fixedVersion -or -not $summary.savedRecommendations.suggestion) {
    throw 'The installed app did not complete the expected Windows OSV scan and report checks'
  }

  [pscustomobject]@{
    status = 'passed'
    package = $identity.package.filename
    packageSha256 = $packageHash
    identity = $identity.identity
    installedPackageFullName = $installedPackage.PackageFullName
    startMenuAppId = $startApp.AppID
    executable = $executable
    smokeEvidence = $smokeFile
    signing = 'ephemeral-self-signed-ci-test-only'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'msix-verification.json') -Encoding utf8
} finally {
  if ($installedPackage) {
    Remove-AppxPackage -Package $installedPackage.PackageFullName -ErrorAction SilentlyContinue
  }
  if ($publicCertificate) {
    Remove-Item -LiteralPath "Cert:\LocalMachine\TrustedPeople\$($publicCertificate.Thumbprint)" -ErrorAction SilentlyContinue
  }
  if ($testCertificate) {
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($testCertificate.Thumbprint)" -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $cerPath -Force -ErrorAction SilentlyContinue
}
