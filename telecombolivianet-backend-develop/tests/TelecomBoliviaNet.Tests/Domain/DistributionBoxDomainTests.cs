using FluentAssertions;
using NetTopologySuite.Geometries;
using TelecomBoliviaNet.Domain.Entities.Coverage;
using TelecomBoliviaNet.Domain.Primitives;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

public class DistributionBoxDomainTests
{
    private static DistributionBox MakeBox(
        int total, int ocupados, int reservados) => new()
    {
        Id                  = Guid.NewGuid(),
        Codigo              = "NAP-TEST",
        DireccionReferencia = "Av. Test 123",
        ZoneId              = Guid.NewGuid(),
        Location            = new Point(-66.156, -17.389) { SRID = 4326 },
        PuertosTotal        = total,
        PuertosOcupados     = ocupados,
        PuertosReservados   = reservados,
        Estado              = DistributionBoxStatus.Activo,
    };

    [Fact]
    public void TienePuertosLibres_CuandoHayUnPuertoLibre_RetornaTrue()
    {
        var box = MakeBox(total: 8, ocupados: 6, reservados: 1);

        box.TienePuertosLibres().Should().BeTrue();
    }

    [Fact]
    public void TienePuertosLibres_CuandoCajaLlena_RetornaFalse()
    {
        var box = MakeBox(total: 8, ocupados: 7, reservados: 1);

        box.TienePuertosLibres().Should().BeFalse();
    }

    [Fact]
    public void Reservar_CuandoHayPuertosLibres_IncrementaReservados()
    {
        var box = MakeBox(total: 8, ocupados: 4, reservados: 2);

        box.Reservar();

        box.PuertosReservados.Should().Be(3);
    }

    [Fact]
    public void Reservar_SinPuertosLibres_LanzaDomainException()
    {
        var box = MakeBox(total: 4, ocupados: 3, reservados: 1);

        var act = () => box.Reservar();

        act.Should().Throw<DomainException>()
            .WithMessage("*puertos libres*");
    }

    [Fact]
    public void LiberarReserva_CuandoHayReservados_Decrementa()
    {
        var box = MakeBox(total: 8, ocupados: 2, reservados: 2);

        box.LiberarReserva();

        box.PuertosReservados.Should().Be(1);
    }

    [Fact]
    public void LiberarReserva_SinReservados_EsIdempotente()
    {
        var box = MakeBox(total: 8, ocupados: 3, reservados: 0);

        var act = () => box.LiberarReserva();

        act.Should().NotThrow();
        box.PuertosReservados.Should().Be(0);
    }

    [Fact]
    public void Ocupar_CuandoHayReservados_MueveReservadoAOcupado()
    {
        var box = MakeBox(total: 8, ocupados: 2, reservados: 1);

        box.Ocupar();

        box.PuertosReservados.Should().Be(0);
        box.PuertosOcupados.Should().Be(3);
    }

    [Fact]
    public void Ocupar_SinReserva_OcupaPuertoLibreDirecto()
    {
        // El panel completa la instalación sin reservar antes: ocupa directo.
        var box = MakeBox(total: 8, ocupados: 3, reservados: 0);

        box.Ocupar();

        box.PuertosOcupados.Should().Be(4);
        box.PuertosReservados.Should().Be(0);
    }

    [Fact]
    public void Ocupar_SinReservaYSinLibres_LanzaDomainException()
    {
        var box = MakeBox(total: 8, ocupados: 8, reservados: 0);

        var act = () => box.Ocupar();

        act.Should().Throw<DomainException>()
            .WithMessage("*libres*");
    }

    [Fact]
    public void Reservar_Luego_Ocupar_MantieneTotalConsistente()
    {
        var box = MakeBox(total: 8, ocupados: 5, reservados: 0);

        box.Reservar();
        box.Ocupar();

        box.PuertosOcupados.Should().Be(6);
        box.PuertosReservados.Should().Be(0);
        (box.PuertosOcupados + box.PuertosReservados).Should().BeLessThanOrEqualTo(box.PuertosTotal);
    }
}
