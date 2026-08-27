using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Cuánto saldo a favor hay que devolver (o retirar) para dejar al cliente como
/// estaba antes de un pago que se va a anular.
///
/// <para>Se deduce de los asientos que el propio pago generó en el libro mayor:
/// no hace falta ningún dato nuevo, porque el ledger ya registra tanto el crédito
/// consumido como el excedente acumulado, ambos ligados al <c>PaymentId</c>.</para>
///
/// <para>La aritmética vive en <see cref="CreditReversalPolicy"/>, que es dominio
/// puro. Esta clase solo aporta lo que aquella no puede tener: los asientos
/// guardados y el aviso cuando el excedente ya se consumió y no hay de dónde
/// retirarlo.</para>
/// </summary>
public class CreditReversalCalculator
{
    private readonly IGenericRepository<CreditMovement>    _creditMovementRepo;
    private readonly ILogger<CreditReversalCalculator>     _logger;

    public CreditReversalCalculator(
        IGenericRepository<CreditMovement> creditMovementRepo,
        ILogger<CreditReversalCalculator>  logger)
    {
        _creditMovementRepo = creditMovementRepo;
        _logger             = logger;
    }

    /// <summary>
    /// Reversión a aplicar. <c>default</c> (sin efecto) si el pago no movió
    /// crédito o si no trae cliente cargado.
    /// </summary>
    public async Task<CreditReversal> CalculateAsync(Payment payment)
    {
        if (payment.Client is null) return default;

        var movimientos = await _creditMovementRepo.GetAllReadOnly()
            .Where(m => m.PaymentId == payment.Id)
            .Select(m => m.Amount)
            .ToListAsync();

        if (movimientos.Count == 0) return default;

        var reversal = CreditReversalPolicy.Calculate(movimientos, payment.Client.CreditBalance);

        if (!reversal.IsComplete)
        {
            _logger.LogWarning(
                "Anulación del pago {PaymentId}: no se pudo retirar Bs. {Faltante:F2} del saldo a " +
                "favor de {TbnCode} porque ese excedente ya se consumió contra otra factura. " +
                "Revisar manualmente.",
                payment.Id, reversal.Unapplied, payment.Client.TbnCode);
        }

        return reversal;
    }
}
