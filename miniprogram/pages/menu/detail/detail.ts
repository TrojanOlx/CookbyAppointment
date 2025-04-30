import { Dish, DishType, SpicyLevel } from '../../../models/dish';
import { DishService } from '../../../services/dishService';
import { showSuccess, showConfirm, showLoading, hideLoading, showToast } from '../../../utils/util';
import { UserService } from '../../../services/userService';
import { FileService } from '../../../services/fileService';
import cnchar from 'cnchar';
import 'cnchar-poly'; // 引入多音字功能

// 从URL中提取路径部分的辅助函数
function extractPathFromUrl(url: string): string {
  if (!url) return '';
  
  try {
    // 由于微信小程序环境下没有全局URL类，使用字符串处理
    // 移除协议和域名部分
    const parts = url.split('//');
    if (parts.length > 1) {
      const pathParts = parts[1].split('/');
      // 移除域名
      pathParts.shift();
      return pathParts.join('/');
    }
    
    // 如果没有协议部分，检查是否以域名开头
    const slashIndex = url.indexOf('/');
    if (slashIndex !== -1) {
      // 检查是否是首个斜杠
      const firstPart = url.substring(0, slashIndex);
      if (firstPart.includes('.')) {
        // 可能是域名，移除域名部分
        return url.substring(slashIndex + 1);
      }
    }
    
    return url;
  } catch (error) {
    console.error('提取路径失败:', error);
    return url;
  }
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    dish: {} as Dish,
    dishId: '',
    safeAreaBottom: 0,
    loading: false,
    isAdmin: false, // 是否为管理员
    isEdit: false,  // 是否处于编辑状态
    tempDish: {} as Dish, // 存储编辑时的临时数据
    dishTypes: Object.values(DishType),
    spicyLevels: Object.values(SpicyLevel)
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.id) {
      this.setData({
        dishId: options.id
      });
      this.loadDish();
    }
    
    this.setSafeArea();
    this.checkAdminStatus();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面都重新加载数据，以便获取最新的编辑结果
    if (this.data.dishId) {
      this.loadDish();
    }
    this.checkAdminStatus();
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    try {
      const result = await UserService.checkAdmin();
      this.setData({ isAdmin: result.isAdmin });
    } catch (error) {
      console.error('检查管理员状态失败:', error);
      this.setData({ isAdmin: false });
    }
  },

  // 设置安全区域
  setSafeArea() {
    const app = getApp<IAppOption>();
    const systemInfo = (app.globalData as any).systemInfo;
    if (systemInfo) {
      // 如果已有系统信息
      this.processSafeArea(systemInfo);
    } else {
      // 重新获取系统信息
      wx.getSystemInfo({
        success: (res) => {
          this.processSafeArea(res);
        }
      });
    }
  },

  // 处理安全区域数据
  processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
    const safeAreaBottom = systemInfo.safeArea ? 
      (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;
    
    this.setData({
      safeAreaBottom
    });
  },

  /**
   * 加载菜品数据
   */
  async loadDish() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    showLoading('加载中');
    
    try {
      const dish = await DishService.getDishDetail(this.data.dishId);
      this.setData({ dish });
    } catch (error) {
      console.error('获取菜品详情失败:', error);
      showToast('获取菜品详情失败');
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } finally {
      hideLoading();
      this.setData({ loading: false });
    }
  },

  /**
   * 开始编辑菜品 - 直接在本页面编辑
   */
  startEdit() {
    // 创建一个菜品数据的深拷贝，用于编辑
    const tempDish = JSON.parse(JSON.stringify(this.data.dish));
    this.setData({
      isEdit: true,
      tempDish
    });
  },

  /**
   * 取消编辑
   */
  cancelEdit() {
    this.setData({
      isEdit: false,
      tempDish: {} as Dish
    });
  },

  /**
   * 保存编辑后的菜品
   */
  async saveDish() {
    try {
      // 基本数据校验
      if (!this.data.tempDish.name) {
        showToast('菜品名称不能为空');
        return;
      }

      if (this.data.tempDish.ingredients.length === 0) {
        showToast('请至少添加一种食材');
        return;
      }

      if (this.data.tempDish.steps.length === 0) {
        showToast('请至少添加一个步骤');
        return;
      }

      showLoading('保存中');
      
      // 处理图片上传
      let uploadedImages = [...this.data.tempDish.images];
      const newImages = this.data.tempDish.images.filter(img => img.startsWith('wxfile://') || img.startsWith('http://tmp/') || img.startsWith('tmp_'));
      
      if (newImages.length > 0) {
        try {
          // 获取菜品名称的拼音首字母（小写）
          const dishName = this.data.tempDish.name.trim();
          const pinyinResult = cnchar.spell(dishName, 'first', 'low');
          const pinyinInitials = Array.isArray(pinyinResult) ? pinyinResult.join('') : pinyinResult;
          
          // 处理并上传新图片
          showLoading('上传图片中...');
          const uploadPromises = newImages.map(async (tempFilePath, index) => {
            try {
              // 提取原始文件扩展名
              const fileExt = tempFilePath.substring(tempFilePath.lastIndexOf('.')).toLowerCase();
              
              // 生成新的文件名：拼音首字母 + 序号 + 时间戳 + 原始扩展名
              const timestamp = Date.now().toString().substring(8); // 仅使用时间戳后几位
              const newFileName = `${pinyinInitials}${index + 1}_${timestamp}${fileExt}`;
              
              // 上传图片到服务器
              const result = await FileService.uploadFile(
                tempFilePath,
                'dishes', // 将图片上传到dishes文件夹
                newFileName
              );
              
              if (result.success && result.data && result.data.filePath) {
                // 只存储路径，不存储域名
                return result.data.filePath;
              } else if (result.success && result.data && result.data.url) {
                // 如果返回了url但没有filePath，从url中提取路径部分
                return extractPathFromUrl(result.data.url);
              } else {
                console.error('上传图片失败:', result.error || '未知错误');
                return null;
              }
            } catch (error) {
              console.error(`上传图片 ${index + 1} 失败:`, error);
              return null;
            }
          });
          
          // 等待所有图片上传完成
          const results = await Promise.all(uploadPromises);
          const successfulUploads = results.filter(url => url !== null) as string[];
          
          // 用上传成功的图片URL替换临时路径
          if (successfulUploads.length > 0) {
            // 先从images中移除所有临时图片路径
            uploadedImages = uploadedImages.filter(img => 
              !img.startsWith('wxfile://') && 
              !img.startsWith('http://tmp/') && 
              !img.startsWith('tmp_')
            );
            
            // 再将新上传的图片添加到数组末尾
            uploadedImages = [...uploadedImages, ...successfulUploads];
          }
          
          if (successfulUploads.length < newImages.length) {
            console.warn(`部分图片上传失败，成功: ${successfulUploads.length}/${newImages.length}`);
          }
        } catch (error) {
          console.error('处理图片时出错:', error);
          hideLoading();
          showToast('图片处理失败，请重试');
          return;
        }
      }
      
      // 更新图片数组
      this.data.tempDish.images = uploadedImages;
      
      // 使用DishService更新菜品
      await DishService.updateDish(this.data.tempDish);
      
      hideLoading();
      showSuccess('保存成功');
      
      // 更新成功后，退出编辑模式并刷新数据
      this.setData({
        isEdit: false,
        dish: this.data.tempDish
      });
      
      // 重新加载最新数据
      this.loadDish();
    } catch (error) {
      hideLoading();
      console.error('保存菜品失败:', error);
      showToast('保存失败，请重试');
    }
  },

  /**
   * 修改菜品名称
   */
  nameInput(e: any) {
    this.setData({
      'tempDish.name': e.detail.value
    });
  },

  /**
   * 修改菜品类型
   */
  typeChange(e: any) {
    const index = e.detail.value;
    this.setData({
      'tempDish.type': this.data.dishTypes[index]
    });
  },

  /**
   * 修改辣度
   */
  spicyChange(e: any) {
    const index = e.detail.value;
    this.setData({
      'tempDish.spicy': this.data.spicyLevels[index]
    });
  },

  /**
   * 修改注意事项
   */
  noticeInput(e: any) {
    this.setData({
      'tempDish.notice': e.detail.value
    });
  },

  /**
   * 修改备注
   */
  remarkInput(e: any) {
    this.setData({
      'tempDish.remark': e.detail.value
    });
  },

  /**
   * 修改参考链接
   */
  referenceInput(e: any) {
    this.setData({
      'tempDish.reference': e.detail.value
    });
  },

  /**
   * 选择图片
   */
  chooseImage() {
    wx.chooseImage({
      count: 9 - this.data.tempDish.images.length, // 最多9张图片
      sizeType: ['compressed'], // 只允许压缩图片
      sourceType: ['album', 'camera'], // 允许从相册或相机选择
      success: (res) => {
        // 将选择的图片添加到列表中
        const images = this.data.tempDish.images.concat(res.tempFilePaths);
        this.setData({
          'tempDish.images': images
        });
      }
    });
  },

  /**
   * 预览图片
   */
  previewImage(e: any) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current,
      urls: this.data.isEdit ? this.data.tempDish.images : this.data.dish.images
    });
  },

  /**
   * 删除图片
   */
  deleteImage(e: any) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.tempDish.images];
    images.splice(index, 1);
    this.setData({
      'tempDish.images': images
    });
  },

  /**
   * 添加食材
   */
  addIngredient() {
    const ingredients = this.data.tempDish.ingredients || [];
    ingredients.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: '',
      amount: ''
    });
    this.setData({
      'tempDish.ingredients': ingredients
    });
  },

  /**
   * 删除食材
   */
  deleteIngredient(e: any) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.tempDish.ingredients;
    if (ingredients.length > 1) {
      ingredients.splice(index, 1);
      this.setData({
        'tempDish.ingredients': ingredients
      });
    } else {
      showToast('至少保留一项食材');
    }
  },

  /**
   * 修改食材名称
   */
  ingredientNameInput(e: any) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`tempDish.ingredients[${index}].name`]: e.detail.value
    });
  },

  /**
   * 修改食材用量
   */
  ingredientAmountInput(e: any) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`tempDish.ingredients[${index}].amount`]: e.detail.value
    });
  },

  /**
   * 添加步骤
   */
  addStep() {
    const steps = this.data.tempDish.steps || [];
    steps.push('');
    this.setData({
      'tempDish.steps': steps
    });
  },

  /**
   * 删除步骤
   */
  deleteStep(e: any) {
    const index = e.currentTarget.dataset.index;
    const steps = this.data.tempDish.steps;
    if (steps.length > 1) {
      steps.splice(index, 1);
      this.setData({
        'tempDish.steps': steps
      });
    } else {
      showToast('至少保留一个步骤');
    }
  },

  /**
   * 修改步骤内容
   */
  stepInput(e: any) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`tempDish.steps[${index}]`]: e.detail.value
    });
  },

  /**
   * 编辑菜品（跳转到添加页面）
   */
  editDish() {
    wx.navigateTo({
      url: `../add/add?id=${this.data.dishId}`
    });
  },

  /**
   * 删除菜品
   */
  async deleteDish() {
    const confirmed = await showConfirm('确认删除', '确定要删除这个菜品吗？');
    if (confirmed) {
      try {
        showLoading('删除中');
        const result = await DishService.deleteDish(this.data.dishId);
        if (result.success) {
          hideLoading();
          showSuccess('删除成功');
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          throw new Error('删除失败');
        }
      } catch (error) {
        hideLoading();
        console.error('删除菜品失败:', error);
        showToast('删除菜品失败');
      }
    }
  }
}) 