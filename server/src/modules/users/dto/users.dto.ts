import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PageQueryDto } from '../../../common/pagination/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  roleIds: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  status?: 'ACTIVE' | 'DISABLED';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  roleIds?: string[];
}

export class ListUsersQuery extends PageQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
