using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.DTOs.Auth;
using TelecomBoliviaNet.Application.DTOs.Common;
using TelecomBoliviaNet.Application.Utils;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Services.Auth;

public class AuditLogService : IAuditLogService
{
    private readonly IGenericRepository<AuditLog> _repo;

    public AuditLogService(IGenericRepository<AuditLog> repo)
    {
        _repo = repo;
    }


    public async Task<PagedResult<AuditLogDto>> GetAsync(AuditLogFilterDto filter)
    {
        var query = _repo.GetAllReadOnly().AsQueryable();

        if (filter.UserId.HasValue)
            query = query.Where(a => a.UserId == filter.UserId.Value);

        if (!string.IsNullOrWhiteSpace(filter.Action))
            query = query.Where(a => a.Action == filter.Action);

        if (!string.IsNullOrWhiteSpace(filter.Module))
            query = query.Where(a => a.Module == filter.Module);

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var s = filter.Search.Trim().ToLower();
            query = query.Where(a =>
                a.Description.ToLower().Contains(s) ||
                a.UserName.ToLower().Contains(s));
        }

        if (filter.From.HasValue)
            query = query.Where(a => a.CreatedAt >= filter.From.Value);

        if (filter.To.HasValue)
            query = query.Where(a => a.CreatedAt < filter.To.Value.Date.AddDays(1));

        query = query.OrderByDescending(a => a.CreatedAt);

        var total = await query.CountAsync();
        var items = await query
            .Skip((filter.PageNumber - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        return new PagedResult<AuditLogDto>(
            items.Select(MapToDto),
            total,
            filter.PageNumber,
            filter.PageSize);
    }


    public async Task<byte[]> ExportCsvAsync(AuditLogFilterDto filter)
    {
        var all = filter with { PageNumber = 1, PageSize = 10_000 };
        var result = await GetAsync(all);

        // CsvBuilder aporta el BOM (sin él Excel muestra "Módulo" como "MÃ³dulo") y
        // neutraliza los valores que empiezan con "=", que Excel ejecutaría como
        // fórmula — y aquí tanto el usuario como la descripción son datos de entrada.
        var csv = new CsvBuilder()
            .Row("Fecha", "Usuario", "Módulo", "Acción", "Descripción", "IP");

        foreach (var log in result.Items)
        {
            csv.Row(
                BoliviaTime.ToLocal(log.CreatedAt).ToString("yyyy-MM-dd HH:mm:ss"),
                log.UserName,
                log.Module,
                log.Action,
                log.Description,
                log.IpAddress);
        }

        return csv.ToBytes();
    }

    private static AuditLogDto MapToDto(AuditLog a) => new(
        Id:             a.Id,
        UserId:         a.UserId,
        UserName:       a.UserName,
        Module:         a.Module,
        Action:         a.Action,
        Description:    a.Description,
        IpAddress:      a.IpAddress,
        UserAgent:      a.UserAgent,
        PreviousData:   a.PreviousData,
        NewData:        a.NewData,
        IntegrityHash:  a.IntegrityHash,
        CreatedAt:      a.CreatedAt
    );
}
