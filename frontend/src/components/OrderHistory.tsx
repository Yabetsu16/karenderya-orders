import { formatPrice } from "../format";
import type { Order } from "../types";

type OrderHistoryProps = {
  orders: Order[];
  totalIncome: number;
};

export function OrderHistory({ orders, totalIncome }: OrderHistoryProps) {
  return (
    <section className="panel history">
      <div className="history-heading">
        <h2>Order history</h2>
        <p>Total income: <strong>{formatPrice(totalIncome)}</strong></p>
      </div>
      {orders.length === 0 ? (
        <p className="subtle">No collected orders yet.</p>
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
            <strong>{formatPrice(order.total)}</strong>
          </article>
        ))
      )}
    </section>
  );
}
