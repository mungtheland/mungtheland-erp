# Codex work report

- Step: 46-readonly-diagnostic
- Work time (KST): 2026-11-26T16:33:37.289+09:00
- Branch: feature/staff-attendance-desktop
- Implementation commit: fcaa23d04b0e563cc61845d9e860e58d9572d576
- Implementation push: pushed
- History: history/20261126T163337289-46-readonly-diagnostic-fcaa23d04b0e.md

## Changed files

- guardian-auth-server/authenticate.js
- guardian-auth-server/staff-arrival-http.js
- guardian-auth-server/staff-attendance-ui.test.js
- guardian-auth-server/staff-attendance.browser.cjs
- guardian-auth-server/staff-attendance.e2e.cjs
- guardian-auth-server/staff-auth-http.test.js
- guardian-auth-server/staff-combined-list.test.js
- guardian-auth-server/staff-local-test.html

## Tests

| Command | Status | Passed | Failed | Not run |
| --- | --- | ---: | ---: | ---: |
| Tracked ERP and guardian regression | executed | 199 | 0 | 0 |
| Chromium staff attendance scenarios | executed | 5 | 0 | 0 |
| Firestore emulator attendance scenarios | executed | 15 | 0 | 0 |
| Chromium and Firestore emulator end to end scenarios | executed | 7 | 0 | 0 |
| Live Firebase employee login and protected server authentication | executed | 1 | 0 | 0 |
| Independent preserved Firestore document and metadata | executed | 1 | 0 | 0 |
| Live protected staff booking GET | executed | 0 | 1 | 0 |
| Direct read-only Sheets range diagnostics | executed | 4 | 0 | 0 |
| Live source and attendance screen comparison and reload and re-login | not run | 0 | 0 | 1 |

- Totals: passed 232, failed 1, not run 1

## Change summary

- PASS — 승인된 기존 직원 계정의 식별 일치, 이메일 인증, 활성 상태 및 임시 매핑을 확인했습니다. 실제 브라우저 로그인 뒤 서버 Firebase ID 토큰 검증을 통과해 직원 예약 목록 핸들러에 도달했습니다.
- FAIL — 직원 예약 목록 GET은 HTTP 500이었습니다. staff-arrival-http.js의 예약 목록 분기에서 기존 격리 저장소 listForStaff의 values 읽기가 실패했고 BOOKING_LIST_FAILED Error가 기록됐습니다. 목록에 경로 매개변수는 없으며 날짜 필터는 화면에서 처리합니다. 원장 행 변환과 통합 출석 읽기에 도달하지 못했습니다.
- PASS — 직원 인증 실패는 목록 처리 전에 HTTP 401 또는 HTTP 403으로 분리됩니다. 서버 토큰 검증 성공 및 Sheets 예외 로그가 있어 이번 HTTP 500은 인증 실패 변환에서 발생하지 않았습니다.
- PASS — 이전 43단계 임시 검증과 동일한 격리 원장 및 읽기 전용 OAuth 범위를 사용했습니다. 44단계와 마찬가지로 가장 주체는 동일했습니다. 45단계는 모의 및 에뮬레이터 검증이며 일반 로컬 서버는 Google APIs 클라이언트를 사용합니다. 이번 임시 읽기 서버는 기존 원장 어댑터에 Fetch 클라이언트를 주입했습니다.
- PASS — 같은 가장 주체와 범위로 재진단한 격리 Sheets 두 범위는 순차 두 건과 병렬 두 건에서 모두 HTTP 200과 정상 JSON을 반환했습니다. 최초 예외는 전송과 JSON 파싱을 구분하지 않고 일반 오류를 기록해 근본 원인과 실제 세부 코드를 확인하지 못했습니다.
- PASS — 독립 Firestore 조회로 44단계 보존 문서는 하원 완료 및 순서가 정상인 이벤트 2건임을 확인했습니다. 문서 버전은 2026-11-26T07:07:49.696543Z로 44단계 최종 버전과 일치했습니다.
- 클라우드 리소스 읽기 또는 서버 검증 성공 8건 및 실패 2건이 로그에서 확인됐습니다. 성공 구성은 직원 Auth 2건, Firestore 독립 읽기 2건, Sheets 재진단 4건입니다. 초기 Sheets 2건은 실패했으며 그중 한 건은 종료 요약 이후 기록됐습니다. 인증 교환과 공개 인증서 요청은 별도입니다.
- 실제 출석 쓰기 API 호출 0건이며 Firestore, Sheets, Firebase Auth에 대한 명시적 데이터 생성, 수정 및 삭제는 각각 0건입니다. 임시 포트 종료와 실행 파일 제거, 기본 ADC 및 기존 미커밋 파일 해시 일치를 확인했습니다. 서버에는 코드 및 건수만 기록했고 브라우저 콘솔 인수의 수집 및 출력은 차단했습니다. 이번 변경 파일은 이 보고서 한 건입니다.

## Failure causes

- HTTP 500의 발생 위치는 격리 Sheets 읽기 경로와 직원 목록 핸들러 예외 처리입니다. 최초 전송 또는 파싱 세부 오류는 수집되지 않아 원인을 특정할 수 없습니다. 기존 계정 또는 권한을 변경하지 않았고 추정에 근거한 코드 변경도 없습니다.

## Remaining risks

- BLOCKED — 실제 인증은 성공했지만 보호된 직원 예약 목록 GET과 날짜별 표시, 원장 및 출석 상태 UI 대조, 새로고침 및 재로그인 복원은 실환경에서 완료하지 못했습니다. 모의 검증과 실환경 결과를 구분합니다.
- 실제 로그인 오류를 유도해 권한을 변경하지 않았습니다. HTTP 401과 HTTP 403의 분리 및 네트워크, 충돌, 중복 클릭은 기존 로컬 테스트에서 통과했습니다.

## Recommended next work

- 47단계 재개 전 격리 읽기 클라이언트에서 인증, HTTP 요청, 응답 파싱 및 어댑터 단계를 비민감 고정 코드로 구분하는 진단을 검증합니다. 그 후 실제 직원 목록 GET과 출석 상태 표시 및 세션 복원을 읽기 전용으로 재검증합니다.
- 실제 쓰기는 별도 승인 전까지 보류하며 44단계 문서를 보존합니다.
