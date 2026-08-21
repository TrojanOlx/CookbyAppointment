import { del, get, post, put, upload } from './http';

export type PlatformTemplateStatus = 'draft' | 'active' | 'archived' | string;

export interface PlatformTemplateIngredient {
  id?: string;
  localKey?: string;
  ingredientId?: string;
  name: string;
  canonicalName?: string;
  quantity?: number | string;
  amount?: string;
  unit?: string;
  note?: string;
}

export interface PlatformRecipeTemplate {
  id: string;
  name: string;
  type: string;
  spicy: string;
  images: string[];
  ingredients: PlatformTemplateIngredient[];
  steps: string[];
  notice?: string;
  remark?: string;
  reference?: string;
  status: PlatformTemplateStatus;
  createdAt?: number | string;
  updatedAt?: number | string;
  publishedAt?: number | string;
  archivedAt?: number | string;
  createdBy?: string;
  updatedBy?: string;
}

export interface PlatformTemplateAsset {
  id: string;
  url: string;
  name?: string;
  contentType?: string;
  size?: number;
}

export interface PlatformTemplateStatusResult {
  id: string;
  status: PlatformTemplateStatus;
  updatedAt: number | string;
  unchanged?: boolean;
}

export interface PlatformIngredient {
  id: string;
  canonicalName: string;
  category: string;
  defaultUnit: string;
  aliases: string[];
  createdAt?: number | string;
  updatedAt?: number | string;
}

export interface PagedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TemplateWritePayload {
  name: string;
  type: string;
  spicy: string;
  images: string[];
  ingredients: PlatformTemplateIngredient[];
  steps: string[];
  notice?: string;
  remark?: string;
  reference?: string;
  status?: PlatformTemplateStatus;
  expectedUpdatedAt?: number | string;
}

export interface IngredientWritePayload {
  canonicalName: string;
  category: string;
  defaultUnit: string;
  aliases: string[];
  expectedUpdatedAt?: number | string;
}

const asList = <T>(body: any, keys: string[] = ['list']): T[] => {
  if (Array.isArray(body)) return body as T[];
  for (const key of keys) {
    if (body && Array.isArray(body[key])) return body[key] as T[];
  }
  if (body && body.data && Array.isArray(body.data)) return body.data as T[];
  if (body && body.data && Array.isArray(body.data.list)) return body.data.list as T[];
  return [];
};

const asTotal = (body: any, fallback: number): number => {
  const value = body && body.total !== undefined ? body.total
    : body && body.data && body.data.total !== undefined ? body.data.total : fallback;
  const total = Number(value);
  return Number.isFinite(total) ? total : fallback;
};

const asPage = (body: any, fallback: number): number => {
  const value = body && body.page !== undefined ? body.page
    : body && body.data && body.data.page !== undefined ? body.data.page : fallback;
  const page = Number(value);
  return Number.isFinite(page) ? page : fallback;
};

const asPageSize = (body: any, fallback: number): number => {
  const value = body && body.pageSize !== undefined ? body.pageSize
    : body && body.data && body.data.pageSize !== undefined ? body.data.pageSize : fallback;
  const pageSize = Number(value);
  return Number.isFinite(pageSize) ? pageSize : fallback;
};

const unwrapObject = <T>(body: any): T => {
  if (body && body.data && !Array.isArray(body.data) && typeof body.data === 'object') {
    return body.data as T;
  }
  return body as T;
};

const normalizeIngredient = (value: any): PlatformTemplateIngredient => ({
  id: value && value.id ? String(value.id) : undefined,
  localKey: value && value.id ? String(value.id) : undefined,
  ingredientId: value && value.ingredientId ? String(value.ingredientId) : undefined,
  name: String(value && (value.name || value.canonicalName) || ''),
  canonicalName: value && value.canonicalName ? String(value.canonicalName) : undefined,
  quantity: value && value.quantity !== undefined ? value.quantity : undefined,
  amount: value && value.amount !== undefined ? String(value.amount) : undefined,
  unit: value && value.unit ? String(value.unit) : '',
  note: value && value.note ? String(value.note) : undefined
});

const normalizeTemplate = (value: any): PlatformRecipeTemplate => ({
  id: String(value && value.id || ''),
  name: String(value && value.name || ''),
  type: String(value && value.type || '炒菜'),
  spicy: String(value && value.spicy || '不辣'),
  images: Array.isArray(value && value.images) ? value.images.map((image: any) => String(image)) : [],
  ingredients: Array.isArray(value && value.ingredients)
    ? value.ingredients.map(normalizeIngredient)
    : [],
  steps: Array.isArray(value && value.steps) ? value.steps.map((step: any) => String(step || '')) : [],
  notice: value && value.notice ? String(value.notice) : '',
  remark: value && value.remark ? String(value.remark) : '',
  reference: value && value.reference ? String(value.reference) : '',
  status: String(value && value.status || 'archived'),
  createdAt: value && value.createdAt,
  updatedAt: value && value.updatedAt,
  publishedAt: value && value.publishedAt,
  archivedAt: value && value.archivedAt,
  createdBy: value && value.createdBy ? String(value.createdBy) : undefined,
  updatedBy: value && value.updatedBy ? String(value.updatedBy) : undefined
});

