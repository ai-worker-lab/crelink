import { CRELINK_LIMITS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '이용약관' };

/**
 * 서비스 이용 조건의 공개 초안입니다. 근거: docs/product/crelink.md R13·R14·R20·R23,
 * docs/specs/crelink-link-limit-ad-toggle.md(광고 블록 켜고 끄기, 외부 링크 한도), docs/work/web/0140-terms-of-service-page.md,
 * docs/specs/instagram-comment-dm.md `권한·보안·개인정보`(인스타그램 댓글 자동 DM, work item 0267).
 * 법률 검토 전 문구입니다.
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
            <li>
              인스타그램 댓글 자동 DM에서 팔로우나 구독을 DM을 받는 조건으로 붙이는 행위, 수신 거부를 우회하거나 수신
              거부 안내를 가리거나 없애는 행위(7조)
            </li>
            <li>크리링의 보안·접근 제한을 우회하거나 서비스 운영을 방해하는 행위</li>
            <li>법령, 제3자 서비스 약관 또는 다른 사람의 지식재산권·개인정보를 침해하는 행위</li>
          </ul>
        </section>

        <section aria-labelledby="terms-advertising">
          <h2 id="terms-advertising">4. 광고 블록</h2>
          <p>
            랜딩페이지의 링크 사이에는 크리링 플랫폼이 운영하는 광고 블록을 둘 수 있어요. 광고 블록은 크리링이 기능을
            열고 크리에이터가 관리 화면에서 직접 켠 경우에만 보이고, 기본은 꺼져 있어요. 배너 슬롯을 받은 랜딩페이지에는
            광고 블록 대신 크리에이터 배너가 보여요.
          </p>
          <p>
            광고 블록에는 광고 표시가 붙고, 크리에이터 링크와 구별돼요. 현재는 크리링 플랫폼의 배너만 게시하며 외부
            광고주나 광고 네트워크의 배너를 받지 않아요. 광고 수익을 크리에이터와 나눌지와 그 조건은 아직 정해지지
            않았어요. 정해지면 적용 전에 이 페이지에 미리 알려요.
          </p>
        </section>

        <section aria-labelledby="terms-links">
          <h2 id="terms-links">5. 외부 링크 한도</h2>
          <p>
            외부 링크는 계정마다 숨긴 링크를 포함해 {CRELINK_LIMITS.totalLinks}개까지 둘 수 있어요. 모든 크리에이터에게
            같은 한도이고, 돈을 내고 한도를 늘리는 상품은 없어요.
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

        <section aria-labelledby="terms-instagram-dm">
          <h2 id="terms-instagram-dm">7. 인스타그램 댓글 자동 DM</h2>
          <p>
            크리에이터가 인스타그램 계정을 연결하고 규칙을 켜면, 정한 키워드가 든 댓글을 단 사람에게 크리에이터가 쓴
            문구와 링크를 DM으로 보낼 수 있어요. 이 기능은 크리링이 기능을 열어 둔 때에만 쓸 수 있고, 크리링은 서비스
            보안, 플랫폼 정책, 수신자 보호를 위해 기능 전체나 특정 계정의 자동 DM을 멈출 수 있어요. 멈춘 계정은
            크리에이터가 직접 풀 수 없고, 연결을 해제했다가 다시 연결해도 멈춘 상태가 유지돼요. 같은 인스타그램 계정을
            다른 크리링 계정에 연결하는 것도 거부돼요. 다만 Meta의 데이터 삭제 요청을 처리하면 연결 정보와 함께 정지
            기록도 지워져요.
          </p>
          <ul>
            <li>
              메시지 내용의 책임: DM의 문구, 링크가 가리키는 곳, 보낼 대상과 키워드는 크리에이터가 정하고 그 내용은
              크리에이터가 책임져요. 크리링은 내용을 미리 검토하지 않아요. 법령과 인스타그램(Meta)의 약관·정책을
              어기거나, 속이거나 위험한 내용을 담은 DM은 보낼 수 없어요.
            </li>
            <li>
              팔로우 조건 금지: 팔로우, 구독, 좋아요, 공유 같은 행동을 해야 링크를 받을 수 있다고 안내하거나 그런 조건을
              내세워 댓글을 유도할 수 없어요.
            </li>
            <li>
              수신 거부 존중: 자동 DM에는 크리링이 &lsquo;자동 발송 메시지&rsquo; 표시와 수신 거부 링크를 붙이고,
              크리에이터는 이 줄을 뺄 수 없어요. 수신 거부한 사람에게 다른 수단으로 같은 자동 DM을 보내려 하거나 수신
              거부를 우회·방해하는 행위는 금지돼요.
            </li>
          </ul>
          <p>
            3조의 &lsquo;자동화된 대량 요청&rsquo; 금지는 크리링을 통하지 않고 크리링 서비스나 다른 사람의 계정에 자동
            요청을 보내는 행위에 그대로 적용돼요. 이 조의 자동 DM은 크리링이 제공하는 기능을 이 조의 조건에 따라 쓰는
            경우에 한해 허용되며, 이 조건을 어기면 2조에 따라 자동 DM이나 계정의 이용을 제한하거나 정지할 수 있어요.
            자동 DM에서 모은 정보의 처리는 개인정보 처리방침의 &lsquo;인스타그램 댓글 자동 DM&rsquo;을 따라요.
          </p>
        </section>

        <section aria-labelledby="terms-change">
          <h2 id="terms-change">8. 약관 변경</h2>
          <p>
            서비스 내용이나 법령이 바뀌면 이 페이지를 고칠 수 있어요. 중요한 변경은 변경된 내용을 이 페이지에 게시하고,
            변경일과 적용일을 함께 알려요. 변경 후에도 서비스를 계속 이용하면 변경된 조건에 동의한 것으로 볼 수 있어요.
          </p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact">9. 문의</h2>
          <p>
            이용 중 문제가 있거나 정지·링크 차단에 관해 문의하려면 로그인 후 관리 화면의 <strong>의견 보내기</strong>를
            이용해 주세요. 문의를 처리하려면 개인정보 처리방침에 적힌 범위의 정보가 사용될 수 있어요.
          </p>
        </section>

        <p>변경일: 2026년 11월 11일 (인스타그램 댓글 자동 DM 조항 추가)</p>
        <p>시행일: 2026년 11월 11일 (이전 시행일: 2026년 10월 12일)</p>
      </article>
    </main>
  );
}
