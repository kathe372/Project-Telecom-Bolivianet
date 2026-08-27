using System.Text.Json;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Payments;

/// <summary>
/// Devolver al cliente el saldo a favor que le queda.
///
/// <para>Estaba en <c>PaymentCreditService</c> (F5), junto a registrar un cobro.
/// Son movimientos opuestos —uno consume crédito, el otro lo devuelve— y no
/// comparten ni una línea.</para>
/// </summary>
public class CreditRefundService : ICreditRefundService
{
    private readonly IClientRepository _clientRepo;
    private readonly ICreditLedger     _creditLedger;
    private readonly AuditService      _audit;

    public CreditRefundService(
        IClientRepository clientRepo,
        ICreditLedger     creditLedger,
        AuditService      audit)
    {
        _clientRepo   = clientRepo;
        _creditLedger = creditLedger;
        _audit        = audit;
    }

    public async Task<Result> RefundCreditAsync(
        Guid clientId, string justificacion, Guid actorId, string actorName, string ip)
    {
        var client = await _clientRepo.GetByIdAsync(clientId);
        if (client is null) return Result.Failure("Cliente no encontrado.");
        if (client.CreditBalance <= 0) return Result.Failure("El cliente no tiene crédito a favor.");

        var prev = client.CreditBalance;

        // Antes esto era `client.CreditBalance = 0m` a secas: el saldo desaparecía
        // del sistema dejando solo una línea de auditoría en texto, sin asiento que
        // permitiera conciliar la devolución.
        await _creditLedger.RecordAsync(
            client, -prev, CreditMovementType.Reembolsado,
            createdByUserId: actorId,
            notes: $"Reembolso al cliente. Justificación: {justificacion}");

        _clientRepo.Update(client);
        await _clientRepo.SaveChangesAsync();

        await _audit.LogAsync("Pagos", "CREDIT_REIMBURSED",
            $"Crédito reembolsado: {client.TbnCode} monto={prev:F2} razón={justificacion}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: JsonSerializer.Serialize(new { CreditBalance = prev }),
            newData:  JsonSerializer.Serialize(new { CreditBalance = 0m, Justificacion = justificacion }));

        return Result.Success();
    }
}
