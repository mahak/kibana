/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { ElasticsearchConfig } from '../elasticsearch_config';

import {
  MockClient,
  mockParseElasticsearchClientConfig,
  MockScopedClusterClient,
} from './cluster_client.test.mocks';

import { errors } from 'elasticsearch';
import { get } from 'lodash';
import { Logger } from '../../logging';
import { loggingSystemMock } from '../../logging/logging_system.mock';
import { httpServerMock } from '../../http/http_server.mocks';
import { LegacyClusterClient } from './cluster_client';

const logger = loggingSystemMock.create();
afterEach(() => jest.clearAllMocks());

test('#constructor creates client with parsed config', () => {
  const mockEsClientConfig = { apiVersion: 'es-client-master' };
  mockParseElasticsearchClientConfig.mockReturnValue(mockEsClientConfig);

  const mockEsConfig = { apiVersion: 'es-version' } as any;
  const mockLogger = logger.get();

  const clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');
  expect(clusterClient).toBeDefined();

  expect(mockParseElasticsearchClientConfig).toHaveBeenCalledTimes(1);
  expect(mockParseElasticsearchClientConfig).toHaveBeenLastCalledWith(
    mockEsConfig,
    mockLogger,
    'custom-type'
  );

  expect(MockClient).toHaveBeenCalledTimes(1);
  expect(MockClient).toHaveBeenCalledWith(mockEsClientConfig);
});

