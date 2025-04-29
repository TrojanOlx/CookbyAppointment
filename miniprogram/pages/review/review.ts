import { AppointmentService } from '../../services/appointmentService';
import { Review } from '../../models/appointment';
import { Dish } from '../../models/dish';
import { showToast, showLoading, hideLoading, showConfirm, formatTime } from '../../utils/util';
import { FileService } from '../../services/fileService';

// 定义菜品评价状态接口
interface DishWithReviewStatus extends Omit<Dish, 'images'> {
  reviewed: boolean;
  rating?: number;
  content?: string;
  images?: string[];
  createTimeFormat?: string;
}

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
      
      this.setData({
        date: appointment.date,
        mealType: appointment.mealType,
        dishes: dishesWithReviewStatus
      });
      
      hideLoading();
    } catch (error) {
      hideLoading();
      console.error('加载失败:', error);
      showToast('加载失败，请重试');
    }
  },

  // 选择菜品
  selectDish(e: any) {
    const index = parseInt(e.currentTarget.dataset.index);
    
    // 如果点击的是当前已选中的菜品，则取消选中
    if (this.data.currentDishIndex === index) {
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
        
        // 上传图片
        this.uploadImages(tempFilePaths);
      }
    });
  },

  // 上传图片
  async uploadImages(tempFilePaths: string[]) {
    showLoading('上传图片中');
    
    try {
      const uploadedImages = [...this.data.images];
      
      for (const filePath of tempFilePaths) {
        // 上传图片
        const result = await FileService.uploadFile(filePath);
        
        if (result && result.success && result.data && result.data.url) {
          uploadedImages.push(result.data.url);
        }
      }
      
      this.setData({
        images: uploadedImages
      });
      
      hideLoading();
    } catch (error) {
      hideLoading();
      console.error('上传图片失败:', error);
      showToast('上传图片失败，请重试');
    }
  },

  // 删除图片
  deleteImage(e: any) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    
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
    
    // 构建评价数据
    const reviewData: Partial<Review> = {
      appointmentId: this.data.appointmentId,
      dishId: this.data.dishes[currentDishIndex].id,
      rating: this.data.rating,
      content: this.data.content,
      images: this.data.images
    };
    
    try {
      this.setData({ isSubmitting: true });
      showLoading('提交评价中');
      
      // 调用API提交评价
      await AppointmentService.addReview(reviewData);
      
      hideLoading();
      this.setData({ isSubmitting: false });
      showToast('评价成功');
      
      // 更新菜品评价状态
      const dishes = [...this.data.dishes];
      dishes[currentDishIndex].reviewed = true;
      dishes[currentDishIndex].rating = this.data.rating;
      dishes[currentDishIndex].content = this.data.content;
      dishes[currentDishIndex].images = [...this.data.images];
      dishes[currentDishIndex].createTimeFormat = formatTime(new Date());
      
      this.setData({
        dishes,
        rating: 0,
        content: '',
        images: []
      });
    } catch (error) {
      hideLoading();
      this.setData({ isSubmitting: false });
      console.error('提交评价失败:', error);
      showToast('提交评价失败，请重试');
    }
  }
}); 