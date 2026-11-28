# 69단계 TEST 원장 초기화의 파일 단위 권한 검증

기준 커밋은 `d6c2d3603618cfdf9e3475c2a411ee0190664171`입니다. **문서상 실현 가능하며 현재 원격 실행은 차단됩니다.** Sheets REST의 `spreadsheets.get`과 `spreadsheets.batchUpdate`는 각각 `https://www.googleapis.com/auth/drive.file`을 허용합니다. 이 범위의 액세스 토큰과 별도로, 같은 OAuth 앱이 해당 기존 TEST 파일에 대한 파일별 접근을 받아야 합니다. 파일 ID를 알고 있거나 계정이 소유자라는 사실만으로 그 앱에 파일별 접근이 부여되지는 않습니다. [spreadsheets.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get) · [spreadsheets.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate) · [Drive OAuth 범위](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## 기존 TEST 파일을 선택하는 절차

이 절차는 향후 별도 정책 및 인증 변경 승인 이후의 설계입니다.

1. 운영 ERP 및 Apps Script 배포 인증과 분리한 새 전용 Cloud 프로젝트를 사용합니다. 그 프로젝트에 Google Sheets API와 Google Picker API를 사용하도록 설정하고, Google Auth Platform의 Branding, Audience, Data Access에서 승인된 운영자와 `drive.file`만 구성합니다. Clients에서 Desktop app OAuth 클라이언트를 사용합니다. 운영 프로젝트, 기존 OAuth 클라이언트, ADC, clasp 및 GitHub 시크릿을 재사용하지 않습니다.
2. 데스크톱 앱은 시스템 브라우저의 OAuth 코드 흐름과 루프백 콜백을 사용합니다. PKCE S256과 요청별 `state`를 검증합니다. Google의 데스크톱 Picker 통합은 `prompt=consent`와 `trigger_onepick=true`를 요구합니다. `file_ids`에 지정된 TEST ID 한 개, `mimetypes`에 `application/vnd.google-apps.spreadsheet`를 넣어 선택 화면을 제한합니다. 복수 선택과 폴더 선택은 활성화하지 않습니다. 이 필터는 선택 범위를 줄이는 UI 통제입니다. [데스크톱 Picker](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker) · [데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
3. 사용자는 지정 Google 계정으로 로그인하고 기존 TEST 파일 한 개를 확인해 선택합니다. 취소나 콜백 오류, 일치하지 않는 `state`, 비어 있거나 복수이거나 다른 `picked_file_ids`는 즉시 중단합니다. 정상 콜백의 코드는 동일 클라이언트와 PKCE 검증자로 교환합니다. 승인된 읽기 검증 단계에서만 같은 앱 토큰으로 그 정확한 TEST ID를 조회하고 반환된 ID를 대조합니다. 운영 파일의 접근 여부를 실제 요청으로 시험하지 않습니다.
4. Drive의 **Open with**도 올바르게 등록한 앱으로 사용자가 파일을 여는 경우의 파일별 접근 경로입니다. 이미 같은 앱에 허용된 파일은 해당 앱 토큰으로 다시 접근할 수 있습니다. 이번 초기화에서는 새 전용 앱에서 TEST 한 곳만 선택한 이력을 남길 수 있는 데스크톱 Picker 경로를 설계했습니다. 기존 앱의 파일 허용이나 다른 클라이언트 토큰을 끌어오지 않습니다. [Drive 파일별 접근 범위](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## 토큰 경계

향후 실행기는 OAuth 요청 범위, 코드 교환 응답의 `scope`, 검증할 액세스 토큰의 범위 집합을 각각 확인합니다. 허용 집합은 `drive.file` 하나입니다. 토큰이 예상한 클라이언트에 발급되었는지 발급 응답과 토큰 메타데이터의 대상 정보로 검증하고 만료를 확인합니다. 범위 또는 대상 정보가 없거나 검증할 수 없으면 중단합니다. 검증 서비스에는 토큰을 헤더로 전달하고 URL, 로그, 보고서, 저장소에 토큰을 남기지 않습니다. 네이티브 앱은 점진적 동의에 의존하지 않으며, 권한 합산 옵션이 있는 다른 흐름으로 전환할 때도 이전 부여 범위를 합산하지 않습니다. 단발성 실행은 액세스 토큰을 프로세스 메모리로만 취급합니다. 교환 응답에 갱신 토큰이 포함되더라도 저장하거나 재사용하지 않습니다. [토큰 범위 검증](https://developers.google.com/identity/protocols/oauth2/native-app) · [Google 인증 라이브러리 토큰 메타데이터](https://github.com/googleapis/google-auth-library-nodejs)

`drive.file`은 앱에 허용된 파일들의 권한으로, 토큰에 워크북 ID 한 개가 고정되는 방식은 아닙니다. 이미 운영 파일을 같은 앱에 허용했거나 이후 잘못 선택하면 그 앱의 파일 범위가 넓어질 수 있습니다. 따라서 전용 프로젝트의 기존 파일 허용 이력이 없다는 근거, 한 개만 선택한 기록, 앱에서 독립적으로 강제하는 고정 ID를 모두 요구합니다. 동일 계정의 운영 소유권은 존속하므로 계정 수준 판정은 `NOT_ISOLATED`입니다. `spreadsheets`, `drive` 등 넓은 권한으로 폴백하지 않습니다. [Sheets 권한 범위](https://developers.google.com/workspace/sheets/api/scopes)

## 로컬 REST 요청 검증

`scripts/build-pass-issuance-v2-request.cjs`는 기존 로컬 초기화 검토기를 재사용합니다. 이 모듈은 네트워크 전송, OAuth 클라이언트, 시크릿 또는 실제 토큰을 사용하지 않습니다. 기존 `SpreadsheetApp.openById` 번들과 분리되어 있습니다.

- 전용 TEST ID 쌍, 관찰된 워크북 ID, 시간대, 탭 및 숫자 ID 목록, 미시도 상태, 승인 B 참조와 헤더 지문을 확인합니다. 승인 증빙에 고정 탭 ID `690001`도 일치해야 합니다. 이 값은 미래 후보값이며 현재 비어 있는지는 미확인입니다.
- 모의 클라이언트 ID, 대상, 정확한 범위와 단일 Picker 선택 메타데이터를 추가로 대조합니다. 이 입력은 실제 승인이나 토큰 검증을 대체하지 않습니다. 성공 결과의 상태는 `MOCK_REQUEST_ONLY`입니다.
- 요청에는 전용 워크북에만 적용할 `addSheet` 하나와 동일 숫자 ID를 대상으로 하는 `updateCells` 하나가 같은 배치에 들어갑니다. 탭은 `_이용권발급원장V2`이며 헤더는 기존 계약의 순서 그대로 16개입니다. A1:P1에 문자열 값만 설정하고, 데이터 행을 포함하지 않습니다. Google은 한 배치의 변경을 원자적으로 적용합니다. [Sheets 배치 요청](https://developers.google.com/workspace/sheets/api/guides/batch)
- 실제 사전 조회가 별도로 승인된 경우에만 전용 기록의 워크북 ID, `Asia/Seoul`, 모든 탭 ID와 제목을 대조합니다. 기존 원장, 레거시 탭, 탭 ID 충돌 또는 불완전한 스냅샷이면 중단합니다. 타임아웃이나 결과 불확실을 미적용으로 판단하지 않습니다. 승인된 사후 읽기 단계에서 같은 워크북의 고정 탭 ID, 제목, 헤더 16개와 비어 있는 데이터 상태를 검증합니다. 일치하지 않거나 결과가 불확실하면 증빙을 보존하고 복구 담당자 검토로 전환합니다. 재전송·삭제·수정은 별도 승인까지 보류합니다.

실제 앱 구성과 동의, Picker 선택, 토큰·유효 범위, 전용 파일 허용과 원격 읽기·쓰기는 모두 미검증입니다. 사용자는 실제 인증 전에 이 대체 통제가 현행 정책을 충족하는지 별도로 결정하고, 승인된 전용 프로젝트 및 OAuth 구성과 검토자를 확정해야 합니다. 실제 초기화에는 승인 B가 필요하고, Apps Script 배포에 대한 C는 독립 승인입니다. 기존 게이트의 계정 격리, 수동 배포 대상 및 권한 검토는 여전히 남아 있습니다.
