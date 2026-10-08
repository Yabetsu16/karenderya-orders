namespace KarenderyaOrders.Api.Models;

public class FoodItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public int PriceCentavos { get; set; }
    public int AvailableOrderQty { get; set; }
    public bool IsArchived { get; set; }
}

public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public int TotalCentavos { get; set; }
    public List<OrderLine> Lines { get; set; } = [];
}

public class OrderLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FoodItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public int Price { get; set; }
    public int Quantity { get; set; }
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
}
