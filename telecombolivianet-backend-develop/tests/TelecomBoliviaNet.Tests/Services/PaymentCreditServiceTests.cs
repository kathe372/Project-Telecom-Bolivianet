using FluentAssertions;
using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.DTOs.Payments;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Payments;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// PaymentCreditService no tenía NINGÚN test — así pasó inadvertido que el
/// recibo de pago se añadía al ChangeTracker DESPUÉS del último guardado
/// automático del método y nunca llegaba a la base de datos (auditoría
/// 2026-08-01, Fase 3). Estos tests cubren el flujo completo de
/// RegisterPaymentWithCreditAsync: reparto entre facturas, crédito, el fix del
/// N+1 de guardados y que el recibo efectivamente se persista.
/// </summary>
public class PaymentCreditServiceTests
{
    private static readonly Guid ClientId = Guid.NewGuid();

    private static Client MakeClient(decimal creditBalance = 0m) => TestEntityFactory.MakeClient(
        id: ClientId, tbnCode: "TBN-001", fullName: "Cliente Test") is var c
            ? WithCredit(c, creditBalance) : c;

    private static Client WithCredit(Client c, decimal balance)
    {
        c.CreditBalance = balance;
        return c;
    }

    private static Invoice MakeInvoice(
        decimal amount, decimal amountPaid = 0m,
        InvoiceStatus status = InvoiceStatus.Emitida, DateTime? dueDate = null) => new()
    {
        Id         = Guid.NewGuid(),
        ClientId   = ClientId,
        Amount     = amount,
        AmountPaid = amountPaid,
        Status     = status,
        DueDate    = dueDate ?? DateTime.UtcNow.AddDays(5),
        InvoiceNumber = $"F-{Guid.NewGuid():N}"[..10],
    };

    private static AuditService MakeAudit() =>
        new(RepoMock.Empty<AuditLog>().Object, NullLogger<AuditService>.Instance);

    private static IUnitOfWork MakeUow()
    {
        var uow = new Mock<IUnitOfWork>();
        uow.Setup(u => u.BeginTransactionAsync(default)).Returns(Task.CompletedTask);
        uow.Setup(u => u.CommitAsync(default)).Returns(Task.CompletedTask);
        uow.Setup(u => u.RollbackAsync(default)).Returns(Task.CompletedTask);
        return uow.Object;
    }

    private static ICreditLedger MakeCreditLedger() =>
        new CreditLedgerService(RepoMock.Empty<CreditMovement>().Object, NullLogger<CreditLedgerService>.Instance);

    private record Harness(
        PaymentCreditService Service,
        Mock<IGenericRepository<Invoice>> InvoiceRepo,
        Mock<IGenericRepository<PaymentInvoice>> PiRepo,
        Mock<IGenericRepository<PaymentReceipt>> ReceiptRepo,
        Mock<IGenericRepository<Payment>> PaymentRepo);

    private static Harness MakeService(Client client, params Invoice[] invoices)
    {
        var paymentRepo = RepoMock.Empty<Payment>();
        var invoiceRepo = RepoMock.Of(invoices);
        var clientRepo  = SpecificRepoMock.Clients(client);
        var piRepo      = RepoMock.Empty<PaymentInvoice>();
        var receiptRepo = RepoMock.Empty<PaymentReceipt>();

        var seqGen = new Mock<ISequenceGenerator>();
        seqGen.Setup(s => s.NextReceiptNumberAsync()).ReturnsAsync("REC-0001");

        // F5: el reparto entre facturas se mudó a PaymentAllocator.
        var allocator = new PaymentAllocator(invoiceRepo.Object, piRepo.Object);

        var svc = new PaymentCreditService(
            paymentRepo.Object, clientRepo.Object, allocator,
            receiptRepo.Object, seqGen.Object,
            new Mock<INotifPublisher>().Object, MakeAudit(), MakeUow(),
            new Mock<IPublisher>().Object, MakeCreditLedger(),
            NullLogger<PaymentCreditService>.Instance);

        return new Harness(svc, invoiceRepo, piRepo, receiptRepo, paymentRepo);
    }