describe('#callAsInternalUser', () => {
  let mockEsClientInstance: {
    close: jest.Mock;
    ping: jest.Mock;
    security: { authenticate: jest.Mock };
  };
  let clusterClient: LegacyClusterClient;

  beforeEach(() => {
    mockEsClientInstance = {
      close: jest.fn(),
      ping: jest.fn(),
      security: { authenticate: jest.fn() },
    };
    MockClient.mockImplementation(() => mockEsClientInstance);

    clusterClient = new LegacyClusterClient(
      { apiVersion: 'es-version' } as any,
      logger.get(),
      'custom-type'
    );
  });

  test('fails if cluster client is closed', async () => {
    clusterClient.close();

    await expect(
      clusterClient.callAsInternalUser('ping', {})
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Cluster client cannot be used after it has been closed."`
    );
  });

  test('fails if endpoint is invalid', async () => {
    await expect(
      clusterClient.callAsInternalUser('pong', {})
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"called with an invalid endpoint: pong"`);
  });

  test('correctly deals with top level endpoint', async () => {
    const mockResponse = { data: 'ping' };
    const mockParams = { param: 'ping' };
    mockEsClientInstance.ping.mockImplementation(function mockCall(this: any) {
      return Promise.resolve({
        context: this,
        response: mockResponse,
      });
    });

    const mockResult = await clusterClient.callAsInternalUser('ping', mockParams);
    expect(mockResult.response).toBe(mockResponse);
    expect(mockResult.context).toBe(mockEsClientInstance);
    expect(mockEsClientInstance.ping).toHaveBeenCalledTimes(1);
    expect(mockEsClientInstance.ping).toHaveBeenLastCalledWith(mockParams);
  });

  test('sets the authorization header when a service account token is configured', async () => {
    clusterClient = new LegacyClusterClient(
      { apiVersion: 'es-version', serviceAccountToken: 'ABC123' } as any,
      logger.get(),
      'custom-type'
    );

    const mockResponse = { data: 'ping' };
    const mockParams = { param: 'ping' };
    mockEsClientInstance.ping.mockImplementation(function mockCall(this: any) {
      return Promise.resolve({
        context: this,
        response: mockResponse,
      });
    });

    await clusterClient.callAsInternalUser('ping', mockParams);

    expect(mockEsClientInstance.ping).toHaveBeenCalledWith({
      headers: { authorization: 'Bearer ABC123' },
      param: 'ping',
    });
  });

  test('correctly deals with nested endpoint', async () => {
    const mockResponse = { data: 'authenticate' };
    const mockParams = { param: 'authenticate' };
    mockEsClientInstance.security.authenticate.mockImplementation(function mockCall(this: any) {
      return Promise.resolve({
        context: this,
        response: mockResponse,
      });
    });

    const mockResult = await clusterClient.callAsInternalUser('security.authenticate', mockParams);
    expect(mockResult.response).toBe(mockResponse);
    expect(mockResult.context).toBe(mockEsClientInstance.security);
    expect(mockEsClientInstance.security.authenticate).toHaveBeenCalledTimes(1);
    expect(mockEsClientInstance.security.authenticate).toHaveBeenLastCalledWith(mockParams);
  });

  test('does not wrap errors if `wrap401Errors` is set to `false`', async () => {
    const mockError = { message: 'some error' };
    mockEsClientInstance.ping.mockRejectedValue(mockError);

    await expect(
      clusterClient.callAsInternalUser('ping', undefined, { wrap401Errors: false })
    ).rejects.toBe(mockError);

    const mockAuthenticationError = { message: 'authentication error', statusCode: 401 };
    mockEsClientInstance.ping.mockRejectedValue(mockAuthenticationError);

    await expect(
      clusterClient.callAsInternalUser('ping', undefined, { wrap401Errors: false })
    ).rejects.toBe(mockAuthenticationError);
  });

  test('wraps 401 errors when `wrap401Errors` is set to `true` or unspecified', async () => {
    const mockError = { message: 'some error' };
    mockEsClientInstance.ping.mockRejectedValue(mockError);

    await expect(clusterClient.callAsInternalUser('ping')).rejects.toBe(mockError);
    await expect(
      clusterClient.callAsInternalUser('ping', undefined, { wrap401Errors: true })
    ).rejects.toBe(mockError);

    const mockAuthorizationError = { message: 'authentication error', statusCode: 403 };
    mockEsClientInstance.ping.mockRejectedValue(mockAuthorizationError);

    await expect(clusterClient.callAsInternalUser('ping')).rejects.toBe(mockAuthorizationError);
    await expect(
      clusterClient.callAsInternalUser('ping', undefined, { wrap401Errors: true })
    ).rejects.toBe(mockAuthorizationError);

    const mockAuthenticationError = new (errors.AuthenticationException as any)(
      'Authentication Exception',
      { statusCode: 401 }
    );
    mockEsClientInstance.ping.mockRejectedValue(mockAuthenticationError);

    await expect(clusterClient.callAsInternalUser('ping')).rejects.toBe(mockAuthenticationError);
    await expect(
      clusterClient.callAsInternalUser('ping', undefined, { wrap401Errors: true })
    ).rejects.toStrictEqual(mockAuthenticationError);
  });

  test('aborts the request and rejects if a signal is provided and aborted', async () => {
    const controller = new AbortController();

    // The ES client returns a promise with an additional `abort` method to abort the request
    const mockValue: any = Promise.resolve();
    mockValue.abort = jest.fn();
    mockEsClientInstance.ping.mockReturnValue(mockValue);

    const promise = clusterClient.callAsInternalUser('ping', undefined, {
      wrap401Errors: false,
      signal: controller.signal,
    });

    controller.abort();

    expect(mockValue.abort).toHaveBeenCalled();
    await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(`"Request was aborted"`);
  });

  test('does not override WWW-Authenticate if returned by Elasticsearch', async () => {
    const mockAuthenticationError = new (errors.AuthenticationException as any)(
      'Authentication Exception',
      { statusCode: 401 }
    );

    const mockAuthenticationErrorWithHeader = new (errors.AuthenticationException as any)(
      'Authentication Exception',
      {
        body: { error: { header: { 'WWW-Authenticate': 'some custom header' } } },
        statusCode: 401,
      }
    );
    mockEsClientInstance.ping
      .mockRejectedValueOnce(mockAuthenticationError)
      .mockRejectedValueOnce(mockAuthenticationErrorWithHeader);

    await expect(clusterClient.callAsInternalUser('ping')).rejects.toBe(mockAuthenticationError);
    expect(get(mockAuthenticationError, 'output.headers.WWW-Authenticate')).toBe(
      'Basic realm="Authorization Required"'
    );

    await expect(clusterClient.callAsInternalUser('ping')).rejects.toBe(
      mockAuthenticationErrorWithHeader
    );
    expect(get(mockAuthenticationErrorWithHeader, 'output.headers.WWW-Authenticate')).toBe(
      'some custom header'
    );
  });
});

describe('#asScoped', () => {
  let mockEsClientInstance: { ping: jest.Mock; close: jest.Mock };
  let mockScopedEsClientInstance: { ping: jest.Mock; close: jest.Mock };

  let clusterClient: LegacyClusterClient;
  let mockLogger: Logger;
  let mockEsConfig: ElasticsearchConfig;

  beforeEach(() => {
    mockEsClientInstance = { ping: jest.fn(), close: jest.fn() };
    mockScopedEsClientInstance = { ping: jest.fn(), close: jest.fn() };
    MockClient.mockImplementationOnce(() => mockEsClientInstance).mockImplementationOnce(
      () => mockScopedEsClientInstance
    );

    mockLogger = logger.get();
    mockEsConfig = {
      apiVersion: 'es-version',
      requestHeadersWhitelist: ['one', 'two'],
    } as any;

    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');
    jest.clearAllMocks();
  });

  test('creates additional Elasticsearch client only once', () => {
    const firstScopedClusterClient = clusterClient.asScoped(
      httpServerMock.createRawRequest({ headers: { one: '1' } })
    );

    expect(firstScopedClusterClient).toBeDefined();
    expect(mockParseElasticsearchClientConfig).toHaveBeenCalledTimes(1);
    expect(mockParseElasticsearchClientConfig).toHaveBeenLastCalledWith(
      mockEsConfig,
      mockLogger,
      'custom-type',
      {
        auth: false,
        ignoreCertAndKey: true,
      }
    );

    expect(MockClient).toHaveBeenCalledTimes(1);
    expect(MockClient).toHaveBeenCalledWith(
      mockParseElasticsearchClientConfig.mock.results[0].value
    );

    jest.clearAllMocks();

    const secondScopedClusterClient = clusterClient.asScoped(
      httpServerMock.createRawRequest({ headers: { two: '2' } })
    );

    expect(secondScopedClusterClient).toBeDefined();
    expect(secondScopedClusterClient).not.toBe(firstScopedClusterClient);
    expect(mockParseElasticsearchClientConfig).not.toHaveBeenCalled();
    expect(MockClient).not.toHaveBeenCalled();
  });

  test('properly configures `ignoreCertAndKey` for various configurations', () => {
    // Config without SSL.
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');

    mockParseElasticsearchClientConfig.mockClear();
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1' } }));

    expect(mockParseElasticsearchClientConfig).toHaveBeenCalledTimes(1);
    expect(mockParseElasticsearchClientConfig).toHaveBeenLastCalledWith(
      mockEsConfig,
      mockLogger,
      'custom-type',
      {
        auth: false,
        ignoreCertAndKey: true,
      }
    );

    // Config ssl.alwaysPresentCertificate === false
    mockEsConfig = { ...mockEsConfig, ssl: { alwaysPresentCertificate: false } } as any;
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');

    mockParseElasticsearchClientConfig.mockClear();
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1' } }));

    expect(mockParseElasticsearchClientConfig).toHaveBeenCalledTimes(1);
    expect(mockParseElasticsearchClientConfig).toHaveBeenLastCalledWith(
      mockEsConfig,
      mockLogger,
      'custom-type',
      {
        auth: false,
        ignoreCertAndKey: true,
      }
    );

    // Config ssl.alwaysPresentCertificate === true
    mockEsConfig = { ...mockEsConfig, ssl: { alwaysPresentCertificate: true } } as any;
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');

    mockParseElasticsearchClientConfig.mockClear();
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1' } }));

    expect(mockParseElasticsearchClientConfig).toHaveBeenCalledTimes(1);
    expect(mockParseElasticsearchClientConfig).toHaveBeenLastCalledWith(
      mockEsConfig,
      mockLogger,
      'custom-type',
      {
        auth: false,
        ignoreCertAndKey: false,
      }
    );
  });

  test('passes only filtered headers to the scoped cluster client', () => {
    clusterClient.asScoped(
      httpServerMock.createRawRequest({ headers: { zero: '0', one: '1', two: '2', three: '3' } })
    );

    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { one: '1', two: '2' }
    );
  });

  test('passes x-opaque-id header with request id', () => {
    clusterClient.asScoped(
      httpServerMock.createKibanaRequest({
        kibanaRequestState: { requestId: 'alpha', requestUuid: 'ignore-this-id' },
      })
    );

    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { 'x-opaque-id': 'alpha' }
    );
  });

  test('does not set the authorization header when a service account token is configured', async () => {
    clusterClient = new LegacyClusterClient(
      {
        apiVersion: 'es-version',
        requestHeadersWhitelist: ['zero'],
        serviceAccountToken: 'ABC123',
      } as any,
      logger.get(),
      'custom-type'
    );

    clusterClient.asScoped(
      httpServerMock.createRawRequest({ headers: { zero: '0', one: '1', two: '2', three: '3' } })
    );

    const expectedHeaders = { zero: '0' };

    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expectedHeaders
    );
  });

  test('both scoped and internal API caller fail if cluster client is closed', async () => {
    clusterClient.asScoped(
      httpServerMock.createRawRequest({ headers: { zero: '0', one: '1', two: '2', three: '3' } })
    );

    clusterClient.close();

    const [[internalAPICaller, scopedAPICaller]] = MockScopedClusterClient.mock.calls;
    await expect(internalAPICaller('ping')).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Cluster client cannot be used after it has been closed."`
    );

    await expect(scopedAPICaller('ping', {})).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Cluster client cannot be used after it has been closed."`
    );
  });

  test('does not fail when scope to not defined request', async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');
    clusterClient.asScoped();
    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {}
    );
  });

  test('does not fail when scope to a request without headers', async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');
    clusterClient.asScoped({} as any);
    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {}
    );
  });

  test('calls getAuthHeaders and filters results for a real request', async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type', () => ({
      one: '1',
      three: '3',
    }));
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { two: '2' } }));
    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { one: '1', two: '2' }
    );
  });

  test('getAuthHeaders results rewrite extends a request headers', async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type', () => ({
      one: 'foo',
    }));
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1', two: '2' } }));
    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { one: 'foo', two: '2' }
    );
  });

  test("doesn't call getAuthHeaders for a fake request", async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type', () => ({}));
    clusterClient.asScoped({ headers: { one: 'foo' } });

    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { one: 'foo' }
    );
  });

  test('filters a fake request headers', async () => {
    clusterClient = new LegacyClusterClient(mockEsConfig, mockLogger, 'custom-type');
    clusterClient.asScoped({ headers: { one: '1', two: '2', three: '3' } });

    expect(MockScopedClusterClient).toHaveBeenCalledTimes(1);
    expect(MockScopedClusterClient).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { one: '1', two: '2' }
    );
  });
});

