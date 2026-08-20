using FluentAssertions;
using TelecomBoliviaNet.Domain.Primitives;
using TelecomBoliviaNet.Domain.ValueObjects;
using Xunit;

namespace TelecomBoliviaNet.Tests.Domain;

public class PhoneNumberTests
{
    // ── D1 (2026-08-07) ───────────────────────────────────────────────────────
    // ToLocalCanonical devuelve el formato de ALMACENAMIENTO del sistema: el
    // número local de 8 dígitos. Es el que usan Clients.PhoneMain (183/183 en
    // producción) y conversations.phone_number del chatbot (153/155).
    //
    // OJO: es la dirección OPUESTA a la del constructor de PhoneNumber (que
    // normaliza a E.164 "591…" para Meta). Esa asimetría es justamente la que
    // causó el bug: BotProxyService y ChatbotDirectNotifier anteponían el
    // "591" antes de llamar al chatbot, que indexa por el local — la
    // conversación no aparecía (404) o se creaba duplicada, y las
    // confirmaciones de pago por WhatsApp nunca llegaban.

    [Theory]
    [InlineData("59171234567", "71234567")]   // con prefijo → se le quita
    [InlineData("71234567",    "71234567")]   // ya canónico → intacto
    [InlineData("61234567",    "61234567")]   // móvil que empieza en 6
    [InlineData("+591 71234567", "71234567")] // con + y espacios
    [InlineData("591-7123-4567", "71234567")] // con guiones
    [InlineData("", "")]                       // vacío → vacío, no revienta
    public void ToLocalCanonical_NormalizaAlFormatoDeAlmacenamiento(string input, string expected)
    {
        PhoneNumber.ToLocalCanonical(input).Should().Be(expected);
    }

    [Fact]
    public void ToLocalCanonical_EsIdempotente()
    {
        var unaVez  = PhoneNumber.ToLocalCanonical("59171234567");
        var dosVeces = PhoneNumber.ToLocalCanonical(unaVez);
        dosVeces.Should().Be(unaVez).And.Be("71234567");
    }

    [Fact]
    public void ToLocalCanonical_LasDosFormasDelMismoNumeroConvergen()
    {
        PhoneNumber.ToLocalCanonical("59171234567")
            .Should().Be(PhoneNumber.ToLocalCanonical("71234567"));
    }

    [Fact]
    public void ToLocalCanonical_NoTocaNumerosExtranjeros()
    {
        // En producción hay una conversación de Indonesia (6285881731840).
        // No empieza con 591 ni mide 11 dígitos: debe quedar como está.
        PhoneNumber.ToLocalCanonical("6285881731840").Should().Be("6285881731840");
    }

    [Fact]
    public void ToLocalCanonical_ConNull_DevuelveVacio()
    {
        PhoneNumber.ToLocalCanonical(null).Should().BeEmpty();
    }

    [Theory]
    [InlineData("71234567",    "59171234567")]  // 8 dígitos, prefijo 7x
    [InlineData("61234567",    "59161234567")]  // 8 dígitos, prefijo 6x
    [InlineData("59171234567", "59171234567")]  // ya tiene prefijo 591
    [InlineData("+59171234567","59171234567")]  // con + internacional (strip non-digits)
    [InlineData("7-123 456 7", "59171234567")] // con guiones/espacios — strip non-digits
    public void PhoneNumber_WithValidInput_NormalizesTo591Format(string input, string expected)
    {
        var phone = new PhoneNumber(input);
        phone.Value.Should().Be(expected);
    }

    [Fact]
    public void PhoneNumber_ImplicitConversion_ToStringReturnsValue()
    {
        PhoneNumber phone = "71234567";
        string s = phone;
        s.Should().Be("59171234567");
    }

    [Fact]
    public void PhoneNumber_ToString_ReturnsNormalizedValue()
    {
        var phone = new PhoneNumber("71234567");
        phone.ToString().Should().Be("59171234567");
    }

    [Fact]
    public void PhoneNumber_RecordEquality_SameValueAreEqual()
    {
        var a = new PhoneNumber("71234567");
        var b = new PhoneNumber("59171234567");
        a.Should().Be(b);
    }


