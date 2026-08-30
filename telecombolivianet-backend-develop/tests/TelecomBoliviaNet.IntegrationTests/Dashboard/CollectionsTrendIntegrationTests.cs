using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Dashboard.Queries;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Dashboard;

/// <summary>
/// P-01 — La tendencia de cobros pasó de una consulta POR MES a una sola.
/// </summary>
/// <remarks>
/// Doce viajes a la base para dibujar una gráfica, en la pantalla que más se abre.
///
/// <para>Va contra PostgreSQL de verdad y no con dobles porque lo que hay que
/// demostrar es justo lo que un test en memoria no ve: que EF traduce
/// <c>PaidAt.AddHours(-4).Month</c> a SQL, y que el agrupado cae en el mes
/// <b>boliviano</b> y no en el UTC. Un cobro de las 21:00 del día 31 ya es día 1
/// del mes siguiente en UTC: agrupar sin restar las 4 horas lo pondría en el mes
/// equivocado, y nadie se enteraría porque la gráfica seguiría dibujándose.</para>
/// </remarks>
public class CollectionsTrendIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public CollectionsTrendIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Caso(IServiceScope Scope, AppDbContext Db, Guid ClienteId, Guid UserId);

    private async Task<Caso> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();
        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Cajero", Email = $"caja-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Tendencia", SpeedMb = 50, MonthlyPrice = 100m, IsActive = true,
        });

        var c = Client.Create(
            tbnCode: "TBN-8001", fullName: "Cliente Tendencia", identityCard: "CI-8001",
            phoneMain: "59171000001", zone: "Zona Centro",
            installationDate: DateTime.UtcNow.AddYears(-2),
            installedByUserId: userId, planId: planId);
        db.Set<Client>().Add(c);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return new Caso(scope, db, c.Id, userId);
    }

    private static void Cobro(Caso caso, DateTime paidAtUtc, decimal monto, bool anulado = false)
        => caso.Db.Set<Payment>().Add(new Payment
        {
            Id               = Guid.NewGuid(),
            ClientId         = caso.ClienteId,
            Amount           = monto,
            PaidAt           = paidAtUtc,
            Method           = PaymentMethod.Efectivo,
            RegisteredByUserId = caso.UserId,
            RegisteredAt       = paidAtUtc,
            IsVoided           = anulado,
        });

    private static IMediator Mediator(Caso c) => c.Scope.ServiceProvider.GetRequiredService<IMediator>();

    /// <summary>Hora boliviana (UTC−4) convertida al instante UTC que se guarda.</summary>
    private static DateTime EnBolivia(int anio, int mes, int dia, int hora)
        => new DateTimeOffset(anio, mes, dia, hora, 0, 0, TimeSpan.FromHours(-4)).UtcDateTime;

    [Fact]
    public async Task ElCobroDeLasNueveDeLaNocheDelUltimoDia_CuentaEnSuMes_NoEnElSiguiente()
    {
        // EL caso que justifica el test. A las 21:00 del día 31 en Bolivia ya es
        // día 1 del mes siguiente en UTC. Agrupar por el mes UTC lo contaría en el
        // mes que no es, y la gráfica seguiría pintándose tan tranquila.
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var hoyBo   = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-4)).DateTime;
        var mesAnt  = hoyBo.AddMonths(-1);
        var ultimo  = DateTime.DaysInMonth(mesAnt.Year, mesAnt.Month);

        Cobro(caso, EnBolivia(mesAnt.Year, mesAnt.Month, ultimo, 21), 500m);
        await caso.Db.SaveChangesAsync();
        caso.Db.ChangeTracker.Clear();

        var r = await Mediator(caso).Send(new GetCollectionsTrendQuery(Meses: 3));

        var etiqueta = r.Meses.Single(m =>
            m.MesCompleto.Contains(mesAnt.Year.ToString()) &&
            m.MesCompleto.StartsWith(
                char.ToUpper(mesAnt.ToString("MMMM", new System.Globalization.CultureInfo("es-BO"))[0])
                + mesAnt.ToString("MMMM", new System.Globalization.CultureInfo("es-BO"))[1..]));

        etiqueta.Total.Should().Be(500m,
            "el cobro se hizo el último día del mes en hora de Bolivia");
        etiqueta.Cantidad.Should().Be(1);
    }

    [Fact]
    public async Task SumaYCuentaPorMes_ConVariosCobros()
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var hoyBo = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-4)).DateTime;

        Cobro(caso, EnBolivia(hoyBo.Year, hoyBo.Month, 2, 10), 100m);
        Cobro(caso, EnBolivia(hoyBo.Year, hoyBo.Month, 3, 11), 250m);
        Cobro(caso, EnBolivia(hoyBo.Year, hoyBo.Month, 4, 12), 150m);
        await caso.Db.SaveChangesAsync();
        caso.Db.ChangeTracker.Clear();

        var r = await Mediator(caso).Send(new GetCollectionsTrendQuery(Meses: 2));

        var esteMes = r.Meses.Last();
        esteMes.Total.Should().Be(500m);
        esteMes.Cantidad.Should().Be(3);
    }

    [Fact]
    public async Task LosCobrosANULADOS_NoEntranEnLaTendencia()
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var hoyBo = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-4)).DateTime;
        Cobro(caso, EnBolivia(hoyBo.Year, hoyBo.Month, 5, 10), 300m);
        Cobro(caso, EnBolivia(hoyBo.Year, hoyBo.Month, 6, 10), 999m, anulado: true);
        await caso.Db.SaveChangesAsync();
        caso.Db.ChangeTracker.Clear();

        var r = await Mediator(caso).Send(new GetCollectionsTrendQuery(Meses: 1));

        r.Meses.Last().Total.Should().Be(300m, "un cobro anulado no es dinero cobrado");
    }

    [Fact]
    public async Task SinNingunCobro_DevuelveLaSerieVacia_YNoRevienta()
    {
        var caso = await SeedAsync();
        using var scope = caso.Scope;

        var r = await Mediator(caso).Send(new GetCollectionsTrendQuery(Meses: 6));

        r.Meses.Should().BeEmpty("la gráfica recorta los meses iniciales sin cobros");
    }
}
