# 69단계 TEST OAuth 읽기 전용 실증 증빙

출처는 사용자가 직접 실행한 명령과 제공한 정제된 표준 출력입니다. 검토 기준 리비전은 `3d28fa82a10f056db23a8867bdf06e163401a73a`입니다. Codex는 명령을 다시 실행하거나 Google 원격 응답을 수집하지 않았습니다.

```powershell
node scripts/issuance-test-oauth.cjs --authorize --read-metadata --approval ERP-ISSUANCE-OAUTH-READ-20261128-01
```

```json
{"status":"AUTHORIZATION_CHECKED","sheetsAccess":"METADATA_ONLY","spreadsheetIdMatched":true,"timeZone":"Asia/Seoul"}
```

이 출력은 사용자 실증에서 OAuth 인증 흐름이 완료되고 지정 TEST 스프레드시트에 접근하여 반환 ID의 일치와 시간대 `Asia/Seoul`을 확인했다는 증빙입니다. 프로그램의 성공 반환 경로는 계정·범위·대상·만료 검사 뒤에 있습니다. 출력만으로 실제 계정 응답, 토큰에 부여된 범위·대상·만료, 이전 파일 허용 이력이나 이후에도 동일한 권한이 유지되는지는 독립적으로 검증할 수 없습니다.

실증 범위는 지정 TEST 파일의 ID와 시간대 메타데이터입니다. 기존 계정의 운영 ERP 소유권은 존속하며 계정 수준 격리는 `NOT_ISOLATED`입니다. `drive.file`은 앱에 허용된 파일에 적용되므로 이번 한 건의 성공으로 다른 파일이 과거에 허용되지 않았거나 계정의 운영 접근이 차단됐다고 판단할 수 없습니다.

승인 A는 기존 TEST 리소스 사용, 위 참조는 읽기 전용 실증입니다. 원장 초기화 B 및 TEST 배포 C는 미승인입니다. [OAuth 실행 및 안전장치](pass-issuance-stage69-local-oauth.md) · [70단계 진입 재평가](pass-issuance-stage69-readiness-reassessment.md)
