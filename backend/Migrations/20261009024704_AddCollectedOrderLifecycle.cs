using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KarenderyaOrders.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectedOrderLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsCollected",
                table: "Orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql("""UPDATE "Orders" SET "IsCollected" = TRUE WHERE "IsReady" = TRUE;""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsCollected",
                table: "Orders");
        }
    }
}
