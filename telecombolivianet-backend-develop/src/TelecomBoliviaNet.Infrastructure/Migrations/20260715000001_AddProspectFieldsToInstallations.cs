using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TelecomBoliviaNet.Infrastructure.Data;

#nullable disable

namespace TelecomBoliviaNet.Infrastructure.Migrations;

/// <inheritdoc />
[Migration("20260715000001_AddProspectFieldsToInstallations")]
[DbContext(typeof(AppDbContext))]
public partial class AddProspectFieldsToInstallations : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ProspectName",
            table: "Installations",
            type: "character varying(200)",
            maxLength: 200,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ProspectPhone",
            table: "Installations",
            type: "character varying(30)",
            maxLength: 30,
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "ProspectName",  table: "Installations");
        migrationBuilder.DropColumn(name: "ProspectPhone", table: "Installations");
    }
}
