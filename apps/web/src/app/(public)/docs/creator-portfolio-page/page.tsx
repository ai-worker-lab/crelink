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

      <section aria-labelledby="pf-build">
        <h2 id="pf-build">2. 크리링에 정리하기</h2>
        <p>
          <Link href="/">크리링 홈</Link>에서 <strong>구글로 시작하기</strong>로 가입하면 내 페이지가 바로 만들어져요.
          관리 화면에서 아래 순서로 채워요.
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
