using KarenderyaOrders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace KarenderyaOrders.Api.Data;

public class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<FoodItem> FoodItems => Set<FoodItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<FoodItem>(entity => { entity.Property(item => item.Name).HasMaxLength(100); entity.HasIndex(item => item.Name); });
        modelBuilder.Entity<OrderLine>(entity => { entity.Property(line => line.ItemName).HasMaxLength(100); entity.HasOne(line => line.Orders).WithMany(order => order.Lines).HasForeignKey(line => line.OrderId); });
    }
}
