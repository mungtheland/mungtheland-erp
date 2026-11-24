# Codex work report

- Step: 34
- Work time (KST): 2026-11-24T14:04:06.853+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 343a2d92509c59ed6bee07aff23553087ffb74bb
- Implementation push: pushed
- History: history/20261124T140406853-34-343a2d92509c.md

## Changed files

- guardian-auth-server/firestore-attendance-emulator.md
- guardian-auth-server/firestore-attendance-store.js
- guardian-auth-server/firestore-attendance.emulator.cjs

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test guardian-auth-server/firestore-attendance.emulator.cjs | executed | 10 | 0 | 0 |
| node --test $files | executed | 156 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node --check guardian-auth-server/firestore-attendance.emulator.cjs | executed | 1 | 0 | 0 |
| node --check guardian-auth-server/firestore-attendance-store.js | executed | 1 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 실제 클라우드 Firestore 영구 저장 통합 검증 | not run | 0 | 0 | 1 |

- Totals: passed 173, failed 0, not run 1

## Change summary

- 원격 작업 브랜치와 로컬 커밋이 일치하는 것을 확인했습니다.
- 기존 어댑터의 프로젝트 제한을 유지하고 동일한 저장 로직을 호출하는 루프백 전용 진입점을 추가했습니다. 서버와 저장 플래그를 그대로 유지하기 위해 별도 하네스를 선택했습니다.
- Firebase CLI가 지정한 에뮬레이터와 포터블 Java를 체크섬 검증 후 사용했습니다. 실제 Admin SDK는 전용 루프백에만 연결하도록 검증했습니다.
- 서로 다른 직원의 다중 프로세스 경합, 동일 요청 ID 재전송, 상태 충돌, 등원 전 하원 거부, 손상 이력과 시각 역전 차단을 검증했습니다.
- 커밋 성공 후 HTTP 핸들러 응답 본문을 폐기하고 동일 ID로 재시도해 이벤트가 하나만 남음을 확인했습니다. Chromium에서는 별도로 모의 연결 장애를 재현했습니다.
- 별도 Node 프로세스가 기존 기록을 읽었습니다. 일반 에뮬레이터 재시작은 기록을 초기화했고, 스냅샷을 가져온 새 프로세스에서는 동일 기록이 복원됐습니다.
- 테스트 수는 에뮬레이터 하위 시나리오 10개와 Chromium 하위 시나리오 4개를 집계합니다. 기존 Node 묶음은 서버 단위 테스트 전체와 ERP 출석 통합 테스트입니다.

## Failure causes

- None

## Remaining risks

- 스냅샷 없는 에뮬레이터 재시작은 기록을 보존하지 않습니다.
- 클라우드 환경의 권한과 실제 네트워크 동작은 확인하지 않았습니다.
- 에뮬레이터 진입점은 SDK가 해석한 내부 연결 설정을 확인하며 설정 형식 변경 시 실행을 중단합니다.

## Recommended next work

- 별도로 승인된 범위에서만 테스트 프로젝트 권한과 영구 저장 활성화 조건을 검토합니다.
