# Tally 입소 신청 필드 대조 — MVP 3단계 CSV 보완

## 증거 상태

작업 폴더에는 요청된 편집 화면 캡처 10장이나 원본 CSV 파일이 없다. 이전 단계에 사용자가 전달한 55열 CSV 구조 요약만 `VERIFIED_FROM_CSV`로 유지하며, 실제 CSV 파일/테스트 응답 값은 저장소에 추가하지 않았다. 공개 양식 URL은 이번 열람 도구에서 열리지 않았다. Tally 편집 화면 캡처나 실제 설정 export가 없으므로 form-specific 편집기 증거는 표시하지 않는다.

- CSV에서 확인된 열 번호·헤더·그룹: `VERIFIED_FROM_CSV`
- CSV 열이 실제 응답을 표현하는 형식인지에 관한 테스트: 합성 데이터만 `SYNTHETIC_TEST_ONLY`
- Tally 내부 질문 ID, 현재 운영 질문 여부, 조건부 표시/필수 규칙, webhook 형식과 인증: `PENDING_VERIFICATION`
- 편집 화면에서 직접 대조한 사항: 없음

Tally 공식 문서는 webhook의 일반 payload/signature/retry 제품 계약 근거로 별도 검토했다. 이 문서는 해당 양식의 실제 webhook 활성화, 실제 form ID 또는 actual signing-secret 설정을 증명하지 않으므로 이 항목들의 설정 상태는 `PENDING_VERIFICATION`이다.

CSV 열 순서는 1부터 센 원본 순번이다. 열 번호는 Tally 질문 ID가 아니다. CSV export 형식이 webhook payload 형식과 같다고 간주하지 않는다.

## 열 구조와 ERP 매핑 상태

| CSV 열 | CSV에서 확인된 제목/범주 | 관찰된 응답 구조 | ERP 대상 후보 | 상태 및 처리 |
|---|---|---|---|---|
| 1 | `Submission ID` | 제출 식별자 후보 열 | `sourceSubmissionId` | `VERIFIED_FROM_CSV`; 진위·안정성·webhook 신뢰는 `PENDING_VERIFICATION` |
| 2 | `Respondent ID` | 응답자 식별자 열 | 자동 고객 연결에 사용하지 않음 | 열 존재 `VERIFIED_FROM_CSV`; 의미/안정성은 `PENDING_VERIFICATION` |
| 3 | `Submitted at` | 제출 시각 열 | 접수 시각 후보 | 열 존재 `VERIFIED_FROM_CSV`; 시간대·원본 보증은 `PENDING_VERIFICATION` |
| 4–40 | 보호자/반려견 정보, 공격성·행동, 건강·접종, 기생충 예방 및 주의사항 범주 | 개별 제목과 타입이 이 보고 입력에 제공되지 않음 | 기본정보는 기존 `src/Code.js` 필드 후보. 공격성/물림/자원방어/사람 접촉 거부/분리불안/질병/약/알레르기/최근 7일 증상/접종/기생충은 개별 의미 매핑 보류 | 범위/주제 `VERIFIED_FROM_CSV`; 세부 제목·타입·필수/조건부·ERP 매핑 `PENDING_VERIFICATION` |
| 5 | `보호자 휴대전화 번호를 입력해 주세요.` | 테스트 응답 공란 | `phone` 후보 | 헤더/위치 및 공란 관찰 `VERIFIED_FROM_CSV`; 현재 질문 출처 미검증 |
| 6 | `비상연락처를 입력해 주세요` | 테스트 응답 공란 | `emergencyPhone` 후보 | 헤더/위치 및 공란 관찰 `VERIFIED_FROM_CSV`; 현재 질문 출처 미검증 |
| 37–38 | 내·외부 기생충 예방 관련 열 | 제공된 테스트 응답은 두 셀 공란 | 승인된 ERP 필드 없음 | 공란 관찰 `VERIFIED_FROM_CSV`; 정상 조건부 미응답인지 원인 불명, `PENDING_VERIFICATION` |
| 41–50 | 계약 및 필수 확인/동의 항목의 2열씩 출력된 다섯 쌍 | 개별 제목·값·체크 표현은 미제공 | 검증된 논리 동의 항목별 별도 evidence | 쌍 구조 `VERIFIED_FROM_CSV`; 각 쌍의 동일 질문 ID 여부, 출력 의미, required 여부 `PENDING_VERIFICATION` |
| 51 | 사진·영상 홍보 선택 동의 | 열 존재 확인 | `photoMarketing`, 기본 false | 항목 범주 `VERIFIED_FROM_CSV`; 제목/응답 토큰/선택성 `PENDING_VERIFICATION` |
| 52 | 전자서명 | URL 또는 서명 자료 열 | 계약 증거와 별도 서명 참조 | 범주 `VERIFIED_FROM_CSV`; 응답형식·원본 보존/접근 계약 `PENDING_VERIFICATION` |
| 53 | 서명자 성명 | 서명자 이름 열 | 서명 evidence metadata | 범주 `VERIFIED_FROM_CSV`; 신청자와의 관계 검증 미확인 |
| 54 | `보호자 휴대전화 번호를 입력해 주세요. (2)` | 테스트 응답 값 있음 | `phone` 후보 중복 열 | 헤더/위치 및 값 존재 여부 `VERIFIED_FROM_CSV`; 실제 값은 기록하지 않음 |
| 55 | `비상연락처를 입력해 주세요.` | 테스트 응답 값 있음 | `emergencyPhone` 후보 중복 열 | 헤더/위치 및 값 존재 여부 `VERIFIED_FROM_CSV`; 실제 값은 기록하지 않음 |
| 별도 확인 없음 | 마케팅 수신 선택 동의 | 확인된 별도 열 없음 | `marketingMessages`, 기본 false | 존재를 가정하지 않음; `PENDING_VERIFICATION` |

