namespace TelecomBoliviaNet.Infrastructure.Services.Reports;

/// <summary>
/// Etiqueta y colores de cada estado de factura, en un solo sitio.
///
/// Los <c>switch</c> del generador solo contemplaban Pagada, Pendiente, Vencida y
/// Anulada. <c>Emitida</c>, <c>Enviada</c> y <c>ParcialmentePagada</c> —tres de los
/// siete estados del dominio— salían sin color y no se contaban en ningún KPI, así
/// que los totales del encabezado no sumaban el total de filas de la tabla.
/// </summary>
internal static class InvoiceStatusStyle
{
    /// <summary>Estados con saldo por cobrar, para los KPIs de "pendiente".</summary>
    public static readonly string[] Unpaid = ["Pendiente", "Emitida", "Enviada", "ParcialmentePagada"];

    public static readonly string[] Paid = ["Pagada"];

    public static string Label(string status) => status switch
    {
        "ParcialmentePagada" => "Parcial",
        _                    => status
    };

    public static string Background(string status) => status switch
    {
        "Pagada"             => "#DCFCE7",
        "ParcialmentePagada" => "#DBEAFE",
        "Pendiente"          => "#FEF9C3",
        "Emitida"            => "#F1F5F9",
        "Enviada"            => "#E0E7FF",
        "Vencida"            => "#FEE2E2",
        "Anulada"            => "#F3F4F6",
        _                    => ReportTheme.White
    };

    public static string Foreground(string status) => status switch
    {
        "Pagada"             => "#166534",
        "ParcialmentePagada" => "#1E40AF",
        "Pendiente"          => "#854D0E",
        "Emitida"            => "#475569",
        "Enviada"            => "#3730A3",
        "Vencida"            => "#991B1B",
        "Anulada"            => "#6B7280",
        _                    => ReportTheme.Ink
    };
}
