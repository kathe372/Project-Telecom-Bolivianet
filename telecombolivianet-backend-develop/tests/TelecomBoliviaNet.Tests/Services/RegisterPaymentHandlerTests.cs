using FluentAssertions;
using Moq;
using TelecomBoliviaNet.Application.Clients.Commands;
using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;
using Xunit;

using PaymentsDto = TelecomBoliviaNet.Application.DTOs.Payments;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// BUG-08 (auditoría 2026-08-06) — <c>POST /api/clients/{id}/payments</c> tenía su propia
/// implementación del cobro, incompatible con la del módulo de Pagos (marcaba las facturas
/// como Pagada sin mirar el importe, no guardaba AmountApplied y no usaba el saldo a favor).
/// Ahora el handler solo ORQUESTA: traduce el DTO y delega en <see cref="IPaymentCreditService"/>.
///
/// Estos tests cubren exactamente esa responsabilidad. Las reglas de cobro (pertenencia de las
/// facturas, facturas ya saldadas, aplicación del crédito) se verifican donde ahora viven:
/// PaymentCreditServiceTests y los tests de integración de pagos.
/// </summary>
public class RegisterPaymentHandlerTests
{
    private static readonly Guid   ActorId   = Guid.NewGuid();
    private static readonly Guid   ClientId  = Guid.NewGuid();
    private const string           ActorName = "Admin";
    private const string           Ip        = "127.0.0.1";

    private static RegisterPaymentDto MakeDto(params Guid[] invoiceIds) => new(
        ClientId:              ClientId,
        Amount:                150m,
        Method:                "Efectivo",
        Bank:                  "BNB",
        PaidAt:                new DateTime(2026, 8, 6, 10, 0, 0, DateTimeKind.Utc),
        PhysicalReceiptNumber: "REC-77",
        InvoiceIds:            invoiceIds.ToList(),
        ConfirmedDuplicate:    true,
        BankReference:         "REF-123");

    private static Mock<IPaymentCreditService> ServiceReturning(
        Result<PaymentsDto.PaymentRegisteredDto> resultado)
    {
        var mock = new Mock<IPaymentCreditService>();
        mock.Setup(s => s.RegisterPaymentWithCreditAsync(
                It.IsAny<PaymentsDto.RegisterPaymentDto>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
            .ReturnsAsync(resultado);
        return mock;
    }

    private static Result<PaymentsDto.PaymentRegisteredDto> Exito() =>
        Result<PaymentsDto.PaymentRegisteredDto>.Success(
            new PaymentsDto.PaymentRegisteredDto(Guid.NewGuid(), "REC-2026-0001", 150m, 0m, 0m, "ok"));

    // ── Delegación ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Handle_DelegaEnElServicioUnicoDeCobro()
    {
        var svc     = ServiceReturning(Exito());
        var handler = new RegisterPaymentHandler(svc.Object);

        await handler.Handle(
            new RegisterPaymentCommand(MakeDto(Guid.NewGuid()), ActorId, ActorName, Ip),
            CancellationToken.None);

        svc.Verify(s => s.RegisterPaymentWithCreditAsync(
            It.IsAny<PaymentsDto.RegisterPaymentDto>(), ActorId, ActorName, Ip), Times.Once);
    }

    [Fact]
    public async Task Handle_TraduceTodosLosCamposDelDto()
    {
        PaymentsDto.RegisterPaymentDto? enviado = null;
        var svc = new Mock<IPaymentCreditService>();
        svc.Setup(s => s.RegisterPaymentWithCreditAsync(
                It.IsAny<PaymentsDto.RegisterPaymentDto>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>()))
            .Callback<PaymentsDto.RegisterPaymentDto, Guid, string, string>(
                (d, _, _, _) => enviado = d)
            .ReturnsAsync(Exito());

        var invoiceId = Guid.NewGuid();
        var dto       = MakeDto(invoiceId);

        await new RegisterPaymentHandler(svc.Object).Handle(
            new RegisterPaymentCommand(dto, ActorId, ActorName, Ip), CancellationToken.None);

        // Ningún dato del cobro puede perderse en la traducción entre los DTOs de los dos
        // módulos: un campo olvidado acá es dinero mal registrado.
        enviado.Should().NotBeNull();
        enviado!.ClientId.Should().Be(dto.ClientId);
        enviado.Amount.Should().Be(dto.Amount);
        enviado.Method.Should().Be(dto.Method);
        enviado.Bank.Should().Be(dto.Bank);
        enviado.PaidAt.Should().Be(dto.PaidAt);
        enviado.InvoiceIds.Should().Equal(invoiceId);
        enviado.PhysicalReceiptNumber.Should().Be(dto.PhysicalReceiptNumber);
        enviado.BankReference.Should().Be(dto.BankReference);
        enviado.ConfirmedDuplicate.Should().Be(dto.ConfirmedDuplicate);
    }

    // ── Propagación del resultado ────────────────────────────────────────────

    [Fact]
    public async Task Handle_CobroExitoso_DevuelveSuccess()
    {
        var handler = new RegisterPaymentHandler(ServiceReturning(Exito()).Object);

        var result = await handler.Handle(
            new RegisterPaymentCommand(MakeDto(Guid.NewGuid()), ActorId, ActorName, Ip),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_CobroRechazado_PropagaElMensajeDeError()
    {
        const string motivo = "Una o más facturas no pertenecen a este cliente.";
        var handler = new RegisterPaymentHandler(
            ServiceReturning(Result<PaymentsDto.PaymentRegisteredDto>.Failure(motivo)).Object);

        var result = await handler.Handle(
            new RegisterPaymentCommand(MakeDto(Guid.NewGuid()), ActorId, ActorName, Ip),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.ErrorMessage.Should().Be(motivo,
            "el operador necesita saber por qué se rechazó su cobro, no un mensaje genérico");
    }
}
