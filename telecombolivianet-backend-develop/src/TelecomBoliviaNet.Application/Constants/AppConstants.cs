namespace TelecomBoliviaNet.Application.Constants;

public static class AppConstants
{
    public static class Cache
    {
        public const string TokenBlacklistPrefix    = "tbl:";
        public const int    TokenCacheWindowMin     = 15;
        public const int    TokenSignaturePrefixLen = 32;
    }

    public static class Billing
    {
        public const int    DecimalPlaces    = 2;
        public const string FallbackPlanName = "—";
    }

    public static class Security
    {
        public const int MaxFailedLoginAttempts = 5;

        /// <summary>Duración del bloqueo temporal tras agotar los intentos de login.</summary>
        public const int LockoutMinutes         = 15;
        public const int BcryptWorkFactor       = 12;
        public const int JwtExpirationHours     = 8;
        public const int RefreshTokenExpDays    = 30;
        public const int VoidPaymentWindowDays  = 30;
    }

    public static class Pagination
    {
        public const int DefaultPageSize = 20;
        public const int MaxPageSize     = 100;
    }

    public static class Time
    {
        public const int InvoiceDueDays             = 5;
        public const int OnuCollectionDeadlineHours = 48;
        public const int ActivationTokenExpiryHours = 48;
        public const int AutoSuspendRunHour         = 13;
        public const int AutoSuspendRunMinute       = 30;
        public const int AutoCloseRunHour           = 2;
    }
}
