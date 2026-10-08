import type { FormEvent } from "react";
import type { FoodItem, FormValues } from "../types";

type MenuItemFormProps = {
  editing: FoodItem | null;
  form: FormValues;
  busy: boolean;
  onFormChange: (form: FormValues) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function MenuItemForm({
  editing,
  form,
  busy,
  onFormChange,
  onSubmit,
  onCancel,
}: MenuItemFormProps) {
  return (
    <section className="management panel">
      <div>
        <h2>{editing ? "Edit menu item" : "Add menu item"}</h2>
        <p className="subtle">
          Archived dishes are kept in past orders but cannot be ordered again.
        </p>
      </div>
      <form onSubmit={onSubmit}>
        <input
          required
          placeholder="Dish name"
          value={form.name}
          onChange={(event) =>
            onFormChange({ ...form, name: event.target.value })
          }
        />
        <input
          required
          min="0.01"
          step="0.01"
          type="number"
          placeholder="Price (₱)"
          value={form.price}
          onChange={(event) =>
            onFormChange({ ...form, price: event.target.value })
          }
        />
        <input
          required
          min="0"
          step="1"
          type="number"
          placeholder="Stock"
          value={form.inventory}
          onChange={(event) =>
            onFormChange({ ...form, inventory: event.target.value })
          }
        />
        <button disabled={busy}>{editing ? "Update item" : "Add item"}</button>
        {editing && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </section>
  );
}
