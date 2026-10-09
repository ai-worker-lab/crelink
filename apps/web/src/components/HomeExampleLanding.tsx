import { DefaultAvatar } from './DefaultAvatar';

const EXAMPLE_LINKS = ['작업물 모음', '유튜브 채널', '굿즈 판매', '작업 문의'];

/**
 * 로그인 전 홈의 예시 랜딩(design/home-intro/handoff.md `구현 마크업 예`). 가상 크리에이터의 고정 문구만 그리고
 * 데이터·API를 쓰지 않습니다. 공개 랜딩 `Landing`은 h1·누를 수 있는 링크·바닥글 랜드마크를 만들므로 쓰지 않고
 * 같은 클래스로 그립니다. 틀 안은 `aria-hidden` + `inert`로 낭독·초점·누르기에서 빼고, 뜻은 보이는 캡션이 전합니다.
 */
export function HomeExampleLanding() {
  return (
    <figure className="home-example">
      <div className="preview-device home-example-device" aria-hidden="true" inert>
        <span className="home-example-chip">예시 화면</span>
        <div className="home-example-screen">
          <div className="profile-main">
            <div className="profile">
              <div className="profile-head">
                <DefaultAvatar className="profile-avatar" />
                <p className="profile-name">예시 크리에이터</p>
                <p className="profile-bio">그림과 짧은 영상을 올려요.</p>
              </div>
              <ul className="link-list">
                {EXAMPLE_LINKS.map((label) => (
                  <li key={label}>
                    <span className="link-card">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="profile-footer">
            <span className="footer-cta">
              <span>
                나도 <span className="brand">크리링</span> 만들기
              </span>
            </span>
            <span>·</span>
            <span className="footer-link">개인정보 처리방침</span>
          </p>
        </div>
      </div>
      <figcaption>가상의 크리에이터로 만든 예시 화면이에요.</figcaption>
    </figure>
  );
}
