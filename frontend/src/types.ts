export type FoodItem = {
  id: string;
  name: string;
  price: number;
  availableOrderQty: number;
  isArchived: boolean;
};

export type Order = {
  id: string;
  createdAt: string;
  total: number;
  lines: { itemName: string; unitPrice: number; quantity: number }[];
};

export type FormValues = { name: string; price: string; inventory: string };
