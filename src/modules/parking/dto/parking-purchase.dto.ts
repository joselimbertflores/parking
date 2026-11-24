import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchParkingSegmentsDto {
  @ApiPropertyOptional({
    example: 'prueba',
    maxLength: 100,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ParkingPurchaseOptionDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 30,
    description: 'Minutos cobrados en múltiplos del bloque configurado.',
  })
  durationMinutes: number;

  @ApiProperty({
    example: '1.00',
    description: 'Importe en bolivianos con dos decimales.',
  })
  amount: string;
}
