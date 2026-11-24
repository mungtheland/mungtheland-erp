# Codex work report

- Step: 40
- Work time (KST): 2026-11-24T14:55:58.116+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: 496ae4b0ac8451116d60318cedd3a6da7a619b7b
- Implementation push: pushed
- History: history/20261124T145558116-40-496ae4b0ac84.md

## Changed files

- guardian-auth-server/firestore-attendance-activation.md
- guardian-auth-server/firestore-attendance-probe-target.js
- guardian-auth-server/firestore-attendance-residue-check.js
- guardian-auth-server/firestore-attendance-residue-check.test.js
- guardian-auth-server/firestore-attendance-write-probe.js
- guardian-auth-server/firestore-attendance-write-probe.test.js
- guardian-auth-server/firestore-attendance.emulator.cjs

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| node --test $files | executed | 179 | 0 | 0 |
| node --test guardian-auth-server/firestore-attendance.emulator.cjs | executed | 15 | 0 | 0 |
| node --test guardian-auth-server/staff-attendance.browser.cjs | executed | 4 | 0 | 0 |
| node guardian-auth-server/firestore-attendance-write-probe.js | executed | 1 | 0 | 0 |
| node guardian-auth-server/firestore-attendance-residue-check.js | executed | 1 | 0 | 0 |
| node --check $p | executed | 6 | 0 | 0 |
| git diff --cached --check | executed | 1 | 0 | 0 |
| 실제 테스트 프로젝트 쓰기·삭제 검증 | not run | 0 | 0 | 1 |
| 실제 테스트 프로젝트 잔여 문서 읽기 | not run | 0 | 0 | 1 |

- Totals: passed 207, failed 0, not run 2

## Change summary

- 쓰기 도구와 읽기 전용 잔여 확인에 같은 테스트 대상 검사와 만료 설정을 사용했습니다. 두 명령의 기본 실행은 인증과 네트워크 없이 종료합니다.
- 쓰기 시도 전에 가상 문서 ID와 예상 내용 해시를 남기고, 생성 응답을 검증한 뒤에만 생성 버전을 기록합니다.
- 잔여 확인은 허용된 형식의 가상 ID 한 건만 읽으며 내용과 버전의 일치 여부만 표시합니다. 문서 본문이나 개인정보는 출력하지 않습니다.
- 복구 위험을 줄이기 위해 자동 삭제 도구를 추가하지 않았습니다. 원래 생성 증거와 별도 승인 및 동일 버전 조건이 필요하도록 수동 복구를 문서화했습니다.
- 에뮬레이터에서 생성 응답 유실 후 남은 문서와 삭제 응답 유실 후 부재를 확인했습니다. 권한 거부와 타임아웃 및 충돌에서 추가 요청을 보내지 않는 동작은 모의 응답으로 검증했습니다.
- Node 묶음은 신규 사례 6개를 포함합니다. 에뮬레이터 15개와 Chromium 4개는 각각 하위 시나리오 수입니다. 백업 네 개의 해시가 기존 stash와 일치했습니다.

## Failure causes

- None

## Remaining risks

- 미확인 항목은 실제 클라우드 작업과 현재 삭제 권한입니다.
- 차단 대상은 생성 응답이 없거나 원본 기록과 해시 또는 버전이 달라 소유권을 확인할 수 없는 문서의 삭제입니다.

## Recommended next work

- 명시적 승인과 실제 작업 권한 확인 및 복구 담당자 지정이 완료된 다음에만 단일 가상 문서의 실제 클라우드 검증을 진행합니다.
