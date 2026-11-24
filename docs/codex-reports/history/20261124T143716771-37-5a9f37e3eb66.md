# Codex work report

- Step: 37
- Work time (KST): 2026-11-24T14:37:16.771+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 5a9f37e3eb668047ea05595cb21a34c8efa1db75
- Implementation push: pushed
- History: history/20261124T143716771-37-5a9f37e3eb66.md

## Changed files

- guardian-auth-server/firestore-attendance-activation.md
- guardian-auth-server/firestore-readonly-diagnostic.js
- guardian-auth-server/firestore-readonly-diagnostic.test.js

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node guardian-auth-server/firestore-readonly-diagnostic.js | executed | 6 | 2 | 1 |
| node --test $files | executed | 167 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --check $paths | executed | 2 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 기존 관리자 주체를 통한 테스트 프로젝트 정책·규칙 검토 | not run | 0 | 0 | 1 |
| 실제 Firestore 쓰기 검증 | not run | 0 | 0 | 1 |
| Firestore 에뮬레이터 경합·복원 묶음 | not run | 0 | 0 | 1 |

- Totals: passed 180, failed 2, not run 4

## Change summary

- 현재 로컬 ADC가 지정된 테스트 프로젝트의 기존 주체를 가리키는지 확인하고 같은 주체로 읽기 전용 진단을 재실행했습니다.
- 프로젝트에 연관된 기존 로컬 CLI 설정은 확인했으나 저장된 세션에서 사용 가능한 관리자 자격을 확인하지 못했습니다. 자격을 갱신하거나 다른 주체로 실행하지 않았습니다.
- 기존 진단을 재사용해 프로젝트 범위에서 트랜잭션에 필요한 데이터베이스 접근, 문서 읽기, 생성 및 갱신 권한이 반환되는지 확인했습니다. 실제 저장 요청은 보내지 않았습니다.
- 서버 IAM과 웹 클라이언트 보안 규칙의 적용 범위를 구분하고 활성화 조건을 문서화했습니다.
- 회귀 테스트에는 신규 권한 응답 검사 한 건이 포함되며 Chromium 수는 하위 시나리오만 집계합니다.

## Failure causes

- 프로젝트 IAM 정책 조회와 게시 규칙 릴리스 조회는 현재 주체에 HTTP 403을 반환했습니다. 프로젝트 권한 응답에도 해당 조회 권한이 없었고 규칙 본문 조회는 미실행입니다.

## Remaining risks

- 실제 IAM 바인딩과 게시 규칙 본문 및 웹 직접 쓰기 허용 여부는 확인되지 않았습니다.
- 프로젝트 범위 권한 응답은 실제 데이터베이스에서의 커밋 성공이나 허용 범위를 보장하지 않습니다.

## Recommended next work

- 38단계에서는 기존 권한을 가진 검토자가 IAM 바인딩과 게시 규칙을 읽기 전용으로 확인합니다. 이후 확인된 규칙을 격리 에뮬레이터에서 검증하기 전까지 영구 저장을 보류합니다.
