import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateParkingSegmentDto {
  @ApiProperty({ example: 'TR-001' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Avenida Central' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  streetName: string;

  @ApiProperty({ example: 'Entre calle 1 y calle 2' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Norte' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  side?: string | null;

  @ApiProperty()
  @IsBoolean()
  active: boolean;
}

export class UpdateParkingSegmentDto extends PartialType(
  CreateParkingSegmentDto,
  { skipNullProperties: false },
) {}