## 요청 항목별 질문 대조표

아래 범위 표시는 사용자 제공 CSV 구조 요약에서 확인된 수준이다. 개별 column index와 정확한 질문 문구가 제공되지 않은 항목에는 열 번호를 임의 배정하지 않았다.

| 논리 항목 | 실제 Tally 질문 문구 | CSV 열 | ERP 후보 | 증거 출처 | 매핑 상태 |
|---|---|---:|---|---|---|
| 보호자 이름 | 원본 미확인 | 4–40 범위 내로만 확인 | `guardianName` 후보 | CSV 구조 요약, 기존 ERP schema | `PENDING_VERIFICATION` |
| 보호자 휴대전화 | `보호자 휴대전화 번호를 입력해 주세요.` 및 `(2)` 표기 열 | 5, 54 | `phone` 후보 | CSV 헤더/열 위치 요약 | `PENDING_VERIFICATION` |
| 비상연락처 | `비상연락처를 입력해 주세요` 및 마침표 표기 열 | 6, 55 | `emergencyPhone` 후보 | CSV 헤더/열 위치 요약 | `PENDING_VERIFICATION` |
| 반려견 이름·품종·생년월일·성별·중성화·체중 | 개별 문구 미확인 | 4–40 범위 내 개별 열 미확인 | 기존 `dogName`, `breed`, `birthDate`, `sex`, `neutered`, `weight` 후보 | CSV 범주 요약, 기존 ERP schema | `PENDING_VERIFICATION` |
| 물림 이력 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | 확정 ERP field 없음 | CSV 범주 요약만 | `PENDING_VERIFICATION` |
| 공격 시도/공격적으로 달려듦 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `notes` 후보이나 의미 미확정 | CSV 범주 요약만 | `PENDING_VERIFICATION` |
| 다른 개 접근 시 경계 행동 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `notes` 후보이나 의미 미확정 | CSV 범주 요약만 | `PENDING_VERIFICATION` |
| 자원 방어 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `notes` 후보이나 의미 미확정 | CSV 범주 요약만 | `PENDING_VERIFICATION` |
| 사람 접촉 거부·분리불안 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `notes` 후보이나 의미 미확정 | CSV 범주 요약만 | `PENDING_VERIFICATION` |
| 질병·복용약·알레르기·최근 증상 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `health` 후보, 세부 schema 매핑 미확정 | CSV 범주 요약, 기존 ERP schema | `PENDING_VERIFICATION` |
| 최근 7일 내 이상 증상 | 원본 문구/기간 설정 미확인 | 4–40 범위 내 개별 열 미확인 | `health` 후보, 조건부 기간 의미 미확정 | 안전 항목 요약만 | `PENDING_VERIFICATION` |
| 예방접종 | 원본 미확인 | 4–40 범위 내 개별 열 미확인 | `vaccines` 후보 | CSV 범주 요약, 기존 ERP schema | `PENDING_VERIFICATION` |
| 내·외부 기생충 예방 | 원본 미확인 | 37–38 | 확인된 ERP 대응 field 없음 | CSV 열 범주/공란 요약 | `PENDING_VERIFICATION` |
| 계약 필수 확인·동의 | 각 질문의 정확한 문구 미확인 | 41–50의 2열 출력 다섯 쌍 | 항목별 별도 계약 evidence | CSV 구조 요약 | `PENDING_VERIFICATION` |
| 개인정보 처리 고지 | 원본 미확인 | 41–50 내 포함 여부 미확인 | 계약 동의와 분리된 notice evidence | CSV 구조 요약만으로 항목 특정 불가 | `PENDING_VERIFICATION` |
| 사진·영상 홍보 선택 동의 | 원본 질문 문구 미확인 | 51 | `photoMarketing`, 기본 false | CSV 구조 요약 | `PENDING_VERIFICATION` |
| 마케팅 수신 선택 동의 | 원본 질문 없음/미확인 | 별도 열 확인 안 됨 | `marketingMessages`, 기본 false | CSV 구조 요약 | `PENDING_VERIFICATION` |
| 전자서명 | 원본 질문 문구 미확인 | 52 | 별도 signature reference | CSV 구조 요약, Tally signature product docs | `PENDING_VERIFICATION` |
| 서명자 성명 | 원본 질문 문구 미확인 | 53 | 별도 signer metadata | CSV 구조 요약 | `PENDING_VERIFICATION` |

