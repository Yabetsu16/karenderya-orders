type AppHeaderProps = { isAdmin: boolean };

export function AppHeader({ isAdmin }: AppHeaderProps) {
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
    </header>
  );
}
