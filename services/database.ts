import axios from 'axios';
import { Order, OrderStatus, Store } from '../types';

const API_URL = 'http://localhost:5000/api';
const DB_KEY_ORDERS = '7dbappe_orders_db';
const DB_KEY_STORES = '7dbappe_stores_db';

// --- HELPERS (Fallback) ---
const getLocalOrders = (): Order[] => {
  try {
    const data = localStorage.getItem(DB_KEY_ORDERS);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const getLocalStores = (): Store[] => {
  try {
    const data = localStorage.getItem(DB_KEY_STORES);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

export const db = {
  // --- STORES ---
  getStores: async (): Promise<Store[]> => {
    try {
      const response = await axios.get(`${API_URL}/stores`);
      return response.data;
    } catch (e) {
      console.warn("Backend offline, fetching stores locally...");
      return getLocalStores();
    }
  },

  getStoreById: async (id: string): Promise<Store | undefined> => {
    try {
      const response = await axios.get(`${API_URL}/stores/${id}`);
      return response.data;
    } catch (e) {
       const stores = getLocalStores();
       return stores.find(s => s.id === id);
    }
  },

  createStore: async (store: Store): Promise<Store | null> => {
    try {
      const response = await axios.post(`${API_URL}/stores`, store);
      return response.data;
    } catch (e) {
      console.warn("Backend offline, saving store locally...");
      const stores = getLocalStores();
      stores.push(store);
      localStorage.setItem(DB_KEY_STORES, JSON.stringify(stores));
      return store;
    }
  },

  updateStore: async (store: Store): Promise<Store | null> => {
    try {
      const response = await axios.put(`${API_URL}/stores/${store.id}`, store);
      return response.data;
    } catch (e) {
      console.warn("Backend offline, updating store locally...");
      const stores = getLocalStores();
      const idx = stores.findIndex(s => s.id === store.id);
      if (idx >= 0) {
        stores[idx] = store;
        localStorage.setItem(DB_KEY_STORES, JSON.stringify(stores));
        return store;
      }
      return null;
    }
  },

  // --- ORDERS ---
  getAllOrders: async (storeId?: string | null): Promise<Order[]> => {
    try {
      const url = storeId ? `${API_URL}/orders?storeId=${storeId}` : `${API_URL}/orders`;
      const response = await axios.get(url);
      return response.data;
    } catch (e) {
      console.warn("Backend offline, fetching orders locally...");
      let orders = getLocalOrders().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (storeId) {
        orders = orders.filter(o => o.store_id === storeId);
      }
      return orders;
    }
  },

  getOrderById: async (id: string): Promise<Order | undefined> => {
    try {
      const response = await axios.get(`${API_URL}/orders/${id}`);
      return response.data;
    } catch (e) {
      const orders = getLocalOrders();
      return orders.find(o => o.id === id);
    }
  },

  saveOrder: async (order: Order): Promise<Order | null> => {
    try {
      const response = await axios.post(`${API_URL}/orders`, order);
      return response.data;
    } catch (e) {
      console.warn("Backend offline, saving to LocalStorage...");
      const orders = getLocalOrders();
      const idx = orders.findIndex(o => o.id === order.id);
      
      const toSave = { ...order, updatedAt: new Date().toISOString() };
      
      if (idx >= 0) {
        orders[idx] = toSave;
      } else {
        orders.push(toSave);
      }
      localStorage.setItem(DB_KEY_ORDERS, JSON.stringify(orders));
      return toSave;
    }
  },

  updateStatus: async (id: string, status: OrderStatus): Promise<void> => {
    try {
      await axios.patch(`${API_URL}/orders/${id}/status`, { status });
    } catch (e) {
      const orders = getLocalOrders();
      const order = orders.find(o => o.id === id);
      if (order) {
        order.status = status;
        order.updatedAt = new Date().toISOString();
        localStorage.setItem(DB_KEY_ORDERS, JSON.stringify(orders));
      }
    }
  },
  
  // --- METRICS ---
  getMetrics: async (storeId?: string | null) => {
    try {
      const url = storeId ? `${API_URL}/dashboard/metrics?storeId=${storeId}` : `${API_URL}/dashboard/metrics`;
      const response = await axios.get(url);
      return response.data;
    } catch (e) {
      // Calculate metrics locally if server is down
      let orders = getLocalOrders();
      
      if (storeId) {
        orders = orders.filter(o => o.store_id === storeId);
      }

      const totalOrders = orders.length;
      const completedOrders = orders.filter(o => o.status === 'completed');
      const totalRevenue = completedOrders.reduce((acc, curr) => acc + curr.amount, 0);
      const pendingOrders = orders.filter(o => o.status === 'pending').length;
      const conversionRate = totalOrders > 0 ? ((completedOrders.length / totalOrders) * 100).toFixed(1) : '0.0';

      return {
        totalOrders,
        totalRevenue,
        pendingOrders,
        conversionRate
      };
    }
  }
};