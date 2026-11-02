import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsIanaTimezone } from '../../../common/validators/is-timezone';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateWorkspaceDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @IsOptional()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, { message: 'locale must look like "en" or "en-IN"' })
  locale?: string;
}
