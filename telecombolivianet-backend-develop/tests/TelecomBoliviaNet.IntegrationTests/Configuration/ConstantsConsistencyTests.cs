using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.Constants;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Configuration;

/// <summary>
/// Comprueba que las constantes de negocio se usan de verdad donde corresponde,
/// en vez de estar duplicadas como literales.
///
/// Nace del paso F1.2: <c>PaymentService.GetByIdAsync</c> calculaba
/// <c>CanVoid</c> con un <c>30</c> literal mientras la validación real de
/// <c>VoidPaymentAsync</c> usaba <c>AppConstants.Security.VoidPaymentWindowDays</c>.
/// Coincidían por casualidad; al cambiar la constante, la UI habría ofrecido el
/// botón "Anular" durante días en los que el backend ya lo rechazaba.
///
/// El test no comprueba el valor de la constante: comprueba que **UI y backend
/// coinciden sea cual sea ese valor**.
/// </summary>
public class ConstantsConsistencyTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public ConstantsConsistencyTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(IServiceScope Scope, Guid ClientId, Guid InvoiceId, Guid ActorId);

    private async Task<Escenario> SeedPagoRegistradoHaceAsync(int dias)
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
            Id = userId, FullName = "Cajero", Email = $"const-{userId:N}@test.bo",
            PasswordHash = "x", Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create("TBN-K001", "Cliente Constantes", "4100001", "59171000700",
                                   "Zona Sur", DateTime.UtcNow.AddMonths(-6), userId, planId);
        client.WinboxNumber = "WB-K001";
        db.Set<Client>().Add(client);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(), ClientId = client.Id,
            Type = InvoiceType.Mensualidad, Status = InvoiceStatus.Pagada,
            Year = 2026, Month = 1, Amount = 100m, AmountPaid = 100m,
            IssuedAt = DateTime.UtcNow.AddDays(-dias - 5),
            DueDate  = DateTime.UtcNow.AddDays(-dias - 1),
            InvoiceNumber = "F-2026-K01",
        };
        db.Set<Invoice>().Add(invoice);

        // El pago se inserta con RegisteredAt en el pasado: es justo lo que mira
        // la ventana de anulación.
        var payment = new Payment
        {
            Id = Guid.NewGuid(), ClientId = client.Id, Amount = 100m,
            Method = PaymentMethod.Efectivo,
            PaidAt = DateTime.UtcNow.AddDays(-dias),
            RegisteredAt = DateTime.UtcNow.AddDays(-dias),
            RegisteredByUserId = userId,
        };
        db.Set<Payment>().Add(payment);
        db.Set<PaymentInvoice>().Add(new PaymentInvoice
        {
            PaymentId = payment.Id, InvoiceId = invoice.Id, AmountApplied = 100m,
        });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, client.Id, payment.Id, userId);
    }

    [Theory]
    // Justo dentro de la ventana y justo fuera, calculados desde la constante:
    // si mañana pasa de 30 a 15 días, este test sigue siendo correcto.
    [InlineData(-2, true)]   // dos días antes del límite  → se puede anular
    [InlineData(+2, false)]  // dos días después del límite → ya no
    public async Task CanVoid_del_detalle_coincide_siempre_con_la_validacion_real(
        int desviacionDias, bool esperaPoderAnular)
    {
        var dias = AppConstants.Security.VoidPaymentWindowDays + desviacionDias;
        var esc  = await SeedPagoRegistradoHaceAsync(dias);
        using var _ = esc.Scope;

        var svc      = esc.Scope.ServiceProvider.GetRequiredService<IPaymentService>();
        var querySvc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentQueryService>();

        // Lo que la UI muestra…
        var detalle = await querySvc.GetByIdAsync(esc.InvoiceId);
        detalle.Should().NotBeNull();

        // …y lo que el backend permite de verdad.
        var intento = await svc.VoidPaymentAsync(
            esc.InvoiceId, "Justificación suficientemente larga", esc.ActorId, "Cajero", "::1");

        detalle!.CanVoid.Should().Be(esperaPoderAnular);
        intento.IsSuccess.Should().Be(esperaPoderAnular,
            "el botón que ve el operador y lo que acepta el backend no pueden divergir");
    }

    [Fact]
    public void Las_dos_constantes_de_vencimiento_significan_cosas_distintas()
    {
        // Documenta por qué NO se unificaron: Time.InvoiceDueDays son "días desde
        // hoy" y Billing.DueDayOfMonth es "el día N del mes". Hoy valen lo mismo
        // por casualidad; si alguien las fusiona porque "son iguales", rompe una
        // de las dos. El test no impone valores, solo deja constancia.
        AppConstants.Time.InvoiceDueDays.Should().BePositive();
        AppConstants.Billing.DueDayOfMonth.Should().BeInRange(1, 28,
            "debe ser un día válido en cualquier mes, incluido febrero");
    }
}
