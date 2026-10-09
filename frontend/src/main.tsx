import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppHeader } from "./components/AppHeader";
import { CustomerOrder } from "./components/CustomerOrder";
import { MenuItemForm } from "./components/MenuItemForm";
import { MenuManagement } from "./components/MenuManagement";
import { OrderHistory } from "./components/OrderHistory";
import type { FoodItem, FormValues, Order } from "./types";
import "./styles.css";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const emptyForm: FormValues = { name: "", price: "", inventory: "" };
type Message = { text: string; kind: "success" | "warning" };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.message ??
        Object.values(body?.errors ?? {})?.flat()[0] ??
        "Something went wrong.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function App() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = window.location.pathname === "/admin";

  const refresh = async () => {
    const [menu, history] = await Promise.all([
      request<FoodItem[]>("/api/food-items?includeArchived=true"),
      request<Order[]>("/api/orders"),
    ]);
    setItems(menu);
    setOrders(history);
  };

  useEffect(() => {
    refresh().catch((error: Error) =>
      setMessage({ text: error.message, kind: "warning" }),
    );
  }, []);

  const activeItems = items.filter((item) => !item.isArchived);
  const total = useMemo(
    () =>
      activeItems.reduce(
        (sum, item) => sum + item.price * (cart[item.id] ?? 0),
        0,
      ),
    [activeItems, cart],
  );

  const changeQuantity = (item: FoodItem, delta: number) =>
    setCart((current) => ({
      ...current,
      [item.id]: Math.max(
        0,
        Math.min(item.availableOrderQty, (current[item.id] ?? 0) + delta),
      ),
    }));

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        availableOrderQty: Number(form.inventory),
      };
      await request(
        editing ? `/api/food-items/${editing.id}` : "/api/food-items",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      setForm(emptyForm);
      setEditing(null);
      await refresh();
      setMessage({ text: "Menu saved.", kind: "success" });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "warning" });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (item: FoodItem) => {
    if (!confirm(`Archive ${item.name}? It will remain in order history.`))
      return;
    try {
      await request(`/api/food-items/${item.id}`, { method: "DELETE" });
      setCart((current) => ({ ...current, [item.id]: 0 }));
      await refresh();
      setMessage({ text: "Item archived.", kind: "success" });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "warning" });
    }
  };

  const unarchive = async (item: FoodItem) => {
    try {
      await request(`/api/food-items/${item.id}/unarchive`, {
        method: "POST",
      });
      await refresh();
      setMessage({ text: "Item unarchived.", kind: "success" });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "warning" });
    }
  };

  const checkout = async () => {
    const lines = Object.entries(cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([foodItemId, quantity]) => ({ foodItemId, quantity }));
    if (!lines.length) {
      setMessage({ text: "Add at least one item to the order.", kind: "warning" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await request("/api/orders", {
        method: "POST",
        body: JSON.stringify({ items: lines }),
      });
      setCart({});
      await refresh();
      setMessage({ text: "Order recorded and inventory updated.", kind: "success" });
    } catch (error) {
      setMessage({ text: (error as Error).message, kind: "warning" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (item: FoodItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      price: item.price.toFixed(2),
      inventory: String(item.availableOrderQty),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  return (
    <main>
      <AppHeader isAdmin={isAdmin} total={total} />
      {message && (
        <div className={`message ${message.kind}`} role="status">
          {message.text}
        </div>
      )}
      {!isAdmin ? (
        <CustomerOrder
          items={activeItems}
          cart={cart}
          total={total}
          busy={busy}
          onQuantityChange={changeQuantity}
          onCheckout={checkout}
        />
      ) : (
        <>
          <MenuItemForm
            editing={editing}
            form={form}
            busy={busy}
            onFormChange={setForm}
            onSubmit={saveItem}
            onCancel={cancelEdit}
          />
          <MenuManagement
            items={items}
            onEdit={beginEdit}
            onArchive={archive}
            onUnarchive={unarchive}
          />
          <OrderHistory orders={orders} />
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
