[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'New-CodexReport.ps1'
$engine = (Get-Process -Id $PID).Path
$sha = & git -C $root log -1 --format=%H -- scripts/New-CodexReport.ps1
if ($LASTEXITCODE) { throw 'Cannot read test fixture commit.' }
if (-not $sha) {
    $sha = & git -C $root rev-parse HEAD
    if ($LASTEXITCODE) { throw 'Cannot read test fixture commit.' }
}
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixture = [IO.Path]::GetFullPath((Join-Path $tempRoot ('codex-report-test-' + [Guid]::NewGuid().ToString('N'))))
[void][IO.Directory]::CreateDirectory($fixture)
$output = Join-Path $fixture 'output'
$inputFile = Join-Path $fixture 'input.json'
$latest = Join-Path $output 'latest.md'
$script:checks = 0

function Assert-Test([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "Failed: $Label" }
    $script:checks++
    Write-Output "PASS $Label"
}

function Invoke-Report([string]$Mode, [string]$Directory = $output) {
    $ErrorActionPreference = 'Continue'
    $messages = @(& $engine -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Mode $Mode -InputPath $inputFile -OutputDirectory $Directory 2>&1)
    @{Code=$LASTEXITCODE; Output=($messages -join "`n")}
}

function Save-Input($Data) {
    $Data | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $inputFile -Encoding UTF8
}

$data = @{
    Step='fixture'; ImplementationCommit=$sha; CodePush='not-pushed'
    Summary=@('Synthetic report fixture.')
    Tests=@(
        @{Command='node --test tests/sample.test.js'; Passed=2; Failed=1; NotRun=0},
        @{Command='Deferred integration scenario'; Passed=0; Failed=0; NotRun=1}
    )
    FailureCauses=@('Synthetic assertion failure.')
    Risks=@('Fixture only.'); Next=@('Run the next fixture.')
}

try {
    Save-Input $data
    Assert-Test ((Invoke-Report Generate).Code -eq 0) 'generate first report'
    Assert-Test ((Invoke-Report Validate).Code -eq 0) 'validate matching latest and history'
    $first = [IO.File]::ReadAllText($latest)
    Assert-Test ($first.Contains("Implementation commit: $sha") -and $first -match 'Work time \(KST\): .*\+09:00') 'implementation SHA and KST'
    Assert-Test ($first.Contains('| Deferred integration scenario | not run | 0 | 0 | 1 |') -and
        $first.Contains('Totals: passed 2, failed 1, not run 1')) 'explicit not-run and accurate totals'
    $firstHistory = @(Get-ChildItem -LiteralPath (Join-Path $output 'history') -Filter '*.md')[0].FullName

    $data.Step = 'fixture-second'
    Save-Input $data
    Assert-Test ((Invoke-Report Generate).Code -eq 0) 'replace latest with a second valid report'
    Assert-Test ([IO.File]::ReadAllText($firstHistory) -ceq $first) 'preserve previous history'
    $second = [IO.File]::ReadAllText($latest)

    $fixtures = @(
        'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
        'Password: dummy-only',
        'tool --token dummy-only',
        '-----BEGIN PRIVATE KEY-----',
        'ADC C:\dummy\application_default_credentials.json',
        'staff@example.invalid',
        'Abcdefghijklmnopqrstuvwxyz01',
        'CUSTOM_MODE=fixture',
        '\\example\private\log.txt',
        '/home/example/private/log.txt',
        'Customer name: dummy customer',
        'Telephone 010-1234-5678',
        'local.env .env.fixture and snapshot.bak'
    )
    foreach ($fixtureValue in $fixtures) {
        $data.Summary = @($fixtureValue)
        Save-Input $data
        $result = Invoke-Report Generate
        Assert-Test ($result.Code -ne 0 -and !$result.Output.Contains($fixtureValue) -and [IO.File]::ReadAllText($latest) -ceq $second) 'reject synthetic sensitive input without echo or overwrite'
    }
    $data.Summary = @('Synthetic report fixture.')
    $data.FailureCauses = @('None')
    Save-Input $data
    Assert-Test ((Invoke-Report Generate).Code -ne 0) 'reject inconsistent failure causes'
    $data.Remove('FailureCauses')
    Save-Input $data
    Assert-Test ((Invoke-Report Generate).Code -ne 0) 'reject missing required field'
    $data.FailureCauses = @('Synthetic assertion failure.')
    Save-Input $data
    $tampered = $second.Replace('passed 2, failed 1','passed 3, failed 0')
    [IO.File]::WriteAllText($latest, $tampered)
    Assert-Test ((Invoke-Report Validate).Code -ne 0) 'reject modified latest'
    Assert-Test ((Invoke-Report Generate).Code -ne 0 -and [IO.File]::ReadAllText($latest) -ceq $tampered) 'leave incompatible latest untouched'
    $historyLine = ($second -split "`n" | Where-Object { $_ -like '- History:*' })
    [IO.File]::WriteAllText((Join-Path $output $historyLine.Substring(11)), $tampered)
    Assert-Test ((Invoke-Report Validate).Code -ne 0) 'reject incorrect totals even in matching copies'
    Write-Output "Codex report checks passed: $script:checks"
} finally {
    if ((Split-Path -Parent $fixture).TrimEnd('\','/') -eq $tempRoot.TrimEnd('\','/') -and
        (Split-Path -Leaf $fixture) -match '^codex-report-test-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}
