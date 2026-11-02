import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/pagination';

export class ListAuditQuery extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
