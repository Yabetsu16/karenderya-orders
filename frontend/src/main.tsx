import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppHeader } from "./components/AppHeader";
import { CustomerOrder } from "./components/CustomerOrder";
import { CurrentOrders } from "./components/CurrentOrders";
import { MenuItemForm } from "./components/MenuItemForm";
import { MenuManagement } from "./components/MenuManagement";
import { OrderHistory } from "./components/OrderHistory";
import type { FoodItem, FormValues, Order, OrderStatus } from "./types";
import "./styles.css";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const emptyForm: FormValues = { name: "", price: "", inventory: "" };
type Message = { text: string; kind: "success" | "warning" };

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.message ??
        Object.values(body?.errors ?? {})?.flat()[0] ??
        "Something went wrong.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function App() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<OrderStatus | null>(() => {
    const orderNumber = Number(localStorage.getItem("trackedOrderNumber"));
    return Number.isSafeInteger(orderNumber) && orderNumber > 0
      ? { orderNumber, isReady: false, isCollected: false }
      : null;
  });
  const isAdmin = window.location.pathname === "/admin";

  const refresh = async () => {
    const [menu, currentOrders] = await Promise.all([
      request<FoodItem[]>("/api/food-items?includeArchived=true"),
      request<Order[]>("/api/orders"),
    ]);
    setItems(menu);
    setOrders(currentOrders);
  };

  const refreshHistory = async () => {
    setHistoryOrders(await request<Order[]>("/api/orders/history"));
  };

  useEffect(() => {
    refresh().catch((error: Error) =>
      setMessage({ text: error.message, kind: "warning" }),
    );
  }, []);

  useEffect(() => {
    if (!trackedOrder || trackedOrder.isCollected) return;

    let cancelled = false;
    let timeout: number;
    const checkStatus = async () => {
      try {
        const status = await request<OrderStatus>(
          `/api/orders/${trackedOrder.orderNumber}`,
        );
        if (cancelled) return;
        setTrackedOrder(status);
        if (status.isCollected) {
          setMessage({
            text: `Order #${status.orderNumber} has been collected. Enjoy your food :)`,
            kind: "success",
          });
          return;
        } else if (status.isReady) {
          setMessage({
            text: `Order #${status.orderNumber} is ready for pickup.`,
            kind: "success",
          });
        } else {
          setMessage(null);
        }
        timeout = window.setTimeout(checkStatus, 3000);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          localStorage.removeItem("trackedOrderNumber");
          setTrackedOrder(null);
          setMessage({
            text: `Order #${trackedOrder.orderNumber} could not be found. It may have been removed when the database was reset. You can place a new order.`,
            kind: "warning",
          });
          return;
        }
        setMessage({ text: (error as Error).message, kind: "warning" });
        timeout = window.setTimeout(checkStatus, 5000);
      }
    };

    void checkStatus();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [trackedOrder?.orderNumber, trackedOrder?.isCollected]);

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
      const order = await request<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ items: lines }),
      });
      localStorage.setItem("trackedOrderNumber", String(order.orderNumber));
      setTrackedOrder({
        orderNumber: order.orderNumber,
        isReady: order.isReady,
        isCollected: order.isCollected,
      });
      setCart({});
      await refresh();
      setMessage({
        text: `Order #${order.orderNumber} placed. You can check its ready status here.`,
        kind: "success",
      });
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
      <AppHeader
        isAdmin={isAdmin}
        showingHistory={showingHistory}
        onToggleHistory={() => {
          const nextShowingHistory = !showingHistory;
          setShowingHistory(nextShowingHistory);
          if (nextShowingHistory) {
            refreshHistory().catch((error: Error) =>
              setMessage({ text: error.message, kind: "warning" }),
            );
          }
        }}
      />
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
          trackedOrder={trackedOrder}
          onQuantityChange={changeQuantity}
          onCheckout={checkout}
        />
      ) : (
        <>
          {showingHistory ? (
            <OrderHistory
              orders={historyOrders}
              totalIncome={historyOrders.reduce((sum, order) => sum + order.total, 0)}
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
              <CurrentOrders
                orders={orders}
                onMarkReady={async (orderNumber) => {
                  try {
                    await request(`/api/orders/${orderNumber}/ready`, {
                      method: "POST",
                    });
                    await refresh();
                    setMessage({
                      text: `Order #${orderNumber} marked ready.`,
                      kind: "success",
                    });
                  } catch (error) {
                    setMessage({
                      text: (error as Error).message,
                      kind: "warning",
                    });
                  }
                }}
                onMarkCollected={async (orderNumber) => {
                  try {
                    await request(`/api/orders/${orderNumber}/collected`, {
                      method: "POST",
                    });
                    await refresh();
                    setMessage({
                      text: `Order #${orderNumber} marked collected.`,
                      kind: "success",
                    });
                  } catch (error) {
                    setMessage({
                      text: (error as Error).message,
                      kind: "warning",
                    });
                  }
                }}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
