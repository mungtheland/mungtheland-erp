# Codex work report

- Step: 39
- Work time (KST): 2026-11-24T14:47:08.129+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: b517b862d1aa86c8b260e08e4ea3b006f628f251
- Implementation push: pushed
- History: history/20261124T144708129-39-b517b862d1aa.md

## Changed files

- guardian-auth-server/firestore-attendance-activation.md
- guardian-auth-server/firestore-attendance-write-probe.js
- guardian-auth-server/firestore-attendance-write-probe.test.js
- guardian-auth-server/firestore-attendance.emulator.cjs
- guardian-auth-server/firestore-readonly-diagnostic.js

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test $files | executed | 173 | 0 | 0 |
| node --test guardian-auth-server/firestore-attendance.emulator.cjs | executed | 13 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node guardian-auth-server/firestore-attendance-write-probe.js | executed | 1 | 0 | 0 |
| node --check $p | executed | 4 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 실제 테스트 프로젝트 가상 출석 문서 생성·조회·삭제 시나리오 | not run | 0 | 0 | 1 |

- Totals: passed 196, failed 0, not run 1

## Change summary

- 사용자가 확인한 게시 규칙은 웹과 모바일의 직접 읽기 및 쓰기를 거부합니다. 이 단계에서 규칙을 재조회하거나 변경하지 않았습니다.
- 기존 서버와 저장 플래그를 건드리지 않기 위해 가상 문서 한 건을 검증하는 독립 명령을 구현했습니다. 기본 실행은 인증 파일과 네트워크를 사용하지 않습니다.
- 별도 승인 실행 시 테스트 프로젝트와 주체, 기본 데이터베이스와 리전, 읽기·생성·삭제 권한을 먼저 점검합니다. 문서 ID는 자동 생성하며 기존 문서가 발견되면 중단합니다.
- 생성 후 문서 내용과 최초 버전을 다시 검증한 뒤 같은 버전만 삭제합니다. 중간 실패 시 추가 쓰기 없이 복구에 필요한 가상 식별자와 확인된 버전만 남깁니다.
- 첫 에뮬레이터 실행에서 조건부 삭제 요청이 HTTP 400으로 거부됐습니다. 이후 삭제 한 건을 조건부 Commit 본문으로 전달하여 정상 삭제와 버전 충돌 거부를 확인했습니다.
- Node 묶음에는 신규 사례 6개가 포함됩니다. 에뮬레이터 13개와 Chromium 4개는 각각 하위 시나리오 수입니다.

## Failure causes

- None

## Remaining risks

- 실제 삭제 권한과 클라우드 생성·삭제 성공은 확인하지 않았습니다. 프로젝트 범위 권한 응답은 데이터베이스의 실제 작업을 보장하지 않습니다.
- 생성 응답이 유실되면 가상 문서가 남을 수 있어 읽기 전용 확인과 별도 승인 복구가 필요합니다.

## Recommended next work

- 별도 명시적 승인과 삭제 권한 확인 및 복구 담당자 지정이 완료된 경우에만 실제 테스트 프로젝트에서 단일 가상 문서 검증을 실행합니다.
