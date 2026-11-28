# 69단계 동일 계정 대체 실증 설계

동일 계정은 운영 ERP 워크북 접근 권한을 보유하므로 계정 수준 판정은 `NOT_ISOLATED`입니다. 이 작업의 산출물은 로컬 합성 검증과 초기화 검토 모델입니다. 기존 후보, 환경 게이트 및 비활성 워크플로에 연결하지 않았습니다. 승인 A는 기존 TEST 리소스 사용 범위입니다. 승인 B 및 C는 미승인입니다.

## 합성 데이터 전용 후보

기존 후보의 `WorkbookAccess.gs`는 검증된 현재 Script ID와 워크북 ID를 거쳐 `SpreadsheetApp.openById`를 호출하고 탭 이름을 읽습니다. 기존 원장 모듈에는 외부 I/O 포트가 전달되면 작동하는 범용 저장 엔진이 남아 있습니다. 배포용 데이터 접근이 필요 없는 이번 합성 후보는 카탈로그·계획·사전 검증의 순수 함수와 원장의 스키마 함수만 가져옵니다. 워크북 모듈, 원장 어댑터·포트 엔진과 저장 진입점을 제외합니다.

`node scripts/build-pass-issuance-synthetic.cjs <새 임시 디렉터리>`는 `PassCatalog.gs`, `PassIssuancePlan.gs`, `PassIssuancePreflight.gs`, `SyntheticSchema.gs`, `SyntheticCheck.gs`, `appsscript.json`을 생성합니다. 빌더가 저장소의 고정 합성 요청 및 빈 스냅샷을 내장합니다. 입력 인수를 받지 않는 `runIssuanceSyntheticCheck`가 프로젝트 ID 지문을 확인한 뒤 해당 스냅샷만 사용합니다. 잘못된 ID는 계산 결과나 성공 로그 없이 중단합니다. 허용 대상에서 반환값과 로그는 상태와 사유 코드만 담습니다. 로컬에서는 VM 반환값과 모의 로그를 비교합니다. 추후 별도 승인된 실행이 있다면 검토자는 그 실행 기록의 결과 코드만 읽기 전용으로 확인합니다. 웹 앱이나 실행 API 진입점은 만들지 않습니다.

