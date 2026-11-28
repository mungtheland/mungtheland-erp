# 멍더랜드 ERP MVP 준비도 감사

## 범위와 판정 기준

- 감사 기준 브랜치: `feature/staff-attendance-desktop`
- 감사 기준 SHA: `0bb41c369b08ac1e13799c9f8dc271f65b335f96` (감사 시작 시 로컬·원격 일치)
- 조사 범위: 저장소 코드, 테스트, 저장소 문서와 배포·운영 체크리스트. Google Sheets, Firebase, Apps Script, 결제사, Tally 등 외부 서비스는 호출하지 않았다.
- 판정 기준: `COMPLETE`는 실제 서비스 연동과 운영에 필요한 검증 증거가 모두 있는 경우에만 사용한다. 코드나 모의 테스트만 확인된 기능은 `TESTED_LOCAL`, `PARTIAL` 등으로 분류한다.
- `COMPLETE` 기능은 없다. 이는 기존 ERP가 동작하지 않는다는 뜻이 아니라, 현재 증거만으로 실제 운영의 전 구간 완료를 입증할 수 없다는 뜻이다.

## 기능 현황

| # | 기능 | 상태 | 저장소 근거 및 확인된 동작 | 실제 연동 증거 | 미완료·차단 조건 | MVP 필수 | 예상 작업량 |
|---|---|---|---|---|---|---|---|
| 1 | Tally 입소 신청 및 이용계약 | `NOT_IMPLEMENTED` | `docs/daycare-service-agreement-draft.md`는 승인 전 초안이고, `docs/daycare-operating-policy-draft.md`도 정책 확정 항목을 표시한다. Tally 연결 코드나 제출 처리 API는 저장소에서 확인하지 못했다. | 없음. 저장소 내 Tally 연동은 발견되지 않았다. | 실제 신청 필드·계약 버전·동의 증거, 접수 주체, 중복 제출 및 수정 처리, 개인정보 고지와 보유 기준을 정하고 Tally sandbox 또는 승인된 수기 연결을 검증해야 한다. | 예 | 2–4 인일 |
| 2 | Tally 결제 신청 및 할인 검증 | `NOT_IMPLEMENTED` | `docs/pass-issuance-v2-contract.md`는 Tally, 카드사, 은행 API를 확정된 결제 참조 출처로 보지 않는다. 할인 제안 문서는 ERP 반영 전 초안이다. | 없음. 실제 결제 API 또는 검증 가능한 거래 참조 연동 증거 없음. | 할인 규칙과 유효기간, 최종 금액, 환불/취소 상태, 불변 결제 참조의 출처 및 검증 책임을 확정해야 한다. | 예 | 2–4 인일 |
| 3 | 직원 결제 확인 | `PARTIAL` | `src/Passes.js`의 `mdMarkPassPaid`는 직원이 실제 입금을 확인한 뒤 이용권 결제 상태를 바꾼다. 이미 완료된 상태는 중복 처리하지 않으며, 결제 매출 자동 기록은 하지 않는다. | 코드와 `tests/passes.integration.test.js`의 합성 검증은 확인했다. 외부 결제 증빙 대조는 확인하지 않았다. | 확인자·증빙 참조·할인 승인·환불/취소와 회계 분개를 연결하고, 권한·감사 추적을 운영 환경에서 검증해야 한다. | 예 | 1–3 인일 |
| 4 | 이용권 발급 및 중복 발급 방지 | `BLOCKED` | 기존 `mdRegisterPass`는 상품 ID 없이 상품명·횟수로 발급한다. `src/PassCatalog.js`, `src/PassIssuancePlan.js`, `src/PassIssuanceLedger.js`, `src/PassIssuancePreflight.js`에는 새 버전형 검증·PLAN_ONLY·비활성 저장 경계가 있다. | 로컬 합성 발급·멱등성 테스트 통과. 실제 승인 상품 카탈로그, 영속 V2 원장, 결제 참조, 신뢰된 요청 ID 및 격리 실증 자원은 미확정이다. | 먼저 권위 있는 상품 목록과 결제 참조·요청 ID의 신뢰 출처를 확정하고, 별도 승인된 발급 전용 Apps Script/Sheets 환경과 V2 원장 검증을 거쳐야 한다. 69단계의 원장 초기화 승인 B와 배포 승인 C는 미승인이다. | 예 | 3–5 인일 + 승인 대기 |
| 5 | 이용권 잔여 횟수, 차감·복구 | `PARTIAL` | `src/Passes.js`, `src/PassAdjust.js`는 수동 결제 확인·차감·복구 및 이력 흐름을 제공한다. `src/AttendancePassPlan.js`와 직원 서버의 차감 조정기는 별도 계획/검증 경계를 둔다. | `npm run test:ci`가 합성 잔여·중복·복구·무결성 시나리오를 통과했다. `docs/pass-adjust-release-gap-review-2026-11-10.md`는 운영 코드와 격리 코드 간 이력 불일치·부분 실패 차이를 남긴다. | 운영 차감 경로의 ID 중복·이력 불일치 처리와 복구 실패를 보완하고, 출석·수동/자동 차감의 단일 멱등 계약을 승인된 격리 원장에서 검증해야 한다. 자동 차감은 활성화하지 않는다. | 예 | 3–5 인일 + 격리 검증 |
| 6 | 보호자 예약 및 변경 | `TESTED_LOCAL` | `src/Code.js`의 `mdCreateBooking`, `src/BookingChange.js`, `src/BookingLookup.js`가 예약 생성·조회·등원 전 변경/취소·감사 이력 경로를 가진다. `guardian-auth-server/booking-http.js`는 소유자 확인을 하는 프로토타입 API다. | `tests/booking-create.integration.test.js`, `tests/booking-change.integration.test.js`, `guardian-auth-server/booking-http.test.js` 등 모의/격리 테스트가 있다. 실제 보호자 계정과 운영 원장 연결은 확인되지 않았다. | 공개 보호자 로그인과 서버 매핑, 실제 배포·권한 검증, 계약된 변경/취소 정책 및 실사용 예약 흐름 검증이 필요하다. 기존 관리자 예약 기능은 보존한다. | 예 | 2–4 인일 |
| 7 | 직원 등원·하원 관리 | `PARTIAL` | `src/Code.js`에 Sheets 출결 전이가 있고 `guardian-auth-server`에 Firebase 직원 인증, 보호된 예약 조회, Firestore 출석 저장·상태 재조회 경로와 통합 화면이 있다. | 로컬·브라우저·에뮬레이터 및 과거 명시 승인 테스트의 근거는 존재한다. 44·47단계 테스트 출석 문서는 보존 대상이다. 현재 단계에서 운영 원장과 운영 직원 전 구간을 검증하지 않았다. | Sheets 기반 기존 출결과 Firestore 직원 화면 간 운영 기준 원장·예약 ID 정합성, 실제 직원 권한, 장애 복구, 이용권 차감 후속 처리를 통합 검증해야 한다. | 예 | 2–4 인일 |
| 8 | 보호자·반려견 정보 관리 | `PARTIAL` | `src/Code.js`의 `mdRegisterDog`가 보호자/반려견 등록 구조를 사용한다. `src/GuardianInviteTest.js`, `GuardianEnrollmentTest.js`, `GuardianActivationTest.js`, `guardian-auth-server`에 초대·등록·권한 검증 프로토타입이 있다. | 기존 ERP 시트 스키마와 합성 테스트는 확인했다. `docs/guardian-production-auth-design.md`는 보호자 운영 인증을 미구현으로 명시한다. | 보호자 신원 확인·계정 연결, 개인정보 고지/보유·파기, 요청 처리, 접근 로그 및 운영 배포가 필요하다. | 예 | 2–4 인일 |
| 9 | 기본 매출·회계·정산 | `TESTED_LOCAL` | `src/Accounting.js`, `src/Settlement.js`, `src/SettlementPayment.js`, `src/SettlementAudit.js`, `src/SettlementRepair.js`, `src/SettlementV4.js`에 거래·정산 미리보기·지급 기록·대사/복구 로직이 있다. 지급 기록은 이미 실행한 이체를 기록하는 것으로, 은행 송금 실행이 아니다. | `tests/accounting-integrity.integration.test.js`, `tests/settlement.integration.test.js`, `tests/integrity.integration.test.js` 및 격리 업무 여정 테스트가 있다. 외부 은행/결제 및 실제 월말 마감은 이번 감사에서 재검증하지 않았다. | 실제 결제 증빙, 환불/취소, 할인·이용권 발급 연계, 월말 원장 대사와 권한·승인 절차를 실제 업무 데이터에 대해 검증해야 한다. | 예 | 2–4 인일 |
| 10 | 관리자·직원·보호자 권한 분리 | `PARTIAL` | `guardian-auth-server`에 Firebase 직원/보호자 역할 및 서버 측 매핑 검증이 있고, Apps Script 프로토타입에 역할별 내부 검사가 있다. 공용 계정에서 작업자 선택은 신원 인증을 대신하지 않는다. | 모의 권한 거부·소유자 경계 테스트가 있다. 실제 배포 주체, 모든 관리자 기능, 계정 수명주기와 운영 접근 정책은 전체 검증되지 않았다. | 개인별 계정, 최소 권한, 비밀 관리, 세션 만료/폐기, 감사, 권한 정기 검토와 장애 대응을 확정하고 운영 배포를 검증해야 한다. | 예 | 2–4 인일 |
| 11 | 데이터 백업 및 복구 | `PARTIAL` | `src/Backup.js`, `BackupRetention.js`, `BackupRestoreRehearsal.js`, `BackupRecoveryAudit.js`, `BackupMonitoringDiagnostics.js` 및 `docs/backup-and-recovery.md`에 백업, 복원 연습, 진단 경로가 있다. | 한 차례 Apps Script 백업 무결성과 별도 사본 복원 연습이 문서화됐다. 정기 트리거의 첫 성공 및 실제 데이터 포함 복구는 미확인이다. | 정기 실행·누락 감시 첫 성공, 계정 복구, 데이터가 있는 사본에서 복원 검증, 접근·보존·파기 정책과 담당자 확정이 필요하다. 기존 운영 백업을 삭제하거나 덮어쓰지 않는다. | 예 | 2–3 인일 + 관찰 기간 |
| 12 | 직원·보호자 웹 화면 | `PARTIAL` | `src/Index.html`은 기존 ERP 직원 메뉴를 제공한다. `guardian-auth-server/staff-attendance.js` 등은 통합 직원 출석 UI를 제공하고, 보호자 UI는 인증 연동 전 단계다. | 기존 직원 UI의 실제 화면 확인 기록과 직원 UI의 로컬/Chromium 테스트가 있다. 보호자 웹 인증·실서비스 배포는 확인되지 않았다. | 직원 UI의 운영 원장 일관성과 권한 검수, 보호자 로그인 후 본인 예약/정보만 표시하는 화면·세션·접근성·배포 검증이 필요하다. 비필수 UI 고도화는 2차다. | 직원 화면 예, 보호자 화면의 최소 로그인/예약 기능은 예 | 2–4 인일 |

