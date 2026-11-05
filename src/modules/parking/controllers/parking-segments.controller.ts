import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateParkingSegmentDto } from '../dto/create-parking-segment.dto.js';
import { ParkingSegmentParamsDto } from '../dto/parking-segment-params.dto.js';
import { ParkingSegmentDto } from '../dto/parking-segment.dto.js';
import { UpdateParkingSegmentDto } from '../dto/update-parking-segment.dto.js';
import { ParkingSegmentsService } from '../services/parking-segments.service.js';

@ApiTags('Parking segments')
@Controller('parking-segments')
export class ParkingSegmentsController {
  constructor(
    private readonly parkingSegmentsService: ParkingSegmentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar tramos activos e inactivos' })
  @ApiResponse({ status: 200, type: [ParkingSegmentDto] })
  findAll() {
    return this.parkingSegmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un tramo' })
  @ApiResponse({ status: 200, type: ParkingSegmentDto })
  @ApiResponse({ status: 400, description: 'ID inválido.' })
  @ApiResponse({ status: 404, description: 'Tramo no encontrado.' })
  findOne(@Param() { id }: ParkingSegmentParamsDto) {
    return this.parkingSegmentsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tramo' })
  @ApiResponse({ status: 201, type: ParkingSegmentDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 409, description: 'Código de tramo duplicado.' })
  create(@Body() dto: CreateParkingSegmentDto) {
    return this.parkingSegmentsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un tramo' })
  @ApiResponse({ status: 200, type: ParkingSegmentDto })
  @ApiResponse({ status: 400, description: 'ID o datos inválidos.' })
  @ApiResponse({ status: 404, description: 'Tramo no encontrado.' })
  @ApiResponse({ status: 409, description: 'Código de tramo duplicado.' })
  update(
    @Param() { id }: ParkingSegmentParamsDto,
    @Body() dto: UpdateParkingSegmentDto,
  ) {
    return this.parkingSegmentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar un tramo conservando su historial' })
  @ApiResponse({ status: 204, description: 'Tramo desactivado.' })
  @ApiResponse({ status: 400, description: 'ID inválido.' })
  @ApiResponse({ status: 404, description: 'Tramo no encontrado.' })
  remove(@Param() { id }: ParkingSegmentParamsDto) {
    return this.parkingSegmentsService.remove(id);
  }
}
