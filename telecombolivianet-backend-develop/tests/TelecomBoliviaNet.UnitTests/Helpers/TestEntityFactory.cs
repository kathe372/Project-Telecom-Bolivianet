using System.Reflection;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Entities.Plans;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.UnitTests.Helpers;

/// <summary>
/// Crea entidades de dominio para tests unitarios, sorteando el constructor privado
/// y los setters privados que en producción protegen invariantes de negocio
/// (p. ej. <see cref="Client.Status"/> solo cambia vía métodos de dominio).
///
/// El uso de reflexión es intencional: los tests necesitan montar estados específicos
/// (Suspendido, DadoDeBaja, con crédito…) sin recorrer el flujo de negocio completo,
/// que ya se cubre en tests de handlers/integración.
/// </summary>
public static class TestEntityFactory
{
    /// <summary>Crea un Client en cualquier estado para tests unitarios.</summary>
    public static Client MakeClient(
        Guid?                 id               = null,
        string                tbnCode          = "TBN-00001",
        string                fullName         = "Test Cliente",
        string                phoneMain        = "59170000001",
        Guid?                 planId           = null,
        ClientStatus          status           = ClientStatus.Activo,
        DateTime?             installationDate = null,
        decimal               creditBalance    = 0m,
        Plan?                 plan             = null,
        IEnumerable<Invoice>? invoices         = null)
    {
        // Constructor privado sin parámetros que usa EF Core
        var client = (Client)Activator.CreateInstance(typeof(Client), nonPublic: true)!;

        SetProperty(client, typeof(Entity), "Id", id ?? Guid.NewGuid());

        // Setters públicos
        client.TbnCode          = tbnCode;
        client.FullName         = fullName;
        client.PhoneMain        = phoneMain;
        client.PlanId           = planId ?? plan?.Id ?? Guid.NewGuid();
        client.Zone             = "Sur";
        client.IdentityCard     = "12345678";
        client.WinboxNumber     = string.Empty;
        client.InstallationDate = installationDate ?? DateTime.UtcNow.AddMonths(-3);
        client.CreditBalance    = creditBalance;
        if (plan is not null) client.Plan = plan;

        // Setter privado — vía reflexión
        SetProperty(client, typeof(Client), "Status", status);

        if (invoices is not null)
            client.Invoices = invoices.ToList();

        return client;
    }

    private static void SetProperty(object target, Type declaringType, string name, object value)
    {
        var prop = declaringType.GetProperty(name,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

        if (prop is null)
            throw new InvalidOperationException($"Property '{name}' not found on {declaringType.Name}.");

        var setter = prop.GetSetMethod(nonPublic: true)
                  ?? prop.DeclaringType?.GetMethod($"set_{name}",
                       BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);

        if (setter is null)
            throw new InvalidOperationException($"No setter found for '{name}' on {declaringType.Name}.");

        setter.Invoke(target, [value]);
    }
}
