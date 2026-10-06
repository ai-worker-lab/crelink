import type { ComponentProps } from 'react';

/**
 * 업로드 이미지(`/api/backend/api/files/{id}`)·외부 사이트 아이콘을 그대로 보여 주는 `<img>`.
 * 주소가 API 응답으로 정해지는 임의 출처라 next/image 최적화(원격 출처 등록)를 쓰지 않습니다.
 */
export function RemoteImage(props: ComponentProps<'img'> & { alt: string; src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- 위 설명대로 원본 이미지를 직접 표시합니다.
  return <img decoding="async" {...props} />;
}
