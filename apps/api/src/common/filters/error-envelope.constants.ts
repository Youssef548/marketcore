import { HttpStatus } from '@nestjs/common';
import { ErrorCodes, type ErrorCode } from '@app/contracts';

export const ERROR_FILTER_LOGGER_CONTEXT = 'filter';

export const ErrorEnvelopeMessages = {
  VALIDATION_FAILED: 'Request validation failed',
  INTERNAL: 'Internal server error',
} as const;

/**
 * Statuses with a code of their own. Any other 4xx is `CLIENT_ERROR` and
 * anything else `INTERNAL`, so a client error can never claim to be a server one.
 */
export const ERROR_CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodes.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.TOO_MANY_REQUESTS,
};
