SET LOCAL lock_timeout = '5s';
-- 채널별 짧은 주소(0246). 새 표 2개만 만들고 기존 표·코드는 바꾸지 않아 롤백해도 남겨 둘 수 있습니다.

-- 한 번 발급한 code의 영구 기록. 지우지 않으며 FK가 없어 페이지·계정 삭제의 영향을 받지 않는다.
CREATE TABLE channel_link_codes (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9]{7,10}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- code의 현재 의미. 페이지가 삭제되면 CASCADE로 함께 지워져 개인 맥락이 남지 않고 code만 남는다.
CREATE TABLE channel_links (
  code text PRIMARY KEY REFERENCES channel_link_codes (code),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  channel text NOT NULL,
  placement text NOT NULL,
  campaign text NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX channel_links_active ON channel_links (landing_id, channel, placement, campaign) WHERE archived_at IS NULL;
CREATE INDEX channel_links_landing ON channel_links (landing_id);
