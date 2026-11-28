# Codex work report

- Step: mvp-tally3-evidence
- Work time (KST): 2026-11-28T16:55:34.201+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 4f8c2dbd91ca90c5e25d3e1f26afa77e2fb2e40e
- Implementation push: pushed
- History: history/20261128T165534201-mvp-tally3-evidence-4f8c2dbd91ca.md

## Changed files

- docs/admission-intake-contract.md
- docs/mvp-implementation-plan.md
- docs/tally-admission-field-mapping.md
- guardian-auth-server/tally-webhook-contract.js
- guardian-auth-server/tally-webhook-contract.test.js
- package.json

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test guardian-auth-server/admission-intake.test.js guardian-auth-server/tally-admission-csv.test.js guardian-auth-server/tally-webhook-contract.test.js | executed | 36 | 0 | 0 |
| node --check tally-webhook-contract.js and tally-webhook-contract.test.js | executed | 2 | 0 | 0 |
| npm.cmd run check | executed | 1 | 0 | 0 |
| npm.cmd run test:ci aggregate checks and TAP cases | executed | 288 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-CodexReport.ps1 | executed | 24 | 0 | 0 |
| Read-only review of three official Tally help documents | executed | 3 | 0 | 0 |
| Actual form editor screenshots, original CSV and form-specific webhook settings | not run | 0 | 0 | 1 |

- Totals: passed 355, failed 0, not run 1

## Change summary

- 로컬에서 이전에 제공된 CSV 구조 요약과 합성 테스트는 확인했으며 원본 CSV 및 편집 화면 캡처 10장은 작업 폴더에 없었습니다.
- Tally 공식 문서에서 submission ID 의미, webhook envelope/field metadata, signing-secret signature 형식, 2XX timeout 및 retry schedule을 확인했습니다.
- 비활성 합성 webhook verifier를 추가했으며 실제 form ID와 signing-secret 설정이 없으면 fail-closed 합니다.

## Failure causes

- None

## Remaining risks

- 공개 form URL을 열람할 수 없었고 editor screenshots/CSV 원본이 없어 질문별 실제 문구·내부 key·필수/conditional logic은 확정되지 않았습니다.
- 실제 formId 및 signing secret enabled 여부, delivery log/retry behavior, 실제 webhook payload field keys는 확인되지 않았습니다.
- 실제 계약/개인정보 게시본, 관리자 권한 및 개인정보 항목 의미도 미검증입니다.

## Recommended next work

- 최소 증거: 편집기에서 질문과 logic 설정이 읽히는 캡처 및 개인정보 제거된 CSV header; 실제 webhook 연동 예정 시 formId와 signing enabled 상태만 확인하고 secret은 공유하지 않습니다.
- 실제 question keys와 label/type을 redacted webhook sample 또는 관리자 export로 대조한 뒤 확인된 항목만 설정합니다.
- 실제 webhook 등록, Tally API 호출, 고객 응답 조회, 운영 저장 또는 배포는 별도 승인 전까지 진행하지 않습니다.
- 69단계 원장 초기화 B 및 Apps Script 배포 C는 미승인 상태를 유지합니다.
