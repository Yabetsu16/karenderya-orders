using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using KarenderyaOrders.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.PostgreSql;

namespace KarenderyaOrders.Api.Tests;

[CollectionDefinition("database", DisableParallelization = true)]
public class DatabaseCollection : ICollectionFixture<DatabaseFixture> { }

public sealed class DatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder().WithDatabase("karenderya_tests").WithUsername("postgres").WithPassword("postgres").Build();
    public string ConnectionString => _postgres.GetConnectionString();
    public Task InitializeAsync() => _postgres.StartAsync();
    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();
}

[Collection("database")]
public class OrdersApiTests(DatabaseFixture database) : IAsyncLifetime
{
    private TestAppFactory _factory = null!;
    private HttpClient _client = null!;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task InitializeAsync()
    {
        _factory = new TestAppFactory(database.ConnectionString);
        _client = _factory.CreateClient();
        return Task.CompletedTask;
    }

    public Task DisposeAsync() => _factory.DisposeAsync().AsTask();

    [Fact]
    public async Task Checkout_decrements_inventory_and_keeps_the_price_snapshot()
    {
        var item = (await Menu()).First();
        var before = item.AvailableOrderQty;
        var response = await _client.PostAsJsonAsync("/api/orders", new { items = new[] { new { foodItemId = item.Id, quantity = 2 } } });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var order = await response.Content.ReadFromJsonAsync<OrderResponse>(Json);
        order!.Total.Should().Be(item.Price * 2);
        order.Lines.Single().UnitPrice.Should().Be(item.Price);
        (await Menu()).Single(menuItem => menuItem.Id == item.Id).AvailableOrderQty.Should().Be(before - 2);
    }

    [Fact]
    public async Task Fractional_peso_price_is_saved_and_used_in_order_total()
    {
        var create = await _client.PostAsJsonAsync("/api/food-items", new
        {
            name = $"Fractional dish {Guid.NewGuid()}",
            price = 12.75,
            availableOrderQty = 3,
        });
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var item = await create.Content.ReadFromJsonAsync<FoodItemResponse>(Json);

        var response = await _client.PostAsJsonAsync("/api/orders", new
        {
            items = new[] { new { foodItemId = item!.Id, quantity = 3 } },
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var order = await response.Content.ReadFromJsonAsync<OrderResponse>(Json);
        item.Price.Should().Be(12.75);
        order!.Total.Should().Be(38.25);
        order.Lines.Single().UnitPrice.Should().Be(12.75);
    }

    [Fact]
    public async Task Checkout_with_insufficient_stock_does_not_change_inventory()
    {
        var item = (await Menu()).First();
        var response = await _client.PostAsJsonAsync("/api/orders", new { items = new[] { new { foodItemId = item.Id, quantity = item.AvailableOrderQty + 1 } } });
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Menu()).Single(menuItem => menuItem.Id == item.Id).AvailableOrderQty.Should().Be(item.AvailableOrderQty);
    }

    [Fact]
    public async Task Archived_item_is_hidden_from_new_orders_but_still_available_in_management_list()
    {
        var create = await _client.PostAsJsonAsync("/api/food-items", new { name = "Test dish", price = 50.00, availableOrderQty = 1 });
        create.StatusCode.Should().Be(HttpStatusCode.Created);
        var item = await create.Content.ReadFromJsonAsync<FoodItemResponse>(Json);
        (await _client.DeleteAsync($"/api/food-items/{item!.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Menu()).Should().NotContain(menuItem => menuItem.Id == item.Id);
        (await Menu(true)).Single(menuItem => menuItem.Id == item.Id).IsArchived.Should().BeTrue();
    }

    [Fact]
    public async Task Unarchive_makes_item_available_again()
    {
        var create = await _client.PostAsJsonAsync("/api/food-items", new { name = $"Restore dish {Guid.NewGuid()}", price = 50.00, availableOrderQty = 1 });
        var item = await create.Content.ReadFromJsonAsync<FoodItemResponse>(Json);
        await _client.DeleteAsync($"/api/food-items/{item!.Id}");

        var response = await _client.PostAsync($"/api/food-items/{item.Id}/unarchive", null);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Menu()).Should().Contain(menuItem => menuItem.Id == item.Id);
    }

    [Fact]
    public async Task Creating_food_with_existing_menu_name_returns_conflict_message()
    {
        var name = $"Duplicate dish {Guid.NewGuid()}";
        var create = await _client.PostAsJsonAsync("/api/food-items", new { name, price = 50.00, availableOrderQty = 1 });
        create.StatusCode.Should().Be(HttpStatusCode.Created);

        var duplicate = await _client.PostAsJsonAsync("/api/food-items", new { name = name.ToUpperInvariant(), price = 60.00, availableOrderQty = 2 });

        duplicate.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await duplicate.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().Be("A food with this name is already in the menu.");
    }

    private async Task<List<FoodItemResponse>> Menu(bool includeArchived = false) =>
        (await _client.GetFromJsonAsync<List<FoodItemResponse>>($"/api/food-items?includeArchived={includeArchived.ToString().ToLowerInvariant()}", Json))!;
}

public sealed class TestAppFactory(string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.ConfigureServices(services =>
    {
        services.RemoveAll<DbContextOptions<OrdersDbContext>>();
        services.AddDbContext<OrdersDbContext>(options => options.UseNpgsql(connectionString));
    });
}

public record FoodItemResponse(Guid Id, string Name, double Price, int AvailableOrderQty, bool IsArchived);
public record OrderResponse(Guid Id, DateTimeOffset CreatedAt, double Total, List<OrderLineResponse> Lines);
public record OrderLineResponse(string ItemName, double UnitPrice, int Quantity);
