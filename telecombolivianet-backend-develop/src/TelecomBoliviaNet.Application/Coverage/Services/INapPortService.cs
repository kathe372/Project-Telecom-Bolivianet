using TelecomBoliviaNet.Domain.Entities.Coverage;

namespace TelecomBoliviaNet.Application.Coverage.Services;

/// <summary>
/// Gestiona el read-model de puertos (<see cref="NapPort"/>). Reconcilia las filas
/// desde la fuente de verdad (contadores de la caja + instalaciones completadas +
/// reservas vigentes) y expone la operación de negocio DAÑAR/REPARAR un puerto.
/// NO participa en el motor de cobertura (que sigue usando los contadores).
/// </summary>
public interface INapPortService
{
    /// <summary>Reconcilia y devuelve los puertos de una caja (ordenados por número).</summary>
    Task<IReadOnlyList<NapPort>> GetBoxPortsAsync(Guid boxId, CancellationToken ct = default);

    /// <summary>
    /// Marca un puerto LIBRE como dañado y reduce <c>PuertosTotal</c> (capacidad real).
    /// Devuelve false si el puerto no existe o no está libre.
    /// </summary>
    Task<bool> MarkDamagedAsync(Guid boxId, int numero, CancellationToken ct = default);

    /// <summary>Repara un puerto dañado (vuelve a LIBRE) y restituye <c>PuertosTotal</c>.</summary>
    Task<bool> RepairAsync(Guid boxId, int numero, CancellationToken ct = default);

    /// <summary>Reconcilia los puertos de todas las cajas (job periódico).</summary>
    Task SyncAllAsync(CancellationToken ct = default);
}
