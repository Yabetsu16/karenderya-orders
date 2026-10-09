# Karenderya Orders: Code Guide

This guide describes the main source and configuration files in the project in plain language. It focuses on code written for this application. Generated build output, dependency folders, and lockfiles are not explained line by line because they are generated or maintained by the tooling.

## 1. Overall request flow

The application has three main parts:

1. **Frontend:** React displays the customer menu and admin screens.
2. **Backend:** ASP.NET Core receives HTTP requests and applies the application rules.
3. **Database:** PostgreSQL stores menu items, orders, and order lines.

Menu and order prices are `double` values expressed directly in Philippine pesos. Checkout creates an order with a database-generated order number and snapshots the purchased item names and prices. An order stays in the current-orders list while it is being prepared and after it is ready; marking it collected moves it into order history.

Customers can follow the most recently placed order in the same browser. Its order number is stored in `localStorage`, and the page polls the status endpoint until the order is collected. The admin dashboard provides current-order actions and a separate history view that totals collected-order income.

## 2. Backend

### `backend/Program.cs` — application startup

This is the backend's entry point.

- `using` statements make the database classes, endpoint registration methods, and EF Core available in this file.
- `WebApplication.CreateBuilder(args)` loads configuration and prepares the services the application will need.
- The connection string lookup reads the database address from configuration. If the setting is missing, the `?? throw` expression stops startup with an explicit error.
- `AddDbContext<OrdersDbContext>(...)` registers the database context with dependency injection. `UseNpgsql` tells EF Core to connect using PostgreSQL.
- `AddCors(...)` allows the browser-based frontend at `http://localhost:5173` to make requests to the API.
- `builder.Build()` creates the running web application.
- `app.UseCors()` enables the CORS policy for incoming requests.
- The startup scope resolves an `OrdersDbContext`, runs `MigrateAsync()` to apply pending database migrations, and calls `SeedData.InitializeAsync()` to add sample dishes if needed.
- The three `Map...Endpoints()` calls register the health, food-item, and order routes.
- `app.Run()` starts the web server.
- `public partial class Program` lets the integration-test project reference the app entry point when it creates an in-memory test server.

### `backend/Endpoints/HealthEndpoints.cs` — health check

- `HealthEndpoints` groups the routes for basic application health.
- `MapHealthEndpoints` is an extension method, so startup can call it as `app.MapHealthEndpoints()`.
- `GET /api/health` returns a small JSON object with status `ok`. It is useful for checking that the API process responds.
- Returning `app` from the registration method allows endpoint-registration calls to be chained if needed.

### `backend/Endpoints/FoodItemEndpoints.cs` — menu API

`FoodItemEndpoints` groups the HTTP routes for menu items. `MapFoodItemEndpoints` registers each route on the web application and returns it when registration is complete.

#### `GET /api/food-items`

- ASP.NET binds the `includeArchived` query-string value and injects `OrdersDbContext`.
- The query begins with all food items.
- `AsNoTracking()` tells EF Core that the results are read-only, avoiding change-tracking overhead.
- If `includeArchived` is false, the query filters out archived items.
- `OrderBy` sorts by name, and `Select` converts each database entity into a `FoodItemResponse`.
- `ToListAsync()` runs the database query asynchronously.
- `Results.Ok(items)` returns the list with HTTP status 200.

#### `POST /api/food-items`

- ASP.NET deserializes the JSON body into `FoodItemRequest`.
- `ValidateFoodItem` checks the required input rules. If a rule fails, the endpoint returns a validation-problem response.
- `Trim()` removes spaces at the beginning and end of the submitted name.
- `AnyAsync` checks whether an active item already has the same name after converting both names to lowercase. Archived dishes do not block adding the name again.
- If a duplicate exists, `Results.Conflict` returns HTTP 409 and a message that the frontend can show.
- Otherwise, the endpoint creates a `FoodItem` entity and adds it to the EF Core context.
- `SaveChangesAsync()` inserts it into PostgreSQL.
- `Results.Created(...)` returns HTTP 201, a resource URL, and the new item's response data.