CSV에 응답이 공란인 37–38열은 실제 화면의 조건식이나 해당 질문의 필수 설정이 확인되지 않아 `PENDING_VERIFICATION`이다. 정상적인 조건부 미노출/미응답으로 분류하지 않는다.

### 중복 연락처 처리 규칙

| 항목 | CSV 관찰 | 로컬 판정 규칙 |
|---|---|---|
| 보호자 휴대전화 (5, 54열) | 앞 열 공란, 뒤 열에 값 존재 | 출처가 검증되지 않은 단일 값은 `SINGLE_VALUE_SOURCE_UNVERIFIED`; 자동 선택/운영 매핑 금지 |
| 비상연락처 (6, 55열) | 앞 열 공란, 뒤 열에 값 존재 | 동일하게 출처가 검증되기 전까지 보류 |
| 두 열 모두 같은 비공란 값 | CSV 응답 의미만 동일 | 값 쌍은 일치하나 출처 미검증이면 `SAME_VALUE_SOURCE_UNVERIFIED`, 사용할 값은 반환하지 않음 |
| 두 열의 값이 다름 | 잠재 충돌 | `CONFLICT`; 직원/운영자 확인 전 차단 |
| 두 열 모두 공란 | 미수집 | `REQUIRED_VALUE_MISSING`; 실제 필수 여부도 확인 필요 |
| 연락처 자료형 | CSV parser 입력 | 항상 문자열로 보존하고 숫자 형변환 금지(선행 0 보존) |

원본 연락처 값, Submission ID, Respondent ID, 서명 URL 및 서명자 성명은 저장소·로그·보고서에 기록하지 않는다. CSV 진단 결과는 상태 코드와 집계만 반환한다.

## 계약, 동의, 서명

