using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Tickets;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// E-04 — El estado de un ticket deja de asignarse a mano.
/// </summary>
/// <remarks>
/// Había nueve sitios haciendo <c>ticket.Status = …</c>. Todos acompañaban el
/// cambio con lo que le corresponde —mensaje de resolución, fecha de cierre— pero
/// <b>por costumbre</b>: nada impedía olvidarlo. Y las dos reglas que sí existían
/// vivían dentro de un único handler, que los otros ocho caminos no consultaban.
/// </remarks>
public class TicketTransitionsTests
{
    private static readonly DateTime Ahora = new(2026, 8, 30, 15, 0, 0, DateTimeKind.Utc);

    private static SupportTicket Ticket(
        TicketStatus estado = TicketStatus.Abierto, DateTime? vence = null) => new()
    {
        Id = Guid.NewGuid(), TicketNumber = "TKT-1", Subject = "Sin servicio",
        Description = "Corte total.", Status = estado, DueDate = vence,
        CreatedAt = Ahora.AddDays(-2), CreatedByUserId = Guid.NewGuid(),
    };

    // ── Resolver exige explicar cómo ────────────────────────────────────────

    [Fact]
    public void ResolverSinMensaje_SeRechaza()
    {
        // La regla existía, pero solo la aplicaba el handler manual. Ocho caminos
        // más podían dejar un ticket resuelto sin decir cómo — y ese texto es lo
        // que se consulta cuando el mismo problema vuelve.
        var t = Ticket(TicketStatus.EnProceso);

        var acto = () => t.Resolver("   ", Ahora);

        acto.Should().Throw<ArgumentException>();
        t.Status.Should().Be(TicketStatus.EnProceso, "si falla, no se toca nada");
    }

    [Fact]
    public void Resolver_DejaMensaje_Fecha_YEstado()
    {
        var t = Ticket(TicketStatus.EnProceso);

        t.Resolver("  Se reempalmó la fibra en el poste 14.  ", Ahora);

        t.Status.Should().Be(TicketStatus.Resuelto);
        t.ResolutionMessage.Should().Be("Se reempalmó la fibra en el poste 14.");
        t.ResolvedAt.Should().Be(Ahora);
    }

    // ── El SLA de un ticket sin fecha límite ────────────────────────────────

    [Fact]
    public void SinFechaLimite_ElCumplimientoDeSlaEsNULO_NoVerdaderoNiFalso()
    {
        // Aquí había dos respuestas CONTRADICTORIAS para el mismo caso: el handler
        // manual lo daba por cumplido (true, inflando el KPI) y
        // CompleteInstallationCommand por incumplido (false, hundiéndolo).
        //
        // Ninguna es cierta: sin fecha límite no hay SLA que cumplir. Y el propio
        // KPI ya lo lee así — GetTicketKpiQuery filtra por .HasValue.
        var t = Ticket(TicketStatus.EnProceso, vence: null);

        t.Resolver("Resuelto.", Ahora);

        t.SlaCompliant.Should().BeNull();
    }

    [Fact]
    public void ResolverAntesDeVencer_CumpleElSla()
    {
        var t = Ticket(TicketStatus.EnProceso, vence: Ahora.AddHours(2));

        t.Resolver("A tiempo.", Ahora);

        t.SlaCompliant.Should().BeTrue();
    }

    [Fact]
    public void ResolverDespuesDeVencer_LoIncumple()
    {
        var t = Ticket(TicketStatus.EnProceso, vence: Ahora.AddHours(-3));

        t.Resolver("Tarde.", Ahora);

        t.SlaCompliant.Should().BeFalse();
    }

    // ── Un ticket cerrado no se toca ────────────────────────────────────────

    [Theory]
    [InlineData("proceso")]
    [InlineData("visita")]
    [InlineData("resolver")]
    public void UnTicketCERRADO_NoAdmiteCambios(string operacion)
    {
        var t = Ticket(TicketStatus.Cerrado);

        Action acto = operacion switch
        {
            "proceso"  => () => t.PasarAEnProceso(Ahora),
            "visita"   => () => t.PasarAEnVisita(),
            _          => () => t.Resolver("Da igual.", Ahora),
        };

        acto.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void UnTicketCerrado_SI_PuedeReabrirse()
    {
        var t = Ticket(TicketStatus.Cerrado);
        t.Cerrar(Ahora);

        t.Reabrir();

        t.Status.Should().Be(TicketStatus.Abierto);
        t.ClosedAt.Should().BeNull("reabrir borra la fecha de cierre, o el histórico miente");
    }

    // ── Primera respuesta ───────────────────────────────────────────────────

    [Fact]
    public void PasarAEnProceso_AnotaLaPrimeraRespuesta()
    {
        var t = Ticket();

        t.PasarAEnProceso(Ahora);

        t.FirstRespondedAt.Should().Be(Ahora);
    }

    [Fact]
    public void VolverAEnProceso_NoPisaLaPrimeraRespuesta()
    {
        // Es la métrica de cuánto tardamos en atender: si cada vuelta la
        // reescribiera, siempre saldría estupenda.
        var t = Ticket();
        t.PasarAEnProceso(Ahora);

        t.PasarAEnVisita();
        t.PasarAEnProceso(Ahora.AddHours(5));

        t.FirstRespondedAt.Should().Be(Ahora);
    }

    [Fact]
    public void Cerrar_DejaFechaDeCierre()
    {
        var t = Ticket(TicketStatus.Resuelto);

        t.Cerrar(Ahora);

        t.Status.Should().Be(TicketStatus.Cerrado);
        t.ClosedAt.Should().Be(Ahora);
    }
}
