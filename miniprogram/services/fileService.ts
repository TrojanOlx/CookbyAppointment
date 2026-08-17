// 文件服务
import { get, post, del, upload } from './http';
import { FileInfo, FileListResponse, FileUploadResponse, FileOperationResponse, BatchDeleteResponse } from '../models/file';

// 文件服务类
export class FileService {
  // 上传文件
  static async uploadFile(filePath: string, folder: string = 'default', fileName?: string): Promise<FileUploadResponse> {
    const resolvedName = fileName || filePath.split('/').pop() || 'file';
    try {
      const result = await upload<any>('/api/file/upload', filePath, {
        purpose: folder,
        fileName: resolvedName
      });
      if (!result || result.error) {
        return { success: false, error: result?.message || result?.error || '上传失败' };
      }
      return { success: true, data: this.normalizeFile(result) };
    } catch (error) {
      console.error('上传文件失败:', error);
      return { success: false, error: error instanceof Error ? error.message : '上传失败' };
    }
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
    return new Promise<FileInfo[]>((resolve) => {
      wx.chooseImage({
        count,
        sizeType,
        sourceType,
        success: async (chooseRes) => {
          try {
            // 上传图片
            const uploadPromises = chooseRes.tempFilePaths.map(path => 
              this.uploadFile(path, folder)
            );
            
            const results = await Promise.all(uploadPromises);
            
            // 过滤并返回成功上传的图片信息
            const successFiles = results
              .filter(res => res.success && res.data)
              .map(res => {
                const fileInfo = res.data as FileInfo;
                // 确保文件类型存在，图片默认为image/jpeg
                if (!fileInfo.fileType) {
                  fileInfo.fileType = this.guessFileTypeByName(fileInfo.fileName);
                }
                return fileInfo;
              });
              
            resolve(successFiles);
          } catch (error) {
            console.error('处理上传结果失败:', error);
            resolve([]);
          }
        },
        fail: () => {
          resolve([]);
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
      return 'videos';
    } else if (fileType.startsWith('audio/')) {
      return 'audios';
    } else if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('sheet')) {
      return 'documents';
    } else {
      return 'files';
    }
  }
}
