using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.DTOs.Common;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Consulta y exportación del registro de auditoría.
///
/// Distinto de <c>AuditService</c>, que es quien ESCRIBE los asientos: éste solo
/// lee. Separarlos permite que una pantalla de consulta no arrastre la capacidad
/// de escribir en la auditoría.
/// </summary>
public interface IAuditLogService
{
    Task<PagedResult<AuditLogDto>> GetAsync(AuditLogFilterDto filter);
    Task<byte[]>                   ExportCsvAsync(AuditLogFilterDto filter);
}
