using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Payments.Events;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.UnitTests.Services;

/// <summary>
/// Problema 4 — Al saldar la deuda de un cliente SUSPENDIDO se genera una solicitud
/// (alerta) de reactivación para el admin; NO se reactiva automáticamente. Además la
/// facturación mensual se congela para suspendidos (BillingEligibility).
/// </summary>
public class SuggestReactivationHandlerTests
{
    private readonly Mock<IInternalAlertService> _alerts = new(MockBehavior.Loose);

    private SuggestReactivationOnDebtClearedHandler Build(Client client)
    {
        var repo = new Mock<IClientRepository>(MockBehavior.Loose);
        repo.Setup(r => r.GetWithInvoicesAsync(client.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(client);
        return new SuggestReactivationOnDebtClearedHandler(repo.Object, _alerts.Object);
    }

    private static Invoice Inv(InvoiceStatus status) =>
        new() { Status = status, Amount = 99m, DueDate = DateTime.UtcNow.AddDays(-5) };

    [Fact]
    public async Task DebtCleared_SuspendedClient_CreatesReactivationAlert()
    {
        var client = TestEntityFactory.MakeClient(
            status: ClientStatus.Suspendido, invoices: [Inv(InvoiceStatus.Pagada)]);

        await Build(client).Handle(new PaymentRegisteredEvent(client.Id), default);

        _alerts.Verify(a => a.CreateForRoleAsync(
            "Admin", "REACTIVACION_SUGERIDA",
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task StillHasDebt_SuspendedClient_DoesNotCreateAlert()
    {
        var client = TestEntityFactory.MakeClient(
            status: ClientStatus.Suspendido,
            invoices: [Inv(InvoiceStatus.Pagada), Inv(InvoiceStatus.Vencida)]);

        await Build(client).Handle(new PaymentRegisteredEvent(client.Id), default);

        _alerts.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ActiveClient_DoesNotCreateAlert()
    {
        var client = TestEntityFactory.MakeClient(
            status: ClientStatus.Activo, invoices: [Inv(InvoiceStatus.Pagada)]);

        await Build(client).Handle(new PaymentRegisteredEvent(client.Id), default);

        _alerts.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData(ClientStatus.Activo,      true)]
    [InlineData(ClientStatus.Suspendido,  false)]
    [InlineData(ClientStatus.DadoDeBaja,  false)]
    public void BillingEligibility_OnlyBillsActiveClients(ClientStatus status, bool expected)
    {
        var client = TestEntityFactory.MakeClient(status: status);
        BillingEligibility.ShouldBill(client).Should().Be(expected);
    }
}
