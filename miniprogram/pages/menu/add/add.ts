import { DishType, Dish, Ingredient, SpicyLevel } from '../../../models/dish';
import { FileInfo } from '../../../models/file';
import { DishService } from '../../../services/dishService';
import { FileService } from '../../../services/fileService';
import { showSuccess, showError, showLoading, hideLoading, showToast } from '../../../utils/util';
import { createUploadFileName } from './uploadFileName';

let dishEditorLoadRequestId = 0;
let dishEditorMutationRequestId = 0;

const currentDishEditorScope = () => {
  const family = wx.getStorageSync('active_family_id');
  return `${String(wx.getStorageSync('token') || '')}|${JSON.stringify(family || '')}`;
};

// 生成唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

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
    isEdit: false,
    dish: {
      id: '',
      name: '',
      type: DishType.Stir,
      spicy: SpicyLevel.None,
      images: [] as string[],
      ingredients: [] as Ingredient[],
      steps: [] as string[],
      notice: '',
      remark: '',
      reference: '',
      createTime: 0
    } as Dish,
    dishTypes: Object.values(DishType),
    spicyLevels: Object.values(SpicyLevel),
    safeAreaBottom: 0,
    loading: false,
    isSubmitting: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    const requestId = ++dishEditorLoadRequestId;
    const scope = currentDishEditorScope();
    const isCurrentRequest = () => requestId === dishEditorLoadRequestId
      && scope === currentDishEditorScope();
    if (options.id) {
      // 编辑现有菜品
      this.setData({ loading: true });
      showLoading('加载中');
      try {
        const dish = await DishService.getDishDetail(options.id);
        if (!isCurrentRequest()) return;
        (this as any)._originalDish = JSON.parse(JSON.stringify(dish));
        this.setData({
          isEdit: true,
          dish
        });
        wx.setNavigationBarTitle({
          title: '编辑菜品'
        });
      } catch (error) {
        if (!isCurrentRequest()) return;
        console.error('获取菜品详情失败:', error);
        showToast('获取菜品详情失败');
        setTimeout(() => {
          if (isCurrentRequest()) wx.navigateBack();
        }, 1500);
      } finally {
        if (isCurrentRequest()) {
          hideLoading();
          this.setData({ loading: false });
        }
      }
    } else {
      // 添加新菜品，创建一个空的食材项和步骤项
      this.addIngredient();
      this.addStep();
    }
    this.setSafeArea();
  },

  onUnload() {
    dishEditorLoadRequestId += 1;
    dishEditorMutationRequestId += 1;
  },

  /**
   * 设置安全区域
   */
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

  /**
   * 处理安全区域数据
   */
  processSafeArea(systemInfo: WechatMiniprogram.SystemInfo) {
    const safeAreaBottom = systemInfo.safeArea ? 
      (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0;
    
    this.setData({
      safeAreaBottom
    });
  },

  // 选择菜品类型
  typeChange(e: any) {
    const index = e.detail.value;
    this.setData({
      'dish.type': this.data.dishTypes[index]
    });
  },

  // 选择辣度
  spicyChange(e: any) {
    const index = e.detail.value;
    const spicy = this.data.spicyLevels[index];
    this.setData({
      'dish.spicy': spicy
    });
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 9 - this.data.dish.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        void FileService.preflightImages(res.tempFilePaths).then(({ valid, failures }) => {
          if (failures.length) {
            showToast(`已跳过${failures.length}张不符合要求的图片`);
          }
          if (!valid.length) return;
          this.setData({
            'dish.images': this.data.dish.images.concat(valid)
          });
        });
      }
    });
  },

  // 删除图片
  deleteImage(e: any) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.dish.images;
    images.splice(index, 1);
    this.setData({
      'dish.images': images
    });
  },

  // 创建空的食材对象
  createEmptyIngredient(): Ingredient {
    return {
      id: generateId(),
      name: '',
      amount: ''
    };
  },

  // 添加食材
  addIngredient() {
    const ingredients = this.data.dish.ingredients;
    if (ingredients.length >= 50) {
      showError('食材最多添加50项');
      return;
    }
    ingredients.push(this.createEmptyIngredient());
    this.setData({
      'dish.ingredients': ingredients
    });
  },

  // 删除食材
  deleteIngredient(e: any) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.dish.ingredients;
    if (ingredients.length > 1) {
      ingredients.splice(index, 1);
      this.setData({
        'dish.ingredients': ingredients
      });
    } else {
      showError('至少保留一项食材');
    }
  },

  // 食材名称输入
  ingredientNameInput(e: any) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    this.setData({
      [`dish.ingredients[${index}].name`]: value
    });
  },

  // 食材数量输入
  ingredientAmountInput(e: any) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    this.setData({
      [`dish.ingredients[${index}].amount`]: value
    });
  },

  // 添加步骤
  addStep() {
    const steps = this.data.dish.steps;
    if (steps.length >= 30) {
      showError('步骤最多添加30项');
      return;
    }
    steps.push('');
    this.setData({
      'dish.steps': steps
    });
  },

  // 删除步骤
  deleteStep(e: any) {
    const index = e.currentTarget.dataset.index;
    const steps = this.data.dish.steps;
    if (steps.length > 1) {
      steps.splice(index, 1);
      this.setData({
        'dish.steps': steps
      });
    } else {
      showError('至少保留一个步骤');
    }
  },

  // 步骤内容输入
  stepInput(e: any) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    this.setData({
      [`dish.steps[${index}]`]: value
    });
  },

  // 取消操作
  cancel() {
    wx.navigateBack();
  },

  // 提交表单
  async submitForm(e: any) {
    if (this.data.isSubmitting) return;

    const formData = e.detail.value;
    const dish = JSON.parse(JSON.stringify(this.data.dish)) as Dish;

    // 验证必填字段
    if (!formData.name) {
      showError('请输入菜品名称');
      return;
    }

    if (!dish.type) {
      showError('请选择菜品类型');
      return;
    }

    if (!dish.spicy) {
      showError('请选择辣度');
      return;
    }

    // 验证食材
    const validIngredients = dish.ingredients.filter(item => item.name && item.amount);
    if (validIngredients.length === 0) {
      showError('请至少添加一种食材');
      return;
    }

    // 验证步骤
    const validSteps = dish.steps.filter(step => step.trim() !== '');
    if (validSteps.length === 0) {
      showError('请至少添加一个步骤');
      return;
    }

    const requestId = ++dishEditorMutationRequestId;
    const scope = currentDishEditorScope();
    const isCurrentRequest = () => requestId === dishEditorMutationRequestId
      && scope === currentDishEditorScope();
    const newlyUploadedFiles: FileInfo[] = [];
    let uploadFailureCount = 0;
    try {
      this.setData({ isSubmitting: true });
      showLoading('处理图片中...');
      
      // 只上传本次新增的本地图片；已保存的图片保留稳定文件引用。
      const originalDish = (this as any)._originalDish as Dish | undefined;
      const imagesChanged = !originalDish || JSON.stringify(dish.images || []) !== JSON.stringify(originalDish.images || []);
      let uploadedImages: string[] = dish.images || [];
      if ((!this.data.isEdit || imagesChanged) && dish.images && dish.images.length > 0) {
        const uploadPromises = dish.images.map(async (tempFilePath, index) => {
          try {
            if (/^https?:\/\//i.test(tempFilePath) || tempFilePath.startsWith('/api/file/download')) {
              const fileId = tempFilePath.match(/[?&]id=([^&#]+)/i);
              return fileId ? `/api/file/download?id=${fileId[1]}` : tempFilePath;
            }
            const newFileName = createUploadFileName(dish.id || generateId(), index, tempFilePath);
            console.log(`处理图片 ${index + 1}/${dish.images.length}:`, newFileName);
            
            // 上传图片到服务器
            const result = await FileService.uploadFile(
              tempFilePath,
              'dishes', // 将图片上传到dishes文件夹
              newFileName
            );
            
            if (result.success && result.data && result.data.filePath) {
              newlyUploadedFiles.push(result.data);
              // 只存储路径，不存储域名
              return result.data.filePath;
            } else if (result.success && result.data && result.data.url) {
              if (result.data) newlyUploadedFiles.push(result.data);
              // 如果返回了url但没有filePath，从url中提取路径部分
              return extractPathFromUrl(result.data.url);
            } else {
              uploadFailureCount += 1;
              console.error('上传图片失败:', result.error || '未知错误');
              return null;
            }
          } catch (error) {
            uploadFailureCount += 1;
            console.error(`上传图片 ${index + 1} 失败:`, error);
            return null;
          }
        });
        
        // 等待所有图片上传完成
        const results = await Promise.all(uploadPromises);
        if (!isCurrentRequest()) {
          void FileService.cleanupUploadedFiles(newlyUploadedFiles);
          return;
        }
        uploadedImages = results.filter(url => url !== null) as string[];
        
        console.log('成功上传图片数量:', uploadedImages.length);
        if (uploadedImages.length === 0 && dish.images.length > 0) {
          hideLoading();
          showError('图片上传失败，请重试');
          return;
        }
        if (uploadFailureCount > 0) {
          showToast(`成功上传${uploadedImages.length}张，${uploadFailureCount}张失败`);
        }
      }
      
      // 构建保存的数据对象
      const saveDish: Dish = {
        id: dish.id || generateId(),
        name: formData.name,
        type: dish.type,
        spicy: dish.spicy,
        images: uploadedImages, // 使用上传后的图片路径数组
        ingredients: validIngredients,
        steps: validSteps,
        notice: formData.notice || '',
        remark: formData.remark || '',
        reference: formData.reference || '',
        createTime: dish.createTime || Date.now()
      };

      showLoading(this.data.isEdit ? '更新中' : '添加中');
      
      // 保存或更新菜品
      if (this.data.isEdit) {
        const update: Partial<Dish> & { expectedUpdateTime?: number } = {
          id: saveDish.id,
          expectedUpdateTime: originalDish?.updateTime
        };
        const comparableFields: Array<keyof Dish> = [
          'name', 'type', 'spicy', 'ingredients', 'steps', 'notice', 'remark', 'reference'
        ];
        for (const field of comparableFields) {
          if (!originalDish || JSON.stringify(saveDish[field]) !== JSON.stringify(originalDish[field])) {
            (update as any)[field] = saveDish[field];
          }
        }
        if (imagesChanged) update.images = saveDish.images;
        if (Object.keys(update).every(key => key === 'id' || key === 'expectedUpdateTime')) {
          hideLoading();
          showToast('没有需要保存的修改');
          return;
        }
        await DishService.updateDish(update);
        if (!isCurrentRequest()) return;
        hideLoading();
        showSuccess('菜品更新成功');
      } else {
        await DishService.addDish(saveDish);
        if (!isCurrentRequest()) return;
        hideLoading();
        showSuccess('菜品添加成功');
      }

      // 返回上一页
      setTimeout(() => {
        if (isCurrentRequest()) wx.navigateBack();
      }, 1500);
    } catch (error) {
      if (!isCurrentRequest()) return;
      void FileService.cleanupUploadedFiles(newlyUploadedFiles);
      hideLoading();
      console.error(this.data.isEdit ? '更新菜品失败:' : '添加菜品失败:', error);
      showToast(this.data.isEdit ? '更新菜品失败' : '添加菜品失败');
    } finally {
      if (isCurrentRequest()) this.setData({ isSubmitting: false });
    }
  }
});
