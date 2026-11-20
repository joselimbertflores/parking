import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches, MaxLength } from 'class-validator';

export class ParkingPlateDto {
  @ApiProperty({
    example: '1234ABC',
    description:
      'La placa normalizada admite hasta 20 caracteres alfanuméricos. Se eliminan los espacios y guiones y se usan mayúsculas.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]+/g, '').toUpperCase()
      : value,
  )
  @Matches(/^[A-Z0-9]+$/)
  @MaxLength(20)
  plate: string;
}
