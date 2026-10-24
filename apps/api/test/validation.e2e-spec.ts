import { Body, Controller, HttpStatus, INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ErrorCodes, ErrorEnvelopeSchema, REQUEST_ID_HEADER } from '@app/contracts';
import { configureApp } from '../src/app.setup';
import { expectContract } from './support/contracts';

const JSON_CONTENT_TYPE = 'application/json';
const MALFORMED_JSON = '{"name":';
/** Express's JSON parser defaults to a 100 KiB limit; this is well past it. */
const OVER_DEFAULT_BODY_LIMIT_BYTES = 200 * 1024;
const UNSUPPORTED_CHARSET = 'klingon';
const PARSER_REJECTION_REQUEST_ID = 'req_parser-rejection';

/**
 * The template ships no DTOs, so this file defines a throwaway one. The point is
 * to prove the validation seam end to end: a request body schema declared in
 * contracts is rejected by the *global* pipe, and that rejection emerges as the
 * standard envelope.
 *
 * When you add your first real DTO, this test stays valuable — it fails if the
 * pipe or filter ever stops being wired into the app.
 */
const ProbeSchema = z.object({ name: z.string().min(2) }).meta({ id: 'ProbeRequest' });
class ProbeDto extends createZodDto(ProbeSchema) {}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto) {
    return { name: body.name };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('validation and the error envelope (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'ok' })
      .expect(201);
    expect(res.body).toEqual({ name: 'ok' });
  });

  it('rejects an invalid body with VALIDATION_ERROR and the zod issues', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'x' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeInstanceOf(Array);
    expectContract(ErrorEnvelopeSchema, res.body);
  });

  it('rejects a missing body the same way', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/probe').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expectContract(ErrorEnvelopeSchema, res.body);
  });

  it('rejects malformed JSON as a validation error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('content-type', JSON_CONTENT_TYPE)
      .send(MALFORMED_JSON)
      .expect(HttpStatus.BAD_REQUEST);
    expect(res.body.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expectContract(ErrorEnvelopeSchema, res.body);
  });

  // body-parser refuses these before Nest runs, with http-errors rather than
  // HttpExceptions; they used to leave as a 500 and an error-level stack trace.
  it('refuses a body over the parser limit with 413, not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set(REQUEST_ID_HEADER, PARSER_REJECTION_REQUEST_ID)
      .send({ name: 'x'.repeat(OVER_DEFAULT_BODY_LIMIT_BYTES) })
      .expect(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(res.body.error.code).toBe(ErrorCodes.CLIENT_ERROR);
    // The id middleware runs before the parser, so even this rejection is traceable.
    expect(res.body.error.requestId).toBe(PARSER_REJECTION_REQUEST_ID);
    expectContract(ErrorEnvelopeSchema, res.body);
  });

  it('refuses an unsupported charset with 415, not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('content-type', `${JSON_CONTENT_TYPE}; charset=${UNSUPPORTED_CHARSET}`)
      .send('{}')
      .expect(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    expect(res.body.error.code).toBe(ErrorCodes.CLIENT_ERROR);
    expectContract(ErrorEnvelopeSchema, res.body);
  });
});
