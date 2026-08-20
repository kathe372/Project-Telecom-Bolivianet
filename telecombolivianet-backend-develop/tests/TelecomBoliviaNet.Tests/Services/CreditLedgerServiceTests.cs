using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using TelecomBoliviaNet.Application.Services.Payments;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Tests.Helpers;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// REGRESIÓN (auditoría 2026-08-01, Fase 2): antes `Client.CreditBalance` se
/// asignaba a mano desde cuatro servicios distintos y el consumo o reembolso del
/// crédito no dejaba ningún asiento — el dinero desaparecía del sistema con solo
/// una línea de auditoría en texto libre. Estos tests cubren el libro mayor que
/// centraliza todo cambio de saldo.
/// </summary>
public class CreditLedgerServiceTests
{
    private static Client MakeClient(decimal balance = 0m)
    {
        var client = TestEntityFactory.MakeClient(tbnCode: "TBN-001", fullName: "Cliente Test");
        client.CreditBalance = balance;
        return client;
    }

    private static CreditLedgerService MakeLedger(out Mock<IGenericRepository<CreditMovement>> repoMock)
    {
        repoMock = RepoMock.Empty<CreditMovement>();
        return new CreditLedgerService(repoMock.Object, NullLogger<CreditLedgerService>.Instance);
    }

    [Fact]
    public async Task RecordAsync_MontoPositivo_AcumulaSaldo()
    {
        var client = MakeClient(balance: 0m);
        var ledger = MakeLedger(out var repo);

        var movement = await ledger.RecordAsync(client, 50m, CreditMovementType.Acumulado);

        client.CreditBalance.Should().Be(50m);
        movement.BalanceAfter.Should().Be(50m);
        movement.Amount.Should().Be(50m);
        repo.Verify(r => r.AddAsync(It.Is<CreditMovement>(m => m.ClientId == client.Id)), Times.Once);
    }

    [Fact]
    public async Task RecordAsync_MontoNegativo_ConsumeSaldo()
    {
        var client = MakeClient(balance: 100m);
        var ledger = MakeLedger(out _);

        var movement = await ledger.RecordAsync(client, -30m, CreditMovementType.AplicadoAFactura);

        client.CreditBalance.Should().Be(70m);
        movement.BalanceAfter.Should().Be(70m);
    }

    [Fact]
    public async Task RecordAsync_ConsumirMasQueElSaldo_LanzaExcepcion()
    {
        // El saldo NUNCA debe quedar negativo: sería un descuadre silencioso.
        var client = MakeClient(balance: 20m);
        var ledger = MakeLedger(out _);

        var act = async () => await ledger.RecordAsync(client, -50m, CreditMovementType.Reembolsado);

        await act.Should().ThrowAsync<InvalidOperationException>();
        client.CreditBalance.Should().Be(20m, "el saldo no debe mutar si el movimiento se rechaza");
    }

    [Fact]
    public async Task RecordAsync_ConsumirExactamenteElSaldo_DejaCero()
    {
        var client = MakeClient(balance: 40m);
        var ledger = MakeLedger(out _);

        await ledger.RecordAsync(client, -40m, CreditMovementType.Reembolsado);

        client.CreditBalance.Should().Be(0m);
    }

    [Fact]
    public async Task RecordAsync_NoLlamaSaveChanges_ElCommitEsResponsabilidadDelLlamador()
    {
        // El saldo y su asiento deben persistirse ATÓMICAMENTE junto con el resto
        // de la operación (p. ej. la factura que se está pagando). Si el ledger
        // confirmara por su cuenta, un fallo posterior en la misma operación
        // dejaría el crédito descontado sin lo que lo justifica.
        var client = MakeClient(balance: 100m);
        var ledger = MakeLedger(out var repo);

        await ledger.RecordAsync(client, -10m, CreditMovementType.AplicadoAFactura);

        repo.Verify(r => r.SaveChangesAsync(), Times.Never);
    }

    [Fact]
    public async Task RecordAsync_RegistraElTipoYReferenciasDelMovimiento()
    {
        var client    = MakeClient(balance: 100m);
        var paymentId = Guid.NewGuid();
        var actorId   = Guid.NewGuid();
        CreditMovement? captured = null;
        var ledger = MakeLedger(out var repo);
        repo.Setup(r => r.AddAsync(It.IsAny<CreditMovement>()))
            .Callback<CreditMovement>(m => captured = m)
            .Returns(Task.CompletedTask);

        await ledger.RecordAsync(
            client, 25m, CreditMovementType.Acumulado,
            paymentId: paymentId, createdByUserId: actorId, notes: "Excedente del pago");

        captured.Should().NotBeNull();
        captured!.PaymentId.Should().Be(paymentId);
        captured.CreatedByUserId.Should().Be(actorId);
        captured.Type.Should().Be(CreditMovementType.Acumulado);
        captured.Notes.Should().Be("Excedente del pago");
    }
}