## 1차 MVP 필수 범위

| MVP 작업 묶음 | 매핑 기능 | 현재 상태 | 완료 판정 기준 |
|---|---|---|---|
| 입소 신청·계약 | 1, 8 | 미완료 | 승인된 신청/계약 필드와 고지, 접수 ID, 본인 확인 및 수정/철회 경로를 격리 환경에서 검증하고 실제 업무 책임자가 승인 |
| 결제 확인 및 할인 | 2, 3 | 미완료 | 출처가 검증되는 결제 참조, 할인 규칙, 중복/취소/환불 상태, 직원 확인 감사 기록을 연결하고 대사 테스트 통과 |
| 이용권 발급·차감·복구 | 4, 5 | 미완료 | 승인 상품, 영속 멱등성, 차감/복구 이력, 부분 실패 상태, 관리자 복구 승인까지 격리 E2E 통과 |
| 보호자 예약·수정 | 6 | 미완료 | 보호자 인증/소유권 검사와 예약 생성·변경·취소 정책을 확인하고 직원 원장과 ID가 정확히 연결 |
| 직원 등·하원 | 7 | 미완료 | 개인 직원 인증, 정확 예약 연결, 한 번의 등원·하원, 상태 재조회와 오류 복구가 승인된 시험 환경에서 검증 |
| 기본 회계·정산 | 9 | 미완료 | 예약/결제/이용권 변동과 회계 증빙 연결, 월말 대사와 승인 절차 및 수정 이력 검증 |
| 필수 권한 통제 | 10 | 미완료 | 개인별 인증, 역할 분리, 최소 권한, 세션 폐기, 민감 작업 감사가 운영 환경과 일치함을 확인 |
| 백업·복구 | 11 | 미완료 | 정기 백업과 감시의 실제 성공, 보존 정책, 지정 담당자의 격리 복원 연습을 확인 |

