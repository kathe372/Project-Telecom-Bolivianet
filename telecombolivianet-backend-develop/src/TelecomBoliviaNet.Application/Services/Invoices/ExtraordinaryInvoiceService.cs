using TelecomBoliviaNet.Application.DTOs.Invoices;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Invoices;

/// <summary>
/// Cargos que no vienen del ciclo mensual: reconexión, material, traslado.
///
/// <para>Extraído de <c>InvoiceOperationsService</c> (F5), que agrupaba bajo un
/// nombre genérico crear un cargo, cambiar estados y aplicar saldo a favor.</para>
/// </summary>
public class ExtraordinaryInvoiceService : IExtraordinaryInvoiceService
{
    public static readonly string[] MotivosExtraordinarios =
        { "Reconexion", "Equipo", "VisitaTecnica", "Instalacion", "Otro" };

    private readonly IGenericRepository<Invoice> _invoiceRepo;
    private readonly IGenericRepository<Client>  _clientRepo;
    private readonly InvoiceNumberService        _invNumSvc;
    private readonly AuditService                _audit;

    public ExtraordinaryInvoiceService(
        IGenericRepository<Invoice> invoiceRepo,
        IGenericRepository<Client>  clientRepo,
        InvoiceNumberService        invNumSvc,
        AuditService                audit)
    {
        _invoiceRepo = invoiceRepo;
        _clientRepo  = clientRepo;
        _invNumSvc   = invNumSvc;
        _audit       = audit;
    }

    public async Task<Result<InvoiceListItemDto>> CreateExtraordinaryAsync(
        CreateExtraordinaryInvoiceDto dto,
        Guid actorId, string actorName, string ip)
    {
        if (!MotivosExtraordinarios.Contains(dto.Motivo))
            return Result<InvoiceListItemDto>.Failure(
                $"Motivo inválido. Debe ser uno de: {string.Join(", ", MotivosExtraordinarios)}");

        if (dto.Amount <= 0)
            return Result<InvoiceListItemDto>.Failure("El monto debe ser mayor a cero.");

        var client = await _clientRepo.GetByIdAsync(dto.ClientId);
        if (client is null) return Result<InvoiceListItemDto>.Failure("Cliente no encontrado.");

        var invNumber = await _invNumSvc.NextInvoiceNumberAsync(isExtraordinary: true);
        var today     = DateTime.UtcNow;

        var invoice = new Invoice
        {
            ClientId             = dto.ClientId,
            Type                 = InvoiceType.Extraordinaria,
            Status               = InvoiceStatus.Emitida,
            Year                 = today.Year,
            Month                = today.Month,
            Amount               = dto.Amount,
            AmountPaid           = 0m,
            IssuedAt             = today,
            DueDate              = dto.DueDate.ToUniversalTime(),
            Notes                = dto.Notes,
            IsExtraordinary      = true,
            ExtraordinaryReason  = dto.Motivo,
            InvoiceNumber        = invNumber,
        };

        await _invoiceRepo.AddAsync(invoice);
        await _invoiceRepo.SaveChangesAsync();

        await _audit.LogAsync("Facturación", "EXTRAORDINARY_INVOICE_CREATED",
            $"Factura extraordinaria {invNumber}: {client.TbnCode} Bs.{dto.Amount:F2} motivo={dto.Motivo}",
            userId: actorId, userName: actorName, ip: ip,
            newData: System.Text.Json.JsonSerializer.Serialize(new {
                InvoiceNumber = invNumber, ClientId = dto.ClientId,
                Amount = dto.Amount, Motivo = dto.Motivo }));

        return Result<InvoiceListItemDto>.Success(MapToListItem(invoice, client));
    }

    private static InvoiceListItemDto MapToListItem(Invoice i, Client c) => new(
        i.Id,
        i.InvoiceNumber ?? i.Id.ToString()[..8],
        c.Id, c.TbnCode, c.FullName,
        i.Type.ToString(), i.Status.ToString(),
        i.Year, i.Month,
        i.Amount, i.AmountPaid, i.CreditApplied,
        i.IssuedAt, i.DueDate, i.UpdatedAt,
        i.Notes,
        i.IsExtraordinary, i.ExtraordinaryReason
    );
}
