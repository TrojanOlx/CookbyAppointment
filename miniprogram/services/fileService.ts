// 文件服务
import { get, post, del } from './http';
import { FileInfo, FileListResponse, FileUploadResponse, FileOperationResponse, BatchDeleteResponse } from '../models/file';

// 文件服务类
export class FileService {
  // 上传文件
  static async uploadFile(filePath: string, folder: string = 'default', fileName?: string): Promise<FileUploadResponse> {
    // 从http.ts中获取基础URL
    const BASE_URL = 'https://wx.oulongxing.com';
    
    return new Promise((resolve) => {
      // 获取token
      const token = wx.getStorageSync('token') || '';
      
      // 如果没有提供文件名，从路径中提取
      if (!fileName) {
        const pathParts = filePath.split('/');
        fileName = pathParts[pathParts.length - 1];
      }
      
      console.log('开始上传文件:', filePath, '到文件夹:', folder, '文件名:', fileName);
      wx.uploadFile({
        url: `${BASE_URL}/api/file/upload`, // 使用完整URL
        header: {
          'content-type': 'multipart/form-data',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        filePath,
        name: 'file',
        formData: {
          folder,
          fileName: fileName || '' // 确保fileName不是undefined
        },
        success(res) {
          console.log('上传文件成功，返回数据:', res.data);
          try {
            const data = JSON.parse(res.data);
            
            // 检查是否有token错误
            if (data.error && (data.message === '未提供token' || data.message?.includes('token'))) {
              console.error('认证失败，缺少有效token');
              wx.showToast({
                title: '请先登录',
                icon: 'none'
              });
            }
            
            resolve(data);
          } catch (error) {
            console.error('解析响应数据失败:', error, '原始数据:', res.data);
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
      
      // 确保文件类型字段存在
      if (result.success && result.data) {
        // 如果缺少fileType，根据文件名推断
        if (!result.data.fileType) {
          result.data.fileType = this.guessFileTypeByName(result.data.fileName);
        }
      }
      
      return result.success ? result.data : null;
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  }
  
  // 删除文件 - 使用DELETE方法，参数放在请求体中
  static async deleteFile(filePath: string): Promise<FileOperationResponse> {
    try {
      // 使用DELETE请求，参数通过请求体传递
      return await del<FileOperationResponse>('/api/file/delete', { filePath });
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
      return await post<BatchDeleteResponse>('/api/file/batch-delete', { filePaths });
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
      const result = await get<{success: boolean, data: FileListResponse}>('/api/file/list', { folder, limit });
      
      // 处理返回数据，确保文件类型字段存在
      if (result.success && result.data && result.data.files) {
        // 为缺少fileType的文件项添加默认值
        result.data.files = result.data.files.map(file => ({
          ...file,
          // 如果缺少fileType，根据文件扩展名推断
          fileType: file.fileType || this.guessFileTypeByName(file.fileName)
        }));
      }
      
      return result.success ? result.data : null;
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
    const BASE_URL = 'https://wx.oulongxing.com';
    return `${BASE_URL}/api/file/download?filePath=${encodeURIComponent(filePath)}`;
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