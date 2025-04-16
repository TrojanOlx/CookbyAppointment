import { InventoryItem } from '../../../utils/model';
import { inventoryService, generateId } from '../../../utils/storage';
import { getCurrentDate, showError, showSuccess } from '../../../utils/util';

// 默认食材数据结构
const DEFAULT_ITEM: InventoryItem = {
  id: '',
  name: '',
  amount: '',
  putInDate: getCurrentDate(),
  expiryDate: '',
  createTime: 0,
  image: ''
};

Page({
  data: {
    item: { ...DEFAULT_ITEM } as InventoryItem,
    editMode: false
  },

  onLoad(options) {
    if (options.id) {
      // 编辑模式，加载食材数据
      const item = inventoryService.getInventoryById(options.id);
      
      if (item) {
        this.setData({
          item,
          editMode: true
        });
        
        wx.setNavigationBarTitle({
          title: '编辑食材'
        });
      } else {
        showError('未找到指定食材');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } else {
      // 新增模式，设置默认放入日期为今天
      this.setData({
        'item.putInDate': getCurrentDate()
      });
    }
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        
        // 将临时路径设置到数据中
        this.setData({
          'item.image': tempFilePath
        });
      }
    });
  },

  // 放入日期选择
  putInDateChange(e: any) {
    this.setData({
      'item.putInDate': e.detail.value
    });
  },

  // 保质期选择
  expiryDateChange(e: any) {
    this.setData({
      'item.expiryDate': e.detail.value
    });
  },

  // 取消操作
  cancel() {
    wx.navigateBack();
  },

  // 提交表单
  submitForm(e: any) {
    const formData = e.detail.value;
    const { item, editMode } = this.data;
    
    // 验证必填字段
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
    
    // 验证日期
    if (new Date(item.expiryDate) < new Date(item.putInDate)) {
      showError('保质期不能早于放入日期');
      return;
    }
    
    // 构建保存数据
    const saveItem: InventoryItem = {
      id: editMode ? item.id : generateId(),
      name: formData.name.trim(),
      amount: formData.amount.trim(),
      putInDate: item.putInDate,
      expiryDate: item.expiryDate,
      createTime: editMode ? item.createTime : Date.now(),
      image: item.image || '/images/default-food.png'
    };
    
    try {
      if (editMode) {
        // 更新食材
        const success = inventoryService.updateInventory(saveItem);
        if (success) {
          showSuccess('食材更新成功');
        } else {
          showError('食材更新失败');
          return;
        }
      } else {
        // 添加食材
        inventoryService.addInventory(saveItem);
        showSuccess('食材添加成功');
      }
      
      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      showError('操作失败：' + (error as Error).message);
    }
  }
}); 