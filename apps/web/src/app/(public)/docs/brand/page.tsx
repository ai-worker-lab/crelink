import { color, corner, font, space } from '@crelink/design-tokens';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '브랜드와 디자인' };

/** 색 묶음 이름. 토큰에 묶음이 늘면 타입 검사가 여기서 실패해 이름을 빠뜨리지 않습니다. */
const COLOR_GROUP_LABELS: Record<keyof typeof color, string> = {
  background: '바탕',
  surface: '면',
  border: '테두리',
  text: '글자',
  decoration: '장식',
  action: '주요 행동',
  status: '상태',
  overlay: '덮개·그림자',
};

const FONT_WEIGHT_LABELS: Record<keyof typeof font.weight, string> = {
  regular: '보통',
  bold: '굵게',
  extrabold: '아주 굵게',
};

/** 토큰 이름을 tokens.css 변수 이름과 같은 꼴(kebab-case)로 보여 줍니다. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** 색·글꼴·간격·모서리 견본. 값은 모두 @crelink/design-tokens(원본 packages/design-tokens/src/tokens.json)에서 읽고 이 파일에 따로 적지 않습니다. */
export default function BrandPage() {
  return (
    <article className="prose">
      <h1>브랜드와 디자인</h1>
      <p>크리링 웹과 앱이 실제로 쓰는 디자인 값이에요. 이 페이지의 견본은 디자인 토큰에서 자동으로 만들어져요.</p>

      <section aria-labelledby="brand-name">
        <h2 id="brand-name">이름</h2>
        <p>
          한국어 이름은 <strong className="brand-mark">크리링</strong>, 영문 이름은 <code>crelink</code>예요.
        </p>
      </section>

      <section aria-labelledby="brand-color">
        <h2 id="brand-color">색</h2>
        {(Object.keys(COLOR_GROUP_LABELS) as (keyof typeof color)[]).map((group) => (
          <div key={group} className="token-group">
            <h3>{COLOR_GROUP_LABELS[group]}</h3>
            <ul className="swatch-list">
              {Object.entries(color[group]).map(([name, value]) => (
                <li key={name}>
                  <span className="swatch" style={{ background: value }} aria-hidden="true" />
                  <span className="token-name">{`${group}-${kebab(name)}`}</span>
                  <code className="token-value">{value}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="brand-font">
        <h2 id="brand-font">글꼴</h2>
        <dl className="token-pairs">
          <dt>본문·제목</dt>
          <dd>
            <span style={{ fontFamily: font.sans }}>크리에이터 랜딩페이지 Crelink 0123</span>
            <code className="token-value">{font.sans}</code>
          </dd>
          <dt>숫자·주소·코드</dt>
          <dd>
            <span style={{ fontFamily: font.mono }}>abc1234 · 2026-10-07 · 0123456789</span>
            <code className="token-value">{font.mono}</code>
          </dd>
        </dl>
        <div className="token-group">
          <h3>굵기</h3>
          <ul className="sample-list">
            {(Object.keys(FONT_WEIGHT_LABELS) as (keyof typeof font.weight)[]).map((weight) => (
              <li key={weight}>
                <span style={{ fontWeight: font.weight[weight] }}>크리링 {FONT_WEIGHT_LABELS[weight]}</span>
                <code className="token-value">{`${weight} ${font.weight[weight]}`}</code>
              </li>
            ))}
          </ul>
        </div>
        <div className="token-group">
          <h3>크기</h3>
          <ul className="sample-list">
            {Object.entries(font.size).map(([name, size]) => (
              <li key={name}>
                <span className="font-sample" style={{ fontSize: size }}>
                  크리링 Aa
                </span>
                <code className="token-value">{`${size}px`}</code>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="brand-space">
        <h2 id="brand-space">간격</h2>
        <ul className="sample-list">
          {Object.entries(space).map(([name, size]) => (
            <li key={name}>
              <span className="space-bar" style={{ width: size }} aria-hidden="true" />
              <code className="token-value">{`${size}px`}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="brand-corner">
        <h2 id="brand-corner">모서리</h2>
        <ul className="corner-list">
          {Object.entries(corner).map(([name, radius]) => (
            <li key={name}>
              <span className="corner-sample" style={{ borderRadius: radius }} aria-hidden="true" />
              <code className="token-value">{`${name} ${radius}px`}</code>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
