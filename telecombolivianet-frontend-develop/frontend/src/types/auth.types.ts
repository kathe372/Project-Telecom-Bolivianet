
export type UserRole   = 'Admin' | 'Tecnico' | 'SocioLectura';
export type UserStatus = 'Activo' | 'Bloqueado' | 'Inactivo' | 'PendienteActivacion';


export interface LoginRequest {
  Email:    string;
  Password: string;
}

export interface LoginResponse {
  Token:                  string;
  RefreshToken:           string;
  UserId:                 string;
  FullName:               string;
  Email:                  string;
  Role:                   UserRole;
  RequiresPasswordChange: boolean;
  RedirectUrl:            string;
}

export interface AuthUser {
  UserId:   string;
  FullName: string;
  Role:     UserRole;
}


export interface UserSystemDto {
  Id:                     string;
  FullName:               string;
  Email:                  string;
  Role:                   UserRole;
  Status:                 UserStatus;
  RequiresPasswordChange: boolean;
  FailedLoginAttempts:    number;
  LastLoginAt:            string | null;
  CreatedAt:              string;
  Phone:                  string | null;
}

export interface CreateUserRequest {
  FullName:          string;
  Email:             string;
  TemporaryPassword: string;
  Role:              UserRole;
}

export interface UpdateUserRequest {
  FullName: string;
  Email:    string;
  Role:     UserRole;
  Phone?:   string | null;
}

export interface ChangePasswordRequest {
  CurrentPassword: string;
  NewPassword:     string;
  ConfirmPassword: string;
}


export interface AuditLogDto {
  Id:           string;
  UserId:       string | null;
  UserName:     string;
  Module:       string;
  Action:       string;
  Description:  string;
  IpAddress:    string | null;
  PreviousData: string | null;
  NewData:      string | null;
  CreatedAt:    string;
}


export interface PagedResult<T> {
  Items:       T[];
  TotalCount:  number;
  PageNumber:  number;
  PageSize:    number;
  TotalPages:  number;
  HasPreviousPage: boolean;
  HasNextPage:     boolean;
}


export interface ProfilePermissionsDto {
  Role:        string;
  UserId:      string;
  Permissions: string[];
}


export interface ApiResponse<T> {
  success: boolean;
  data?:   T;
  message?: string;
  errors?:  string[];
}