#### `PUT /api/food-items/{id}`

- The route's `{id}` segment is parsed as a GUID and the body is parsed as a `FoodItemRequest`.
- The endpoint validates the submitted data and looks up the item by its ID.
- If no item exists, it returns HTTP 404.
- It checks the proposed name against other active items. `other.Id != id` allows the item to keep its own current name.
- If there is no conflict, it updates the name, price, and available quantity.
- `SaveChangesAsync()` persists the updates, and `Results.Ok(...)` returns the updated item.

#### `DELETE /api/food-items/{id}` — archive

- The endpoint finds the item by ID.
- It returns HTTP 404 if the item cannot be found.
- Instead of deleting the row, it sets `IsArchived` to `true`.
- Saving this change hides the dish from the customer menu while retaining it for management and historical records.
- It returns HTTP 204, meaning the operation succeeded and there is no response body.

#### `POST /api/food-items/{id}/unarchive`

- The endpoint looks up the item and returns 404 if it does not exist.
- It checks whether another active item already has the same name, ignoring case.
- If such an item exists, it returns HTTP 409 with a duplicate-name message.
- Otherwise, it sets `IsArchived` to `false`, saves the change, and returns HTTP 204.

#### `ValidateFoodItem`

This private helper returns an error string when the request is invalid, or `null` when it passes:

1. The name must not be empty or whitespace.
2. The trimmed name must be no longer than 100 characters.
3. The price must be greater than zero.
4. Available inventory must not be negative.

The endpoint uses that returned value to decide whether to return a validation error or continue saving.

#### Food-item request and response records

- `FoodItemRequest` is the JSON shape the API accepts: name, peso-valued price, and available quantity.
- `FoodItemResponse` is the JSON shape returned by the API: ID, name, peso-valued price, available quantity, and archive status.
- These records are API data shapes, not database tables. The endpoint explicitly maps between the records and the database entity.

### `backend/Endpoints/OrderEndpoints.cs` — order API

`OrderEndpoints` groups the routes for current orders, collected history, customer status, lifecycle actions, and checkout.

#### `GET /api/orders` and `GET /api/orders/history`

- The endpoint injects the database context.
- `AsNoTracking()` marks the query as read-only.
- `Include(order => order.Lines)` loads each order's detail lines.
- `/api/orders` returns uncollected orders, oldest first, so the admin can work through current orders in sequence. Ready orders remain here until collected.
- `/api/orders/history` returns collected orders, newest first.
- `Select` maps each entity and its lines into `OrderResponse` and `OrderLineResponse` objects.
- The nested ordering sorts the lines by item name.
- `ToListAsync()` executes the query asynchronously; `Results.Ok(...)` returns HTTP 200 and the list.

#### `GET /api/orders/{orderNumber}`, `POST .../ready`, and `POST .../collected`

- The status endpoint returns the order number and its `isReady` and `isCollected` flags, or 404 when the order number does not exist.
- The admin calls the ready endpoint to mark an order ready. This does not remove the order from current orders.
- The collected endpoint requires the order to be ready; otherwise it returns HTTP 409. A successful collection sets `IsCollected`, after which the order appears in history instead of current orders.

#### `POST /api/orders`

The request is checked before anything is saved:

1. The order must have at least one item.
2. Every quantity must be greater than zero.
3. A food item cannot appear twice in the request; callers should send one line per distinct item.

Invalid requests return a validation-problem response.

For a valid-shaped request:

- `BeginTransactionAsync(IsolationLevel.Serializable)` starts a database transaction. Serializable isolation helps protect stock checks from overlapping checkouts.
- The endpoint gathers the requested food IDs and loads matching items into a dictionary, indexed by ID.
- It rejects the checkout if an item is missing or archived.
- It then checks that every item has enough available stock. If not, it returns a conflict response.
- For each requested line, it subtracts the quantity from inventory and creates an `OrderLine`.
- The order line copies the menu item's name and price. This is a historical snapshot: future menu edits will not change what this order recorded.
- The order total is calculated by adding `UnitPrice * Quantity` for every line.
- The order is added to the context, and `SaveChangesAsync()` writes the changes.
- `CommitAsync()` confirms the transaction. If the operation fails before that, the transaction is not committed.
- `Results.Created(...)` returns HTTP 201, the new order URL, and its response data.

