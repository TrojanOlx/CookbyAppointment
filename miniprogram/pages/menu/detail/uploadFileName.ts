function fileExtension(filePath: string): string {
  const cleanPath = String(filePath || '').split('?')[0].split('#')[0];
  const match = cleanPath.match(/\.([a-zA-Z0-9]{1,8})$/);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

export function createUploadFileName(scopeId: string, index: number, filePath: string): string {
  const safeScope = String(scopeId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${safeScope || fallback}-${index + 1}${fileExtension(filePath)}`;
}
