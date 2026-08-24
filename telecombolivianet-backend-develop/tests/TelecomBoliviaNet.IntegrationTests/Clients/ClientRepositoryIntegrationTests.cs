using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Clients;

/// <summary>
/// F4 — Las consultas del listado de clientes se mudaron de los handlers a
/// <see cref="IClientRepository"/>. Un test con mocks las daría por buenas
/// aunque EF no supiera traducirlas: aquí lo que se comprueba es el SQL real.
///
/// <para>Tres traducciones concretas están en juego, y ninguna es obvia:
/// <c>phones.Contains(c.PhoneMain)</c> sobre una colección en memoria,
/// <c>IgnoreQueryFilters</c> combinado con <c>AsNoTracking</c> e <c>Include</c>,
/// y el filtro de deuda contra <c>Status</c>, que se persiste como texto.</para>
/// </summary>
public class ClientRepositoryIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ClientRepositoryIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static readonly Guid PlanId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private sealed record Fixture(IServiceScope Scope, IClientRepository Repo, AppDbContext Db);

    private async Task<Fixture> SeedAsync(params Client[] clients)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
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
            Id = UserId, FullName = "Operador Test", Email = $"op-{UserId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = PlanId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        db.Set<Client>().AddRange(clients);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Fixture(scope, scope.ServiceProvider.GetRequiredService<IClientRepository>(), db);
    }

    private static Client MakeClient(
        string  code,
        string? name           = null,
        string  phoneMain      = "59171000000",
        string? phoneSecondary = null,
        string  zone           = "Zona Norte",
        string? email          = null,
        params Invoice[] invoices)
    {
        var c = Client.Create(
            tbnCode:           code,
            fullName:          name ?? $"Cliente {code}",
            identityCard:      $"CI-{code}",
            phoneMain:         phoneMain,
            zone:              zone,
            installationDate:  DateTime.UtcNow.AddMonths(-6),
            installedByUserId: UserId,
            planId:            PlanId);

        c.WinboxNumber   = $"WB-{code}";
        c.PhoneSecondary = phoneSecondary;
        c.Email          = email;

        foreach (var inv in invoices)
        {
            inv.ClientId = c.Id;
            c.Invoices.Add(inv);
        }

        return c;
    }

    private static Invoice Unpaid(decimal amount = 149m) => new()
    {
        Id       = Guid.NewGuid(),
        Type     = InvoiceType.Mensualidad,
        Status   = InvoiceStatus.Emitida,
        Year     = 2026, Month = 8, Amount = amount,
        IssuedAt = DateTime.UtcNow, DueDate = DateTime.UtcNow.AddDays(2),
    };

    private static Invoice Paid(decimal amount = 149m) => new()
    {
        Id         = Guid.NewGuid(),
        Type       = InvoiceType.Mensualidad,
        Status     = InvoiceStatus.Pagada,
        Year       = 2026, Month = 8, Amount = amount, AmountPaid = amount,
        IssuedAt   = DateTime.UtcNow, DueDate = DateTime.UtcNow.AddDays(2),
    };

    // ── GetPagedAsync ───────────────────────────────────────────────────────

    [Fact]
    public async Task Listado_BuscaEnTodosLosCamposDeTexto()
    {
        var f = await SeedAsync(
            MakeClient("TBN-8001", name: "Rosa Mamani"),
            MakeClient("TBN-8002", name: "Juan Perez", zone: "Villa Adela"));
        using var scope = f.Scope;

        var (porNombre, _) = await f.Repo.GetPagedAsync(new ClientListFilter(Search: "rosa"));
        var (porZona,   _) = await f.Repo.GetPagedAsync(new ClientListFilter(Search: "adela"));
        var (porCodigo, _) = await f.Repo.GetPagedAsync(new ClientListFilter(Search: "8002"));

        Assert.Equal("TBN-8001", Assert.Single(porNombre).TbnCode);
        Assert.Equal("TBN-8002", Assert.Single(porZona).TbnCode);
        Assert.Equal("TBN-8002", Assert.Single(porCodigo).TbnCode);
    }

    [Fact]
    public async Task Listado_FiltroDeDeuda_UsaLaMismaDefinicionQueLaColumna()
    {
        // "Emitida" es impaga aunque no esté vencida — es justo el estado que el
        // filtro literal Pendiente|Vencida dejaba fuera mientras la columna de
        // deuda sí lo contaba.
        var f = await SeedAsync(
            MakeClient("TBN-8010", invoices: Unpaid()),
            MakeClient("TBN-8011", invoices: Paid()));
        using var scope = f.Scope;

        var (conDeuda, totalDeuda) = await f.Repo.GetPagedAsync(new ClientListFilter(DebtFilter: "debt"));
        var (alDia,    totalAlDia) = await f.Repo.GetPagedAsync(new ClientListFilter(DebtFilter: "paid"));

        Assert.Equal("TBN-8010", Assert.Single(conDeuda).TbnCode);
        Assert.Equal("TBN-8011", Assert.Single(alDia).TbnCode);
        Assert.Equal(1, totalDeuda);
        Assert.Equal(1, totalAlDia);
    }

    [Fact]
    public async Task Listado_ClienteDadoDeBaja_SoloApareceSiSePideExplicitamente()
    {
        var baja = MakeClient("TBN-8020");
        baja.IsDeleted = true;
        var f = await SeedAsync(baja, MakeClient("TBN-8021"));
        using var scope = f.Scope;

        var (sinBajas, _) = await f.Repo.GetPagedAsync(new ClientListFilter());
        var (conBajas, _) = await f.Repo.GetPagedAsync(new ClientListFilter(IncludeDeleted: true));

        Assert.Equal("TBN-8021", Assert.Single(sinBajas).TbnCode);
        Assert.Equal(2, conBajas.Count);
    }

    [Fact]
    public async Task Listado_PaginaYCuentaElTotalSinPaginar()
    {
        var f = await SeedAsync(
            MakeClient("TBN-8031"), MakeClient("TBN-8032"), MakeClient("TBN-8033"));
        using var scope = f.Scope;

        var (pagina, total) = await f.Repo.GetPagedAsync(
            new ClientListFilter(Page: 2, PageSize: 2));

        Assert.Equal(3, total);
        Assert.Equal("TBN-8033", Assert.Single(pagina).TbnCode);
    }

    [Fact]
    public async Task Listado_OrdenaPorNombreOPorZonaCuandoSePide()
    {
        var f = await SeedAsync(
            MakeClient("TBN-8041", name: "Zulema Quispe", zone: "Villa Adela"),
            MakeClient("TBN-8042", name: "Ana Torrez",    zone: "Zona Norte"));
        using var scope = f.Scope;

        var (porNombre, _) = await f.Repo.GetPagedAsync(new ClientListFilter(SortBy: "name"));
        var (porZona,   _) = await f.Repo.GetPagedAsync(new ClientListFilter(SortBy: "zone"));

        Assert.Equal("Ana Torrez",  porNombre[0].FullName);
        Assert.Equal("Villa Adela", porZona[0].Zone);
    }

    [Fact]
    public async Task Listado_TraeElPlanCargado()
    {
        var f = await SeedAsync(MakeClient("TBN-8050"));
        using var scope = f.Scope;

        var (items, _) = await f.Repo.GetPagedAsync(new ClientListFilter());

        Assert.Equal("Plan Plata", Assert.Single(items).Plan!.Name);
    }

    [Fact]
    public async Task Listado_FiltraPorEmailPresenteOAusente()
    {
        var f = await SeedAsync(
            MakeClient("TBN-8060", email: "con@correo.bo"),
            MakeClient("TBN-8061"));
        using var scope = f.Scope;

        var (conEmail, _) = await f.Repo.GetPagedAsync(new ClientListFilter(HasEmail: true));
        var (sinEmail, _) = await f.Repo.GetPagedAsync(new ClientListFilter(HasEmail: false));

        Assert.Equal("TBN-8060", Assert.Single(conEmail).TbnCode);
        Assert.Equal("TBN-8061", Assert.Single(sinEmail).TbnCode);
    }

    // ── GetByAnyPhoneAsync ──────────────────────────────────────────────────

    [Fact]
    public async Task PorTelefono_EncuentraPorPrincipalYPorSecundario()
    {
        var f = await SeedAsync(
            MakeClient("TBN-8070", phoneMain: "71435981"),
            MakeClient("TBN-8071", phoneMain: "70000000", phoneSecondary: "71432586"));
        using var scope = f.Scope;

        var porPrincipal = await f.Repo.GetByAnyPhoneAsync(new[] { "71435981" });
        var porSecundario = await f.Repo.GetByAnyPhoneAsync(new[] { "71432586" });

        Assert.Equal("TBN-8070", Assert.Single(porPrincipal).TbnCode);
        Assert.Equal("TBN-8071", Assert.Single(porSecundario).TbnCode);
    }

    [Fact]
    public async Task PorTelefono_ProbaAmbasFormasDelNumeroEnUnaSolaConsulta()
    {
        // El bot recibe "59171435981"; el cliente puede estar registrado con o
        // sin el prefijo de país, así que se buscan las dos formas a la vez.
        var f = await SeedAsync(MakeClient("TBN-8080", phoneMain: "71435981"));
        using var scope = f.Scope;

        var encontrados = await f.Repo.GetByAnyPhoneAsync(new[] { "71435981", "59171435981" });

        Assert.Equal("TBN-8080", Assert.Single(encontrados).TbnCode);
    }

    [Fact]
    public async Task PorTelefono_DosClientesConElMismoNumero_DevuelveLosDos()
    {
        // PhoneMain no tiene constraint único: dos familiares con CIs distintos
        // comparten contacto. El bot necesita verlos a ambos para preguntar.
        var f = await SeedAsync(
            MakeClient("TBN-8090", phoneMain: "71754388"),
            MakeClient("TBN-8091", phoneMain: "71754388"));
        using var scope = f.Scope;

        var encontrados = await f.Repo.GetByAnyPhoneAsync(new[] { "71754388" });

        Assert.Equal(2, encontrados.Count);
    }

    // ── GetDetailAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task Ficha_DeUnClienteDadoDeBaja_SigueAbriendose()
    {
        var baja = MakeClient("TBN-8100", invoices: Unpaid());
        baja.IsDeleted = true;
        var f = await SeedAsync(baja);
        using var scope = f.Scope;

        var ficha = await f.Repo.GetDetailAsync(baja.Id);

        Assert.NotNull(ficha);
        Assert.Equal("Plan Plata", ficha!.Plan!.Name);
        Assert.Single(ficha.Invoices);
    }
}
