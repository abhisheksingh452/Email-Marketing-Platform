import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class ForgotPasswordDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  @MaxLength(128)
  newPassword: string;
}
