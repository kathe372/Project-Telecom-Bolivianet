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
/// <para>Estos tests documentan qué entidades están protegidas y cuáles no. El
/// segundo <b>demuestra un hueco real</b>: <c>Invoice</c> no tiene token, aunque
/// es donde concurren los cobros.</para>
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
    public async Task Invoice_NO_esta_protegido_HUECO_DOCUMENTADO()
    {
        var (_, invoiceId) = await SeedAsync();

        await using var ctxA = NuevoContexto();
        await using var ctxB = NuevoContexto();

        var a = await ctxA.Set<Invoice>().SingleAsync(i => i.Id == invoiceId);
        var b = await ctxB.Set<Invoice>().SingleAsync(i => i.Id == invoiceId);

        // Dos cobros simultáneos sobre la misma factura de 100. Cada uno ve
        // AmountPaid = 0 y cree estar saldándola.
        a.AmountPaid = 100m; a.Status = InvoiceStatus.Pagada;
        await ctxA.SaveChangesAsync();

        b.AmountPaid = 100m; b.Status = InvoiceStatus.Pagada;
        await ctxB.SaveChangesAsync();   // NO lanza: pisa a A en silencio

        // La factura queda "pagada una vez" aunque se registraron DOS cobros.
        await using var verificar = NuevoContexto();
        var final = await verificar.Set<Invoice>().AsNoTracking().SingleAsync(i => i.Id == invoiceId);

        final.AmountPaid.Should().Be(100m);

        // ESTA es la aserción que documenta el hueco: si algún día se añade
        // IsRowVersion a Invoice, el segundo SaveChanges lanzará y este test
        // fallará. Cuando eso pase, hay que INVERTIRLO (pasa a esperar la
        // excepción, como el de Client), no borrarlo.
        //
        // Ver D-14 en BUGS_DESCUBIERTOS.md.
        true.Should().BeTrue(
            "documentado: Invoice NO tiene token de concurrencia, así que el " +
            "segundo guardado pisa al primero sin avisar");
    }
}
