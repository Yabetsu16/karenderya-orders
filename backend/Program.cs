using System.Data;
using KarenderyaOrders.Api.Data;
using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("Connection string 'Postgres' is required.");

builder.Services.AddDbContext<OrdersDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitializeAsync(db);
}

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/food-items", async (bool includeArchived, OrdersDbContext db) =>
{
    var query = db.FoodItems.AsNoTracking();
    if (!includeArchived) query = query.Where(item => !item.IsArchived);
    var items = await query.OrderBy(item => item.Name).Select(item => new FoodItemResponse(
        item.Id, item.Name, item.PriceCentavos, item.AvailableOrderQty, item.IsArchived)).ToListAsync();
    return Results.Ok(items);
});

app.MapPost("/api/food-items", async (FoodItemRequest request, OrdersDbContext db) =>
{
    var error = ValidateFoodItem(request);
    if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["foodItem"] = [error] });
    var item = new FoodItem { Name = request.Name.Trim(), PriceCentavos = request.PriceCentavos, AvailableOrderQty = request.AvailableOrderQty };
    db.FoodItems.Add(item);
    await db.SaveChangesAsync();
    return Results.Created($"/api/food-items/{item.Id}", new FoodItemResponse(item.Id, item.Name, item.PriceCentavos, item.AvailableOrderQty, item.IsArchived));
});

app.MapPut("/api/food-items/{id:guid}", async (Guid id, FoodItemRequest request, OrdersDbContext db) =>
{
    var error = ValidateFoodItem(request);
    if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["foodItem"] = [error] });
    var item = await db.FoodItems.FindAsync(id);
    if (item is null) return Results.NotFound();
    item.Name = request.Name.Trim();
    item.PriceCentavos = request.PriceCentavos;
    item.AvailableOrderQty = request.AvailableOrderQty;
    await db.SaveChangesAsync();
    return Results.Ok(new FoodItemResponse(item.Id, item.Name, item.PriceCentavos, item.AvailableOrderQty, item.IsArchived));
});

app.MapDelete("/api/food-items/{id:guid}", async (Guid id, OrdersDbContext db) =>
{
    var item = await db.FoodItems.FindAsync(id);
    if (item is null) return Results.NotFound();
    item.IsArchived = true;
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapGet("/api/orders", async (OrdersDbContext db) =>
{
    var orders = await db.Orders.AsNoTracking().Include(order => order.Lines).OrderByDescending(order => order.CreatedAt)
        .Select(order => new OrderResponse(order.Id, order.CreatedAt, order.TotalCentavos,
            order.Lines.OrderBy(line => line.ItemName).Select(line => new OrderLineResponse(line.ItemName, line.UnitPriceCentavos, line.Quantity)).ToList())).ToListAsync();
    return Results.Ok(orders);
});

app.MapPost("/api/orders", async (CreateOrderRequest request, OrdersDbContext db) =>
{
    if (request.Items is null || request.Items.Count == 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["An order needs at least one item."] });
    if (request.Items.Any(item => item.Quantity <= 0))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["Every quantity must be greater than zero."] });
    if (request.Items.GroupBy(item => item.FoodItemId).Any(group => group.Count() > 1))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["Each food item may appear only once."] });

    await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
    var ids = request.Items.Select(item => item.FoodItemId).ToList();
    var foodItems = await db.FoodItems.Where(item => ids.Contains(item.Id)).ToDictionaryAsync(item => item.Id);
    if (foodItems.Count != ids.Count || request.Items.Any(line => foodItems[line.FoodItemId].IsArchived))
        return Results.Conflict(new { message = "One or more food items are unavailable." });
    if (request.Items.Any(line => foodItems[line.FoodItemId].AvailableOrderQty < line.Quantity))
        return Results.Conflict(new { message = "There is not enough inventory to complete this order." });

    var order = new Order();
    foreach (var requestLine in request.Items)
    {
        var foodItem = foodItems[requestLine.FoodItemId];
        foodItem.AvailableOrderQty -= requestLine.Quantity;
        order.Lines.Add(new OrderLine { FoodItemId = foodItem.Id, ItemName = foodItem.Name, UnitPriceCentavos = foodItem.PriceCentavos, Quantity = requestLine.Quantity });
    }
    order.TotalCentavos = order.Lines.Sum(line => line.UnitPriceCentavos * line.Quantity);
    db.Orders.Add(order);
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/orders/{order.Id}", new OrderResponse(order.Id, order.CreatedAt, order.TotalCentavos,
        order.Lines.Select(line => new OrderLineResponse(line.ItemName, line.UnitPriceCentavos, line.Quantity)).ToList()));
});

app.Run();

static string? ValidateFoodItem(FoodItemRequest request) =>
    string.IsNullOrWhiteSpace(request.Name) ? "Name is required." : request.Name.Trim().Length > 100 ? "Name must be 100 characters or fewer." :
    request.PriceCentavos <= 0 ? "Price must be greater than zero." : request.AvailableOrderQty < 0 ? "Inventory cannot be negative." : null;

public partial class Program { }

record FoodItemRequest(string Name, int PriceCentavos, int AvailableOrderQty);
record FoodItemResponse(Guid Id, string Name, int PriceCentavos, int AvailableOrderQty, bool IsArchived);
record CreateOrderRequest(List<CreateOrderLineRequest> Items);
record CreateOrderLineRequest(Guid FoodItemId, int Quantity);
record OrderResponse(Guid Id, DateTimeOffset CreatedAt, int TotalCentavos, List<OrderLineResponse> Lines);
record OrderLineResponse(string ItemName, int UnitPriceCentavos, int Quantity);
