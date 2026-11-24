# Codex work report

- Step: 36
- Work time (KST): 2026-11-24T14:32:35.722+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 301ccef84ffd1cb6f17c7a3968125bca77f82969
- Implementation push: pushed
- History: history/20261124T143235722-36-301ccef84ffd.md

## Changed files

- guardian-auth-server/firestore-attendance-activation.md
- guardian-auth-server/firestore-readonly-diagnostic.js
- guardian-auth-server/firestore-readonly-diagnostic.test.js

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node guardian-auth-server/firestore-readonly-diagnostic.js | executed | 6 | 2 | 1 |
| node --test $files | executed | 166 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --check guardian-auth-server/firestore-readonly-diagnostic.js | executed | 1 | 0 | 0 |
| node --check guardian-auth-server/firestore-readonly-diagnostic.test.js | executed | 1 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 기존 Firestore 에뮬레이터 경합·복원 시나리오 묶음 | not run | 0 | 0 | 1 |
| 실제 Firestore 출석 쓰기 검증 | not run | 0 | 0 | 1 |

- Totals: passed 179, failed 2, not run 3

## Change summary

- 지정된 테스트 프로젝트에 실제 읽기 전용 진단을 실행했습니다. 로컬 프로젝트 조건과 기존 ADC의 서비스 계정 가장 성공을 확인했습니다.
- 기본 데이터베이스 메타데이터 응답에서 위치 asia-northeast3, Firestore Native, Standard 및 삭제 표시 없음을 확인했습니다. 출석 컬렉션 목록과 문서 한 건의 메타데이터 조회에 성공했습니다.
- 프로젝트 범위 권한 확인 응답에 데이터베이스 조회와 문서 목록 및 개별 조회 권한이 포함됐습니다.
- 운영 서버와 저장 플래그를 건드리지 않도록 독립 진단 명령을 선택했습니다. 요청 대상과 응답 요약을 제한했으며 문서 내용이나 인증정보를 출력하지 않습니다.
- Node 테스트 집계에는 신규 진단 테스트 5개가 포함되며 Chromium은 하위 시나리오를 집계합니다.

## Failure causes

- IAM 정책 조회와 게시 규칙 릴리스 조회는 현재 주체에 허용되지 않아 각각 HTTP 403으로 거부됐습니다. 규칙 집합 본문 조회는 진행하지 않았습니다.

## Remaining risks

- 전체 IAM 바인딩과 게시 규칙의 클라이언트 접근 효과는 확인하지 못했습니다.
- 읽기 성공으로 출석 데이터의 생성과 갱신 권한을 판단할 수 없습니다.

## Recommended next work

- 별도로 승인된 검토자가 테스트 프로젝트의 IAM 정책과 게시 규칙을 읽기 전용으로 확인할 때까지 영구 저장 활성화를 보류합니다.
