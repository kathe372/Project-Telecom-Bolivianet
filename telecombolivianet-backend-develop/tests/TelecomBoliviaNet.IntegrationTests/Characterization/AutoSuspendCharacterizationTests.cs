using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;
using TelecomBoliviaNet.Infrastructure.Jobs;

namespace TelecomBoliviaNet.IntegrationTests.Characterization;

/// <summary>
/// TEST DE CARACTERIZACIÓN — Fase 0.
///
/// Congela a quién suspende (y a quién NO) el job de corte por mora. Es el job
/// que más daño hace si se equivoca: cortarle el servicio a alguien que acaba de
/// pagar, o no cortárselo a nadie durante días.
///
/// Protege la <b>Fase 2</b>, que envuelve los once jobs en
/// <c>JobLease.TryRunExclusiveAsync</c> para que dos réplicas no ejecuten a la
/// vez. Ese cambio toca el disparador del job, no su lógica: estos tests deben
/// seguir pasando idénticos después.
///
/// Nota: se invoca <c>RunAsync</c> directamente en lugar de esperar a la ventana
/// horaria (13:30 UTC). Por eso el método se hizo público, con el mismo criterio
/// que ya seguía ApplyScheduledPlanChangesJob.
/// </summary>
public class AutoSuspendCharacterizationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public AutoSuspendCharacterizationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private const int DiasGracia = 10;

    private sealed record Escenario(
        IServiceScope Scope, AppDbContext Db,
        Guid MorosoViejo, Guid MorosoRecienPagado, Guid MorosoJusto, Guid AlDia, Guid YaSuspendido);

    /// <summary>
    /// Cinco clientes, uno por cada rama de la decisión:
    ///   - MorosoViejo:        vencida hace 30 días  → SE SUSPENDE
    ///   - MorosoRecienPagado: vencida hace 30 días, pero pagó hace 2 h → NO
    ///   - MorosoJusto:        vencida hace 3 días (dentro de gracia)   → NO
    ///   - AlDia:              sin facturas vencidas                    → NO
    ///   - YaSuspendido:       vencida hace 30 días, ya suspendido      → NO (no está Activo)
    /// </summary>
    private async Task<Escenario> SeedAsync()
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "AuditLogs";
            DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";
            DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";
            DELETE FROM "Clients";
            DELETE FROM "Plans";
            DELETE FROM "UserSystems";
            DELETE FROM "SystemConfigs" WHERE "Key" ILIKE 'autosuspend%';
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Sistema Caracterización",
            Email = $"susp-{userId:N}@test.bo", PasswordHash = "x",
            Role = UserRole.Admin, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        // El job lee su configuración de SystemConfigs; sin "activo=true" no hace nada.
        db.Set<SystemConfig>().AddRange(
            new SystemConfig { Id = Guid.NewGuid(), Key = SystemConfigKeys.AutoSuspendActivo,     Value = "true", UpdatedAt = DateTime.UtcNow },
            new SystemConfig { Id = Guid.NewGuid(), Key = SystemConfigKeys.AutoSuspendDiasGracia, Value = DiasGracia.ToString(), UpdatedAt = DateTime.UtcNow });

        var n = 0;
        Client Nuevo(string tbn, string nombre)
        {
            n++;
            var c = Client.Create(tbn, nombre, $"510000{n}", $"5917100060{n}", "Zona Sur",
                                  DateTime.UtcNow.AddMonths(-10), userId, planId);
            c.WinboxNumber = $"WB-{tbn}";
            db.Set<Client>().Add(c);
            return c;
        }

        void Vencida(Client c, int diasAtras)
        {
            db.Set<Invoice>().Add(new Invoice
            {
                Id = Guid.NewGuid(), ClientId = c.Id,
                Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Vencida,
                Year = 2026, Month = 1, Amount = 149m, AmountPaid = 0m,
                IssuedAt = DateTime.UtcNow.AddDays(-diasAtras - 5),
                DueDate  = DateTime.UtcNow.AddDays(-diasAtras),
                InvoiceNumber = $"F-{c.TbnCode}",
            });
        }

        var morosoViejo   = Nuevo("TBN-S001", "Moroso Viejo");
        var recienPagado  = Nuevo("TBN-S002", "Moroso Recien Pagado");
        var morosoJusto   = Nuevo("TBN-S003", "Moroso Dentro De Gracia");
        var alDia         = Nuevo("TBN-S004", "Cliente Al Dia");
        var yaSuspendido  = Nuevo("TBN-S005", "Ya Suspendido");

        Vencida(morosoViejo,  30);
        Vencida(recienPagado, 30);
        Vencida(morosoJusto,   3);   // dentro de los 10 días de gracia
        Vencida(yaSuspendido, 30);
        yaSuspendido.Suspend();

        // Pago de hace 2 horas: dentro de la ventana de gracia de 24 h.
        db.Set<Payment>().Add(new Payment
        {
            Id = Guid.NewGuid(), ClientId = recienPagado.Id, Amount = 149m,
            Method = PaymentMethod.Efectivo, PaidAt = DateTime.UtcNow.AddHours(-2),
            RegisteredAt = DateTime.UtcNow.AddHours(-2), RegisteredByUserId = userId,
        });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, db, morosoViejo.Id, recienPagado.Id,
                             morosoJusto.Id, alDia.Id, yaSuspendido.Id);
    }

    /// <summary>
    /// Ejecuta el job saltándose el temporizador. Construye el BackgroundService a
    /// mano porque lo que se quiere ejercitar es RunAsync, no ExecuteAsync.
    /// </summary>
    private async Task EjecutarJobAsync(Escenario esc)
    {
        var job = new AutoSuspendClientJob(
            _factory.Services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<AutoSuspendClientJob>.Instance);

        await job.RunAsync(CancellationToken.None);
        esc.Db.ChangeTracker.Clear();
    }

    private static async Task<ClientStatus> EstadoAsync(Escenario esc, Guid clientId) =>
        (await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == clientId)).Status;

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Suspende_al_moroso_que_supera_los_dias_de_gracia()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);

        (await EstadoAsync(esc, esc.MorosoViejo)).Should().Be(ClientStatus.Suspendido);

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.MorosoViejo);
        cliente.SuspendedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task NO_suspende_a_quien_pago_en_las_ultimas_24_horas()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);

        // Aunque su factura lleve 30 días vencida. Sin esta gracia, un cliente que
        // paga por la mañana se queda sin internet por la tarde.
        (await EstadoAsync(esc, esc.MorosoRecienPagado)).Should().Be(ClientStatus.Activo);
    }

    [Fact]
    public async Task NO_suspende_dentro_del_periodo_de_gracia()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);

        (await EstadoAsync(esc, esc.MorosoJusto)).Should().Be(ClientStatus.Activo);
    }

    [Fact]
    public async Task NO_toca_a_quien_esta_al_dia_ni_a_quien_ya_estaba_suspendido()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);

        (await EstadoAsync(esc, esc.AlDia)).Should().Be(ClientStatus.Activo);
        (await EstadoAsync(esc, esc.YaSuspendido)).Should().Be(ClientStatus.Suspendido);
    }

    [Fact]
    public async Task Suspender_encola_la_notificacion_al_cliente()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);

        // El backend nunca llama a Meta directamente: escribe en el outbox y el
        // worker Python lo consume.
        var outbox = await esc.Db.Set<NotifOutbox>().AsNoTracking()
            .Where(o => o.ClienteId == esc.MorosoViejo).ToListAsync();

        outbox.Should().ContainSingle();
        outbox[0].Tipo.Should().Be(NotifType.SUSPENSION);
    }

    [Fact]
    public async Task Ejecutar_dos_veces_no_vuelve_a_suspender_ni_duplica_avisos()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        await EjecutarJobAsync(esc);
        await EjecutarJobAsync(esc);

        // El cliente ya no está Activo, así que sale del filtro por sí solo.
        var outbox = await esc.Db.Set<NotifOutbox>().AsNoTracking()
            .CountAsync(o => o.ClienteId == esc.MorosoViejo);
        outbox.Should().Be(1);
    }

    [Fact]
    public async Task Desactivado_por_configuracion_no_suspende_a_nadie()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var cfg = await esc.Db.Set<SystemConfig>()
            .SingleAsync(c => c.Key == SystemConfigKeys.AutoSuspendActivo);
        cfg.Value = "false";
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await EjecutarJobAsync(esc);

        (await EstadoAsync(esc, esc.MorosoViejo)).Should().Be(ClientStatus.Activo);
    }
}
