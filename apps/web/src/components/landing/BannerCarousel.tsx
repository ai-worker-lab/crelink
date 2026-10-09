'use client';

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { RemoteImage } from '../RemoteImage';

/**
 * 공개 랜딩 링크 목록 안의 크리링 광고 블록(R20)·크리에이터 배너 슬롯(R21) 캐러셀(디자인 design/ad-banner-block/handoff.md
 * `공개 랜딩`·`접근성`, 설계 docs/specs/crelink-ad-banner.md `화면 상태와 API 대응`).
 *
 * - 장 내용은 children(장마다 하나)으로 받습니다. `Landing`이 장마다 링크(`<a>`)·고르기 버튼·그냥 이미지 중 무엇을 그릴지 정하고,
 *   이미지는 `BannerPicture`로 그립니다. 서버 구성 요소에서 함수형 render prop을 넘길 수 없기 때문입니다.
 * - 가로 `scroll-snap` 트랙(스와이프)·이전/다음 버튼·블록 안 ←/→ 키로 넘깁니다. 자동으로 넘기지 않고, 끝에서 순환하지 않습니다.
 *   지금 장은 `IntersectionObserver`로 셉니다(`scrollend`가 없는 iOS WKWebView). ←/→는 기본 가로 스크롤을 막고 `scrollTo`로 넘긴 뒤
 *   초점을 새 장의 링크(없으면 영역)로 옮깁니다. 끝 버튼이 비활성이 될 때 그 버튼에 초점이 있었으면 반대 버튼으로 옮깁니다.
 * - 보이지 않는 장은 `inert`이고, 장이 바뀌면 `aria-live` 안내(`3장 중 2번째 배너`)를 읽습니다.
 * - 불러오지 못한 이미지의 장은 건너뛰고, 남은 장이 0이면 아무것도 그리지 않습니다.
 * - 움직이는 배너(`animated`)가 한 장이라도 있으면 `움직임 멈추기`/`다시 재생` 버튼을 둡니다(설계 미정 1 C). 멈추면 모든 움직이는
 *   배너가 정지 이미지로 바뀌고, 저장하지 않습니다. `prefers-reduced-motion: reduce`면 `BannerPicture`가 처음부터 정지 이미지를 고르고
 *   버튼은 CSS로만 숨겨 서버 렌더와 첫 그림을 맞춥니다.
 */
