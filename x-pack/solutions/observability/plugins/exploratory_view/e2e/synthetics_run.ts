/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { FtrConfigProviderContext } from '@kbn/test';
import path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import { SyntheticsRunner, argv } from '@kbn/observability-synthetics-test-data';

const { headless, grep, bail: pauseOnError } = argv;

async function runE2ETests({ readConfigFile }: FtrConfigProviderContext) {
  const kibanaConfig = await readConfigFile(require.resolve('@kbn/synthetics-e2e/config'));

  return {
    ...kibanaConfig.getAll(),
    testRunner: async ({ getService }: any) => {
      const syntheticsRunner = new SyntheticsRunner(getService, {
        headless,
        match: grep,
        pauseOnError,
      });

      await syntheticsRunner.setup();
      await syntheticsRunner.loadTestData(
        `${REPO_ROOT}/x-pack/solutions/observability/plugins/ux/e2e/fixtures/`,
        ['rum_8.0.0', 'rum_test_data']
      );
      await syntheticsRunner.loadTestData(
        `${REPO_ROOT}/x-pack/solutions/observability/plugins/synthetics/e2e/fixtures/es_archiver/`,
        ['full_heartbeat', 'browser']
      );
      await syntheticsRunner.loadTestFiles(async () => {
        require(path.join(__dirname, './journeys'));
      });
      await syntheticsRunner.run();
    },
  };
}

// eslint-disable-next-line import/no-default-export
export default runE2ETests;
