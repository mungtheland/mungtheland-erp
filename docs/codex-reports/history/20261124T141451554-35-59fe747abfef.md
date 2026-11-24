# Codex work report

- Step: 35
- Work time (KST): 2026-11-24T14:14:51.554+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 59fe747abfefc429ba1676d0ed078f81b47369cb
- Implementation push: pushed
- History: history/20261124T141451554-35-59fe747abfef.md

## Changed files

- guardian-auth-server/cloud-attendance-preflight.test.js
- guardian-auth-server/firestore-attendance-activation.md
- guardian-auth-server/local-server.js
- guardian-auth-server/staff-arrival-http.js

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test $files | executed | 161 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --test guardian-auth-server/firestore-attendance.emulator.cjs | executed | 10 | 0 | 0 |
| node on stdin for Admin SDK settings inspection | executed | 1 | 0 | 0 |
| node --check $p | executed | 3 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 실제 클라우드 IAM과 ADC 유효성 및 게시된 보안 규칙 확인 | not run | 0 | 0 | 1 |
| 실제 데이터베이스 존재와 네트워크 및 영구 저장 통합 검증 | not run | 0 | 0 | 1 |

- Totals: passed 180, failed 0, not run 2

## Change summary

- 기본 메모리 모드와 기존 격리 Sheets 모드는 유지했습니다. 현재 점검 셸에서 쓰기 활성화 플래그는 확인되지 않았습니다.
- Firestore 모드의 프로젝트·기본 데이터베이스·연결 대상 확인을 강화하고 에뮬레이터 혼용 및 Sheets 쓰기 동시 활성화를 거부합니다.
- 의도하지 않은 쓰기를 줄이기 위해 허용된 가상 예약 한 건만 직원 HTTP 쓰기로 지정합니다. 기존 저장 모델과 읽기 흐름은 유지했습니다.
- 설치된 Admin SDK 클라이언트의 기본 데이터베이스 설정을 TCP 차단 상태에서 확인했습니다. 실제 Firestore 연결은 요청하지 않았습니다.
- 활성화 전 확인과 롤백 절차를 문서화했습니다. 최초 로컬 SDK 점검의 모듈 경로 오류는 서버 디렉터리 기준 실행으로 해결했습니다.
- Node 묶음에는 신규 사전 점검 사례 5개가 포함됩니다. Chromium과 에뮬레이터 수는 하위 시나리오만 집계합니다.

## Failure causes

- None

## Remaining risks

- 실제 클라우드 IAM 권한과 네트워크 연결은 확인이 필요합니다.
- 가상 예약 여부와 유효한 인증 주체는 로컬 정책만으로 확정할 수 없습니다.

## Recommended next work

- 실제 클라우드 검증 또는 권한 변경은 별도 명시적 승인과 문서 체크리스트 확인 후에만 진행합니다.
