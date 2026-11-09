/**
 * 저장된 User-Agent로 알려진 크롤러·링크 미리보기·자동화 도구를 판별합니다(0232). 지표 합계에서 사람이 아닌 요청을 빼는 데 씁니다.
 * 패턴 목록에 없거나 값이 없는 요청은 사람으로 둡니다. 앱 내 브라우저(Instagram·FBAN·KAKAOTALK·NAVER(inapp·Line)는 사람의 방문이므로
 * 넣지 않습니다. `kakaotalk-scrap`·`^WhatsApp/`처럼 앱 이름이 들어간 패턴은 앱의 링크 미리보기 수집기만 가리킵니다.
 */
const BOT_USER_AGENT_PATTERNS: readonly RegExp[] = [
  // 검색·광고 크롤러
  /googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|apis-google|feedfetcher-google|google-read-aloud/i,
  /bingbot|bingpreview|msnbot|adidxbot|\byeti\/|daumoa|baiduspider|yandex\w*bot|duckduckbot|duckassistbot|applebot|petalbot|seznambot|bytespider|ia_archiver/i,
  // SNS·메신저 링크 미리보기
  /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|meta-externalfetcher|meta-webindexer/i,
  /twitterbot|slackbot|discordbot|linkedinbot|telegrambot|pinterestbot|redditbot|kakaotalk-scrap|kakaostory-og-reader|skypeuripreview|vkshare|embedly|iframely|bitlybot|^whatsapp\//i,
  // AI 수집기
  /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|ccbot|cohere-ai|amazonbot|diffbot|youbot|ai2bot|timpibot|imagesiftbot/i,
  // SEO·가동 감시
  /ahrefsbot|ahrefssiteaudit|semrushbot|mj12bot|dotbot|dataforseobot|serpstatbot|blexbot|screaming frog|sitebulb|uptimerobot|pingdom|statuscake|site24x7|gtmetrix|lighthouse|pagespeed|datadogsynthetics|checkly|newrelicpinger/i,
  // 자동화 브라우저·HTTP 클라이언트
  /headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|cypress/i,
  /curl\/|wget\/|httpie\/|python-requests|python-urllib|python-httpx|aiohttp|scrapy|go-http-client|okhttp\/|^java\/|apache-httpclient|libwww-perl|node-fetch|undici|^node$|axios\/|guzzlehttp|postmanruntime|insomnia\//i,
  // 이름을 모르는 수집기의 관례 표기. 휴대폰 모델명(CUBOT 등)에 걸리지 않게 bot은 `/`가 붙은 경우만 봅니다.
  /bot\/|crawler|spider|scraper|\+https?:\/\//i,
];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
