using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <inheritdoc cref="ICreditLedger"/>
public class CreditLedgerService : ICreditLedger
{
    private readonly IGenericRepository<CreditMovement> _movementRepo;
    private readonly ILogger<CreditLedgerService>       _logger;

    public CreditLedgerService(
        IGenericRepository<CreditMovement> movementRepo,
        ILogger<CreditLedgerService>       logger)
    {
        _movementRepo = movementRepo;
        _logger       = logger;
    }

    public async Task<CreditMovement> RecordAsync(
        Client             client,
        decimal            amount,
        CreditMovementType type,
        Guid?              paymentId       = null,
        Guid?              invoiceId       = null,
        string?            notes           = null,
        Guid?              createdByUserId = null)
    {
        var newBalance = client.CreditBalance + amount;

        if (newBalance < 0)
        {
            // Consumir más crédito del disponible sería un descuadre contable.
            // Se corta aquí en vez de dejar el saldo en negativo silenciosamente.
            throw new InvalidOperationException(
                $"El movimiento de crédito dejaría el saldo del cliente {client.TbnCode} " +
                $"en {newBalance:F2}. Saldo actual: {client.CreditBalance:F2}, movimiento: {amount:F2}.");
        }

        client.CreditBalance = newBalance;

        var movement = new CreditMovement
        {
            ClientId        = client.Id,
            Amount          = amount,
            BalanceAfter    = newBalance,
            Type            = type,
            PaymentId       = paymentId,
            InvoiceId       = invoiceId,
            Notes           = notes,
            CreatedByUserId = createdByUserId,
            CreatedAt       = DateTime.UtcNow,
        };

        // Sin SaveChanges: lo confirma la transacción del llamador, para que el
        // saldo y su asiento se persistan juntos o no se persista ninguno.
        await _movementRepo.AddAsync(movement);

        _logger.LogInformation(
            "Crédito {Type} para {TbnCode}: {Amount:F2} → saldo {Balance:F2}",
            type, client.TbnCode, amount, newBalance);

        return movement;
    }
}
