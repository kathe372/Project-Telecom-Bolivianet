using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TelecomBoliviaNet.Presentation.Configuration;

/// <summary>
/// Valida el cuerpo de la petición antes de que la acción se ejecute.
/// </summary>
/// <remarks>
/// E-03 — Antes cada endpoint validaba a mano. El mismo bloque de dos líneas
/// estaba copiado <b>17 veces</b> en los controladores, y <c>TicketsController</c>
/// tenía <b>8 de sus 12 dependencias</b> dedicadas a esto: un
/// <c>IValidator&lt;T&gt;</c> por DTO. Cada endpoint nuevo sumaba una dependencia
/// al constructor y otra copia del bloque.
///
/// <para>Peor que la repetición: validar dependía de que quien escribiera el
/// endpoint se acordara. Aquí no hay nada que recordar — si el DTO tiene validador
/// registrado, se valida.</para>
///
/// <para><b>Un solo sobre de error.</b> Había dos. Ocho endpoints devolvían
/// <c>{ success, message }</c> y siete <c>{ success, errors: [...] }</c>, y el
/// frontend lee <b>solo <c>message</c></b> (<c>extractApiError</c>): en esos siete
/// el usuario veía el texto genérico de reserva en lugar del motivo real del
/// rechazo. Unificar en <c>message</c> los arregla.</para>
///
/// <para>No se añadió ningún paquete: se resuelve el validador por reflexión desde
/// el contenedor. Los argumentos sin validador registrado —ids de ruta, filtros de
/// consulta— se ignoran.</para>
/// </remarks>
public sealed class ValidacionDeCuerpoFilter : IAsyncActionFilter
{
    private readonly IServiceProvider _servicios;

    public ValidacionDeCuerpoFilter(IServiceProvider servicios) => _servicios = servicios;

    public async Task OnActionExecutionAsync(
        ActionExecutingContext contexto, ActionExecutionDelegate siguiente)
    {
        foreach (var argumento in contexto.ActionArguments.Values)
        {
            if (argumento is null) continue;

            var tipoValidador = typeof(IValidator<>).MakeGenericType(argumento.GetType());
            if (_servicios.GetService(tipoValidador) is not IValidator validador) continue;

            var contextoDeValidacion = new ValidationContext<object>(argumento);
            var resultado = await validador.ValidateAsync(contextoDeValidacion, contexto.HttpContext.RequestAborted);
            if (resultado.IsValid) continue;

            contexto.Result = new BadRequestObjectResult(new
            {
                success = false,
                message = string.Join(" ", resultado.Errors.Select(e => e.ErrorMessage)),
            });
            return;
        }

        await siguiente();
    }
}