현재 증거 기준으로 위 8개 묶음 중 `COMPLETE`는 0개, 운영 준비 완료 기준 미충족은 8개다. 각 묶음 안에 `TESTED_LOCAL` 또는 부분 구현된 하위 기능이 있으므로 이 수치는 코드 미작성 개수가 아니라 end-to-end 운영 승인 완료 개수다.

## 2차로 연기할 범위

| 연기 기능 | 범위 | 처리 원칙 |
|---|---|---|
| 알림장 고도화 | 사진·상세 기록·고급 보호자 소통 | 기존 제공 기능은 보존한다. 최소 운영과 안전에 필요한 필수 안내/기록 범위만 별도 분류한다. |
| 카카오 자동 알림 확대 | 알림톡 확장, 캠페인 및 자동 발송 확대 | 현재 업무를 막지 않는 범위의 신규 자동화는 연기한다. 필수 예약 확인 알림이 MVP 필수로 확인되면 범위를 재평가한다. |
| 고급 통계 | 다차원 운영·매출 분석 | 기존 요약과 회계 집계는 보존하고, 분석 대시보드 확장은 연기한다. |
| 비필수 UI 개선 | 장식, 고급 검색/애니메이션 등 | 보안, 접근성, 오류 복구, 핵심 업무 조작성 개선은 MVP에 포함한다. |
| 기타 신규 기능 | 호텔/일일권 확장, 자동화 확장 등 | 승인 정책·카탈로그·회계 영향이 확정되기 전 신규 범위를 추가하지 않는다. |

