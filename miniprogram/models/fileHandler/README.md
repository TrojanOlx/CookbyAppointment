# 文件存储服务 (File Storage Service)

这个服务模块提供了在微信小程序中使用 Cloudflare R2 文件存储的完整解决方案，用于上传、下载、查询和删除文件。

## 功能特性

- 上传文件到 Cloudflare R2 存储
- 获取文件信息
- 下载文件
- 删除文件
- 列出目录中的文件
- 专用的图片上传功能（从相册或相机）
- 管理员批量删除文件

## 使用方法

### 1. 导入服务

使用统一的服务导入方式：

```typescript
import { FileService } from '../../services';
```

### 2. 上传文件

通用上传文件方法（需要先获取本地文件路径）：

```typescript
import { FileService } from '../../services';

async function uploadLocalFile() {
  const filePath = '本地文件路径'; // 可能从其他API中获取
  const folder = 'documents'; // 文件存储的文件夹
  const fileName = '自定义文件名.pdf'; // 可选，如果不提供则使用原文件名
  
  try {
    const result = await FileService.uploadFile(filePath, folder, fileName);
    if (result.success && result.data) {
      console.log('上传成功:', result.data);
      // 使用 result.data.url 可以获取文件的访问链接
      return result.data;
    } else {
      console.error('上传失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('上传异常:', error);
    return null;
  }
}
```

### 3. 上传图片

直接从相册或相机选择并上传图片：

```typescript
import { FileService } from '../../services';

// 在页面的事件处理函数中
async uploadImage() {
  try {
    // 上传到 'images' 文件夹，最多选择 3 张图片
    const uploadedImages = await FileService.uploadImage('images', 3);
    
    if (uploadedImages.length > 0) {
      console.log('上传的图片:', uploadedImages);
      // 设置页面状态，显示上传的图片
      this.setData({
        imageList: uploadedImages.map(img => img.url)
      });
    } else {
      wx.showToast({
        title: '未选择图片或上传失败',
        icon: 'none'
      });
    }
  } catch (error) {
    console.error('上传图片失败:', error);
    wx.showToast({
      title: '上传图片出错',
      icon: 'error'
    });
  }
}
```

### 4. 获取文件信息

```typescript
import { FileService } from '../../services';

async function getFileDetails(filePath) {
  const fileInfo = await FileService.getFileInfo(filePath);
  if (fileInfo) {
    console.log('文件信息:', fileInfo);
    return fileInfo;
  } else {
    console.log('未找到文件或获取信息失败');
    return null;
  }
}
```

### 5. 删除文件

```typescript
import { FileService } from '../../services';

async function removeFile(filePath) {
  const result = await FileService.deleteFile(filePath);
  if (result.success) {
    console.log('文件删除成功');
    wx.showToast({
      title: '删除成功',
      icon: 'success'
    });
    return true;
  } else {
    console.error('文件删除失败:', result.message);
    wx.showToast({
      title: '删除失败',
      icon: 'error'
    });
    return false;
  }
}
```

### 6. 列出文件夹中的文件

```typescript
import { FileService } from '../../services';

async function listFolderContents(folderName = 'images', limit = 50) {
  const fileList = await FileService.listFiles(folderName, limit);
  if (fileList) {
    console.log(`${folderName} 文件夹中的文件:`, fileList.files);
    console.log(`总共 ${fileList.total} 个文件`);
    
    // 如果结果被截断，说明还有更多文件
    if (fileList.truncated) {
      console.log('结果已被截断，实际文件数量超过限制');
    }
    
    return fileList.files;
  } else {
    console.log('获取文件列表失败或文件夹为空');
    return [];
  }
}
```

### 7. 下载文件

获取文件下载链接并使用：

```typescript
import { FileService } from '../../services';

// 获取下载链接
const downloadUrl = FileService.getDownloadUrl(filePath);

// 在小程序中使用下载链接
wx.downloadFile({
  url: downloadUrl,
  success(res) {
    // 下载成功后的临时文件路径
    const tempFilePath = res.tempFilePath;
    console.log('文件已下载到:', tempFilePath);
    
    // 比如打开文档
    wx.openDocument({
      filePath: tempFilePath,
      success() {
        console.log('打开文档成功');
      }
    });
  },
  fail(error) {
    console.error('下载失败:', error);
  }
});
```

### 8. 从URL提取文件路径

```typescript
import { FileService } from '../../services';

// 从完整URL提取文件路径
const imageUrl = 'https://your-domain.com/images/1698765432123_example.jpg';
const filePath = FileService.extractFilePathFromUrl(imageUrl);
console.log(filePath); // 输出: images/1698765432123_example.jpg
```

## 完整使用示例

### 1. 在菜品详情页面上传图片

