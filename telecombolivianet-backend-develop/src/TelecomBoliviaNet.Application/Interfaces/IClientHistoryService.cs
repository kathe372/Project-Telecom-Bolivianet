using TelecomBoliviaNet.Application.DTOs.Clients;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Línea de tiempo unificada de un cliente: pagos, facturas, tickets,
/// instalaciones y cambios de plan en un solo listado paginable.
/// </summary>
public interface IClientHistoryService
{
    Task<ClientHistoryDto> GetHistorialAsync(
        Guid clientId, int page, int pageSize,
        string? tipoFilter, DateTime? desde, DateTime? hasta);
}
