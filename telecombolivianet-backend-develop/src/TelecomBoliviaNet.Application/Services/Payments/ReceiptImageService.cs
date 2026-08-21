using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Payments;

public class ReceiptImageService : IReceiptImageService
{
    private readonly IGenericRepository<Payment> _paymentRepo;
    private readonly IFileStorage                _fileStorage;
    private readonly AuditService                _audit;
    private readonly ILogger<ReceiptImageService> _logger;

    public ReceiptImageService(
        IGenericRepository<Payment> paymentRepo,
        IFileStorage                fileStorage,
        AuditService                audit,
        ILogger<ReceiptImageService> logger)
    {
        _paymentRepo = paymentRepo;
        _fileStorage = fileStorage;
        _audit       = audit;
        _logger      = logger;
    }

    public async Task<Result<string>> AttachReceiptImageAsync(
        Guid paymentId, Stream stream, string fileName, string contentType,
        Guid actorId, string actorName, string ip)
    {
        var payment = await _paymentRepo.GetAll()
            .Include(p => p.Client)
            .FirstOrDefaultAsync(p => p.Id == paymentId);

        if (payment is null) return Result<string>.Failure("Pago no encontrado.");

        if (!string.IsNullOrEmpty(payment.ReceiptImageUrl))
            await _fileStorage.DeleteAsync(payment.ReceiptImageUrl);

        var tbn           = payment.Client?.TbnCode ?? "TBN";
        var safeFileName  = Path.GetFileName(fileName ?? "receipt");
        safeFileName      = string.Concat(safeFileName.Where(c =>
            char.IsLetterOrDigit(c) || c == '_' || c == '-' || c == '.'));
        if (string.IsNullOrEmpty(safeFileName)) safeFileName = "receipt";
        var newFileName   = $"{tbn}_{payment.PaidAt:yyyyMMdd}_{safeFileName}";

        string url;
        try
        {
            // El tercer parámetro de SaveAsync es la carpeta destino ("receipts" por defecto),
            // NO el contentType. El tipo de archivo ya fue validado en el controlador.
            url = await _fileStorage.SaveAsync(stream, newFileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al subir comprobante del pago {PaymentId}", paymentId);
            return Result<string>.Failure(
                "No se pudo subir el comprobante. Verifique el archivo e intente nuevamente.");
        }

        payment.ReceiptImageUrl = url;
        _paymentRepo.Update(payment);
        await _paymentRepo.SaveChangesAsync();
        await _audit.LogAsync("Pagos", "RECEIPT_ATTACHED",
            $"Comprobante adjuntado al pago de {tbn}",
            userId: actorId, userName: actorName, ip: ip,
            newData: JsonSerializer.Serialize(new { PaymentId = paymentId, Url = url }));

        return Result<string>.Success(url);
    }
}
