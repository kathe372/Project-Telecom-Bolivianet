using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Billing;

/// <summary>
/// F7.4 — <c>GetOverdueBatchAsync</c>, contra PostgreSQL de verdad.
///
/// <para>El filtro de "qué factura está vencida" dejó de estar en el servicio y
/// pasó a la consulta. <c>OverduePolicyTests</c> demuestra que las dos formas de
/// la regla coinciden <b>en memoria</b>; lo que falta demostrar es que EF traduce
/// esa expresión a un SQL que selecciona exactamente las mismas filas. Eso solo
/// lo dice la base.</para>
/// </summary>
public class OverdueBatchIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public OverdueBatchIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly DateTime Corte = new(2026, 8, 27, 12, 0, 0, DateTimeKind.Utc);

    private static readonly Guid PlanId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed record Caso(IServiceScope Scope, AppDbContext Db, List<Guid> Clientes);

    /// <param name="porCliente">Cuántas facturas y en qué estado por cada cliente.</param>
    private async Task<Caso> SeedAsync(params (InvoiceStatus Estado, int DiasVenc)[][] porCliente)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = UserId, FullName = "Operador Lote", Email = $"lote-{UserId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Lote", SpeedMb = 50, MonthlyPrice = 100m, IsActive = true,
        });

        var ids = new List<Guid>();
        var n   = 0;

        foreach (var facturas in porCliente)
        {
            n++;
            var c = Client.Create(
                tbnCode: $"TBN-{7000 + n}", fullName: $"Moroso {n}",
                identityCard: $"CI-{7000 + n}", phoneMain: $"5917200{7000 + n}",
                zone: "Zona Sur", installationDate: Corte.AddYears(-1),
                installedByUserId: UserId, planId: PlanId);
            db.Set<Client>().Add(c);
            ids.Add(c.Id);

            var mes = 0;
            foreach (var (estado, dias) in facturas)
            {
                mes++;
                db.Set<Invoice>().Add(new Invoice
                {
                    Id = Guid.NewGuid(), ClientId = c.Id,
                    Type = InvoiceType.Mensualidad, Status = estado,
                    Year = 2026, Month = mes, Amount = 100m,
                    IssuedAt = Corte.AddDays(-60), DueDate = Corte.AddDays(dias),
                });
            }
        }

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return new Caso(scope, db, ids);
    }

    private static IInvoiceRepository Repo(Caso c) =>
        c.Scope.ServiceProvider.GetRequiredService<IInvoiceRepository>();

    [Fact]
    public async Task ElSqlSelecciona_LoMismoQueLaReglaEnMemoria()
    {
        // Un cliente con una factura de cada estado, vencida y sin vencer.
        var todos = Enum.GetValues<InvoiceStatus>();
        var facturas = todos.Select(e => (e, -5)).Concat(todos.Select(e => (e, +5))).ToArray();

        var caso = await SeedAsync(facturas);
        using var scope = caso.Scope;

        var delSql = await Repo(caso).GetOverdueBatchAsync(Corte, Guid.Empty, 100);

        // La misma regla, aplicada en memoria sobre TODAS las filas sembradas.
        var enMemoria = await caso.Db.Set<Invoice>().AsNoTracking().ToListAsync();
        var esperadas = enMemoria
            .Where(i => OverduePolicy.EstaVencida(i.Status, i.DueDate, Corte))
            .Select(i => i.Id).OrderBy(id => id).ToList();

        delSql.Select(i => i.Id).OrderBy(id => id).Should().BeEquivalentTo(esperadas,
            "si PostgreSQL y C# no coinciden, el job marca un conjunto distinto del que nadie revisó");
        esperadas.Should().NotBeEmpty("la siembra tiene que incluir vencidas de verdad");
    }

    [Fact]
    public async Task UnTramoNoPuedePartirAUnCliente()
    {
        // Tres clientes con 3, 3 y 3 vencidas. Pidiendo 2 clientes tienen que
        // venir SEIS facturas: las de dos clientes completos, no las 2 primeras.
        var tres = new[] { (InvoiceStatus.Emitida, -5), (InvoiceStatus.Enviada, -5), (InvoiceStatus.Pendiente, -5) };
        var caso = await SeedAsync(tres, tres, tres);
        using var scope = caso.Scope;

        var tramo = await Repo(caso).GetOverdueBatchAsync(Corte, Guid.Empty, maxClientes: 2);

        tramo.Select(i => i.ClientId).Distinct().Should().HaveCount(2);
        tramo.Should().HaveCount(6,
            "un cliente partido entre dos tramos recibiría dos avisos por la misma deuda");
    }

    [Fact]
    public async Task ElRecorridoAvanza_YTerminaSinRepetirNiSaltar()
    {
        var una  = new[] { (InvoiceStatus.Emitida, -5) };
        var caso = await SeedAsync(una, una, una, una, una);
        using var scope = caso.Scope;

        var repo  = Repo(caso);
        var vistas = new List<Guid>();
        var ultimo = Guid.Empty;

        while (true)
        {
            var tramo = await repo.GetOverdueBatchAsync(Corte, ultimo, maxClientes: 2);
            if (tramo.Count == 0) break;
            ultimo = tramo[^1].ClientId;
            vistas.AddRange(tramo.Select(i => i.Id));
        }

        vistas.Should().HaveCount(5);
        vistas.Should().OnlyHaveUniqueItems("avanzar por clave no puede devolver dos veces la misma fila");
    }

    [Fact]
    public async Task SinVencidas_DevuelveVacio_YNoDaOtraVuelta()
    {
        var caso = await SeedAsync([(InvoiceStatus.Emitida, +10)], [(InvoiceStatus.Pagada, -10)]);
        using var scope = caso.Scope;

        var tramo = await Repo(caso).GetOverdueBatchAsync(Corte, Guid.Empty, 100);

        tramo.Should().BeEmpty();
    }

    [Fact]
    public async Task LasFacturasVienenRastreadas_ParaQueElJobPuedaMarcarlas()
    {
        // No es un detalle: el job les cambia el estado y guarda. Si la consulta
        // llevara AsNoTracking —como el resto de este repositorio— el job correría
        // entero sin persistir nada y reportaría éxito.
        var caso = await SeedAsync([(InvoiceStatus.Emitida, -5)]);
        using var scope = caso.Scope;

        var tramo = await Repo(caso).GetOverdueBatchAsync(Corte, Guid.Empty, 100);

        caso.Db.Entry(tramo[0]).State.Should().Be(EntityState.Unchanged);
    }
}