- 41–50열은 열 쌍 다섯 개로 출력된다는 구조까지만 확인했다. 제목 또는 값 표현이 동일해 보이더라도 같은 Tally 내부 질문 ID라고 추정하지 않는다.
- 로컬 `normalizeConsentPairs`는 논리 동의 ID가 중복되면 차단하고, 매핑/응답 의미가 검증되지 않으면 `PENDING_VERIFICATION`을 반환한다. CSV 열 쌍의 원시 출력이 다르면 의미상 충돌로 단정하지 않고 `RAW_OUTPUTS_DIFFER_PENDING_SEMANTIC_VERIFICATION`으로 보류한다. 검증된 토큰을 적용한 후에만 의미상 충돌, 누락, 형식 오류를 구분한다.
- 51열 사진·영상 동의는 다른 동의와 별도다. 빈 값은 합성 진단에서만 기본 false다. 비어 있지 않은 값은 실제 응답 토큰 계약이 검증되기 전까지 의미를 해석하지 않는다.
- 별도 마케팅 동의 열은 확인되지 않았다. `marketingMessages`는 기본 false이며 동의 열을 만들어내지 않는다.
- 52열 서명 참조와 53열 서명자 이름은 계약 체크박스나 개인정보 고지로 대체하지 않는다. 로컬 검증기는 HTTPS reference 형식만 검사하며 실제 Tally 증거의 유효성을 판정하지 않는다. URL/원본 서명/이름을 반환하지 않는다. Tally의 URL 형식과 원본 증거 보존 정책은 미확정이다.
- 계약 동의와 개인정보 처리 고지는 별개 증거다. 실제 계약 v1.0 및 시행일 2026-12-07을 배포 문서와 대조하지 않았으므로 실제 `CONTRACTED` 전이는 계속 차단한다.
- 최초 방문 직원 신원확인은 Tally 제출과 독립된 이벤트이며 기존 workflow에서 별도로 유지한다.

## 제출 식별자와 자동 연결 방지

