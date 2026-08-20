#pragma warning disable CS8981
using r = TelecomBoliviaNet.Domain.Primitives.Result;
#pragma warning restore CS8981
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifConfigService
{
    private readonly NotifTriggerService   _trigger;
    private readonly NotifTemplateService _plantilla;
    private readonly NotifSegmentService   _segment;
    private readonly NotifHistoryService _historial;

    public NotifConfigService(
        NotifTriggerService   trigger,
        NotifTemplateService plantilla,
        NotifSegmentService   segment,
        NotifHistoryService historial)
    {
        _trigger   = trigger;
        _plantilla = plantilla;
        _segment   = segment;
        _historial = historial;
    }


    public Task<NotifConfigListDto> GetConfigsAsync()
        => _trigger.GetConfigsAsync();

    public Task<Result> UpdateConfigsAsync(
        UpdateNotifConfigsDto dto, Guid actorId, string actorName, string ip)
        => _trigger.UpdateConfigsAsync(dto, actorId, actorName, ip);


    public Task<List<NotifTemplateDto>> GetPlantillasAsync(
        TemplateCategory? categoriaFilter = null,
        HsmStatus? hsmFilter = null)
        => _plantilla.GetPlantillasAsync(categoriaFilter, hsmFilter);

    public Task<Result> UpdatePlantillaAsync(
        NotifType tipo, UpdateNotifTemplateDto dto,
        Guid actorId, string actorName, string ip)
        => _plantilla.UpdatePlantillaAsync(tipo, dto, actorId, actorName, ip);

    public Task<Result> UpdateHsmStatusAsync(
        NotifType tipo, HsmStatus nuevoStatus,
        Guid actorId, string actorName, string ip)
        => _plantilla.UpdateHsmStatusAsync(tipo, nuevoStatus, actorId, actorName, ip);

    public Task<Result> RestoreDefaultAsync(
        NotifType tipo, Guid actorId, string actorName, string ip)
        => _plantilla.RestoreDefaultAsync(tipo, actorId, actorName, ip);


    public IReadOnlyDictionary<string, string> GetVariablesDisponibles()
        => _plantilla.GetVariablesDisponibles();

    public Task<TemplatePreviewDto> PreviewPlantillaAsync(
        string texto, Guid? clienteId = null)
        => _plantilla.PreviewPlantillaAsync(texto, clienteId);


    public Task<List<NotifSegmentDto>> GetSegmentsAsync()
        => _segment.GetSegmentsAsync();

    public Task<Result<NotifSegmentDto>> GetSegmentByIdAsync(Guid id)
        => _segment.GetSegmentByIdAsync(id);

    public Task<Result<NotifSegmentDto>> CreateSegmentAsync(
        CreateOrUpdateSegmentDto dto, Guid actorId, string actorName, string ip)
        => _segment.CreateAsync(dto, actorId, actorName, ip);

    public Task<Result<NotifSegmentDto>> UpdateSegmentAsync(
        Guid id, CreateOrUpdateSegmentDto dto, Guid actorId, string actorName, string ip)
        => _segment.UpdateAsync(id, dto, actorId, actorName, ip);

    public Task<r> DeleteSegmentAsync(
        Guid id, Guid actorId, string actorName, string ip)
        => _segment.DeleteAsync(id, actorId, actorName, ip);

    public Task<SegmentPreviewDto> PreviewSegmentAsync(CreateOrUpdateSegmentDto dto)
        => _segment.PreviewAsync(dto);


    public Task<NotifLogPageDto> GetHistorialClienteAsync(
        Guid clienteId, int page, int pageSize,
        string? tipoFilter, DateTime? desde, DateTime? hasta)
        => _historial.GetHistorialClienteAsync(
            clienteId, page, pageSize, tipoFilter, desde, hasta);


    public Task<Dictionary<string, string>> BuildContextoAsync(
        Guid clienteId, Guid? ticketId, string? tecnicoNombre, DateTime? fechaVisita)
        => _plantilla.BuildContextoAsync(clienteId, ticketId, tecnicoNombre, fechaVisita);
}
