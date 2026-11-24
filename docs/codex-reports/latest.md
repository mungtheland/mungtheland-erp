# Codex work report

- Step: 42
- Work time (KST): 2026-11-24T15:08:19.174+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 693c8c3cf5fac9d849a39047f1991799ecd3fa5b
- Implementation push: pushed
- History: history/20261124T150819174-42-693c8c3cf5fa.md

## Changed files

- guardian-auth-server/firestore-attendance-emulator.md
- guardian-auth-server/firestore-attendance.emulator.cjs
- guardian-auth-server/staff-attendance.browser.cjs
- guardian-auth-server/staff-attendance.e2e.cjs

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test guardian-auth-server/staff-attendance.e2e.cjs | executed | 6 | 0 | 0 |
| node --test guardian-auth-server/firestore-attendance.emulator.cjs | executed | 15 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --test $files | executed | 179 | 0 | 0 |
| node --check $p | executed | 3 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 실제 테스트 Firebase 직원 인증과 예약 원장 조회 | not run | 0 | 0 | 1 |
| 실제 테스트 Firestore 직원 출석 영구 저장 | not run | 0 | 0 | 1 |

- Totals: passed 208, failed 0, not run 2

## Change summary

- 기존 Chromium 및 에뮬레이터 인프라를 재사용해 실제 직원 화면, HTTP 라우트, 출석 서비스, Admin SDK 저장소를 연결했습니다. 제품 코드와 데이터 형식은 그대로입니다.
- 실제 Firebase 인증과 예약 원장 대신 가상 직원과 예약 픽스처를 제공했습니다. 브라우저 외부 연결과 백엔드의 에뮬레이터 외 연결을 차단했습니다.
- 정상 등원과 하원, 등원 전 하원 거부, 중복 등원과 하원, 동일 요청 재전송, 서로 다른 직원의 두 HTTP 프로세스 경합을 검증했습니다.
- 커밋 뒤 응답 유실, 실제 브라우저 타임아웃, 네트워크 차단에서 화면이 다시 조회하고 필요한 재시도에 같은 요청 ID를 사용했습니다. 커밋 전 실패에는 부분 기록이 없었습니다.
- 화면 카드와 통계를 Firestore 문서의 실제 상태와 대조했습니다. 별도 직원 HTTP 프로세스 재시작 후에도 기록이 유지됐으며, 에뮬레이터 자체 재시작 후 복원은 스냅샷 내보내기와 가져오기로 별도 검증했습니다.
- 기존 메모리 및 독립 Sheets 모의 회귀가 통과했습니다. 기존 서버와 저장 플래그와 백업 및 stash를 보존했습니다.

## Failure causes

- None

## Remaining risks

- 실제 클라우드 인증과 예약 원장 연동 및 직원 화면을 통한 실제 쓰기는 미확인입니다.
- 스냅샷 없는 에뮬레이터 재시작은 기록을 유지하지 않습니다.

## Recommended next work

- 43단계 준비는 가능합니다. 실제 테스트 프로젝트에 연결하기 전 별도 승인 범위와 가상 예약 한 건 및 복구 담당자를 확정합니다.
