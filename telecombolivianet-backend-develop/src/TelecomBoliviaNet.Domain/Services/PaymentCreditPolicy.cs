namespace TelecomBoliviaNet.Domain.Services;

/// <summary>
/// Cómo se reparte un cobro entre el efectivo que trae el cliente y el saldo a
/// favor que ya tenía.
///
/// <para>Era aritmética privada dentro de <c>PaymentCreditService</c> (F5).
/// Decide cuánto dinero se mueve, así que merece probarse con una tabla de casos
/// y no a través de una operación con once dependencias.</para>
/// </summary>
public static class PaymentCreditPolicy
{
    /// <summary>
    /// Cuánto saldo a favor queda tras el cobro y cuánto del que ya tenía se
    /// consumió.
    ///
    /// <para>D-15: el crédito solo se toca por lo que el EFECTIVO no alcanza a
    /// cubrir. Antes se devolvía <c>Math.Min(creditBalance, totalDebt)</c>, que
    /// informaba crédito consumido aunque el efectivo bastara: un cliente con
    /// Bs. 100 a favor que pagaba Bs. 50 sobre una deuda de Bs. 50 generaba un
    /// asiento de -50 y otro de +50. El saldo final salía bien —los dos se
    /// anulan— pero su historial mostraba dos movimientos que nunca ocurrieron, y
    /// ese historial es lo que el operador enseña cuando alguien pregunta de
    /// dónde salió su saldo.</para>
    /// </summary>
    public static (decimal Excedente, decimal CreditoUsado) Split(
        decimal amount, decimal creditBalance, decimal totalDebt)
    {
        // Solo se echa mano del saldo por la parte que el efectivo no cubre.
        var faltante     = totalDebt - amount;
        var creditoUsado = faltante <= 0m ? 0m : Math.Min(creditBalance, faltante);

        var effective = amount + creditBalance;
        var excedente = effective > totalDebt ? effective - totalDebt : 0m;

        return (excedente, creditoUsado);
    }

    /// <summary>
    /// De todo el excedente que queda, cuánto lo aporta ESTE cobro.
    ///
    /// <para>Es lo que se asienta como crédito acumulado. El resto del excedente
    /// ya estaba a favor del cliente antes y no debe volver a registrarse, o el
    /// libro mayor contaría dos veces el mismo dinero.</para>
    /// </summary>
    public static decimal NuevoExcedente(
        decimal excedenteFinal, decimal creditoPrevio, decimal creditoUsado)
        => excedenteFinal - (creditoPrevio - creditoUsado);
}
