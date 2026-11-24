# Codex work report

- Step: 33
- Work time (KST): 2026-11-24T13:54:43.881+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 4c1da383d34aae52ac179c8fee0e5bfcc2d21cc0
- Implementation push: pushed
- History: history/20261124T135443881-33-4c1da383d34a.md

## Changed files

- guardian-auth-server/attendance-history.js
- guardian-auth-server/firestore-attendance-store.js
- guardian-auth-server/firestore-attendance-store.test.js
- guardian-auth-server/isolated-attendance-store.test.js
- guardian-auth-server/staff-arrival-http.js
- guardian-auth-server/staff-attendance-ui.test.js
- guardian-auth-server/staff-attendance.browser.cjs
- guardian-auth-server/staff-attendance.js
- guardian-auth-server/staff-local-test.html
- guardian-auth-server/transactional-attendance.test.js

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test $files | executed | 156 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --check $p | executed | 9 | 0 | 0 |
| node --check (HTML module via stdin) | executed | 1 | 0 | 0 |
| git diff --check | executed | 1 | 0 | 0 |
| 실제 Firestore 다중 프로세스 경합 | not run | 0 | 0 | 1 |
| 실제 Firestore 커밋 응답 유실 | not run | 0 | 0 | 1 |

- Totals: passed 171, failed 0, not run 2

## Change summary

- 33단계의 당시 구현 및 테스트를 소급 기록했습니다. KST 시각은 등록 시각입니다.
- 트랜잭션이 확인한 이력으로 API 응답을 생성합니다. 응답 유실과 타임아웃 시 상태를 다시 읽어 카드와 통계를 갱신합니다.
- 같은 예약·직원·동작과 요청 ID의 재전송은 이벤트를 추가하지 않습니다. 기존 문서 형식과 헤더 없는 호출을 지원합니다.
- 로컬 테스트는 직원 서버 단위 테스트 전체와 ERP 출석 통합 테스트를 실행했습니다. Chromium 상위 묶음은 시나리오 수에서 제외했습니다.
- 초기 모의 실행의 Sheets 예외 기대값과 Chromium 연결 종료 픽스처 문제는 수정 후 모두 통과했습니다.

## Failure causes

- None

## Remaining risks

- 실제 Firestore 경합과 응답 유실은 확인이 필요합니다.
- 미확정 요청 ID는 페이지 메모리에만 남습니다. Sheets 저장 모드는 프로세스 간 원자성을 보장하지 않습니다.

## Recommended next work

- 별도 승인된 격리 환경에서 동시 요청과 커밋 응답 유실 및 재시작 복원을 검증합니다.
