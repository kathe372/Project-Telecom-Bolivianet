namespace TelecomBoliviaNet.Application.Services.Bot;

/// <summary>Cómo terminó una operación contra el chatbot.</summary>
/// <remarks>
/// OBS-02 — Estas tres cosas eran el mismo <c>false</c>: el bot hizo lo que se le
/// pidió, el bot dijo que no, y no se pudo hablar con el bot. El operador veía el
/// mismo mensaje en los tres casos y no sabía si tenía sentido reintentar.
/// </remarks>
public enum BotOutcome
{
    /// <summary>Hecho.</summary>
    Hecho,

    /// <summary>
    /// El chatbot contestó y rechazó la operación. Reintentar no cambia nada:
    /// la conversación ya la tiene otro agente, el documento no existe, etc.
    /// </summary>
    Rechazado,

    /// <summary>
    /// No se pudo hablar con el chatbot: caído, reiniciándose o desplegándose.
    /// La operación NO llegó a intentarse, y reintentar en un minuto sí puede
    /// funcionar.
    /// </summary>
    NoResponde,
}

/// <summary>Resultado de una operación contra el chatbot. Ver <see cref="BotOutcome"/>.</summary>
public readonly record struct BotResult(BotOutcome Outcome)
{
    public bool EsExito     => Outcome == BotOutcome.Hecho;
    public bool NoRespondio => Outcome == BotOutcome.NoResponde;

    public static BotResult Hecho      => new(BotOutcome.Hecho);
    public static BotResult Rechazado  => new(BotOutcome.Rechazado);
    public static BotResult NoResponde => new(BotOutcome.NoResponde);

    public static BotResult De(bool loAcepto) => loAcepto ? Hecho : Rechazado;

    /// <summary>
    /// Para quien solo quiere saber si salió bien y le da igual el motivo — por
    /// ejemplo, un aviso accesorio dentro de un comando que no debe fallar por
    /// esto.
    /// </summary>
    public static implicit operator bool(BotResult r) => r.EsExito;
}
