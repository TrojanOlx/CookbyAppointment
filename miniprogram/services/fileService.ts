// 文件服务
import { get, post, del, upload } from './http';
import { FileInfo, FileListResponse, FileUploadResponse, FileOperationResponse, BatchDeleteResponse } from '../models/file';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_UPLOAD_CONCURRENCY = 3;

export interface UploadFailure {
  filePath: string;
  error: string;
}

export interface BatchUploadResult {
  files: FileInfo[];
  failures: UploadFailure[];
}

export type ImageKind = 'jpeg' | 'png' | 'webp';

export interface ImagePreflightResult {
  valid: boolean;
  error?: string;
  size?: number;
  width?: number;
  height?: number;
  imageType?: ImageKind;
}

const IMAGE_PURPOSES = new Set(['dishes', 'inventory', 'reviews', 'images']);
const DOCUMENT_PURPOSES = new Set(['documents']);
const FILE_PURPOSES = new Set(['dishes', 'inventory', 'reviews', 'images', 'documents', 'files', 'default']);
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadTask = {
  run: () => Promise<FileUploadResponse>;
  resolve: (value: FileUploadResponse) => void;
  reject: (reason?: unknown) => void;
};

// 文件服务类
export class FileService {
  private static activeUploads = 0;
  private static uploadQueue: UploadTask[] = [];

  private static enqueueUpload(task: () => Promise<FileUploadResponse>): Promise<FileUploadResponse> {
    return new Promise<FileUploadResponse>((resolve, reject) => {
      this.uploadQueue.push({ run: task, resolve, reject });
      this.drainUploadQueue();
    });
  }

  private static drainUploadQueue(): void {
    while (this.activeUploads < MAX_UPLOAD_CONCURRENCY && this.uploadQueue.length > 0) {
      const task = this.uploadQueue.shift();
      if (!task) return;
      this.activeUploads += 1;
      task.run().then(
        value => task.resolve(value),
        error => task.reject(error)
      ).then(() => {
        this.activeUploads -= 1;
        this.drainUploadQueue();
      });
    }
  }

  private static isRemoteReference(filePath: string): boolean {
    return /^https?:\/\//i.test(filePath) || filePath.startsWith('/api/file/download');
  }

