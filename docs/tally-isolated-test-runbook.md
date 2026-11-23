# 멍더랜드 Tally 격리 테스트 설치 및 검증 절차

## 안전 범위
- **절대 운영 ERP Apps Script 프로젝트에 설치하지 말 것.**
- 전용 테스트 Google Sheets: https://docs.google.com/spreadsheets/d/1KJ3p5G7bGfUex6zMpmMKl5pShHBZ3Rh7p0nYWTHTiM8/edit
- 원본 Tally 2개는 읽기 전용, ERP 운영 시트는 사용하지 않음.
- 공개 GitHub에 실제 응답 내용, 이름, 전화번호, 서명 URL, OAuth 토큰을 올리지 않음.
- 실데이터 검증 전 테스트 시트 공유 범위를 직원에게만 제한하고 접근 권한 확인.

## 설치
1. 멍더랜드 계정으로 https://script.google.com/home/projects/create 에서 **새 독립 프로젝트** 생성. 이름: `멍더랜드 Tally 연동 격리 테스트`.
2. 아래 브랜치의 네 파일을 Apps Script 편집기에 각각 새 스크립트 파일(.gs)로 복사:
   - `src/TallyIntakeStaging.js`
   - `src/TallyReviewQueue.js`
   - `src/TallySyncTestOnly.js`
   - `src/TallyDryRunTestOnly.js`
3. 최초 실행 함수는 **`mdTallyDryRun_TEST_ONLY`** 선택. 실행 및 Google Sheets 읽기 권한 승인.
4. 실행 로그에는 개인정보가 아닌 건수만 출력되어야 함. 예: `writesPerformed:0`. 예상치와 다르면 동기화하지 말고 원인 확인.
5. 검증 후 **`mdTallySyncReviewQueue_TEST_ONLY`** 수동 실행. 테스트 접수대장에만 새로운 접수키를 추가하며 기존 행은 덮어쓰지 않음.
6. 동일 함수를 다시 실행해 `appended:0`인지 확인(중복 방지).
7. 트리거를 자동 생성하지 않음. 예약·이용권·회계 연동 및 운영 배포 금지.

## 검증 조건
- 원본 Tally 두 시트의 응답 수가 로그에 반영되는가?
- 보호자 전화번호 + 반려견명 일치 후보만 연결하는가?
- 동일 이름이더라도 전화번호가 다르면 미연결인가?
- 서명/계약동의/행동 위험/할인 신청은 직원 확인으로 남는가?
- 모든 새 행의 결제확인=`미확인`, ERP반영=`미반영`인가?
- 테스트 행 `TEST:` 접수키 3건은 유지되는가?
- 두 번째 실행에서 기존 접수키가 중복 생성되지 않는가?

## 알려진 제약
- 현재 동기화는 append-only이므로 **나중에 제출한 계약서와 기존 상품 신청서의 연결 관계를 자동 갱신하지 않음**. 직원 재확인 또는 별도 안전한 갱신 로직 필요.
- 원본 스프레드시트에서 전화번호 앞자리 0이 숫자 변환으로 사라졌다면 자동 복구하지 않음.
- 같은 보호자·반려견이 계약서를 여러 번 제출하면 후보 중복으로 보류함.
- 데이터 행의 편집 권한, 검토 이력 및 운영 배포 승인은 별도 단계.
