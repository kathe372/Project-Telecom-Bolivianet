using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;

namespace TelecomBoliviaNet.IntegrationTests.Schema;

/// <summary>
/// Vuelca el modelo de EF completo a un fichero de texto ordenado, para poder
/// comparar dos versiones del mapeo carácter a carácter.
///
/// <para>Existe por la mudanza de <c>OnModelCreating</c> a un
/// <c>IEntityTypeConfiguration</c> por entidad (F5.4). <c>SchemaParityTests</c>
/// compara tablas y columnas contra <c>information_schema</c>, que es lo que
/// protege de perder una columna — pero <b>no ve</b> los filtros globales de
/// borrado lógico, las conversiones de enum a texto, los índices únicos, los
/// valores por defecto ni los datos semilla. Perder un
/// <c>HasQueryFilter(c =&gt; !c.IsDeleted)</c> al mover un bloque no rompería
/// ningún test de esquema y en cambio haría aparecer clientes dados de baja en
/// todas las pantallas.</para>
///
/// <para>Uso: se ejecuta sobre el código viejo y sobre el nuevo, y se comparan
/// los dos volcados. Si son idénticos, la mudanza fue un movimiento puro.</para>
///
/// <para>Los datos semilla quedan fuera: el modelo en ejecución está optimizado
/// para lectura y no los conserva. Se verifican aparte contando los
/// <c>HasData</c> de los ficheros.</para>
/// </summary>
public class ModelDumpTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ModelDumpTests(CustomWebApplicationFactory factory) => _factory = factory;

    /// <summary>Ruta del volcado: se pasa por variable de entorno para no fijarla aquí.</summary>
    private static string? Destino => Environment.GetEnvironmentVariable("TBN_MODEL_DUMP");

    [Fact]
    public void Volcar_el_modelo_si_se_pide()
    {
        if (string.IsNullOrWhiteSpace(Destino))
            return;   // fuera del flujo de comparación, este test no hace nada

        using var scope = _factory.Services.CreateScope();
        var model = scope.ServiceProvider
            .GetRequiredService<Infrastructure.Data.AppDbContext>().Model;

        File.WriteAllText(Destino, Describir(model), Encoding.UTF8);
    }

    private static string Describir(IModel model)
    {
        var sb = new StringBuilder();

        foreach (var et in model.GetEntityTypes().OrderBy(t => t.Name, StringComparer.Ordinal))
        {
            sb.AppendLine($"ENTIDAD {et.Name}");
            sb.AppendLine($"  tabla     {et.GetTableName()}");
            sb.AppendLine($"  filtro    {et.GetQueryFilter()?.ToString() ?? "(ninguno)"}");

            foreach (var p in et.GetProperties().OrderBy(p => p.Name, StringComparer.Ordinal))
            {
                var conv  = p.GetValueConverter()?.GetType().Name ?? "-";
                var def   = p.GetDefaultValue()?.ToString() ?? "-";
                var defSql = p.GetDefaultValueSql() ?? "-";
                sb.AppendLine(
                    $"  prop      {p.Name} col={p.GetColumnName()} tipo={p.GetColumnType()} " +
                    $"null={p.IsNullable} max={p.GetMaxLength()?.ToString() ?? "-"} " +
                    $"conv={conv} def={def} defSql={defSql} " +
                    $"concurrencia={p.IsConcurrencyToken} generado={p.ValueGenerated}");
            }

            foreach (var k in et.GetKeys().OrderBy(k => string.Join(",", k.Properties.Select(p => p.Name)), StringComparer.Ordinal))
                sb.AppendLine($"  clave     {string.Join(",", k.Properties.Select(p => p.Name))} principal={k.IsPrimaryKey()}");

            foreach (var ix in et.GetIndexes().OrderBy(i => string.Join(",", i.Properties.Select(p => p.Name)), StringComparer.Ordinal))
                sb.AppendLine($"  indice    {string.Join(",", ix.Properties.Select(p => p.Name))} unico={ix.IsUnique}");

            foreach (var fk in et.GetForeignKeys().OrderBy(f => string.Join(",", f.Properties.Select(p => p.Name)), StringComparer.Ordinal))
                sb.AppendLine(
                    $"  fk        {string.Join(",", fk.Properties.Select(p => p.Name))} " +
                    $"→ {fk.PrincipalEntityType.Name} borrado={fk.DeleteBehavior} requerido={fk.IsRequired}");
        }

        return sb.ToString();
    }
}
