import { CRELINK_LIMITS, CRELINK_WEB_PATHS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDE_ARTICLES } from '../../../../lib/docs';
import { crelinkOpenGraph } from '../../../../lib/site';

const ARTICLE = GUIDE_ARTICLES[1];

export const metadata: Metadata = {
  title: ARTICLE.title,
  description: ARTICLE.description,
  openGraph: { ...crelinkOpenGraph(ARTICLE.title, ARTICLE.description), url: ARTICLE.href },
};

/**
 * 검색 유입용 활용 가이드(0146). 크리링 버튼·메뉴 이름은 사용 안내(`../guide/page.tsx`)와 같게, 숫자는 CRELINK_LIMITS에서 읽습니다.
 * 정리 요령은 크리링 기능으로 할 수 있는 것만 적습니다(성과 보장·통계 같은 확인하지 않은 주장 없음).
 */
export default function CreatorPortfolioPage() {
  return (
    <article className="prose">
      <h1>{ARTICLE.title}</h1>
      <p>
        브랜드 담당자나 다른 크리에이터가 협업을 제안하기 전에 먼저 보는 것은 내가 어떤 작업을 해 왔는지와 어디로
        연락하면 되는지예요. 이 둘을 한 페이지에 모아 인스타그램 프로필 링크에 걸어 두면, 처음 온 사람도 프로필을 누른
        뒤 바로 확인할 수 있어요.
      </p>

      <section aria-labelledby="pf-prepare">
        <h2 id="pf-prepare">1. 먼저 모아 둘 것</h2>
        <ul>
          <li>한두 문장 소개: 무엇을 만드는 사람인지, 어떤 협업을 받는지.</li>
          <li>보여 줄 작업: 협업 콘텐츠·영상·작품 주소와 대표 이미지 한 장씩.</li>
          <li>활동 중인 SNS 채널 주소.</li>
          <li>연락받을 곳: 문의 폼, 메일 주소를 적어 둔 페이지, 스토어 등.</li>
        </ul>
      </section>

      <section aria-labelledby="pf-first-link">
        <h2 id="pf-first-link">협업 문의용 링크, 무엇부터 넣을까요?</h2>
        <p>모든 링크를 한꺼번에 채울 필요는 없어요. 내가 만든 작업 하나와 연락받을 곳부터 준비해 보세요.</p>
        <p>
          <strong>가상의 구성 예시 — 실제 고객·후기·성과 사례가 아닙니다.</strong>
        </p>
        <ul>
          <li>
            <strong>대표 작업 보기:</strong> 처음 방문한 사람이 내 작업을 바로 볼 수 있는 영상·작품·포트폴리오 페이지.
          </li>
          <li>
            <strong>협업 문의하기:</strong> 내가 관리하고 실제로 문의를 받을 수 있는 웹 문의 폼이나 연락 안내 페이지.
          </li>
          <li>
            <strong>주요 채널 보기:</strong> 지금 활동하고 있는 내 채널.
          </li>
        </ul>
        <p>
          먼저 실제 주소가 준비된 링크 하나를 골라요. <strong>페이지 편집 → + 링크 추가</strong>에서{' '}
          <strong>링크 목적 (선택)</strong>을 고르면 비어 있는 표시 이름에 제목을 제안해요. 목적을 고르지 않고 직접
          작성해도 되고, 이미 쓴 제목은 바뀌지 않아요. <code>https://</code> 또는 <code>http://</code>로 시작하는 실제
          주소를 직접 입력하고 <strong>저장</strong>을 눌러요. 목적 선택만으로 저장·공개되지 않아요. 이메일 주소 자체나{' '}
          <code>mailto:</code> 대신, 연락 방법을 안내하는 웹페이지 주소를 사용하세요. 문의 폼이 없다면 대표 작업부터
          넣어도 돼요. 새 외부 서비스 가입은 필요하지 않아요.
        </p>
        <p>
          주소가 없으면 제목만 먼저 생각해 두고 저장은 나중에 해요. 예시 주소를 내 페이지에 넣거나 다른 사람의 작업을 내
          작업처럼 소개하지 않아요. 썸네일·설명·여러 링크는 선택 사항이에요.
        </p>
        <p>
          저장한 링크가 미리보기에 보이는지 확인하고 내 크리링 링크를 복사해요. 어디에 공유할지는 내가 정해요. 공유·홍보
          게시나 이벤트 신청이 링크 작성의 필수 조건은 아니에요.
        </p>
        <p>
          기본 무료 범위에서는 짧은 주소 1개와 보이는 외부 링크 {CRELINK_LIMITS.freeVisibleLinks}개를 쓸 수 있어요. 배너
          슬롯이 없는 페이지에는 크리링 광고 블록이 표시돼요. 현재 한도와 이벤트 조건은{' '}
          <Link href={CRELINK_WEB_PATHS.docsGuide}>사용 안내</Link>에서 확인해요. 협업 문의나 방문 증가를 보장하는
          기능은 아니에요.
        </p>
      </section>

      <section aria-labelledby="pf-choose-work">
        <h2 id="pf-choose-work">첫 대표 작업과 주소를 고르는 기준</h2>
        <ol>
          <li>
            <strong>받고 싶은 협업과 가까운 작업 하나를 골라요.</strong> 영상 제작 문의를 받고 싶다면 내가 만든 영상,
            디자인 협업이라면 내가 맡은 디자인을 먼저 보여 주세요. 작업 수보다 어떤 일을 맡았는지 설명할 수 있는
            결과물이 좋아요.
          </li>
          <li>
            <strong>제목에 작업과 내 역할을 적어요.</strong> 예를 들어 <em>제품 소개 영상 · 기획과 촬영</em>처럼 적으면
            무엇을 볼 수 있는지 알 수 있어요. 이 제목은 가상의 작성 예시이며 실제 작업·고객 사례가 아닙니다. 맡지 않은
            역할이나 확인하지 않은 성과는 쓰지 않아요.
          </li>
          <li>
            <strong>방문자가 열 수 있는 주소인지 확인해요.</strong> 내 작업 페이지를 로그아웃한 창에서 열어 보고,
            로그인이나 접근 승인 없이 의도한 결과물이 보이는지 확인하세요. 편집 화면 주소가 아니라 방문자용 주소를
            사용해요. 크리링에 링크를 저장해도 외부 페이지의 공개 권한은 바뀌지 않아요.
          </li>
          <li>
            <strong>공개하면 안 되는 정보는 빼요.</strong> 고객 연락처·내부 자료·비공개 작업이 함께 보이면 그 주소는
            넣지 마세요. 공개할 권한이 있는 작업만 준비하고, 권한이 불확실하면 다른 작업을 선택하거나 저장을 미뤄요.
          </li>
        </ol>
        <p>
          이미 링크가 있다면 예시를 따라 새 링크를 더 만들 필요는 없어요. <strong>페이지 편집</strong>에서 기존 링크의{' '}
          <strong>수정</strong>을 열어 제목과 주소를 직접 확인하고, 바꿀 내용이 있을 때만 저장하세요. 공개 범위를
          넓히거나 외부 서비스에 새로 가입하지 않아도 지금 공개할 수 있는 작업부터 시작할 수 있어요.
        </p>
      </section>

      <section aria-labelledby="pf-build">
        <h2 id="pf-build">2. 크리링에 정리하기</h2>
        <p>
          <Link href="/">크리링 홈</Link>에서 <strong>구글로 시작하기</strong>로 가입하면 내 페이지가 바로 만들어져요.
          관리 화면에서 아래 순서로 채워요. 이미 가입했다면 <Link href="/me">내 크리링 편집</Link>으로 이동해요.
        </p>
        <ol>
          <li>
            <strong>프로필</strong> 메뉴에 사진·이름·소개({CRELINK_LIMITS.bioMax}자까지)를 넣고{' '}
            <strong>프로필 저장</strong>을 눌러요. 소개 첫 문장에 하는 일과 받는 협업을 적으면 처음 온 사람이 빨리
            알아봐요.
          </li>
          <li>
            같은 메뉴의 <strong>SNS 채널</strong>에 채널 주소를 넣으면(최대 {CRELINK_LIMITS.socialLinks}개) 방문자
            화면에 아이콘으로 보여요.
          </li>
          <li>
            <strong>페이지 편집</strong> 미리보기에서 <strong>+ 포트폴리오 추가</strong>를 눌러 작업마다
            제목·링크·이미지· 설명을 넣어요(최대 {CRELINK_LIMITS.portfolioItems}개). 설명에는 맡은 역할과 결과물을 짧게
            적어요. 순서는 포트폴리오 구역에서 올리고 내려요. 보여 주고 싶은 작업을 위에 둬요.
          </li>
          <li>
            <strong>+ 링크 추가</strong>로 문의처·스토어 같은 외부 링크를 넣어요. 방문자에게 보이는 링크는{' '}
            {CRELINK_LIMITS.freeVisibleLinks}개까지라, 지금 보여 줄 필요가 없는 링크는 지우지 말고 숨기기 스위치로 숨겨
            둬요.
          </li>
        </ol>
      </section>

      <section aria-labelledby="pf-share">
        <h2 id="pf-share">3. 프로필 링크에 걸고 계속 고치기</h2>
        <ul>
          <li>
            미리보기 위 주소 막대에서 <strong>복사</strong>를 눌러 내 크리링 링크를 복사하고, 인스타그램 프로필 편집
            &gt; 링크에 붙여 넣어요.
          </li>
          <li>새 작업을 마치면 크리링에서 포트폴리오만 추가해요. 인스타그램 프로필의 링크는 그대로 둬도 돼요.</li>
          <li>
            랜딩페이지의 <strong>방명록</strong> 탭에는 로그인한 회원이 글을 남길 수 있고, <strong>비밀글</strong>은 쓴
            사람과 나만 봐요. 받지 않으려면 <strong>방명록 켜기</strong> 스위치를 꺼요.
          </li>
        </ul>
        <p>
          메뉴마다 자세한 설명은 <Link href={CRELINK_WEB_PATHS.docsGuide}>사용 안내</Link>에 있어요.
        </p>
        <div className="button-row">
          <Link className="primary" href="/">
            크리링 시작하기
          </Link>
        </div>
      </section>
    </article>
  );
}
