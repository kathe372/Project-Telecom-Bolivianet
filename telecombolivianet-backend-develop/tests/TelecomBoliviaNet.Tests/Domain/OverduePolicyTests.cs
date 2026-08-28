using FluentAssertions;
using TelecomBoliviaNet.Domain.Entities.Clients;
using TelecomBoliviaNet.Domain.Services;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

/// <summary>
/// F7.4 — La regla de "está vencida" vive en dos formas que no se pueden
/// unificar: una decide sobre datos en memoria y la otra se traduce a SQL.
/// Estos tests son lo que las mantiene diciendo lo mismo.
/// </summary>
public class OverduePolicyTests
{
    private static readonly DateTime Ahora = new(2026, 8, 27, 12, 0, 0, DateTimeKind.Utc);

    public static TheoryData<InvoiceStatus, int, bool> Casos() => new()
    {
        // estado, días hasta el vencimiento (negativo = ya pasó), ¿vencida?
        { InvoiceStatus.Pendiente,          -1, true  },
        { InvoiceStatus.Emitida,            -1, true  },
        { InvoiceStatus.Enviada,            -1, true  },
        { InvoiceStatus.ParcialmentePagada, -1, true  },  // abonar Bs. 1 no la salva
        { InvoiceStatus.Pagada,             -1, false },
        { InvoiceStatus.Anulada,            -1, false },
        { InvoiceStatus.Vencida,            -1, false },  // ya lo está; no se re-marca
        { InvoiceStatus.Pendiente,           1, false },  // aún no vence
        { InvoiceStatus.Emitida,             1, false },
        { InvoiceStatus.ParcialmentePagada,  1, false },
    };

    [Theory]
    [MemberData(nameof(Casos))]
    public void EnMemoria_DiceLoQueDebe(InvoiceStatus status, int dias, bool esperado)
        => OverduePolicy.EstaVencida(status, Ahora.AddDays(dias), Ahora)
            .Should().Be(esperado);

    [Theory]
    [MemberData(nameof(Casos))]
    public void LaExpresionDeConsulta_DiceExactamenteLoMismo(
        InvoiceStatus status, int dias, bool esperado)
    {
        var factura = new Invoice
        {
            Id = Guid.NewGuid(), ClientId = Guid.NewGuid(),
            Status = status, DueDate = Ahora.AddDays(dias),
            Year = 2026, Month = 8, Amount = 100m,
        };

        var seleccionada = new[] { factura }.AsQueryable()
            .Where(OverduePolicy.VencidasAl(Ahora))
            .Any();

        seleccionada.Should().Be(esperado,
            "la expresión que filtra en SQL y la que decide en memoria son la misma regla");
    }

    [Fact]
    public void ElInstanteDelVencimiento_NoCuentaComoVencida()
    {
        // El corte es estricto: a las 00:00 del día de vencimiento todavía se
        // puede pagar. Fijado porque un `<=` aquí adelantaría la mora un día
        // entero para toda la cartera.
        OverduePolicy.EstaVencida(InvoiceStatus.Emitida, Ahora, Ahora).Should().BeFalse();
        OverduePolicy.EstaVencida(InvoiceStatus.Emitida, Ahora.AddTicks(-1), Ahora).Should().BeTrue();
    }

    [Fact]
    public void SoloVenceLoQueSeDebe()
    {
        // Invariante declarado en InvoiceDomainService: OverdueEligible ⊆ UnpaidStatuses.
        foreach (var status in InvoiceDomainService.OverdueEligible)
            InvoiceDomainService.UnpaidStatuses.Should().Contain(status,
                $"{status} puede vencer, así que tiene que contar como deuda");
    }
}
