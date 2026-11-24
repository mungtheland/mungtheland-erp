# Firestore 출석 에뮬레이터 검증

이 하네스는 실제 Firebase Admin SDK와 Firestore 에뮬레이터를 사용합니다. 직원 인증과 예약 조회에는 가상 픽스처를 사용합니다. 기존 직원 서버에 연결하거나 출석 저장 플래그를 변경하지 않습니다.

## 실행

- 잠금 파일 기준으로 `guardian-auth-server`의 Node 의존성을 준비합니다.
- Java 21과 공식 Firestore 에뮬레이터 JAR를 준비합니다. 설치된 Firebase CLI의 `downloadableEmulatorInfo.json`에서 버전과 SHA-256을 확인할 수 있습니다. 34단계는 에뮬레이터 1.22.0으로 검증했습니다.
- PowerShell의 `ERP_FIRESTORE_JAVA`와 `ERP_FIRESTORE_EMULATOR_JAR`에 각각 준비한 실행 파일의 경로를 지정한 뒤 저장소 루트에서 실행합니다.

```powershell
node --test guardian-auth-server/firestore-attendance.emulator.cjs
```

하네스는 `demo-mungtheland-attendance` 프로젝트와 `127.0.0.1:18879`만 사용합니다. 해당 포트가 점유되어 있으면 중단합니다. 클라이언트의 프로젝트·호스트·포트·전송 설정을 확인하고, Node 프로세스에서 다른 TCP 연결을 차단합니다. 자식 프로세스에 ADC 관련 환경을 전달하지 않으며, Firebase CLI 로그인은 필요하지 않습니다.

각 실행은 임시 작업 디렉터리와 가상 예약을 사용합니다. 응답 유실은 커밋에 성공한 HTTP 핸들러의 응답 본문을 폐기해 재현합니다. 먼저 별도 Node 프로세스에서 실행 중인 에뮬레이터의 기록을 읽습니다. 이어 로컬 내보내기를 하고, 하네스가 시작한 Java 프로세스만 종료합니다. 일반 재시작에서는 기록이 초기화되는지 확인하고, 다시 시작해 스냅샷을 가져왔을 때 같은 기록이 복원되는지 확인합니다.
