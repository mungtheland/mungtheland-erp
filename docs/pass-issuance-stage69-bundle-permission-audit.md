# 69단계 TEST 후보 번들 권한 정적 감사

분석 기준은 Git 커밋 `49a4950824a938fdd5a40fc9f7ad7436c3b0f8c1`입니다. `scripts/build-pass-issuance-test.cjs`를 임시 로컬 디렉터리에 실행했습니다. 번들 SHA-256은 `08bc1f95277f20905bc265a6ee9de52c6c50f704ec48520109021b530ba0469b`입니다. 파일명을 정렬한 뒤 각 파일의 원본 바이트 SHA-256을 계산하고, 파일명과 해시를 NUL로 구분해 LF로 끝나는 행으로 결합한 UTF-8 바이트의 SHA-256입니다. 체크아웃 줄바꿈이 다르면 생성 파일의 바이트 해시도 달라질 수 있습니다.

| 생성 파일 | SHA-256 |
| --- | --- |
| `PassCatalog.gs` | `9dfaef4b41344bb164462b43b1618112b96a1886b195ae75747189c90e5a23e8` |
| `PassIssuanceLedger.gs` | `c2e0aab5d6071c6f96a42efc816cfba55dea31ed64504497c4ac8f8a4b8253bf` |
| `PassIssuanceLegacyReader.gs` | `fc3a6f898c37c7e7b13488f6ad0ee7b34c4e3a5deb1b3fc4a658e8ad07fc50b8` |
| `PassIssuancePlan.gs` | `8156404efee0d300d03c6b39afff9dda61718dd2ed44ed98e119a972e9b261f0` |
| `PassIssuancePreflight.gs` | `f8d1dd55b2c2f6ebe3ae5673681a4128357d8cd8c44498fb15ee06d148e73061` |
| `WorkbookAccess.gs` | `37186cb52cdee4d28f31c74d8216d3a60459689543d2553484f0d361e89c6bfc` |
| `appsscript.json` | `d2291f3343a0e3938f627e9d30cdd2e2445d7bdf7b79636b4cbb4ae6fa4da4e0` |

## 서비스와 권한

매니페스트는 시간대, 예외 로깅, V8 설정만 포함합니다. 명시적 `oauthScopes`, 고급 서비스, Apps Script 라이브러리, 웹 앱 및 실행 API 설정은 없습니다. 이전 원격 확인은 빈 프로젝트에 관한 것으로, 이 후보는 원격에 전송하거나 실행하지 않았습니다.

| 호출 | 정적 분석 결과 |
| --- | --- |
| `SpreadsheetApp.openById` | 공식 문서상 `https://www.googleapis.com/auth/spreadsheets`가 필요합니다. 이 범위는 읽기·쓰기를 허용하며 워크북 한 개로 제한되지 않습니다. 후보의 후속 호출은 ID 비교와 탭 이름 열거뿐입니다. |
| `ScriptApp.getScriptId` | 실행 프로젝트 ID를 비교하는 용도입니다. 메서드 문서에 별도 OAuth 범위가 명시되어 있지 않습니다. 토큰 조회·트리거 생성 호출은 없습니다. |
| `Utilities.computeDigest` | ID 문자열의 SHA-256 계산에 사용합니다. 메서드 문서에 별도 OAuth 범위가 명시되어 있지 않습니다. |
| 기타 서비스 | Drive 및 Sheets 고급 API, `DriveApp`, `UrlFetchApp`, `PropertiesService`, `LockService`, `Session`, `Jdbc`와 외부 HTTP 호출은 후보에서 발견되지 않았습니다. |

Sheets 범위는 호출을 근거로 한 추정입니다. Google의 실제 자동 추론 결과, 유효 승인과 실행 주체는 `UNVERIFIED`입니다. [SpreadsheetApp](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app) · [ScriptApp](https://developers.google.com/apps-script/reference/script/script-app) · [Utilities](https://developers.google.com/apps-script/reference/utilities/utilities) · [Apps Script 범위](https://developers.google.com/apps-script/concepts/scopes)

## 경로와 위험

유일한 직접 워크북 경로는 `WorkbookAccess.gs`입니다. 입력 ID를 변환하지 않고 형식과 고정 지문을 검사한 뒤, 현재 Script ID의 지문도 확인하고 워크북을 엽니다. 반환 ID를 다시 검사해야 탭 이름을 읽습니다. 셀 읽기, 쓰기, `openByUrl`, 활성 문서 접근, 생성 경로는 없습니다. AST 검사에서 동적 import, 전역 객체 직접 참조, 동적 코드 생성, 계산된 메서드 호출이 발견되지 않았습니다. 계산된 속성 접근은 데이터 인덱싱에 쓰였고, Node 전용 CommonJS 블록의 상대 의존성은 로컬 카탈로그입니다.

| 심각도 | 조건과 영향 | 완화 |
| --- | --- | --- |
| 높음 | 동일 계정이 ERP 워크북 소유자입니다. Sheets 전체 범위가 실제로 부여된 뒤 수정된 번들이 대상 제한을 제거하거나 다른 호출 경로를 추가하면 운영 데이터에 접근할 수 있습니다. 검토한 후보에서 해당 경로는 발견되지 않았습니다. | 배포 차단을 유지하고 정확한 후보 리비전과 해시에 독립 검토를 적용합니다. 실제 실행 주체와 승인 범위를 별도로 입증합니다. |
| 중간 | 후보 원장 파일의 범용 포트 엔진은 생성물에 남아 있습니다. 현재 호출자가 없지만, 새 코드가 외부 I/O를 수행하는 포트 객체를 전달하면 읽기·쓰기 로직에 진입할 수 있습니다. | 저장 진입점은 비활성 상태를 유지합니다. AST 회귀 테스트는 후보 내 호출자 추가와 직접 서비스 접근 변경을 감지합니다. 저장 기능 변경은 별도 안전성 검토가 필요합니다. |
| 중간 | 기존 운영 수동 배포의 실제 대상이 공개된 설정으로 검증되지 않았습니다. 시크릿이 TEST 대상으로 잘못 연결되면 운영 배포 흐름이 전용 프로젝트를 변경할 수 있습니다. | 관리자가 현재 비공개 원본과 TEST Script ID를 대조합니다. TEST 워크플로의 하드 차단을 유지합니다. |

검증은 임시 `acorn@8`을 Node 모듈 검색 경로에 두고 `node --test tests/pass-issuance-bundle-static.test.cjs`로 재현할 수 있습니다. 정적 검사는 검토한 패턴의 회귀를 확인합니다. 검증한 소스와 다른 코드의 실행을 제한하는 보안 경계는 계정 권한 및 별도 배포 보호에 의존합니다.