The `System.Data` import is used for `IsolationLevel.Serializable`.

#### Order request and response records

- `CreateOrderRequest` wraps the list of requested lines under the JSON property `items`.
- `CreateOrderLineRequest` contains a food-item GUID and quantity.
- `OrderResponse` describes an order sent back to the client: its ID, creation time, total, and lines.
- `OrderResponse` also includes the sequential `orderNumber`, `isReady`, and `isCollected` fields.
- `OrderStatusResponse` is the smaller response used for customer status polling.
- `OrderLineResponse` describes each purchased item's saved name, peso-valued unit price, and quantity.

### `backend/Models/Entities.cs` — database entities

These classes represent data persisted in PostgreSQL:

- `FoodItem` has a GUID ID, name, `double` price in pesos, inventory quantity, and archive flag. Its ID is initialized when an instance is created.
- `Order` has a GUID ID, database-generated sequential order number, UTC creation timestamp, `double` total in pesos, readiness and collection flags, and a list of order lines.
- `OrderLine` has a GUID ID, the related food-item ID, the saved item name and `double` unit price in pesos, quantity, and the parent order ID.
- `OrderLine.Orders` is the C# navigation property to the parent `Order`. The `OrderId` property is the actual foreign-key value.
- `null!` tells the C# nullable-reference checker that EF Core will populate the navigation property when needed.

### `backend/Data/OrdersDbContext.cs` — EF Core database context

- `OrdersDbContext` inherits from EF Core's `DbContext` and receives its configuration through its constructor.
- `FoodItems`, `Orders`, and `OrderLines` expose the corresponding entity sets to queries and saves.
- `OnModelCreating` specifies extra database mapping rules:
  - Food-item names are limited to 100 characters and indexed.
  - Order-line item names are limited to 100 characters.
  - Each order line points to one order; one order can have many lines.
  - The foreign key is `OrderId`.

### `backend/Data/SeedData.cs` — initial menu entries

- `InitializeAsync` checks whether any food items exist.
- If the menu is non-empty, it returns without adding anything.
- Otherwise, it adds three sample dishes with prices and stock quantities, then saves them.
- This runs after migrations at backend startup.

### `backend/Migrations/20261008045051_InitialCreate.cs` — database migration

EF Core executes the `Up` method to apply this migration:

- `CreateTable("FoodItems", ...)` creates the menu table with an ID primary key, name, price, stock, and archive flag.
- `CreateTable("Orders", ...)` creates the order table with ID, creation time, and total.
- `CreateTable("OrderLines", ...)` creates purchased-line records and adds a foreign key from each line's `OrderId` to `Orders.Id`.
- `CreateIndex` creates indexes used to efficiently search/sort menu names and find lines belonging to an order.

The `Down` method drops those tables to undo this migration. It is intended for migration rollback, not as normal application behavior.

### `backend/Migrations/20261008045051_InitialCreate.Designer.cs` — migration metadata

This file is generated by EF Core alongside the migration. Its `BuildTargetModel` method describes the model as it existed when the initial migration was created, including columns, primary keys, indexes, and the order-line relationship.

It helps EF Core understand the historical model for migration operations. It should generally be changed by EF tooling, not by hand.

### `backend/Migrations/OrdersDbContextModelSnapshot.cs` — current model reference

This generated file records the model EF Core currently considers the latest migration state. When scaffolding a new migration, EF Core compares the application's current model with this snapshot and generates the differences.

The snapshot represents the current entities, including double-precision peso prices, order numbers, readiness, and collection. Editing this snapshot alone does not run SQL or change an existing database.

