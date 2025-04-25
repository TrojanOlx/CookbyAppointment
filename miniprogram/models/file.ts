// 文件存储相关数据模型

// 文件信息接口
export interface FileInfo {
  filePath: string;     // 文件路径
  fileName: string;     // 文件名
  fileType?: string;    // 文件类型（可选，有些返回缺少此字段）
  fileSize: number;     // 文件大小
  uploadTime?: string;  // 上传时间
  url: string;          // 文件访问URL
}

// 文件列表响应接口
export interface FileListResponse {
  files: FileInfo[];    // 文件列表
  truncated: boolean;   // 是否被截断
  total: number;        // 总文件数
}

// 文件上传响应接口
export interface FileUploadResponse {
  success: boolean;     // 是否成功
  data?: FileInfo;      // 文件信息
  error?: string;       // 错误信息
}

// 文件操作响应接口
export interface FileOperationResponse {
  success: boolean;     // 是否成功
  message?: string;     // 成功或错误消息
}

// 批量删除文件响应接口
export interface BatchDeleteResponse {
  success: boolean;     // 是否成功
  data?: {
    total: number;      // 总文件数
    successful: number; // 成功删除数
    failed: number;     // 删除失败数
    details: Array<{    // 详细结果
      filePath: string; // 文件路径
      success: boolean; // 是否成功
      error?: string;   // 错误信息
    }>;
  };
  message?: string;     // 错误消息
}