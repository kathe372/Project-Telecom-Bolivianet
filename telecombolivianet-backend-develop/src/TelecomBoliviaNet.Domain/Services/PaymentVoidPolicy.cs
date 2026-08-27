namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cuándo se puede anular un cobro ya registrado.
///
/// <para>La regla estaba escrita tres veces y de dos maneras distintas (F5):</para>
///
/// <list type="bullet">
/// <item><c>PaymentService.VoidPaymentAsync</c> — la validación real, con la
/// constante.</item>
/// <item><c>PaymentQueryService.GetByIdAsync</c> — la ficha del pago, con la
/// constante, pero <b>sin mirar si ya estaba anulado</b>.</item>
/// <item><c>ClientProjectionHelpers.MapPaymentDto</c> — la grilla de cobros de la
/// ficha del cliente, sí miraba si estaba anulado pero con un <b>30 literal</b>,
/// exactamente el fallo que ya se había corregido en la ficha del pago y que aquí
/// se quedó.</item>
/// </list>
///
/// <para>Es lo que se le enseña al operador como botón "Anular". Cuando las tres
/// no coinciden, la pantalla ofrece una acción que el backend rechaza —o esconde
/// una que sí podía hacerse.</para>
/// </summary>
public static class PaymentVoidPolicy
{
    /// <summary>
    /// Días durante los que un cobro sigue siendo anulable. Pasado ese plazo se
    /// considera cerrado contablemente y hay que corregirlo por otra vía.
    /// </summary>
    public const int WindowDays = 30;

    /// <summary>
    /// ¿Se puede anular este cobro ahora mismo?
    ///
    /// <para>Un cobro ya anulado no se puede volver a anular, por muy dentro del
    /// plazo que esté.</para>
    /// </summary>
    public static bool CanVoid(bool isVoided, DateTime registeredAt, DateTime now)
        => !isVoided && IsWithinWindow(registeredAt, now);

    /// <summary>
    /// ¿Sigue dentro del plazo? Se expone aparte porque el mensaje de error del
    /// backend distingue "fuera de plazo" de "ya estaba anulado", y son dos
    /// cosas distintas que decirle al operador.
    /// </summary>
    public static bool IsWithinWindow(DateTime registeredAt, DateTime now)
        => (now - registeredAt).TotalDays <= WindowDays;
}
