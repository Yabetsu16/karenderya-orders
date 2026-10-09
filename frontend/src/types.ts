export type FoodItem = {
  id: string;
  name: string;
  price: number;
  availableOrderQty: number;
  isArchived: boolean;
};

export type Order = {
  id: string;
  orderNumber: number;
  createdAt: string;
  total: number;
  isReady: boolean;
  isCollected: boolean;
  lines: { itemName: string; unitPrice: number; quantity: number }[];
};

export type OrderStatus = { orderNumber: number; isReady: boolean; isCollected: boolean };

export type FormValues = { name: string; price: string; inventory: string };
