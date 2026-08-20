using Microsoft.EntityFrameworkCore;
using TelecomBoliviaNet.Application.DTOs.Notifications;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Admin;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Notifications;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Services.Notifications;

public class NotifTemplateService
{
    private readonly IGenericRepository<NotifTemplate>        _repo;
    private readonly IGenericRepository<NotifTemplateHistory> _historialRepo;
    private readonly IGenericRepository<Client>               _clientRepo;
    private readonly IGenericRepository<SystemConfig>         _sysConfigRepo;
    private readonly NotifContextBuilderService               _contextBuilder;
    private readonly AuditService                             _audit;

    public NotifTemplateService(
        IGenericRepository<NotifTemplate>        repo,
        IGenericRepository<NotifTemplateHistory> historialRepo,
        IGenericRepository<Client>               clientRepo,
        IGenericRepository<SystemConfig>         sysConfigRepo,
        NotifContextBuilderService               contextBuilder,
        AuditService                             audit)
    {
        _repo           = repo;
        _historialRepo  = historialRepo;
        _clientRepo     = clientRepo;
        _sysConfigRepo  = sysConfigRepo;
        _contextBuilder = contextBuilder;
        _audit          = audit;
    }


    public async Task<List<NotifTemplateDto>> GetPlantillasAsync(
        TemplateCategory? categoriaFilter = null, HsmStatus? hsmFilter = null)
    {
        var query = _repo.GetAll().Where(p => p.Activa);
        if (categoriaFilter.HasValue) query = query.Where(p => p.Categoria == categoriaFilter.Value);
        if (hsmFilter.HasValue)       query = query.Where(p => p.HsmStatus  == hsmFilter.Value);
        var list = await query.OrderBy(p => p.Tipo).ToListAsync();
        return list.Select(NotifShared.ToPlantillaDto).ToList();
    }

    public async Task<Result> UpdatePlantillaAsync(
        NotifType tipo, UpdateNotifTemplateDto dto, Guid actorId, string actorName, string ip)
    {
        var actual = await _repo.GetAll()
            .FirstOrDefaultAsync(p => p.Tipo == tipo && p.Activa);

        if (actual is null)
            return Result.Failure($"No se encontró plantilla activa para el tipo {tipo}.");

        await _historialRepo.AddAsync(new NotifTemplateHistory
        {
            PlantillaId    = actual.Id,
            Tipo           = actual.Tipo,
            Texto          = actual.Texto,
            ArchivadoAt    = DateTime.UtcNow,
            ArchivadoPorId = actorId,
        });

        var prevTexto  = actual.Texto;
        actual.Texto             = dto.Texto;
        actual.Categoria         = dto.Categoria;
        actual.HsmStatus         = dto.HsmStatus;
        actual.MetaTemplateName  = dto.MetaTemplateName;
        actual.MetaLanguageCode  = dto.MetaLanguageCode ?? "es";
        actual.MetaParamOrder    = dto.MetaParamOrder;
        actual.CreadoPorId       = actorId;
        actual.CreadoAt          = DateTime.UtcNow;
        await _repo.UpdateAsync(actual);

        await _audit.LogAsync("Notificaciones", "NOTIF_PLANTILLA_UPDATED",
            $"Plantilla actualizada: {tipo}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: prevTexto, newData: dto.Texto);

        return Result.Success();
    }

    public async Task<Result> UpdateHsmStatusAsync(
        NotifType tipo, HsmStatus nuevoStatus, Guid actorId, string actorName, string ip)
    {
        var actual = await _repo.GetAll()
            .FirstOrDefaultAsync(p => p.Tipo == tipo && p.Activa);
        if (actual is null) return Result.Failure($"Plantilla no encontrada para tipo {tipo}.");

        var prev = actual.HsmStatus.ToString();
        actual.HsmStatus = nuevoStatus;
        await _repo.UpdateAsync(actual);

        await _audit.LogAsync("Notificaciones", "NOTIF_HSM_UPDATED",
            $"HSM status actualizado: {tipo} → {nuevoStatus}",
            userId: actorId, userName: actorName, ip: ip,
            prevData: prev, newData: nuevoStatus.ToString());

        return Result.Success();
    }

    public async Task<Result> RestoreDefaultAsync(
        NotifType tipo, Guid actorId, string actorName, string ip)
    {
        if (!NotifShared.DefaultTextos.TryGetValue(tipo, out var defaultText))
            return Result.Failure($"No hay texto por defecto definido para {tipo}.");

        return await UpdatePlantillaAsync(tipo,
            new UpdateNotifTemplateDto(defaultText), actorId, actorName, ip);
    }


    public IReadOnlyDictionary<string, string> GetVariablesDisponibles()
        => NotifShared.VariableDescriptions;

    public async Task<TemplatePreviewDto> PreviewPlantillaAsync(
        string texto, Guid? clienteId = null)
    {
        var ctx = clienteId.HasValue
            ? await BuildContextoAsync(clienteId.Value, null, null, null)
            : await BuildContextoAsync(
                await GetPrimerClienteIdAsync(), null, null, null);

        ctx["empresa"] = await GetEmpresaNombreAsync();

        var rendered      = texto;
        var noEncontradas = new List<string>();

        foreach (var variable in NotifShared.VariableDescriptions.Keys)
        {
            var key = variable.Trim('{', '}');
            if (ctx.TryGetValue(key, out var valor) && !string.IsNullOrEmpty(valor))
                rendered = rendered.Replace(variable, valor);
            else if (rendered.Contains(variable))
                noEncontradas.Add(variable);
        }

        return new TemplatePreviewDto(rendered, noEncontradas);
    }

    /// <summary>
    /// Contexto de variables para la vista previa de una plantilla.
    ///
    /// Delega en <see cref="NotifContextBuilderService"/>, que es el ÚNICO sitio donde se arma
    /// el contexto real de un envío. Antes esta clase tenía su propia copia con tres defectos:
    /// filtraba la deuda por Pendiente|Vencida (cero los primeros días del mes), sumaba el
    /// monto bruto en vez del saldo, y no producía {{meses_deuda_detalle}} ni {{qr_enlace}} —
    /// así que la vista previa mostraba esas variables como "no encontradas" aunque el mensaje
    /// que recibía el cliente sí las traía. Ahora previsualizar y enviar usan el mismo código.
    /// </summary>
    public Task<Dictionary<string, string>> BuildContextoAsync(
        Guid clienteId, Guid? ticketId, string? tecnicoNombre, DateTime? fechaVisita)
        => _contextBuilder.BuildAsync(clienteId, ticketId, tecnicoNombre, fechaVisita);

    private async Task<Guid> GetPrimerClienteIdAsync()
        => await _clientRepo.GetAll()
            .Where(c => !c.IsDeleted)
            .OrderBy(c => c.CreatedAt)
            .Select(c => c.Id)
            .FirstOrDefaultAsync();

    private async Task<string> GetEmpresaNombreAsync()
    {
        var cfg = await _sysConfigRepo.GetAll()
            .FirstOrDefaultAsync(s => s.Key == "ISP:NombreEmpresa");
        return cfg?.Value ?? "TelecomBoliviaNet";
    }
}