const normalizeAsset = (value: any): PlatformTemplateAsset => ({
  id: String(value && (value.id || value.assetId || value.fileId) || ''),
  url: String(value && (value.url || value.filePath || value.downloadUrl) || ''),
  name: value && (value.name || value.fileName) ? String(value.name || value.fileName) : undefined,
  contentType: value && value.contentType ? String(value.contentType) : undefined,
  size: value && value.size !== undefined ? Number(value.size) : undefined
});

const normalizeCatalogIngredient = (value: any): PlatformIngredient => ({
  id: String(value && value.id || ''),
  canonicalName: String(value && (value.canonicalName || value.name) || ''),
  category: String(value && value.category || ''),
  defaultUnit: String(value && value.defaultUnit || ''),
  aliases: Array.isArray(value && value.aliases)
    ? value.aliases.map((alias: any) => String(alias)).filter(Boolean)
    : typeof (value && value.aliases) === 'string'
      ? String(value.aliases).split('|').map(alias => alias.trim()).filter(Boolean)
      : [],
  createdAt: value && value.createdAt,
  updatedAt: value && value.updatedAt
});

export class PlatformCatalogService {
  static async listTemplates(params: {
    status?: string;
    type?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<PagedResult<PlatformRecipeTemplate>> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const body = await get<any>('/api/platform/recipe-templates', params);
    const list = asList<any>(body, ['list', 'templates']).map(normalizeTemplate);
    return { list, total: asTotal(body, list.length), page: asPage(body, page), pageSize: asPageSize(body, pageSize) };
  }

  static async getTemplate(id: string): Promise<PlatformRecipeTemplate> {
    const body = await get<any>(`/api/platform/recipe-templates/${encodeURIComponent(id)}`);
    return normalizeTemplate(unwrapObject<any>(body));
  }

  static async createTemplate(payload: TemplateWritePayload): Promise<PlatformRecipeTemplate> {
    const body = await post<any>('/api/platform/recipe-templates', {
      ...payload,
      status: payload.status || 'archived'
    });
    return normalizeTemplate(unwrapObject<any>(body));
  }

  static async updateTemplate(id: string, payload: TemplateWritePayload): Promise<PlatformRecipeTemplate> {
    const body = await put<any>(`/api/platform/recipe-templates/${encodeURIComponent(id)}`, payload);
    return normalizeTemplate(unwrapObject<any>(body));
  }

  static async publishTemplate(id: string, expectedUpdatedAt?: number | string): Promise<PlatformTemplateStatusResult> {
    return post<PlatformTemplateStatusResult>(`/api/platform/recipe-templates/${encodeURIComponent(id)}/publish`,
      expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt });
  }

  static async archiveTemplate(id: string, expectedUpdatedAt?: number | string): Promise<PlatformTemplateStatusResult> {
    return post<PlatformTemplateStatusResult>(`/api/platform/recipe-templates/${encodeURIComponent(id)}/archive`,
      expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt });
  }

  static async uploadTemplateAsset(filePath: string, templateId?: string): Promise<PlatformTemplateAsset> {
    const formData: Record<string, string> = { purpose: 'recipe-template' };
    if (templateId) formData.templateId = templateId;
    const body = await upload<any>('/api/platform/template-assets', filePath, formData);
    return normalizeAsset(unwrapObject<any>(body));
  }

  static async deleteTemplateAsset(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>(`/api/platform/template-assets/${encodeURIComponent(id)}`);
  }

  static async listIngredients(params: {
    keyword?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<PagedResult<PlatformIngredient>> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 30;
    const body = await get<any>('/api/platform/ingredients', params);
    const list = asList<any>(body, ['list', 'ingredients']).map(normalizeCatalogIngredient);
    return { list, total: asTotal(body, list.length), page: asPage(body, page), pageSize: asPageSize(body, pageSize) };
  }

  static async createIngredient(payload: IngredientWritePayload): Promise<PlatformIngredient> {
    const body = await post<any>('/api/platform/ingredients', payload);
    return normalizeCatalogIngredient(unwrapObject<any>(body));
  }

  static async updateIngredient(id: string, payload: IngredientWritePayload): Promise<PlatformIngredient> {
    const body = await put<any>(`/api/platform/ingredients/${encodeURIComponent(id)}`, payload);
    return normalizeCatalogIngredient(unwrapObject<any>(body));
  }
}
