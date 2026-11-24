[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Generate', 'Validate')][string]$Mode,
    [string]$InputPath,
    [string]$OutputDirectory = 'docs/codex-reports'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Git([string[]]$Arguments) {
    $result = @(& git -C $root @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'Git metadata check failed.' }
    $result
}

function Assert-Safe([string]$Text) {
    $patterns = @(
        '(?i)[A-Z]:[\\/]|\\\\[^\s\\]+\\|(?:^|[\s"''`(])/(?:[^\s/]+/)+',
        '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|AIza|ya29\.|sk-(?:proj-|svcacct-)?)[A-Za-z0-9_-]{15,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
        '(?i)[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}|(?<![A-Za-z0-9])[A-Za-z0-9]{28}(?![A-Za-z0-9])',
        '(?i)\bBearer\s+\S+|application_default_credentials\.json|\b(?:authorized_user|impersonated_service_account|service_account)\b|\b(?:authorization|password|passwd|private_key|client_secret|refresh[_ -]?token|access[_ -]?token|id[_ -]?token|api[_ -]?key|uid|email|customer[_ -]?(?:id|name)|phone)\b\s*["'']?\s*[:=]',
        '(?i)--(?:password|passwd|token|api[-_]key|client[-_]secret|credentials|uid|email)(?:=|\s+)\S+',
        '(?i)\b(?:GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK_CONFIG)\b|\$env:[A-Z_][A-Z0-9_]*\s*=|(?<![A-Za-z0-9_])[A-Z][A-Z0-9_]{2,}\s*=|(?:^|[/\\\s`])\.env(?:[.\s`]|$)|\.bak(?:[\s`]|$)',
        '\b(?:01[016789]|02|0[3-9][0-9])[- ]\d{3,4}[- ]\d{4}\b|\b\d{6}-[1-8]\d{6}\b'
    )
    foreach ($pattern in $patterns) {
        if ($Text -cmatch $pattern) { throw 'Report rejected by sensitive-content checks. Input values are suppressed.' }
    }
}

function Require-Text($Value) {
    if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value) -or
        $Value -ne $Value.Trim() -or $Value -match '[\x00-\x1f\x7f|<>`]' -or $Value.Length -gt 600) {
        throw 'Use a nonempty single line of plain text for each report item.'
    }
    Assert-Safe $Value
    $Value
}

function Require-Count($Value) {
    if (($Value -isnot [int] -and $Value -isnot [long]) -or $Value -lt 0 -or $Value -gt 1000000) {
        throw 'Test counts must be integers between zero and one million.'
    }
    [long]$Value
}

function Get-ImplementationFiles([string]$Sha) {
    if ($Sha -cnotmatch '^[a-f0-9]{40}$') { throw 'Provide the full implementation commit SHA.' }
    $subject = @(Read-Git @('show', '-s', '--format=%s', $Sha))
    if ($subject[0] -like 'docs(codex): report *') { throw 'Use the implementation commit, not a report commit.' }
    $ancestors = @(Read-Git @('rev-list', '--parents', '-n', '1', $Sha))
    if (($ancestors[0] -split ' ').Count -gt 2) { throw 'Use a non-merge implementation commit.' }
    $paths = @(Read-Git @('-c', 'core.quotepath=false', 'diff-tree', '--root', '--no-renames', '--no-commit-id', '--name-only', '-r', $Sha))
    if ($paths.Count -eq 0 -or @($paths | Where-Object { $_ -notlike 'docs/codex-reports/latest.md' -and $_ -notlike 'docs/codex-reports/history/*' }).Count -eq 0) {
        throw 'The implementation commit must contain work outside generated reports.'
    }
    foreach ($file in $paths) {
        if ($file -notmatch '^[\p{L}\p{N}_./ -]+$' -or $file.StartsWith('/') -or $file -match '(^|/)\.\.(/|$)') {
            throw 'Unsafe or unsupported path in implementation commit.'
        }
        Require-Text $file
    }
}

