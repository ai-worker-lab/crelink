import { COOKIE_NAMES, CRELINK_LIMITS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '개인정보 처리방침' };

/**
 * 개인정보 수집·보관·국외 이전 고지(R9·R11, Sentry). 근거: docs/specs/crelink-mvp.md `권한·보안·개인정보`,
 * docs/adr/0012-error-monitoring-sentry.md, docs/adr/0014-sentry-free-plan-features.md. 법률 검토 전 문구입니다.
 */
export default function PrivacyPage() {
  return (
    <main className="public-page narrow-page">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <article className="prose">
        <h1>개인정보 처리방침</h1>
        <p className="notice-box" role="note">
          법률 검토 전 문구예요. 정식 처리방침은 검토를 마친 뒤 이 페이지에 바뀌어 올라갑니다.
        </p>

        <section aria-labelledby="privacy-visitor">
          <h2 id="privacy-visitor">방문자에게서 수집하는 항목</h2>
          <p>
            크리에이터의 크리링 링크(단축 주소)로 들어오거나 랜딩페이지의 외부 링크를 누르면 다음을 기록해요. 다른
            사이트나 메신저에서 랜딩페이지 주소로 바로 들어와도 크리링 링크를 거쳐 열리므로 같은 항목이 기록돼요.
          </p>
          <ul>
            <li>접근 시각과 접근한 크리링 링크(단축 주소)</li>
            <li>유입 경로(referrer, 어느 페이지에서 왔는지)</li>
            <li>기기·브라우저·운영체제 정보(User-Agent)</li>
            <li>IP 주소 원문과 IP로 추정한 대략적인 위치(국가·도시 수준)</li>
            <li>재방문을 구분하는 방문자 식별 쿠키 값</li>
            <li>랜딩페이지에서 누른 외부 링크와 누른 시각</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-creator">
          <h2 id="privacy-creator">크리에이터(로그인 사용자)에게서 수집하는 항목</h2>
          <ul>
            <li>구글 로그인으로 받은 이메일 주소와 구글 계정 식별자</li>
            <li>크리에이터가 직접 입력한 프로필(사진·이름·소개), SNS 계정 주소, 포트폴리오, 외부 링크와 올린 이미지</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-diagnostics">
          <h2 id="privacy-diagnostics">오류·성능 진단을 위해 수집하는 항목</h2>
          <p>
            서비스에서 오류가 나거나 성능을 측정할 때(요청의 일부만 골라 측정해요), 서버나 브라우저가 경고·오류를 남길
            때 방문자와 크리에이터 모두에게서 다음을 기록해요. 이 정보는 오류 모니터링 서비스 Sentry에 보관돼요(아래
            &lsquo;개인정보 국외 이전&rsquo;).
          </p>
          <ul>
            <li>IP 주소</li>
            <li>로그인한 경우 크리링 내부 사용자 ID(이메일 주소·이름은 보내지 않아요)</li>
            <li>기기·브라우저·운영체제 정보</li>
            <li>오류 내용과 오류가 난 화면·요청 주소</li>
            <li>성능 측정 정보(요청·화면을 처리하는 데 걸린 시간)</li>
            <li>브라우저 세션: 페이지를 연 세션의 시작·끝 시각과 오류 없이 끝났는지(정상·오류·비정상 종료) 여부</li>
            <li>
              화면 리플레이: 오류가 나거나 관리 화면에서 의견 보내기 창을 연 세션만, 그 직전부터의 화면 구성 변화와
              클릭·스크롤 같은 동작, 요청 주소와 처리 결과를 기록해요. 화면의 글자·입력값·이미지·영상은 모두 가린 채
              보내고, 요청·응답의 내용은 보내지 않아요. 오류가 없는 세션은 기록하지 않아요.
            </li>
            <li>
              로그: 서버와 브라우저가 남기는 경고·오류 문장, 크리링 API 서버의 동작 기록. 이메일 주소 모양의 글자는
              지우고 보내요.
            </li>
          </ul>
          <p>
            로그인한 크리에이터·운영자가 관리 화면에서 &lsquo;의견 보내기&rsquo;로 의견을 보내면 적은 내용, 의견을 보낸
            화면 주소, 크리링 내부 사용자 ID와 위 화면 리플레이를 함께 보내요. 이름·이메일 주소는 받지 않아요. 화면
            캡처는 직접 첨부할 때만 보내는데, 가리지 않은 화면 그대로라 보내기 전에 가리기 도구로 원하는 부분을 가릴 수
            있어요.
          </p>
          <p>로그인 쿠키 같은 인증 정보는 보내지 않아요.</p>
        </section>

        <section aria-labelledby="privacy-purpose">
          <h2 id="privacy-purpose">이용 목적</h2>
          <ul>
            <li>크리에이터 랜딩페이지 제공과 크리링 링크 연결</li>
            <li>크리에이터별·기간별 접근 통계 작성(크리링 운영자만 조회)</li>
            <li>위험한 링크 차단 등 서비스 운영과 부정 이용 방지</li>
            <li>서비스 오류 파악과 성능 개선, 이용자 의견 확인(오류·성능 진단 정보)</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-retention">
          <h2 id="privacy-retention">보관 기간</h2>
          <ul>
            <li>
              접근 기록 원본(IP 주소 원문 포함)은 {CRELINK_LIMITS.rawLogRetentionDays / 365}년 보관한 뒤 자동으로
              지워요.
            </li>
            <li>
              지우기 전에 날짜별 합계(방문 수·순 방문자 수·클릭 수와 항목별 분포)를 만들어 계속 보관해요. 합계에는 IP
              주소를 넣지 않아요.
            </li>
            <li>크리에이터 계정 정보와 입력한 내용은 계정을 이용하는 동안 보관해요.</li>
            <li>
              오류·성능 진단 정보는 Sentry의 보관 기간이 지나면 지워져요(아래 &lsquo;개인정보 국외 이전&rsquo;의
              보유·이용 기간).
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies">쿠키</h2>
          <ul>
            <li>
              <code>{COOKIE_NAMES.visitor}</code>: 크리링 링크(단축 주소) 도메인이 발급하는 무작위 방문자 식별자예요.
              같은 방문자의 재방문을 구분하는 데만 쓰고 1년 동안 유지돼요. 별도 동의 창 없이 이 페이지로 알려 드려요.
              쿠키를 막아도 랜딩페이지는 그대로 볼 수 있어요.
            </li>
            <li>
              <code>{COOKIE_NAMES.session}</code>: 크리에이터 로그인을 유지하는 쿠키예요. {CRELINK_LIMITS.sessionDays}일
              동안 유지되고 로그아웃하면 지워져요.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-access">
          <h2 id="privacy-access">열람 권한</h2>
          <p>접근 기록은 크리링 운영자 화면에서만 볼 수 있어요. 크리에이터와 방문자 화면에는 보이지 않아요.</p>
        </section>

        <section aria-labelledby="privacy-transfer">
          <h2 id="privacy-transfer">개인정보 국외 이전</h2>
          <p>
            크리링은 서비스 오류를 파악하고 성능을 개선하며 이용자 의견을 확인하려고 다음과 같이 개인정보를 국외로 보내
            보관해요.
          </p>
          <ul>
            <li>
              이전받는 자: Functional Software, Inc. d/b/a Sentry(연락처: compliance@sentry.io, 45 Fremont Street, 8th
              Floor, San Francisco, CA 94105, USA)
            </li>
            <li>이전되는 국가: 미국(Sentry의 미국 데이터 저장 위치)</li>
            <li>
              이전 일시와 방법: 서비스를 이용하는 중 오류가 나거나 성능을 측정할 때, 페이지를 열고 닫을 때(브라우저
              세션), 경고·오류가 남을 때, 의견을 보낼 때마다 암호화된 네트워크 연결(HTTPS)로 보내요. 브라우저에서 생긴
              정보(오류·성능·세션·화면 리플레이·경고 문장·의견)는 이용자의 브라우저가 Sentry로 직접 보내고, 서버에서
              생긴 것(서버 로그 포함)은 크리링 서버가 보내요.
            </li>
            <li>이전되는 항목: 위 &lsquo;오류·성능 진단을 위해 수집하는 항목&rsquo;(의견과 첨부한 화면 캡처 포함)</li>
            <li>이전받는 자의 이용 목적: 크리링의 서비스 오류 파악과 성능 개선, 이용자 의견 확인을 위한 보관·조회</li>
            <li>
              보유·이용 기간: Sentry 요금제의 보관 기간이 지나면 지워져요. 무료(Developer) 요금제는 오류·성능 측정
              정보·로그·화면 리플레이·의견과 첨부한 화면 캡처 모두 수집 후 30일이에요. 유료 요금제(체험 기간 포함)는
              오류 정보 90일·성능 측정 정보 30일이고 그 밖의 항목은 그 요금제의 보관 기간을 따라요. Sentry가 만드는
              백업은 만든 날부터 90일 뒤에 지워져요.
            </li>
            <li>
              거부 방법과 거부할 때의 영향: 브라우저의 광고·추적 차단 기능(확장 프로그램 등)으로 브라우저에서 Sentry로
              보내는 전송을 막을 수 있고, 막아도 서비스는 그대로 쓸 수 있어요(의견 보내기만 실패해요). 의견과 화면
              캡처는 직접 보낼 때만 전송돼요. 서버에서 생기는 오류·성능 정보와 로그는 서비스를 안정적으로 운영하는 데 꼭
              필요해 따로 거부할 수 없어요. 이 이전을 원하지 않으면 서비스 이용을 멈춰야 해요.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-attribution">
          <h2 id="privacy-attribution">위치 정보 출처</h2>
          <p>
            <a href="https://db-ip.com" rel="noopener">
              IP Geolocation by DB-IP
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
