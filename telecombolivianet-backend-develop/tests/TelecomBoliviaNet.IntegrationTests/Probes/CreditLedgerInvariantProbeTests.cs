using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Probes;

/// <summary>
/// SONDA — invariante contable del saldo a favor.
///
/// <para>El libro mayor (<c>CreditMovements</c>) debe EXPLICAR el saldo:
/// para todo cliente, <c>CreditBalance == SUM(CreditMovements.Amount)</c>.
/// Si un flujo mueve el saldo sin dejar asiento —o al revés— la contabilidad
/// del crédito deja de cuadrar y nadie puede auditar de dónde salió el dinero.</para>
///
/// <para>No es un test de regresión de un bug conocido: es un intento deliberado
/// de romper el invariante recorriendo los flujos que tocan crédito —pago con
/// excedente, pago que consume saldo, anulación, facturación que aplica crédito—
/// y encadenándolos.</para>
/// </summary>
public class CreditLedgerInvariantProbeTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public CreditLedgerInvariantProbeTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(IServiceScope Scope, AppDbContext Db, Guid ClientId, Guid ActorId);

    private async Task<Escenario> SeedAsync(decimal creditoInicial = 0m)
    {
        var scope = _factory.Services.CreateScope();
        var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.ExecuteSqlRawAsync("""
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
            Id = userId, FullName = "Cajero Sonda", Email = $"sonda-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create("TBN-Z001", "Cliente Sonda", "3100001", "59171000900",
                                   "Zona Sonda", DateTime.UtcNow.AddMonths(-6), userId, planId);
        client.WinboxNumber  = "WB-Z001";
        client.CreditBalance = creditoInicial;
        db.Set<Client>().Add(client);

        await db.SaveChangesAsync();

        // Si se siembra saldo inicial, se asienta para que el invariante parta cuadrado.
        if (creditoInicial > 0)
        {
            db.Set<CreditMovement>().Add(new CreditMovement
            {
                ClientId = client.Id, Amount = creditoInicial, BalanceAfter = creditoInicial,
                Type = CreditMovementType.Acumulado, Notes = "Saldo inicial de la sonda",
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        db.ChangeTracker.Clear();
        return new Escenario(scope, db, client.Id, userId);
    }

    private static Guid AgregarFactura(AppDbContext db, Guid clientId, int mes, decimal importe)
    {
        var inv = new Invoice
        {
            Id = Guid.NewGuid(), ClientId = clientId,
            Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Emitida,
            Year = 2026, Month = mes, Amount = importe, AmountPaid = 0m,
            IssuedAt = DateTime.UtcNow.AddDays(-10), DueDate = DateTime.UtcNow.AddDays(5),
            InvoiceNumber = $"F-2026-Z{mes:00}",
        };
        db.Set<Invoice>().Add(inv);
        return inv.Id;
    }

    private static async Task<Guid> PagarAsync(Escenario esc, decimal monto, params Guid[] facturas)
    {
        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentCreditService>();
        var res = await svc.RegisterPaymentWithCreditAsync(
            new RegisterPaymentDto(
                ClientId: esc.ClientId, Amount: monto, Method: nameof(PaymentMethod.Efectivo),
                Bank: null, PaidAt: DateTime.UtcNow, InvoiceIds: facturas.ToList(),
                PhysicalReceiptNumber: null),
            esc.ActorId, "Cajero Sonda", "::1");

        res.IsSuccess.Should().BeTrue($"el pago de {monto} debe registrarse: {res.ErrorMessage}");
        esc.Db.ChangeTracker.Clear();
        return res.Value!.PaymentId;
    }

    /// <summary>La aserción central: el saldo tiene que ser exactamente la suma de sus asientos.</summary>
    private static async Task ElSaldoDebeCuadrarConElLibroMayorAsync(Escenario esc, string momento)
    {
        var cliente = await esc.Db.Set<Client>().AsNoTracking()
            .SingleAsync(c => c.Id == esc.ClientId);

        var movimientos = await esc.Db.Set<CreditMovement>().AsNoTracking()
            .Where(m => m.ClientId == esc.ClientId)
            .Select(m => m.Amount)
            .ToListAsync();

        var suma = movimientos.Sum();

        cliente.CreditBalance.Should().Be(suma,
            "{0}: el saldo debe poder explicarse con los asientos del libro mayor. " +
            "Saldo={1}, suma de {2} movimiento(s)={3}",
            momento, cliente.CreditBalance, movimientos.Count, suma);

        cliente.CreditBalance.Should().BeGreaterThanOrEqualTo(0m,
            "{0}: un saldo a favor negativo es un descuadre contable", momento);
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Sobrepago_deja_excedente_y_el_libro_mayor_lo_explica()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var f = AgregarFactura(esc.Db, esc.ClientId, 1, 100m);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await PagarAsync(esc, 150m, f);      // 50 de excedente

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.CreditBalance.Should().Be(50m);
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras sobrepago");
    }

    [Fact]
    public async Task Pago_que_consume_saldo_previo_cuadra()
    {
        var esc = await SeedAsync(creditoInicial: 80m);
        using var _ = esc.Scope;

        var f = AgregarFactura(esc.Db, esc.ClientId, 1, 100m);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await PagarAsync(esc, 20m, f);       // 20 + 80 de saldo = 100, salda la factura

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.CreditBalance.Should().Be(0m, "el saldo se consumió entero");
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras consumir saldo");
    }

    [Fact]
    public async Task Pago_en_efectivo_que_cubre_todo_TENIENDO_saldo_no_debe_gastarlo()
    {
        // Cliente con 100 a favor y deuda de 50 paga 50 en efectivo.
        // El efectivo cubre la deuda entera: el saldo NO debería moverse.
        var esc = await SeedAsync(creditoInicial: 100m);
        using var _ = esc.Scope;

        var f = AgregarFactura(esc.Db, esc.ClientId, 1, 50m);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await PagarAsync(esc, 50m, f);

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.CreditBalance.Should().Be(100m, "el efectivo bastaba; el saldo queda intacto");
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras pago que no necesitaba saldo");
    }

    [Fact]
    public async Task Anular_un_pago_devuelve_el_saldo_y_el_libro_sigue_cuadrando()
    {
        var esc = await SeedAsync(creditoInicial: 100m);
        using var _ = esc.Scope;

        var f = AgregarFactura(esc.Db, esc.ClientId, 1, 120m);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        var pago = await PagarAsync(esc, 50m, f);   // consume saldo contra la deuda
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras el pago");

        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentService>();
        var res = await svc.VoidPaymentAsync(
            pago, "Anulación de la sonda contable", esc.ActorId, "Cajero Sonda", "::1");
        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        var cliente = await esc.Db.Set<Client>().AsNoTracking().SingleAsync(c => c.Id == esc.ClientId);
        cliente.CreditBalance.Should().Be(100m, "anular debe dejar al cliente como estaba");
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras anular");
    }

    [Fact]
    public async Task Cadena_larga_de_operaciones_no_descuadra_el_libro()
    {
        // Encadena todo: sobrepago, consumo, otro sobrepago y una anulación.
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var f1 = AgregarFactura(esc.Db, esc.ClientId, 1, 100m);
        var f2 = AgregarFactura(esc.Db, esc.ClientId, 2, 100m);
        var f3 = AgregarFactura(esc.Db, esc.ClientId, 3, 100m);
        await esc.Db.SaveChangesAsync();
        esc.Db.ChangeTracker.Clear();

        await PagarAsync(esc, 130m, f1);                 // salda f1, deja 30
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "paso 1");

        await PagarAsync(esc, 50m, f2);                  // 50 + 30 = 80 sobre 100
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "paso 2");

        var ultimo = await PagarAsync(esc, 200m, f2, f3); // salda el resto y deja excedente
        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "paso 3");

        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentService>();
        var res = await svc.VoidPaymentAsync(
            ultimo, "Anulación al final de la cadena", esc.ActorId, "Cajero Sonda", "::1");
        res.IsSuccess.Should().BeTrue(res.ErrorMessage);
        esc.Db.ChangeTracker.Clear();

        await ElSaldoDebeCuadrarConElLibroMayorAsync(esc, "tras anular el último");
    }
}
