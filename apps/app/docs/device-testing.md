# 앱 기기 검증

## 현재 기준

개발 중 앱 동작 검증은 **Android 에뮬레이터를 우선**합니다. 화면·흐름·API 호출은 iOS와 같은 코드이므로 Android에서 확인한 기능 동작은 iOS에도 적용됩니다. iOS에서만 달라질 수 있는 안전 영역, 키보드, 폰트·렌더링은 iOS 관련 변경이 있을 때와 **TestFlight 제출 전**에 아래 iOS 시뮬레이터 절차 또는 실기기로 확인합니다.

API·Expo Metro 포트는 checkout 인스턴스마다 다릅니다(주 checkout은 슬롯 0, git worktree는 슬롯마다 다름). 아래 절차의 `<API 포트>`·`<Expo 포트>`는 그 checkout에서 `pnpm instance`가 출력하는 값(값 하나만: `pnpm -s instance --get API_PORT`, `pnpm -s instance --get EXPO_PORT`)입니다. `apps/app`의 `start`·`android`·`ios` 스크립트는 `EXPO_PORT`가 없으면 이 인스턴스의 Expo 포트로 `expo start --port`를 실행합니다.

## Android 에뮬레이터 절차

1. 로컬 서비스를 실행합니다: `make up`.
2. 에뮬레이터를 부팅하고 Orca에 연결합니다: `orca emulator attach Pixel_8 --json`. Orca는 `ANDROID_HOME`이 없어도 `~/Library/Android/sdk`를 찾습니다.
3. 에뮬레이터의 `127.0.0.1`을 Mac의 API와 Metro로 연결합니다.

   ```sh
   API_PORT=$(pnpm -s instance --get API_PORT)
   EXPO_PORT=$(pnpm -s instance --get EXPO_PORT)
   ~/Library/Android/sdk/platform-tools/adb reverse tcp:$API_PORT tcp:$API_PORT
   ~/Library/Android/sdk/platform-tools/adb reverse tcp:$EXPO_PORT tcp:$EXPO_PORT
   ```

   이렇게 하면 `apps/app/.env`의 `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:<API 포트>`를 그대로 쓸 수 있습니다. 에뮬레이터를 다시 부팅하면 다시 실행합니다.
4. Expo Go가 없으면 `apps/app`에서 `pnpm android`(`expo start --android --port <Expo 포트>`)를 한 번 실행해 설치한 뒤 종료합니다.
5. 앱을 엽니다: `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:<Expo 포트> host.exp.exponent`.
6. `orca emulator ax --json`으로 화면 요소를 읽고 `orca emulator tap <x> <y>`(0..1 정규화 좌표), `orca emulator type`으로 조작합니다. 화면 확인에는 `adb exec-out screencap -p`를 씁니다.

## iOS 시뮬레이터 절차 (Xcode 27)

Orca 1.4.217의 `orca emulator`는 serve-sim 0.1.40을 포함해, Xcode 27이 `SimulatorKit.framework`를 `Contents/SharedFrameworks/`로 옮긴 뒤로 iOS 시뮬레이터에 연결하지 못합니다. Orca가 serve-sim을 올리기 전까지는 Xcode 27을 지원하는 serve-sim 0.1.47을 직접 씁니다. iOS 시뮬레이터는 Mac과 네트워크를 공유하므로 `127.0.0.1:<API 포트>`·`127.0.0.1:<Expo 포트>`를 그대로 씁니다.

1. 로컬 서비스를 실행하고 시뮬레이터를 부팅합니다: `make up`, `xcrun simctl boot "iPhone 17 Pro"`.
2. serve-sim `type`은 하드웨어 키 입력이라, 시뮬레이터에서 활성인 키보드 언어대로 입력됩니다. 영문을 입력할 때는 영어 키보드를 첫 항목으로 두고 재부팅합니다.

   ```sh
   xcrun simctl spawn <udid> defaults write .GlobalPreferences AppleKeyboards -array 'en_US@sw=QWERTY;hw=Automatic' 'emoji@sw=Emoji'
   xcrun simctl shutdown <udid> && xcrun simctl boot <udid>
   ```

3. 제어 도구를 띄웁니다. serve-sim helper의 기본 시작 포트는 `3100`입니다. API 포트와 겹치면 다른 시작 포트를 지정합니다: `npx serve-sim@0.1.47 --detach --quiet --port 3300 <udid>`. 출력의 `url`을 씁니다. 이 포트 지정은 아직 이 Mac에서 실행해 보지 않았습니다.
4. 앱을 엽니다: `xcrun simctl openurl <udid> exp://127.0.0.1:<Expo 포트>`. 설치 여부는 `xcrun simctl get_app_container <udid> host.exp.Exponent`로 확인합니다. Xcode 27에서는 `npx expo start --ios`가 Simulator 앱을 찾지 못해 실패하므로, Expo Go 시뮬레이터 빌드(`.app`)를 `xcrun simctl install <udid> <Exponent.app>`로 설치합니다. 이 설치 경로는 아직 이 Mac에서 실행해 보지 않았습니다.
5. `GET <url>/helper/<udid>/ax`로 화면 요소 트리(JSON, 포인트 좌표)를 읽고, 요소 중심을 화면 크기로 나눈 0..1 좌표로 `npx serve-sim@0.1.47 tap <x> <y> -d <udid>`를 보냅니다. 입력은 `type <text>`, 스크롤은 `gesture`(`begin`→`move`→`end`), 화면 확인은 `xcrun simctl io <udid> screenshot <file>`을 씁니다.
6. 끝나면 `npx serve-sim@0.1.47 --kill`로 제어 도구를 멈춥니다.

## 확인 흐름

- 앱 실행 → 시작 화면에 앱 이름·컨셉과 API·DB 상태 "정상" 표시
- API를 멈춘 상태에서 오류 안내와 "다시 시도" 표시 → API 재시작 후 "다시 시도"로 "정상" 표시
- 하드웨어 뒤로 가기

## 제약

- `orca emulator type`, serve-sim `type`, `adb shell input text`는 US-ASCII만 보냅니다.
- Android에서는 키보드가 열린 상태에서 아래쪽 입력칸이 키보드에 가려 좌표 탭이 키보드에 떨어질 수 있습니다. 다음 칸을 누르기 전에 뒤로 가기(`adb shell input keyevent 4`)로 키보드를 닫습니다.
- iOS serve-sim `type`은 가끔 문자를 빠뜨리거나 순서를 바꿉니다. 입력 후 요소 트리의 값(`AXValue`)을 확인합니다.
- iOS 시뮬레이터는 하드웨어 키보드 입력이라 소프트웨어 키보드가 뜨지 않습니다. iOS 키보드 가림은 실기기에서 확인합니다.