describe('#close', () => {
  let mockEsClientInstance: { close: jest.Mock };
  let mockScopedEsClientInstance: { close: jest.Mock };

  let clusterClient: LegacyClusterClient;

  beforeEach(() => {
    mockEsClientInstance = { close: jest.fn() };
    mockScopedEsClientInstance = { close: jest.fn() };
    MockClient.mockImplementationOnce(() => mockEsClientInstance).mockImplementationOnce(
      () => mockScopedEsClientInstance
    );

    clusterClient = new LegacyClusterClient(
      { apiVersion: 'es-version', requestHeadersWhitelist: [] } as any,
      logger.get(),
      'custom-type'
    );
  });

  test('closes underlying Elasticsearch client', () => {
    expect(mockEsClientInstance.close).not.toHaveBeenCalled();

    clusterClient.close();
    expect(mockEsClientInstance.close).toHaveBeenCalledTimes(1);
  });

  test('closes both internal and scoped underlying Elasticsearch clients', () => {
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1' } }));

    expect(mockEsClientInstance.close).not.toHaveBeenCalled();
    expect(mockScopedEsClientInstance.close).not.toHaveBeenCalled();

    clusterClient.close();
    expect(mockEsClientInstance.close).toHaveBeenCalledTimes(1);
    expect(mockScopedEsClientInstance.close).toHaveBeenCalledTimes(1);
  });

  test('does not call close on already closed client', () => {
    clusterClient.asScoped(httpServerMock.createRawRequest({ headers: { one: '1' } }));

    clusterClient.close();
    mockEsClientInstance.close.mockClear();
    mockScopedEsClientInstance.close.mockClear();

    clusterClient.close();
    expect(mockEsClientInstance.close).not.toHaveBeenCalled();
    expect(mockScopedEsClientInstance.close).not.toHaveBeenCalled();
  });
});
