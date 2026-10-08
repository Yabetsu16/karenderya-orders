using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KarenderyaOrders.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalCentavos",
                table: "Orders",
                newName: "Total");

            migrationBuilder.RenameColumn(
                name: "UnitPriceCentavos",
                table: "OrderLines",
                newName: "UnitPrice");

            migrationBuilder.RenameColumn(
                name: "PriceCentavos",
                table: "FoodItems",
                newName: "Price");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Total",
                table: "Orders",
                newName: "TotalCentavos");

            migrationBuilder.RenameColumn(
                name: "UnitPrice",
                table: "OrderLines",
                newName: "UnitPriceCentavos");

            migrationBuilder.RenameColumn(
                name: "Price",
                table: "FoodItems",
                newName: "PriceCentavos");
        }
    }
}
