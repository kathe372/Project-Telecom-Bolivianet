using MediatR;
using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Tickets;
using TelecomBoliviaNet.Application.Services.Notifications;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.Application.Tickets.Queries;

public record GetTicketKpiQuery(DateTime? Desde = null, DateTime? Hasta = null, string? Tecnico = null)
    : IRequest<TicketKpiDto>;

public class GetTicketKpiHandler : IRequestHandler<GetTicketKpiQuery, TicketKpiDto>
{
    private readonly IGenericRepository<SupportTicket> _ticketRepo;

    public GetTicketKpiHandler(IGenericRepository<SupportTicket> ticketRepo) => _ticketRepo = ticketRepo;

    public async Task<TicketKpiDto> Handle(GetTicketKpiQuery query, CancellationToken ct)
    {
        // EXCEPCIÓN DELIBERADA A F4 (ADR-001): este handler conserva EF Core.
        //
        // Es un REPORTE: ocho conteos, un GroupBy por prioridad y dos promedios,
        // todos sobre la misma consulta base filtrada. Que se agreguen en SQL es
        // una optimización buscada — traer los tickets a memoria para contarlos
        // sería mucho peor. Envolverlo en un repositorio significaría un método
        // por cada métrica, o uno gigante que devuelve el DTO entero, que es
        // mover el problema de sitio.
        //
        // Mismo criterio que PaymentService.GetCollectionReportAsync.
        var now   = DateTime.UtcNow;
        var q     = _ticketRepo.GetAll();

        // P1.3 (auditoría 2026-08): "hoy" para un KPI de negocio significa el
        // día calendario LOCAL de Bolivia, no el día UTC — un ticket creado a
        // las 21:00 hora Bolivia (ya 01:00 UTC del día siguiente) se estaba
        // contando como "de mañana" en vez de "de hoy". Se calculan los
        // límites del día local y se convierten a UTC (así la comparación
        // sigue siendo traducible a SQL por EF, sin convertir fila por fila).
        var ahoraLocal  = TimeZoneInfo.ConvertTimeFromUtc(now, NotifShared.BoliviaZone);
        var inicioHoyUtc = TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(ahoraLocal.Date, DateTimeKind.Unspecified), NotifShared.BoliviaZone);
        var finHoyUtc = inicioHoyUtc.AddDays(1);

        if (query.Desde.HasValue) q = q.Where(t => t.CreatedAt >= query.Desde.Value);
        if (query.Hasta.HasValue) q = q.Where(t => t.CreatedAt <= query.Hasta.Value);
        if (!string.IsNullOrWhiteSpace(query.Tecnico))
        {
            var tecnicoUpper = query.Tecnico.ToUpper();
            q = q.Where(t => t.AssignedTo != null && t.AssignedTo.FullName.ToUpper().Contains(tecnicoUpper));
        }

        var abierto   = await q.CountAsync(t => t.Status == TicketStatus.Abierto, ct);
        var enProceso = await q.CountAsync(t => t.Status == TicketStatus.EnProceso || t.Status == TicketStatus.PendienteCliente, ct);
        var resuelto  = await q.CountAsync(t => t.Status == TicketStatus.Resuelto, ct);
        var cerrado   = await q.CountAsync(t => t.Status == TicketStatus.Cerrado, ct);
        var vencidos  = await q.CountAsync(t =>
            t.DueDate.HasValue && t.DueDate.Value < now &&
            t.Status != TicketStatus.Resuelto &&
            t.Status != TicketStatus.Cerrado  &&
            t.Status != TicketStatus.PendienteCliente, ct);
        var hoy = await q.CountAsync(t => t.CreatedAt >= inicioHoyUtc && t.CreatedAt < finHoyUtc, ct);
        var slaCump   = await q.CountAsync(t => t.SlaCompliant == true, ct);
        var slaIncump = await q.CountAsync(t => t.SlaCompliant == false, ct);

        var slaRaw = await q
            .Where(t => t.SlaCompliant.HasValue)
            .GroupBy(t => t.Priority)
            .Select(g => new {
                Priority  = g.Key.ToString(),
                Compliant = g.Count(t => t.SlaCompliant == true),
                Breached  = g.Count(t => t.SlaCompliant == false),
            })
            .ToListAsync(ct);

        var priorityOrder = new[] { "Critica", "Alta", "Media", "Baja" };
        var slaByPriority = slaRaw
            .OrderBy(x => Array.IndexOf(priorityOrder, x.Priority))
            .Select(x => new SlaByPriorityDto(x.Priority, x.Compliant, x.Breached));

        var resolvedPairs = await q
            .Where(t => t.ResolvedAt.HasValue)
            .Select(t => new { t.CreatedAt, t.ResolvedAt })
            .ToListAsync(ct);
        double? mttr = resolvedPairs.Any()
            ? resolvedPairs.Average(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalMinutes)
            : null;

        var firstResponsePairs = await q
            .Where(t => t.FirstRespondedAt.HasValue)
            .Select(t => new { t.CreatedAt, t.FirstRespondedAt })
            .ToListAsync(ct);
        double? mtta = firstResponsePairs.Any()
            ? firstResponsePairs.Average(t => (t.FirstRespondedAt!.Value - t.CreatedAt).TotalMinutes)
            : null;

        return new TicketKpiDto(abierto, enProceso, resuelto, cerrado,
            vencidos, hoy, slaCump, slaIncump,
            slaByPriority, mttr, mtta);
    }
}
