namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cuánto se cobra el mes en que se instaló el servicio.
///
/// <para>Era un método privado y estático de <c>BillingService</c>. Es una regla
/// pura —sin base de datos, sin reloj del sistema, sin nada inyectado— así que su
/// sitio es el dominio, donde se prueba con una tabla de casos en vez de montando
/// un servicio con ocho dependencias.</para>
///
/// <para>La regla del negocio: quien se instala a mitad de mes paga solo los días
/// que le quedan, contando el propio día de la instalación. Los meses siguientes
/// se cobran completos.</para>
/// </summary>
public static class ProrationCalculator
{
    /// <summary>
    /// Importe y nota del periodo indicado. Si la instalación no cae en ese mes,
    /// devuelve la mensualidad íntegra y ninguna nota.
    /// </summary>
    public static (decimal Amount, string? Notes) FirstMonth(
        decimal monthlyPrice, DateTime installDate, int year, int month)
    {
        var esElMesDeInstalacion = installDate.Year == year && installDate.Month == month;
        if (!esElMesDeInstalacion)
            return (monthlyPrice, null);

        var diasDelMes    = DateTime.DaysInMonth(year, month);
        // +1 porque el día de la instalación se cobra.
        var diasRestantes = diasDelMes - installDate.Day + 1;

        return (Math.Round(monthlyPrice * diasRestantes / diasDelMes, 2),
                $"Mes proporcional: {diasRestantes} de {diasDelMes} días");
    }
}
