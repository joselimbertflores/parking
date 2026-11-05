import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ParkingSegmentParamsDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number;
}
