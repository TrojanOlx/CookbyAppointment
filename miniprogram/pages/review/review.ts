import { AppointmentService } from '../../services/appointmentService';
import { Review } from '../../models/appointment';
import { Dish } from '../../models/dish';
import { FileInfo } from '../../models/file';
import { showToast, showLoading, hideLoading, formatTime } from '../../utils/util';
import { FileService } from '../../services/fileService';
import { ImageCacheService } from '../../utils/imageCache';
const { FamilyService } = require('../../services/family');

// 定义菜品评价状态接口
interface DishWithReviewStatus extends Omit<Dish, 'images'> {
  reviewed: boolean;
  rating?: number;
  content?: string;
  images?: string[];
  createTimeFormat?: string;
  cachedImage?: string;
}

let reviewImageUploadRequestId = 0;
let reviewDetailsRequestId = 0;

Page({
  data: {
    appointmentId: '',
    date: '',
    mealType: '',
    dishes: [] as DishWithReviewStatus[],
    currentDishIndex: null as number | null,
    rating: 0,
    content: '',
    images: [] as string[],
    isSubmitting: false
  },

  pendingReviewFiles: [] as FileInfo[],

  cleanupPendingReviewFiles() {
    const files = this.pendingReviewFiles;
    this.pendingReviewFiles = [];
    if (files.length) void FileService.cleanupUploadedFiles(files);
  },

  // 生命周期：页面加载
  onLoad(options: any) {
    if (options.appointmentId) {
      this.setData({
        appointmentId: options.appointmentId
      });
      this.loadAppointmentDetails(options.appointmentId);
    } else {
      showToast('参数错误，缺少预约ID');
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载预约详情
  async loadAppointmentDetails(appointmentId: string) {
    const requestId = ++reviewDetailsRequestId;
    const token = String(wx.getStorageSync('token') || '');
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    const isCurrentRequest = () => requestId === reviewDetailsRequestId
      && token === String(wx.getStorageSync('token') || '')
      && familyId === String(FamilyService.getActiveFamilyId() || '')
      && appointmentId === this.data.appointmentId;
    try {
      showLoading('加载数据中');

      // 获取预约详情
      const appointment = await AppointmentService.getAppointmentDetail(appointmentId);

      if (!appointment) {
        throw new Error('获取预约详情失败');
      }

      // 获取预约关联的菜品
      const dishes = appointment.dishes as Dish[];

      // 获取预约的评价列表
      const reviews = await AppointmentService.getAppointmentReviews(appointmentId);

      // 处理菜品和评价数据
      const dishesWithReviewStatus: DishWithReviewStatus[] = dishes.map(dish => {
        // 查找对应的评价
        const review = reviews.find((r: any) => r.dishId === dish.id);

        // 添加评价状态
        if (review) {
          // 过滤掉无效的图片URL
          let filteredImages = review.images || [];
          if (Array.isArray(filteredImages)) {
            filteredImages = filteredImages.filter(img =>
              typeof img === 'string' && img.trim() !== '' && !img.includes('[')
            );
          } else {
            filteredImages = [];
          }

          return {
            ...dish,
            reviewed: true,
            rating: review.rating,
            content: review.content,
            images: filteredImages,
            createTimeFormat: formatTime(new Date(review.createTime))
          };
        } else {
          return {
            ...dish,
            reviewed: false
          };
        }
      });

      if (!isCurrentRequest()) return;

      this.setData({
        date: appointment.date,
        mealType: appointment.mealType,
        dishes: dishesWithReviewStatus.map(item => ({
          ...item,
          cachedImage: item.images && item.images.length > 0
            ? item.images[0]
            : '/images/default-dish.jpg'
        }))
      });

      void ImageCacheService.withCachedImages(
        dishesWithReviewStatus,
        item => item.images && item.images.length > 0 ? item.images[0] : undefined,
        'cachedImage',
        {
          onResolved: (updates) => {
            if (!isCurrentRequest()) return;
            updates.forEach(update => {
              const source = dishesWithReviewStatus[update.index];
              if (!source) return;
              const currentIndex = (this.data.dishes as DishWithReviewStatus[]).findIndex(
                dish => String(dish.id) === String(source.id)
              );
              if (currentIndex < 0) return;
              this.setData({ [`dishes[${currentIndex}].${update.field}`]: update.value });
            });
          }
        }
      );

    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error('加载失败:', error);
      showToast('加载失败，请重试');
    } finally {
      if (isCurrentRequest()) hideLoading();
    }
  },

  onUnload() {
    reviewDetailsRequestId += 1;
    reviewImageUploadRequestId += 1;
    this.cleanupPendingReviewFiles();
    hideLoading();
  },

  onDishImageError(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    const fallbackIndex = Number(e.currentTarget.dataset.index);
    const dishes = this.data.dishes as DishWithReviewStatus[];
    const index = id
      ? dishes.findIndex(dish => String(dish.id) === id)
      : fallbackIndex;
    if (index < 0 || index >= dishes.length) return;
    if (dishes[index].cachedImage === '/images/default-dish.jpg') return;
    this.setData({ [`dishes[${index}].cachedImage`]: '/images/default-dish.jpg' });
  },

  onReviewImageError(e: WechatMiniprogram.TouchEvent) {
    const dishId = String(e.currentTarget.dataset.dishId || '');
    const dishIndex = Number(e.currentTarget.dataset.dishIndex);
    const imageIndex = Number(e.currentTarget.dataset.index);
    const dishes = this.data.dishes as DishWithReviewStatus[];
    const index = dishId
      ? dishes.findIndex(dish => String(dish.id) === dishId)
      : dishIndex;
    if (index < 0 || index >= dishes.length || imageIndex < 0) return;
    const images = Array.isArray(dishes[index].images) ? [...dishes[index].images!] : [];
    if (imageIndex >= images.length || images[imageIndex] === '/images/default-dish.jpg') return;
    images[imageIndex] = '/images/default-dish.jpg';
    this.setData({ [`dishes[${index}].images`]: images });
  },

  onUploadedImageError(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const images = [...this.data.images];
    if (index < 0 || index >= images.length || images[index] === '/images/default-dish.jpg') return;
    images[index] = '/images/default-dish.jpg';
    this.setData({ images });
  },

  // 选择菜品
  selectDish(e: any) {
    const index = parseInt(e.currentTarget.dataset.index);

    // 如果点击的是当前已选中的菜品，则取消选中
    if (this.data.currentDishIndex === index) {
      this.cleanupPendingReviewFiles();
      this.setData({
        currentDishIndex: null,
        rating: 0,
        content: '',
        images: []
      });
    } else {
      // 如果菜品已评价，显示评价详情
      if (this.data.dishes[index].reviewed) {
        this.setData({
          currentDishIndex: index
        });
      } else {
        // 如果菜品未评价，清空评价表单
        this.cleanupPendingReviewFiles();
        this.setData({
          currentDishIndex: index,
          rating: 0,
          content: '',
          images: []
        });
      }
    }
  },

  // 评分变化事件
  onRatingChange(e: any) {
    this.setData({
      rating: e.detail.value
    });
  },

  // 评价内容输入事件
  onContentInput(e: any) {
    this.setData({
      content: e.detail.value
    });
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: (res) => {
        const tempFiles = res.tempFiles;
        const tempFilePaths = tempFiles.map(file => file.tempFilePath);

        void FileService.preflightImages(tempFilePaths).then(({ valid, failures }) => {
          if (failures.length) {
            showToast(`已跳过${failures.length}张不符合要求的图片`);
          }
          if (valid.length) void this.uploadImages(valid);
        });
      }
    });
  },

  // 上传图片
  async uploadImages(tempFilePaths: string[]) {
    const requestId = ++reviewImageUploadRequestId;
    const dishIndex = this.data.currentDishIndex;
    showLoading('上传图片中');

    try {
      const uploadResult = await FileService.uploadFiles(tempFilePaths, 'reviews');
      const uploadedImages = [...this.data.images, ...uploadResult.files.map(file => file.url || file.filePath)];
      if (uploadResult.failures.length) {
        showToast(`成功上传${uploadResult.files.length}张，${uploadResult.failures.length}张失败`);
      }

      if (requestId !== reviewImageUploadRequestId || this.data.currentDishIndex !== dishIndex) {
        void FileService.cleanupUploadedFiles(uploadResult.files);
        return;
      }
      this.pendingReviewFiles.push(...uploadResult.files);
      this.setData({
        images: uploadedImages
      });
    } catch (error) {
      if (requestId !== reviewImageUploadRequestId || this.data.currentDishIndex !== dishIndex) return;
      console.error('上传图片失败:', error);
      showToast('上传图片失败，请重试');
    } finally {
      if (requestId === reviewImageUploadRequestId) hideLoading();
    }
  },

  // 删除图片
  deleteImage(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    const images = [...this.data.images];
    if (!Number.isInteger(index) || index < 0 || index >= images.length) return;
    const removedImage = images[index];
    images.splice(index, 1);

    // 只有本次评价刚上传且尚未提交的文件可以立即删除，已存在的评价图片不触碰。
    const fileKey = (value: string): string => {
      const match = String(value || '').match(/[?&]id=([^&#]+)/i);
      return match ? decodeURIComponent(match[1]) : String(value || '');
    };
    const removedKey = fileKey(removedImage);
    const removedPending = this.pendingReviewFiles.filter(file =>
      fileKey(file.url) === removedKey || fileKey(file.filePath) === removedKey
    );
    if (removedPending.length) {
      this.pendingReviewFiles = this.pendingReviewFiles.filter(file => !removedPending.includes(file));
      void FileService.cleanupUploadedFiles(removedPending);
    }

    this.setData({
      images
    });
  },

  // 预览图片
  previewImage(e: any) {
    const url = e.currentTarget.dataset.url;
    const currentDishIndex = this.data.currentDishIndex as number;
    const images = this.data.dishes[currentDishIndex].images || [];

    // 确保所有图片URL格式正确
    const validImages = images.filter(img => typeof img === 'string' && img.trim() !== '' && !img.includes('['));

    if (validImages.length === 0) {
      showToast('暂无可预览的图片');
      return;
    }

    wx.previewImage({
      current: url,
      urls: validImages
    });
  },

  // 提交评价
  async submitReview() {
    if (this.data.isSubmitting) return;

    if (!this.data.rating) {
      showToast('请先评分');
      return;
    }

    const currentDishIndex = this.data.currentDishIndex;
    if (currentDishIndex === null) {
      showToast('请选择要评价的菜品');
      return;
    }

    const reviewSnapshot = {
      rating: this.data.rating,
      content: this.data.content,
      images: [...this.data.images]
    };

    // 构建评价数据
    const reviewData: Partial<Review> = {
      appointmentId: this.data.appointmentId,
      dishId: this.data.dishes[currentDishIndex].id,
      rating: reviewSnapshot.rating,
      content: reviewSnapshot.content,
      images: reviewSnapshot.images
    };

    try {
      this.setData({ isSubmitting: true });
      showLoading('提交评价中');

      // 调用API提交评价
      await AppointmentService.addReview(reviewData);

      this.pendingReviewFiles = [];

      hideLoading();
      this.setData({ isSubmitting: false });
      showToast('评价成功');

      // 更新菜品评价状态
      const dishes = [...this.data.dishes];
      dishes[currentDishIndex].reviewed = true;
      dishes[currentDishIndex].rating = reviewSnapshot.rating;
      dishes[currentDishIndex].content = reviewSnapshot.content;
      dishes[currentDishIndex].images = [...reviewSnapshot.images];
      dishes[currentDishIndex].createTimeFormat = formatTime(new Date());

      const formChanged = this.data.currentDishIndex !== currentDishIndex
        || this.data.rating !== reviewSnapshot.rating
        || this.data.content !== reviewSnapshot.content
        || JSON.stringify(this.data.images) !== JSON.stringify(reviewSnapshot.images);
      this.setData(formChanged
        ? { dishes }
        : { dishes, rating: 0, content: '', images: [] });
    } catch (error) {
      this.cleanupPendingReviewFiles();
      this.setData({ images: [] });
      hideLoading();
      this.setData({ isSubmitting: false });
      console.error('提交评价失败:', error);
      showToast('提交评价失败，请重试');
    }
  }
});