CSV 1열의 `Submission ID`는 candidate source ID다. Tally 공식 FAQ는 제출 ID를 현재 form submission의 고유 ID이며 각 제출마다 다르다고 설명하고, webhook example은 `data.submissionId`와 `data.responseId`를 포함한다. 이로써 일반적인 식별자 계약을 확인했지만, 해당 양식의 CSV/webhook 값 대조나 실제 form ID는 확인하지 않았다. [Tally FAQ](https://tally.so/help/faq), [Tally webhook payload example](https://tally.so/help/webhooks)

공식 webhook example에는 `eventId`, `eventType`, `data.formId`, `data.fields[]`의 `key`, `label`, `type`, `value`가 포함된다. `fields[].key`는 질문 식별자 후보 형태지만 실제 PRzER1의 key/label/type 및 조건부 설정은 여전히 `PENDING_VERIFICATION`이다. CSV 열 제목만으로 내부 key를 채우지 않는다.

공식 문서는 webhook signing secret을 켜면 `Tally-Signature` 헤더에 SHA-256 서명이 오며, 예제는 HMAC-SHA256 결과를 Base64로 비교한다. 예제는 parsed request body의 `JSON.stringify`를 서명 입력으로 사용한다. 동일 문서는 endpoint가 10초 내 2XX를 반환해야 한다고 하고, 미성공 응답 시 5분, 30분, 1시간, 6시간, 1일 후 재시도를 설명한다. 이 내용은 [Tally webhook 공식 문서](https://tally.so/help/webhooks)의 일반 동작이다. 현재 양식의 signing secret 활성화 여부, 실제 비밀 설정, webhook delivery/retry 상태는 읽지 않았고 변경하지 않았다.

Tally 공식 API 안내는 API 요청 인증으로 Bearer token을 요구한다고 설명한다. 이 자격증명은 요청하지 않았고 API 호출도 하지 않았다. 이 공개 문서는 API token authentication과 webhook signature를 별도 방식으로 설명한다. [Tally API overview](https://tally.so/help/api)

로컬 `guardian-auth-server/tally-webhook-contract.js`는 위 문서 계약을 합성 payload로만 검사한다. signing secret은 함수 호출 시 전달해야 하며 저장소/환경설정에 넣지 않는다. 검증기에는 form-specific expectedFormId가 필수라 실제 formId가 확인되지 않으면 `TALLY_FORM_ID_PENDING`으로 차단한다. 이는 실제 webhook adapter, 실제 양식 인증 설정 또는 운영 준비를 의미하지 않는다.

서버 발급 `applicationId`는 source submission ID와 별도다. 실제 adapter는 서명 검증 및 allowlisted form ID 일치 후 source ID를 workflow에 전달해야 한다. 동일 source ID와 동일 canonical payload는 기존 신청을 반환하고, 내용이 바뀌면 충돌로 차단한다. 공식 재시도 시간표는 문서화됐지만 해당 form의 delivery 설정/실제 동일 payload 재전송은 확인하지 않았다.

보호자 이름·전화번호나 Respondent ID만으로 기존 ERP 고객을 자동 연결하지 않는다. 최초 방문 때 인증된 직원이 신원을 확인하는 기존 분리 workflow를 유지한다.

## 로컬 파서와 합성 검증

`guardian-auth-server/tally-admission-csv.js`는 RFC4180 따옴표/쉼표를 처리하고 55열과 이 문서에 명시된 실제 확인 헤더 위치만 검사한다. 열 4–40 및 41–50의 개별 제목은 실제 입력에서 제공되지 않아 synthetic placeholder로 만들지 않았고, 운영 매핑도 하지 않는다. 파서는 원본 응답값 대신 익명화된 상태만 반환한다.

`guardian-auth-server/tally-admission-csv.fixture.cjs`는 가상 식별자/응답값과 명시적인 synthetic 열 제목만 사용한다. 실제 원본 CSV는 저장하지 않았다. 합성 테스트는 정상 폭/헤더, malformed CSV, 연락처 중복(일치/충돌/누락/단일), 선행 0 보존, 동의 쌍 충돌·중복, 선택 동의 기본 false, 서명 참조 누락/형식, 기생충 공란의 미확정 처리, 결과 개인정보 비노출을 확인한다.

CSV parser 검증은 Tally webhook payload 검증과 별개다. 실제 webhook API/auth, 질문 ID, 필수 및 조건부 규칙은 모두 `PENDING_VERIFICATION`이다.

## MVP 4 — Google Sheets 접수 계약

사용자가 제공한 `시트1` 원본 구조 계약은 51열(A:AY)이며 `docs/tally-sheets-intake-contract.md`에 범위별로 기록했다. 이번 Codex 세션은 원본/개발 spreadsheet를 조회하지 않았으므로 실제 51개 헤더 문자열이나 응답 값을 재검증하지 않았다. 개별 헤더가 확인되지 않아 실제 열 binding은 모두 `PENDING_VERIFICATION`이다.

55열 CSV parser와 구분되는 `guardian-auth-server/tally-admission-sheets.js`의 get-only adapter 및 51열 합성 테스트를 추가했다. 헤더는 입력된 정확한 51개 manifest와 순서/중복을 검증하고, 명시적으로 검증된 binding만 허용한다. adapter는 고정 원본 ID와 `시트1!A:AY` 읽기 범위만 요청하며 원장 쓰기 API를 제공하지 않는다. 실제 API client/credential/scheduler는 연결하지 않았다.

`Submission ID` 기반 지문 비교는 합성 pure helper로 동일 ID·동일 내용 재전송과 내용 충돌을 분리한다. 영속 cursor, 재시도 저장소, intake workflow 연계 및 신규 접수 저장은 구현/활성화하지 않았다. 실제 승인/계약 완료는 계속 차단되고 모든 normalized intake는 `NEEDS_REVIEW`다. 선택 동의는 기본 false, 확인되지 않은 조건식/필수 여부/계약·개인정보 동의 의미는 pending이다. 마케팅 별도 열은 추정하지 않는다.
