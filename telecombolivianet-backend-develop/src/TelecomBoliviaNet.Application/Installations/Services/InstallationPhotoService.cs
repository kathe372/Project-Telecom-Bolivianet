using TelecomBoliviaNet.Application.Interfaces;
using TelecomBoliviaNet.Domain.Entities.Installations;
using TelecomBoliviaNet.Domain.Interfaces;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Installations.Services;

/// <summary>
/// Sube las fotos de evidencia de una instalación a Supabase Storage
/// (F5 nivel comercial: prueba visual del trabajo realizado).
/// </summary>
public class InstallationPhotoService : IInstallationPhotoService
{
    private readonly IGenericRepository<Installation> _instRepo;
    private readonly IFileStorage                     _storage;

    public InstallationPhotoService(
        IGenericRepository<Installation> instRepo,
        IFileStorage                     storage)
    {
        _instRepo = instRepo;
        _storage  = storage;
    }

    public async Task<Result<string>> UploadAsync(
        Guid installationId, Stream stream, string fileName)
    {
        var inst = await _instRepo.GetByIdAsync(installationId);
        if (inst is null)
            return Result<string>.Failure("Instalación no encontrada.");
        if (inst.Status == InstallationStatus.Cancelada)
            return Result<string>.Failure("No se pueden adjuntar fotos a una instalación cancelada.");

        var url = await _storage.SaveAsync(
            stream, fileName, folder: $"instalaciones/{installationId}");

        return Result<string>.Success(url);
    }
}
