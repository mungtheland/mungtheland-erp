# 입소 신청·계약 데이터 계약 — MVP 2단계

**상태:** 사용자가 승인한 신청 정책을 반영한 로컬 계약 모델. 실제 Tally 항목/제출 처리, 배포용 계약 원본, 운영 저장소는 검증하거나 연결하지 않았다. `docs/daycare-service-agreement-draft.md`는 여전히 승인 전 초안이다. 기존 ERP 필드와 실제 Tally 질문이 다를 수 있으므로 미검증 매핑을 사용하지 않는다.

## 확인한 기존 구조

`src/Code.js`의 `MD_SCHEMAS['고객·반려견관리']`는 고객/반려견을 한 행에 저장한다. `mdRegisterDog(data)`에서 필수 검사되는 입력은 `guardianName`, `phone`, `dogName`이다. `customerId`는 전달되면 사용하고 없으면 코드가 생성하며, `dogId`, 등록일, 상태도 코드가 생성한다. 견종, 생년월일, 성별, 중성화, 체중, 접종, 건강·알레르기, 주의사항, 비상연락처는 스키마에 있지만 해당 함수에서 필수 검사되지 않는다.

`src/Index.html`의 내부 등록 화면은 보호자명·연락처·반려견명을 필수 표시하고 일부 안전 정보를 선택 입력으로 노출한다. 이는 Tally 신청서가 아니다. UI 담당자 선택값은 `mdRegisterDog` 인자로 전달되지 않고 이 함수에는 검증 직원 principal이 없으므로 실제 직원 확인 증거로 취급하지 않는다.

기존 ERP에 신청 상태, 신청 revision, 계약/동의 증거 또는 철회 이력이 없다. 기존 고객/반려견 시트에 열을 추가하거나 기존 등록을 신청으로 간주하지 않는다.

## 필드 계약 대조

| 필드 | 기존 코드/화면 | MVP 2단계 의미 | Tally 매핑 및 필수성 |
|---|---|---|---|
| guardianName / 보호자명 | 기존 등록 함수·화면의 필수 입력 | 기존 Tally 항목을 우선 보존하고 최초 방문 때 직원이 신청자와 대조 | 실제 질문 ID 및 필수/조건부 여부 `PENDING_VERIFICATION` |
| phone / 연락처 | 기존 등록 함수·화면의 필수 입력 | 신청 시 휴대전화 OTP나 계정 로그인을 요구하지 않음. 최초 방문에서 직원이 확인 | 실제 질문 ID·필수 여부 `PENDING_VERIFICATION` |
| emergencyPhone / 비상연락처 | 기존 열과 선택 입력 | 안전관리 목적의 기존 질문을 유지 | 실제 질문 ID·필수 여부 `PENDING_VERIFICATION` |
| dogName / 반려견명 | 기존 등록 함수·화면의 필수 입력 | 안전관리 신청 정보 후보 | 실제 질문 ID·필수 여부 `PENDING_VERIFICATION` |
| breed, birthDate, sex, neutered, weight | 기존 스키마 일부, 화면 미노출 필드도 있음 | 기존 Tally 항목을 최대한 유지하고 안전 목적·최소 수집 검토 | 실제 질문, 분기, 필수 여부 `PENDING_VERIFICATION` |
| vaccines, health, notes, 행동/물림 이력 | 기존 스키마 일부 | 접종·건강·행동 안전 항목 후보. 과거 Tally의 조건부 질문을 임의로 바꾸지 않음 | 질문/첨부 방식/조건부 규칙 모두 `PENDING_VERIFICATION` |
| customerId / dogId | 기존 등록 함수가 생성/저장 | 최초 방문 직원 신원 확인 전 기존 계정 자동 연결 금지 | 신청에서 자동 연결하지 않음 |
| applicationId / sourceSubmissionId | 기존 신청 코드에 없음 | 신뢰된 접수 verifier가 최초 접수 시 서버 발급. 같은 제출 재전송은 같은 ID를 돌려주고, 같은 원본 키에 내용 변경은 충돌 처리 | Tally의 stable 제출 키 매핑 `PENDING_VERIFICATION` |
| revision | 기존 신청 스키마에 없음 | 1부터 시작, 수정마다 compare-and-set, 오래된 revision은 충돌 거부 | 로컬 합성 모델 구현 |
| 계약 증거 | ERP 필드 없음 | Tally 계약 전문 확인, 필수 동의 체크, 신청 ID, 계약 버전, 제출시각, 동의 결과, evidence reference 보관 | 실제 계약 본문·질문·버전 대조 `PENDING_VERIFICATION` |
| privacy notice 증거 | ERP 필드 없음 | 안내 버전/제시 시각/evidence를 계약 동의와 분리 | 실제 안내 버전·문항 `PENDING_VERIFICATION` |
| photoMarketing / marketingMessages | ERP 필드 없음 | 서로 분리된 선택 동의, 기본 미선택 | 실제 Tally 항목 `PENDING_VERIFICATION` |
| 최초 방문 직원 확인 | ERP 필드 없음 | 확인 결과, 방법, 시각, authenticated staff ID만 보관. 원본 신분증 번호/사본은 모델에 넣지 않음 | 실제 증빙 최소 범위는 추가 승인/검토 필요 |
| 수정/철회/개인정보 삭제 | ERP 필드 없음 | revision 수정, withdrawal 상태, 개인정보 삭제 요청을 서로 구분 | 로컬 합성 처리만 구현, 실제 보유/삭제 미연결 |

