using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Probes;

/// <summary>
/// SONDA — protección contra actualizaciones perdidas (<i>lost update</i>).
///
/// <para>Dos operadores que abren la misma ficha a la vez y guardan uno detrás de
/// otro: sin token de concurrencia, el segundo pisa al primero en silencio y
/// nadie se entera.</para>
///
/// <para>Estos tests verifican que las dos entidades donde de verdad concurren
/// los usuarios —<c>Client</c> (ficha) e <c>Invoice</c> (cobros)— rebotan el
/// segundo guardado en vez de dejarlo pisar al primero.</para>
///
/// <para>El de <c>Invoice</c> nació al revés: documentaba el hueco de D-14. Al
/// añadirle el token pasó a fallar —la señal de que estaba corregido— y se
/// invirtió. Es el ciclo que debería seguir cualquier test que documente un bug.</para>
/// </summary>
public class ConcurrencyProbeTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ConcurrencyProbeTests(CustomWebApplicationFactory factory) => _factory = factory;

    private AppDbContext NuevoContexto()
        => _factory.Services.CreateScope().ServiceProvider.GetRequiredService<AppDbContext>();

    private async Task<(Guid ClientId, Guid InvoiceId)> SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
            DELETE FROM "NotifLogs";      DELETE FROM "NotifOutbox";
            DELETE FROM "PaymentReceipts";DELETE FROM "PaymentInvoices";
            DELETE FROM "Payments";       DELETE FROM "Invoices";
            DELETE FROM "CreditMovements";DELETE FROM "Clients";
            DELETE FROM "Plans";          DELETE FROM "UserSystems";
            """);

        var userId = Guid.NewGuid();
        var planId = Guid.NewGuid();

        db.Set<UserSystem>().Add(new UserSystem
        {
            Id = userId, FullName = "Cajero", Email = $"conc-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create("TBN-C900", "Cliente Concurrencia", "2100001", "59171001000",
                                   "Zona", DateTime.UtcNow.AddMonths(-3), userId, planId);
        client.WinboxNumber = "WB-C900";
        db.Set<Client>().Add(client);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(), ClientId = client.Id,
            Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Emitida,
            Year = 2026, Month = 5, Amount = 100m, AmountPaid = 0m,
            IssuedAt = DateTime.UtcNow.AddDays(-10), DueDate = DateTime.UtcNow.AddDays(5),
            InvoiceNumber = "F-2026-C900",
        };
        db.Set<Invoice>().Add(invoice);

        await db.SaveChangesAsync();
        return (client.Id, invoice.Id);
    }

    [Fact]
    public async Task Client_SI_esta_protegido_contra_actualizaciones_perdidas()
    {
        var (clientId, _) = await SeedAsync();

        // Dos "operadores" cargan la MISMA ficha, cada uno en su contexto.
        await using var ctxA = NuevoContexto();
        await using var ctxB = NuevoContexto();

        var a = await ctxA.Set<Client>().SingleAsync(c => c.Id == clientId);
        var b = await ctxB.Set<Client>().SingleAsync(c => c.Id == clientId);

        a.Zone = "Zona modificada por A";
        await ctxA.SaveChangesAsync();

        b.Zone = "Zona modificada por B";
        var guardarB = () => ctxB.SaveChangesAsync();

        // El token xmin hace que el segundo guardado falle en vez de pisar al
        // primero. GlobalExceptionHandler lo traduce a 409 Conflict.
        await guardarB.Should().ThrowAsync<DbUpdateConcurrencyException>(
            "Client declara Xmin como IsRowVersion");
    }

    [Fact]
    public async Task Invoice_TAMBIEN_esta_protegido_contra_actualizaciones_perdidas()
    {
        // Este test nació invertido: documentaba que Invoice NO tenía token y que
        // el segundo guardado pisaba al primero en silencio (D-14). Al añadir
        // IsRowVersion pasó a fallar, que era justo la señal de que estaba
        // arreglado, y se invirtió — no se borró.
        var (_, invoiceId) = await SeedAsync();

        await using var ctxA = NuevoContexto();
        await using var ctxB = NuevoContexto();

        // Dos cobros simultáneos sobre la misma factura de 100. Cada uno ve
        // AmountPaid = 0 y cree estar saldándola.
        var a = await ctxA.Set<Invoice>().SingleAsync(i => i.Id == invoiceId);
        var b = await ctxB.Set<Invoice>().SingleAsync(i => i.Id == invoiceId);

        a.AmountPaid = 100m; a.Status = InvoiceStatus.Pagada;
        await ctxA.SaveChangesAsync();

        b.AmountPaid = 100m; b.Status = InvoiceStatus.Pagada;
        var guardarB = () => ctxB.SaveChangesAsync();

        await guardarB.Should().ThrowAsync<DbUpdateConcurrencyException>(
            "el segundo cobro debe rebotar en vez de pisar al primero");

        // Y la factura conserva lo que escribió A, no una mezcla.
        await using var verificar = NuevoContexto();
        var final = await verificar.Set<Invoice>().AsNoTracking().SingleAsync(i => i.Id == invoiceId);
        final.AmountPaid.Should().Be(100m);
        final.Status.Should().Be(InvoiceStatus.Pagada);
    }
}
