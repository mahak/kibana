/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexItem, EuiFlexGroup } from '@elastic/eui';
import { fieldToName } from '../../lib/field_to_display_name';
import { useWaffleOptionsContext } from '../../hooks/use_waffle_options';
import { WaffleInventorySwitcher } from '../waffle/waffle_inventory_switcher';
import type { ToolbarProps } from './types';

interface Props {
  children: (props: Omit<ToolbarProps, 'accounts' | 'regions'>) => React.ReactElement;
}

export const ToolbarWrapper = (props: Props) => {
  const {
    changeMetric,
    changeGroupBy,
    changeCustomOptions,
    changeAccount,
    changeRegion,
    changeSort,
    customOptions,
    groupBy,
    metric,
    nodeType,
    accountId,
    view,
    region,
    legend,
    sort,
    customMetrics,
    changeCustomMetrics,
  } = useWaffleOptionsContext();
  return (
    <EuiFlexGroup responsive={false} wrap gutterSize="m">
      <EuiFlexItem grow={false}>
        <WaffleInventorySwitcher />
      </EuiFlexItem>
      {props.children({
        changeMetric,
        changeGroupBy,
        changeAccount,
        changeRegion,
        changeCustomOptions,
        changeSort,
        customOptions,
        groupBy,
        sort,
        view,
        metric,
        nodeType,
        region,
        accountId,
        legend,
        customMetrics,
        changeCustomMetrics,
      })}
    </EuiFlexGroup>
  );
};

export const toGroupByOpt = (field: string) => ({
  text: fieldToName(field),
  field,
});
