/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockNow } from '../../../utils/test_helpers';
import type { CustomLink } from '../../../../common/custom_link/custom_link_types';
import { createOrUpdateCustomLink } from './create_or_update_custom_link';
import type { APMInternalESClient } from '../../../lib/helpers/create_es_client/create_internal_es_client';

describe('Create or Update Custom link', () => {
  const internalClientIndexMock = jest.fn();

  const mockInternalESClient = {
    index: internalClientIndexMock,
  } as unknown as APMInternalESClient;

  const customLink = {
    label: 'foo',
    url: 'http://elastic.com/{{trace.id}}',
    filters: [
      { key: 'service.name', value: 'opbeans-java' },
      { key: 'transaction.type', value: 'Request' },
    ],
  } as unknown as CustomLink;
  afterEach(() => {
    internalClientIndexMock.mockClear();
  });

  beforeAll(() => {
    mockNow(1570737000000);
  });

  it('creates a new custom link', async () => {
    await createOrUpdateCustomLink({
      customLink,
      internalESClient: mockInternalESClient,
    });
    expect(internalClientIndexMock).toHaveBeenCalledWith('create_or_update_custom_link', {
      refresh: 'wait_for',
      index: '.apm-custom-link',
      document: {
        '@timestamp': 1570737000000,
        label: 'foo',
        url: 'http://elastic.com/{{trace.id}}',
        'service.name': ['opbeans-java'],
        'transaction.type': ['Request'],
      },
    });
  });
  it('update a new custom link', async () => {
    await createOrUpdateCustomLink({
      customLinkId: 'bar',
      customLink,
      internalESClient: mockInternalESClient,
    });
    expect(internalClientIndexMock).toHaveBeenCalledWith('create_or_update_custom_link', {
      refresh: 'wait_for',
      index: '.apm-custom-link',
      id: 'bar',
      document: {
        '@timestamp': 1570737000000,
        label: 'foo',
        url: 'http://elastic.com/{{trace.id}}',
        'service.name': ['opbeans-java'],
        'transaction.type': ['Request'],
      },
    });
  });
});
