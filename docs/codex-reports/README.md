# Codex 작업 보고서

GitHub의 작업 브랜치에서 [최신 보고서](latest.md)를 읽으면 구현 커밋, 검증 결과, 위험과 다음 작업을 확인할 수 있습니다. [단계별 이력](history/)에는 생성 시점의 보고서를 보존합니다. 이 운영 방식은 로컬 PowerShell과 Git을 사용합니다. `AGENTS.md`는 종료 절차를 전달하며, 각 세션에서 이 절차를 실행해야 보고서가 갱신됩니다.

## 작성과 검증

저장소 루트에서 Windows PowerShell 5.1 이상과 Git을 사용합니다. 아래 JSON을 Git 밖의 임시 파일에 UTF-8로 준비합니다. 구현 SHA는 `git rev-parse HEAD` 등으로 확인한 전체 40자리 SHA를 입력합니다. 예시에는 가상 데이터가 들어 있습니다.

```json
{
  "Step": "34",
  "ImplementationCommit": "<구현 커밋의 전체 SHA>",
  "CodePush": "pushed",
  "Summary": ["직원 화면의 표시 상태를 개선했습니다."],
  "Tests": [
    {"Command": "node --test tests/example.test.js", "Passed": 3, "Failed": 0, "NotRun": 0},
    {"Command": "격리 환경 실연동 시나리오", "Passed": 0, "Failed": 0, "NotRun": 1}
  ],
  "FailureCauses": ["None"],
  "Risks": ["실연동 검증이 남아 있습니다."],
  "Next": ["격리 환경에서 실연동 시나리오를 검증합니다."]
}
```

- `Step`은 단계 번호를 사용합니다. 번호가 없는 작업에는 소문자 식별자를 사용합니다.
- 도구는 생성 시각을 **KST**로 기록하고, 현재 브랜치와 지정된 구현 커밋의 변경 파일 목록을 Git에서 읽습니다.
- 테스트 행에는 실행한 명령과 결과 수를 적습니다. 미실행 행에는 예정 명령이나 시나리오 이름을 적고, 통과·실패는 각각 0으로 둡니다. 건너뛴 사례도 식별 가능한 범위에서 미실행 수에 포함합니다. 실패가 없으면 `FailureCauses`에 `None`, 실패가 있으면 정제된 원인을 입력합니다. 재실행한 같은 사례는 한 번만 집계하고, 앞선 실패나 재시도 경위는 요약에 적습니다.
- 필드와 테스트 명령은 한 줄의 평문으로 작성합니다. 표 구분 문자, 인라인 코드 표시, 원시 로그는 생략합니다. 입력 예시와 생성 시 사용하는 임시 파일은 커밋 대상에서 제외합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/New-CodexReport.ps1 -Mode Generate -InputPath $reportInput
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/New-CodexReport.ps1 -Mode Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-CodexReport.ps1
```

생성기는 `latest.md`와 대응하는 `history/*.md`가 일치하는지 검사합니다. 기존 최신 보고서 형식이 호환되지 않거나 기존 이력 파일과 이름이 겹치면 작업을 중단합니다. 검증기는 필수 필드, KST, 파일 목록, 테스트 행과 합계, 두 복사본의 일치를 확인합니다. 합격 메시지에 입력값이나 오류 원문은 출력하지 않습니다.

보고서는 GitHub에서 읽을 수 있는 문서입니다. 토큰, 비밀번호, 키, ADC 경로·내용, Firebase UID·이메일, 고객정보, 환경변수 값, 로컬 절대경로와 원시 로그는 입력에서 제거하세요. 자동 패턴 검사는 흔한 비밀값과 경로를 차단합니다. 고객 이름처럼 문맥이 필요한 정보는 제출자가 검토해야 합니다. 로컬 백업과 환경 설정 파일은 커밋하지 않습니다.

## 커밋과 푸시 순서

1. 작업 변경만 스테이징하고 검증한 뒤 구현 커밋을 만듭니다. 권한이 있는 경우 검증된 구현 커밋을 의도한 원격 작업 브랜치에 일반 푸시합니다.
2. 구현 SHA와 그 SHA의 푸시 결과로 보고서를 생성합니다. 구조 검증을 통과하면 최신 보고서와 이번 이력 파일만 스테이징하고 `git diff --cached --check`를 실행합니다.
3. `docs(codex): report <단계>`로 별도 보고서 커밋을 만듭니다. 권한이 있는 경우 같은 원격 브랜치에 일반 푸시합니다. 코드 푸시가 거부됐다면 보고서를 로컬에서 `not-pushed`로 남기고 원인을 정제해 기록합니다.
4. 보고서 안의 `Implementation commit`과 `Implementation push`는 구현 커밋의 SHA와 보고서를 생성할 때 확인한 푸시 결과입니다. 보고서 커밋의 SHA는 작업 브랜치에서 `latest.md`의 GitHub 파일 이력 또는 `git log -1 -- docs/codex-reports/latest.md`로 확인합니다. 최종 답변에는 두 SHA와 실제 푸시 결과를 구분해 기록합니다.

## 표준 작업 종료 지시문

> 개발·테스트 완료 후 실제 실행 결과로 Codex 최신 보고서와 단계별 이력을 갱신·검증해줘. 승인된 작업 브랜치에서 구현 커밋과 보고서 커밋을 분리하고, 푸시 결과와 두 SHA를 알려줘.
