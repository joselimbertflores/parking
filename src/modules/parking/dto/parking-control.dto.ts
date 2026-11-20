import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ParkingPlateDto } from '../../../common/dto/parking-plate.dto.js';
import { VehicleType } from '../../../common/enums/vehicle-type.enum.js';
import type { ParkingSegment } from '../entities/parking-segments.entity.js';

export class ParkingVerificationQueryDto extends ParkingPlateDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 2147483647,
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  segmentId: number;
}

export class ParkingVerificationSessionDto {
  @ApiProperty({ type: 'integer', example: 42 })
  id: number;

  @ApiProperty({ example: '1234ABC' })
  plate: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  segment: ParkingSegment;

  @ApiProperty({ enum: VehicleType, example: VehicleType.Car })
  vehicleType: VehicleType;

  @ApiProperty()
  startsAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ type: 'integer', minimum: 1, example: 600 })
  remainingSeconds: number;
}

@ApiExtraModels(ParkingVerificationSessionDto)
export class ParkingVerificationDto {
  @ApiProperty({ example: '1234ABC' })
  plate: string;

  @ApiProperty({ type: 'integer', example: 2 })
  segmentId: number;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ParkingVerificationSessionDto) },
      { type: 'object', nullable: true, enum: [null] },
    ],
  })
  session: ParkingVerificationSessionDto | null;
}
