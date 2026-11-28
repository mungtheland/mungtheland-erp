# Tally 입소 신청 필드 대조 — MVP 3단계

## 검증 범위와 결론

대상 양식은 [입소 신청·이용계약서](https://tally.so/r/PRzER1)다. 이번 실행의 웹 열람 도구는 해당 동적 양식 페이지에 접근하지 못했다. 저장소에도 실제 Tally 질문 내보내기, 질문 ID 목록, 조건부 로직 스냅샷, 제출 예시 또는 webhook 설정이 없다. 실제 고객 응답 조회·다운로드나 Tally API 호출은 하지 않았다.

따라서 아래 표의 모든 Tally별 세부 사항은 `PENDING_VERIFICATION`이다. 코드의 기존 ERP 필드 이름은 계약상 후보일 뿐, Tally 질문이 존재한다는 증거가 아니다. 실제 질문 ID, 필수성 또는 표시 규칙을 확인한 것처럼 취급하지 않는다. 기존 양식에 없는 필드나 필수 질문을 추가하지 않는다.

| 검토 항목 | 실제 질문 ID | 응답 형식 | 필수 여부 | 조건부 표시/필수 규칙 | 기존 ERP 매핑 후보 | 상태 |
|---|---|---|---|---|---|---|
| 보호자 이름 | 미확인 | 미확인 | 미확인 | 미확인 | `guardianName` | `PENDING_VERIFICATION` |
| 보호자 연락처 | 미확인 | 미확인 | 미확인 | 미확인 | `phone` | `PENDING_VERIFICATION` |
| 비상연락처 | 미확인 | 미확인 | 미확인 | 미확인 | `emergencyPhone` | `PENDING_VERIFICATION` |
| 반려견 이름 | 미확인 | 미확인 | 미확인 | 미확인 | `dogName` | `PENDING_VERIFICATION` |
| 견종·생년월일·성별·중성화·체중 | 미확인 | 미확인 | 미확인 | 미확인 | `breed`, `birthDate`, `sex`, `neutered`, `weight` | `PENDING_VERIFICATION` |
| 예방접종·건강 상태 | 미확인 | 미확인 | 미확인 | 미확인 | `vaccines`, `health` | `PENDING_VERIFICATION` |
| 행동 특성·물림 이력 | 미확인 | 미확인 | 미확인 | 미확인 | `notes` 후보이나 의미 대응 미확정 | `PENDING_VERIFICATION` |
| 내·외부 기생충 예방 | 미확인 | 미확인 | 미확인 | 미확인 | 기존 스키마 대응 열 확인 안 됨 | `PENDING_VERIFICATION` |
| 계약서 확인 및 필수 동의 | 미확인 | 미확인 | 미확인 | 미확인 | 별도 계약 증거 구조 | `PENDING_VERIFICATION` |
| 개인정보 처리 고지 | 미확인 | 미확인 | 미확인 | 미확인 | 계약 동의와 분리한 고지 증거 | `PENDING_VERIFICATION` |
| 사진·영상 홍보 선택 동의 | 미확인 | 미확인 | 미확인 | 미확인 | 별도 선택 동의 구조, 기본 false | `PENDING_VERIFICATION` |
| 마케팅 수신 선택 동의 | 미확인 | 미확인 | 미확인 | 미확인 | 별도 선택 동의 구조, 기본 false | `PENDING_VERIFICATION` |
| 조건부 질문 및 필수 입력 규칙 전체 | 미확인 | 미확인 | 미확인 | 실제 분기별 규칙 미확인 | 확인 전 매핑/승인 차단 | `PENDING_VERIFICATION` |

## ERP와 검증 로직

`src/Code.js`의 고객·반려견 등록은 기존 내부 등록 계약의 참고 자료다. 기존 코드에서 일부 기본 정보는 등록 입력으로 확인되지만, 이것으로 외부 Tally 질문 ID나 Tally 필수 여부를 추론하지 않았다. 행동/물림 및 기생충 항목도 대응 필드의 존재나 의미가 입증되기 전까지 미연결로 남긴다.

`guardian-auth-server/admission-intake.js`의 `TALLY_FIELD_MAPPING`은 ERP 필드별 질문 ID, 응답 형식, 필수성, 조건부 규칙을 비워 두고 전부 `PENDING_VERIFICATION`으로 표시한다. 새 `mapTallyAnswers` 검증기는 완전한 검증 매핑이 주입되지 않으면 fail-closed하고, 검증 매핑이 있을 때만 중복 질문 ID, 알 수 없는 응답 ID, 응답 형식, 필수 및 조건부 누락을 검사한다. 이 단계 테스트에 쓰는 `SYNTHETIC-Q-*` 값과 규칙은 합성 fixture 전용이며 실제 Tally 정의가 아니다.

실제 제출 ID는 Tally의 서명된/검증된 제출 원본에서 가져오는 계약으로 둔다. 서버 발급 `applicationId`와 별도다. 동일 채널·제출 ID·동일 정규화 내용은 기존 신청을 반환하고, 같은 ID의 내용 변경은 `DUPLICATE_SUBMISSION_CONFLICT`로 차단한다. 실제 Tally 제출 ID의 안정성과 webhook 서명 검증은 이번에 확인하지 못했다.

계약 동의 증거와 개인정보 고지 증거는 독립 기록한다. 사진/영상과 마케팅 수신 선택 동의도 서로 분리하며 기본값은 각각 false다. 최초 방문 직원 신원확인은 Tally 제출 시점과 별도 이벤트다. 계약 v1.0 및 2026-12-07 시행일은 정책 입력값일 뿐, 실제 배포 계약 원본 및 Tally 표시와 대조되지 않았다.

## 확인된 기존 자료와 미확인 자료

- 확인: `docs/admission-intake-contract.md`, `guardian-auth-server/admission-intake.js`, 합성 테스트/fixture, `src/Code.js`의 기존 ERP 등록 스키마.
- 미확인: Tally 실제 문항과 ID, 응답 타입, 조건부 표시·필수 규칙, 제출 ID 계약, webhook 인증 설정, 실제 계약/개인정보 문서의 게시 버전.
- 실제 원장·클라우드 자료: 조회하지 않음.

## 다음 검증에 필요한 증거

권한 있는 양식 관리자가 개인정보를 제거한 질문 정의 내보내기(질문 ID, 응답 타입, required/conditional 설정 포함)와 webhook 제출 ID/서명 계약을 제공하거나 화면에서 검토해야 한다. 계약서 및 개인정보 안내의 실제 버전도 별도로 대조한다. 그 후 승인된 실제 필드만 매핑하고, 필드별 필수·조건부 사례를 비식별 합성 fixture로 만든다. 실제 webhook 등록과 실제 고객 응답 검증은 별도 승인 없이는 수행하지 않는다.
