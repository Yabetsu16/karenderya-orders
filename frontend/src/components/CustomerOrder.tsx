import { formatPrice } from "../format";
import type { FoodItem, OrderStatus } from "../types";

type CustomerOrderProps = {
  items: FoodItem[];
  cart: Record<string, number>;
  total: number;
  busy: boolean;
  trackedOrder: OrderStatus | null;
  onQuantityChange: (item: FoodItem, delta: number) => void;
  onCheckout: () => void;
};

export function CustomerOrder({
  items,
  cart,
  total,
  busy,
  trackedOrder,
  onQuantityChange,
  onCheckout,
}: CustomerOrderProps) {
  const orderLines = items
    .filter((item) => (cart[item.id] ?? 0) > 0)
    .map((item) => ({
      item,
      quantity: cart[item.id],
    }));

  return (
    <div className="customer-order-layout">
      <section className="panel customer-order">
        <h2>Take an order</h2>
        {items.length === 0 ? (
          <p>No dishes are available.</p>
        ) : (
          <div className="menu">
            {items.map((item) => (
              <article className="menu-item" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {formatPrice(item.price)} · {item.availableOrderQty} left
                  </p>
                </div>
                <div className="stepper">
                  <button
                    aria-label={`Remove ${item.name}`}
                    onClick={() => onQuantityChange(item, -1)}
                  >
                    −
                  </button>
                  <strong>{cart[item.id] ?? 0}</strong>
                  <button
                    aria-label={`Add ${item.name}`}
                    disabled={
                      item.availableOrderQty === 0 ||
                      (cart[item.id] ?? 0) >= item.availableOrderQty
                    }
                    onClick={() => onQuantityChange(item, 1)}
                  >
                    +
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section
        className="panel checkout-panel"
        aria-labelledby="order-summary-title"
      >
        {trackedOrder && (
          <div
            className={`order-status ${trackedOrder.isCollected || trackedOrder.isReady ? "ready" : "preparing"}`}
            aria-live="polite"
          >
            <strong>Order #{trackedOrder.orderNumber}</strong>
            <p>
              {trackedOrder.isCollected
                ? "Your order has been collected. Enjoy your food :)"
                : trackedOrder.isReady
                ? "Your order is ready. Please collect it."
                : "Your order is being prepared. This status updates automatically."}
            </p>
          </div>
        )}
        <h2 id="order-summary-title">Order summary</h2>
        {orderLines.length === 0 ? (
          <p className="subtle">Your order is empty.</p>
        ) : (
          <ul className="order-summary">
            {orderLines.map(({ item, quantity }) => (
              <li key={item.id}>
                <span>
                  {item.name} <small>× {quantity}</small>
                </span>
                <strong>{formatPrice(item.price * quantity)}</strong>
              </li>
            ))}
          </ul>
        )}
        <div className="order-summary-total">
          <span>Total</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <button
          className="checkout"
          disabled={busy || total === 0}
          onClick={onCheckout}
        >
          Place order · {formatPrice(total)}
        </button>
      </section>
    </div>
  );
}