## 확인된 기준 문서

- `docs/go-live-readiness.md`: 조건부 보류(NO-GO), 정기 자동 백업 첫 실행과 개인정보·계정·현장 운영 절차 미완료.
- `docs/backup-and-recovery.md`: 자동 백업 실행/보존 자동 삭제가 구현·검증되지 않았다고 명시.
- `docs/pass-adjust-release-gap-review-2026-11-10.md`: 운영 차감 코드의 이력 불일치 및 부분 실패 위험과 배포 전 차이.
- `docs/pass-issuance-v2-contract.md`: Tally/결제 API 연동 미확정, 상품·결제 참조·요청 ID·V2 원장 게이트.
- `docs/pass-issuance-test-runtime-plan.md`, `docs/pass-issuance-environment-provisioning.md`: 발급 실증용 Apps Script/워크북 미생성, 로컬 합성 검증과 실제 환경의 분리.
- `docs/guardian-production-auth-design.md`: 보호자 운영 인증·계정 연결·배포 미구현.
- `docs/daycare-service-agreement-draft.md`, `docs/privacy-and-access-procedure.md`: 계약·개인정보 운영 내용은 승인 전 초안.

## 감사 제한

이번 작업은 저장소와 로컬 테스트만 사용했다. 운영 Sheets의 존재/상태, 실제 Tally 구성, 결제·은행 계정, 현재 배포 버전, 운영 IAM 및 트리거 실행은 조회하지 않았다. 이 항목은 테스트 결과로 보완하지 않고 `UNVERIFIED` 또는 `BLOCKED`로 남긴다. 69단계 전용 TEST 환경의 원장 초기화 승인 B와 배포 승인 C는 미승인 상태다.
