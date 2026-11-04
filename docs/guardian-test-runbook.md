# 보호자 알림장 격리 테스트 실행 안내

## 테스트 데이터
- 별도 Google Sheet: https://docs.google.com/spreadsheets/d/1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY/edit
- 운영 Sheet: 절대 수정하거나 복사하지 말 것.
- 가명 fixture: CUS-TEST-001, DOG-TEST-001, RSV-TEST-001.

## 별도 Apps Script 프로젝트 구성
1. script.google.com에서 **새 프로젝트**를 생성하고 이름을 '멍더랜드 보호자 알림장 TEST'로 설정.
2. 다음 GitHub 브랜치 파일만 프로젝트에 각각 .gs 파일로 복사. **src/Code.js, src/Index.html 및 운영 ERP 전체는 복사하지 말 것.**
   - tests/GuardianTestDependencies.js
   - src/GuardianTestEnvironment.js
   - src/GuardianRequest.js
   - src/GuardianRequestReview.js
   - tests/GuardianIsolationSmokeTest.js
   - tests/GuardianWorkflowTest.js
   - tests/GuardianTestRunner.js
3. 프로젝트 설정 > 스크립트 속성: MD_GUARDIAN_TEST_SPREADSHEET_ID = 1ReLidmaD4XOBI0IRS09uDL44_RICfQ-VO2ljx4q_gYY
4. runGuardianTestPreflight를 먼저 실행. 승인창이 나오면 테스트 스프레드시트 권한만 확인.
5. 사전 검증 통과 후 runGuardianWorkflowTest를 한 번 실행. 테스트 예약 RSV-TEST-001에 테스트 요청이 기록되며, 테스트 완료 후에도 요청 행은 남는다. 재실행하려면 **테스트 시트에서 해당 요청 행만** 삭제한 뒤 진행.
6. 실행 로그의 ok:true 및 검증 항목 확인. 실패 시 로그를 보관하고 운영 ERP에는 적용하지 말 것.

## 실행 전 주의
- 본 테스트는 서버 내부 함수에 테스트용 principal 객체를 직접 전달하는 **기능 테스트**이며 보호자 본인인증 테스트가 아니다.
- 실제 공개 API/보호자 인증 구현 및 권한 검토 전 배포 금지.
- 테스트 함수는 격리 스프레드시트에만 기록한다. 테스트 예약의 등원시간/출석상태는 검증 도중 잠시 변경했다가 복원한다.
- 현재 Apps Script 프로젝트 생성 및 원격 실행은 연결 도구에서 지원하지 않으므로 **아직 실행 완료가 아니다**.