function Render-Report($Data, [string]$Branch, [string]$Time, [string]$History, [string[]]$Files) {
    if ($Data.Step -cnotmatch '^[a-z0-9][a-z0-9.-]{0,39}$') { throw 'Invalid step identifier.' }
    if ($Branch -cnotmatch '^[A-Za-z0-9._/-]+$') { throw 'Unsupported branch name.' }
    if ($Data.CodePush -cnotin @('pushed', 'not-pushed')) { throw 'Invalid implementation push status.' }
    if ($Data.Tests -isnot [array] -or $Data.Tests.Count -eq 0) { throw 'Declare at least one test row.' }
    $sections = [ordered]@{
        'Change summary' = $Data.Summary
        'Failure causes' = $Data.FailureCauses
        'Remaining risks' = $Data.Risks
        'Recommended next work' = $Data.Next
    }
    $passed = $failed = $notRun = 0L
    $rows = foreach ($test in $Data.Tests) {
        $command = Require-Text $test.Command
        $p = Require-Count $test.Passed
        $f = Require-Count $test.Failed
        $n = Require-Count $test.NotRun
        if (($p + $f + $n) -eq 0) { throw 'Each test row must account for at least one case.' }
        $passed += $p
        $failed += $f
        $notRun += $n
        $status = if (($p + $f) -eq 0) { 'not run' } else { 'executed' }
        '| {0} | {1} | {2} | {3} | {4} |' -f $command, $status, $p, $f, $n
    }
    if (($failed -eq 0 -and ($Data.FailureCauses.Count -ne 1 -or $Data.FailureCauses[0] -cne 'None')) -or
        ($failed -gt 0 -and 'None' -cin $Data.FailureCauses)) { throw 'Failure causes must match the failed count.' }
    $lines = @('# Codex work report', '', "- Step: $($Data.Step)", "- Work time (KST): $Time",
        "- Branch: $Branch", "- Implementation commit: $($Data.ImplementationCommit)",
        "- Implementation push: $($Data.CodePush)", "- History: $History", '',
        '## Changed files', '')
    $lines += @($Files | ForEach-Object { "- $_" })
    $lines += @('', '## Tests', '', "| Command | Status | Passed | Failed | Not run |",
        '| --- | --- | ---: | ---: | ---: |') + @($rows) +
        @('', "- Totals: passed $passed, failed $failed, not run $notRun")
    foreach ($section in $sections.GetEnumerator()) {
        if ($section.Value -isnot [array] -or $section.Value.Count -eq 0) { throw 'Each report section requires one or more items.' }
        $lines += @('', "## $($section.Key)", '')
        foreach ($item in $section.Value) { $lines += '- ' + (Require-Text $item) }
    }
    $text = ($lines -join "`n") + "`n"
    Assert-Safe $text
    $text
}

