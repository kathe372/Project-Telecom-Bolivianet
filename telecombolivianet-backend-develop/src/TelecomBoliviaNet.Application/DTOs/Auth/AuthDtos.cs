namespace TelecomBoliviaNet.Application.DTOs.Auth;


public record LoginDto(string Email, string Password);

public record LoginResponseDto(
    string Token,
    string RefreshToken,
    string UserId,
    string FullName,
    string Email,
    string Role,
    bool RequiresPasswordChange,
    string RedirectUrl
);

public record RefreshTokenDto(string RefreshToken);

public record RefreshResponseDto(string Token, string RefreshToken);


public record CreateUserDto(
    string  FullName,
    string  Email,
    string  TemporaryPassword,
    string  Role,
    string? Phone = null
);

public record UpdateUserDto(
    string FullName,
    string Email,
    string Role,
    string? Phone
);

public record ChangePasswordDto(
    string CurrentPassword,
    string NewPassword,
    string ConfirmPassword
);

public record UserSystemDto(
    Guid Id,
    string FullName,
    string Email,
    string Role,
    string Status,
    bool RequiresPasswordChange,
    int FailedLoginAttempts,
    DateTime? LastLoginAt,
    DateTime CreatedAt,
    string? Phone
);


public record AuditLogDto(
    Guid Id,
    Guid? UserId,
    string UserName,
    string Module,
    string Action,
    string Description,
    string? IpAddress,
    string? UserAgent,
    string? PreviousData,
    string? NewData,
    string? IntegrityHash,
    DateTime CreatedAt
);

public record AuditLogFilterDto(
    Guid? UserId,
    string? Action,
    string? Module,
    string? Search,
    DateTime? From,
    DateTime? To,
    int PageNumber = 1,
    int PageSize = 50
);


public record RolePermissionsDto(
    string   Role,
    string   Label,
    string   Descripcion,
    string[] Modulos,
    string[] Politicas
);


public record ForgotPasswordDto(string Email);

public record ResetPasswordDto(
    string Token,
    string NewPassword,
    string ConfirmPassword
);

public record ForgotPasswordResultDto(
    string Message,
    string Channel,
    string? SentTo
);


public record UserSystemDetailDto(
    Guid      Id,
    string    FullName,
    string    Email,
    string    Role,
    string    RoleLabel,
    string    Status,
    bool      RequiresPasswordChange,
    int       FailedLoginAttempts,
    DateTime? LastLoginAt,
    DateTime  CreatedAt,
    string?   Phone,
    bool      IsDeleted,
    DateTime? DeletedAt
);

public record DeleteUserDto(string Justificacion);

public record ForceResetPasswordDto(string NewTemporaryPassword);

public record ConfirmEmailDto(string Token);
