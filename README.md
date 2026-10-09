# Karenderya Orders

A small ordering and order-management app for a karenderya. Customers browse the menu and place orders at `/`; staff manage dishes, inventory, and order preparation at `/admin`. The API validates inventory so orders cannot exceed available stock.

## Run it

Please install Docker to run the app. Download in https://docs.docker.com/desktop/setup/install/windows-install/

With Docker running:

```sh
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173) for the customer ordering page, or [http://localhost:5173/admin](http://localhost:5173/admin) for menu and order administration. The API applies EF Core migrations and seeds three menu items on first start.

> **Warning:** `docker compose down -v` removes the PostgreSQL data volume and permanently deletes the app's stored menu and orders. Use it only when you intend to reset the database; the API will seed the menu again the next time it starts.

## API overview

The ASP.NET API is available through the Docker Compose `api` service. Its main routes are:

| Method   | Route                                 | Purpose                                                                                  |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                         | Check that the API is responding.                                                        |
| `GET`    | `/api/food-items`                     | List active menu items. Add `?includeArchived=true` to include archived items for staff. |
| `POST`   | `/api/food-items`                     | Add a menu item.                                                                         |
| `PUT`    | `/api/food-items/{id}`                | Update a menu item.                                                                      |
| `DELETE` | `/api/food-items/{id}`                | Archive a menu item without deleting its order records.                                  |
| `POST`   | `/api/food-items/{id}/unarchive`      | Restore an archived menu item.                                                           |
| `POST`   | `/api/orders`                         | Place an order and deduct the selected quantities from inventory.                        |
| `GET`    | `/api/orders`                         | List orders not yet collected, including those marked ready.                             |
| `GET`    | `/api/orders/history`                 | List collected orders.                                                                   |
| `GET`    | `/api/orders/{orderNumber}`           | Get an order's readiness and collection status.                                          |
| `POST`   | `/api/orders/{orderNumber}/ready`     | Mark an order ready for pickup.                                                          |
| `POST`   | `/api/orders/{orderNumber}/collected` | Mark a ready order collected.                                                            |

## Checks

```sh
dotnet test
cd frontend
npm ci
npm run build
```

API integration tests use Testcontainers, so Docker must be running when running `dotnet test`. They verify checkout and inventory reduction, saved price snapshots and fractional peso prices, insufficient-inventory rejection, menu archival and restoration, duplicate menu-name conflicts, and the order lifecycle. In particular, they check that ready orders remain current, collected orders move to history, and an order cannot be collected before it is ready.

## Design choices

- Prices use floating-point Philippine peso values throughout the API and database. This supports fractional-peso prices, but binary floating-point arithmetic can introduce small rounding differences; exact decimal arithmetic would be preferable if strict financial precision becomes a requirement.
- Checkout uses a PostgreSQL serializable transaction to validate all requested items and inventory before saving the order and deducting stock.
- Order lines store the dish name and unit price at checkout, preserving order history if the menu item changes later.
- Each order receives a sequential order number. Customers can see its status on the ordering page, which updates automatically when staff mark it ready or collected.
- The admin dashboard keeps orders in the current-orders list while they are being prepared and ready for pickup. Staff mark orders ready, then collected.
- Collected orders appear in order history, where the admin can see total income from collected orders.
- Archiving hides a dish from new orders while keeping it available in menu management and preserving its previous order data.
- The customer ordering page and menu/order administration are separate views in the same React app, available at `/` and `/admin`.
- The API applies EF Core migrations and seeds the initial menu when it starts.

## Manual smoke checklist

1. Add, edit, and archive a menu item.
2. Add items to an order and place it. Confirm stock decreases and the order appears in **Current orders** in the admin page. It remains there after being marked ready.
3. Attempt to order more than available stock and confirm the order is rejected with no stock change.
4. Confirm archived dishes are absent from the order menu but remain in Menu management.
5. Mark an order ready, then collected; confirm the customer sees each status and the order moves from **Current orders** to admin **Order history**, where it contributes to total income.

## AI use

OpenAI Codex helped scaffold the project, draft parts of the API, UI, and tests, and run build checks. GitHub Copilot assisted with later refinements, including clearer names and separating endpoint and application sections into focused files. Docker Desktop's Gordon helped troubleshoot an issue with `docker compose up --build`. I reviewed the generated changes and made the project decisions and final edits.
