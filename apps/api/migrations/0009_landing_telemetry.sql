SET LOCAL lock_timeout = '5s';
ALTER TABLE visits ADD COLUMN utm jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE landing_events (
  event_id uuid PRIMARY KEY,
  page_view_id uuid NOT NULL,
  session_id uuid NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('page_view', 'click', 'impression', 'engagement')),
  target_kind text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_visit_id bigint REFERENCES visits(id) ON DELETE SET NULL,
  ip inet,
  country text,
  city text,
  referrer_host text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  language text,
  time_zone text,
  viewport_width integer,
  viewport_height integer,
  screen_width integer,
  screen_height integer,
  pixel_ratio double precision,
  active_ms integer NOT NULL DEFAULT 0 CHECK (active_ms BETWEEN 0 AND 86400000),
  scroll_percent integer NOT NULL DEFAULT 0 CHECK (scroll_percent BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX landing_events_page_view ON landing_events(page_view_id) WHERE kind = 'page_view';
CREATE UNIQUE INDEX landing_events_impression ON landing_events(page_view_id, target_kind, target_id) WHERE kind = 'impression';
CREATE INDEX landing_events_session ON landing_events(session_id, visitor_id);
CREATE INDEX landing_events_page ON landing_events(page_view_id);
CREATE INDEX landing_events_short_date ON landing_events(short_link_id, occurred_at);
CREATE INDEX landing_events_date ON landing_events(occurred_at);

CREATE TABLE landing_event_daily_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  kind text NOT NULL,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  events integer NOT NULL,
  unique_visitors integer NOT NULL,
  unique_sessions integer NOT NULL,
  active_ms bigint NOT NULL,
  max_scroll_percent integer NOT NULL,
  PRIMARY KEY(short_link_id, day, kind, target_kind, target_id)
);

CREATE TABLE landing_event_limits (
  bucket text PRIMARY KEY,
  used integer NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX landing_event_limits_window ON landing_event_limits(window_start);
