import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateParkingSegmentDto,
  UpdateParkingSegmentDto,
} from '../dto/parking-segment.dto.js';
import { ParkingSegmentsService } from '../services/parking-segments.service.js';

@ApiTags('Parking segments')
@Controller('parking-segments')
export class ParkingSegmentsController {
  constructor(private parkingSegmentsService: ParkingSegmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tramos activos e inactivos' })
  findAll() {
    return this.parkingSegmentsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tramo' })
  create(@Body() dto: CreateParkingSegmentDto) {
    return this.parkingSegmentsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un tramo' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParkingSegmentDto,
  ) {
    return this.parkingSegmentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un tramo que no tenga historial' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.parkingSegmentsService.remove(id);
  }
}
