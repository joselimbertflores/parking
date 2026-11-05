import { PartialType } from '@nestjs/swagger';
import { CreateParkingSegmentDto } from './create-parking-segment.dto.js';

export class UpdateParkingSegmentDto extends PartialType(
  CreateParkingSegmentDto,
  { skipNullProperties: false },
) {}