The migrations build up that schema in stages: `InitialCreate` creates the menu and order tables; `UseFloatingPointPrices` converts stored centavo integers into peso-valued double-precision columns; `AddOrderNumbersAndReadiness` adds sequential order numbers and readiness; and `AddCollectedOrderLifecycle` adds collection status and marks orders that were already ready as collected.

## 3. Frontend

### `frontend/index.html` — browser page shell

- The document declares a basic HTML page and viewport settings for mobile sizing.
- `<div id="root"></div>` is the empty element where React mounts the application.
- The module script loads `/src/main.tsx`, which starts the frontend.

### `frontend/src/main.tsx` — frontend application and actions

This file connects application state, API calls, and visual components.

#### Imports and constants

- React hooks provide state, initial loading, and memoized calculations.
- `createRoot` attaches React to the HTML root element.
- Component imports provide the header, customer ordering screen, admin form, menu list, current orders, and collected order history.
- `FoodItem`, `Order`, `OrderStatus`, and `FormValues` provide TypeScript data shapes.
- `apiBase` reads the backend URL from Vite's environment, falling back to `http://localhost:8080`.
- `emptyForm` is the initial/cleared state for the admin form.

#### `request<T>`

This generic helper sends a request to the backend:

- It combines `apiBase`, a route path, and optional fetch settings.
- It sets a JSON content-type header.
- For unsuccessful HTTP responses, it tries to read an API message or validation error and throws an `Error`.
- For HTTP 204, it returns `undefined` because there is no response body.
- Otherwise, it parses and returns JSON as the requested TypeScript type `T`.

#### `App` state

- `items` stores menu items.
- `orders` stores uncollected current orders; `historyOrders` stores collected orders when the history view is opened.
- `cart` maps each food ID to a selected quantity.
- `form` stores current admin form values.
- `editing` holds the menu item currently being edited, or `null` if creating a new item.
- `message` stores feedback for the user.
- `busy` tracks an active checkout or save operation.
- `showingHistory` tracks the admin's current dashboard/history view.
- `trackedOrder` holds the customer order status loaded from `localStorage` and refreshed from the API.
- `isAdmin` checks whether the current page path is exactly `/admin`.

#### Loading and derived values

- `refresh` requests the menu including archived items and current uncollected orders in parallel. `refreshHistory` separately requests collected order history.
- `useEffect` calls `refresh` when the app is first mounted. If loading fails, it shows the error message.
- A second effect polls `GET /api/orders/{orderNumber}` every three seconds until the tracked order is collected. It retries temporary failures after five seconds. A 404 clears stale browser tracking and explains that the order may have disappeared after a database reset.
- `activeItems` filters out archived items for customer ordering.
- `total` adds each active item's price multiplied by its cart quantity. `useMemo` recalculates it when the menu or cart changes.

#### Menu and checkout actions

- `changeQuantity` adjusts one cart quantity while keeping it from going below zero or above the available inventory.
- `saveItem` prevents normal form submission, marks the app busy, sends the entered peso amount as a number, and sends either a create or update request. It clears the form, reloads data, and displays success or error feedback.
- `archive` asks for confirmation, calls the API, removes the item from the cart, refreshes data, and displays a result.
- `unarchive` calls the restore endpoint, reloads data, and displays either success or an API error such as a duplicate name.
- `checkout` converts cart entries into the request shape, rejects an empty cart, posts the order, saves the returned order number to `localStorage`, starts customer status tracking, and refreshes current orders. On success it clears the cart.
- `beginEdit` copies an item's values into the form and displays its peso price to two decimal places.
- `cancelEdit` exits edit mode and clears the form.

#### JSX rendering

- The `<main>` element contains the whole page.
- `AppHeader` receives whether the page is admin, whether history is open, and a callback to switch between the dashboard and history.
- A status message is rendered only when one exists.
- Customer URLs render `CustomerOrder` with active items and callback functions.
- The admin URL renders `MenuItemForm`, `MenuManagement`, and `CurrentOrders` on the dashboard, or `OrderHistory` in the history view. Collected income is calculated by summing the fetched history orders' totals.
- At the bottom, `createRoot(...).render(<App />)` mounts the React component.

