'use client';

import { useState } from 'react';
import { RemoteImage } from './RemoteImage';

/** 기본 링크 아이콘. 사이트 아이콘을 불러오지 못했을 때 씁니다. */
export function DefaultLinkIcon() {
  return (
    <svg className="favicon favicon-default" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 방문자 브라우저가 링크 사이트의 아이콘(`https://{host}/favicon.ico`)을 직접 불러옵니다(설계: 서버가 대신 가져오지 않음).
 * 실패하면 기본 아이콘으로 바꿉니다. 화면이 연결되기 전에 이미 실패한 이미지는 ref에서 확인합니다.
 * 주소가 비어 있으면(관리 화면 미리보기의 저장 전 링크) 불러오지 않고 기본 아이콘을 그립니다.
 */
export function Favicon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <DefaultLinkIcon />;
  return (
    <RemoteImage
      className="favicon"
      src={src}
      alt=""
      width={20}
      height={20}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      ref={(image: HTMLImageElement | null) => {
        if (image?.complete && image.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
