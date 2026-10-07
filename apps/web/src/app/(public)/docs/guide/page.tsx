import { CRELINK_LIMITS, CRELINK_WEB_PATHS, SOCIAL_PLATFORMS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SOCIAL_PLATFORM_LABELS } from '../../../../lib/format';

export const metadata: Metadata = { title: '사용 안내' };

const IMAGE_MAX_MB = CRELINK_LIMITS.imageMaxBytes / (1024 * 1024);
const PLATFORM_NAMES = SOCIAL_PLATFORMS.map((platform) => SOCIAL_PLATFORM_LABELS[platform].name).join('·');

/**
 * 크리에이터 사용 안내. 버튼·제목 문구는 실제 화면(apps/web/src/components/me·manage, app/me)과 같게, 숫자는 CRELINK_LIMITS에서 읽습니다.
 * 화면 문구나 동작을 바꾸면 이 안내도 같은 변경에서 고칩니다.
 */
export default function GuidePage() {
  return (
    <article className="prose">
      <h1>사용 안내</h1>
      <p>
        크리링은 SNS 채널·포트폴리오·외부 링크를 한 페이지에 모아 짧은 주소 하나로 전하는 크리에이터 랜딩페이지예요.
        가입부터 인스타그램 프로필에 붙이기까지 순서대로 안내해요.
      </p>

      <section aria-labelledby="guide-start">
        <h2 id="guide-start">1. 시작하기</h2>
        <ol>
          <li>
            <Link href="/">크리링 홈</Link>에서 <strong>구글로 시작하기</strong>를 누르고 구글 계정으로 로그인해요. 처음
            로그인하면 그대로 가입돼요.
          </li>
          <li>
            가입하면 내 랜딩페이지와 크리링 링크(영소문자·숫자 {CRELINK_LIMITS.autoSlugLength}자로 자동 발급한 짧은
            주소)가 바로 만들어지고 <strong>내 크리링</strong> 화면이 열려요.
          </li>
          <li>
            다음에 다시 들어올 때도 홈에서 로그인한 뒤 <strong>내 크리링 편집</strong>이나 <strong>링크 관리</strong>를
            누르면 돼요.
          </li>
        </ol>
      </section>

      <section aria-labelledby="guide-profile">
        <h2 id="guide-profile">2. 프로필 꾸미기</h2>
        <p>
          <strong>내 크리링</strong> 화면에서 방문자에게 보일 내용을 넣어요. 비워 둔 항목은 방문자 화면에 보이지 않아요.
        </p>
        <ul>
          <li>
            <strong>프로필</strong>: 프로필 사진, 이름(닉네임, {CRELINK_LIMITS.displayNameMax}자까지), 소개(
            {CRELINK_LIMITS.bioMax}자까지). 모두 선택 항목이고 <strong>프로필 저장</strong>을 눌러야 반영돼요. 사진이
            없으면 기본 프로필이 보여요.
          </li>
          <li>
            <strong>SNS 채널</strong>: 플랫폼을 고르고 계정 주소를 넣으면 방문자 화면에 아이콘으로 보여요. 최대{' '}
            {CRELINK_LIMITS.socialLinks}개이고 <strong>SNS 채널 저장</strong>을 눌러 반영해요. 고를 수 있는 플랫폼은{' '}
            {PLATFORM_NAMES}예요.
          </li>
          <li>
            <strong>포트폴리오</strong>: 협업·작업 이력을 제목·링크·이미지·설명으로 직접 넣어요(최대{' '}
            {CRELINK_LIMITS.portfolioItems}개). <strong>포트폴리오 추가</strong>로 넣고, 항목마다 순서를 올리고 내리거나
            고치고 지울 수 있어요.
          </li>
          <li>올릴 수 있는 이미지는 JPG·PNG·WebP·GIF, {IMAGE_MAX_MB}MB 이하예요.</li>
        </ul>
      </section>

      <section aria-labelledby="guide-links">
        <h2 id="guide-links">3. 외부 링크 관리</h2>
        <p>
          <strong>내 크리링</strong> 화면의 <strong>링크 관리 화면 열기</strong>(또는 홈의 <strong>링크 관리</strong>)를
          누르면 랜딩페이지와 같은 모양으로 보면서 링크를 편집할 수 있어요.
        </p>
        <ul>
          <li>
            <strong>링크 추가</strong>를 누르고 표시 이름, 주소(<code>http://</code>나 <code>https://</code>로 시작),
            설명(선택), 썸네일(선택)을 넣어 저장해요.
          </li>
          <li>링크 카드를 누르면 고치거나 지울 수 있어요. 지운 링크는 되돌릴 수 없어요.</li>
          <li>
            카드 옆 손잡이를 끌면 순서가 바뀌어요. 키보드에서는 손잡이에서 스페이스나 엔터로 든 뒤 위·아래 화살표로
            옮기고 다시 스페이스나 엔터로 내려놓아요.
          </li>
          <li>숨기기 스위치를 켜면 링크를 지우지 않고 방문자에게만 안 보이게 할 수 있어요.</li>
          <li>
            방문자에게 보이는 링크는 {CRELINK_LIMITS.freeVisibleLinks}개까지 둘 수 있어요. 숨긴 링크는 이 수에 들어가지
            않지만, 숨긴 링크를 포함해 전체는 {CRELINK_LIMITS.totalLinks}개까지예요. 보이는 링크를 더 늘리려면 크리링
            운영자에게 문의해 주세요.
          </li>
          <li>
            위쪽의 <strong>보기</strong>를 누르면 방문자에게 보이는 모습을 확인할 수 있어요. 여기서 누른 링크는
            방문·클릭 기록 없이 열려요.
          </li>
        </ul>
      </section>

      <section aria-labelledby="guide-share">
        <h2 id="guide-share">4. 크리링 링크 공유하기</h2>
        <ol>
          <li>
            <strong>내 크리링</strong> 화면의 <strong>내 크리링 링크</strong>에서 <strong>내 크리링 링크 복사</strong>를
            눌러요.
          </li>
          <li>인스타그램 앱에서 프로필 편집 &gt; 링크에 복사한 주소를 붙여 넣어요.</li>
        </ol>
        <p>
          방문자가 랜딩페이지 주소를 직접 열어도 크리링 링크를 거쳐 열려요. 그래서 공유할 때는 크리링 링크만 쓰면 돼요.
        </p>
        <h3>주소 바꾸기</h3>
        <ul>
          <li>
            <strong>주소 바꾸기</strong>에서 원하는 주소를 넣으면 쓸 수 있는지 바로 알려 줘요. 영소문자·숫자·하이픈(-){' '}
            {CRELINK_LIMITS.slugMinLength}~{CRELINK_LIMITS.slugMaxLength}자이고, 처음과 끝은 영소문자나 숫자여야 해요.
          </li>
          <li>
            자동 발급 주소는 바로 바꿀 수 있고, 그 뒤로는 {CRELINK_LIMITS.slugChangeIntervalDays}일에 한 번 바꿀 수
            있어요.
          </li>
          <li>
            주소를 바꿔도 옛 주소는 {CRELINK_LIMITS.retiredSlugGraceDays}일 동안 새 주소로 연결돼요. 그동안 인스타그램
            프로필의 링크도 새 주소로 바꿔 주세요.
          </li>
          <li>크리링이 쓰는 예약 주소나 다른 크리에이터가 쓰고 있는 주소는 쓸 수 없어요.</li>
        </ul>
      </section>

      <section aria-labelledby="guide-notes">
        <h2 id="guide-notes">알아 두면 좋은 것</h2>
        <ul>
          <li>
            크리링 차단 목록에 있는 도메인은 링크로 저장할 수 없어요. 크리링이 안전을 위해 차단한 링크에는{' '}
            <strong>차단됨</strong>이 붙고 방문자에게 보이지 않아요.
          </li>
          <li>방문 수와 링크 클릭 수는 지금은 크리에이터 화면에서 볼 수 없어요.</li>
          <li>
            방문자와 크리에이터에게서 무엇을 수집하고 얼마나 보관하는지는{' '}
            <Link href={CRELINK_WEB_PATHS.privacy}>개인정보 처리방침</Link>에 있어요.
          </li>
        </ul>
      </section>
    </article>
  );
}
