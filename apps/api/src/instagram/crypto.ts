import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Instagram DM의 암호화·해시·서명. 근거: docs/specs/instagram-comment-dm.md (토큰 암호화와 키).
 * 토큰 키·작성자 해시 키·수신 거부 키는 분리합니다. 토큰 키를 회전해도 사람별 제한과 수신 거부가 깨지지 않아야 합니다.
 * `config.service.ts`가 설정 파싱에 쓰므로 `node:crypto` 말고는 불러오지 않고, 오류에는 키 이름만 넣습니다.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** `token_key_version`은 smallint입니다. */
const MAX_KEY_VERSION = 32767;

/** 작성자 해시 길이. DB CHECK(`octet_length(commenter_hash) = 32`)와 같습니다. */
export const COMMENTER_HASH_BYTES = 32;

/** 수신 거부 토큰의 MAC 길이(HMAC-SHA256 앞 16바이트). */
const OPT_OUT_MAC_BYTES = 16;
/** 토큰의 `ig_user_id`는 1바이트 길이를 앞에 붙입니다. */
const MAX_IG_USER_ID_BYTES = 255;

export interface TokenKeyring {
  /** 새로 암호화할 때 쓰는 키 버전(`INSTAGRAM_TOKEN_KEY_CURRENT`). */
  current: number;
  keys: ReadonlyMap<number, Buffer>;
}

export interface EncryptedToken {
  /** `iv || tag || ct`. `token_ciphertext`에 그대로 저장합니다. */
  ciphertext: Buffer;
  keyVersion: number;
}

export interface OptOutTokenPayload {
  igUserId: string;
  commenterHash: Buffer;
}

/** 32바이트 키의 표준 base64. 정규형이 아니면 오류입니다. 오류에는 키 이름만 넣습니다. */
export function decodeSecretKey(value: string, keyName: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== value) {
    throw new Error(`${keyName}는 ${KEY_BYTES}바이트 키의 base64여야 합니다.`);
  }
  return key;
}

/**
 * `INSTAGRAM_TOKEN_KEYS=1:<b64>,2:<b64>`와 `INSTAGRAM_TOKEN_KEY_CURRENT`로 키 묶음을 만듭니다.
 * 옛 버전을 남겨 두면 저장된 토큰을 복호화할 수 있고, 일일 점검(0256)이 현재 키로 다시 암호화합니다.
 */
export function parseTokenKeyring(keysValue: string, currentValue: string): TokenKeyring {
  const keys = new Map<number, Buffer>();
  for (const entry of keysValue.split(',')) {
    const separator = entry.indexOf(':');
    const versionText = entry.slice(0, Math.max(separator, 0)).trim();
    const version = Number(versionText);
    if (!/^[1-9]\d*$/.test(versionText) || version > MAX_KEY_VERSION) {
      throw new Error(
        `INSTAGRAM_TOKEN_KEYS는 1:<base64>,2:<base64> 형식이고 버전은 1~${MAX_KEY_VERSION}이어야 합니다.`,
      );
    }
    if (keys.has(version)) throw new Error(`INSTAGRAM_TOKEN_KEYS에 같은 버전(${version})이 두 번 있습니다.`);
    keys.set(version, decodeSecretKey(entry.slice(separator + 1).trim(), 'INSTAGRAM_TOKEN_KEYS'));
  }
  const currentText = currentValue.trim();
  const current = Number(currentText);
  if (!/^\d+$/.test(currentText) || !keys.has(current)) {
    throw new Error('INSTAGRAM_TOKEN_KEY_CURRENT는 INSTAGRAM_TOKEN_KEYS에 있는 버전이어야 합니다.');
  }
  return { current, keys };
}

/**
 * 현재 키로 AES-256-GCM 암호화합니다. 행 ID를 AAD로 묶어 다른 행으로 복사한 값은 복호화되지 않습니다.
 * 저장할 행의 ID가 필요하므로 새 연결은 ID를 먼저 정한 뒤 암호화합니다.
 */
