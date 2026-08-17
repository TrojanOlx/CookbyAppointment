// 文件管理页面
import { FileService } from '../../../../services/fileService';

interface FileInfoData {
  filePath: string;
  fileName: string;
  fileType?: string;
  fileSize: number;
  uploadTime?: string;
  url: string;
  userId?: string;
}

interface PageData {
  folders: string[];
  currentFolder: string;
  files: FileInfoData[];
  selectedFiles: string[];
  isLoading: boolean;
  showFileInfo: boolean;
  fileInfoData: FileInfoData;
}

interface PageInstance {
  data: PageData;
  loadFiles: () => Promise<void>;
  getFileTypeFromName: (fileName: string) => string;
  checkAdminPermission: () => Promise<void>;
  changeFolder: (e: WechatMiniprogram.TouchEvent) => void;
  uploadFile: () => Promise<void>;
  uploadImage: () => Promise<void>;
  getFileInfo: (e: WechatMiniprogram.TouchEvent) => Promise<void>;
  closeFileInfo: () => void;
  downloadFile: (e: WechatMiniprogram.TouchEvent) => Promise<void>;
  deleteFile: (e: WechatMiniprogram.TouchEvent) => Promise<void>;
  selectFile: (e: WechatMiniprogram.TouchEvent) => void;
  isSelected: (filePath: string) => boolean;
  toggleSelectAll: () => void;
  batchDelete: () => Promise<void>;
  copyToClipboard: (e: WechatMiniprogram.TouchEvent) => void;
  previewImage: (e: WechatMiniprogram.TouchEvent) => void;
  isImage: (fileType?: string, fileName?: string) => boolean;
  getFileIcon: (fileType?: string, fileName?: string) => string;
  formatFileSize: (bytes?: number) => string;
  formatDate: (dateString?: string) => string;
}

