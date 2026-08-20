using TelecomBoliviaNet.Domain.Entities.Clients;

namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Regla de negocio (2026-07-07): la facturación mensual se CONGELA mientras el cliente
/// está suspendido. Solo se emite mensualidad a clientes activos; la deuda de un suspendido
/// no crece hasta que se reactive.
/// </summary>
public static class BillingEligibility
{
    /// <summary>Estados a los que se les emite mensualidad. Traducible a SQL vía Contains.</summary>
    public static readonly ClientStatus[] BillableStatuses = [ClientStatus.Activo];

    public static bool ShouldBill(Client client) => BillableStatuses.Contains(client.Status);
}
