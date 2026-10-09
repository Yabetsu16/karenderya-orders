using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace KarenderyaOrders.Api.Data;

public static class SeedData
{
    public static async Task InitializeAsync(OrdersDbContext db)
    {
        if (await db.FoodItems.AnyAsync()) return;
        db.FoodItems.AddRange(
            new FoodItem { Name = "Chicken Adobo", Price = 70.00, AvailableOrderQty = 10 },
            new FoodItem { Name = "Pork Sisig", Price = 85.00, AvailableOrderQty = 8 },
            new FoodItem { Name = "Steamed Rice", Price = 15.00, AvailableOrderQty = 999 });
        await db.SaveChangesAsync();
    }
}
