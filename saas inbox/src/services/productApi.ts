import { apiService } from '../context/MessagingContext';
import { toContact, type ApiContact } from './messaging/HttpMessageService';
import type { Contact } from '../types/messaging';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  color: string;
  interested_count: number;
  created_at: string;
}

export interface CreateProduct {
  name: string;
  description?: string;
  keywords?: string[];
  color?: string;
}

const STORAGE_KEY = 'unification.products';
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444'];
const isMockEnabled = () => import.meta.env.VITE_PRODUCTS_MOCK === 'true';

const readMock = (): Product[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Product[];
  } catch {
    return [];
  }
};

const writeMock = (products: Product[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(products));

export const productApi = {
  async list(): Promise<Product[]> {
    if (!isMockEnabled()) return api().request<Product[]>('/products');
    return readMock().sort((a, b) => a.name.localeCompare(b.name));
  },

  async create(input: CreateProduct): Promise<Product> {
    if (!isMockEnabled()) {
      return api().request<Product>('/products', json('POST', input));
    }
    const products = readMock();
    if (products.some(product => product.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new Error('A product with this name already exists.');
    }
    const product: Product = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      keywords: input.keywords ?? [],
      color: input.color ?? COLORS[products.length % COLORS.length],
      interested_count: 0,
      created_at: new Date().toISOString(),
    };
    writeMock([...products, product]);
    return product;
  },

  update: (id: string, changes: Partial<CreateProduct>): Promise<Product> =>
    api().request<Product>(`/products/${id}`, json('PATCH', changes)),
  delete: (id: string): Promise<void> => api().request<void>(`/products/${id}`, { method: 'DELETE' }),
  classify: (contactId: string): Promise<Contact> =>
    api().request<ApiContact>(`/contacts/${contactId}/product-interests/classify`, { method: 'POST' }).then(toContact),
  addInterest: (contactId: string, productId: string): Promise<Contact> =>
    api().request<ApiContact>(`/contacts/${contactId}/product-interests/${productId}`, { method: 'POST' }).then(toContact),
  removeInterest: (contactId: string, productId: string): Promise<Contact> =>
    api().request<ApiContact>(`/contacts/${contactId}/product-interests/${productId}`, { method: 'DELETE' }).then(toContact),
};

const api = () => {
  if (!apiService) throw new Error('Products need VITE_API_URL');
  return apiService;
};

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
