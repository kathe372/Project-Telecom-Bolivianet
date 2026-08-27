namespace TelecomBoliviaNet.Domain.Services;

/// <summary>En qué punto de su plazo va un ticket.</summary>
public enum SlaLevel
{
    /// <summary>Va sobrado. No sale en el panel de alertas.</summary>
    Ok,

    /// <summary>Consumió la mitad del plazo: conviene mirarlo.</summary>
    Attention,

    /// <summary>Le queda un cuarto del plazo.</summary>
    Warning,

    /// <summary>Se pasó del plazo.</summary>
    Breached,
}

/// <summary>
/// El semáforo de SLA: cuánto plazo lleva consumido un ticket y en qué tramo cae.
///
/// <para>Los umbrales estaban sueltos dentro de <c>GetSlaAlertsQuery</c>, sin
/// nombre y sin tests (F5). Y no coincidían entre sí: la etiqueta que se guardaba
/// en el DTO decía <c>"Attention"</c> para <b>todo</b> lo que bajara de 75,
/// mientras que el reparto en listas solo recogía desde 50. Un ticket al 30 %
/// recibía etiqueta y acto seguido se descartaba.</para>
///
/// <para>Con el nivel calculado en un solo sitio, la etiqueta y el cubo no pueden
/// discrepar.</para>
/// </summary>
public static class SlaTrafficLight
{
    /// <summary>Se pasó del plazo.</summary>
    public const int BreachedAt  = 100;

    /// <summary>Le queda un cuarto del plazo.</summary>
    public const int WarningAt   = 75;

    /// <summary>Consumió la mitad.</summary>
    public const int AttentionAt = 50;

    /// <summary>
    /// Porcentaje del plazo consumido, redondeado hacia abajo.
    ///
    /// <para>Un ticket cuyo vencimiento no es posterior a su creación se cuenta
    /// como vencido: no hay plazo que repartir, así que el 100 % es la lectura
    /// prudente.</para>
    /// </summary>
    public static int PercentElapsed(DateTime createdAt, DateTime dueDate, DateTime now)
    {
        var total = (dueDate - createdAt).TotalMinutes;
        if (total <= 0) return BreachedAt;

        return (int)((now - createdAt).TotalMinutes / total * 100);
    }

    /// <summary>En qué tramo cae ese porcentaje.</summary>
    public static SlaLevel Level(int percentElapsed) => percentElapsed switch
    {
        >= BreachedAt  => SlaLevel.Breached,
        >= WarningAt   => SlaLevel.Warning,
        >= AttentionAt => SlaLevel.Attention,
        _              => SlaLevel.Ok,
    };

    /// <summary>
    /// La etiqueta que espera el frontend. Se mantienen los mismos textos que
    /// había: cambiarlos rompería la pantalla.
    /// </summary>
    public static string Label(SlaLevel level) => level switch
    {
        SlaLevel.Breached => "Breached",
        SlaLevel.Warning  => "Warning",
        _                 => "Attention",
    };
}