### `frontend/src/components/AppHeader.tsx` — page header

- `AppHeaderProps` defines the data this component needs: admin mode, history-view state, and the toggle callback.
- `AppHeader` displays the brand, title, and a short page description. On the admin page, its button switches between the dashboard and order history.

### `frontend/src/components/CustomerOrder.tsx` — customer menu and cart controls

- `CustomerOrderProps` lists the menu, cart quantities, total, busy state, tracked order status, and callbacks provided by `main.tsx`.
- An empty menu displays a no-dishes message.
- Otherwise, `items.map(...)` creates one menu row per dish, showing its name, formatted price, and stock.
- The minus and plus buttons call `onQuantityChange`. The plus button is disabled when stock is zero or the cart has reached the available quantity.
- The customer screen uses a responsive two-column layout on wider screens: the menu is separate from the order-summary card. The summary itemizes quantities and line totals and places the Place order button at the bottom. It also displays the tracked order number and preparing, ready, or collected status.
- This component displays data and notifies its parent; it does not call the API itself.

### `frontend/src/components/MenuItemForm.tsx` — add/edit form

- `MenuItemFormProps` describes the selected item, form values, busy state, and callbacks.
- The heading changes between adding and editing.
- The inputs are controlled by React: each input's `value` comes from `form`, and each `onChange` calls `onFormChange` with the new value.
- The price field accepts decimal peso values; the parent sends the numeric value directly to the API.
- The stock field accepts whole numbers.
- Submitting calls `onSubmit`, which is implemented in `main.tsx`.
- The Cancel button appears only during editing and calls `onCancel`.

### `frontend/src/components/MenuManagement.tsx` — admin menu list

- The props provide the list and callbacks for edit/archive/restore.
- Each menu item is rendered as an article with a stable React `key`.
- Archived items get the `archived` CSS class and an Unarchive button.
- Active items get Edit and Archive buttons.
- The buttons call callbacks supplied by `main.tsx`; this keeps API work out of the presentation component.

### `frontend/src/components/CurrentOrders.tsx` — admin current orders

- This component shows every order that has not yet been collected, with its order number, time, line summary, and total.
- Preparing orders have a Mark ready action; ready orders have a Mark collected action. The parent supplies the callbacks that call the API and refresh the list.

### `frontend/src/components/OrderHistory.tsx` — collected orders

- The component receives an array of orders.
- If there are no collected orders, it displays a short empty-state message.
- Otherwise, it renders each order with a localized date/time, a summary of its line quantities and names, and a formatted total.
- It also displays total income, passed from the parent as the sum of collected order totals.
- It uses the saved order-line values returned by the backend.

### `frontend/src/types.ts` — frontend data shapes

- `FoodItem` describes the JSON fields for a menu item.
- `Order` describes an order and its lines.
- `OrderStatus` describes the order number and readiness/collection flags used by customer polling.
- `FormValues` describes the strings held by the admin form inputs.
- These are TypeScript-only types. They help the build catch mismatched property names but are not sent to the browser as runtime objects.

### `frontend/src/format.ts` — price display

`formatPrice` accepts a peso-valued number and uses `Intl.NumberFormat` with the `en-PH` locale and `PHP` currency to produce formatted output. It does not convert centavos. Prices use floating-point values as requested; exact decimal arithmetic is not guaranteed by binary floating point.

### `frontend/src/styles.css` — visual styling

The stylesheet defines the app's appearance:

- `:root` chooses the default font, text color, and background.
- Global selectors apply consistent sizing and inherit fonts into buttons and inputs.
- Button and disabled-button rules define colors, spacing, and cursor feedback.
- `main`, `header`, and heading rules establish layout and typography.
- `.panel`, `.total`, and `.message` style the major content areas and feedback.
- `.menu-item`, `.compact-list`, `.history`, and `.stepper` arrange menu/order rows and quantity controls.
- `.archived` visually fades archived menu entries.
- The customer menu and order summary use two columns on wider screens and stack at 900px or narrower. The 760px media query also adapts header/form layouts and input widths for smaller screens.

