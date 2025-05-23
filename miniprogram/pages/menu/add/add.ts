import { DishType, Dish, Ingredient, SpicyLevel } from '../../../models/dish';
import { DishService } from '../../../services/dishService';
import { FileService } from '../../../services/fileService';
import { showSuccess, showError, showLoading, hideLoading, showToast } from '../../../utils/util';
import cnchar from 'cnchar';
import 'cnchar-poly'; // 引入多音字功能

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
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    if (options.id) {
      // 编辑现有菜品
      this.setData({ loading: true });
      showLoading('加载中');
      try {
        const dish = await DishService.getDishDetail(options.id);
        this.setData({
          isEdit: true,
          dish
        });
        wx.setNavigationBarTitle({
          title: '编辑菜品'
        });
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
    } else {
      // 添加新菜品，创建一个空的食材项和步骤项
      this.addIngredient();
      this.addStep();
    }
    this.setSafeArea();
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
        // 将选择的图片添加到列表中
        const images = this.data.dish.images.concat(res.tempFilePaths);
        this.setData({
          'dish.images': images
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
    const formData = e.detail.value;
    const { dish } = this.data;

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

    try {
      showLoading('处理图片中...');
      
      // 获取菜品名称的拼音首字母（小写）
      const dishName = formData.name.trim();
      const pinyinResult = cnchar.spell(dishName, 'first', 'low');
      const pinyinInitials = Array.isArray(pinyinResult) ? pinyinResult.join('') : pinyinResult;
      console.log('菜品拼音首字母:', pinyinInitials);
      
      // 处理并上传图片
      let uploadedImages: string[] = [];
      if (dish.images && dish.images.length > 0) {
        const uploadPromises = dish.images.map(async (tempFilePath, index) => {
          try {
            // 提取原始文件扩展名
            const fileExt = tempFilePath.substring(tempFilePath.lastIndexOf('.')).toLowerCase();
            
            // 生成新的文件名：拼音首字母 + 序号 + 原始扩展名
            const newFileName = `${pinyinInitials}${index + 1}${fileExt}`;
            console.log(`处理图片 ${index + 1}/${dish.images.length}:`, newFileName);
            
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
        uploadedImages = results.filter(url => url !== null) as string[];
        
        console.log('成功上传图片数量:', uploadedImages.length);
        if (uploadedImages.length === 0 && dish.images.length > 0) {
          hideLoading();
          showError('图片上传失败，请重试');
          return;
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
        await DishService.updateDish(saveDish);
        hideLoading();
        showSuccess('菜品更新成功');
      } else {
        await DishService.addDish(saveDish);
        hideLoading();
        showSuccess('菜品添加成功');
      }

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (error) {
      hideLoading();
      console.error(this.data.isEdit ? '更新菜品失败:' : '添加菜品失败:', error);
      showToast(this.data.isEdit ? '更新菜品失败' : '添加菜品失败');
    }
  }
}); 