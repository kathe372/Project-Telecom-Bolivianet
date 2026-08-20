using System.Reflection;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Primitives;

namespace TelecomBoliviaNet.Tests.Helpers;

public static class TestEntityFactory
{
    public static Client MakeClient(
        Guid?             id               = null,
        string            tbnCode          = "TBN-001",
        string            fullName         = "Test Cliente",
        string            phoneMain        = "59170000001",
        Guid?             planId           = null,
        ClientStatus      status           = ClientStatus.Activo,
        DateTime?         installationDate = null,
        DateTime?         suspendedAt      = null,
        IEnumerable<Invoice>? invoices     = null)
    {
        var client = (Client)Activator.CreateInstance(
            typeof(Client), nonPublic: true)!;

        SetProperty(client, typeof(Entity), "Id", id ?? Guid.NewGuid());

        client.TbnCode          = tbnCode;
        client.FullName         = fullName;
        client.PhoneMain        = phoneMain;
        client.PlanId           = planId ?? Guid.NewGuid();
        client.Zone             = "Sur";
        client.IdentityCard     = "12345678";
        client.WinboxNumber     = string.Empty;
        client.InstallationDate = installationDate ?? DateTime.UtcNow.AddMonths(-3);

        SetProperty(client, typeof(Client), "Status", status);
        if (suspendedAt.HasValue)
            SetProperty(client, typeof(Client), "SuspendedAt", suspendedAt.Value);

        if (invoices != null)
            client.Invoices = invoices.ToList();

        return client;
    }

    private static void SetProperty(object target, Type declaringType, string name, object value)
    {
        var prop = declaringType.GetProperty(name,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

        if (prop is null)
            throw new InvalidOperationException(
                $"Property '{name}' not found on {declaringType.Name}.");

        var setter = prop.GetSetMethod(nonPublic: true)
                  ?? prop.DeclaringType?.GetMethod($"set_{name}",
                       BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);

        if (setter is null)
            throw new InvalidOperationException(
                $"No setter found for '{name}' on {declaringType.Name}.");

        setter.Invoke(target, [value]);
    }
}
