/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEuiTheme } from '@elastic/eui';

export const useBarColor = () => {
  const { euiTheme } = useEuiTheme();

  return euiTheme.flags.hasVisColorAdjustment ? 'success' : 'vis0';
};
