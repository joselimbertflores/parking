import { Body, Controller, ForbiddenException, Get, Header, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateParkingPaymentDto, PaymentStatusDto, QrPaymentDto } from '../dto/payment.dto.js';
import { PaymentsService } from '../services/payments.service.js';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('qr')
  @ApiOperation({ summary: 'Crear una intención de pago QR pendiente' })
  @ApiBody({ type: CreateParkingPaymentDto })
  @ApiCreatedResponse({ type: QrPaymentDto })
  @ApiConflictResponse({
    description: 'Fuera del horario de cobro, sin tiempo suficiente o con una sesión vigente.',
  })
  createQr(@Body() dto: CreateParkingPaymentDto) {
    return this.paymentsService.createQr(dto);
  }

  @Post('cash')
  @ApiOperation({ summary: 'Registrar un pago en efectivo (deshabilitado)' })
  @ApiForbiddenResponse({
    description: 'El registro en efectivo está deshabilitado hasta integrar SIAU.',
  })
  rejectCash(): never {
    throw new ForbiddenException('El registro en efectivo está deshabilitado hasta integrar SIAU.');
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar un pago y la vigencia de su sesión' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: PaymentStatusDto })
  getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getStatus(id);
  }
}
