import { formatPrice } from "../format";
import type { FoodItem } from "../types";

type CustomerOrderProps = {
  items: FoodItem[];
  cart: Record<string, number>;
  total: number;
  busy: boolean;
  onQuantityChange: (item: FoodItem, delta: number) => void;
  onCheckout: () => void;
};

export function CustomerOrder({
  items,
  cart,
  total,
  busy,
  onQuantityChange,
  onCheckout,
}: CustomerOrderProps) {
  return (
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
      <button
        className="checkout"
        disabled={busy || total === 0}
        onClick={onCheckout}
      >
        Place order · {formatPrice(total)}
      </button>
    </section>
  );
}