```typescript
// pages/dish/detail.ts
import { FileService, DishService } from '../../services';

Page({
  data: {
    dishId: '',
    dishInfo: null,
    imageList: []
  },
  
  onLoad(options) {
    this.setData({
      dishId: options.id || ''
    });
    this.loadDishDetails();
  },
  
  async loadDishDetails() {
    if (!this.data.dishId) return;
    
    try {
      const dishInfo = await DishService.getDishDetail(this.data.dishId);
      this.setData({
        dishInfo,
        imageList: dishInfo.images || []
      });
    } catch (error) {
      console.error('加载菜品详情失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },
  
  // 上传菜品图片
  async uploadDishImage() {
    try {
      const images = await FileService.uploadImage('dishes', 9);
      if (images.length > 0) {
        // 合并新上传的图片与已有图片
        const currentImages = this.data.imageList || [];
        const newImageList = [...currentImages, ...images.map(img => img.url)];
        
        this.setData({
          imageList: newImageList
        });
        
        // 保存图片到菜品信息
        if (this.data.dishId) {
          await DishService.updateDish({
            id: this.data.dishId,
            images: newImageList
          });
        }
        
        wx.showToast({
          title: '上传成功',
          icon: 'success'
        });
      }
    } catch (error) {
      console.error('上传图片失败:', error);
      wx.showToast({
        title: '上传失败',
        icon: 'error'
      });
    }
  },
  
  // 删除菜品图片
  async deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const imageUrl = this.data.imageList[index];
    
    // 从URL中提取文件路径
    const filePath = FileService.extractFilePathFromUrl(imageUrl);
    
    const result = await FileService.deleteFile(filePath);
    if (result.success) {
      // 从列表中移除已删除的图片
      const newImageList = [...this.data.imageList];
      newImageList.splice(index, 1);
      this.setData({
        imageList: newImageList
      });
      
      // 更新菜品信息
      if (this.data.dishId) {
        await DishService.updateDish({
          id: this.data.dishId,
          images: newImageList
        });
      }
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  },
  
  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.imageList
    });
  }
});
```

### 2. 管理员页面批量管理文件

```typescript
// pages/admin/files.ts
import { FileService } from '../../services';

Page({
  data: {
    folders: ['images', 'dishes', 'default', 'documents'],
    currentFolder: 'images',
    files: [],
    selectedFiles: [],
    isLoading: false
  },
  
  onLoad() {
    this.loadFiles();
  },
  
  // 切换文件夹
  changeFolder(e) {
    const folder = e.currentTarget.dataset.folder;
    this.setData({
      currentFolder: folder,
      files: [],
      selectedFiles: []
    });
    this.loadFiles();
  },
  
  // 加载文件列表
  async loadFiles() {
    this.setData({ isLoading: true });
    
    try {
      const fileList = await FileService.listFiles(this.data.currentFolder, 100);
      if (fileList && fileList.files) {
        this.setData({
          files: fileList.files,
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
  
  // 选择文件
  selectFile(e) {
    const filePath = e.currentTarget.dataset.path;
    const selectedFiles = [...this.data.selectedFiles];
    const index = selectedFiles.indexOf(filePath);
    
    if (index === -1) {
      selectedFiles.push(filePath);
    } else {
      selectedFiles.splice(index, 1);
    }
    
    this.setData({ selectedFiles });
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
    
    const confirmModal = await new Promise(resolve => {
      wx.showModal({
        title: '确认删除',
        content: `确定要删除选中的 ${selectedFiles.length} 个文件吗？`,
        confirmText: '删除',
        confirmColor: '#ff0000',
        success: res => resolve(res.confirm)
      });
    });
    
    if (!confirmModal) return;
    
    wx.showLoading({ title: '正在删除...' });
    
    try {
      // 使用批量删除接口
      const result = await wx.request({
        url: '/api/file/batch-delete',
        method: 'POST',
        data: { filePaths: selectedFiles }
      });
      
      if (result.statusCode === 200 && result.data.success) {
        wx.showToast({
          title: `成功删除 ${result.data.data.successful} 个文件`,
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
      console.error('批量删除文件失败:', error);
      wx.showToast({
        title: '批量删除失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  }
});
```

### 3. 在 WXML 模板中使用

```html
<!-- pages/dish/detail.wxml -->
<view class="container">
  <view class="dish-images">
    <view class="image-list">
      <block wx:for="{{imageList}}" wx:key="index">
        <view class="image-item">
          <image referrerPolicy="no-referrer" src="{{item}}" mode="aspectFill" bindtap="previewImage" data-url="{{item}}"></image>
          <icon class="delete-icon" type="clear" size="20" bindtap="deleteImage" data-index="{{index}}"></icon>
        </view>
      </block>
      <view class="upload-btn" bindtap="uploadDishImage">
        <text class="plus">+</text>
      </view>
    </view>
  </view>
  
  <!-- 其他菜品详情内容 -->
</view>
```

## 权限管理

文件服务实现了基于用户的权限控制：

1. **普通用户**:
   - 只能查看、下载和删除自己上传的文件
   - 列表接口只返回自己上传的文件

2. **管理员用户**:
   - 可以查看、下载和删除所有文件
   - 列表接口返回所有文件
   - 可以使用批量删除功能

## 项目架构说明

本项目采用模型与服务分离的架构设计：

1. **模型层 (Models)**: `models/file.ts` 
   - 只包含数据结构定义和接口
   - 不包含任何业务逻辑或网络请求

2. **服务层 (Services)**: `services/fileService.ts`
   - 包含所有与文件操作相关的业务逻辑
   - 处理网络请求、文件上传下载等操作
   - 提供辅助方法，如URL解析、文件夹建议等

这种分离架构使得代码更加清晰，维护性更高，遵循单一职责原则。

## 注意事项

1. 请确保用户已经登录，所有文件操作都需要用户认证
2. 上传大文件可能需要考虑网络状态和超时设置
3. 文件路径格式通常为 `folder/timestamp_filename`
4. 对于敏感操作（如删除文件），应添加用户确认
5. 处理不同类型文件时，注意兼容性和权限问题 