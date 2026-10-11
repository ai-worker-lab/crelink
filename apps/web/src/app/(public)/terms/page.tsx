import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '이용약관' };

/**
 * 서비스·이벤트 이용 조건의 공개 초안입니다. 근거: docs/product/crelink.md R14·R20·R23·R24,
 * docs/work/web/0140-terms-of-service-page.md. 법률 검토 전 문구입니다.
 */
export default function TermsPage() {
  return (
    <main className="public-page narrow-page">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <article className="prose">
        <h1>이용약관</h1>
        <p className="notice-box" role="note">
          이 페이지는 법률 검토 전 서비스 이용 조건을 설명하는 초안이에요. 법률 검토나 서비스 정책에 따라 문구가 바뀔 수
          있어요.
        </p>

        <section aria-labelledby="terms-service">
          <h2 id="terms-service">1. 서비스 내용</h2>
          <p>
            크리링은 크리에이터가 SNS, 포트폴리오, 외부 링크를 한 곳에 모은 공개 랜딩페이지와 크리링 단축 주소를 만들고
            관리하는 웹 서비스예요. 현재 기본 서비스는 무료이고, 구글 계정으로 가입·로그인할 수 있어요.
          </p>
        </section>

        <section aria-labelledby="terms-account">
          <h2 id="terms-account">2. 계정과 이용 정지</h2>
          <p>
            계정은 본인이 사용할 수 있는 구글 계정으로 만들고 관리해야 해요. 크리링은 서비스 보안, 다른 사람의 권리,
            방문자의 안전을 위해 필요한 경우 계정이나 랜딩페이지의 이용을 제한하거나 정지할 수 있어요.
          </p>
          <p>
            특히 위험하거나 악성인 링크, 사칭·불법 콘텐츠, 스팸, 다른 사람의 계정이나 서비스에 피해를 주는 행위,
            약관이나 관련 법령을 위반하는 행위가 확인되면 저장·공개를 막거나 이용을 정지할 수 있어요. 정지된 계정은
            로그인과 공개 랜딩 이용이 제한될 수 있어요.
          </p>
        </section>

        <section aria-labelledby="terms-prohibited">
          <h2 id="terms-prohibited">3. 금지 행위</h2>
          <ul>
            <li>피싱·악성코드·사기 등 방문자에게 위험을 줄 수 있는 링크나 콘텐츠를 올리는 행위</li>
            <li>스팸, 자동화된 대량 요청, 다른 사람을 사칭하거나 권리를 침해하는 행위</li>
            <li>크리링의 보안·접근 제한을 우회하거나 서비스 운영을 방해하는 행위</li>
            <li>법령, 제3자 서비스 약관 또는 다른 사람의 지식재산권·개인정보를 침해하는 행위</li>
          </ul>
        </section>

        <section aria-labelledby="terms-advertising">
          <h2 id="terms-advertising">4. 광고 블록</h2>
          <p>
            배너 슬롯이 없는 랜딩페이지에는 크리링 플랫폼이 운영하는 광고 블록이 표시될 수 있어요. 광고 블록에는 광고
            표시가 붙고, 크리에이터 링크와 구별돼요. 현재는 크리링 플랫폼의 배너만 게시하며 외부 광고주나 광고
            네트워크의 배너를 받지 않아요.
          </p>
        </section>

        <section aria-labelledby="terms-event">
          <h2 id="terms-event">5. 외부 링크 +5 이벤트</h2>
          <p>
            이벤트가 열려 있을 때 신청한 계정은 보이는 외부 링크 한도가 5개 늘어나요. 이벤트 신청은 계정당 한 번이고,
            신청하지 않은 계정에는 보너스가 적용되지 않아요. 이벤트 보너스는 운영자가 따로 부여한 슬롯과 별도로
            계산돼요.
          </p>
          <p>
            이벤트 시작 전이나 종료 후에는 새 신청을 받지 않아요. 이벤트가 종료되어도 이미 신청해 받은 보너스는 회수하지
            않아요. 이벤트 기간과 신청 가능 여부는 운영자가 정한 설정에 따라 화면에 표시돼요.
          </p>
        </section>

        <section aria-labelledby="terms-operator">
          <h2 id="terms-operator">6. 운영 주체</h2>
          <p>
            크리링은 사람 운영자와 AI 운영자가 함께 운영해요. AI 운영자는 별도 계정으로 운영·기획·설계·개발·배포를
            수행하고, 실행과 운영자 행동을 기록해요. AI 운영자도 이 약관, 개인정보 처리방침, 관련 법령과 플랫폼 약관을
            지켜요.
          </p>
        </section>

        <section aria-labelledby="terms-change">
          <h2 id="terms-change">7. 약관 변경</h2>
          <p>
            서비스 내용이나 법령이 바뀌면 이 페이지를 고칠 수 있어요. 중요한 변경은 변경된 내용을 이 페이지에 게시하고,
            변경일과 적용일을 함께 알려요. 변경 후에도 서비스를 계속 이용하면 변경된 조건에 동의한 것으로 볼 수 있어요.
          </p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact">8. 문의</h2>
          <p>
            이용 중 문제가 있거나 정지·링크 차단에 관해 문의하려면 로그인 후 관리 화면의 <strong>의견 보내기</strong>를
            이용해 주세요. 문의를 처리하려면 개인정보 처리방침에 적힌 범위의 정보가 사용될 수 있어요.
          </p>
        </section>

        <p>시행일: 2026년 10월 11일</p>
      </article>
    </main>
  );
}
