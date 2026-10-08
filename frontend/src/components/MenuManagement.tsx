import { formatPrice } from "../format";
import type { FoodItem } from "../types";

type MenuManagementProps = {
  items: FoodItem[];
  onEdit: (item: FoodItem) => void;
  onArchive: (item: FoodItem) => void;
  onUnarchive: (item: FoodItem) => void;
};

export function MenuManagement({
  items,
  onEdit,
  onArchive,
  onUnarchive,
}: MenuManagementProps) {
  return (
    <section className="panel">
      <h2>Menu management</h2>
      <div className="compact-list">
        {items.map((item) => (
          <article
            key={item.id}
            className={item.isArchived ? "archived" : ""}
          >
            <div>
              <strong>{item.name}</strong>
              <small>
                {formatPrice(item.price)} · {item.availableOrderQty} in stock
                {item.isArchived && " · archived"}
              </small>
            </div>
            <div>
              {item.isArchived ? (
                <button className="text" onClick={() => onUnarchive(item)}>
                  Unarchive
                </button>
              ) : (
                <>
                  <button className="text" onClick={() => onEdit(item)}>
                    Edit
                  </button>
                  <button
                    className="text danger"
                    onClick={() => onArchive(item)}
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
