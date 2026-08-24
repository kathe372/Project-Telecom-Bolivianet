using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Application.Interfaces;

/// <summary>
/// Fotos de evidencia que el técnico sube al cerrar una instalación.
/// Devuelve la URL almacenada.
/// </summary>
public interface IInstallationPhotoService
{
    Task<Result<string>> UploadAsync(Guid installationId, Stream stream, string fileName);
}
