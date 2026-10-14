// API Service Layer (Modular Aggregator)
import { authService } from './authService';
import { inventoryService } from './inventoryService';
import { appsScriptService, callApi } from './appsScriptService';

// Unified API Service preserving backwards compatibility with all existing consumers
export const apiService = {
  ...authService,
  ...inventoryService,
  ...appsScriptService,
};

// Re-export individual domain services and helpers for modular usage
export { authService } from './authService';
export { inventoryService } from './inventoryService';
export { appsScriptService, callApi } from './appsScriptService';
export * from './externalSyncService';
export * from './helpers';

export default apiService;
