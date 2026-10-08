using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace KarenderyaOrders.Api.Data;

public static class SeedData
{
    public static async Task InitializeAsync(OrdersDbContext db)
    {
        if (await db.FoodItems.AnyAsync()) return;
        db.FoodItems.AddRange(
            new FoodItem { Name = "Chicken Adobo", PriceCentavos = 7000, AvailableOrderQty = 10 },
            new FoodItem { Name = "Pork Sisig", PriceCentavos = 8500, AvailableOrderQty = 8 },
            new FoodItem { Name = "Steamed Rice", PriceCentavos = 1500, AvailableOrderQty = 999 });
        await db.SaveChangesAsync();
    }
}
