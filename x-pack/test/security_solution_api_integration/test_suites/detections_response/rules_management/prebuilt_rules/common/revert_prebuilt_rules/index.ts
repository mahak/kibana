/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default ({ loadTestFile }: FtrProviderContext): void => {
  describe('Revert prebuilt rules', function () {
    loadTestFile(require.resolve('./get_prebuilt_rule_base_version'));
    loadTestFile(require.resolve('./revert_prebuilt_rules'));
  });
};