  private static fileExtension(filePath: string): string {
    const path = String(filePath || '').split(/[?#]/, 1)[0];
    const match = path.match(/\.([a-zA-Z0-9]{1,8})$/);
    return match ? match[1].toLowerCase() : '';
  }

  private static imageKindForExtension(extension: string): ImageKind | null {
    if (extension === 'jpg' || extension === 'jpeg') return 'jpeg';
    if (extension === 'png') return 'png';
    if (extension === 'webp') return 'webp';
    return null;
  }

  private static imageExtensionForKind(imageType: ImageKind): string {
    return imageType === 'jpeg' ? 'jpg' : imageType;
  }

  private static normalizeImageFileName(fileName: string, imageType: ImageKind): string {
    const name = String(fileName || '').trim() || 'file';
    const extension = this.imageExtensionForKind(imageType);
    const existingExtension = this.fileExtension(name);
    if (!existingExtension) return `${name}.${extension}`;
    return `${name.slice(0, -(existingExtension.length + 1))}.${extension}`;
  }

  private static async getLocalFileSize(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: result => resolve(Number(result.size || 0)),
        fail: error => reject(new Error(error.errMsg || '无法读取文件大小'))
      });
    });
  }

  private static async readFilePrefix(filePath: string, length = 64): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        position: 0,
        length,
        success: result => {
          if (typeof result.data === 'string') {
            reject(new Error('无法读取图片二进制内容'));
            return;
          }
          resolve(new Uint8Array(result.data));
        },
        fail: error => reject(new Error(error.errMsg || '无法读取图片内容'))
      });
    });
  }

  private static hasBytes(bytes: Uint8Array, expected: number[], offset = 0): boolean {
    return expected.every((value, index) => bytes[offset + index] === value);
  }

  private static detectImageMagic(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
    if (this.hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (this.hasBytes(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
    if (this.hasBytes(bytes, [82, 73, 70, 70]) && this.hasBytes(bytes, [87, 69, 66, 80], 8)) return 'webp';
    return null;
  }

  private static async preflightLocalImage(filePath: string): Promise<ImagePreflightResult> {
    try {
      const size = await this.getLocalFileSize(filePath);
      if (!size || size > MAX_UPLOAD_BYTES) {
        return { valid: false, error: '图片不能超过5MB', size };
      }

      const magic = this.detectImageMagic(await this.readFilePrefix(filePath, Math.min(64, size)));
      if (!magic) return { valid: false, error: '图片格式无法识别，仅支持 JPG、PNG 或 WebP 图片', size };
      const extension = this.fileExtension(filePath);
      const expectedMagic = this.imageKindForExtension(extension);
      if (extension && !expectedMagic) return { valid: false, error: '仅支持 JPG、PNG 或 WebP 图片', size };
      if (expectedMagic && magic !== expectedMagic) return { valid: false, error: '图片格式与文件内容不一致', size };

      const imageInfo = await new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>((resolve, reject) => {
        wx.getImageInfo({
          src: filePath,
          success: resolve,
          fail: error => reject(new Error(error.errMsg || '无法读取图片尺寸'))
        });
      });
      const width = Number(imageInfo.width || 0);
      const height = Number(imageInfo.height || 0);
      if (!width || !height) return { valid: false, error: '无法读取图片尺寸', size };
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
        return {
          valid: false,
          error: '图片尺寸过大，最长边不能超过8192像素且总像素不能超过2500万',
          size,
          width,
          height
        };
      }
      return { valid: true, size, width, height, imageType: magic };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : '图片检查失败' };
    }
  }

  /** 选择图片后先做本地预检，避免无效临时文件进入页面状态。 */
  static async preflightImages(filePaths: string[]): Promise<{ valid: string[]; failures: UploadFailure[] }> {
    const checks = await Promise.all(filePaths.map(async filePath => ({
      filePath,
      result: await this.preflightLocalImage(filePath)
    })));
    return checks.reduce<{ valid: string[]; failures: UploadFailure[] }>((result, item) => {
      if (item.result.valid) result.valid.push(item.filePath);
      else result.failures.push({ filePath: item.filePath, error: item.result.error || '图片检查失败' });
      return result;
    }, { valid: [], failures: [] });
  }

  private static async preflightFile(filePath: string, folder: string): Promise<{ valid: boolean; error?: string; imageType?: ImageKind }> {
    if (!FILE_PURPOSES.has(folder)) return { valid: false, error: '文件用途无效' };
    if (!filePath) return { valid: false, error: '请选择文件' };
    if (this.isRemoteReference(filePath)) return { valid: true };

    if (IMAGE_PURPOSES.has(folder)) {
      const result = await this.preflightLocalImage(filePath);
      return { valid: result.valid, error: result.error, imageType: result.imageType };
    }

    try {
      const size = await this.getLocalFileSize(filePath);
      if (!size || size > MAX_UPLOAD_BYTES) return { valid: false, error: '文件不能超过5MB' };
      const fileType = this.guessFileTypeByName(filePath);
      const isDocument = DOCUMENT_PURPOSES.has(folder);
      if (!isDocument && SUPPORTED_IMAGE_TYPES.has(fileType)) {
        const imageResult = await this.preflightLocalImage(filePath);
        return { valid: imageResult.valid, error: imageResult.error, imageType: imageResult.imageType };
      }
      const allowed = isDocument
        ? fileType === 'application/pdf' || fileType === 'text/plain'
        : SUPPORTED_IMAGE_TYPES.has(fileType) || fileType === 'application/pdf' || fileType === 'text/plain';
      return allowed ? { valid: true } : { valid: false, error: '仅支持 JPG、PNG、WebP、PDF 或纯文本文件' };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : '文件检查失败' };
    }
  }

  // 上传文件
  static async uploadFile(filePath: string, folder: string = 'default', fileName?: string): Promise<FileUploadResponse> {
    const resolvedName = fileName || filePath.split('/').pop() || 'file';
    const preflight = await this.preflightFile(filePath, folder);
    if (!preflight.valid) return { success: false, error: preflight.error || '文件检查失败' };
    const uploadName = preflight.imageType
      ? this.normalizeImageFileName(resolvedName, preflight.imageType)
      : resolvedName;
    return this.enqueueUpload(async () => {
      try {
        const result = await upload<any>('/api/file/upload', filePath, {
          purpose: folder,
          fileName: uploadName
        });
        if (!result || result.error) {
          return { success: false, error: result?.message || result?.error || '上传失败' };
        }
        return { success: true, data: this.normalizeFile(result) };
      } catch (error) {
        console.error('上传文件失败:', error);
        return { success: false, error: error instanceof Error ? error.message : '上传失败' };
      }
    });
  }

  /** 批量上传，统一限制并发为3，并保留每个失败项供页面提示。 */
  static async uploadFiles(filePaths: string[], folder: string = 'default', fileNames: Array<string | undefined> = []): Promise<BatchUploadResult> {
    const results = await Promise.all(filePaths.map((filePath, index) => this.uploadFile(filePath, folder, fileNames[index])));
    return results.reduce<BatchUploadResult>((result, item, index) => {
      if (item.success && item.data) result.files.push(item.data);
      else result.failures.push({ filePath: filePaths[index], error: item.error || '上传失败' });
      return result;
    }, { files: [], failures: [] });
  }

  /** 获取与图片实际内容匹配的安全文件名，供非家庭上传接口复用。 */
  static async getSafeImageFileName(filePath: string, fileName?: string): Promise<string> {
    const result = await this.preflightLocalImage(filePath);
    if (!result.valid || !result.imageType) throw new Error(result.error || '图片检查失败');
    return this.normalizeImageFileName(fileName || filePath.split('/').pop() || 'file', result.imageType);
  }

  /** 删除本次上传但尚未绑定业务记录的文件，失败时留给服务端定时清理。 */
  static async cleanupUploadedFiles(files: FileInfo[]): Promise<void> {
    const ids = Array.from(new Set(files
      .map(file => this.extractFileId(file.filePath || file.url))
      .filter((id): id is string => Boolean(id))));
    await Promise.all(ids.map(id => this.deleteFile(`/api/file/download?id=${encodeURIComponent(id)}`)));
  }
  
  // 获取文件信息
  static async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const id = this.extractFileId(filePath);
      if (!id) return null;
      const result = await get<any>('/api/file/info', { id });
      return result && !result.error ? this.normalizeFile(result) : null;
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  }
  
  // 删除文件 - 使用DELETE方法，参数放在请求体中
  static async deleteFile(filePath: string): Promise<FileOperationResponse> {
    try {
      const id = this.extractFileId(filePath);
      if (!id) return { success: false, message: '文件地址无效' };
      return await del<FileOperationResponse>('/api/file/delete', { id });
    } catch (error) {
      console.error('删除文件失败:', error);
      return {
        success: false,
        message: '删除文件失败'
      };
    }
  }
  
  // 批量删除文件 - 新增方法
  static async batchDeleteFiles(filePaths: string[]): Promise<BatchDeleteResponse> {
    try {
      const ids = filePaths.map(path => this.extractFileId(path)).filter((id): id is string => !!id);
      const result = await post<any>('/api/file/batch-delete', { ids });
      const deleted = Array.isArray(result.deleted) ? result.deleted : [];
      const notFound = Array.isArray(result.notFound) ? result.notFound : [];
      return {
        success: result.success === true,
        data: {
          total: ids.length,
          successful: deleted.length,
          failed: notFound.length,
          details: ids.map(id => ({
            filePath: `/api/file/download?id=${encodeURIComponent(id)}`,
            success: deleted.includes(id),
            error: notFound.includes(id) ? '文件不存在' : undefined
          }))
        }
      };
    } catch (error) {
      console.error('批量删除文件失败:', error);
      return {
        success: false,
        data: {
          total: filePaths.length,
          successful: 0,
          failed: filePaths.length,
          details: []
        }
      };
    }
  }
  
  // 获取文件列表
  static async listFiles(folder: string = 'default', limit: number = 100): Promise<FileListResponse | null> {
    try {
      const pageSize = Math.min(100, Math.max(1, limit));
      const result = await get<any>('/api/file/list', { purpose: folder, pageSize });
      if (!result || !Array.isArray(result.list)) return null;
      return {
        files: result.list.map((file: any) => this.normalizeFile(file)),
        truncated: Number(result.total || 0) > result.list.length,
        total: Number(result.total || result.list.length)
      };
    } catch (error) {
      console.error('获取文件列表失败:', error);
      return null;
    }
  }
  
  // 根据文件名推断文件类型
  private static guessFileTypeByName(fileName: string): string {
    if (!fileName) return 'application/octet-stream';
    
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // 常见文件类型映射
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'xml': 'application/xml',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }
  
  // 获取文件下载链接
  static getDownloadUrl(filePath: string): string {
    if (!filePath) return '';
    return filePath;
  }

  private static normalizeFile(file: any): FileInfo {
    const fileName = String(file.fileName || file.name || 'file');
    return {
      filePath: String(file.filePath || ''),
      fileName,
      fileType: String(file.fileType || file.contentType || this.guessFileTypeByName(fileName)),
      fileSize: Number(file.fileSize ?? file.size ?? 0),
      uploadTime: file.uploadTime || (file.createdAt ? new Date(Number(file.createdAt)).toISOString() : undefined),
      url: String(file.url || file.filePath || '')
    };
  }

  private static extractFileId(value: string): string | null {
    try {
      const parsed = new URL(value, 'https://files.internal');
      return parsed.pathname === '/api/file/download' ? parsed.searchParams.get('id') : null;
    } catch {
      return null;
    }
  }
  
  // 上传图片（从相册或相机）
  static async uploadImage(folder: string = 'images', count: number = 1, 
                         sizeType: ('original' | 'compressed')[] = ['compressed'], 
                         sourceType: ('album' | 'camera')[] = ['album', 'camera']): Promise<FileInfo[]> {
    const result = await this.uploadImageWithResult(folder, count, sizeType, sourceType);
    return result.files;
  }

  static async uploadImageWithResult(folder: string = 'images', count: number = 1,
                                     sizeType: ('original' | 'compressed')[] = ['compressed'],
                                     sourceType: ('album' | 'camera')[] = ['album', 'camera']): Promise<BatchUploadResult> {
    return new Promise<BatchUploadResult>((resolve) => {
      wx.chooseImage({
        count,
        sizeType,
        sourceType,
        success: async (chooseRes) => {
          try {
            const preflight = await this.preflightImages(chooseRes.tempFilePaths);
            const uploaded = await this.uploadFiles(preflight.valid, folder);
            resolve({
              files: uploaded.files.map(file => ({
                ...file,
                fileType: file.fileType || this.guessFileTypeByName(file.fileName)
              })),
              failures: preflight.failures.concat(uploaded.failures)
            });
          } catch (error) {
            console.error('处理上传结果失败:', error);
            resolve({
              files: [],
              failures: chooseRes.tempFilePaths.map(filePath => ({ filePath, error: '图片处理失败' }))
            });
          }
        },
        fail: () => {
          resolve({ files: [], failures: [] });
        }
      });
    });
  }
  
  // 上传单个图片
  static async uploadSingleImage(folder: string = 'images'): Promise<FileInfo | null> {
    const images = await this.uploadImage(folder, 1);
    return images.length > 0 ? images[0] : null;
  }
  
  // 上传多张图片
  static async uploadMultipleImages(folder: string = 'images', maxCount: number = 9): Promise<FileInfo[]> {
    return await this.uploadImage(folder, maxCount);
  }
  
  // 从文件URL中提取文件路径 - 优化实现
  static extractFilePathFromUrl(url: string): string {
    if (!url) return '';
    
    try {
      // 移除协议和域名部分
      const urlParts = url.split('/');
      
      // 至少需要有两部分：文件夹和文件名
      if (urlParts.length < 2) return url;
      
      // 获取最后两部分作为有效路径
      const folder = urlParts[urlParts.length - 2];
      const fileName = urlParts[urlParts.length - 1];
      
      return `${folder}/${fileName}`;
    } catch (error) {
      console.error('解析文件路径失败:', error);
      return url;
    }
  }
  
  // 根据文件类型获取适合的存储文件夹
  static getSuggestedFolder(fileType: string): string {
    if (!fileType) return 'files';
    
    if (fileType.startsWith('image/')) {
      return 'images';
    } else if (fileType.startsWith('video/')) {
      return 'files';
    } else if (fileType.startsWith('audio/')) {
      return 'files';
    } else if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('sheet')) {
      return 'documents';
    } else {
      return 'files';
    }
  }
}
