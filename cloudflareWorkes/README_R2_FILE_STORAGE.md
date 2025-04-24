# Cloudflare R2 文件存储服务

本文档描述了通过 Cloudflare Workers 实现的 R2 文件存储服务的使用方法。

## 配置说明

在部署 Worker 之前，需要在 Cloudflare 控制台中创建 R2 存储桶，并配置以下环境变量：

1. `FILE_BUCKET`: R2 存储桶的绑定名称
2. `R2_PUBLIC_URL`: 文件访问的公共 URL 前缀（如果使用 Cloudflare 公开 URL）

### wrangler.toml 配置示例

```toml
name = "cook-by-appointment"
main = "worker.js"
compatibility_date = "2023-10-30"

[[r2_buckets]]
binding = "FILE_BUCKET"
bucket_name = "your-bucket-name"
preview_bucket_name = "your-preview-bucket-name"

[vars]
R2_PUBLIC_URL = "https://pub-xxxxxxxx.r2.dev/your-bucket-name"
```

## API 说明

### 1. 上传文件

**端点**: `POST /api/file/upload`

**请求格式**: 
- 使用 `multipart/form-data` 格式
- 参数:
  - `file`: 要上传的文件 (必需)
  - `fileName`: 自定义文件名 (可选，默认为原始文件名)
  - `folder`: 存储文件夹 (可选，默认为 "default")

**响应示例**:
```json
{
  "success": true,
  "data": {
    "filePath": "images/1698765432123_example.jpg",
    "fileName": "example.jpg",
    "fileType": "image/jpeg",
    "fileSize": 123456,
    "url": "https://your-bucket-url/images/1698765432123_example.jpg"
  }
}
```

### 2. 获取文件信息

**端点**: `GET /api/file/info?filePath=path/to/file.jpg`

**请求参数**:
- `filePath`: 文件路径 (必需)

**响应示例**:
```json
{
  "success": true,
  "data": {
    "filePath": "images/1698765432123_example.jpg",
    "fileName": "example.jpg",
    "fileType": "image/jpeg",
    "fileSize": 123456,
    "uploadTime": "2023-10-31T12:34:56.789Z",
    "url": "https://your-bucket-url/images/1698765432123_example.jpg"
  }
}
```

### 3. 下载文件

**端点**: `GET /api/file/download?filePath=path/to/file.jpg`

**请求参数**:
- `filePath`: 文件路径 (必需)

**响应**:
- 文件内容，带有适当的内容类型和下载头信息

### 4. 删除文件

**端点**: `DELETE /api/file/delete?filePath=path/to/file.jpg`

**请求参数**:
- `filePath`: 文件路径 (必需)

**响应示例**:
```json
{
  "success": true,
  "message": "文件已成功删除"
}
```

### 5. 列出文件

**端点**: `GET /api/file/list?folder=images&limit=50`

**请求参数**:
- `folder`: 文件夹路径 (可选，默认为 "default")
- `limit`: 返回的最大文件数量 (可选，默认为 100)

**响应示例**:
```json
{
  "success": true,
  "data": {
    "files": [
      {
        "filePath": "images/1698765432123_example1.jpg",
        "fileName": "example1.jpg",
        "fileType": "image/jpeg",
        "fileSize": 123456,
        "uploadTime": "2023-10-31T12:34:56.789Z",
        "url": "https://your-bucket-url/images/1698765432123_example1.jpg"
      },
      {
        "filePath": "images/1698765432124_example2.jpg",
        "fileName": "example2.jpg",
        "fileType": "image/jpeg",
        "fileSize": 654321,
        "uploadTime": "2023-10-31T12:34:57.789Z",
        "url": "https://your-bucket-url/images/1698765432124_example2.jpg"
      }
    ],
    "truncated": false,
    "total": 2
  }
}
```

## 使用示例

### 前端上传文件示例 (微信小程序)

```javascript
// 上传图片示例
uploadImage: function() {
  const that = this;
  wx.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success(res) {
      const tempFilePath = res.tempFilePaths[0];
      
      // 上传文件到服务器
      wx.uploadFile({
        url: 'https://your-worker-url/api/file/upload',
        filePath: tempFilePath,
        name: 'file',
        formData: {
          'folder': 'images'
        },
        success(res) {
          const data = JSON.parse(res.data);
          if (data.success) {
            // 上传成功，获取文件信息
            const fileInfo = data.data;
            // 处理文件信息...
            wx.showToast({
              title: '上传成功',
              icon: 'success'
            });
          } else {
            wx.showToast({
              title: '上传失败',
              icon: 'error'
            });
          }
        },
        fail(err) {
          console.error('上传失败:', err);
          wx.showToast({
            title: '上传失败',
            icon: 'error'
          });
        }
      });
    }
  });
}
```

### 删除文件示例 (微信小程序)

```javascript
// 删除文件示例
deleteFile: function(filePath) {
  wx.request({
    url: `https://your-worker-url/api/file/delete?filePath=${encodeURIComponent(filePath)}`,
    method: 'DELETE',
    success(res) {
      if (res.data.success) {
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
    fail(err) {
      console.error('删除失败:', err);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  });
}
```

## 注意事项

1. 确保 R2 存储桶已正确配置访问权限。
2. 对于大文件上传，可能需要配置更长的执行超时时间。
3. 文件路径会自动包含时间戳，以避免文件名冲突。
4. 在生产环境中，应添加适当的身份验证和授权机制。
5. 默认存储在 "default" 文件夹下，可通过 folder 参数指定其他文件夹。 