/** page_view 별칭 e의 값별 분포. 조회와 비식별 보존이 같은 식을 사용합니다. */
export const ANALYTICS_DIMENSIONS_SQL = `LATERAL (VALUES
  ('referrer_host', e.referrer_host), ('country', e.country), ('city', e.city),
  ('device_type', e.device_type), ('browser', e.browser), ('os', e.os),
  ('language', e.language), ('time_zone', e.time_zone),
  ('viewport', e.viewport_width::text || 'x' || e.viewport_height::text),
  ('screen', e.screen_width::text || 'x' || e.screen_height::text),
  ('pixel_ratio', e.pixel_ratio::text),
  ('utm_source', e.utm->>'source'), ('utm_medium', e.utm->>'medium'),
  ('utm_campaign', e.utm->>'campaign'), ('utm_term', e.utm->>'term'),
  ('utm_content', e.utm->>'content'), ('utm_id', e.utm->>'id')
) AS d(dimension, value)`;

export const ANALYTICS_DIMENSIONS = [
  'referrer_host',
  'country',
  'city',
  'device_type',
  'browser',
  'os',
  'language',
  'time_zone',
  'viewport',
  'screen',
  'pixel_ratio',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
] as const;
