# Karenderya Orders

A small cashier-facing CRUD app for a karenderya. It manages a menu, records orders, and prevents orders that exceed inventory.

## Run it

With Docker running:

```sh
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173) for the customer ordering page, or [http://localhost:5173/admin](http://localhost:5173/admin) for menu and order administration. The API applies EF Core migrations and seeds three menu items on first start. To reset the database and seed again, run `docker compose down -v`.

## Checks

```sh
dotnet test
cd frontend && npm ci && npm run build
```

API integration tests use Testcontainers, so Docker must be running. They verify successful checkout, inventory reduction, stored price snapshots, rejection of insufficient inventory, and archival behavior.

## Design choices

- Prices use floating-point Philippine peso values throughout the API and database.
- Checkout uses a PostgreSQL serializable transaction to validate all requested items and inventory before saving the order and deducting stock.
- Order lines store the dish name and unit price at checkout, preserving order history if the menu item changes later.
- Archiving hides a dish from new orders while keeping it available in menu management and preserving its previous order data.
- The customer ordering page and menu/order administration are separate views in the same React app, available at `/` and `/admin`.
- The API applies EF Core migrations and seeds the initial menu when it starts.

## Manual smoke checklist

1. Add, edit, and archive a menu item.
2. Add items to an order and confirm stock and history update after checkout.
3. Attempt to order more than available stock and confirm the order is rejected with no stock change.
4. Confirm archived dishes are absent from the order menu but remain in Menu management.

## AI use

I used OpenAI Codex to help scaffold the project, draft the API/UI/tests, and run build checks. I reviewed the generated code, kept the architecture to a single ASP.NET project and React client.

When the credits of Codex are consumed I used Github Copilot for the remaining improvements. The improvements are mostly on renaming the variable names and separating sections and endpoints into different files to have separation of concerns and to have maintainability.

I used Gordon in Docker desktop to fix the error when using the command "docker compose up --build"
