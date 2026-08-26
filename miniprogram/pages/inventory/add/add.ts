import { InventoryItem } from '../../../models/inventory';
import { FileInfo } from '../../../models/file';
import { InventoryService } from '../../../services/inventoryService';
import { FileService } from '../../../services/fileService';
import { getCurrentDate, showError, showSuccess, showLoading, hideLoading } from '../../../utils/util';

// 默认食材数据结构
const DEFAULT_ITEM: Partial<InventoryItem> = {
  id: '',
  name: '',
  amount: '',
  putInDate: getCurrentDate(),
  expiryDate: '',
  image: ''
};

let inventoryEditorLoadRequestId = 0;
let inventoryEditorMutationRequestId = 0;

const currentInventoryEditorScope = () => {
  const family = wx.getStorageSync('active_family_id');
  return `${String(wx.getStorageSync('token') || '')}|${JSON.stringify(family || '')}`;
};

Page({
  data: {
    item: { ...DEFAULT_ITEM } as Partial<InventoryItem>,
    editMode: false,
    localImagePath: '', // 本地临时图片路径（选图后未上传前）
    isSubmitting: false
  },

  async onLoad(options: { id?: string }) {
    const requestId = ++inventoryEditorLoadRequestId;
    const scope = currentInventoryEditorScope();
    const isCurrentRequest = () => requestId === inventoryEditorLoadRequestId
      && scope === currentInventoryEditorScope();
    if (options.id) {
      // 编辑模式，从 API 加载食材数据
      showLoading('加载中');
      try {
        const item = await InventoryService.getInventoryDetail(options.id);
        if (!isCurrentRequest()) return;
        this.setData({ item, editMode: true });
        wx.setNavigationBarTitle({ title: '编辑食材' });
      } catch {
        if (!isCurrentRequest()) return;
        showError('未找到指定食材');
        setTimeout(() => {
          if (isCurrentRequest()) wx.navigateBack();
        }, 1500);
      } finally {
        if (isCurrentRequest()) hideLoading();
      }
    } else {
      this.setData({ 'item.putInDate': getCurrentDate() });
    }
  },

  onUnload() {
    inventoryEditorLoadRequestId += 1;
    inventoryEditorMutationRequestId += 1;
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0]?.tempFilePath;
        if (!tempFilePath) return;
        void FileService.preflightImages([tempFilePath]).then(({ valid, failures }) => {
          if (failures.length) {
            showError(failures[0].error);
            return;
          }
          this.setData({
            localImagePath: valid[0],
            'item.image': valid[0]
          });
        });
      }
    });
  },

  // 放入日期选择
  putInDateChange(e: any) {
    this.setData({ 'item.putInDate': e.detail.value });
  },

  // 保质期选择
  expiryDateChange(e: any) {
    this.setData({ 'item.expiryDate': e.detail.value });
  },

  // 取消操作
  cancel() {
    wx.navigateBack();
  },

  // 提交表单
  async submitForm(e: any) {
    if (this.data.isSubmitting) return;

    const formData = e.detail.value;
    const { editMode, localImagePath } = this.data;
    const item = { ...this.data.item };

    if (!formData.name || formData.name.trim() === '') {
      showError('请输入食材名称');
      return;
    }
    if (!formData.amount || formData.amount.trim() === '') {
      showError('请输入数量/重量');
      return;
    }
    if (!item.putInDate) {
      showError('请选择放入日期');
      return;
    }
    if (!item.expiryDate) {
      showError('请选择保质期');
      return;
    }
    if (new Date(item.expiryDate) < new Date(item.putInDate)) {
      showError('保质期不能早于放入日期');
      return;
    }

    const requestId = ++inventoryEditorMutationRequestId;
    const scope = currentInventoryEditorScope();
    const isCurrentRequest = () => requestId === inventoryEditorMutationRequestId
      && scope === currentInventoryEditorScope();
    this.setData({ isSubmitting: true });
    showLoading('保存中');
    let newlyUploadedFile: FileInfo | null = null;
    try {
      let imageUrl = item.image || '';

      // 如果选择了新图片，先上传到服务器
      if (localImagePath && localImagePath === imageUrl) {
        const uploadResult = await FileService.uploadFile(localImagePath, 'inventory');
        if (!isCurrentRequest()) {
          if (uploadResult.data) void FileService.cleanupUploadedFiles([uploadResult.data]);
          return;
        }
        if (uploadResult?.data?.url) {
          newlyUploadedFile = uploadResult.data;
          imageUrl = uploadResult.data.url;
        } else {
          hideLoading();
          showError(uploadResult?.error || '图片上传失败，请重试');
          return;
        }
      }

      const saveItem: Partial<InventoryItem> = {
        name: formData.name.trim(),
        amount: formData.amount.trim(),
        putInDate: item.putInDate,
        expiryDate: item.expiryDate,
        image: imageUrl || undefined
      };

      if (editMode && item.id) {
        await InventoryService.updateInventory({ ...saveItem, id: item.id, expectedUpdateTime: item.updateTime });
        if (!isCurrentRequest()) return;
        showSuccess('食材更新成功');
      } else {
        await InventoryService.addInventory(saveItem);
        if (!isCurrentRequest()) return;
        showSuccess('食材添加成功');
      }

      setTimeout(() => {
        if (isCurrentRequest()) wx.navigateBack();
      }, 1000);
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (newlyUploadedFile) void FileService.cleanupUploadedFiles([newlyUploadedFile]);
      showError('操作失败：' + (error as Error).message);
    } finally {
      if (isCurrentRequest()) {
        hideLoading();
        this.setData({ isSubmitting: false });
      }
    }
  }
});
