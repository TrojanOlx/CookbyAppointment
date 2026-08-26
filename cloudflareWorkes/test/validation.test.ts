import { describe, expect, it } from 'vitest';
import { ApiError } from '../core/http';
import { validateUploadFile, IMAGE_TYPES } from '../core/uploadSecurity';
import {
  profileCompleteness,
  strictAmountText,
  strictNickname,
  strictQuantity,
  strictText,
  strictTextArray,
} from '../core/validation';

function expectValidation(run: () => unknown, code = 'VALIDATION_ERROR'): void {
  try {
    run();
    throw new Error('expected validation error');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}

function png(width: number, height: number): ArrayBuffer {
  const buffer = new ArrayBuffer(24);
  const bytes = new Uint8Array(buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buffer;
}

describe('profile completeness', () => {
  it('requires both a real nickname and an avatar', () => {
    expect(profileCompleteness({ nickName: '', avatarUrl: '' })).toEqual({
      profileComplete: false,
      missingProfileFields: ['nickName', 'avatarUrl'],
    });
    expect(profileCompleteness({ nickName: '微信用户', avatarUrl: 'https://example.com/a.png' }).missingProfileFields)
      .toEqual(['nickName']);
    expect(profileCompleteness({ nickName: '小林', avatarUrl: 'https://example.com/a.png' })).toEqual({
      profileComplete: true,
      missingProfileFields: [],
    });
  });

  it('rejects placeholder nicknames and control characters', () => {
    expectValidation(() => strictNickname('微信用户'));
    expectValidation(() => strictNickname('小\u0000林'));
  });
});

describe('strict input validation', () => {
  it('accepts exact quantity boundaries and rejects invalid decimals', () => {
    expect(strictQuantity(0.001)).toBe(0.001);
    expect(strictQuantity(1_000_000)).toBe(1_000_000);
    expectValidation(() => strictQuantity(0));
    expectValidation(() => strictQuantity(-1));
    expectValidation(() => strictQuantity(1_000_000.001));
    expectValidation(() => strictQuantity(1.0001));
  });

  it('validates numbers embedded in text amounts', () => {
    expect(strictAmountText('500g')).toBe('500g');
    expect(strictAmountText('适量')).toBe('适量');
    expect(strictAmountText('2-3个')).toBe('2-3个');
    expectValidation(() => strictAmountText('0g'));
    expectValidation(() => strictAmountText('-1kg'));
    expectValidation(() => strictAmountText('1.0001kg'));
    expectValidation(() => strictAmountText('1000001g'));
  });

  it('rejects symbol-only names and oversized collections', () => {
    expectValidation(() => strictText('---', '食材名称', 30, { required: true, meaningfulName: true }));
    expectValidation(() => strictTextArray(Array.from({ length: 21 }, () => '标签'), '偏好标签', 20, 20));
  });
});

describe('image upload validation', () => {
  it('accepts a matching MIME, extension, signature and safe dimensions', async () => {
    const file = new File([png(800, 600)], 'photo.png', { type: 'image/png' });
    await expect(validateUploadFile(file, IMAGE_TYPES)).resolves.toMatchObject({
      safeName: 'photo.png', width: 800, height: 600,
    });
  });

  it('rejects missing or mismatched extensions and forged signatures', async () => {
    await expect(validateUploadFile(new File([png(10, 10)], 'photo', { type: 'image/png' }), IMAGE_TYPES))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_INVALID' });
    await expect(validateUploadFile(new File([png(10, 10)], 'photo.jpg', { type: 'image/png' }), IMAGE_TYPES))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_INVALID' });
    await expect(validateUploadFile(new File([new ArrayBuffer(24)], 'photo.png', { type: 'image/png' }), IMAGE_TYPES))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_INVALID' });
  });

  it('rejects excessive dimensions or pixel counts', async () => {
    await expect(validateUploadFile(new File([png(8193, 1)], 'wide.png', { type: 'image/png' }), IMAGE_TYPES))
      .rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
    await expect(validateUploadFile(new File([png(6000, 5000)], 'large.png', { type: 'image/png' }), IMAGE_TYPES))
      .rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_TOO_LARGE' });
  });
});
