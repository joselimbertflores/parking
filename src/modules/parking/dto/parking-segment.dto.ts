import { ApiProperty } from '@nestjs/swagger';
import { CreateParkingSegmentDto } from './create-parking-segment.dto.js';

export class ParkingSegmentDto extends CreateParkingSegmentDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: String, nullable: true, example: 'Norte' })
  declare side: string | null;
}
