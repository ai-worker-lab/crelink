// 저장소 전체 ESLint 설정. 영역별 규칙은 files 범위로 나눕니다. 결정 배경은 docs/adr/0004-lint-format.md.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettierConfig from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const appFiles = ['apps/app/**/*.{js,ts,tsx}'];

// 영역 경계: 다른 앱 코드·다른 런타임 전용 의존성을 import하지 못하게 합니다. 메시지에 기준 문서를 함께 적습니다.
const BOUNDARY_DOC = '기준: docs/development/parallel-work.md#계약과-병렬화-경계';
const otherApps = (...apps) => ({
  regex: `^@crelink/(${apps.join('|')})(/|$)|(^|/)apps/(${apps.join('|')})(/|$)|^(\\.\\./)+(${apps.join('|')})/(src|test|app)(/|$)`,
  message: `앱 사이 직접 import는 금지입니다. 공유할 타입·DTO·오류 형식은 @crelink/shared 계약으로 옮기고, 데이터는 API를 HTTP로 호출해 받으세요. ${BOUNDARY_DOC}`,
});
const restricted = (regex, message) => ({ regex, message: `${message} ${BOUNDARY_DOC}` });
const serverOnlyForClients = (client) => [
  restricted(
    '^@nestjs/',
    `${client}에서 NestJS는 쓸 수 없습니다. 서버 로직은 apps/api에 두고 HTTP로 호출하며, 계약 타입은 @crelink/shared에서 가져오세요.`,
  ),
  restricted(
    '^pg(/|$)',
    `${client}에서 DB 드라이버는 쓸 수 없습니다. DB 접근은 apps/api가 소유하니 API 경로를 추가해 호출하세요.`,
  ),
];
const boundaries = (files, patterns) => ({ files, rules: { 'no-restricted-imports': ['error', { patterns }] } });

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.next/',
    '**/.next-dev/',
    '**/.expo/',
    '.local/',
    'design/',
    'packages/design-tokens/generated/',
    'apps/web/next-env.d.ts',
    'apps/app/expo-env.d.ts',
  ]),

  // 공통: JavaScript·TypeScript 권장 규칙. 앱은 Expo 설정이 자체 TypeScript 규칙을 포함하므로 제외합니다.
  { files: ['**/*.{js,mjs,cjs,ts,tsx}'], ignores: appFiles, extends: [js.configs.recommended] },
  { files: ['**/*.{ts,tsx}'], ignores: appFiles, extends: [tseslint.configs.recommended] },

  // Node 실행 코드: API, 공유 패키지, 스크립트, 루트 설정.
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.{ts,mjs}', 'scripts/**/*.mjs', '*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  { files: ['apps/api/test/**/*.ts'], languageOptions: { globals: globals.jest } },

  // 웹: Next.js 핵심 규칙과 React hooks.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    plugins: { '@next/next': nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules },
    settings: { next: { rootDir: 'apps/web' } },
    languageOptions: { globals: globals.browser },
  },

  // 앱: Expo 공식 규칙.
  { files: appFiles, extends: [expoConfig] },

  // 영역 경계. 앱 블록은 위 Expo 설정과 같은 files에 병합되며 Expo 설정은 이 규칙을 정의하지 않습니다.
  boundaries(
    ['apps/web/**/*.{js,mjs,ts,tsx}'],
    [
      otherApps('api', 'app'),
      ...serverOnlyForClients('웹'),
      restricted(
        '^react-native(/|$)',
        '웹에서 React Native는 쓸 수 없습니다. 웹 UI는 react·react-dom과 apps/web 컴포넌트로 만드세요.',
      ),
    ],
  ),
  boundaries(appFiles, [
    otherApps('api', 'web'),
    ...serverOnlyForClients('앱'),
    restricted(
      '^next(/|$)',
      '앱에서 Next.js는 쓸 수 없습니다. 화면 이동은 expo-router, API 호출은 src/lib/api/client.ts를 쓰세요.',
    ),
  ]),
  boundaries(
    ['apps/api/**/*.ts'],
    [
      otherApps('web', 'app'),
      restricted(
        '^(react|react-dom|react-native|next)(/|$)',
        'API에서 UI 프레임워크는 쓸 수 없습니다. 화면은 웹·앱이 맡고 API는 @crelink/shared 계약의 HTTP 응답만 돌려주세요.',
      ),
    ],
  ),
  boundaries(
    ['packages/shared/**/*.{js,mjs,ts}'],
    [
      {
        regex: '^@crelink/(api|web|app)(/|$)|(^|/)apps/',
        message: `공유 계약은 앱 코드를 import할 수 없습니다. 필요한 타입은 packages/shared에 직접 정의하고 앱이 이를 가져가게 하세요. ${BOUNDARY_DOC}`,
      },
      restricted(
        '^(@nestjs/|pg(/|$)|next(/|$)|react(/|$)|react-dom(/|$)|react-native(/|$))',
        '공유 계약에는 프레임워크·DB 의존성을 넣지 않습니다. 직렬화 가능한 타입·상수만 두고, 구현은 각 앱에 두세요.',
      ),
    ],
  ),

  // 서식은 Prettier가 맡으므로 서식 관련 규칙을 끕니다. 마지막에 둡니다.
  prettierConfig,
]);
