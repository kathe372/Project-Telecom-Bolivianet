using Microsoft.Extensions.Logging.Abstractions;
using TelecomBoliviaNet.Application.Services.Auth;
using TelecomBoliviaNet.Domain.Entities.Audit;
using TelecomBoliviaNet.Domain.Interfaces;

namespace TelecomBoliviaNet.UnitTests.Helpers;

/// <summary>
/// Crea un <see cref="AuditService"/> real para tests.
///
/// AuditService.LogAsync no es virtual, por lo que no puede mockearse con Moq.
/// Como LogAsync captura y traga internamente cualquier fallo de escritura
/// (es best-effort y nunca debe abortar la operación de negocio), basta con un
/// repositorio mockeado por defecto: la auditoría no persiste pero tampoco rompe el test.
/// </summary>
public static class TestAudit
{
    public static AuditService Real() => new(
        new Mock<IGenericRepository<AuditLog>>().Object,
        NullLogger<AuditService>.Instance);
}
