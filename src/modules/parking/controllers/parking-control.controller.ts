import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ParkingVerificationDto,
  ParkingVerificationQueryDto,
} from '../dto/parking-control.dto.js';
import { ParkingControlService } from '../services/parking-control.service.js';

@ApiTags('Parking control')
@Controller('parking')
export class ParkingControlController {
  constructor(private readonly parkingControlService: ParkingControlService) {}

  @Get('verification')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Verificar el estacionamiento vigente por placa y tramo',
  })
  @ApiOkResponse({
    type: ParkingVerificationDto,
    description: 'Incluye la sesión vigente o null si no existe.',
  })
  @ApiConflictResponse({
    description:
      'La placa tiene más de una sesión vigente en el tramo solicitado.',
  })
  verify(@Query() query: ParkingVerificationQueryDto) {
    return this.parkingControlService.verify(query);
  }
}
