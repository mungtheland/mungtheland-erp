# 자동 백업 설치 및 검증

구현: `src/Backup.js`. GitHub 소스 변경만으로 백업은 시작되지 않는다.

1. 운영 계정 Google Drive에서 ERP 백업 전용 폴더를 만들고 폴더 URL의 ID를 복사한다. 원본과 백업의 접근 권한을 운영자에게만 제한한다.
2. [Apps Script 프로젝트](https://script.google.com/home/projects/1CMLUYM0mLlCSk_ss7ahh8P3_t9XhL-D4BaYdLzXFOYWbZTw7DrqgHP0W/edit) → 프로젝트 설정 → 스크립트 속성에서 `MD_BACKUP_FOLDER_ID`에 폴더 ID를 설정한다.
3. 배포 전 [Full ERP verification (no deployment)](https://github.com/mungtheland/mungtheland-erp/actions/workflows/verify.yml)이 성공인지 확인한다.
4. 검증 완료 후 **Deploy Apps Script (manual)** 실행으로 소스를 업로드한다. 백업 기능은 웹앱 UI 변경이 없으므로 웹앱 새 버전 배포 여부와 별개로 Apps Script 편집기에서 설치 가능하다.
5. Apps Script 편집기에서 `mdBackupSpreadsheet`를 **한 번 수동 실행**하여 권한을 승인하고, Drive 백업 폴더에 새 파일이 생겼는지 확인한다. 원본·사본의 탭과 최근 데이터가 일치하는지 직접 대조한다.
6. 수동 백업 성공 후 `mdInstallDailyBackup`을 한 번 실행한다. 이후 `mdBackupStatus`로 `folderConfigured:true`, `triggerCount:1`, `lastBackupAt` 값을 확인한다.
7. Apps Script의 **트리거** 및 **실행** 화면에서 실패 내역을 주기적으로 확인한다. 시간 기반 트리거는 21:00 정각이 아니라 해당 시간대에 실행될 수 있다.

## 주의사항
- 백업은 설치한 계정 권한으로 실행된다. Drive 파일 및 대상 폴더 접근 권한이 필요하다.
- 백업 실패 시 Apps Script 실행 기록에 오류가 남는다. 별도 이메일/메신저 실패 알림은 **미구현**이다.
- 자동 백업 파일 정리·보존기간 만료 삭제는 **미구현**이다.
- 시트 구조(탭 이름, 마지막 행·열)만 비교한다. 모든 셀의 내용이 동일한지 전수 검증하지 않는다.
- 원본 스프레드시트 ID는 코드에 고정되어 있으므로 백업 파일로 복구하려면 별도 전환 작업이 필요하다.
- 운영 중인 원본을 덮어쓰는 복구 작업은 자동화하지 않았다.
