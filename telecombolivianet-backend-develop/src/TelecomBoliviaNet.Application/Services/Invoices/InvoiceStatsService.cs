using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Services;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Los totales que encabezan la pantalla de Facturación: cuánto se emitió y
/// cuánto se cobró, por mes o por rango de fechas.
///
/// <para>Extraído de <c>InvoiceQueryService</c> (F5), que además listaba y
/// generaba tres informes en 419 líneas.</para>
/// </summary>
public class InvoiceStatsService : IInvoiceStatsService
{
    private readonly IGenericRepository<Invoice> _invoiceRepo;

    public InvoiceStatsService(IGenericRepository<Invoice> invoiceRepo)
        => _invoiceRepo = invoiceRepo;

    public async Task<InvoiceMonthStatsDto> GetMonthStatsAsync(int year, int month, string? type = null)
    {
        var invoices = await InvoiceQuerySpecs.ApplyTypeFilter(
                _invoiceRepo.GetAll().Where(i => i.Year == year && i.Month == month), type)
            .ToListAsync();

        var billed = invoices.Sum(i => i.Amount);

        var collected = invoices.Sum(i => i.Status switch
        {
            InvoiceStatus.Pagada             => i.Amount,
            InvoiceStatus.ParcialmentePagada => i.AmountPaid,
            _                                => 0m
        });

        var pending = invoices.Sum(i => i.Status switch
        {
            InvoiceStatus.Pagada  => 0m,
            InvoiceStatus.Anulada => 0m,
            InvoiceStatus.ParcialmentePagada => i.Amount - i.AmountPaid,
            _                                => i.Amount
        });

        var rate = billed > 0 ? Math.Round(collected / billed * 100, 1) : 0;

        return new InvoiceMonthStatsDto(
            year, month, billed, collected, pending,
            invoices.Count,
            invoices.Count(i => i.Status is InvoiceStatus.Pagada or InvoiceStatus.ParcialmentePagada),
            invoices.Count(i => i.Status is InvoiceStatus.Pendiente or InvoiceStatus.Emitida or InvoiceStatus.Enviada),
            invoices.Count(i => i.Status == InvoiceStatus.Vencida),
            rate);
    }


    public async Task<InvoiceRangeStatsDto> GetRangeStatsAsync(
        DateTime dateFrom, DateTime dateTo, string? type = null)
    {
        var utcFrom = DateTime.SpecifyKind(dateFrom.Date, DateTimeKind.Utc);
        var utcTo   = DateTime.SpecifyKind(dateTo.Date.AddDays(1), DateTimeKind.Utc);

        var invoices = await InvoiceQuerySpecs.ApplyTypeFilter(
                _invoiceRepo.GetAll().Where(i => i.IssuedAt >= utcFrom && i.IssuedAt < utcTo), type)
            .ToListAsync();

        var billed = invoices.Sum(i => i.Amount);

        var collected = invoices.Sum(i => i.Status switch
        {
            InvoiceStatus.Pagada             => i.Amount,
            InvoiceStatus.ParcialmentePagada => i.AmountPaid,
            _                                => 0m
        });

        var pending = invoices.Sum(i => i.Status switch
        {
            InvoiceStatus.Pagada             => 0m,
            InvoiceStatus.Anulada            => 0m,
            InvoiceStatus.ParcialmentePagada => i.Amount - i.AmountPaid,
            _                                => i.Amount
        });

        var rate = billed > 0 ? Math.Round(collected / billed * 100, 1) : 0;

        return new InvoiceRangeStatsDto(
            dateFrom, dateTo, billed, collected, pending,
            invoices.Count,
            invoices.Count(i => i.Status is InvoiceStatus.Pagada or InvoiceStatus.ParcialmentePagada),
            invoices.Count(i => i.Status is InvoiceStatus.Pendiente or InvoiceStatus.Emitida or InvoiceStatus.Enviada),
            invoices.Count(i => i.Status == InvoiceStatus.Vencida),
            rate);
    }


    /// <summary>
    /// Traduce el filtro de tipo del DTO a un predicado. Sin tipo (o "all") no filtra: la
    /// pantalla de Facturación muestra TODO lo emitido, incluidas las extraordinarias y las de
    /// instalación, que antes quedaban invisibles.
    /// </summary>
}
