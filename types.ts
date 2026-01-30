export interface PixGoCustomer {
  customer_name?: string;
  customer_cpf?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export type OrderStatus = 'pending' | 'completed' | 'expired' | 'cancelled' | 'refunded';

export interface Store {
  id: string;
  name: string;
  description?: string;
  apiKey?: string; // Specific API Key for this store
  pixFeePercentage?: number; // e.g., 0.99 for 0.99%
  pixFeeFixed?: number; // e.g., 0.50 for R$ 0,50
  createdAt: string;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
  status: OrderStatus;
  pixgo_payment_id?: string;
  qr_code?: string;
  qr_image_url?: string;
  store_id?: string; // Link to specific store
  store_name?: string; // Snapshot of store name
}

// Full Order Interface for Database
export interface Order extends PaymentIntent, PixGoCustomer {
  updatedAt: string;
}

export interface PixGoCreateRequest extends PixGoCustomer {
  amount: number;
  description?: string;
  external_id?: string;
  webhook_url?: string;
}

export interface PixGoCreateResponse {
  success: boolean;
  data: {
    payment_id: string;
    external_id: string;
    amount: number;
    status: string;
    qr_code: string;
    qr_image_url: string;
    expires_at: string;
    created_at: string;
  };
  error?: string;
  message?: string;
}

export interface PixGoStatusResponse {
  success: boolean;
  data: {
    payment_id: string;
    external_id: string;
    amount: number;
    status: OrderStatus;
    customer_name?: string;
    customer_cpf?: string;
    created_at: string;
    updated_at: string;
  };
}

export interface AdminSettings {
  apiKey: string; // Global Fallback Key
  adminPassword?: string;
  mongoConnectionString?: string;
}