현재 Tally 폼을 확인하지 않았으므로 매핑 표의 Tally 질문 ID와 필수/조건부 여부는 모두 `PENDING_VERIFICATION`이다. 안전 관련 필드 후보를 새 Tally 필수 항목으로 임의 승격하지 않는다.

## 계약 및 개인정보 증거

- 기준 후보: 계약서 v1.0, 시행일 2026-12-07. 날짜/버전은 사용자 제공 기준으로 저장 계약에 반영했으나, 고객 배포 가능한 실제 계약 문서와 Tally 본문은 대조하지 않았다. 불일치 또는 검증 전에는 `CONTRACTED`를 차단한다.
- Tally의 contract acceptance evidence와 개인정보 안내 제시 증거를 별도 보관한다. 안내 열람을 포괄 동의로 간주하지 않는다.
- 사진·영상 홍보와 마케팅 수신 선택은 서로 별도이며 기본 false. 각 true 값에는 별도 동의 버전·시각·증거 참조가 필요하다.
- 계약 미체결 신청정보 3개월은 잠정 보유 기준으로만 둔다. 보유기간 미확정 자료를 삭제하거나 자동 삭제하지 않는다. 계약·결제 자료 기간은 적용 법령 검토 후 확정한다.
- 최초 방문 확인은 Tally 동의 시점과 다른 이벤트다. 둘 다 확인되어야 계약 완료 상태로 갈 수 있다.
- 원본 계약 증거는 수정하지 않는다. 계약 체결 후 변경은 amendment 이력으로 쌓는다. 철회 완료는 계약 해지·환불·개인정보 삭제를 실행하지 않는다.

## 신청 상태와 권한

| 상태 | 의미 | 허용 전이/권한 |
|---|---|---|
| `RECEIVED` | 접수 완료 | 직원이 `NEEDS_REVIEW`로 넘기거나 철회 요청을 접수 |
| `NEEDS_REVIEW` | 직원 검토 중 | 직원은 수정 처리, 관리자는 `APPROVED` 또는 `REJECTED` 결정 |
| `APPROVED` | 관리자 입소 승인 | 수정되면 `NEEDS_REVIEW`로 돌아감. 계약 증거 및 최초 방문 확인이 모두 끝나야 별도 함수로 `CONTRACTED` |
| `CONTRACTED` | 계약 증거 확인과 최초 방문 신원 확인 완료 | 계약 내용 수정은 별도 amendment 요청. 철회 요청은 계약 취소/환불과 별도로 처리 |
| `REJECTED` | 관리자 입소 반려 | 철회 요청 접수만 허용 |
| `WITHDRAWAL_REQUESTED` | 직원이 신청 철회 요청을 접수 | 직원 처리 후 `WITHDRAWN`; 삭제나 계약 취소는 포함하지 않음 |
| `WITHDRAWN` | 신청 기록 처리 종료 | terminal state; 기록은 보존 정책 검토 대상 |

상태는 allowlist만 허용한다. 클라이언트가 상태나 직원 ID를 직접 지정하지 않는다. 일반 직원은 검토, 최초 방문 확인, 수정 처리, 철회 접수/처리를 수행한다. 관리자는 이를 포함해 최종 승인·반려 및 계약 예외 검토를 수행한다. 예외 기록은 감사 검토를 만들 뿐 계약 확인 조건을 우회하지 않는다.

