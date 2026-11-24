import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CashPaymentDto, CreateParkingPaymentDto, PaymentStatusDto, QrPaymentDto } from '../dto/payment.dto.js';
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
    description: 'Fuera del horario de cobro, sin tiempo suficiente o con sesiones en conflicto.',
  })
  createQr(@Body() dto: CreateParkingPaymentDto) {
    return this.paymentsService.createQr(dto);
  }

  @Post('cash')
  @ApiOperation({
    summary: 'Registrar un pago en efectivo en desarrollo',
    description: 'Temporalmente disponible con NODE_ENV=development. Registra el pago confirmado sin autenticación.',
  })
  @ApiBody({ type: CreateParkingPaymentDto })
  @ApiCreatedResponse({ type: CashPaymentDto })
  @ApiBadRequestResponse({ description: 'Datos del pago inválidos.' })
  @ApiForbiddenResponse({
    description: 'El registro en efectivo sin autenticación solo está habilitado en desarrollo.',
  })
  @ApiConflictResponse({
    description: 'Fuera del horario de cobro, sin tiempo suficiente o con sesiones en conflicto.',
  })
  createCash(@Body() dto: CreateParkingPaymentDto) {
    // TODO: Pasar el ID del controlador autenticado cuando se integre SIAU.
    return this.paymentsService.createCash(dto, null);
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
