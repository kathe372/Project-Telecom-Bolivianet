using System.Text;
using FluentAssertions;
using TelecomBoliviaNet.Application.Utils;
using Xunit;

namespace TelecomBoliviaNet.Tests.Services;

public class CsvBuilderTests
{
    [Fact]
    public void Emite_bom_para_que_excel_lea_los_acentos()
    {
        var bytes = new CsvBuilder().Row("Código", "Método").ToBytes();

        bytes.Take(3).Should().Equal(0xEF, 0xBB, 0xBF);
        Encoding.UTF8.GetString(bytes).Should().Contain("Código");
    }

    [Theory]
    [InlineData("=1+1")]
    [InlineData("+SUM(A1)")]
    [InlineData("-2+3")]
    [InlineData("@cmd")]
    public void Neutraliza_los_valores_que_excel_interpretaria_como_formula(string malicioso)
    {
        CsvBuilder.Escape(malicioso).Should().StartWith("\"'",
            "Excel ejecuta la celda si empieza con esos caracteres");
    }

    [Fact]
    public void Escapa_comillas_y_comas_dentro_del_valor()
    {
        CsvBuilder.Escape("Banco \"Unión\", S.A.")
            .Should().Be("\"Banco \"\"Unión\"\", S.A.\"");
    }

    [Fact]
    public void Un_valor_nulo_no_desalinea_las_columnas()
    {
        var csv = Encoding.UTF8.GetString(new CsvBuilder().Row("a", null, "c").ToBytes());

        csv.Should().Contain("\"a\",\"\",\"c\"");
    }
}
