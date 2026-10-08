import { formatPrice } from "../format";
import type { Order } from "../types";

type OrderHistoryProps = {
  orders: Order[];
};

export function OrderHistory({ orders }: OrderHistoryProps) {
  return (
    <section className="panel history">
      <h2>Previous orders</h2>
      {orders.length === 0 ? (
        <p className="subtle">No orders yet.</p>
      ) : (
        orders.map((order) => (
          <article key={order.id}>
            <div>
              <strong>
                {new Date(order.createdAt).toLocaleString("en-PH")}
              </strong>
              <p>
                {order.lines
                  .map((line) => `${line.quantity}× ${line.itemName}`)
                  .join(", ")}
              </p>
            </div>
            <strong>{formatPrice(order.total)}</strong>
          </article>
        ))
      )}
    </section>
  );
}
