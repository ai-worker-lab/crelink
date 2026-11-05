SET LOCAL lock_timeout = '5s';
-- 기존 집계에서 복원할 수 없는 비율·스크롤 값은 NULL로 구분합니다. 되돌리기는 다음 migration에서 합니다.
ALTER TABLE landing_event_daily_rollups
  ADD COLUMN clicked_page_views integer,
  ADD COLUMN observed_clicks integer,
  ADD COLUMN scroll_25 integer,
  ADD COLUMN scroll_50 integer,
  ADD COLUMN scroll_75 integer,
  ADD COLUMN scroll_100 integer;

CREATE TABLE landing_event_dimension_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  value text NOT NULL,
  page_views integer NOT NULL,
  PRIMARY KEY(short_link_id, day, dimension, value)
);