Page<PageData, PageInstance>({
  data: {
    folders: ['images', 'dishes', 'documents', 'default', 'videos', 'audios', 'files'],
    currentFolder: 'images',
    files: [],
    selectedFiles: [],
    isLoading: false,
    showFileInfo: false,
    fileInfoData: {} as FileInfoData
  },

  onLoad() {
    console.log('文件管理页面加载');
    this.loadFiles();
  },

  onShow() {
    console.log('文件管理页面显示');
  },

  // 检查是否有管理员权限
  async checkAdminPermission() {
    console.log('检查管理员权限');
  },

  // 切换文件夹
  changeFolder(e) {
    const folder = e.currentTarget.dataset.folder as string;
    console.log('切换文件夹:', folder);
    
    this.setData({
      currentFolder: folder,
      files: [],
      selectedFiles: []
    });
    this.loadFiles();
  },

  // 加载文件列表
  async loadFiles() {
    console.log('加载文件列表开始:', this.data.currentFolder);
    this.setData({ isLoading: true });

    try {
      const fileList = await FileService.listFiles(this.data.currentFolder, 100);
      console.log('获取到文件列表:', fileList);
      
      if (fileList && fileList.files) {
        // 确保每个文件都有fileType属性
        const filesWithType = fileList.files.map(file => ({
          ...file,
          fileType: file.fileType || this.getFileTypeFromName(file.fileName)
        }));

        console.log('处理后的文件列表:', filesWithType);
        this.setData({
          files: filesWithType,
          isLoading: false
        });
      } else {
        this.setData({
          files: [],
          isLoading: false
        });
        wx.showToast({
          title: '获取文件列表失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
      this.setData({ isLoading: false });
      wx.showToast({
        title: '获取文件列表失败',
        icon: 'error'
      });
    }
  },

  // 上传文件（从本地选择）
  async uploadFile() {
    try {
      // 选择文件
      const res = await wx.chooseMessageFile({
        count: 1,
        type: 'file'
      });

      if (res.tempFiles && res.tempFiles.length > 0) {
        const file = res.tempFiles[0];
        wx.showLoading({ title: '上传中...' });

        // 根据文件类型选择合适的文件夹
        const fileType = file.type || this.getFileTypeFromName(file.name);
        const folder = FileService.getSuggestedFolder(fileType) || this.data.currentFolder;
        const fileName = file.name || `file_${Date.now()}`;
        
        console.log('准备上传文件:', {
          path: file.path,
          name: fileName,
          type: fileType,
          folder: folder
        });

        // 上传文件
        const result = await FileService.uploadFile(file.path, folder, fileName);

        wx.hideLoading();
        if (result.success && result.data) {
          wx.showToast({
            title: '上传成功',
            icon: 'success'
          });

          // 如果上传到当前文件夹，则重新加载文件列表
          if (folder === this.data.currentFolder) {
            this.loadFiles();
          } else {
            // 切换到上传的文件夹
            this.setData({
              currentFolder: folder
            });
            this.loadFiles();
          }
        } else {
          wx.showToast({
            title: '上传失败: ' + (result.error || '未知错误'),
            icon: 'none'
          });
        }
      }
    } catch (error) {
      wx.hideLoading();
      console.error('上传文件失败:', error);
      wx.showToast({
        title: '上传文件失败',
        icon: 'error'
      });
    }
  },

  // 上传图片
  async uploadImage() {
    console.log('开始上传图片，当前文件夹:', this.data.currentFolder);
    
    try {
      // 使用try-catch包裹选择图片操作，以便捕获可能的选择取消
      wx.showLoading({ title: '选择图片中...' });
      
      const images = await FileService.uploadImage(this.data.currentFolder, 9);
      console.log('上传图片结果:', images);
      
      wx.hideLoading();
      
      if (images && images.length > 0) {
        wx.showToast({
          title: `成功上传${images.length}张图片`,
          icon: 'success'
        });

        // 重新加载文件列表
        this.loadFiles();
      } else {
        console.warn('未获取到上传成功的图片信息');
        wx.showToast({
          title: '未选择图片或上传失败',
          icon: 'none'
        });
      }
    } catch (error: any) {
      wx.hideLoading();
      console.error('上传图片过程中发生错误:', error);
      wx.showToast({
        title: '上传图片失败: ' + (error.message || '未知错误'),
        icon: 'error'
      });
    }
  },

  // 获取文件信息
  async getFileInfo(e) {
    const filePath = e.currentTarget.dataset.path as string;
    console.log('获取文件信息:', filePath);

    try {
      wx.showLoading({ title: '获取中...' });
      const fileInfo = await FileService.getFileInfo(filePath);
      wx.hideLoading();

      if (fileInfo) {
        // 确保文件类型存在
        const fileInfoWithType = {
          ...fileInfo,
          fileType: fileInfo.fileType || this.getFileTypeFromName(fileInfo.fileName)
        };

        this.setData({
          showFileInfo: true,
          fileInfoData: fileInfoWithType
        });
      } else {
        wx.showToast({
          title: '获取文件信息失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('获取文件信息失败:', error);
      wx.showToast({
        title: '获取文件信息失败',
        icon: 'error'
      });
    }
  },

  // 关闭文件信息弹窗
  closeFileInfo() {
    this.setData({
      showFileInfo: false
    });
  },

  // 下载文件
  async downloadFile(e) {
    const filePath = e.currentTarget.dataset.path as string;
    const signedUrl = e.currentTarget.dataset.url as string;
    const fileName = e.currentTarget.dataset.name as string;
    console.log('下载文件:', filePath, fileName);

    try {
      wx.showLoading({ title: '下载中...' });
      const downloadUrl = signedUrl || FileService.getDownloadUrl(filePath);

      // 下载文件到本地
      const result = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>((resolve, reject) => {
        wx.downloadFile({
          url: downloadUrl,
          filePath: wx.env.USER_DATA_PATH + '/' + fileName,
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();
      if (result.statusCode === 200) {
        // 打开文件
        wx.openDocument({
          filePath: result.filePath,
          showMenu: true,
          success: () => {
            console.log('打开文档成功');
          },
          fail: (error) => {
            console.error('打开文档失败:', error);
            wx.showToast({
              title: '无法打开此类型文件',
              icon: 'none'
            });
          }
        });
      } else {
        wx.showToast({
          title: '下载失败',
          icon: 'error'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('下载文件失败:', error);
      wx.showToast({
        title: '下载文件失败',
        icon: 'error'
      });
    }
  },

  // 删除文件
  async deleteFile(e) {
    const filePath = e.currentTarget.dataset.path as string;
    console.log('删除文件:', filePath);

    // 确认删除
    const confirm = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除此文件吗？',
        confirmText: '删除',
        confirmColor: '#ff0000',
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });

    if (!confirm) return;

    try {
      wx.showLoading({ title: '删除中...' });
      const result = await FileService.deleteFile(filePath);
      wx.hideLoading();

      if (result.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });

        // 重新加载文件列表
        this.loadFiles();
      } else {
        wx.showToast({
          title: '删除失败: ' + (result.message || '未知错误'),
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('删除文件失败:', error);
      wx.showToast({
        title: '删除文件失败',
        icon: 'error'
      });
    }
  },

  // 选择/取消选择文件
  selectFile(e) {
    const filePath = e.currentTarget.dataset.path as string;
    console.log('选择/取消文件:', filePath);
    
    const selectedFiles = [...this.data.selectedFiles];
    const index = selectedFiles.indexOf(filePath);

    if (index === -1) {
      selectedFiles.push(filePath);
    } else {
      selectedFiles.splice(index, 1);
    }

    this.setData({ selectedFiles });
  },

  // 判断文件是否被选中
  isSelected(filePath) {
    return this.data.selectedFiles.includes(filePath);
  },

  // 全选/取消全选
  toggleSelectAll() {
    if (this.data.selectedFiles.length === this.data.files.length) {
      // 如果已经全选，则取消全选
      this.setData({ selectedFiles: [] });
    } else {
      // 否则全选
      this.setData({
        selectedFiles: this.data.files.map(file => file.filePath)
      });
    }
  },

  // 批量删除选中的文件
  async batchDelete() {
    const { selectedFiles } = this.data;

    if (selectedFiles.length === 0) {
      wx.showToast({
        title: '请先选择文件',
        icon: 'none'
      });
      return;
    }

    // 确认删除
    const confirm = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认批量删除',
        content: `确定要删除选中的 ${selectedFiles.length} 个文件吗？`,
        confirmText: '删除',
        confirmColor: '#ff0000',
        success: (res) => {
          resolve(res.confirm);
        }
      });
    });

    if (!confirm) return;

    wx.showLoading({ title: '删除中...' });

    try {
      // 使用FileService的批量删除方法
      const result = await FileService.batchDeleteFiles(selectedFiles);

      wx.hideLoading();
      if (result.success) {
        const { successful } = result.data || { successful: 0 };
        wx.showToast({
          title: `成功删除 ${successful} 个文件`,
          icon: 'success'
        });

        // 重新加载文件列表
        this.setData({ selectedFiles: [] });
        this.loadFiles();
      } else {
        wx.showToast({
          title: '批量删除失败',
          icon: 'error'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('批量删除文件失败:', error);
      wx.showToast({
        title: '批量删除失败',
        icon: 'error'
      });
    }
  },

  // 复制文本到剪贴板
  copyToClipboard(e) {
    const text = e.currentTarget.dataset.text as string;
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        });
      }
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url as string;
    console.log('预览图片:', url);
    
    wx.previewImage({
      current: url,
      urls: [url]
    });
  },

  // 判断文件是否为图片
  isImage(fileType, fileName) {
    console.log('isImage执行:', fileType, fileName);
    
    // 如果有fileType属性，直接判断
    if (fileType && fileType.startsWith('image/')) {
      return true;
    }

    // 如果有fileName，通过文件扩展名判断
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
    }

    return false;
  },

  // 获取文件图标
  getFileIcon(fileType, fileName) {
    console.log('getFileIcon执行:', fileType, fileName);
    
    if (this.isImage(fileType, fileName)) {
      return '🖼️';
    }
    
    if (fileType) {
      if (fileType.startsWith('video/')) {
        return '🎬';
      } else if (fileType.startsWith('audio/')) {
        return '🎵';
      } else if (fileType.includes('pdf')) {
        return '📕';
      } else if (fileType.includes('word') || fileType.includes('document')) {
        return '📝';
      } else if (fileType.includes('excel') || fileType.includes('sheet')) {
        return '📊';
      } else if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('tar')) {
        return '🗜️';
      }
    }

    // 如果没有fileType或无法识别，尝试通过文件名判断
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
        return '🎬';
      } else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
        return '🎵';
      } else if (ext === 'pdf') {
        return '📕';
      } else if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
        return '📝';
      } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
        return '📊';
      } else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
        return '🗜️';
      }
    }

    return '📄';
  },

  // 从文件名获取文件类型
  getFileTypeFromName(fileName) {
    if (!fileName) return 'application/octet-stream';
    
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    const mimeTypes: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  },

  // 格式化文件大小
  formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let value = bytes;

    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }

    return value.toFixed(2) + ' ' + units[i];
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
});