### `frontend/src/vite-env.d.ts` — Vite type declarations

The triple-slash reference loads Vite's TypeScript declarations. Those declarations provide types for Vite features such as `import.meta.env`.

### `frontend/vite.config.ts` — frontend build configuration

- `defineConfig` provides typed Vite configuration.
- `react()` enables Vite's React plugin, including support for React's JSX transform and development behavior.
- The exported object is read by Vite when serving or building the frontend.

### `frontend/tsconfig.json` — TypeScript compiler settings

This file configures TypeScript:

- `target` and `lib` select modern JavaScript and browser APIs.
- `strict` enables stricter type checking.
- `module` and `moduleResolution` configure modern ES modules and Vite-style resolution.
- `jsx` selects React's automatic JSX transform.
- `noEmit` means TypeScript checks the code but does not generate JavaScript; Vite performs the bundling.
- `include` tells TypeScript to analyze files under `src`.

## 4. Tests

### `backend.tests/OrdersApiTests.cs` — API integration tests

These tests exercise the whole HTTP path, not just individual helper methods.

- `DatabaseCollection` shares one PostgreSQL test container among tests in the collection and disables parallel execution for that collection.
- `DatabaseFixture` starts and stops a temporary PostgreSQL container and provides its connection string.
- `OrdersApiTests` creates a test web application configured to use that database.
- `InitializeAsync` creates the test application and HTTP client before each test.
- `DisposeAsync` disposes the test application.
- `Checkout_decrements_inventory_and_keeps_the_price_snapshot` submits an order and checks the order number, response total, saved unit price, and reduced stock.
- `Fractional_peso_price_is_saved_and_used_in_order_total` checks that a decimal peso price is preserved and multiplied into the order total.
- `Order_remains_current_when_ready_and_moves_to_history_when_collected` checks status, the ready transition, and movement to collected history.
- `Order_cannot_be_collected_before_it_is_ready` checks the invalid lifecycle transition.
- `Checkout_with_insufficient_stock_does_not_change_inventory` requests more stock than available and verifies a conflict response and unchanged inventory.
- `Archived_item_is_hidden_from_new_orders_but_still_available_in_management_list` creates and archives a dish, then checks customer and admin lists.
- `Unarchive_makes_item_available_again` archives a dish, restores it, and verifies it appears in the active menu.
- `Creating_food_with_existing_menu_name_returns_conflict_message` verifies case-insensitive duplicate detection and the error message.
- `Menu` is a test helper for requesting menu items with or without archived entries.
- `TestAppFactory` replaces the database-context registration so the test server uses the fixture's mapped PostgreSQL connection string.
- The response records at the end describe JSON values deserialized by tests.

### `backend.tests/UnitTest1.cs` — template placeholder

This is an empty test class left by the test-project template. Its `Test1` method currently contains no assertions and does not verify application behavior.

### `backend.tests/KarenderyaOrders.Api.Tests.csproj` — test project definition

This project file:

- Targets .NET 10 and enables nullable checking and implicit usings.
- References xUnit, the .NET test SDK, FluentAssertions, ASP.NET's test server, and Testcontainers for PostgreSQL.
- References the backend project so tests can start and exercise the real API code.
- Adds the xUnit namespace as a global using.

## 5. Runtime and project configuration

### `backend/KarenderyaOrders.Api.csproj`

Defines the ASP.NET backend project:

- Targets .NET 10.
- Enables nullable checking and implicit common `using` directives.
- References EF Core design-time tools for migrations.
- References the Npgsql EF Core provider for PostgreSQL.

### `backend/appsettings.json`

Provides default backend settings:

