import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Header,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ONEC_SESSION_COOKIE } from './onec-auth';
import { OnecService } from './onec.service';

type ExchangeQuery = {
  type?: string;
  mode?: string;
  filename?: string;
};

/**
 * Штатный обмен 1С ↔ сайт (Битрикс-протокол CommerceML).
 * URL для 1С: https://miraflores-shop.com/api/v1/1c/exchange
 */
@Public()
@Controller('1c')
export class OnecController {
  private readonly logger = new Logger(OnecController.name);

  constructor(private readonly onec: OnecService) {}

  @Get('exchange')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async exchangeGet(
    @Query() query: ExchangeQuery,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.handle(query, req, res, null);
  }

  @Post('exchange')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async exchangePost(
    @Query() query: ExchangeQuery,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const raw = this.readRawBody(req);
    return this.handle(query, req, res, raw);
  }

  private async handle(
    query: ExchangeQuery,
    req: Request,
    res: Response,
    rawBody: Buffer | null,
  ) {
    const type = (query.type || '').toLowerCase();
    const mode = (query.mode || '').toLowerCase();
    const authorization = req.headers.authorization;
    const cookie = req.headers.cookie;

    this.logger.debug(`1C exchange type=${type} mode=${mode}`);

    try {
      if (mode === 'checkauth') {
        const { body, sessionToken } = this.onec.checkAuth(authorization);
        if (sessionToken) {
          res.setHeader(
            'Set-Cookie',
            `${ONEC_SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`,
          );
        }
        return res.status(200).send(body);
      }

      if (!type || !mode) {
        return res.status(200).send('failure\nMissing type or mode');
      }

      const sessionToken = this.onec.requireExchangeAuth({
        authorization,
        cookie,
      });

      if (type === 'catalog' || type === 'sale') {
        if (mode === 'init') {
          return res.status(200).send(this.onec.init());
        }
      }

      if (type === 'catalog') {
        if (mode === 'file') {
          const filename = query.filename || 'offers.xml';
          if (!rawBody || rawBody.length === 0) {
            return res.status(200).send('failure\nEmpty file body');
          }
          return res
            .status(200)
            .send(this.onec.saveFile(sessionToken, filename, rawBody));
        }
        if (mode === 'import') {
          const filename = query.filename || 'offers.xml';
          const result = await this.onec.importFile(sessionToken, filename);
          return res.status(200).send(result);
        }
      }

      if (type === 'sale') {
        if (mode === 'query') {
          const xml = await this.onec.queryOrders(sessionToken);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.status(200).send(xml);
        }
        if (mode === 'success') {
          return res
            .status(200)
            .send(await this.onec.markOrdersExported(sessionToken));
        }
        // mode=file — статусы из 1С на сайт (пока no-op success)
        if (mode === 'file') {
          return res.status(200).send('success');
        }
      }

      return res.status(200).send(`failure\nUnknown type/mode: ${type}/${mode}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      this.logger.warn(`1C exchange error: ${msg}`);
      if (msg.includes('not configured') || msg.includes('Invalid login')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="1C"');
        return res.status(401).send(`failure\n${msg}`);
      }
      return res.status(200).send(`failure\n${msg}`);
    }
  }

  private readRawBody(req: RawBodyRequest<Request>): Buffer | null {
    if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length) {
      return req.rawBody;
    }
    const body = req.body;
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === 'string') return Buffer.from(body, 'utf8');
    if (body && typeof body === 'object' && Object.keys(body).length === 0) {
      return null;
    }
    if (body != null) {
      return Buffer.from(String(body), 'utf8');
    }
    return null;
  }
}
