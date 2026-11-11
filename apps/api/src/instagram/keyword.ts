function normalizeForMatch(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 댓글 본문에 규칙 키워드가 포함되는지 정규화 후 비교한다. */
export function matchesKeyword(comment: string, keyword: string): boolean {
  const normalizedComment = normalizeForMatch(comment);
  const normalizedKeyword = normalizeForMatch(keyword);

  return normalizedComment.length > 0 && normalizedKeyword.length > 0 && normalizedComment.includes(normalizedKeyword);
}
