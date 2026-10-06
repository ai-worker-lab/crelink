# 모바일 런타임 설정

`make up`(또는 `pnpm instance`)이 `apps/app/.env`가 없으면 `apps/app/.env.example`에서 만들고 `EXPO_PUBLIC_API_BASE_URL`을 이 checkout 인스턴스의 API 주소(`http://127.0.0.1:<API 포트>`, 값은 `pnpm instance --get EXPO_PUBLIC_API_BASE_URL`)로 채웁니다. 기기·에뮬레이터에서 다른 주소가 필요하면 이 값을 실행 환경에서 접근 가능한 API origin으로 고칩니다. `make app-up`으로 띄우면 인스턴스 값이 파일 값보다 우선하므로, 다른 주소가 필요할 때는 `pnpm dev:app`으로 직접 실행합니다. 앱은 `/api` 경로를 요청에 붙입니다. 값 변경 후 Expo 개발 서버를 다시 시작해야 환경변수가 번들에 반영됩니다. `.env`는 개발자별 파일이며 실제 비밀값을 넣지 않습니다.

아래 `<API 포트>`는 이 checkout에서 `pnpm instance`가 출력하는 API 포트입니다.

- iOS 시뮬레이터 기본값: `http://127.0.0.1:<API 포트>`
- Android 에뮬레이터: 호스트 루프백 별칭 `http://10.0.2.2:<API 포트>`를 쓰거나, `adb reverse tcp:<API 포트> tcp:<API 포트>`로 연결해 `http://127.0.0.1:<API 포트>`를 그대로 씁니다. 에뮬레이터 검증 절차는 [앱 기기 검증](device-testing.md)을 참고합니다.
- 실기기: 개발 컴퓨터의 LAN IP(예: `http://192.168.1.20:<API 포트>`) 또는 기기에서 접근 가능한 HTTPS origin을 씁니다. 기기와 API 호스트가 같은 네트워크에 있어야 하며 `127.0.0.1`은 실기기 자신을 가리킵니다.

`EXPO_PUBLIC_*`는 앱 번들에 포함되는 공개 값이므로 비밀값을 넣지 않습니다.

실제 iOS·Android 기기에서 `localhost`는 개발 컴퓨터가 아니라 해당 기기를 가리킵니다. 기기에서 접근할 수 있는 HTTPS 주소 또는 개발 컴퓨터의 LAN IP(예: `http://192.168.1.20:<API 포트>`)를 사용하고, 기기와 API 호스트가 네트워크로 통신할 수 있어야 합니다. 로컬 HTTP에는 플랫폼별 cleartext 설정이 필요할 수 있으므로 HTTPS를 우선합니다.

앱 scheme은 `crelink`입니다.

## 독립 스토어 출시 준비

현재 `app.json`에는 iOS `bundleIdentifier`, Android `package`(application ID), EAS project UUID가 없고, 이 앱의 `eas.json` build profile도 없습니다. 값을 만들어 넣지 말고 스토어에 등록할 식별자와 프로파일을 먼저 결정·등록한 후 빌드합니다. 아직 출시 설정이나 제출은 완료되지 않았습니다.

- **iOS App Store:** Apple Developer Program 팀, 등록된 bundle identifier, App Store Connect 앱 레코드, 배포 서명 인증서와 provisioning profile(또는 승인된 EAS 관리 서명), App Store Connect 제출 권한이 필요합니다. 현재 팀, 식별자, 서명 자료, 앱 레코드, 제출 권한은 확인되지 않았습니다.
- **Google Play:** Play Console 개발자 계정과 앱 레코드, 등록된 Android application ID, Android 배포 서명 키(또는 승인된 EAS 관리 자격 증명), 업로드 권한이 필요합니다. 현재 관련 계정, 앱, 서명 자격 증명은 설정되지 않았습니다.

두 스토어 모두 프로덕션 API origin과 각 플랫폼 실기기 출시 후보 검증도 필요합니다. 두 스토어의 차단 조건은 별도입니다. 한 스토어의 승인·공개가 다른 스토어의 준비·공개를 뜻하지 않습니다.
