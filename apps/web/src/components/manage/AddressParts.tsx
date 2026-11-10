import { CRELINK_LIMITS } from '@crelink/shared';
import type { CopyResult } from '../../lib/use-copy-result';

const iconProps = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export const openIcon = (
  <svg {...iconProps}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const lockIcon = (
  <svg {...iconProps}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const pencilIcon = (
  <svg {...iconProps}>
    <path d="M4 20h4L19 9a2 2 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

/**
 * 복사 결과 문장 자리. 새로 삽입된 영역은 낭독되지 않으므로 `aria-live` 묶음은 늘 DOM에 있고 안의 글자만 바뀝니다.
 * 실패하면 전체 주소를 직접 선택해 복사할 수 있게 보여 줍니다.
 */
export function CopyResultLine({ result, url }: { result: CopyResult | null; url: string }) {
  return (
    <div className="address-copy-result" aria-live="polite">
      {result === 'copied' ? (
        <p className="check-available">복사했어요. 인스타그램 프로필 편집 &gt; 링크에 붙여 넣으세요.</p>
      ) : null}
      {result === 'failed' ? (
        <>
          <p className="check-error">복사하지 못했어요. 아래 주소를 직접 선택해 복사해 주세요.</p>
          <code className="url-text">{url}</code>
        </>
      ) : null}
    </div>
  );
}

/** 주소를 바꾸기 전 확인 내용(지금 주소 → 새 주소, 영향 3줄). 넓은 화면 대화상자와 좁은 화면 시트가 같이 씁니다. */
export function SlugChangeSummary({ current, next }: { current: string; next: string }) {
  return (
    <>
      <dl className="meta-list slug-change-summary">
        <div>
          <dt>지금 주소</dt>
          <dd className="url-text">{current}</dd>
        </div>
        <div>
          <dt>새 주소</dt>
          <dd className="url-text">{next}</dd>
        </div>
      </dl>
      <ul className="slug-change-impact">
        <li>인스타그램 등에 이미 붙여 둔 링크가 있다면 새 주소로 바꿔 주세요.</li>
        <li>옛 주소는 {CRELINK_LIMITS.retiredSlugGraceDays}일 동안만 새 주소로 연결돼요.</li>
        <li>바꾼 뒤 {CRELINK_LIMITS.slugChangeIntervalDays}일 동안은 다시 바꿀 수 없어요.</li>
      </ul>
    </>
  );
}
