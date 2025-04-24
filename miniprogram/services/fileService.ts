// 文件服务
import { get, post, put, del } from './http';
import { FileInfo, FileListResponse, FileUploadResponse, FileOperationResponse } from '../models/file';

// 文件服务类
export class FileService {
  // 上传文件
  static async uploadFile(filePath: string, folder: string = 'default', fileName?: string): Promise<FileUploadResponse> {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: '/api/file/upload',
        filePath,
        name: 'file',
        formData: {
          folder,
          fileName
        },
        success(res) {
          try {
            const data = JSON.parse(res.data);
            resolve(data);
          } catch (error) {
            resolve({
              success: false,
              error: '解析响应失败'
            });
          }
        },
        fail(err) {
          console.error('上传文件失败:', err);
          resolve({
            success: false,
            error: err.errMsg || '上传失败'
          });
        }
      });
    });
  }
  
  // 获取文件信息
  static async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const result = await get<{success: boolean, data: FileInfo}>('/api/file/info', { filePath });
      return result.success ? result.data : null;
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  }
  
  // 删除文件
  static async deleteFile(filePath: string): Promise<FileOperationResponse> {
    try {
      return await del<FileOperationResponse>('/api/file/delete', { filePath });
    } catch (error) {
      console.error('删除文件失败:', error);
      return {
        success: false,
        message: '删除文件失败'
      };
    }
  }
  
  // 获取文件列表
  static async listFiles(folder: string = 'default', limit: number = 100): Promise<FileListResponse | null> {
    try {
      const result = await get<{success: boolean, data: FileListResponse}>('/api/file/list', { folder, limit });
      return result.success ? result.data : null;
    } catch (error) {
      console.error('获取文件列表失败:', error);
      return null;
    }
  }
  
  // 获取文件下载链接
  static getDownloadUrl(filePath: string): string {
    return `/api/file/download?filePath=${encodeURIComponent(filePath)}`;
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
              .map(res => res.data as FileInfo);
              
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
  
  // 从文件URL中提取文件路径
  static extractFilePathFromUrl(url: string): string {
    try {
      // 在微信小程序环境中，URL构造函数可能不可用，使用简单的字符串解析
      // 去除协议和域名部分
      let path = url;
      
      // 移除协议和域名部分
      const doubleSlashIndex = url.indexOf('//');
      if (doubleSlashIndex !== -1) {
        const domainStartIndex = doubleSlashIndex + 2;
        const pathStartIndex = url.indexOf('/', domainStartIndex);
        
        if (pathStartIndex !== -1) {
          path = url.substring(pathStartIndex);
        }
      }
      
      // 获取路径部分，去掉开头的斜杠
      const pathParts = path.split('/').filter((part: string) => part.length > 0);
      
      // 如果至少有文件夹和文件名两部分，取最后两部分
      if (pathParts.length >= 2) {
        return `${pathParts[pathParts.length-2]}/${pathParts[pathParts.length-1]}`;
      }
      
      // 否则返回整个路径（去掉开头的斜杠）
      return path.startsWith('/') ? path.substring(1) : path;
    } catch (e) {
      // 如果解析失败，尝试简单的字符串提取（取最后两部分）
      const parts = url.split('/');
      if (parts.length >= 2) {
        return `${parts[parts.length-2]}/${parts[parts.length-1]}`;
      }
      return url;
    }
  }
  
  // 根据文件类型获取适合的存储文件夹
  static getSuggestedFolder(fileType: string): string {
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