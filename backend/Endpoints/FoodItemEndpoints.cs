using KarenderyaOrders.Api.Data;
using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace KarenderyaOrders.Api.Endpoints;

public static class FoodItemEndpoints
{
    public static WebApplication MapFoodItemEndpoints(this WebApplication app)
    {
        app.MapGet("/api/food-items", async (bool includeArchived, OrdersDbContext db) =>
        {
            var query = db.FoodItems.AsNoTracking();
            if (!includeArchived) query = query.Where(item => !item.IsArchived);
            var items = await query.OrderBy(item => item.Name).Select(item => new FoodItemResponse(
                item.Id, item.Name, item.Price, item.AvailableOrderQty, item.IsArchived)).ToListAsync();
            return Results.Ok(items);
        });

        app.MapPost("/api/food-items", async (FoodItemRequest request, OrdersDbContext db) =>
        {
            var error = ValidateFoodItem(request);
            if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["foodItem"] = [error] });
            var name = request.Name.Trim();
            if (await db.FoodItems.AnyAsync(item => !item.IsArchived && item.Name.ToLower() == name.ToLower()))
                return Results.Conflict(new { message = "A food with this name is already in the menu." });
            var item = new FoodItem { Name = name, Price = request.Price, AvailableOrderQty = request.AvailableOrderQty };
            db.FoodItems.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/food-items/{item.Id}", new FoodItemResponse(item.Id, item.Name, item.Price, item.AvailableOrderQty, item.IsArchived));
        });

        app.MapPut("/api/food-items/{id:guid}", async (Guid id, FoodItemRequest request, OrdersDbContext db) =>
        {
            var error = ValidateFoodItem(request);
            if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["foodItem"] = [error] });
            var item = await db.FoodItems.FindAsync(id);
            if (item is null) return Results.NotFound();
            var name = request.Name.Trim();
            if (await db.FoodItems.AnyAsync(other => other.Id != id && !other.IsArchived && other.Name.ToLower() == name.ToLower()))
                return Results.Conflict(new { message = "A food with this name is already in the menu." });
            item.Name = name;
            item.Price = request.Price;
            item.AvailableOrderQty = request.AvailableOrderQty;
            await db.SaveChangesAsync();
            return Results.Ok(new FoodItemResponse(item.Id, item.Name, item.Price, item.AvailableOrderQty, item.IsArchived));
        });

        app.MapDelete("/api/food-items/{id:guid}", async (Guid id, OrdersDbContext db) =>
        {
            var item = await db.FoodItems.FindAsync(id);
            if (item is null) return Results.NotFound();
            item.IsArchived = true;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapPost("/api/food-items/{id:guid}/unarchive", async (Guid id, OrdersDbContext db) =>
        {
            var item = await db.FoodItems.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (await db.FoodItems.AnyAsync(other => other.Id != id && !other.IsArchived && other.Name.ToLower() == item.Name.ToLower()))
                return Results.Conflict(new { message = "A food with this name is already in the menu." });
            item.IsArchived = false;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return app;
    }

    private static string? ValidateFoodItem(FoodItemRequest request) =>
        string.IsNullOrWhiteSpace(request.Name) ? "Name is required." : request.Name.Trim().Length > 100 ? "Name must be 100 characters or fewer." :
        request.Price <= 0 ? "Price must be greater than zero." : request.AvailableOrderQty < 0 ? "Inventory cannot be negative." : null;
}

public sealed record FoodItemRequest(string Name, int Price, int AvailableOrderQty);
public sealed record FoodItemResponse(Guid Id, string Name, int Price, int AvailableOrderQty, bool IsArchived);
