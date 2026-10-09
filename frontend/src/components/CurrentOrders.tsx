import { formatPrice } from "../format";
import type { Order } from "../types";

type CurrentOrdersProps = {
  orders: Order[];
  onMarkReady: (orderNumber: number) => void;
  onMarkCollected: (orderNumber: number) => void;
};

export function CurrentOrders({
  orders,
  onMarkReady,
  onMarkCollected,
}: CurrentOrdersProps) {
  return (
    <section className="panel history">
      <h2>Current orders</h2>
      {orders.length === 0 ? (
        <p className="subtle">No orders are waiting to be prepared.</p>
      ) : (
        orders.map((order) => (
          <article key={order.id}>
            <div>
              <strong>
                Order #{order.orderNumber} ·{" "}
                {new Date(order.createdAt).toLocaleString("en-PH")}
              </strong>
              <p>
                {order.lines
                  .map((line) => `${line.quantity}× ${line.itemName}`)
                  .join(", ")}
              </p>
            </div>
            <div className="current-order-actions">
              <strong>{formatPrice(order.total)}</strong>
              {order.isReady ? (
                <button onClick={() => onMarkCollected(order.orderNumber)}>
                  Mark collected
                </button>
              ) : (
                <button onClick={() => onMarkReady(order.orderNumber)}>
                  Mark ready
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
