import { describe, expect, it } from 'vitest';
import { createUploadFileName as createAddUploadFileName } from '../../miniprogram/pages/menu/add/uploadFileName';
import { createUploadFileName as createDetailUploadFileName } from '../../miniprogram/pages/menu/detail/uploadFileName';

const implementations = [createAddUploadFileName, createDetailUploadFileName];

describe('createUploadFileName', () => {
  it('uses a stable scope, image index, and original extension', () => {
    implementations.forEach(createUploadFileName => {
      expect(createUploadFileName('dish-123', 1, 'wxfile://tmp/photo.PNG')).toBe('dish-123-2.png');
    });
  });

  it('sanitizes unsafe scope text and falls back to jpg without an extension', () => {
    implementations.forEach(createUploadFileName => {
      expect(createUploadFileName('dish / family', 0, 'wxfile://tmp/photo')).toBe('dish-family-1.jpg');
    });
  });
});
