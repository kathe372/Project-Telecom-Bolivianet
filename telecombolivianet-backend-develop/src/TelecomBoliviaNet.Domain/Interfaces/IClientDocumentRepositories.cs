using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Interfaces;

/// <summary>
/// Consultas de los adjuntos de un cliente (CI, contrato, fotos). Ver ADR-001.
/// </summary>
public interface IClientAttachmentRepository : IGenericRepository<ClientAttachment>
{
    /// <summary>
    /// Adjuntos vigentes del cliente, del más reciente al más antiguo y con
    /// quién los subió. Los borrados no cuentan: siguen en la tabla por
    /// auditoría, pero para la ficha no existen.
    /// </summary>
    Task<List<ClientAttachment>> GetActiveByClientAsync(
        Guid clientId, CancellationToken ct = default);

    /// <summary>Cuántos adjuntos vigentes tiene, para el tope por cliente.</summary>
    Task<int> CountActiveByClientAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// Adjuntos subidos dentro de una ventana de fechas, con quién los subió —
    /// incluidos los borrados después, porque la subida ocurrió igual.
    /// </summary>
    Task<List<ClientAttachment>> GetForClientBetweenAsync(
        Guid clientId, DateTime? from, DateTime? to, CancellationToken ct = default);
}

/// <summary>
/// Consultas del QR de pago de un cliente. Ver ADR-001.
///
/// <para>Un cliente tiene como mucho un QR activo; los anteriores quedan
/// desactivados con el motivo, de ahí que el historial y el activo sean
/// consultas distintas.</para>
/// </summary>
public interface IClientQrRepository : IGenericRepository<ClientQr>
{
    /// <summary>QR activo del cliente, sin mirar si ya expiró. Null si no tiene.</summary>
    Task<ClientQr?> GetActiveAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// QR activo y aún vigente a la fecha dada, con el cliente cargado — el que
    /// se le muestra a quien va a pagar. Null si no tiene o si ya expiró.
    /// </summary>
    Task<ClientQr?> GetActiveValidAsync(
        Guid clientId, DateTime now, CancellationToken ct = default);

    /// <summary>QRs que siguen marcados como activos pero cuya fecha ya pasó.</summary>
    Task<List<ClientQr>> GetExpiredAsync(DateTime now, CancellationToken ct = default);

    /// <summary>Todos los QRs del cliente, del más reciente al más antiguo.</summary>
    Task<List<ClientQr>> GetHistoryAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>
    /// QRs vigentes que expiran dentro de la ventana de aviso y por los que aún
    /// no se avisó, con el cliente cargado para poder nombrarlo en la alerta.
    /// </summary>
    Task<List<ClientQr>> GetExpiringSoonAsync(
        DateTime now, DateTime alertDate, CancellationToken ct = default);
}
