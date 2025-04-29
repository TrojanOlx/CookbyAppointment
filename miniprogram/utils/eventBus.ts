// 事件总线实现
type EventCallback = (...args: any[]) => void;

class EventBus {
  private events: Map<string, EventCallback[]>;

  constructor() {
    this.events = new Map();
  }

  // 注册事件监听器
  on(event: string, callback: EventCallback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback);
  }

  // 移除事件监听器
  off(event: string, callback: EventCallback) {
    if (!this.events.has(event)) return;
    const callbacks = this.events.get(event)!;
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
    if (callbacks.length === 0) {
      this.events.delete(event);
    }
  }

  // 触发事件
  emit(event: string, ...args: any[]) {
    if (!this.events.has(event)) return;
    const callbacks = this.events.get(event)!;
    callbacks.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  // 清除所有事件监听器
  clear() {
    this.events.clear();
  }
}

export const eventBus = new EventBus(); 