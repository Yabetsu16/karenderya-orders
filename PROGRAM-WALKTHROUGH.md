## 1. How the pieces work together

1. A customer or admin uses the React frontend.

2. The frontend calls the ASP.NET API, for example to load the menu or submit an order.

3. The API uses Entity Framework Core to read or write data in PostgreSQL.

4. On startup, the backend applies its database migration and adds starter menu items if the menu is empty.

5. The API sends JSON back to the frontend, which updates what’s displayed.

The frontend and backend use peso-valued floating-point prices (`double` in C# and PostgreSQL `double precision`). The frontend sends and calculates peso values directly, then formats them as Philippine currency. This follows the chosen design; binary floating-point arithmetic can have small precision limitations.

## 2. Backend startup

`Program.cs` is now mainly the backend’s setup and startup file.

- It reads the PostgreSQL connection string. If it’s missing, startup stops with an error instead of trying to connect without a database address.

- It registers `OrdersDbContext` with Entity Framework and the Npgsql PostgreSQL provider.

- It configures CORS to allow browser requests from the frontend at `http://localhost:5173`.

- It creates a database scope, applies any pending migrations, and seeds the menu if it’s empty.

- It registers the endpoints by resource:

  - `MapHealthEndpoints()`

  - `MapFoodItemEndpoints()`

  - `MapOrderEndpoints()`

This keeps startup separate from the details of handling each kind of API request.

## 3. Food-item API

`FoodItemEndpoints.cs` groups the menu-related routes.

### List menu items

`GET /api/food-items?includeArchived=true` returns menu items. When `includeArchived` is false, archived items are filtered out. When it’s true, the admin can see them too.

`AsNoTracking()` tells Entity Framework this is a read-only query, so it doesn’t need to track changes to each item.

### Add an item

`POST /api/food-items` validates the submitted name, price, and inventory. It trims extra spaces from the name and checks whether an active menu item already has that name, ignoring capitalization.

If another active item has the same name, the API returns a conflict response with the message:

\> A food with this name is already in the menu.

Otherwise, it saves the new item and returns `201 Created`.

### Edit an item

`PUT /api/food-items/{id}` finds the item by ID, validates the new values, and checks for another active item with the same name. If valid, it updates the item and returns the updated item. It returns `404 Not Found` if the ID doesn’t exist.

### Archive an item

`DELETE /api/food-items/{id}` doesn’t delete the record. It sets `IsArchived` to `true`. That hides the item from new orders but keeps its record available for menu management and historical orders.

### Unarchive an item

`POST /api/food-items/{id}/unarchive` sets `IsArchived` back to `false`, making the item available again. Before doing so, it checks for another active item with the same name. If one exists, it returns the same conflict message instead of creating a duplicate active menu entry.

### Validation and data shapes

`ValidateFoodItem` checks that the name is present and no longer than 100 characters, the price is greater than zero, and the inventory is not negative.

`FoodItemRequest` describes the data accepted from the client. `FoodItemResponse` describes the data returned to it. These records make the expected fields explicit.

## 4. Order API

`OrderEndpoints.cs` contains the order routes.

### Current orders, status, and collected history

`GET /api/orders` returns all uncollected orders, including their lines, oldest first. Orders stay in this list after being marked ready. `GET /api/orders/history` returns collected orders, newest first. Each line includes the name, peso-valued unit price, and quantity saved when the order was placed.

`GET /api/orders/{orderNumber}` returns the order number and its readiness and collection flags. The admin uses `POST /api/orders/{orderNumber}/ready` to mark an order ready. It then uses `POST /api/orders/{orderNumber}/collected` to record pickup; collecting an order that is not ready returns a conflict. Once collected, the order is shown in history instead of current orders.

### Place an order

`POST /api/orders` takes a list of food-item IDs and quantities. It checks that:

- The order contains at least one item.

- Every quantity is greater than zero.

- The same food item isn’t listed more than once.

- Every item exists, is not archived, and has enough inventory.

If the checks pass, it subtracts the ordered quantities from inventory, creates the order and its lines, calculates the total, and saves them.

The database transaction makes the related changes succeed or fail together. The `Serializable` isolation level also helps prevent two orders from both claiming the same remaining stock at the same time.

Each order line stores the item name and price at the time of purchase. That way, changing a menu item later doesn’t rewrite the details of an earlier order.

The request and response records at the bottom of this file define the JSON shapes used for creating and returning orders.

## 5. Health endpoint

`HealthEndpoints.cs` defines `GET /api/health`. It returns a small response indicating that the API is reachable.

## 6. Database model and migration

`Entities.cs` defines the main database records:

- `FoodItem` represents a menu item, including its floating-point peso price, available stock, and archive status.
- `Order` represents an order, with its sequential order number, date, peso-valued total, readiness and collection flags, and list of lines.
- `OrderLine` represents one dish and quantity in an order, including its saved name and floating-point peso unit price.

`OrdersDbContext.cs` connects those entity types to EF Core. Its `DbSet` properties represent the tables. Its model configuration sets length limits and indexes, and maps each order line to its order.

`20261008045051_InitialCreate.cs` creates the `FoodItems`, `Orders`, and `OrderLines` tables, along with their keys, relationship, and indexes. Later migrations convert integer-centavo prices to peso-valued floating-point columns (`20261009015218_UseFloatingPointPrices`), add sequential order numbers and readiness (`20261009023922_AddOrderNumbersAndReadiness`), and add collection status (`20261009024704_AddCollectedOrderLifecycle`). The last migration marks orders that were already ready as collected. Each migration's `Down` method describes its rollback.

`SeedData.cs` adds three sample menu items only when the database has no food items yet.

## 7. Frontend app state and API calls

`main.tsx` is the frontend coordinator. It holds the app’s data and decides what to do when an admin or customer performs an action.

### Loading data

`refresh()` requests the menu and current uncollected orders, then stores them in React state. It runs when the app first loads and after actions that change the data. The admin loads collected history separately when opening that view.

### Tracking state

The `useState` calls hold:

- `items`: menu items loaded from the API.

- `orders`: current uncollected orders.
- `historyOrders`: collected orders loaded for the admin history view.
- `trackedOrder`: the customer’s most recent order status.
- `showingHistory`: whether the admin dashboard or history is displayed.

- `cart`: quantities selected by the customer.

- `form`: the admin’s current name, price, and inventory values.

- `editing`: which item, if any, is being edited.

- `message`: success or error text.

- `busy`: whether an operation is in progress.

`activeItems` filters out archived items so they aren’t offered to customers.

`total` adds each active item’s price multiplied by its cart quantity. It uses `useMemo` so React recalculates the total when the menu or cart changes.

### Sending API requests

`request()` is a shared helper. It sends a fetch request to the configured API, throws a useful error if the API responds unsuccessfully, and returns the JSON result when one exists.

This helper is why actions such as create, archive, unarchive, and checkout can use a consistent request pattern.

### Admin actions

- `saveItem` sends the entered peso price as a number to the API as `price`. If an item is being edited, it uses `PUT`; otherwise, it uses `POST`.

- `archive` asks for confirmation, calls the archive endpoint, removes that item’s quantity from the cart, and reloads the data.

- `unarchive` calls the restore endpoint and reloads the data.

- `beginEdit` copies the item’s current values into the form and shows its price to two decimal places.

- `cancelEdit` clears the form and exits edit mode.

### Customer actions

`changeQuantity` changes the selected quantity but keeps it between zero and the item’s available stock.

`checkout` turns the cart into the list of item IDs and quantities expected by the API. It prevents submitting an empty cart, sends the order, saves the returned order number in browser `localStorage`, starts status tracking, clears the cart after success, and reloads the menu and current orders.

The status effect polls `GET /api/orders/{orderNumber}` every three seconds until the order is collected. It displays preparing, ready-for-pickup, or collected feedback. If the API returns 404 (for example, after a database reset), it clears the stale local order number and explains what happened. Temporary polling failures display a warning and are retried after five seconds.

Finally, `main.tsx` renders the header and chooses between customer ordering and the admin dashboard. Within the dashboard, the admin can switch between menu/current orders and collected order history.

## 8. Frontend components

The UI was split into smaller files so each component has a clear job. The components receive data and callback functions from `main.tsx`; they don’t own the API requests.

- `AppHeader.tsx` displays the heading and, for admin, a control to switch between the dashboard and order history.

- `CustomerOrder.tsx` displays available dishes, stock, quantity controls, the tracked order status, and a separate itemized order-summary card with the Place order button at the bottom. The menu and summary are two columns on wide screens and stack on smaller screens.

- `MenuItemForm.tsx` displays the add/edit form. It reports changes and submission to its parent through callbacks.

- `MenuManagement.tsx` displays the admin menu. Active items have Edit and Archive buttons; archived items have an Unarchive button. It delegates those actions to `main.tsx`.

- `CurrentOrders.tsx` displays uncollected orders and provides Mark ready/Mark collected actions.
- `OrderHistory.tsx` displays collected orders, their line summaries, dates, and totals, along with total income computed from the collected orders.

## 9. Frontend types and price formatting

`types.ts` defines the TypeScript shapes for menu items, orders, order status, and form values. TypeScript can use these to catch field mismatches while building the app.

The `NaN` issue happened because the frontend expected fields such as `priceCentavos`, while the API returned `price`. The frontend now uses the API’s `price`, `total`, and `unitPrice` field names.

`format.ts` formats a peso-valued number as Philippine pesos using `Intl.NumberFormat`. It does not divide by 100; for example, a value of `70` is formatted as ₱70.00.

## 10. Tests

`OrdersApiTests.cs` uses a temporary PostgreSQL container and sends HTTP requests to the running API through a test server.

The tests check that:

1. Checkout reduces inventory, assigns an order number, and saves the purchased price.

2. An order with insufficient stock is rejected without changing inventory.

3. Archived items are hidden from the customer list but remain visible to the admin.

4. Unarchiving makes an item available again.

5. Creating a duplicate active menu name returns the expected conflict response.

6. Fractional peso prices are saved and used to calculate an order total.

7. An order remains current when ready and moves to history after pickup.
8. An order cannot be collected before being marked ready.

The tests help verify behavior through the API instead of only checking individual methods in isolation.

## A note about the EF model snapshot

`OrdersDbContextModelSnapshot.cs` is generated by EF Core. It records what EF believes the data model looked like when migrations were generated, so future migration commands can compare the recorded model with the current one.

The snapshot records the current model so EF Core can compare it when scaffolding future migrations. Its `OrderLine` navigation is named `Orders`, matching the current entity. Generated migration metadata and the snapshot should normally be updated by EF tooling rather than edited by hand.
