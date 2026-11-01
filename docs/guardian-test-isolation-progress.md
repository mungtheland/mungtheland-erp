# 보호자 요청사항 테스트 환경 분리 현황

2026-11-01 개발 브랜치 `feature/guardian-request-prototype`

## 코드 변경
- `src/GuardianRequest.js`의 예약·반려견 조회 및 요청사항 저장 경로를 `mdGuardianTestSheet_` / `mdGuardianTestBook_`으로 변경.
- `src/GuardianRequestReview.js`의 예약·반려견 조회 경로도 `mdGuardianTestSheet_`으로 변경.
- `src/GuardianTestEnvironment.js`에 테스트 시트 접근 함수 추가. 테스트 ID가 비어 있거나 운영 ID와 같으면 실패.
- 기존 `mdFindById_`, `mdId_`는 공통 유틸리티로 사용하되 실제 스프레드시트 선택은 테스트 전용 함수에서 처리.

## 실행 전 필수
- 별도 Apps Script 테스트 프로젝트 및 빈 테스트 스프레드시트 생성.
- 테스트 프로젝트 Script Properties에 `MD_GUARDIAN_TEST_SPREADSHEET_ID` 설정.
- 고객·반려견관리 / 예약·등하원관리 / 보호자등원요청 테스트 시트 및 정확한 헤더 구성.
- 가명 데이터만 사용; 운영 고객 정보 복사 금지.
- 서버에서 생성된 인증 principal만 사용하도록 보호자/직원 인증 구현. 공개 호출 API 금지.
- 테스트 실행 전 모든 저장·조회 함수가 테스트 시트만 참조하는지 코드 리뷰.

## 상태
코드 작성 및 GitHub 반영만 완료. 스프레드시트 생성, 실제 함수 실행, 테스트 통과, main 병합, 운영 배포는 아직 하지 않음.
