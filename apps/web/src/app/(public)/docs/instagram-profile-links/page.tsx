import { CRELINK_LIMITS, CRELINK_WEB_PATHS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDE_ARTICLES } from '../../../../lib/docs';
import { crelinkOpenGraph } from '../../../../lib/site';

const ARTICLE = GUIDE_ARTICLES[0];

/** 인스타그램 공식 도움말 「Instagram 프로필에 웹사이트 추가하기」. 인스타그램 쪽 개수·화면은 이 도움말이 기준이라 글에 숫자를 적지 않습니다. */
const INSTAGRAM_HELP_URL = 'https://help.instagram.com/362497417173378';

export const metadata: Metadata = {
  title: ARTICLE.title,
  description: ARTICLE.description,
  openGraph: { ...crelinkOpenGraph(ARTICLE.title, ARTICLE.description), url: ARTICLE.href },
};

/**
 * 검색 유입용 활용 가이드(0146). 크리링 버튼·메뉴 이름은 사용 안내(`../guide/page.tsx`)와 같게, 숫자는 CRELINK_LIMITS에서 읽습니다.
 * 인스타그램 화면·정책은 확인한 공식 도움말 링크로만 안내합니다.
 */
export default function InstagramProfileLinksPage() {
  return (
    <article className="prose">
      <h1>{ARTICLE.title}</h1>
      <p>
        인스타그램에서 방문자를 내 유튜브 채널·스토어·포트폴리오·협업 문의처로 보내는 자리는 프로필의 링크예요. 보여 줄
        링크가 여러 개라면 아래 두 가지 방법 중 하나를 골라요.
      </p>

      <section aria-labelledby="ig-direct">
        <h2 id="ig-direct">1. 인스타그램 프로필에 링크를 바로 넣기</h2>
        <ol>
          <li>인스타그램 앱에서 내 프로필로 가서 프로필 편집을 눌러요.</li>
          <li>링크에서 외부 링크 추가를 누르고 주소와 제목을 넣어요.</li>
          <li>링크를 더 넣거나 순서를 바꾸려면 같은 화면에서 고쳐요.</li>
        </ol>
        <p>
          넣을 수 있는 링크 수와 화면 이름은 앱 버전에 따라 다를 수 있어요. 최신 기준은{' '}
          <a href={INSTAGRAM_HELP_URL} target="_blank" rel="noopener noreferrer">
            인스타그램 고객 센터의 웹사이트 추가 도움말
          </a>
          에서 확인해 주세요.
        </p>
        <p>
          이 방법은 따로 가입할 곳이 없어 간단해요. 다만 링크마다 이름만 보이고, 내 소개나 작업 이미지는 함께 보여 줄 수
          없어요.
        </p>
      </section>

      <section aria-labelledby="ig-landing">
        <h2 id="ig-landing">2. 링크 한 개로 여러 링크를 모은 페이지 걸기</h2>
        <p>
          링크를 모아 둔 페이지(링크 인 바이오 페이지) 주소 하나만 프로필에 넣는 방법이에요. 방문자는 그 주소를 눌러 내
          소개와 링크 목록을 한 화면에서 봐요. 링크를 바꿀 때도 인스타그램 프로필은 그대로 두고 페이지만 고치면 돼요.
        </p>
        <p>크리링으로 만들면 이렇게 보여요.</p>
        <ul>
          <li>프로필 사진·이름·소개({CRELINK_LIMITS.bioMax}자까지)</li>
          <li>SNS 채널 아이콘(최대 {CRELINK_LIMITS.socialLinks}개)</li>
          <li>
            외부 링크 목록(방문자에게 보이는 링크 {CRELINK_LIMITS.freeVisibleLinks}개, 숨긴 링크를 포함해{' '}
            {CRELINK_LIMITS.totalLinks}개까지 저장)
          </li>
          <li>제목·이미지·설명이 있는 포트폴리오(최대 {CRELINK_LIMITS.portfolioItems}개)</li>
        </ul>
      </section>

      <section aria-labelledby="ig-crelink">
        <h2 id="ig-crelink">크리링으로 걸기</h2>
        <ol>
          <li>
            <Link href="/">크리링 홈</Link>에서 <strong>구글로 시작하기</strong>를 눌러 가입해요. 가입하면 내 페이지와
            짧은 크리링 링크가 바로 만들어져요.
          </li>
          <li>
            <strong>페이지 편집</strong>의 미리보기에서 <strong>+ 링크 추가</strong>를 누르고 표시 이름과 주소를 넣어
            저장해요. 포트폴리오는 <strong>+ 포트폴리오 추가</strong>로 넣어요.
          </li>
          <li>
            미리보기 위 주소 막대에서 <strong>복사</strong>를 눌러 내 크리링 링크를 복사해요.
          </li>
          <li>인스타그램 앱의 프로필 편집 &gt; 링크에 복사한 주소를 붙여 넣어요.</li>
        </ol>
        <p>
          크리링 링크는 <strong>주소 설정</strong>에서 내 이름에 맞게 바꿀 수 있어요. 바꿔도 옛 주소는{' '}
          {CRELINK_LIMITS.retiredSlugGraceDays}일 동안 새 주소로 연결돼요. 메뉴마다 자세한 설명은{' '}
          <Link href={CRELINK_WEB_PATHS.docsGuide}>사용 안내</Link>에 있어요.
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
