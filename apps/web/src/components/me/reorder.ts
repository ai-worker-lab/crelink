/** 목록에서 `id`를 한 칸 위(-1)·아래(+1)로 옮긴 전체 id 순서. `PUT …/order`의 `ids`로 보냅니다. */
export function moveId(items: ReadonlyArray<{ id: string }>, id: string, offset: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
