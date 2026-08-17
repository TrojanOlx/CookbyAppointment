import { get, request } from './http';

export interface AccountExport {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  preferences: unknown[];
  families: unknown[];
  appointments: unknown[];
  appointmentDiningHistory: unknown[];
  reviews: unknown[];
  inventoryContributions: unknown[];
  files: unknown[];
}

export class AccountService {
  static exportData(): Promise<AccountExport> {
    return get<AccountExport>('/api/user/export');
  }

  static deleteAccount(): Promise<{ success: boolean; deletedAt: number }> {
    return request({
      url: '/api/user/account',
      method: 'DELETE',
      data: { confirm: true }
    });
  }
}
