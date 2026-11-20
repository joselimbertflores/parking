import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { ParkingPlateDto } from '../../../common/dto/parking-plate.dto.js';
import { VehicleType } from '../../../common/enums/vehicle-type.enum.js';

export class CreateParkingPaymentDto extends ParkingPlateDto {
  @ApiProperty({ enum: VehicleType, example: VehicleType.Car })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647, example: 2 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  parkingSegmentId: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 120,
    description:
      'Minutos comprados en múltiplos del bloque configurado. El último bloque se cobra completo aunque venza al cierre.',
  })
  @IsInt()
  @Min(1)
  durationMinutes: number;
}

export class PaymentSessionDto {
  @ApiProperty({ type: 'integer', example: 42 })
  id: number;

  @ApiProperty({
    example: '2026-11-18T15:00:00.000Z',
  })
  startsAt: Date;

  @ApiProperty({
    example: '2026-11-18T19:00:00.000Z',
  })
  expiresAt: Date;
}

@ApiExtraModels(PaymentSessionDto)
export class PaymentStatusDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a91099bb-f884-4e29-b3f3-8ab3d75b3dcc',
  })
  id: string;

  @ApiProperty({
    example: '4.00',
    description: 'Importe en bolivianos con dos decimales.',
  })
  amount: string;

  @ApiProperty({ enum: ['pending', 'confirmed', 'failed'], example: 'pending' })
  status: 'pending' | 'confirmed' | 'failed';

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cierre cotizado si el último bloque es parcial.',
  })
  quotedExpiresAt: Date | null;

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(PaymentSessionDto) }, { type: 'object', nullable: true, enum: [null] }],
  })
  session: PaymentSessionDto | null;
}

export class QrPaymentDto extends PaymentStatusDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: null,
    description: 'Reservado para los datos del QR bancario. Actualmente es null.',
  })
  qr: null;
}

export type CashPayment = Pick<PaymentStatusDto, 'id' | 'amount'> & {
  method: 'cash';
  status: 'confirmed';
  paidAt: Date;
  session: PaymentSessionDto;
};
