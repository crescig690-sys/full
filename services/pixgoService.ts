import axios from 'axios';
import { PixGoCreateRequest, PixGoCreateResponse, PixGoStatusResponse } from '../types';

const BASE_URL = 'https://pixgo.org/api/v1';

export const createPixPayment = async (apiKey: string, data: PixGoCreateRequest): Promise<PixGoCreateResponse> => {
  try {
    const response = await axios.post(`${BASE_URL}/payment/create`, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      return error.response.data;
    }
    throw new Error(error.message || 'Erro ao conectar com servidor de pagamento');
  }
};

export const checkPaymentStatus = async (apiKey: string, paymentId: string): Promise<PixGoStatusResponse> => {
  const response = await axios.get(`${BASE_URL}/payment/${paymentId}/status`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  return response.data;
};

export const getPaymentDetails = async (apiKey: string, paymentId: string): Promise<PixGoStatusResponse> => {
  const response = await axios.get(`${BASE_URL}/payment/${paymentId}`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });
  return response.data;
};