데이터 통신 서비스 또는 명시적 OAuth 범위를 포함하지 않습니다. `ScriptApp.getScriptId`, `Utilities.computeDigest`는 프로젝트 지문 검증에만 쓰며 메서드 문서에는 별도 OAuth 범위가 명시되어 있지 않습니다. `console.log`는 보유 데이터 대신 상태만 남깁니다. 배포 인증, Apps Script가 실제로 추론할 요청 범위, 사용자에게 부여된 유효 OAuth 권한은 미검증입니다. [ScriptApp 참조](https://developers.google.com/apps-script/reference/script/script-app) · [Utilities 참조](https://developers.google.com/apps-script/reference/utilities/utilities)

승인 C에는 정확한 Git 전체 SHA, 합성 번들의 원본 바이트 인벤토리 SHA-256, TEST 프로젝트 지문, 독립 검토자, 전용 배포 인증 및 복구 근거를 묶습니다. 합성 실행은 배포 승인만으로 수행하지 않습니다. 실제 배포 및 실행은 이번 구현에 없습니다. 변조나 새 의존성이 있으면 후보를 폐기하고 새 해시로 다시 검토합니다.

## V2 원장 초기화 분리안

구현한 `scripts/review-pass-issuance-v2-initialization.cjs`는 주입한 로컬 스냅샷을 분류합니다. 원격 조회, OAuth 또는 쓰기 클라이언트가 없습니다. 승인 B 증빙이 없거나 대상과 헤더 해시가 다르면 차단합니다. 합성 승인 참조를 넣은 테스트에서도 최대 `PLAN_ONLY`를 반환합니다. 이 함수는 승인 진위나 현행 환경 게이트를 대신 검증하지 않습니다.

별도 승인된 향후 작업에서만 다음 절차를 검토합니다.

1. 승인 B 기록에서 전용 워크북 ID, 정확한 초기화 범위, 계획된 고정 숫자 탭 ID, 헤더 SHA-256, 검토자와 복구 담당자를 확인합니다. 현행 게이트와 승인 증빙 확인 후, 쓰기 직전에 ID와 `Asia/Seoul`, 탭 목록, 충돌 여부, 신규 탭 부재 및 기존 탭 보존 상태를 독립 조회합니다. 운영·Guardian·미등록 대상과 불완전한 스냅샷은 중단 조건입니다.
2. 초기화 범위는 전용 워크북에 `_이용권발급원장V2` 탭 한 개와 정확한 순서의 헤더 한 줄입니다. 헤더 계약은 `v2Headers()`를 재사용하며 UTF-8 JSON 배열의 SHA-256은 `a36ff1ca249e7fc0c879f1ab86e0b1644db8798fa6dc12ac12312b2220142959`입니다. 열 순서는 발급요청 ID, 멱등성 키, 결제 참조, 상품 ID, 카탈로그 버전, 반려견 ID, 보호자 ID, 이용권 ID, 총 횟수, 발급 상태, 요청시각, 확정시각, 처리 횟수, 마지막 오류 코드, 신청 채널, 감사 참조입니다. 데이터 행은 0건이고 다른 탭은 작업 범위에서 제외합니다.
3. 미래 쓰기 구현은 단일 `spreadsheets.batchUpdate`에서 지정 탭 ID의 추가와 헤더 한 줄 쓰기를 함께 처리하도록 설계합니다. Google은 같은 요청 안의 변경을 원자적으로 적용합니다. 요청 성공 여부가 불명확하면 원자성을 재시도 근거로 사용하지 않습니다. 워크북과 고정 탭 ID, 제목, 16개 헤더, 데이터 행 0건 및 기존 탭 보존을 독립 조회합니다. [Sheets 배치 요청](https://developers.google.com/workspace/sheets/api/guides/batch)
4. 이미 완성된 탭이 있으면 중복 실행을 중단합니다. 헤더 불일치, 부분 상태, 타임아웃 또는 불확실한 결과가 있으면 원본과 증빙을 보존하고 복구 담당자 검토로 전환합니다. 읽기 전용 대조 후에도 불명확하면 재시도, 삭제, 복원, 수정은 각 조치의 별도 승인까지 보류합니다. 복구 범위는 지정 TEST 리소스에 한정합니다.

쓰기 실행에는 Google의 쓰기 가능한 권한이 필요합니다. 향후 구현은 전용 OAuth 앱에 해당 TEST 파일만 연결된 `drive.file` 방식을 우선 검토합니다. 승인된 클라이언트와 해당 파일에만 부여된 권한 증빙이 없으면 사용을 보류합니다. 전체 `spreadsheets` 범위는 동일 계정이 접근 가능한 ERP 데이터까지 포함할 수 있으므로 대체 통제를 별도 승인받기 전에는 사용하지 않습니다. 운영 계정 자체의 소유권은 파일별 앱 권한과 별개입니다. [Sheets API 범위](https://developers.google.com/workspace/sheets/api/scopes) · [batchUpdate 권한](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)

## 남은 결정

정적 검사와 모의 테스트는 변경된 코드·대상 오입력·재시도 사고에 대한 회귀 통제입니다. 동일 계정의 ACL, 실제 OAuth, 기존 운영 수동 배포 대상 경계를 대신하지 않습니다. 현재 격리 및 권한 증빙, 단일 TEST 권한 프로필, 승인 B와 수동 배포 대상 검토는 미충족입니다. TEST 배포 승인 C, 보호 환경의 독립 검토자와 전용 인증 준비도 남아 있습니다. 권한 있는 결정권자가 이 좁은 대체 경로를 별도 정책으로 승인하고 독립 검증해야 하며, 그 전까지 현행 게이트와 워크플로가 차단 상태를 유지합니다.
