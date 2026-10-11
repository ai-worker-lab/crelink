import { CRELINK_API_PATHS, CRELINK_LIMITS, CRELINK_WEB_PATHS, type PublicSlotEventResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi, ServerApiError } from '../../../../lib/api/server';
import { crelinkOpenGraph } from '../../../../lib/site';

const TITLE = '첫 크리링 완성 챌린지';
const DESCRIPTION =
  '목적 하나 고르기, 내 실제 링크 하나 저장하기, 내 프로필에 공유할 준비까지. 보상이나 외부 게시 의무 없이 내 속도로 완성해요.';

// 슬롯 신청 가능 여부는 정적 빌드 시점이 아닌 현재 API 상태로 안내합니다.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { ...crelinkOpenGraph(TITLE, DESCRIPTION), url: '/docs/first-crelink-challenge' },
};

async function readSlotEvent() {
  try {
    return {
      kind: 'loaded' as const,
      ...(await serverApi<PublicSlotEventResponse>(CRELINK_API_PATHS.publicSlotEvent)),
    };
  } catch (error) {
    if (!(error instanceof ServerApiError)) throw error;
    return { kind: 'unavailable' as const };
  }
}

export default async function FirstCrelinkChallengePage() {
  const slotEvent = await readSlotEvent();
  return (
    <article className="prose">
      <h1>{TITLE}</h1>
      <p>
        빈 페이지를 모두 채우려 하지 않아도 돼요. 방문자에게 보여 주고 싶은 목적 하나와 내 실제 링크 하나부터 시작해요.
      </p>
      <p>
        이 챌린지는 따라 해 보는 자발적 안내예요. 별도 참가 신청이나 완료 제출은 없고, 목적 선택·점검 결과를 수집하지
        않아요. 추가 보상·추첨·좋아요·팔로우·친구 초대·외부 게시 의무도 없어요. 원하는 단계만 따라 하거나 언제든 멈춰도
        돼요. 링크를 저장하면 내 공개 페이지에 보일 수 있으니 공개해도 되는 내 콘텐츠만 사용해 주세요.
      </p>
      <ol>
        <li>
          <a href="#challenge-purpose">목적 하나 고르기</a>
        </li>
        <li>
          <a href="#challenge-write">내 실제 링크 하나 저장하기</a>
        </li>
        <li>
          <a href="#challenge-share">내 프로필에 공유할 준비하기</a>
        </li>
      </ol>

      <section aria-labelledby="challenge-purpose">
        <h2 id="challenge-purpose">1. 누구에게 무엇을 보여 주고 싶나요?</h2>
        <p>
          내 목적에 가까운 항목을 펼쳐 보고, 사용할 실제 주소 하나를 준비해요. 펼치기만으로 링크가 저장되거나 신청되지
          않아요.
        </p>
        <details>
          <summary>내 대표 작업을 보여 주고 싶어요</summary>
          <p>
            내가 만든 영상·글·작품 중 공개해도 되는 하나를 골라요. 표시 이름은 어떤 작업인지 알 수 있게 써요. 예: 대표
            작업 보기.
          </p>
          <p>
            <a href="#challenge-write">내 대표 작업 주소로 2단계 시작하기</a>
          </p>
        </details>
        <details>
          <summary>협업 문의를 받을 곳을 알려 주고 싶어요</summary>
          <p>
            내가 관리하는 문의 폼이나 연락 방법이 적힌 공개 페이지 주소를 준비해요. 예: 협업 문의하기. 개인 연락처를 이
            안내에 입력하거나 제출하지 않아요.
          </p>
          <p>
            <a href="#challenge-write">내 문의 페이지 주소로 2단계 시작하기</a>
          </p>
        </details>
        <details>
          <summary>내 주요 채널을 소개하고 싶어요</summary>
          <p>
            지금 운영 중인 내 채널의 공개 주소를 준비해요. 예: 내 영상 채널 보기. 다른 사람의 채널이나 예시 주소를 대신
            저장하지 않아요.
          </p>
          <p>
            <a href="#challenge-write">내 채널 주소로 2단계 시작하기</a>
          </p>
        </details>
        <p>다른 목적이어도 괜찮아요. 방문자에게 소개할 내 실제 주소 하나를 골랐다면 다음 단계로 가요.</p>
      </section>

      <section aria-labelledby="challenge-write">
        <h2 id="challenge-write">2. 내 실제 링크 하나를 직접 저장해요</h2>
        <p>
          처음이라면 <Link href="/">크리링 홈</Link>의 <strong>구글로 시작하기</strong>로 가입해요. 이미 로그인했다면{' '}
          <Link href="/me">내 크리링 편집</Link>으로 가요. 이 안내는 다른 탭에 열어 두고 따라 해도 돼요.
        </p>
        <ol>
          <li>
            <strong>페이지 편집</strong>에서 <strong>+ 링크 추가</strong> 또는 링크 구역의 <strong>링크 추가</strong>를
            눌러요.
          </li>
          <li>
            표시 이름을 쓰고 내가 준비한 <code>http://</code> 또는 <code>https://</code> 주소를 직접 입력해요.
            설명·썸네일은 선택이에요.
          </li>
          <li>
            <strong>저장</strong>을 눌러요. 미리보기는 저장 전 입력도 보여 주므로 보이는 것만으로 저장됐다고 판단하지
            않아요.
          </li>
          <li>
            미리보기 위 주소 막대의 <strong>공개 페이지 열기</strong>로 저장한 링크가 방문자에게 보이는지 확인해요.
            미리보기 안에서는 링크가 열리지 않아요.
          </li>
        </ol>
        <p>
          저장 오류가 보이면 화면의 안내를 확인하고 주소를 고쳐 다시 저장해요. 한도가 찼다면 기존 링크를 수정하거나 숨김
          상태와 한도를 확인해요. 이 안내는 URL 안전 검사·권한·차단·슬롯 한도를 우회하지 않아요. 자세한 조작은{' '}
          <Link href={`${CRELINK_WEB_PATHS.docsGuide}#guide-links`}>외부 링크 관리 안내</Link>에서 볼 수 있어요.
        </p>
        <p>
          <a href="#challenge-share">공개 페이지에서 확인했다면 3단계로</a>
        </p>
      </section>

      <section aria-labelledby="challenge-share">
        <h2 id="challenge-share">3. 내 프로필에 공유할 준비를 해요</h2>
        <ol>
          <li>
            공개 페이지에서 표시 이름과 목적이 맞는지, 내 링크가 실제 원하는 콘텐츠로 열리는지 확인해요. 숨긴 링크나
            차단된 링크는 방문자에게 보이지 않아요.
          </li>
          <li>
            관리 화면 주소 막대 또는 <strong>주소 설정</strong>의 <strong>내 크리링 링크</strong>에서{' '}
            <strong>복사</strong>를 눌러요. 공유할 주소는 내 크리링 단축 주소예요.
          </li>
          <li>
            이 주소를 내 프로필에 넣을지 직접 결정해요. 인스타그램에 넣고 싶다면 앱의 프로필 편집 &gt; 링크에서 붙여
            넣어요. 지금 게시하지 않아도 공유 준비를 마칠 수 있어요.
          </li>
        </ol>
        <h3>내가 직접 확인하는 완성 기준</h3>
        <ul>
          <li>내가 고른 목적과 내 실제 링크가 맞아요.</li>
          <li>저장된 링크가 공개 페이지에 보이고 원하는 주소로 열려요.</li>
          <li>내 크리링 단축 주소를 어디서 복사하는지 알아요.</li>
        </ul>
        <p>
          세 가지를 확인했다면 첫 크리링 공유 준비를 마친 거예요. 이것은 스스로 하는 점검이며 서비스가 완료를 인증하거나
          외부 프로필 등록을 확인한 것은 아니에요. 나중에 작업이나 연락 방법이 바뀌면{' '}
          <Link href="/me">내 크리링 편집</Link>에서 이 링크부터 갱신해 주세요.
        </p>
        <p>
          <Link href={`${CRELINK_WEB_PATHS.docsGuide}#guide-share`}>주소 복사·변경과 공유 방법 자세히 보기</Link>
        </p>
      </section>

      <section aria-labelledby="challenge-slots">
        <h2 id="challenge-slots">링크 슬롯 이벤트는 별도 선택이에요</h2>
        <p>
          첫 링크는 기본 보이는 링크 {CRELINK_LIMITS.freeVisibleLinks}개 범위에서 시작할 수 있어요. 기존 외부 링크 +5
          이벤트는 챌린지 완성 보상이 아니에요. 안내를 읽거나 목적을 펼쳐도 자동 신청·보너스 부여는 없어요.
        </p>
        {slotEvent.kind === 'unavailable' ? (
          <p>현재 이벤트 상태를 확인하지 못했어요. 신청 가능하다고 안내하지 않으며 관리 화면에서 다시 확인해 주세요.</p>
        ) : slotEvent.event?.status === 'open' ? (
          <p>
            현재 기존 이벤트는 신청 기간이에요. 원하는 경우 <Link href="/me">내 크리링 편집</Link>의 이벤트 안내에서
            <strong> 신청하기</strong>를 직접 눌러요. 신청한 계정만 보이는 링크를 {slotEvent.event.bonusLinks}개 더 둘
            수 있어요. 신청 순간의 기간·결과는 관리 화면에서 다시 확인해 주세요.
          </p>
        ) : slotEvent.event?.status === 'scheduled' ? (
          <p>현재 기존 이벤트는 시작 전이에요. 지금은 새 신청을 할 수 없지만 첫 링크 작성은 계속할 수 있어요.</p>
        ) : slotEvent.event?.status === 'ended' ? (
          <p>
            현재 기존 이벤트는 종료됐어요. 새 신청은 받지 않으며 이미 받은 보너스는 유지돼요. 첫 링크 작성은 계속할 수
            있어요.
          </p>
        ) : (
          <p>현재 안내할 슬롯 이벤트가 없어요. 기본 한도에서 첫 링크를 작성할 수 있어요.</p>
        )}
        <p>
          기존 이벤트 신청은 계정당 한 번이에요. 이미 신청했다면 다시 보너스를 받지 않고, 기간이 끝나도 받은 보너스는
          유지돼요. 운영자 수동 추가 슬롯과 이벤트 보너스는 따로 합산하며 숨긴 링크를 포함한 전체 상한은{' '}
          {CRELINK_LIMITS.totalLinks}개예요. 오류·이미 신청·종료 상태는 관리 화면의 실제 안내를 따라 주세요.
        </p>
      </section>
      <p>
        <Link href="/me" className="primary">
          내 크리링에서 직접 작성하기
        </Link>
      </p>
    </article>
  );
}
