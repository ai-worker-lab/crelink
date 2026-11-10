import { matchesKeyword } from './keyword';

describe('matchesKeyword', () => {
  it('댓글 전체 또는 일부에 키워드가 있으면 일치한다', () => {
    expect(matchesKeyword('링크', '링크')).toBe(true);
    expect(matchesKeyword('이 링크 부탁합니다!', '링크')).toBe(true);
  });

  it('한국어 조사가 붙어도 키워드가 포함되면 일치한다', () => {
    expect(matchesKeyword('링크요', '링크')).toBe(true);
    expect(matchesKeyword('링크를 보내 주세요', '링크')).toBe(true);
  });

  it('댓글과 키워드의 NFC·NFD 한글을 동일하게 비교한다', () => {
    const nfc = '링크';
    const nfd = nfc.normalize('NFD');
    expect(matchesKeyword(`${nfd}요`, nfc)).toBe(true);
    expect(matchesKeyword(`${nfc}요`, nfd)).toBe(true);
    expect(matchesKeyword(`${nfd}요`, nfd)).toBe(true);
  });

  it('양쪽 앞뒤 공백을 제거하고 연속 공백·탭·줄바꿈을 하나로 비교한다', () => {
    expect(matchesKeyword(' \t자료  \t\n링크요\n ', '  자료 링크 \t')).toBe(true);
    expect(matchesKeyword('자료 링크요', '\n자료\t  링크\n')).toBe(true);
    expect(matchesKeyword('자료\u00a0\u00a0링크요', '자료\u3000링크')).toBe(true);
  });

  it('영문 대소문자를 무시한다', () => {
    expect(matchesKeyword('Please send the LINK!', 'link')).toBe(true);
    expect(matchesKeyword('please send the link!', 'LiNk')).toBe(true);
  });

  it('키워드가 없거나 댓글보다 길면 일치하지 않는다', () => {
    expect(matchesKeyword('자료 부탁합니다', '링크')).toBe(false);
    expect(matchesKeyword('링크', '링크요')).toBe(false);
  });

  it('공백을 없애거나 호환 문자를 변환하지 않는다', () => {
    expect(matchesKeyword('자료링크', '자료 링크')).toBe(false);
    expect(matchesKeyword('ＬＩＮＫ', 'link')).toBe(false);
  });

  it.each([
    ['', '링크'],
    ['링크요', ''],
    ['', ''],
    [' \t\n\u00a0\u3000', '링크'],
    ['링크요', ' \t\n\u00a0\u3000'],
    [' \t\n', ' \t\n'],
  ])('빈 입력은 일치하지 않는다 (댓글=%j, 키워드=%j)', (comment, keyword) => {
    expect(matchesKeyword(comment, keyword)).toBe(false);
  });
});
