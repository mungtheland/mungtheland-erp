# 멍더랜드 ERP V1

강아지 유치원 운영·회계 전용 Google Sheets + Google Apps Script 프로젝트.

- Google Sheets: https://docs.google.com/spreadsheets/d/1am5gRi3NPV6YdkaGOwE9hActsZLK9D35GXDxT1ms-70/edit
- 운영 시트 7개: 대시보드, 고객·반려견관리, 예약·등하원관리, 이용권관리, 원생일지, 회계관리, 설정
- 자담멍 ERP와 완전히 별도 운영
- 가격·영업시간·정원·결석 차감 정책은 미확정; 코드에 임의로 고정하지 않음

## 배포
`clasp`와 GitHub Actions를 사용합니다. **Apps Script 프로젝트를 최초 1회 생성하고 Script ID 및 인증정보를 GitHub Secrets에 등록해야 합니다.** 아직 자동 배포가 활성화된 상태는 아닙니다.

배포는 main 브랜치 push 시 자동으로 실행하지 않고, GitHub Actions의 수동 실행(workflow_dispatch)으로 제한합니다. 운영 데이터는 저장소에 커밋하지 마세요.
