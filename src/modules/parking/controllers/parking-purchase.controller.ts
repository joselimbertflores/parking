import { Controller, Get, Header, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ParkingPurchaseOptionDto, SearchParkingSegmentsDto } from '../dto/parking-purchase.dto.js';
import { ParkingPurchaseService } from '../services/parking-purchase.service.js';
import { ParkingSegmentsService } from '../services/parking-segments.service.js';

@ApiTags('Parking purchases')
@Controller('parking/segments')
export class ParkingPurchaseController {
  constructor(
    private parkingSegmentsService: ParkingSegmentsService,
    private parkingPurchaseService: ParkingPurchaseService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar hasta 20 tramos activos por código o calle',
  })
  search(@Query() { search }: SearchParkingSegmentsDto) {
    return this.parkingSegmentsService.searchActive(search);
  }

  @Get('by-code/:code')
  @ApiOperation({ summary: 'Obtener un tramo activo por su código QR' })
  @ApiParam({
    name: 'code',
    type: String,
    example: 'TR-001',
    description: 'Código exacto del tramo, sin distinguir mayúsculas y minúsculas.',
  })
  findByCode(@Param('code') code: string) {
    return this.parkingSegmentsService.findActiveByCode(code);
  }

  @Get(':id/options')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Obtener las opciones generales de compra según el horario y la tarifa vigente',
  })
  @ApiOkResponse({
    type: [ParkingPurchaseOptionDto],
    description:
      'Duraciones cobrables e importes calculados desde el momento de la consulta. Devuelve [] fuera del horario de cobro.',
  })
  getOptions(@Param('id', ParseIntPipe) id: number) {
    return this.parkingPurchaseService.getOptions(id);
  }
}
