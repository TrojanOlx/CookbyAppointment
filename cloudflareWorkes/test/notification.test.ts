import { describe, expect, it } from 'vitest';
import { buildAppointmentNotificationData } from '../handlers/notificationV2Handler';

const appointment = {
  date: '2026-08-26',
  mealType: '晚餐',
  status: '待确认',
  creatorName: 'Trojan-X',
  dishNames: '番茄炒蛋、青椒肉丝',
};

describe('WeChat appointment notification payloads', () => {
  it('uses the appointment order template fields for chefs and admins', () => {
    expect(buildAppointmentNotificationData('created', appointment)).toEqual({
      time9: { value: '2026-08-26 18:00' },
      thing7: { value: 'Trojan-X' },
      thing3: { value: '番茄炒蛋、青椒肉丝' },
      phrase4: { value: '待确认' },
      thing5: { value: '家庭有新的用餐预约，请及时处理' },
    });
  });

  it('uses the status template fields for confirmation and cancellation', () => {
    expect(buildAppointmentNotificationData('confirmed', appointment)).toEqual({
      date3: { value: '2026-08-26' },
      thing28: { value: '晚餐' },
      phrase14: { value: '已确认' },
      thing8: { value: '菜品已安排，请按时用餐' },
    });
    expect(buildAppointmentNotificationData('cancelled', appointment)).toEqual({
      date3: { value: '2026-08-26' },
      thing28: { value: '晚餐' },
      phrase14: { value: '已取消' },
      thing8: { value: '家庭预约已取消，请查看详情' },
    });
  });

  it('uses the dining reminder template fields and caps free text', () => {
    const payload = buildAppointmentNotificationData('reminder', {
      ...appointment,
      dishNames: '很长的菜品名称'.repeat(10),
    });
    expect(payload).toEqual({
      date4: { value: '2026-08-26' },
      thing8: { value: '晚餐' },
      thing18: { value: expect.any(String) },
      thing6: { value: '今天有家庭用餐安排，请按时用餐' },
    });
    expect(Array.from(payload.thing18.value)).toHaveLength(20);
  });
});
