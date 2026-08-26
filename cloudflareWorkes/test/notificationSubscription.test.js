import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SUBSCRIBE_TEMPLATE_IDS,
  requestSubscribeForAdmin,
  requestSubscribeForUser,
} from '../../miniprogram/services/notificationService';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSubscriptionRequest() {
  const requestSubscribeMessage = vi.fn((options) => {
    options.success?.(Object.fromEntries(options.tmplIds.map(id => [id, 'accept'])));
  });
  vi.stubGlobal('wx', { requestSubscribeMessage });
  return requestSubscribeMessage;
}

describe('mini program subscription requests', () => {
  it('wires the active booking page to request consent before creating an appointment', () => {
    const bookingPath = fileURLToPath(new URL('../../miniprogram/pages/appointment/booking/booking.js', import.meta.url));
    const bookingSource = readFileSync(bookingPath, 'utf8');
    const subscribeCall = bookingSource.indexOf('await requestSubscribeForUser()');
    const createCall = bookingSource.indexOf('AppointmentService.createAppointment(payload)');

    expect(bookingSource).toContain("require('../../../services/notificationService')");
    expect(subscribeCall).toBeGreaterThan(0);
    expect(createCall).toBeGreaterThan(subscribeCall);
  });

  it('requests status and dining reminder together for appointment users', async () => {
    const requestSubscribeMessage = stubSubscriptionRequest();
    await requestSubscribeForUser();
    expect(requestSubscribeMessage).toHaveBeenCalledOnce();
    expect(requestSubscribeMessage.mock.calls[0][0].tmplIds).toEqual([
      SUBSCRIBE_TEMPLATE_IDS.STATUS,
      SUBSCRIBE_TEMPLATE_IDS.REMINDER,
    ]);
  });

  it('requests only the new appointment template for chefs and admins', async () => {
    const requestSubscribeMessage = stubSubscriptionRequest();
    await requestSubscribeForAdmin();
    expect(requestSubscribeMessage).toHaveBeenCalledOnce();
    expect(requestSubscribeMessage.mock.calls[0][0].tmplIds).toEqual([
      SUBSCRIBE_TEMPLATE_IDS.NEW_APPT,
    ]);
  });
});
