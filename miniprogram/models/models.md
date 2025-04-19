1. 用户表 (users)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 用户ID |
| openid | TEXT | NULL | 否 | 微信openid |
| nickName | TEXT | NULL | 否 | 用户昵称 |
| avatarUrl | TEXT | NULL | 否 | 头像URL |
| gender | INTEGER | 0 | 否 | 性别（0:未知, 1:男, 2:女） |
| country | TEXT | '' | 否 | 国家 |
| province | TEXT | '' | 否 | 省份 |
| city | TEXT | '' | 否 | 城市 |
| language | TEXT | 'zh_CN' | 否 | 语言 |
| phoneNumber | TEXT | NULL | 否 | 手机号码 |
| isAdmin | INTEGER | 0 | 否 | 是否管理员（0否1是） |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |
2. 登录信息表 (login_info)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | ID |
| openid | TEXT | NULL | 否 | 微信openid |
| session_key | TEXT | NULL | 否 | 会话密钥 |
| unionid | TEXT | NULL | 否 | 用户在开放平台的唯一标识符 |
| token | TEXT | NULL | 否 | 自定义登录态token |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| expireTime | INTEGER | NULL | 否 | 过期时间 |
3. 用户手机号表 (user_phones)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | ID |
| userId | TEXT | NULL | 否 | 关联的用户ID |
| openid | TEXT | NULL | 否 | 微信openid |
| phoneNumber | TEXT | NULL | 否 | 手机号（带区号） |
| purePhoneNumber | TEXT | NULL | 否 | 不带区号的手机号 |
| countryCode | TEXT | NULL | 否 | 区号 |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
4. 菜品表 (dishes)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 唯一ID |
| name | TEXT | NULL | 否 | 菜品名称 |
| type | TEXT | NULL | 否 | 菜品类型 |
| spicy | TEXT | '不辣' | 否 | 辣度 |
| images | TEXT | NULL | 否 | 图片数组（JSON格式） |
| steps | TEXT | NULL | 否 | 制作步骤（JSON格式） |
| notice | TEXT | '' | 否 | 注意事项 |
| remark | TEXT | '' | 否 | 备注 |
| reference | TEXT | '' | 否 | 参考链接 |
| creatorId | TEXT | NULL | 否 | 创建者ID |
| creatorOpenid | TEXT | NULL | 否 | 创建者openid |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |
5. 食材表 (ingredients)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 食材ID |
| dishId | TEXT | NULL | 否 | 关联的菜品ID |
| name | TEXT | NULL | 否 | 名称 |
| amount | TEXT | NULL | 否 | 数量/重量 |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |
6. 预约表 (appointments)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 唯一ID |
| userId | TEXT | NULL | 否 | 用户ID |
| openid | TEXT | NULL | 否 | 用户openid |
| date | TEXT | NULL | 否 | 日期，格式：YYYY-MM-DD |
| mealType | TEXT | NULL | 否 | 餐次 |
| status | TEXT | '待确认' | 否 | 预约状态 |
| remarks | TEXT | '' | 否 | 备注 |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |
7. 预约菜品关联表 (appointment_dishes)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 唯一ID |
| appointmentId | TEXT | NULL | 否 | 关联的预约ID |
| dishId | TEXT | NULL | 否 | 关联的菜品ID |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
8. 评价表 (reviews)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 唯一ID |
| appointmentId | TEXT | NULL | 否 | 关联的预约ID |
| userId | TEXT | NULL | 否 | 用户ID |
| openid | TEXT | NULL | 否 | 用户openid |
| dishId | TEXT | NULL | 否 | 关联的菜品ID |
| rating | INTEGER | 5 | 否 | 评分（1-5） |
| content | TEXT | '' | 否 | 评价内容 |
| images | TEXT | NULL | 否 | 评价图片（JSON格式） |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |
9. 库存表 (inventory_items)
| 列名 | 类型 | 默认值 | 是否主键 | 说明 |
|------|------|--------|----------|------|
| id | TEXT | NULL | 是 | 唯一ID |
| userId | TEXT | NULL | 否 | 用户ID |
| openid | TEXT | NULL | 否 | 用户openid |
| name | TEXT | NULL | 否 | 食材名称 |
| amount | TEXT | NULL | 否 | 重量/数量 |
| category | TEXT | '其他' | 否 | 类别 |
| status | TEXT | '正常' | 否 | 状态 |
| putInDate | TEXT | NULL | 否 | 放入日期，格式：YYYY-MM-DD |
| expiryDate | TEXT | NULL | 否 | 保质期，格式：YYYY-MM-DD |
| image | TEXT | NULL | 否 | 食材图片 |
| remarks | TEXT | '' | 否 | 备注 |
| createTime | INTEGER | CURRENT_TIMESTAMP | 否 | 创建时间 |
| updateTime | INTEGER | CURRENT_TIMESTAMP | 否 | 更新时间 |