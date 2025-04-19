// 菜品服务
import { get, post, put, del } from './http';
import { Dish, Ingredient } from '../models/dish';

// 菜品服务类
export class DishService {
  // 获取菜品列表
  static async getDishList(
    page: number = 1, 
    pageSize: number = 10, 
    type?: string
  ): Promise<{ total: number, list: Dish[] }> {
    return get<{ total: number, list: Dish[] }>('/api/dish/list', { 
      page, 
      pageSize, 
      type 
    });
  }

  // 获取菜品详情
  static async getDishDetail(id: string): Promise<Dish> {
    return get<Dish>('/api/dish/detail', { id });
  }

  // 添加菜品
  static async addDish(dish: Partial<Dish>): Promise<Dish> {
    return post<Dish>('/api/dish/add', dish);
  }

  // 更新菜品
  static async updateDish(dish: Partial<Dish>): Promise<Dish> {
    return put<Dish>('/api/dish/update', dish);
  }

  // 删除菜品
  static async deleteDish(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/api/dish/delete', { id });
  }

  // 搜索菜品
  static async searchDish(
    keyword: string, 
    page: number = 1, 
    pageSize: number = 10
  ): Promise<{ total: number, list: Dish[] }> {
    return get<{ total: number, list: Dish[] }>('/api/dish/search', { 
      keyword, 
      page, 
      pageSize 
    });
  }

  // 根据食材推荐菜品
  static async recommendByIngredients(
    ingredientIds: string[], 
    page: number = 1, 
    pageSize: number = 10
  ): Promise<{ total: number, list: Dish[] }> {
    return post<{ total: number, list: Dish[] }>('/api/dish/recommend', { 
      ingredientIds, 
      page, 
      pageSize 
    });
  }

  // 获取食材列表
  static async getIngredientList(dishId?: string): Promise<Ingredient[]> {
    return get<Ingredient[]>('/api/dish/ingredients', { dishId });
  }

  // 添加食材
  static async addIngredient(ingredient: Partial<Ingredient>): Promise<Ingredient> {
    return post<Ingredient>('/api/dish/ingredient/add', ingredient);
  }

  // 更新食材
  static async updateIngredient(ingredient: Partial<Ingredient>): Promise<Ingredient> {
    return put<Ingredient>('/api/dish/ingredient/update', ingredient);
  }

  // 删除食材
  static async deleteIngredient(id: string): Promise<{ success: boolean }> {
    return del<{ success: boolean }>('/api/dish/ingredient/delete', { id });
  }
} 