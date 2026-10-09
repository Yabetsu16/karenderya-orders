using System.Data;
using KarenderyaOrders.Api.Data;
using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace KarenderyaOrders.Api.Endpoints;

public static class OrderEndpoints
{
    public static WebApplication MapOrderEndpoints(this WebApplication app)
    {
        app.MapGet("/api/orders", async (OrdersDbContext db) =>
        {
            var orders = await db.Orders.AsNoTracking().Where(order => !order.IsCollected).Include(order => order.Lines).OrderBy(order => order.CreatedAt)
                .Select(order => new OrderResponse(order.Id, order.OrderNumber, order.CreatedAt, order.Total, order.IsReady, order.IsCollected,
                    order.Lines.OrderBy(line => line.ItemName).Select(line => new OrderLineResponse(line.ItemName, line.UnitPrice, line.Quantity)).ToList())).ToListAsync();
            return Results.Ok(orders);
        });

        app.MapGet("/api/orders/history", async (OrdersDbContext db) =>
        {
            var orders = await db.Orders.AsNoTracking().Where(order => order.IsCollected).Include(order => order.Lines).OrderByDescending(order => order.CreatedAt)
                .Select(order => new OrderResponse(order.Id, order.OrderNumber, order.CreatedAt, order.Total, order.IsReady, order.IsCollected,
                    order.Lines.OrderBy(line => line.ItemName).Select(line => new OrderLineResponse(line.ItemName, line.UnitPrice, line.Quantity)).ToList())).ToListAsync();
            return Results.Ok(orders);
        });

        app.MapGet("/api/orders/{orderNumber:int}", async (int orderNumber, OrdersDbContext db) =>
        {
            var order = await db.Orders.AsNoTracking().Where(order => order.OrderNumber == orderNumber).Select(order =>
                new OrderStatusResponse(order.OrderNumber, order.IsReady, order.IsCollected)).SingleOrDefaultAsync();
            return order is null ? Results.NotFound() : Results.Ok(order);
        });

        app.MapPost("/api/orders/{orderNumber:int}/ready", async (int orderNumber, OrdersDbContext db) =>
        {
            var order = await db.Orders.SingleOrDefaultAsync(order => order.OrderNumber == orderNumber);
            if (order is null) return Results.NotFound();
            order.IsReady = true;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapPost("/api/orders/{orderNumber:int}/collected", async (int orderNumber, OrdersDbContext db) =>
        {
            var order = await db.Orders.SingleOrDefaultAsync(order => order.OrderNumber == orderNumber);
            if (order is null) return Results.NotFound();
            if (!order.IsReady)
                return Results.Conflict(new { message = "An order must be marked ready before it can be collected." });
            order.IsCollected = true;
            await db.SaveChangesAsync();
            return Results.NoContent();
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
                order.Lines.Add(new OrderLine { FoodItemId = foodItem.Id, ItemName = foodItem.Name, UnitPrice = foodItem.Price, Quantity = requestLine.Quantity });
            }
            order.Total = order.Lines.Sum(line => line.UnitPrice * line.Quantity);
            db.Orders.Add(order);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Created($"/api/orders/{order.OrderNumber}", new OrderResponse(order.Id, order.OrderNumber, order.CreatedAt, order.Total, order.IsReady, order.IsCollected,
                order.Lines.Select(line => new OrderLineResponse(line.ItemName, line.UnitPrice, line.Quantity)).ToList()));
        });

        return app;
    }
}

public sealed record CreateOrderRequest(List<CreateOrderLineRequest> Items);
public sealed record CreateOrderLineRequest(Guid FoodItemId, int Quantity);
public sealed record OrderResponse(Guid Id, int OrderNumber, DateTimeOffset CreatedAt, double Total, bool IsReady, bool IsCollected, List<OrderLineResponse> Lines);
public sealed record OrderStatusResponse(int OrderNumber, bool IsReady, bool IsCollected);
public sealed record OrderLineResponse(string ItemName, double UnitPrice, int Quantity);
