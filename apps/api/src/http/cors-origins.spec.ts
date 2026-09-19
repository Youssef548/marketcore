import { ORIGIN_SEPARATOR } from '../constants';
import { corsOptions, parseAllowedOrigins } from './cors-origins';

describe('parseAllowedOrigins', () => {
  it('splits on the separator', () => {
    expect(parseAllowedOrigins(`http://a.test${ORIGIN_SEPARATOR}http://b.test`)).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('trims the padding a human leaves in a comma-separated env value', () => {
    expect(parseAllowedOrigins('http://a.test,  http://b.test')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('drops blank entries rather than passing an origin that matches nothing', () => {
    expect(parseAllowedOrigins('http://a.test,,   ,')).toEqual(['http://a.test']);
  });

  it('returns an empty list for an empty value instead of a list containing empty', () => {
    // An empty list denies every browser origin. That is a visible misconfiguration
    // rather than a wildcard, which is the safe direction to fail in.
    expect(parseAllowedOrigins('')).toEqual([]);
  });
});

describe('corsOptions', () => {
  it('always permits credentials, because the allowlist exists to make that possible', () => {
    const options = corsOptions({ WEB_URL: 'http://a.test', APP_NAME: 'test' } as never);

    expect(options.credentials).toBe(true);
  });

  it('derives the origin list from WEB_URL rather than accepting a wildcard', () => {
    const options = corsOptions({
      WEB_URL: 'http://a.test,http://b.test',
      APP_NAME: 'test',
    } as never);

    expect(options.origin).toEqual(['http://a.test', 'http://b.test']);
    expect(options.origin).not.toBe('*');
  });
});
