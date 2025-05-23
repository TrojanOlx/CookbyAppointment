# 家庭菜单预约小程序

## 项目介绍
这是一个家庭菜单预约小程序，用于记录每天早中晚餐的菜单，并且记录每一餐所需的食材和做法。用户可以创建、修改、删除和查询菜品，进行日历预约，并管理冰箱库存。

## 功能模块

### 1. 菜单模块
- **增加菜品**：添加新菜品，包括菜品类型、辣度、名称、图片、所需原料、制作过程等信息
- **修改菜品**：编辑已有菜品的信息
- **删除菜品**：删除不需要的菜品
- **菜品列表查询**：按类型分类查看菜品，点击查看菜品详情

### 2. 预约模块
- **日历选择日期**：在日历上选择要预约的日期
- **选择餐次**：选择早餐、中餐或晚餐
- **多选菜品**：从已保存的菜单中多选菜品
- **保存预约**：保存预约信息，日历上已预约日期会变色
- **修改菜品**：修改已预约的菜品

### 3. 冰箱库存模块
- **食材增加**：添加食材，包括名称、重量/数量、放入日期、保质期等信息
- **食材修改**：编辑已有食材的信息
- **删除食材**：删除不需要的食材
- **食材查询**：按名称查询食材

## 使用说明
1. 首先创建自己喜欢的菜品，包含详细的制作方法和所需材料
2. 在日历中选择日期和餐次，选择要预约的菜品
3. 管理冰箱库存，及时更新食材状态

## 技术实现
- 采用微信小程序原生框架开发
- 使用组件化开发提高代码复用性
- 本地存储管理菜品和预约数据
- TypeScript提高代码质量和可维护性

## 数据结构设计

### 菜品 (Dish)
```typescript
{
  id: string;           // 唯一ID
  name: string;         // 菜品名称
  type: DishType;       // 菜品类型（炒菜、青菜、炖汤）
  spicy: SpicyLevel;    // 辣度（微辣、中辣、特辣、不辣）
  images: string[];     // 图片数组
  ingredients: Ingredient[]; // 所需原料
  steps: string[];      // 制作步骤
  notice: string;       // 注意事项
  remark: string;       // 备注
  reference: string;    // 参考链接
  createTime: number;   // 创建时间
}
```

### 预约 (Appointment)
```typescript
{
  id: string;           // 唯一ID
  date: string;         // 日期，格式：YYYY-MM-DD
  mealType: MealType;   // 餐次（早餐、午餐、晚餐）
  dishes: string[];     // 菜品ID数组
  createTime: number;   // 创建时间
}
```

### 库存 (InventoryItem)
```typescript
{
  id: string;           // 唯一ID
  name: string;         // 食材名称
  amount: string;       // 重量/数量
  putInDate: string;    // 放入日期，格式：YYYY-MM-DD
  expiryDate: string;   // 保质期，格式：YYYY-MM-DD
  createTime: number;   // 创建时间
}
```

## 项目进度
- [x] 菜单模块的增删改查功能
- [x] 预约模块的日历和预约功能
- [x] 冰箱库存模块的食材管理功能
- [x] 首页功能导航
- [ ] 数据导出/备份功能
- [ ] 菜品推荐功能
- [ ] 多用户支持

## 未来扩展方向
1. **菜谱分享功能**：允许用户分享自己创建的菜谱到社区或朋友圈
2. **智能推荐**：根据用户的历史预约记录和偏好，推荐新的菜品
3. **食材购物清单**：根据预约菜品自动生成购物清单
4. **食材营养分析**：分析菜品的营养成分和卡路里
5. **多设备同步**：通过云开发实现多设备数据同步

## 开发环境
- 微信开发者工具 V1.06.2306222
- TypeScript 4.7.4
- 小程序基础库 V2.30.2 

## 全局登录拦截功能

本应用实现了全局登录拦截功能，可以控制需要登录才能访问的页面，未登录用户将被重定向到登录页面。

### 实现的主要功能

1. 定义了需要登录才能访问的页面列表
2. 重写了微信小程序的导航方法（`wx.navigateTo`、`wx.redirectTo`、`wx.switchTab`、`wx.reLaunch`）进行拦截判断
3. 对于未登录用户访问受限页面，会先保存原始要跳转的路径，然后重定向到登录页
4. 用户成功登录后，会自动跳转回原来想要访问的页面

### 需要登录才能访问的页面

- 菜单相关: `pages/menu/menu`, `pages/menu/add/add`, `pages/menu/detail/detail`
- 预约相关: `pages/appointment/appointment`, `pages/appointment/select/select`, `pages/appointment/listtest`
- 库存相关: `pages/inventory/inventory`, `pages/inventory/add/add`
- 个人中心相关: 
  - 用户: `pages/profile/appointments/appointments`, `pages/profile/reviews/reviews`, `pages/profile/settings/settings`
  - 管理员: `pages/profile/admin/appointments`, `pages/profile/admin/reviews`, `pages/profile/admin/statistics` 等

### 使用方法

系统已自动实现全局拦截，无需在每个页面中单独编写拦截代码。如需修改需要登录的页面列表，请编辑 `app.ts` 文件中的 `needLoginPages` 数组。 