type AppHeaderProps = {
  isAdmin: boolean;
  showingHistory: boolean;
  onToggleHistory: () => void;
};

export function AppHeader({
  isAdmin,
  showingHistory,
  onToggleHistory,
}: AppHeaderProps) {
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
      {isAdmin && (
        <button className="history-toggle" onClick={onToggleHistory}>
          {showingHistory ? "Back to dashboard" : "Order history"}
        </button>
      )}
    </header>
  );
}
