/**
 * ServiceRegistry — nơi app resolve service (port) thay vì tự tạo hoặc import chéo app khác.
 * Xem docs/reference/contract-reference.md §ServiceRegistry.
 */
export interface ServiceRegistry {
  get<T>(serviceId: string): T | undefined;
  register<T>(serviceId: string, impl: T): void;
  unregister(serviceId: string): void;
  has(serviceId: string): boolean;
}

export function createServiceRegistry(): ServiceRegistry {
  const services = new Map<string, unknown>();

  return {
    get<T>(serviceId: string) {
      return services.get(serviceId) as T | undefined;
    },
    register<T>(serviceId: string, impl: T) {
      services.set(serviceId, impl);
    },
    unregister(serviceId: string) {
      services.delete(serviceId);
    },
    has(serviceId: string) {
      return services.has(serviceId);
    },
  };
}
