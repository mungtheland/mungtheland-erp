# MVP 4 — Tally 연결 Google Sheets 접수 계약

## 근거 및 상태

작업 기준으로 제공된 원본 구조는 `시트1`의 51개 열(A:AY)과 테스트 응답 1건이다. 이번 세션에서 Google Sheets API를 호출하거나 응답 행을 읽지 않았다. 따라서 아래 열 구간은 사용자 제공 구조를 문서화한 것이며, 개별 헤더 문자열·질문 ID·실제 행 값은 독립 재검증되지 않았다. 열 위치는 Tally 내부 질문 ID가 아니다.

기존 CSV 내보내기는 55열 계약이고 이 문서는 51열 Google Sheets 계약이다. CSV parser와 Sheets adapter는 별도 모듈이며, 두 형식 간 위치 호환이나 자동 변환을 가정하지 않는다.

| 시트 열 | 제공된 구간 설명 | ERP 후보 | 현재 판정 |
|---|---|---|---|
| A:C | 제출 ID, 응답자 ID, 제출 시각 | sourceSubmissionId, 수신 시각 후보 | 구조는 제공 근거, 실제 헤더/ID 안정성은 `PENDING_VERIFICATION` |
| D:G | 보호자 이름, 연락처, 비상연락처, 관계 | guardianName, phone, emergencyPhone, relationship | 개별 헤더 및 필수 여부 `PENDING_VERIFICATION` |
| H:O | 반려견 기본 정보 | dogName, breed, birthDate, sex, neutered, weight 후보 | 열별 의미/타입/필수 여부 `PENDING_VERIFICATION` |
| P:AA | 행동·공격성 질문 및 상세 응답 | bite/aggression/resource guarding 등 후보 | 조건식 및 조건부 필수 여부 `PENDING_VERIFICATION` |
| AB:AJ | 질병, 약물, 알레르기, 최근 증상, 예방접종 | health, medication, allergy, recentSymptoms, vaccination 후보 | 개별 열/조건 규칙 `PENDING_VERIFICATION` |
| AK:AL | 유치원 생활 주의사항 | notes 후보 | 실제 문구·필수 여부 `PENDING_VERIFICATION` |
| AM:AV | 계약·사고·고지·개인정보 동의 관련 열 | 개별 contract/privacy evidence 후보 | 의미별 매핑 및 동의 표현 `PENDING_VERIFICATION`; 합치지 않음 |
| AW | 사진·영상 홍보 선택 동의 | photoMarketing | 빈 값은 false. 실제 선택 문구/토큰은 `PENDING_VERIFICATION` |
| AX:AY | 전자서명, 서명자 성명 | signature evidence, signer name | 서명 URL/증거 참조의 의미·보존 계약 `PENDING_VERIFICATION`; 개인정보 값 반환/로그 금지 |

별도 마케팅 수신 열은 제공된 구조에서 확인되지 않았으므로 존재를 가정하지 않는다. 접수 결과에서는 기본 false로 둔다. 계약 동의와 개인정보 처리 고지는 분리한다. 사진·영상 선택 동의도 필수 계약 동의와 분리한다.

## 읽기 전용 adapter

`guardian-auth-server/tally-admission-sheets.js`는 명시적인 `get` 전용 reader port만 받아 허용된 원본 spreadsheet ID와 `시트1!A:AY` 범위를 요청한다. adapter에는 append/update/delete 메서드나 credential 생성이 없다. 이 모듈은 실행 시 외부 접근을 하지 않으며, 실제 reader 연결과 스케줄 등록은 없다.

헤더 manifest는 정확히 51개의 비어 있지 않은 고유 헤더를 순서 그대로 받아 비교한다. 현재 작업 자료에는 개별 헤더 51개가 없어 실제 manifest는 설정하지 않았다. 열별 binding도 `verified: true`, 정확한 헤더명과 index가 모두 제공될 때만 허용한다. 따라서 현재 증거만으로 실데이터 mapping은 fail-closed 상태다. Google Sheets 값 응답은 끝의 빈 셀을 생략할 수 있어 행을 51칸까지 채우되 51열 초과는 거부한다.

정규화 결과는 필수값 누락을 식별하되 항상 `NEEDS_REVIEW`이며 승인/계약완료 상태 전이는 노출하지 않는다. 조건부 규칙은 편집 설정에서 검증된 구성만 적용한다. 미검증 조건은 `PENDING_VERIFICATION`으로 남는다. 서명 URL과 서명자 값은 diagnostics의 정규화 결과에 포함하지 않고 존재/형식 상태만 제공한다. 원시 행을 로그에 출력하지 않는다.

`Submission ID`는 A열의 정확 ID 후보로만 다루고 서버 `applicationId`와 구분한다. `fingerprintSheetsSubmission`은 원본 행을 외부 노출하지 않는 keyed HMAC-SHA256 지문으로 만들며, production 호출에는 외부 비밀 관리에서 주입되는 키가 필수다. 키를 설정 파일/저장소에 두지 않는다. 동일 ID·동일 지문은 `DUPLICATE_UNCHANGED`, 동일 ID·다른 지문은 `CONFLICT_CHANGED_CONTENT`다. 이 단계에는 영속 cursor/repository가 없으므로 재시도 위치와 중복 결과를 운영 수준으로 보장하지 않는다. 처리 실패 행은 별도 승인된 영속 상태 저장소가 정해지기 전까지 자동 재시도 대상이라고 주장하지 않는다.

## 원본 증거와 Tally webhook의 차이

Sheets 값은 Tally가 기존 연결을 통해 내보낸 현재 셀 값과 열 제목을 제공할 수 있지만, 원본 webhook의 event envelope, `data.fields[].key`, event ID, 서명 헤더 검증, 전달·재시도 메타데이터를 증명하지 않는다. AX 전자서명 셀의 URL/값만으로 원본 서명 증거 또는 보존 가능한 서명 바이너리라고 단정하지 않는다. 기존 webhook verifier는 별도 합성 계약 모듈이며 Sheets parser와 결합하지 않는다.

## 테스트와 게이트

`guardian-auth-server/tally-admission-sheets.test.js`는 합성 헤더/행만 쓴다. 헤더 폭·순서·누락·중복·추가 열, 필수값, 조건부 상세, 동의 미확정, 서명 정보 비노출, 정확 ID replay/conflict, 허용된 GET 범위, 쓰기 port 차단을 검사한다. 실제 sheet를 호출하지 않는다.

실제 연동 전에는 관리자가 개인정보를 제거한 51개 정확 헤더와 해당 헤더 순서의 승인을 제공해야 한다. 질문 ID/조건 설정은 Tally 편집 화면 또는 권한 있는 export로 확인해야 한다. 주기 실행, cursor 저장, 실패 재시도, 접수 저장 포트와 권한 주체는 별도 설계/승인 후에만 추가한다. 개발 테스트용 별도 spreadsheet도 쓰기 승인 전까지 수정하지 않는다. 69단계 TEST 원장 초기화 B와 Apps Script 배포 C는 미승인 상태를 유지한다.
