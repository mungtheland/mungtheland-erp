# 69단계 TEST 전용 데스크톱 OAuth 검증기

`scripts/issuance-test-oauth.cjs`는 파일 선택과 메타데이터 읽기만을 검토하는 별도 프로그램입니다. 기존 `drive.file` 모의 초기화 도구의 범위 상수와 TEST 대상 지문을 재사용하며 초기화 요청 생성기를 호출하지 않습니다. [파일 단위 권한 설계](pass-issuance-stage69-drive-file-validation.md)

| 명령 | 현재 동작 |
| --- | --- |
| `node scripts/issuance-test-oauth.cjs --check-config` | 고정 위치의 gitignored Desktop OAuth JSON과 TEST 구성을 로컬에서만 검증합니다. |
| `node scripts/issuance-test-oauth.cjs --authorize` | 현재 승인 차단으로 종료합니다. 향후 검토된 활성화 이후 OAuth, Picker 및 계정 확인까지만 수행하는 모드입니다. |
| `node scripts/issuance-test-oauth.cjs --authorize --read-metadata` | 현재 승인 차단으로 종료합니다. 향후 OAuth와 메타데이터 읽기 각각의 별도 승인과 명시 옵션을 요구합니다. |

현재 소스에서 두 실행 승인 값은 비어 있습니다. 후속 명시 승인과 검토된 활성화 변경을 각각 기록하기 전에는 브라우저나 Google 요청을 시작할 수 없습니다. 승인 A로 두 차단을 해제할 수 없습니다. 승인 B는 원장 초기화, C는 Apps Script 배포에 해당하며 이 도구로 수행하지 않습니다.

## 사용자가 준비할 파일

1. Google Cloud Console의 전용 프로젝트에서 **Google Auth Platform → Clients → 이미 생성한 Desktop 클라이언트 → Download JSON**으로 다운로드합니다. 표시된 프로젝트와 Desktop 클라이언트가 검토한 대상인지 직접 확인합니다.
2. 저장소의 `pass-issuance-test-app/.env.issuance-oauth.json`으로 로컬에만 저장합니다. 기존 `.env.*` 제외 규칙을 사용합니다. 검증기는 고정 경로의 일반 파일만 열고 Git에서 무시됨을 확인합니다. 실제 클라이언트 ID와 secret은 출력하거나 저장소에 넣지 않습니다.
3. `--check-config`를 실행합니다. OAuth JSON이 없으면 위치를 안내하고, 승인되지 않은 실연동 옵션으로는 운영체제의 브라우저를 열지 않습니다. 클라이언트 ID는 다운로드한 JSON에서 읽습니다. Desktop secret은 토큰 교환에만 사용하며 사용자를 인증하는 강한 비밀로 간주하지 않습니다.
4. 후속 실연동 승인 전에 전용 프로젝트의 설정과 승인 범위를 다시 확인합니다. 계정 확인에 사용하는 Drive API가 전용 프로젝트에서 사용 가능해야 합니다. 필요한 경우 API 활성화는 별도 승인 범위로 검토합니다.

## 인증과 확인 흐름

시스템 브라우저와 임시 `127.0.0.1` 포트를 사용합니다. 임의의 PKCE 검증자와 별도의 `state`를 생성하며 SHA-256 챌린지와 상수 시간 `state` 비교를 사용합니다. 콜백은 해당 포트의 고정 경로에 한정합니다. `prompt=consent`, `trigger_onepick=true`, 스프레드시트 MIME 및 지정 ID 한 개로 Picker를 구성합니다. 취소, 상태 불일치, 중복 콜백 필드, 복수 또는 다른 파일 선택은 코드 교환 전에 거부합니다. 파일 필터와 계정 힌트에 이어 콜백과 실제 계정을 별도로 검증합니다. [데스크톱 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) · [데스크톱 Picker](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)

요청, 콜백, 토큰 응답 및 액세스 토큰 메타데이터의 범위는 `drive.file` 하나여야 합니다. 토큰 대상은 다운로드한 클라이언트 ID와 일치해야 하며, 별도 발급 주체 정보가 제공되는 경우 같은 클라이언트인지 확인합니다. 토큰 교환 및 검증 서비스가 준 수명 중 이른 만료를 적용합니다. 토큰은 헤더로만 전달하고 프로세스 메모리에서만 취급합니다. 갱신 토큰을 저장하거나 재사용하지 않습니다. [Google 인증 라이브러리](https://github.com/googleapis/google-auth-library-nodejs)

`drive.file`을 수락하는 Drive `about.get`으로 현재 사용자의 이메일 필드만 확인합니다. 다르거나 필드가 없으면 Sheets 조회 전에 중단합니다. 별도로 승인된 메타데이터 모드에서는 지정 파일의 ID와 시간대만 읽는 GET 한 건을 사용합니다. 셀과 탭 데이터, 운영·Guardian 파일은 조회 범위에 없습니다. [Drive 계정 메타데이터](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get) · [Sheets 메타데이터](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get)

`drive.file`은 토큰을 파일 한 개에 암호학적으로 고정하지 않습니다. 같은 앱의 이전 파일 허용 이력과 오선택을 배제하고 TEST 앱 이외의 클라이언트나 토큰을 쓰지 않습니다. 계정의 운영 ERP 소유권은 계속 유지됩니다. 실제 OAuth, 토큰·대상·만료, Picker 허용, 유효 파일 접근은 모두 미검증입니다.

## 로컬 테스트 재현

PowerShell에서 `$env:ISSUANCE_TEST_LOCAL_CONFIG = (Resolve-Path 'pass-issuance-test-app/environment.local.json').Path`를 설정하고 `node --test tests/issuance-test-oauth.test.cjs`를 실행합니다. Desktop OAuth JSON은 사용하지 않습니다. 모의 OAuth 및 Sheets 서버와 브라우저 대역은 루프백에서만 실행되며 실제 Google 요청을 전송하지 않습니다.
