const { AppointmentService } = require('../../../services/appointmentService');
const { DishService } = require('../../../services/dishService');
const { FamilyService } = require('../../../services/family');
const http = require('../../../services/http');

const MEAL_TYPES = ['早餐', '午餐', '晚餐'];

let bookingLoadRequestId = 0;
let bookingPreviewRequestId = 0;

const todayString = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const asId = value => {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
};

const uniqueIds = values => Array.from(new Set((values || []).map(asId).filter(Boolean)));

const selectionMap = values => (values || []).reduce((map, value) => {
  map[asId(value)] = true;
  return map;
}, {});

const normalizeDish = raw => {
  const dish = raw || {};
  const id = asId(dish.id || dish.dishId);
  const images = Array.isArray(dish.images)
    ? dish.images
    : (typeof dish.images === 'string' && dish.images ? [dish.images] : []);
  return {
    ...dish,
    id,
    images,
    name: String(dish.name || '未命名菜品'),
    type: String(dish.type || '其他'),
    spicy: String(dish.spicy || '不辣')
  };
};

const normalizeMember = raw => {
  const member = raw || {};
  const userId = asId(member.userId || member.user_id || member.id);
  const nickName = String(member.nickName || member.nickname || member.name || '家庭成员');
  return {
    ...member,
    userId,
    nickName,
    initial: nickName.slice(0, 1),
    avatarUrl: String(member.avatarUrl || member.avatar_url || '')
  };
};

const extractDishList = result => {
  if (Array.isArray(result)) return result;
  return result && Array.isArray(result.list) ? result.list : [];
};

const extractDinerIds = diners => (Array.isArray(diners) ? diners : [])
  .map(item => (item && typeof item === 'object' ? item.userId || item.id : item))
  .map(asId)
  .filter(Boolean);

const extractDishIds = appointment => {
  if (!appointment) return [];
  const values = Array.isArray(appointment.dishes)
    ? appointment.dishes
    : (Array.isArray(appointment.dishIds) ? appointment.dishIds : []);
  return uniqueIds(values.map(item => (item && typeof item === 'object' ? item.id || item.dishId : item)));
};

const extractDishTypes = dishes => Array.from(new Set(
  (dishes || [])
    .map(item => String(item && item.type || '').trim())
    .filter(Boolean)
));

