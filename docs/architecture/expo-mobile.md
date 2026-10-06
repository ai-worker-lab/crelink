# Expo 모바일 구조와 구현 기준

**상태: 구현 기준.** 이 문서는 Expo SDK 54 + React Native 0.81 + Expo Router 6 앱의 route, 기능 폴더, API 경계를 정의한다. iOS와 Android는 각 스토어 심사 후 독립 공개한다.

## 권장 소스 구조

```text
apps/app/
  app/
    _layout.tsx                    # providers + root stack
    index.tsx                      # 시작 화면
  src/
    features/<feature>/            # 기능별 화면·유스케이스 (제품 범위 확정 후 추가)
    components/ui/                 # 공용 UI primitive
    lib/api/client.ts              # EXPO_PUBLIC_API_BASE_URL 기반 API client
```

Expo Router route 파일은 화면 전환과 URL/Deep Link 경계만 담당한다. 업무 로직·API 요청·폼 상태는 기능 폴더로 분리하고 공통 API/UI primitive를 재사용한다. 하나의 거대한 `app/index.tsx`에서 모든 화면을 조건부 렌더링하지 않는다.

## API와 보안 경계

- 앱은 `src/lib/api/client.ts`를 통해 Nest API를 호출하고 `@crelink/shared`의 경로·타입을 사용한다. 오류는 API의 `{code, message}` 형태를 그대로 해석한다.
- Expo Router의 route 보호는 client navigation UX일 뿐 보안 경계가 아니다. 권한이 필요한 기능이 생기면 실제 권한 경계는 NestJS에 둔다.
- `EXPO_PUBLIC_*` 값은 앱 번들에 포함되는 공개 설정이다. 비밀 키나 서명 자격 증명을 넣지 않는다. 민감한 값을 기기에 저장해야 하면 AsyncStorage가 아니라 `expo-secure-store` 같은 암호화 저장소를 사용한다.
- 색·간격·모서리·글자 크기는 `@crelink/design-tokens`의 객체만 사용한다([사용법](../../packages/design-tokens/docs/usage.md)).

## 조사 근거

- [Expo Router Introduction](https://docs.expo.dev/router/introduction/): file-based routes, deep links, typed routes, route splitting을 설명하고 새 앱에 Expo Router 사용을 권장한다.
- [Expo Router Protected Routes](https://docs.expo.dev/router/advanced/protected/): client guard와 서버 권한 검사의 경계를 설명한다.
- [SecureStore SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/): native encrypted key-value storage와 platform persistence 경고를 설명한다.
- [AsyncStorage SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/async-storage/): non-sensitive local key-value persistence를 설명한다.

## 현재 저장소와의 차이

`apps/app`은 초기 골격이다. `app/_layout.tsx`는 토큰 배경색의 root stack, `app/index.tsx`는 앱 이름·컨셉과 `GET /api/health/ready`(API·DB 준비 상태) 결과(로딩·정상·오류와 다시 시도)를 보여 주는 시작 화면이다. `src/components/ui`에 공통 UI primitive, `src/lib/api/client.ts`에 API client가 있고 `src/features/`는 아직 없다. 제품 기능, 스토어 빌드·서명 설정은 구성하지 않았다. Expo 개발 서버는 `expo start --port <EXPO_PORT>`로 실행한다. `EXPO_PORT`가 없으면 `pnpm instance --get EXPO_PORT`로 이 checkout 인스턴스 포트를 읽고, `make app-up`은 인스턴스 포트를 환경으로 넘긴다([로컬 개발 환경](../development/local-environment.md#인스턴스와-포트)).