    private static RegisterPaymentDto MakeDto(decimal amount, params Guid[] invoiceIds) => new(
        ClientId: ClientId, Amount: amount, Method: "Efectivo", Bank: null,
        PaidAt: DateTime.UtcNow, InvoiceIds: invoiceIds.ToList(),
        PhysicalReceiptNumber: null);

    // ── Validación de las facturas seleccionadas ─────────────────────────────
    // BUG-08: estas reglas vivían en el handler del módulo de Clientes, que tenía su propia
    // implementación del cobro. Al unificar ambos caminos en este servicio, la validación se
    // conserva acá — es el único punto por el que ahora entra un pago.

    [Fact]
    public async Task FacturaDeOtroCliente_RechazaElCobro()
    {
        var client  = MakeClient();
        var ajena   = MakeInvoice(amount: 149m);
        ajena.ClientId = Guid.NewGuid();   // pertenece a OTRO cliente
        var h       = MakeService(client, ajena);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(149m, ajena.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("no pertenecen");
    }

    [Fact]
    public async Task MezclaDeFacturasPropiasYAjenas_RechazaElCobroCompleto()
    {
        var client  = MakeClient();
        var propia  = MakeInvoice(amount: 149m);
        var ajena   = MakeInvoice(amount: 100m);
        ajena.ClientId = Guid.NewGuid();
        var h       = MakeService(client, propia, ajena);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(249m, propia.Id, ajena.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        h.PaymentRepo.Verify(r => r.AddAsync(It.IsAny<Payment>()), Times.Never,
            "un cobro parcialmente inválido no debe registrarse a medias");
    }

    [Fact]
    public async Task FacturaInexistente_RechazaElCobro()
    {
        var h = MakeService(MakeClient());

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(149m, Guid.NewGuid()), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("no existen");
    }

    [Theory]
    [InlineData(InvoiceStatus.Pagada)]
    [InlineData(InvoiceStatus.Anulada)]
    public async Task FacturaYaLiquidada_RechazaElCobro(InvoiceStatus status)
    {
        var client  = MakeClient();
        var invoice = MakeInvoice(amount: 149m, amountPaid: 149m, status: status);
        var h       = MakeService(client, invoice);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(149m, invoice.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse(
            "convertir en saldo a favor un cobro sobre una factura saldada sorprendería al operador");
        result.ErrorMessage.Should().Contain("pagadas o anuladas");
    }

    [Fact]
    public async Task SinFacturasSeleccionadas_RechazaElCobro()
    {
        var h = MakeService(MakeClient());

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(149m), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task PagoQueCubreUnaFactura_MarcaPagadaYRegistraElRecibo()
    {
        var client  = MakeClient();
        var invoice = MakeInvoice(amount: 149m);
        var h       = MakeService(client, invoice);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(149m, invoice.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();

        // REGRESIÓN: el recibo debe llegar a persistirse, no solo quedar en memoria.
        h.ReceiptRepo.Verify(r => r.AddAsync(
            It.Is<PaymentReceipt>(rc => rc.ClientId == ClientId && rc.Amount == 149m)),
            Times.Once);
        // F5: el guardado que persiste el recibo lo hace ahora su propio
        // repositorio — el mismo DbContext, pero nombrando lo que se guarda.
        h.ReceiptRepo.Verify(r => r.SaveChangesAsync(), Times.Once,
            "sin este guardado explícito el recibo nunca llega a la base de datos");
    }

    [Fact]
    public async Task PagoQueCubreVariasFacturas_MarcaEnElBucle_YGuardaUnaSolaVez()
    {
        // REGRESIÓN: antes cada factura del bucle llamaba UpdateAsync (que
        // confirma), generando un round-trip de SaveChanges POR FACTURA.
        //
        // F3 (2026-08-21): el invariante se expresa ahora en el vocabulario del
        // contrato nuevo. Antes se comprobaba "usa MarkModifiedAsync y NO
        // UpdateAsync"; hoy los dos son Update(), que por contrato no persiste,
        // así que esa pareja de aserciones se contradecía. Lo que de verdad
        // importaba —y sigue importando— es que el guardado ocurra UNA vez para
        // todo el lote, no una por factura.
        var client = MakeClient();
        var inv1   = MakeInvoice(amount: 50m);
        var inv2   = MakeInvoice(amount: 50m);
        var inv3   = MakeInvoice(amount: 50m);
        var h      = MakeService(client, inv1, inv2, inv3);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(150m, inv1.Id, inv2.Id, inv3.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();

        // Las tres facturas se MARCAN…
        h.InvoiceRepo.Verify(r => r.Update(It.IsAny<Invoice>()), Times.Exactly(3));

        // …y NINGUNA se guarda dentro del bucle: el repartidor solo marca. Ésta
        // es la aserción que protege contra la regresión del SaveChanges por
        // factura, y ahora es más estricta que antes — comprueba que el
        // repositorio de facturas no confirma nada en absoluto.
        h.InvoiceRepo.Verify(r => r.SaveChangesAsync(), Times.Never);

        // El guardado real ocurre una sola vez, al cerrar la operación.
        h.ReceiptRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    }

    [Fact]
    public async Task PagoParcial_DejaLaFacturaEnParcialmentePagadaConElRepartoCorrecto()
    {
        var client  = MakeClient();
        var invoice = MakeInvoice(amount: 149m);
        var h       = MakeService(client, invoice);

        await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(50m, invoice.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        h.PiRepo.Verify(r => r.AddAsync(
            It.Is<PaymentInvoice>(pi => pi.InvoiceId == invoice.Id && pi.AmountApplied == 50m)),
            Times.Once);
    }

    [Fact]
    public async Task PagoConCreditoPrevio_AplicaElExcedenteCorrectamente()
    {
        // Cliente con Bs. 30 de crédito, factura de 100, paga 50 → cubre 80,
        // queda deuda de 20; no debería generar crédito nuevo.
        var client  = MakeClient(creditBalance: 30m);
        var invoice = MakeInvoice(amount: 100m);
        var h       = MakeService(client, invoice);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(50m, invoice.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        result.Value!.CreditGenerated.Should().Be(0m);
        client.CreditBalance.Should().Be(0m, "los 30 de crédito se consumieron contra la deuda");
    }

    [Fact]
    public async Task PagoMayorALaDeuda_GeneraCreditoAFavor()
    {
        var client  = MakeClient();
        var invoice = MakeInvoice(amount: 100m);
        var h       = MakeService(client, invoice);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(150m, invoice.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeTrue();
        result.Value!.CreditGenerated.Should().Be(50m);
        client.CreditBalance.Should().Be(50m);
    }

    [Fact]
    public async Task FacturaDeOtroCliente_RechazaElPago()
    {
        var client        = MakeClient();
        var invoiceAjena  = MakeInvoice(amount: 100m);
        invoiceAjena.ClientId = Guid.NewGuid(); // pertenece a otro cliente
        var h = MakeService(client, invoiceAjena);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            MakeDto(100m, invoiceAjena.Id), Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public async Task ClienteInexistente_RechazaElPago()
    {
        var invoice = MakeInvoice(amount: 100m);
        var h = MakeService(MakeClient(), invoice);
        // Se pide un ClientId distinto al que existe en el repo.
        var dto = new RegisterPaymentDto(
            Guid.NewGuid(), 100m, "Efectivo", null, DateTime.UtcNow,
            new List<Guid> { invoice.Id }, null);

        var result = await h.Service.RegisterPaymentWithCreditAsync(
            dto, Guid.NewGuid(), "Admin", "127.0.0.1");

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Contain("Cliente no encontrado");
    }
}
