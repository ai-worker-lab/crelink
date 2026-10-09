import { CRELINK_LIMITS, CRELINK_WEB_PATHS, SOCIAL_PLATFORMS } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SOCIAL_PLATFORM_LABELS } from '../../../../lib/format';

export const metadata: Metadata = { title: '사용 안내' };

const IMAGE_MAX_MB = CRELINK_LIMITS.imageMaxBytes / (1024 * 1024);
const PLATFORM_NAMES = SOCIAL_PLATFORMS.map((platform) => SOCIAL_PLATFORM_LABELS[platform].name).join('·');

/**
 * 크리에이터 사용 안내. 버튼·제목 문구는 실제 화면(apps/web/src/components/me·manage, app/me/landings)과 같게, 숫자는 CRELINK_LIMITS에서 읽습니다.
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
            주소)가 바로 만들어지고 내 페이지 관리 화면이 열려요.
          </li>
          <li>
            다음에 다시 들어올 때도 홈에서 로그인한 뒤 <strong>내 크리링 편집</strong>을 누르면 돼요.
          </li>
          <li>
            관리 화면에는 <strong>페이지 편집</strong>·<strong>프로필</strong>·<strong>방명록</strong>·
            <strong>주소 설정</strong> 메뉴가 있어요. 넓은 화면에서는 가운데에 방문자에게 보이는 모습이 미리보기로
            보이고, 오른쪽 패널에서 고쳐요. 휴대폰에서는 위쪽의 <strong>편집</strong>·<strong>미리보기</strong>로 바꿔
            봐요. 저장하기 전 입력도 미리보기에 바로 보여요(<strong>저장하지 않은 변경 포함</strong>). 미리보기 안
            링크는 눌러도 열리지 않으니, 실제 페이지는 미리보기 위 주소 막대의 <strong>공개 페이지 열기</strong>로
            확인해요.
          </li>
          <li>
            처음에는 <strong>페이지 편집</strong>에 <strong>인스타그램에 내 크리링 걸기</strong> 안내가 보여요. 링크나
            포트폴리오 1개 추가하기 → 내 크리링 링크 복사하기 → 인스타그램 프로필에 붙여 넣기 순서로 따라 하면 되고,
            복사·붙여 넣기·닫기 기록은 이 기기 브라우저에만 남아요. 세 단계를 마치거나 <strong>시작 안내 닫기</strong>
            (×)를 누르면 사라져요.
          </li>
        </ol>
      </section>

      <section aria-labelledby="guide-profile">
        <h2 id="guide-profile">2. 프로필 꾸미기</h2>
        <p>
          <strong>프로필</strong> 메뉴에서 방문자가 처음 만나는 소개를 넣어요. 비워 둔 항목은 방문자 화면에 보이지 않고,
          저장하지 않은 카드에는 <strong>저장 안 함</strong>이 붙어요.
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
            {CRELINK_LIMITS.portfolioItems}개). <strong>페이지 편집</strong>의 미리보기에서{' '}
            <strong>+ 포트폴리오 추가</strong>나 항목을 누르면 오른쪽 패널(휴대폰은 아래에서 올라오는 창)에서 넣고
            고치고 지울 수 있어요. 순서는 포트폴리오 구역에서 올리고 내리며 누르는 즉시 저장돼요.
          </li>
          <li>올릴 수 있는 이미지는 JPG·PNG·WebP·GIF, {IMAGE_MAX_MB}MB 이하예요.</li>
        </ul>
      </section>

      <section aria-labelledby="guide-links">
        <h2 id="guide-links">3. 외부 링크 관리</h2>
        <p>
          <strong>페이지 편집</strong>의 미리보기에서 링크를 누르면 바로 그 링크를, 링크 구역을 누르면 전체 목록을
          오른쪽 패널(휴대폰은 아래에서 올라오는 창)에서 고쳐요. 숨긴 링크는 미리보기에 없으니 링크 구역 목록에서
          찾아요. 고치던 내용은 다른 곳을 눌러도 남아 있고, <strong>← 전체</strong>로 처음 목록에 돌아가요.
        </p>
        <ul>
          <li>
            미리보기의 <strong>+ 링크 추가</strong>(또는 링크 구역의 <strong>링크 추가</strong>)를 누르고 표시 이름,
            주소(<code>http://</code>나 <code>https://</code>로 시작), 설명(선택), 썸네일(선택)을 넣어 저장해요.
          </li>
          <li>
            링크 구역 목록의 링크 카드나 <strong>수정</strong>을 눌러도 고치거나 지울 수 있어요. 지운 링크는 되돌릴 수
            없어요.
          </li>
          <li>
            카드 옆 손잡이를 끌면 순서가 바뀌고 바로 저장돼요. 키보드에서는 손잡이에서 스페이스나 엔터로 든 뒤 위·아래
            화살표로 옮기고 다시 스페이스나 엔터로 내려놓아요.
          </li>
          <li>숨기기 스위치를 켜면 링크를 지우지 않고 방문자에게만 안 보이게 할 수 있어요. 누르는 즉시 저장돼요.</li>
          <li>
            방문자에게 보이는 링크는 {CRELINK_LIMITS.freeVisibleLinks}개까지 둘 수 있어요. 숨긴 링크는 이 수에 들어가지
            않지만, 숨긴 링크를 포함해 전체는 {CRELINK_LIMITS.totalLinks}개까지예요. 보이는 링크를 더 늘리려면 크리링
            운영자에게 문의해 주세요.
          </li>
          <li>
            <strong>외부 링크 +5 이벤트</strong>가 진행 중이면 홈과 <strong>페이지 편집</strong>에 안내가 보여요.{' '}
            <strong>신청하기</strong>를 누른 계정만 보이는 링크를 5개 더 둘 수 있고, 신청은 계정마다 한 번, 이벤트 기간
            안에만 할 수 있어요. 기간이 끝나도 받은 보너스는 그대로예요. 보너스를 더해도 숨긴 링크를 포함한 전체는{' '}
            {CRELINK_LIMITS.totalLinks}개까지예요.
          </li>
        </ul>
      </section>

      <section aria-labelledby="guide-share">
        <h2 id="guide-share">4. 크리링 링크 공유하기</h2>
        <ol>
          <li>
            관리 화면 미리보기 위 주소 막대나 <strong>주소 설정</strong>의 <strong>내 크리링 링크</strong>에서{' '}
            <strong>복사</strong>를 눌러요.
          </li>
          <li>인스타그램 앱에서 프로필 편집 &gt; 링크에 복사한 주소를 붙여 넣어요.</li>
        </ol>
        <p>
          방문자가 랜딩페이지 주소를 직접 열어도 크리링 링크를 거쳐 열려요. 그래서 공유할 때는 크리링 링크만 쓰면 돼요.
        </p>
        <h3>주소 바꾸기</h3>
        <ul>
          <li>
            <strong>주소 설정</strong>(또는 주소 막대의 <strong>주소 변경</strong>)의 <strong>새 주소</strong>에 원하는
            주소를 넣으면 쓸 수 있는지 바로 알려 줘요. 영소문자·숫자·하이픈(-) {CRELINK_LIMITS.slugMinLength}~
            {CRELINK_LIMITS.slugMaxLength}자이고, 처음과 끝은 영소문자나 숫자여야 해요.
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

      <section aria-labelledby="guide-guestbook">
        <h2 id="guide-guestbook">5. 방명록</h2>
        <p>
          랜딩페이지에는 <strong>링크</strong>·<strong>방명록</strong> 탭이 있어요. 방문자는 로그인하지 않아도 공개글을
          읽을 수 있고, 글은 로그인한 회원만 {CRELINK_LIMITS.guestbookBodyMax}자까지 남길 수 있어요.
        </p>
        <ul>
          <li>
            <strong>비밀글</strong>로 남긴 글은 쓴 사람과 크리에이터만 봐요. 쓴 사람은 자기 글을 지울 수 있어요.
          </li>
          <li>
            관리 화면의 <strong>방명록</strong> 메뉴에서 비밀글·숨긴 글을 포함한 모든 글을 보고, 글마다{' '}
            <strong>숨기기</strong>를 누르면 쓴 사람과 크리에이터 말고는 그 글을 볼 수 없어요. 쓴 사람에게는 숨긴 사실이
            보이지 않아요. <strong>숨김 해제</strong>로 되돌릴 수 있어요.
          </li>
          <li>
            <strong>방명록 켜기</strong> 스위치(<strong>방명록</strong> 메뉴나 <strong>페이지 편집</strong> 미리보기의
            방명록)를 끄면 방명록 탭이 사라지고 새 글을 받지 않아요. 남은 글은 지우지 않고, 다시 켜면 그대로 보여요.
          </li>
          <li>
            글쓴이 이름과 사진은 그 회원의 크리링 프로필 이름·사진이에요. 비어 있으면 <strong>크리링 회원</strong>으로
            보여요.
          </li>
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