Page({
  data: {
    familyId: '',
    date: '',
    mealTypes: MEAL_TYPES,
    selectedMealType: '午餐',
    editMode: false,
    appointmentId: '',
    appointmentUpdateTime: null,
    members: [],
    selectedDinerIds: [],
    selectedDinerMap: {},
    dishes: [],
    filteredDishes: [],
    dishTypes: [],
    selectedDishType: '',
    selectedDishIds: [],
    selectedDishMap: {},
    searchKeyword: '',
    remarks: '',
    loading: true,
    loadingMembers: true,
    loadingDishes: true,
    preview: null,
    warnings: [],
    previewReady: false,
    previewSignature: '',
    previewError: '',
    isPreviewing: false,
    confirmed: false,
    saving: false,
    loadError: ''
  },

  onLoad(options = {}) {
    const appointmentId = asId(options.id);
    const date = String(options.date || todayString());
    this.setData({
      date,
      appointmentId,
      familyId: String(FamilyService.getActiveFamilyId() || ''),
      editMode: !!appointmentId,
      selectedMealType: '午餐',
      loading: true
    });
    wx.setNavigationBarTitle({ title: appointmentId ? '编辑预约' : '创建预约' });
    return this.loadBookingData(appointmentId);
  },

  onShow() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    if (familyId === this.data.familyId) return;
    bookingLoadRequestId += 1;
    bookingPreviewRequestId += 1;
    this.setData({
      familyId,
      members: [],
      dishes: [],
      filteredDishes: [],
      dishTypes: [],
      selectedDishType: '',
      selectedDinerIds: [],
      selectedDinerMap: {},
      selectedDishIds: [],
      selectedDishMap: {},
      appointmentUpdateTime: null,
      searchKeyword: '',
      loading: true,
      loadingMembers: true,
      loadingDishes: true,
      preview: null,
      warnings: [],
      previewReady: false,
      previewSignature: '',
      previewError: '',
      isPreviewing: false,
      confirmed: false,
      loadError: ''
    });
    this.loadBookingData(this.data.appointmentId);
  },

  async loadBookingData(appointmentId) {
    const requestId = ++bookingLoadRequestId;
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    try {
      const memberPromise = FamilyService.members();
      const dishPromise = DishService.getDishList(1, 100);
      const appointmentPromise = appointmentId
        ? AppointmentService.getAppointmentDetail(appointmentId)
        : Promise.resolve(null);
      const [memberResult, dishResult, appointment] = await Promise.all([
        memberPromise,
        dishPromise,
        appointmentPromise
      ]);
      if (requestId !== bookingLoadRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;

      const members = (Array.isArray(memberResult) ? memberResult : [])
        .map(normalizeMember)
        .filter(item => item.userId);
      let dishes = extractDishList(dishResult).map(normalizeDish).filter(item => item.id);
      const selectedDishIds = extractDishIds(appointment);

      // 编辑时把详情中已选但不在当前列表页的菜品补入，避免保存时意外丢失。
      if (appointment && Array.isArray(appointment.dishes)) {
        const selectedDishes = appointment.dishes
          .filter(item => item && typeof item === 'object')
          .map(normalizeDish)
          .filter(item => item.id);
        const known = new Set(dishes.map(item => item.id));
        dishes = dishes.concat(selectedDishes.filter(item => !known.has(item.id)));
      }

      const dinerSource = appointment && (Array.isArray(appointment.diners) ? appointment.diners : appointment.dinerIds);
      const appointmentDinerIds = extractDinerIds(dinerSource);
      const existingDinerIds = appointmentDinerIds.filter(id => members.some(member => member.userId === id));
      const selectedDinerIds = existingDinerIds.length ? existingDinerIds : members.map(member => member.userId);
      const mealType = appointment && MEAL_TYPES.indexOf(appointment.mealType) >= 0
        ? appointment.mealType
        : this.data.selectedMealType;
      const dishTypes = extractDishTypes(dishes);

      this.setData({
        date: appointment && appointment.date ? appointment.date : this.data.date,
        selectedMealType: mealType,
        remarks: String((appointment && (appointment.remarks || appointment.remark)) || ''),
        members,
        selectedDinerIds,
        selectedDinerMap: selectionMap(selectedDinerIds),
        dishes,
        filteredDishes: dishes,
        dishTypes,
        selectedDishType: '',
        searchKeyword: '',
        selectedDishIds,
        selectedDishMap: selectionMap(selectedDishIds),
        appointmentUpdateTime: appointment && Number.isFinite(Number(appointment.updateTime))
          ? Number(appointment.updateTime)
          : null,
        loading: false,
        loadingMembers: false,
        loadingDishes: false,
        loadError: members.length ? '' : '当前家庭还没有可选的用餐成员'
      });
    } catch (error) {
      if (requestId !== bookingLoadRequestId || familyId !== String(FamilyService.getActiveFamilyId() || '') || familyId !== this.data.familyId) return;
      console.error('加载预约编辑数据失败:', error);
      this.setData({
        loading: false,
        loadingMembers: false,
        loadingDishes: false,
        loadError: error && error.message ? error.message : '加载预约数据失败，请稍后重试'
      });
      wx.showToast({ title: this.data.loadError, icon: 'none' });
    }
  },

  hasCurrentFamilyContext() {
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    if (familyId && familyId === this.data.familyId) return true;
    wx.showToast({ title: '家庭已切换，请重新加载页面', icon: 'none' });
    return false;
  },

  onDateChange(event) {
    const date = event.detail && event.detail.value ? event.detail.value : this.data.date;
    this.setData({ date });
    this.invalidatePreview();
  },

  selectMealType(event) {
    const mealType = event.currentTarget.dataset.type;
    if (MEAL_TYPES.indexOf(mealType) < 0 || mealType === this.data.selectedMealType) return;
    this.setData({ selectedMealType: mealType });
    this.invalidatePreview();
  },

  onSearchInput(event) {
    const searchKeyword = event.detail.value || '';
    this.setData({ searchKeyword }, () => this.applyDishFilter());
  },

  selectDishType(event) {
    const selectedDishType = String(event.currentTarget.dataset.type || '');
    if (selectedDishType === this.data.selectedDishType) return;
    this.setData({ selectedDishType }, () => this.applyDishFilter());
  },

  applyDishFilter() {
    const keyword = String(this.data.searchKeyword || '').trim().toLowerCase();
    const selectedDishType = String(this.data.selectedDishType || '');
    const filteredDishes = this.data.dishes.filter(item => {
      if (selectedDishType && String(item.type || '').trim() !== selectedDishType) return false;
      if (!keyword) return true;
      const text = [item.name, item.type, item.spicy].join(' ').toLowerCase();
      return text.indexOf(keyword) >= 0;
    });
    this.setData({ filteredDishes });
  },

  toggleDish(event) {
    const dishId = asId(event.currentTarget.dataset.id);
    if (!dishId) return;
    const selected = this.data.selectedDishIds.indexOf(dishId) >= 0;
    const selectedDishIds = selected
      ? this.data.selectedDishIds.filter(id => id !== dishId)
      : this.data.selectedDishIds.concat(dishId);
    this.setData({ selectedDishIds, selectedDishMap: selectionMap(selectedDishIds) });
    this.invalidatePreview();
  },

  onMembersChange(event) {
    const selectedDinerIds = uniqueIds(event.detail && event.detail.value);
    this.setData({ selectedDinerIds, selectedDinerMap: selectionMap(selectedDinerIds) });
    this.invalidatePreview();
  },

  onRemarksInput(event) {
    this.setData({ remarks: event.detail.value || '' });
    this.invalidatePreview();
  },

  getPreviewSignature() {
    return [
      this.data.date,
      this.data.selectedMealType,
      this.data.selectedDishIds.slice().sort().join(','),
      this.data.selectedDinerIds.slice().sort().join(',')
    ].join('|');
  },

  invalidatePreview() {
    bookingPreviewRequestId += 1;
    this.setData({
      previewReady: false,
      previewSignature: '',
      preview: null,
      warnings: [],
      previewError: '',
      confirmed: false,
      isPreviewing: false
    });
  },

  async requestPreview() {
    if (!this.hasCurrentFamilyContext()) return null;
    if (this.data.isPreviewing) return null;
    const dishIds = this.data.selectedDishIds;
    const dinerIds = this.data.selectedDinerIds;
    if (!dishIds.length) {
      wx.showToast({ title: '请至少选择一道菜', icon: 'none' });
      return null;
    }
    if (!dinerIds.length) {
      wx.showToast({ title: '请至少选择一位用餐成员', icon: 'none' });
      return null;
    }

    const signature = this.getPreviewSignature();
    const familyId = String(FamilyService.getActiveFamilyId() || '');
    const requestId = ++bookingPreviewRequestId;
    const samePreview = this.data.previewReady && this.data.previewSignature === signature;
    this.setData({
      isPreviewing: true,
      previewError: '',
      confirmed: samePreview ? this.data.confirmed : false
    });
    const isCurrentRequest = () => requestId === bookingPreviewRequestId
      && familyId === String(FamilyService.getActiveFamilyId() || '')
      && familyId === this.data.familyId
      && signature === this.getPreviewSignature();
    try {
      const result = await http.request({
        url: '/api/appointment/preview',
        method: 'POST',
        data: { dishIds, dinerIds }
      });
      if (!isCurrentRequest()) return null;
      const warnings = Array.isArray(result && result.warnings) ? result.warnings : [];
      this.setData({
        preview: result || {},
        warnings,
        previewReady: true,
        previewSignature: signature
      });
      return result || {};
    } catch (error) {
      if (!isCurrentRequest()) return null;
      console.error('获取口味提醒失败:', error);
      this.setData({
        previewReady: false,
        previewSignature: '',
        previewError: error && error.message ? error.message : '暂时无法检查口味提醒'
      });
      wx.showToast({ title: this.data.previewError, icon: 'none' });
      return null;
    } finally {
      if (requestId === bookingPreviewRequestId) this.setData({ isPreviewing: false });
    }
  },

  async previewPreferences() {
    await this.requestPreview();
  },

  onConfirmChange(event) {
    const values = event.detail && Array.isArray(event.detail.value) ? event.detail.value : [];
    this.setData({ confirmed: values.indexOf('ack') >= 0 });
  },

  async saveBooking() {
    if (this.data.saving) return;
    if (!this.hasCurrentFamilyContext()) return;
    if (!this.data.selectedDishIds.length) {
      wx.showToast({ title: '请至少选择一道菜', icon: 'none' });
      return;
    }
    if (!this.data.selectedDinerIds.length) {
      wx.showToast({ title: '请至少选择一位用餐成员', icon: 'none' });
      return;
    }

    const signature = this.getPreviewSignature();
    let preview = this.data.preview;
    if (!this.data.previewReady || this.data.previewSignature !== signature) {
      preview = await this.requestPreview();
      if (!preview) return;
    }
    const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];
    if (!this.data.confirmed) {
      wx.showToast({
        title: warnings.length ? '请阅读提醒并勾选确认' : '请勾选确认预约内容',
        icon: 'none'
      });
      return;
    }

    const payload = {
      date: this.data.date,
      mealType: this.data.selectedMealType,
      dishIds: this.data.selectedDishIds,
      dinerIds: this.data.selectedDinerIds,
      remarks: this.data.remarks,
      warningsAcknowledged: true
    };
    if (this.data.editMode) {
      payload.id = this.data.appointmentId;
      if (Number.isFinite(this.data.appointmentUpdateTime)) {
        payload.expectedUpdateTime = this.data.appointmentUpdateTime;
      }
    }

    this.setData({ saving: true });
    wx.showLoading({ title: this.data.editMode ? '更新中...' : '创建中...', mask: true });
    try {
      if (this.data.editMode) await AppointmentService.updateAppointment(payload);
      else await AppointmentService.createAppointment(payload);
      wx.hideLoading();
      wx.showToast({ title: this.data.editMode ? '预约已更新' : '预约已创建', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.hideLoading();
      console.error('保存预约失败:', error);
      wx.showToast({ title: error && error.message ? error.message : '保存失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onDishImageError(event) {
    const index = Number(event.currentTarget.dataset.index);
    const dishId = String(event.currentTarget.dataset.id || '');
    const current = this.data.filteredDishes[index];
    if (!Number.isInteger(index) || !current || !dishId || String(current.id) !== dishId) return;
    const fallback = '/images/default-dish.png';
    this.setData({
      dishes: this.data.dishes.map(item => String(item.id) === dishId ? { ...item, cachedImage: fallback } : item),
      filteredDishes: this.data.filteredDishes.map(item => String(item.id) === dishId ? { ...item, cachedImage: fallback } : item)
    });
  },

  cancelBooking() {
    if (this.data.selectedDishIds.length || this.data.confirmed) {
      wx.showModal({
        title: '放弃预约？',
        content: '当前选择不会保存。',
        confirmText: '放弃',
        confirmColor: '#e05a5a',
        success: result => { if (result.confirm) wx.navigateBack(); }
      });
      return;
    }
    wx.navigateBack();
  }
});
