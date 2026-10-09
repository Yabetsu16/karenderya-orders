using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KarenderyaOrders.Api.Migrations
{
    /// <inheritdoc />
    public partial class UseFloatingPointPrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Orders"
                    ALTER COLUMN "Total" TYPE double precision USING "Total"::double precision / 100.0;
                ALTER TABLE "OrderLines"
                    ALTER COLUMN "UnitPrice" TYPE double precision USING "UnitPrice"::double precision / 100.0;
                ALTER TABLE "FoodItems"
                    ALTER COLUMN "Price" TYPE double precision USING "Price"::double precision / 100.0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "Orders"
                    ALTER COLUMN "Total" TYPE integer USING ROUND("Total" * 100)::integer;
                ALTER TABLE "OrderLines"
                    ALTER COLUMN "UnitPrice" TYPE integer USING ROUND("UnitPrice" * 100)::integer;
                ALTER TABLE "FoodItems"
                    ALTER COLUMN "Price" TYPE integer USING ROUND("Price" * 100)::integer;
                """);
        }
    }
}
