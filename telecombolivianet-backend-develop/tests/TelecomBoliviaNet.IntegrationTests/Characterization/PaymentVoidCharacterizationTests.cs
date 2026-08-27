using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Infrastructure.Data;

namespace TelecomBoliviaNet.IntegrationTests.Characterization;

/// <summary>
/// TEST DE CARACTERIZACIÓN — Fase 0.
///
/// Congela el comportamiento ACTUAL de <c>PaymentService.VoidPaymentAsync</c>,
/// que es el método más delicado del módulo de cobranza: al anular hay que
/// recalcular cada factura a partir de los pagos que SIGUEN vigentes, no
/// limpiarla sin más.
///
/// Protege F3 (contrato de repositorio/UoW) y F5 (partir PaymentService en
/// cinco clases). El caso crítico es la factura cubierta por DOS pagos: si un
/// refactor vuelve a forzar el estado en vez de recalcular, el aporte del otro
/// pago se pierde y la factura se cobra entera otra vez.
///
/// Complementa a PaymentVoidCreditIntegrationTests, que cubre el ciclo del saldo
/// a favor. Aquí el foco es el reparto entre facturas y la ventana de anulación.
/// </summary>
public class PaymentVoidCharacterizationTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    public PaymentVoidCharacterizationTests(CustomWebApplicationFactory factory) => _factory = factory;

    private sealed record Escenario(
        IServiceScope Scope, AppDbContext Db, Guid ClientId, Guid ActorId,
        Guid FacturaA, Guid FacturaB);

    /// <summary>
    /// Un cliente con dos facturas de Bs. 100 cada una, ambas vencidas.
    /// Sin saldo a favor: este archivo mira el reparto entre facturas.
    /// </summary>
    private async Task<Escenario> SeedAsync()
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
            Id = userId, FullName = "Cajero Caracterización",
            Email = $"void-{userId:N}@test.bo", PasswordHash = "x",
            Role = UserRole.Operador, Status = UserStatus.Activo,
        });
        db.Set<Plan>().Add(new Plan
        {
            Id = planId, Name = "Plan Plata", SpeedMb = 50, MonthlyPrice = 149m, IsActive = true,
        });

        var client = Client.Create("TBN-V001", "Cliente Anulacion", "8100001", "59171000300",
                                   "Zona Norte", DateTime.UtcNow.AddMonths(-6), userId, planId);
        client.WinboxNumber = "WB-V001";
        db.Set<Client>().Add(client);

        Invoice Factura(int mes, string numero) => new()
        {
            Id       = Guid.NewGuid(), ClientId = client.Id,
            Type     = InvoiceType.Mensualidad, Status = InvoiceStatus.Vencida,
            Year     = 2026, Month = mes, Amount = 100m, AmountPaid = 0m,
            IssuedAt = DateTime.UtcNow.AddMonths(-2), DueDate = DateTime.UtcNow.AddMonths(-1),
            InvoiceNumber = numero,
        };

        var a = Factura(1, "F-2026-V01");
        var b = Factura(2, "F-2026-V02");
        db.Set<Invoice>().AddRange(a, b);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return new Escenario(scope, db, client.Id, userId, a.Id, b.Id);
    }

    private static async Task<Guid> PagarAsync(Escenario esc, decimal monto, params Guid[] facturas)
    {
        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentCreditService>();
        var res = await svc.RegisterPaymentWithCreditAsync(
            new RegisterPaymentDto(
                ClientId: esc.ClientId, Amount: monto, Method: nameof(PaymentMethod.Efectivo),
                Bank: null, PaidAt: DateTime.UtcNow, InvoiceIds: facturas.ToList(),
                PhysicalReceiptNumber: null),
            esc.ActorId, "Cajero Caracterización", "::1");

        res.IsSuccess.Should().BeTrue($"el pago de {monto} debe registrarse: {res.ErrorMessage}");
        esc.Db.ChangeTracker.Clear();
        return res.Value!.PaymentId;
    }

    private static Task<TelecomBoliviaNet.Domain.Primitives.Result<VoidPaymentResultDto>>
        AnularAsync(Escenario esc, Guid pagoId, string justificacion = "Anulación de prueba de caracterización") =>
        esc.Scope.ServiceProvider.GetRequiredService<IPaymentService>()
            .VoidPaymentAsync(pagoId, justificacion, esc.ActorId, "Cajero Caracterización", "::1");

    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Anular_un_pago_devuelve_su_factura_a_vencida()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var pago = await PagarAsync(esc, 100m, esc.FacturaA);

        var resultado = await AnularAsync(esc, pago);

        resultado.IsSuccess.Should().BeTrue();
        resultado.Value!.InvoicesReverted.Should().Be(1);

        var factura = await esc.Db.Set<Invoice>().AsNoTracking().SingleAsync(i => i.Id == esc.FacturaA);
        factura.AmountPaid.Should().Be(0m);
        // Vencida, no Pendiente: la fecha de vencimiento ya pasó.
        factura.Status.Should().Be(InvoiceStatus.Vencida);

        var pagoDb = await esc.Db.Set<Payment>().AsNoTracking().SingleAsync(p => p.Id == pago);
        pagoDb.IsVoided.Should().BeTrue();
        pagoDb.VoidedByUserId.Should().Be(esc.ActorId);
        pagoDb.VoidedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Anular_un_pago_NO_borra_el_aporte_de_otro_pago_vigente()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        // Dos pagos parciales sobre la MISMA factura de 100.
        var primero = await PagarAsync(esc, 40m, esc.FacturaA);
        await PagarAsync(esc, 60m, esc.FacturaA);

        await AnularAsync(esc, primero);

        // Éste es el corazón del método: la factura se RECALCULA desde los pagos
        // vivos. Antes se forzaba a Pendiente/Vencida sin más y los 60 del otro
        // pago se perdían — la factura se volvía a cobrar entera.
        var factura = await esc.Db.Set<Invoice>().AsNoTracking().SingleAsync(i => i.Id == esc.FacturaA);
        factura.AmountPaid.Should().Be(60m, "el segundo pago sigue vigente");
        factura.Status.Should().Be(InvoiceStatus.Vencida, "quedan 40 por cubrir");
    }

    [Fact]
    public async Task Un_pago_que_cubre_dos_facturas_las_revierte_ambas()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var pago = await PagarAsync(esc, 200m, esc.FacturaA, esc.FacturaB);

        var resultado = await AnularAsync(esc, pago);

        resultado.Value!.InvoicesReverted.Should().Be(2);

        var facturas = await esc.Db.Set<Invoice>().AsNoTracking()
            .Where(i => i.ClientId == esc.ClientId).ToListAsync();
        facturas.Should().OnlyContain(i => i.AmountPaid == 0m);
        facturas.Should().OnlyContain(i => i.Status == InvoiceStatus.Vencida);
    }

    [Fact]
    public async Task No_se_puede_anular_dos_veces_el_mismo_pago()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var pago = await PagarAsync(esc, 100m, esc.FacturaA);
        await AnularAsync(esc, pago);

        var segunda = await AnularAsync(esc, pago);

        segunda.IsSuccess.Should().BeFalse();
        segunda.ErrorMessage.Should().Contain("ya fue anulado");
    }

    [Fact]
    public async Task La_justificacion_debe_tener_al_menos_diez_caracteres()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var pago = await PagarAsync(esc, 100m, esc.FacturaA);

        var resultado = await AnularAsync(esc, pago, "corta");

        resultado.IsSuccess.Should().BeFalse();
        resultado.ErrorMessage.Should().Contain("10 caracteres");

        // Y el pago sigue vigente: la validación corta antes de tocar nada.
        var pagoDb = await esc.Db.Set<Payment>().AsNoTracking().SingleAsync(p => p.Id == pago);
        pagoDb.IsVoided.Should().BeFalse();
    }

    [Fact]
    public async Task Un_pago_anulado_no_cuenta_como_duplicado()
    {
        var esc = await SeedAsync();
        using var _ = esc.Scope;

        var pago = await PagarAsync(esc, 100m, esc.FacturaA);
        await AnularAsync(esc, pago);

        // Sin este comportamiento, tras anular un pago mal registrado el sistema
        // bloqueaba volver a registrarlo corregido.
        var svc = esc.Scope.ServiceProvider.GetRequiredService<IPaymentQueryService>();
        var check = await svc.CheckDuplicateAsync(esc.ClientId, 100m, DateTime.UtcNow);

        check.IsPossibleDuplicate.Should().BeFalse();
        check.ExistingPaymentId.Should().BeNull();
    }
}