export function BannerCarousel({
  label,
  ad,
  animated,
  slideTags,
  children,
}: {
  /** 영역 이름: `크리링 광고`, `<표시 이름> 배너`(없으면 `크리에이터 배너`). */
  label: string;
  /** 크리링 광고 블록이면 조작 줄에 `광고` 배지를 늘 둡니다. */
  ad: boolean;
  /** children과 같은 순서로, 장마다 움직이는 배너(정지 이미지가 있음)인지. */
  animated: readonly boolean[];
  /** 관리 화면 미리보기: children과 같은 순서의 장별 이름표. 가로 스크롤 트랙에 잘리지 않게 트랙 밖(위)에 지금 장의 것만 둡니다. */
  slideTags?: readonly ReactNode[];
  children: ReactNode;
}) {
  const slides = Children.toArray(children);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const [current, setCurrent] = useState(0);
  const [announced, setAnnounced] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  /** 버튼·키로 넘기는 중인 목표 장. 부드러운 스크롤이 지나가는 중간 장을 지금 장으로 세지 않습니다. */
  const scrollTarget = useRef<number | null>(null);
  const scrollTargetTimer = useRef<number | undefined>(undefined);
  /**
   * 장을 바꾼 뒤(커밋 뒤) 초점을 옮길 곳. ←/→는 새 장의 링크로(`inert`가 풀린 뒤), 끝 버튼이 비활성이 되면 반대 버튼으로
   * (그 버튼은 같은 커밋에서야 활성이 됨) 옮깁니다.
   */
  const focusAfter = useRef<{ index: number; to: 'slide' | 'prev' | 'next' } | null>(null);

  const visible = slides.map((node, slide) => ({ node, slide })).filter(({ slide }) => !failed.has(slide));
  const count = visible.length;
  const index = Math.min(current, Math.max(count - 1, 0));

  /** 지금 장을 바꿉니다. 비활성이 될 끝 버튼에 초점이 있으면 커밋 뒤 반대 버튼으로 옮깁니다. */
  function settle(next: number) {
    const active = document.activeElement;
    if (next === 0 && active === prevRef.current) focusAfter.current = { index: next, to: 'next' };
    if (next === count - 1 && active === nextRef.current) focusAfter.current = { index: next, to: 'prev' };
    setCurrent(next);
    setAnnounced(next);
  }

  function goTo(next: number, moveFocus = false) {
    const track = trackRef.current;
    const slide = track?.children[next] as HTMLElement | undefined;
    if (!track || !slide) return;
    scrollTarget.current = next;
    clearTimeout(scrollTargetTimer.current);
    // 사용자가 스크롤을 가로채 목표에 닿지 못해도 다시 지금 장을 셀 수 있게 풉니다.
    scrollTargetTimer.current = window.setTimeout(() => {
      scrollTarget.current = null;
    }, 1000);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: slide.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    settle(next);
    if (moveFocus) focusAfter.current = { index: next, to: 'slide' };
  }

  const onSlideSeen = useEffectEvent((seen: number) => {
    if (scrollTarget.current !== null) {
      if (seen !== scrollTarget.current) return;
      scrollTarget.current = null;
    }
    if (seen !== index) settle(seen);
  });

  // 스와이프·트랙패드로 넘긴 장을 셉니다(장의 60% 이상이 보이면 지금 장).
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            onSlideSeen(Number((entry.target as HTMLElement).dataset.position));
          }
        }
      },
      { root: track, threshold: 0.6 },
    );
    for (const slide of track.children) observer.observe(slide);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => () => clearTimeout(scrollTargetTimer.current), []);

  useLayoutEffect(() => {
    const pending = focusAfter.current;
    if (!pending || pending.index !== index) return;
    focusAfter.current = null;
    if (pending.to === 'prev') prevRef.current?.focus();
    else if (pending.to === 'next') nextRef.current?.focus();
    else {
      const slide = trackRef.current?.children[index];
      const target = slide?.querySelector<HTMLElement>('a[href], button');
      (target ?? regionRef.current)?.focus({ preventScroll: true });
    }
  }, [index]);

  if (count === 0) return null;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (count < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    // 링크에 초점이 있을 때 브라우저 기본 가로 스크롤과 겹치지 않게 막고 직접 넘깁니다.
    event.preventDefault();
    const next = index + (event.key === 'ArrowRight' ? 1 : -1);
    if (next >= 0 && next < count) goTo(next, true);
  }

  const hasAnimated = visible.some(({ slide }) => animated[slide]);
  const multiple = count >= 2;
  const controls = ad || multiple || hasAnimated;
  const tag = slideTags?.[visible[index].slide] ?? null;
  const motion: CarouselMotion = {
    paused,
    fail: (slide) => setFailed((previous) => (previous.has(slide) ? previous : new Set(previous).add(slide))),
  };

  return (
    <section
      ref={regionRef}
      className="banner-carousel"
      aria-roledescription="캐러셀"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {tag}
      <CarouselContext value={motion}>
        <div ref={trackRef} className="banner-track">
          {visible.map(({ node, slide }, position) => (
            <div
              key={slide}
              className="banner-slide"
              role="group"
              aria-roledescription="배너"
              aria-label={`${position + 1} / ${count}`}
              data-position={position}
              inert={position !== index}
            >
              <SlideContext value={slide}>{node}</SlideContext>
            </div>
          ))}
        </div>
      </CarouselContext>
      {controls ? (
        <div className={`banner-controls${!ad && !multiple ? ' is-pause-only' : ''}`}>
          {ad ? <span className="banner-ad-badge">광고</span> : null}
          {multiple ? (
            <>
              <span className="banner-position">
                {index + 1} / {count}
              </span>
              <button
                ref={prevRef}
                type="button"
                className="banner-button"
                aria-label="이전 배너"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="M15 5l-7 7 7 7" {...ICON_STROKE} />
                </svg>
              </button>
              <button
                ref={nextRef}
                type="button"
                className="banner-button"
                aria-label="다음 배너"
                disabled={index === count - 1}
                onClick={() => goTo(index + 1)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="M9 5l7 7-7 7" {...ICON_STROKE} />
                </svg>
              </button>
            </>
          ) : null}
          {hasAnimated ? (
            <button
              type="button"
              className="banner-button banner-pause"
              aria-label={paused ? '다시 재생' : '움직임 멈추기'}
              onClick={() => setPaused((value) => !value)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                {paused ? (
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                ) : (
                  <path d="M9 5v14M15 5v14" {...ICON_STROKE} />
                )}
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {announced === null ? '' : `${count}장 중 ${Math.min(announced, count - 1) + 1}번째 배너`}
      </p>
    </section>
  );
}

const ICON_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

interface CarouselMotion {
  /** `움직임 멈추기`를 눌렀는지. */
  paused: boolean;
  /** 이 장(`SlideContext`)의 이미지를 불러오지 못했다고 알립니다. */
  fail: (slide: number) => void;
}

const CarouselContext = createContext<CarouselMotion>({ paused: false, fail: () => {} });
const SlideContext = createContext(0);

/**
 * 배너 이미지 한 장(3:1, 가운데 기준 잘라 채움). 정지 이미지(`still`)가 있으면 `<picture>`의 `prefers-reduced-motion: reduce` 소스로
 * 고르고, 캐러셀의 `움직임 멈추기`를 누르면 정지 이미지로 바꿉니다. 불러오지 못하면 캐러셀이 그 장을 건너뜁니다
 * (하이드레이션 전에 실패해 `onError`가 오지 않은 경우도 마운트 때 `complete && naturalWidth === 0`으로 확인).
 * 첫 장 말고는 `loading="lazy"`입니다(원본 최대 4MB).
 */
export function BannerPicture({
  src,
  still,
  alt,
  eager,
}: {
  src: string;
  still: string | null;
  alt: string;
  eager: boolean;
}) {
  const { paused, fail } = useContext(CarouselContext);
  const slide = useContext(SlideContext);
  return (
    <picture className="banner-picture">
      {still && !paused ? <source media="(prefers-reduced-motion: reduce)" srcSet={still} /> : null}
      <RemoteImage
        className="banner-image"
        src={paused && still ? still : src}
        alt={alt}
        width={1200}
        height={400}
        loading={eager ? undefined : 'lazy'}
        onError={() => fail(slide)}
        ref={(image: HTMLImageElement | null) => {
          if (image?.complete && image.naturalWidth === 0) fail(slide);
        }}
      />
    </picture>
  );
}
