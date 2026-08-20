namespace TelecomBoliviaNet.Application.Utils;

public static class FileValidator
{
    private static readonly Dictionary<string, byte[][]> Signatures = new()
    {
        ["image/jpeg"] = [[0xFF, 0xD8, 0xFF]],
        ["image/png"]  = [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        ["application/pdf"] = [[0x25, 0x50, 0x44, 0x46]],
    };

    public static async Task<bool> IsMagicBytesValidAsync(Stream stream, string declaredMimeType)
    {
        if (!Signatures.TryGetValue(declaredMimeType.ToLowerInvariant(), out var candidates))
            return false;

        var header = new byte[16];
        var read   = await stream.ReadAsync(header.AsMemory(0, header.Length));
        stream.Seek(0, SeekOrigin.Begin);

        return candidates.Any(sig =>
            sig.Length <= read &&
            header.Take(sig.Length).SequenceEqual(sig));
    }

    public static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName ?? "file");
        var ext  = Path.GetExtension(fileName ?? ".bin");

        name = new string(name.Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '-').ToArray());
        if (string.IsNullOrEmpty(name)) name = "file";

        return $"{name}{ext}";
    }
}
