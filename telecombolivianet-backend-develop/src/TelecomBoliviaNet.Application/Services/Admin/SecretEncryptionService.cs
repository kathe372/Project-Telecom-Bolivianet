using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace TelecomBoliviaNet.Application.Services.Admin;

public class SecretEncryptionService
{
    private readonly byte[]                          _key;
    private readonly ILogger<SecretEncryptionService> _logger;

    private const string Prefix       = "ENC:v1:";
    private const int    NonceSize    = 12;
    private const int    TagSize      = 16;

    public SecretEncryptionService(
        IConfiguration                   config,
        ILogger<SecretEncryptionService> logger)
    {
        _logger = logger;

        var rawKey = config["SecretEncryption:Key"]
            ?? throw new InvalidOperationException(
                "SECRET_ENCRYPTION_KEY no está configurado. " +
                "Generar con: openssl rand -base64 32 " +
                "y configurar en la variable de entorno SecretEncryption__Key.");

        _key = SHA256.HashData(Encoding.UTF8.GetBytes(rawKey));
    }

    public string Encrypt(string plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return plaintext;
        if (plaintext.StartsWith(Prefix))    return plaintext;

        var nonce      = new byte[NonceSize];
        var tag        = new byte[TagSize];
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext     = new byte[plaintextBytes.Length];

        RandomNumberGenerator.Fill(nonce);

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        var blob = new byte[NonceSize + TagSize + ciphertext.Length];
        Buffer.BlockCopy(nonce,      0, blob, 0,                         NonceSize);
        Buffer.BlockCopy(tag,        0, blob, NonceSize,                 TagSize);
        Buffer.BlockCopy(ciphertext, 0, blob, NonceSize + TagSize,       ciphertext.Length);

        return Prefix + Convert.ToBase64String(blob);
    }

    public string Decrypt(string cipherValue)
    {
        if (string.IsNullOrEmpty(cipherValue))         return cipherValue;
        if (!cipherValue.StartsWith(Prefix))           return cipherValue;

        try
        {
            var blob       = Convert.FromBase64String(cipherValue[Prefix.Length..]);
            var nonce      = blob[..NonceSize];
            var tag        = blob[NonceSize..(NonceSize + TagSize)];
            var ciphertext = blob[(NonceSize + TagSize)..];
            var plaintext  = new byte[ciphertext.Length];

            using var aes = new AesGcm(_key, TagSize);
            aes.Decrypt(nonce, ciphertext, tag, plaintext);

            return Encoding.UTF8.GetString(plaintext);
        }
        catch (CryptographicException ex)
        {
            _logger.LogError(ex, "Decrypt failed: GCM authentication tag mismatch. " +
                "Possible data tampering or wrong SecretEncryption:Key.");
            throw new CryptographicException(
                "No se pudo descifrar el valor almacenado. " +
                "Verifique la clave de cifrado o restaure el valor desde el origen.", ex);
        }
    }

    public static bool IsEncrypted(string value) =>
        !string.IsNullOrEmpty(value) && value.StartsWith(Prefix);
}