- `ConnectionStrings:Postgres` supplies the default local PostgreSQL connection string.
- `Logging` sets log levels.
- `AllowedHosts` controls which host names the ASP.NET app accepts. The checked-in value is `*`.

### `backend/appsettings.Development.json`

Provides extra logging settings for development. ASP.NET loads it when the environment is `Development`, layering these values over `appsettings.json`.

### `backend/Properties/launchSettings.json`

Defines local development launch profiles:

- `http` starts the app at `http://localhost:5188`.
- `https` starts it at HTTPS port 7116 and HTTP port 5188.
- Both profiles set the ASP.NET environment to `Development`.

These profiles are for local development tools; Docker uses its own configured ports.

### `docker-compose.yml`

Defines the services used to run the complete app with Docker Compose:

- `postgres` starts PostgreSQL 16, creates the app database and user, exposes port 5432, persists data in the `postgres_data` volume, and uses `pg_isready` as a health check.
- `api` builds the backend image, points its connection string at the `postgres` service, waits until PostgreSQL is healthy, and exposes port 8080.
- `web` builds the frontend image, sets the API base URL, waits for the API service, and exposes port 5173.
- The named `postgres_data` volume preserves database content across container restarts. Removing the volume removes that stored data.

### `backend/Dockerfile`

Builds and runs the ASP.NET API as a container using two stages:

- The `build` stage uses the .NET SDK image, restores NuGet packages, copies the backend source, and publishes a Release build.
- The final stage uses the smaller ASP.NET runtime image, copies in the published output, exposes port 8080, configures ASP.NET to listen on that port, and starts `KarenderyaOrders.Api.dll`.

Separating build and runtime stages keeps the final image from needing the full SDK.

### `frontend/Dockerfile`

Builds the frontend container:

- Starts from a Node Alpine image and sets `/app` as the working directory.
- Copies the npm manifests and runs `npm ci` to install the exact locked dependencies.
- Copies the frontend source, exposes port 5173, and starts the Vite development server.

### `KarenderyaOrders.slnx`

This solution file groups the backend API project and the backend test project. It lets .NET tools build or test both projects together.

### `.gitignore`

Tells Git not to track generated build output (`bin` and `obj`), frontend installed packages (`node_modules`), generated frontend output (`dist`), TypeScript build info, and local `.env` files. This keeps machine-specific or generated files out of normal source changes.

### `frontend/package.json`

Lists frontend dependencies and commands:

- `dev` starts the Vite development server and exposes it to the network.
- `build` first runs TypeScript project checks, then creates a production frontend bundle with Vite.
- Dependencies include React, React DOM, TypeScript, Vite, and the React Vite plugin.

### `frontend/package-lock.json`

This generated lockfile records exact package versions and dependency details resolved by npm. It helps different machines install a consistent frontend dependency tree. It is not application logic.

### `dotnet-tools.json`

Pins the local .NET tool manifest to the EF Core `dotnet-ef` command-line tool version used by this repository.

## 6. Putting it together: checkout example

1. `index.html` loads `frontend/src/main.tsx` into the page's `root` element.
2. `main.tsx` requests the menu from `GET /api/food-items`.
3. `FoodItemEndpoints` queries PostgreSQL through `OrdersDbContext` and returns `FoodItemResponse` values.
4. `CustomerOrder` displays each dish and lets the customer pick a quantity.
5. `main.tsx` calculates the peso-valued total and sends the cart to `POST /api/orders`.
6. `OrderEndpoints` validates the request, checks stock, then saves the order and inventory changes in one transaction.
7. The API returns the created order with a sequential order number and line-price snapshots.
8. The frontend clears the cart, remembers the order number in `localStorage`, refreshes the menu and current orders, and polls for readiness and collection.
9. The admin marks the order ready and then collected. Collection moves it to `/api/orders/history`, where it contributes to the income total.

## 7. File coverage

This guide covers the authored application source and the main project/runtime configuration files. It intentionally does not explain generated output under `bin`, `obj`, `dist`, or `node_modules`; these directories are produced by builds or package managers and are not maintained as application source.
