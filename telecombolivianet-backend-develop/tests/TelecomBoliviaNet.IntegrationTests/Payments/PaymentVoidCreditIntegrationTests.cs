using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Payments;

/// <summary>
/// Auditoría 2026-08-06 — BUG-02, verificado de extremo a extremo contra PostgreSQL real.
///
/// Registrar un pago y anularlo son dos casos de uso distintos que se reparten entre
/// PaymentCreditService y PaymentService, y el saldo a favor pasa por el libro mayor. La única
/// forma honesta de comprobar que anular deja al cliente como estaba es recorrer el ciclo
/// completo sobre la base real: registrar, verificar el saldo intermedio, anular y volver a leer.
///
/// Antes la anulación no tocaba el saldo: un cliente con Bs. 100 a favor que pagaba Bs. 50 sobre
/// una deuda de Bs. 120 perdía esos 100 si el pago se anulaba.
/// </summary>
public class PaymentVoidCreditIntegrationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public PaymentVoidCreditIntegrationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(IServiceScope Scope, Guid ClientId, Guid InvoiceId, Guid ActorId);

    private async Task<Escenario> SeedAsync(decimal creditoInicial, decimal montoFactura)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "NotifLogs";
            DELETE FROM "NotifOutbox";
            DELETE FROM "PaymentReceipts";
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
            Id = userId, FullName = "Cajero Test", Email = $"caja-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create(
            tbnCode: "TBN-9200", fullName: "Cliente Credito", identityCard: "9200001",
            phoneMain: "59171000200", zone: "Zona Este",
            installationDate: DateTime.UtcNow.AddMonths(-4),
            installedByUserId: userId, planId: planId);
        client.WinboxNumber  = "WB-9200";
        client.CreditBalance = creditoInicial;
        db.Set<Client>().Add(client);

        var invoice = new Invoice
        {
            Id       = Guid.NewGuid(), ClientId = client.Id,
            Type     = InvoiceType.Mensualidad, Status = InvoiceStatus.Emitida,
            Year     = 2026, Month = 8, Amount = montoFactura, AmountPaid = 0m,
            IssuedAt = DateTime.UtcNow, DueDate = DateTime.UtcNow.AddDays(3),
            InvoiceNumber = "F-2026-9200",
        };
        db.Set<Invoice>().Add(invoice);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, client.Id, invoice.Id, userId);
    }

    private static async Task<Guid> RegistrarPagoAsync(Escenario esc, decimal monto)
    {
        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentCreditService>();
        var result = await svc.RegisterPaymentWithCreditAsync(
            new RegisterPaymentDto(
                ClientId:              esc.ClientId,
                Amount:                monto,
                Method:                "Efectivo",
                Bank:                  null,
                PaidAt:                DateTime.UtcNow,
                InvoiceIds:            [esc.InvoiceId],
                PhysicalReceiptNumber: null),
            esc.ActorId, "Cajero Test", "127.0.0.1");

        Assert.True(result.IsSuccess, result.ErrorMessage);
        return result.Value!.PaymentId;
    }

    private static async Task<decimal> SaldoAsync(Escenario esc)
    {
        var db = esc.Scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ChangeTracker.Clear();
        return (await db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId)).CreditBalance;
    }

    private static Task<Domain.Primitives.Result<VoidPaymentResultDto>> AnularAsync(
        Escenario esc, Guid paymentId) =>
        esc.Scope.ServiceProvider.GetRequiredService<IPaymentService>().VoidPaymentAsync(
            paymentId, "Cobro registrado por error en la caja", esc.ActorId, "Cajero Test", "127.0.0.1");

    // ════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task AnularPagoQueConsumioSaldoAFavor_DevuelveEseSaldo()
    {
        // 100 a favor + pago de 50 contra una deuda de 120 → se consumen los 100, sobran 30.
        var esc = await SeedAsync(creditoInicial: 100m, montoFactura: 120m);
        using var scope = esc.Scope;

        var paymentId = await RegistrarPagoAsync(esc, monto: 50m);
        Assert.Equal(30m, await SaldoAsync(esc));

        var result = await AnularAsync(esc, paymentId);
        Assert.True(result.IsSuccess, result.ErrorMessage);

        Assert.Equal(100m, await SaldoAsync(esc));
    }

    [Fact]
    public async Task AnularPagoQueConsumioSaldoAFavor_DejaAsientoDeReversionEnElLibroMayor()
    {
        var esc = await SeedAsync(creditoInicial: 100m, montoFactura: 120m);
        using var scope = esc.Scope;

        var paymentId = await RegistrarPagoAsync(esc, monto: 50m);
        await AnularAsync(esc, paymentId);

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reversion = await db.Set<CreditMovement>().AsNoTracking()
            .SingleAsync(m => m.Type == CreditMovementType.Reversion);

        Assert.Equal(paymentId, reversion.PaymentId);
        Assert.Equal(70m, reversion.Amount);      // −(−100 consumido + 30 acumulado)
        Assert.Equal(100m, reversion.BalanceAfter);
    }

    [Fact]
    public async Task AnularPagoQueSoloDejoExcedente_RetiraEseExcedente()
    {
        // Sin saldo previo: un pago de 200 sobre una deuda de 120 deja 80 a favor.
        var esc = await SeedAsync(creditoInicial: 0m, montoFactura: 120m);
        using var scope = esc.Scope;

        var paymentId = await RegistrarPagoAsync(esc, monto: 200m);
        Assert.Equal(80m, await SaldoAsync(esc));

        await AnularAsync(esc, paymentId);

        Assert.Equal(0m, await SaldoAsync(esc));
    }

    [Fact]
    public async Task AnularPagoSinSaldoAFavorInvolucrado_NoTocaElSaldo()
    {
        var esc = await SeedAsync(creditoInicial: 0m, montoFactura: 120m);
        using var scope = esc.Scope;

        var paymentId = await RegistrarPagoAsync(esc, monto: 120m);
        Assert.Equal(0m, await SaldoAsync(esc));

        await AnularAsync(esc, paymentId);

        Assert.Equal(0m, await SaldoAsync(esc));

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.Set<CreditMovement>().AsNoTracking()
            .AnyAsync(m => m.Type == CreditMovementType.Reversion),
            "sin movimiento de crédito que deshacer, no debe asentarse una reversión vacía");
    }

    [Fact]
    public async Task AnularPago_ReabreLaFacturaYDevuelveElSaldo_EnLaMismaOperacion()
    {
        var esc = await SeedAsync(creditoInicial: 100m, montoFactura: 120m);
        using var scope = esc.Scope;

        var paymentId = await RegistrarPagoAsync(esc, monto: 50m);
        await AnularAsync(esc, paymentId);

        var db      = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = await db.Set<Invoice>().AsNoTracking().SingleAsync(i => i.Id == esc.InvoiceId);

        Assert.Equal(0m, invoice.AmountPaid);
        Assert.Equal(120m, invoice.Outstanding);
        Assert.Equal(100m, await SaldoAsync(esc));
    }
}
