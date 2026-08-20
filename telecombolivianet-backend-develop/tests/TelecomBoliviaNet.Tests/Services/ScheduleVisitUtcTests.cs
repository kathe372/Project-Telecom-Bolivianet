using FluentAssertions;
using TelecomBoliviaNet.Application.Tickets.Commands;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

/// <summary>
/// C1 (2026-08-07) — Regresión del 500 que impedía agendar CUALQUIER visita técnica.
///
/// El chatbot manda la hora con offset explícito ("2026-08-11T10:00:00-04:00").
/// System.Text.Json la deserializa como DateTime con Kind=Local, y Npgsql rechaza
/// escribir Kind=Local en una columna timestamptz:
///
///     System.ArgumentException: Cannot write DateTime with Kind=Local to
///     PostgreSQL type 'timestamp with time zone', only UTC is supported.
///
/// Verificado en producción: TicketVisits quedaba vacía y el cliente recibía
/// "Hubo un problema, intente en unos minutos" — que fallaba idéntico siempre.
/// </summary>
public class ScheduleVisitUtcTests
{
    [Fact]
    public void ToUtc_ConKindUtc_LoDejaIntacto()
    {
        var utc = new DateTime(2026, 8, 11, 14, 0, 0, DateTimeKind.Utc);

        var result = ScheduleVisitHandler.ToUtc(utc);

        result.Should().Be(utc);
        result.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public void ToUtc_ConKindLocal_ConvierteYNoSoloReetiqueta()
    {
        // Un DateTime local cualquiera: el resultado debe ser el MISMO instante
        // expresado en UTC, no el mismo número de horas con otra etiqueta.
        var local = new DateTime(2026, 8, 11, 10, 0, 0, DateTimeKind.Local);

        var result = ScheduleVisitHandler.ToUtc(local);

        result.Kind.Should().Be(DateTimeKind.Utc);
        result.Should().Be(local.ToUniversalTime());
        // Esto es lo que hacía la defensa vieja (SpecifyKind) y por qué estaba mal:
        // solo acierta si la máquina corre en UTC.
        result.Should().Be(local.ToUniversalTime(), "SpecifyKind reetiqueta, no convierte");
    }

    [Fact]
    public void ToUtc_ConKindUnspecified_SeAsumeUtc()
    {
        var sinKind = new DateTime(2026, 8, 11, 14, 0, 0, DateTimeKind.Unspecified);

        var result = ScheduleVisitHandler.ToUtc(sinKind);

        result.Kind.Should().Be(DateTimeKind.Utc);
        result.Should().Be(DateTime.SpecifyKind(sinKind, DateTimeKind.Utc));
    }

    [Fact]
    public void ToUtc_ConElPayloadExactoDelChatbot_QuedaEnUtcYPersistible()
    {
        // Cadena idéntica a la que arma sistema-api.service.ts:
        //     const scheduledAt = `${fecha}T${hora}:00-04:00`;
        var deserializado = System.Text.Json.JsonSerializer.Deserialize<DateTime>(
            "\"2026-08-11T10:00:00-04:00\"");

        // Precondición del bug: así es como llega desde la API.
        deserializado.Kind.Should().NotBe(DateTimeKind.Utc,
            "si ya llegara en UTC no habría existido el 500");

        var result = ScheduleVisitHandler.ToUtc(deserializado);

        result.Kind.Should().Be(DateTimeKind.Utc, "Npgsql solo acepta Kind=Utc en timestamptz");
        // 10:00 en UTC-4 es el mismo instante que 14:00 UTC, sin importar la
        // zona horaria de la máquina donde corra el test.
        result.Should().Be(new DateTime(2026, 8, 11, 14, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void ToUtc_EsIdempotente()
    {
        var original = System.Text.Json.JsonSerializer.Deserialize<DateTime>(
            "\"2026-08-11T10:00:00-04:00\"");

        var unaVez  = ScheduleVisitHandler.ToUtc(original);
        var dosVeces = ScheduleVisitHandler.ToUtc(unaVez);

        dosVeces.Should().Be(unaVez);
    }
}