export function encryptToken(keyring: TokenKeyring, rowId: string, plaintext: string): EncryptedToken {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyring.keys.get(keyring.current)!, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(rowId, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), encrypted]), keyVersion: keyring.current };
}

/** `encryptToken`의 역. 키 버전이 없거나 AAD·암호문이 어긋나면 오류이며, 오류에 값을 넣지 않습니다. */
export function decryptToken(keyring: TokenKeyring, rowId: string, ciphertext: Buffer, keyVersion: number): string {
  const key = keyring.keys.get(keyVersion);
  if (!key) throw new Error('Instagram 토큰의 키 버전이 INSTAGRAM_TOKEN_KEYS에 없습니다.');
  if (ciphertext.length < IV_BYTES + TAG_BYTES) throw new Error('Instagram 토큰 암호문 형식이 틀렸습니다.');
  const decipher = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(rowId, 'utf8'));
  decipher.setAuthTag(ciphertext.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  try {
    return Buffer.concat([decipher.update(ciphertext.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new Error('Instagram 토큰을 복호화하지 못했습니다.');
  }
}

/**
 * 작성자 해시 `HMAC-SHA256(키, ig_user_id || from.id)`. 연결이 아니라 IG 계정 기준이라 재연결해도 값이 같습니다.
 * 구분자 없이 잇지만 비교는 항상 같은 `ig_user_id` 안에서만 합니다(규칙은 한 연결, 수신 거부는 `ig_user_id`와 복합 키).
 */
export function commenterHash(key: Buffer, igUserId: string, fromId: string): Buffer {
  return createHmac('sha256', key).update(igUserId, 'utf8').update(fromId, 'utf8').digest();
}

function optOutMac(key: Buffer, payload: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest().subarray(0, OPT_OUT_MAC_BYTES);
}

/**
 * 서버에 저장하지 않는 수신 거부 토큰(만료 없음). base64url(`len(1) || ig_user_id || commenter_hash || MAC 앞 16바이트`)이며
 * `ig_user_id` 17자리면 88자입니다. URL 프래그먼트와 요청 본문으로만 다니고 로그에 남기지 않습니다.
 */
export function signOptOutToken(key: Buffer, igUserId: string, hash: Buffer): string {
  const id = Buffer.from(igUserId, 'utf8');
  if (id.length < 1 || id.length > MAX_IG_USER_ID_BYTES) throw new Error('ig_user_id 길이가 잘못됐습니다.');
  if (hash.length !== COMMENTER_HASH_BYTES) throw new Error('commenter_hash 길이가 잘못됐습니다.');
  const payload = Buffer.concat([Buffer.from([id.length]), id, hash]);
  return Buffer.concat([payload, optOutMac(key, payload)]).toString('base64url');
}

/** 토큰을 검증해 내용을 돌려줍니다. 형식이 틀리거나 MAC이 어긋나면 null입니다(`opt_out_invalid`). */
export function verifyOptOutToken(key: Buffer, token: string): OptOutTokenPayload | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = Buffer.from(token, 'base64url');
  // 끝 글자의 남는 비트만 다른 표기가 같은 토큰으로 통과하지 않게 정규형만 받습니다.
  if (raw.toString('base64url') !== token || raw.length < 1) return null;
  const idLength = raw[0];
  if (idLength < 1 || raw.length !== 1 + idLength + COMMENTER_HASH_BYTES + OPT_OUT_MAC_BYTES) return null;
  const macStart = raw.length - OPT_OUT_MAC_BYTES;
  if (!timingSafeEqual(optOutMac(key, raw.subarray(0, macStart)), raw.subarray(macStart))) return null;
  return {
    igUserId: raw.subarray(1, 1 + idLength).toString('utf8'),
    commenterHash: Buffer.from(raw.subarray(1 + idLength, macStart)),
  };
}
