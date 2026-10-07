import { COOKIE_NAMES, CRELINK_LIMITS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '개인정보 처리방침' };

/** 개인정보 수집·보관 고지(R9·R11). 근거: docs/specs/crelink-mvp.md `권한·보안·개인정보`. 법률 검토 전 문구입니다. */
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

        <section aria-labelledby="privacy-purpose">
          <h2 id="privacy-purpose">이용 목적</h2>
          <ul>
            <li>크리에이터 랜딩페이지 제공과 크리링 링크 연결</li>
            <li>크리에이터별·기간별 접근 통계 작성(크리링 운영자만 조회)</li>
            <li>위험한 링크 차단 등 서비스 운영과 부정 이용 방지</li>
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