function Confirm-Report([string]$Directory) {
    $latest = Join-Path $Directory 'latest.md'
    if (-not (Test-Path -LiteralPath $latest -PathType Leaf)) { throw 'No latest report to validate.' }
    $text = [IO.File]::ReadAllText($latest).Replace("`r`n", "`n")
    Assert-Safe $text
    $pattern = '\A# Codex work report\n\n- Step: (?<step>[a-z0-9][a-z0-9.-]{0,39})\n- Work time \(KST\): (?<time>[^\n]+)\n- Branch: (?<branch>[A-Za-z0-9._/-]+)\n- Implementation commit: (?<sha>[a-f0-9]{40})\n- Implementation push: (?<push>pushed|not-pushed)\n- History: (?<history>history/[a-zA-Z0-9.+-]+\.md)\n\n## Changed files\n\n(?<files>(?:- [^\n]+\n)+)\n## Tests\n\n\| Command \| Status \| Passed \| Failed \| Not run \|\n\| --- \| --- \| ---: \| ---: \| ---: \|\n(?<tests>(?:\| [^\n]+\n)+)\n- Totals: passed \d+, failed \d+, not run \d+\n\n## Change summary\n\n(?<summary>(?:- [^\n]+\n)+)\n## Failure causes\n\n(?<failure>(?:- [^\n]+\n)+)\n## Remaining risks\n\n(?<risks>(?:- [^\n]+\n)+)\n## Recommended next work\n\n(?<next>(?:- [^\n]+\n)+)\z'
    $report = [regex]::Match($text, $pattern)
    if (-not $report.Success) { throw 'Latest report does not match the report format.' }
    $group = $report.Groups
    $time = [DateTimeOffset]::ParseExact($group['time'].Value, "yyyy-MM-dd'T'HH:mm:ss.fffzzz", [Globalization.CultureInfo]::InvariantCulture)
    if ($time.Offset.TotalHours -ne 9) { throw 'Work time must use KST (+09:00).' }
    $history = 'history/{0}-{1}-{2}.md' -f $time.ToString("yyyyMMdd'T'HHmmssfff"), $group['step'].Value, $group['sha'].Value.Substring(0, 12)
    if ($group['history'].Value -cne $history) { throw 'History path does not match report metadata.' }
    $historyPath = Join-Path $Directory $history
    if (-not (Test-Path -LiteralPath $historyPath -PathType Leaf) -or
        [IO.File]::ReadAllText($historyPath).Replace("`r`n", "`n") -cne $text) { throw 'Latest and history reports differ.' }
    $tests = foreach ($row in $group['tests'].Value.TrimEnd("`n").Split("`n")) {
        if ($row -cnotmatch '^\| ([^|]+) \| (executed|not run) \| (\d+) \| (\d+) \| (\d+) \|$') {
            throw 'Invalid test row.'
        }
        @{Command=$Matches[1]; Passed=[long]$Matches[3]; Failed=[long]$Matches[4]; NotRun=[long]$Matches[5]}
    }
    $data = @{
        Step=$group['step'].Value; ImplementationCommit=$group['sha'].Value; CodePush=$group['push'].Value; Tests=@($tests)
    }
    foreach ($mapping in @{Summary='summary'; FailureCauses='failure'; Risks='risks'; Next='next'}.GetEnumerator()) {
        $data[$mapping.Key] = @($group[$mapping.Value].Value.TrimEnd("`n").Split("`n") | ForEach-Object { $_.Substring(2) })
    }
    $files = @(Get-ImplementationFiles $data.ImplementationCommit)
    Read-Git @('merge-base','--is-ancestor',$data.ImplementationCommit,'HEAD') | Out-Null
    $expected = Render-Report $data $group['branch'].Value $group['time'].Value $history $files
    if ($expected -cne $text) { throw 'Report data, test counts, or modified files are inconsistent.' }
}

try {
    $directory = if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $root $OutputDirectory }
    if ($Mode -eq 'Generate') {
        if (-not $InputPath) { throw 'Generate requires a sanitized JSON input file.' }
        $data = Get-Content -LiteralPath $InputPath -Encoding UTF8 -Raw | ConvertFrom-Json
        $branch = @(Read-Git @('symbolic-ref','--short','HEAD'))[0]
        $sha = $data.ImplementationCommit
        $files = @(Get-ImplementationFiles $sha)
        Read-Git @('merge-base','--is-ancestor',$sha,'HEAD') | Out-Null
        $time = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(9))
        $history = 'history/{0}-{1}-{2}.md' -f $time.ToString("yyyyMMdd'T'HHmmssfff"), $data.Step, $sha.Substring(0, 12)
        $report = Render-Report $data $branch $time.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz") $history $files
        $latest = Join-Path $directory 'latest.md'
        if (Test-Path -LiteralPath $latest) { Confirm-Report $directory }
        [void][IO.Directory]::CreateDirectory((Join-Path $directory 'history'))
        $historyPath = Join-Path $directory $history
        $temp = Join-Path $directory ([Guid]::NewGuid().ToString('N') + '.tmp')
        $replacementBackup = $temp + '.previous'
        $stream = [IO.File]::Open($historyPath, [IO.FileMode]::CreateNew)
        try {
            $bytes = $utf8.GetBytes($report)
            $stream.Write($bytes, 0, $bytes.Length)
        } finally { $stream.Dispose() }
        try {
            [IO.File]::WriteAllText($temp, $report, $utf8)
            if (Test-Path -LiteralPath $latest) {
                [IO.File]::Replace($temp, $latest, $replacementBackup)
                [IO.File]::Delete($replacementBackup)
            }
            else { [IO.File]::Move($temp, $latest) }
        } finally { if (Test-Path -LiteralPath $temp) { [IO.File]::Delete($temp) } }
    }
    Confirm-Report $directory
    Write-Output 'Codex report validation passed.'
} catch {
    # Parser errors and input data can contain secrets. Never echo raw exceptions.
    Write-Error 'Codex report generation or validation failed. Check the format, Git metadata, history and sensitive-content rules in the README.'
    exit 1
}
