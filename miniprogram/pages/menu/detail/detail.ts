import { Dish, DishType, SpicyLevel } from '../../../models/dish';
import { FileInfo } from '../../../models/file';
import { DishService } from '../../../services/dishService';
import { showSuccess, showConfirm, showLoading, hideLoading, showToast } from '../../../utils/util';
import { UserService } from '../../../services/userService';
import { FileService } from '../../../services/fileService';
import { SessionCacheService } from '../../../utils/sessionCache';
import { createUploadFileName } from './uploadFileName';
import { createDishFavoriteContent, createDishShareContent } from '../../../utils/share';
const { getFamilyRoleContext } = require('../../../services/familyRole');
const { FamilyService } = require('../../../services/family');

let detailRequestId = 0;
let detailRoleRequestId = 0;
let detailInitRequestId = 0;

const currentDetailScope = () => `${String(wx.getStorageSync('token') || '')}|${String(FamilyService.getActiveFamilyId() || '')}`;

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
    isSaving: false,
    isAdmin: false, // 是否为管理员
    familyRole: '',
    isEdit: false,  // 是否处于编辑状态
    tempDish: {} as Dish, // 存储编辑时的临时数据
    failedDishImages: {} as Record<string, boolean>,
    failedEditImages: {} as Record<string, boolean>,
    dishTypes: Object.values(DishType),
    spicyLevels: Object.values(SpicyLevel)
  },

  detailScope: '',
  detailInitializing: false,
  detailReady: false,
  navigateBackTimer: null as ReturnType<typeof setTimeout> | null,

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.setSafeArea();
    const dishId = String(options.id || '').trim();
    let sharedFamilyId = String(options.familyId || '').trim();
    try {
      sharedFamilyId = decodeURIComponent(sharedFamilyId);
    } catch {
      // Keep the original value; the membership check remains authoritative.
    }

    if (!dishId) {
      showToast('菜品信息不完整');
      return;
    }

    const needsSharedFamily = sharedFamilyId
      && sharedFamilyId !== String(FamilyService.getActiveFamilyId() || '');
    if (needsSharedFamily) {
      this.detailInitializing = true;
      void this.initializeSharedDetail(dishId, sharedFamilyId).finally(() => {
        this.detailInitializing = false;
      });
      return;
    }

    this.detailScope = currentDetailScope();
    this.detailReady = true;
    this.setData({ dishId });
    void this.loadDish();
    if (wx.getStorageSync('token')) {
      void this.checkAdminStatus();
    } else {
      this.setData({ isAdmin: false });
    }
  },

  async initializeSharedDetail(dishId: string, sharedFamilyId: string) {
    const requestId = ++detailInitRequestId;
    this.setData({ dishId });
    const redirectUrl = `/pages/menu/detail/detail?id=${encodeURIComponent(dishId)}`
      + `&familyId=${encodeURIComponent(sharedFamilyId)}`;

    if (!wx.getStorageSync('token')) {
      wx.setStorageSync('redirectUrl', redirectUrl);
      showToast('登录后即可查看家庭菜谱');
      this.navigateBackTimer = setTimeout(() => {
        this.navigateBackTimer = null;
        if (requestId === detailInitRequestId) wx.switchTab({ url: '/pages/profile/profile' });
      }, 500);
      return;
    }

    try {
      const families = await FamilyService.list();
      if (requestId !== detailInitRequestId) return;
      const canAccessFamily = families.some((family: { id?: string }) => String(family.id || '') === sharedFamilyId);
      if (!canAccessFamily) {
        showToast('该菜谱仅家庭成员可查看');
        this.navigateBackTimer = setTimeout(() => {
          this.navigateBackTimer = null;
          if (requestId === detailInitRequestId) wx.switchTab({ url: '/pages/index/index' });
        }, 800);
        return;
      }
      FamilyService.setActiveFamilyId(sharedFamilyId);
    } catch (error) {
      if (requestId !== detailInitRequestId) return;
      console.error('确认分享菜谱的家庭权限失败:', error);
      showToast('暂时无法打开分享菜谱');
      this.navigateBackTimer = setTimeout(() => {
        this.navigateBackTimer = null;
        if (requestId === detailInitRequestId) wx.switchTab({ url: '/pages/index/index' });
      }, 800);
      return;
    }

    if (requestId !== detailInitRequestId) return;
    this.detailScope = currentDetailScope();
    this.detailReady = true;
    void this.loadDish();
    void this.checkAdminStatus();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (this.detailInitializing || !this.detailReady) return;
    const scope = currentDetailScope();
    const scopeChanged = scope !== this.detailScope;
    if (scopeChanged) {
      this.detailScope = scope;
      // Never leave the previous family's dish visible while the new scope
      // is being fetched.
      detailRequestId += 1;
      this.setData({ dish: {} as Dish, loading: false });
    }

    // onLoad already starts the first request. Only revalidate when returning
    // from a mutation or when the active account/family changed.
    if (this.data.dishId && !this.data.isEdit && (scopeChanged || SessionCacheService.isDirty('dish'))) {
      this.loadDish();
    }
    if (scopeChanged) {
      if (wx.getStorageSync('token')) {
        this.checkAdminStatus();
      } else {
        this.setData({ isAdmin: false, familyRole: '' });
      }
    }
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    const requestId = ++detailRoleRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const scope = currentDetailScope();
    if (!wx.getStorageSync('token')) {
      this.setData({ isAdmin: false, familyRole: '' });
      return;
    }

    let legacyAdmin = false;
    try {
      const result = await UserService.checkAdmin();
      legacyAdmin = !!result.isAdmin;
    } catch (error) {
      console.warn('检查旧版管理员状态失败:', error);
    }

    const context = await getFamilyRoleContext();
    if (
      requestId !== detailRoleRequestId
      || token !== String(wx.getStorageSync('token') || '')
      || scope !== currentDetailScope()
    ) return;
    this.setData({
      isAdmin: legacyAdmin || context.canManageMenu,
      familyRole: context.role
    });
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

    const requestId = ++detailRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const scope = currentDetailScope();
    const hasExistingDish = Boolean(this.data.dish && this.data.dish.id);
    const isCurrentRequest = () => requestId === detailRequestId
      && token === String(wx.getStorageSync('token') || '')
      && scope === currentDetailScope();

    this.setData({ loading: true });
    if (!hasExistingDish) showLoading('加载中');
    
    try {
      const dish = await DishService.getDishDetail(this.data.dishId);
      if (!isCurrentRequest()) return;
      this.setData({ dish, failedDishImages: {} });
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('获取菜品详情失败:', error);
      showToast('获取菜品详情失败');
      if (!hasExistingDish) {
        if (this.navigateBackTimer) clearTimeout(this.navigateBackTimer);
        this.navigateBackTimer = setTimeout(() => {
          this.navigateBackTimer = null;
          if (isCurrentRequest()) wx.navigateBack();
        }, 1500);
      }
    } finally {
      if (isCurrentRequest()) {
        if (!hasExistingDish) hideLoading();
        this.setData({ loading: false });
      }
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
      tempDish,
      failedEditImages: {}
    });
  },

  onDishImageError(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.imageIndex);
    const images = this.data.isEdit ? this.data.tempDish.images : this.data.dish.images;
    if (!Number.isInteger(index) || !Array.isArray(images) || index < 0 || index >= images.length) return;
    const key = this.data.isEdit ? `failedEditImages[${index}]` : `failedDishImages[${index}]`;
    const failures = this.data.isEdit ? this.data.failedEditImages : this.data.failedDishImages;
    if (failures[String(index)]) return;
    this.setData({ [key]: true });
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
    if (this.data.isSaving) return;

    const originalDish = this.data.dish;
    const tempDish = JSON.parse(JSON.stringify(this.data.tempDish)) as Dish;
    const initialEditSignature = JSON.stringify(this.data.tempDish);
    const newlyUploadedFiles: FileInfo[] = [];
    let uploadFailureCount = 0;

    try {
      // 基本数据校验
      if (!tempDish.name) {
        showToast('菜品名称不能为空');
        return;
      }

      if (!tempDish.ingredients.length) {
        showToast('请至少添加一种食材');
        return;
      }

      if (!tempDish.steps.length) {
        showToast('请至少添加一个步骤');
        return;
      }

      this.setData({ isSaving: true });
      showLoading('保存中');
      
      // 处理图片上传
      let uploadedImages = [...tempDish.images];
      const newImages = tempDish.images.filter(img => img.startsWith('wxfile://') || img.startsWith('http://tmp/') || img.startsWith('tmp_'));
      
      if (newImages.length > 0) {
        try {
          // 处理并上传新图片
          showLoading('上传图片中...');
          const uploadPromises = newImages.map(async (tempFilePath, index) => {
            try {
              const newFileName = createUploadFileName(
                tempDish.id || this.data.dishId,
                index,
                tempFilePath
              );
              
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
            uploadFailureCount = Math.max(uploadFailureCount, newImages.length - successfulUploads.length);
            console.warn(`部分图片上传失败，成功: ${successfulUploads.length}/${newImages.length}`);
            showToast(`成功上传${successfulUploads.length}张，${newImages.length - successfulUploads.length}张失败`);
          }
        } catch (error) {
          console.error('处理图片时出错:', error);
          void FileService.cleanupUploadedFiles(newlyUploadedFiles);
          hideLoading();
          this.setData({ isSaving: false });
          showToast('图片处理失败，请重试');
          return;
        }
      }
      
      tempDish.images = uploadedImages;

      // 只发送本次编辑实际修改的字段，避免旧详情覆盖服务端并发更新的字段。
      const dishUpdate: Partial<Dish> = { id: tempDish.id || this.data.dishId };
      if (tempDish.name !== originalDish.name) dishUpdate.name = tempDish.name;
      if (tempDish.type !== originalDish.type) dishUpdate.type = tempDish.type;
      if (tempDish.spicy !== originalDish.spicy) dishUpdate.spicy = tempDish.spicy;
      if (JSON.stringify(tempDish.images) !== JSON.stringify(originalDish.images)) dishUpdate.images = tempDish.images;
      if (JSON.stringify(tempDish.ingredients) !== JSON.stringify(originalDish.ingredients)) dishUpdate.ingredients = tempDish.ingredients;
      if (JSON.stringify(tempDish.steps) !== JSON.stringify(originalDish.steps)) dishUpdate.steps = tempDish.steps;
      if (tempDish.notice !== originalDish.notice) dishUpdate.notice = tempDish.notice;
      if (tempDish.remark !== originalDish.remark) dishUpdate.remark = tempDish.remark;
      if (tempDish.reference !== originalDish.reference) dishUpdate.reference = tempDish.reference;

      const updatedDish = await DishService.updateDish(dishUpdate);
      
      hideLoading();
      showSuccess('保存成功');
      
      // 如果保存期间用户又输入了内容，保留这些未保存的输入，避免旧响应覆盖新输入。
      if (JSON.stringify(this.data.tempDish) === initialEditSignature) {
        this.setData({
          isEdit: false,
          isSaving: false,
          dish: updatedDish,
          tempDish: {} as Dish
        });
      } else {
        this.setData({ isSaving: false });
      }
    } catch (error) {
      void FileService.cleanupUploadedFiles(newlyUploadedFiles);
      hideLoading();
      this.setData({ isSaving: false });
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
        void FileService.preflightImages(res.tempFilePaths).then(({ valid, failures }) => {
          if (failures.length) {
            showToast(`已跳过${failures.length}张不符合要求的图片`);
          }
          if (!valid.length) return;
          this.setData({
            'tempDish.images': this.data.tempDish.images.concat(valid)
          });
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
    if (ingredients.length >= 50) {
      showToast('食材最多添加50项');
      return;
    }
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
    if (steps.length >= 30) {
      showToast('步骤最多添加30项');
      return;
    }
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
          if (this.navigateBackTimer) clearTimeout(this.navigateBackTimer);
          this.navigateBackTimer = setTimeout(() => {
            this.navigateBackTimer = null;
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
  },

  onUnload() {
    detailInitRequestId += 1;
    detailRequestId += 1;
    detailRoleRequestId += 1;
    if (this.navigateBackTimer) {
      clearTimeout(this.navigateBackTimer);
      this.navigateBackTimer = null;
    }
  },

  onShareAppMessage() {
    return createDishShareContent(this.data.dish, String(FamilyService.getActiveFamilyId() || ''));
  },

  onAddToFavorites() {
    const dish = this.data.dish && this.data.dish.id
      ? this.data.dish
      : { id: this.data.dishId, name: '家庭菜谱', images: [] };
    return createDishFavoriteContent(dish, String(FamilyService.getActiveFamilyId() || ''));
  }
})