모든 변경 감사 이벤트에는 서버 인증 principal의 직원 ID, 처리 시각, 사유, 결과가 포함된다. API/route는 구현하지 않았으며 함수는 전달된 token을 injected server authenticator에 넘겨 active principal을 확인한다. 실제 `createStaffAuthenticator`는 `staff`만 반환하고 관리자 role mapping은 없다. 따라서 합성 admin 테스트는 관리자 실계정/운영 권한 검증이 아니다.

## 구현 경계와 차단

`guardian-auth-server/admission-intake.js`는 메모리 합성 저장소만 허용하고 디스크/Sheets/Firestore/네트워크 저장 포트는 없다. 신청 중복은 정확한 source key, 변경된 재전송은 conflict, ID 충돌은 차단한다. CAS revision 경합은 오래된 요청을 거부한다. 미확인 Tally 필드 매핑은 Tally 제출을 차단하며, requiredness 검증 전 관리자의 `APPROVED`도 차단한다.

현재 Tally source verifier와 실제 Tally field mapping은 없다. 모듈의 `authenticateSubmission`은 dependency 계약만 제공하며 실제 Tally signature/API 검증이 아니다. `contractPolicy` 기본 source 검증 상태도 `PENDING_VERIFICATION`이므로 제공된 계약 버전/날짜를 실제 문서와 대조하기 전에는 계약 완료 전이가 차단된다. 테스트가 사용하는 `SYNTHETIC_FIXTURE` evidence는 합성 상태를 만들 뿐 실제 계약 검증이 아니다.

## 테스트와 다음 게이트

- `guardian-auth-server/admission-intake.test.js`: 합성 저장만 검증. 중복 제출/ID 충돌, revision 경쟁, 수정 후 재검토, 역할 분리, required field 정책 미확정 차단, 계약 증거/버전, 최초 방문 확인, 계약 후 amendment, 철회와 삭제요청 분리, 선택 동의 기본 미선택, 인증 실패를 포함한다.
- 기존 `tests/admission-contract.contract.test.cjs`와 fixture는 기존 ERP 필드 대조를 계속 확인한다.
- 실제 Tally 문항·조건부 규칙·stable submission ID를 열람해 매핑할 수 있는 권한 있는 담당자의 검증이 필요하다.
- 실제 계약서 v1.0/2026-12-07, 개인정보 안내 버전, 실제 필수 동의 증거, 관리자 권한 주체를 확인하기 전에는 실접수 저장·`CONTRACTED` 완료·운영 연동을 차단한다.
- 실제 보유기간/법적 예외가 확정되기 전 자동 파기 기능은 추가하지 않는다.
- 실제 Tally/API·Sheets·Apps Script·Firebase 호출과 배포는 이번 작업에서 수행하지 않았다.

## MVP 3단계 CSV 구조 보완

사용자가 제공한 55열 CSV 관찰은 `docs/tally-admission-field-mapping.md`에 `VERIFIED_FROM_CSV`로 기록했다. 열 1–3의 제출/응답자/제출시각 헤더, 연락처 중복 열(5/54, 6/55), 동의 영역(41–50), 사진·영상 선택 동의(51), 전자서명/서명자(52–53)의 열 구조를 반영했다. 열 번호는 내부 질문 ID가 아니다.

CSV 질문 제목이나 응답값만으로 현재 Tally 질문 ID, webhook 제출 식별자 안정성, 필수성 또는 조건부 로직을 확정하지 않는다. 연락처 중복 열은 동일값/상충/양쪽 공란/한쪽 값 상태를 구분하고, 한쪽 값은 해당 출처가 검증되지 않으면 선택하지 않는다. 전화번호는 문자열로 보존한다. 계약·개인정보·선택 동의 및 서명 증거는 서로 분리하고, 확인되지 않은 마케팅 수신 열을 가정하지 않는다.

`guardian-auth-server/tally-admission-csv.js`는 합성 CSV 진단기로서 원본 개인정보를 반환하지 않는다. CSV 내보내기 형식과 webhook JSON 계약은 별개이며 실제 adapter/webhook 연동은 여전히 없다. 실제 Tally 질문 ID·조건부/필수 설정, 제출 서명 검증 및 실제 계약/개인정보 게시 버전 확인 전 운영 접수는 BLOCKED다.