    [Theory]
    [InlineData("91234567")]    
    [InlineData("1234567")]    
    [InlineData("")]           
    [InlineData("abcdefgh")]    
    [InlineData("123456789012")] 
    public void PhoneNumber_WithInvalidInput_ThrowsDomainException(string input)
    {
        var act = () => new PhoneNumber(input);
        act.Should().Throw<DomainException>()
           .WithMessage("*boliviano inválido*");
    }

    [Fact]
    public void PhoneNumber_WithNull_ThrowsDomainException()
    {
        var act = () => new PhoneNumber(null!);
        act.Should().Throw<DomainException>();
    }
}

public class MoneyTests
{
    [Fact]
    public void Money_WithZero_CreatesSuccessfully()
    {
        var m = new Money(0m);
        m.Amount.Should().Be(0m);
        m.IsZero.Should().BeTrue();
    }

    [Fact]
    public void Money_WithPositiveAmount_CreatesSuccessfully()
    {
        var m = new Money(150.50m);
        m.Amount.Should().Be(150.50m);
        m.IsZero.Should().BeFalse();
    }

    [Fact]
    public void Money_RoundsAwayFromZero_ToTwoDecimals()
    {
        new Money(10.555m).Amount.Should().Be(10.56m);  // redondeo bancario
        new Money(10.554m).Amount.Should().Be(10.55m);
    }

    [Fact]
    public void Money_Zero_StaticProperty_ReturnsZeroMoney()
    {
        Money.Zero.Amount.Should().Be(0m);
        Money.Zero.IsZero.Should().BeTrue();
    }

    [Fact]
    public void Money_Addition_ReturnsSumOfAmounts()
    {
        var a = new Money(100m);
        var b = new Money(50.25m);
        (a + b).Amount.Should().Be(150.25m);
    }

    [Fact]
    public void Money_Subtraction_WhenResultPositive_Succeeds()
    {
        var a = new Money(200m);
        var b = new Money(50m);
        (a - b).Amount.Should().Be(150m);
    }

    [Fact]
    public void Money_Subtraction_WhenResultNegative_ThrowsDomainException()
    {
        var a = new Money(50m);
        var b = new Money(100m);
        var act = () => _ = a - b;
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Money_RecordEquality_SameAmountAreEqual()
    {
        new Money(100m).Should().Be(new Money(100m));
        new Money(100m).Should().NotBe(new Money(200m));
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-100)]
    [InlineData(-999999)]
    public void Money_WithNegativeAmount_ThrowsDomainException(decimal amount)
    {
        var act = () => new Money(amount);
        act.Should().Throw<DomainException>()
           .WithMessage("*negativo*");
    }

    [Fact]
    public void Money_ToString_FormatsWithBsPrefix()
    {
        new Money(150m).ToString().Should().Contain("150");
        new Money(150m).ToString().Should().Contain("Bs");
    }
}

public class TbnCodeTests
{

    [Theory]
    [InlineData("TBN-0001", "TBN-0001")]
    [InlineData("TBN-9999", "TBN-9999")]
    [InlineData("tbn-0152", "TBN-0152")]  // normaliza a mayúsculas
    [InlineData("TBN-0000", "TBN-0000")]
    public void TbnCode_WithValidFormat_CreatesAndNormalizesToUppercase(string input, string expected)
    {
        var code = new TbnCode(input);
        code.Value.Should().Be(expected);
    }

    [Fact]
    public void TbnCode_ImplicitConversion_ToStringReturnsValue()
    {
        TbnCode code = "TBN-0001";
        string s = code;
        s.Should().Be("TBN-0001");
    }

    [Fact]
    public void TbnCode_RecordEquality_SameValueAreEqual()
    {
        new TbnCode("TBN-0001").Should().Be(new TbnCode("TBN-0001"));
        new TbnCode("TBN-0001").Should().NotBe(new TbnCode("TBN-0002"));
    }

    [Theory]
    [InlineData("TBN-123")]      
    [InlineData("TBN-12345")]   
    [InlineData("123456")]       
    [InlineData("TBN0001")]     
    [InlineData("")]
    [InlineData("ABC-0001")]    
    public void TbnCode_WithInvalidFormat_ThrowsDomainException(string input)
    {
        var act = () => new TbnCode(input);
        act.Should().Throw<DomainException>()
           .WithMessage("*TBN inválido*");
    }

    [Fact]
    public void TbnCode_WithNull_ThrowsDomainException()
    {
        var act = () => new TbnCode(null!);
        act.Should().Throw<DomainException>();
    }
}
