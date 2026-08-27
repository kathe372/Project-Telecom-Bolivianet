using TelecomBoliviaNet.Application.DTOs.Clients;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Lo que se le cobra a un cliente al darlo de alta: el cargo de instalación,
/// las mensualidades retroactivas y el pago que cubre lo abonado en el mostrador.
/// </summary>
public interface IInitialChargesService
{
    /// <summary>
    /// Emite y cobra los cargos del alta.
    ///
    /// <para>No abre ni confirma transacción: se llama dentro de la del alta,
    /// porque un cliente sin sus cargos —o unos cargos sin cliente— no es un
    /// estado que deba existir.</para>
    /// </summary>
    Task ApplyAsync(
        Client            client,
        Plan              plan,
        RegisterClientDto dto,
        PaymentMethod?    paymentMethod,
        Guid              actorId,
        CancellationToken ct = default);
}
