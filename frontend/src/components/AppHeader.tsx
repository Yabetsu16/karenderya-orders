import { formatPrice } from "../format";

type AppHeaderProps = {
  isAdmin: boolean;
  total: number;
};

export function AppHeader({ isAdmin, total }: AppHeaderProps) {
  return (
    <header>
      <div>
        <p className="eyebrow">KARENDERYA</p>
        <h1>{isAdmin ? "Admin dashboard" : "What would you like?"}</h1>
        <p className="subtle">
          {isAdmin
            ? "Add dishes, manage inventory, and review orders."
            : "Choose your dishes and place an order."}
        </p>
      </div>
      {!isAdmin && (
        <div className="total">
          <span>Current order</span>
          <strong>{formatPrice(total)}</strong>
        </div>
      )}
    </header>
  );
}
