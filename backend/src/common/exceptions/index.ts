import { HttpException, HttpStatus } from '@nestjs/common';

export class NotFoundException extends HttpException {
  constructor(message: string = 'Resource not found') {
    super(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message,
        },
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class BadRequestException extends HttpException {
  constructor(message: string = 'Bad request', details?: any[]) {
    super(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message,
          details,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message: string = 'Unauthorized') {
    super(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message,
        },
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string = 'Forbidden') {
    super(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message,
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class ConflictException extends HttpException {
  constructor(message: string = 'Resource already exists') {
    super(
      {
        success: false,
        error: {
          code: 'CONFLICT',
          message,
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message: string = 'Internal server error') {
    super(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
